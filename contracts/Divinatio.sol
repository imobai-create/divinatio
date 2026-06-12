// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

/// @title DIVINATIO — Mercados de previsão peer-to-peer
/// @notice Protocolo de pools parimutuais onde usuários apostam uns contra os
///         outros em eventos futuros, usando uma stablecoin (ERC-20). O
///         protocolo nunca é contraparte de nenhuma posição: atua
///         exclusivamente como intermediador, custodiando os pools em escrow
///         e cobrando taxa de serviço.
///
///         Fluxo de um mercado:
///           1. createMarket  — qualquer endereço cria um mercado (permissionless)
///           2. predict       — usuários depositam em um dos desfechos até closeTime
///           3. proposeOutcome — após o evento, alguém propõe o resultado com caução
///           4. dispute       — janela de contestação com caução igual
///           5. finalize      — sem disputa, o resultado proposto vale
///           6. claim         — vencedores sacam stake + fração pro-rata do pool perdedor
///           — cancelMarket   — se ninguém resolver até o prazo, reembolso integral
///
///         Copy-staking (o "seguir Profetas"):
///           - follow(profeta, valor) — opta por replicar as previsões do profeta
///           - copyPredict(...)       — executável por qualquer keeper: replica a
///             posição dominante do profeta para o seguidor, no mesmo mercado
///           - no claim, o profeta recebe 10% do LUCRO da posição copiada
contract Divinatio {
    // ---------------------------------------------------------------------
    // Tipos
    // ---------------------------------------------------------------------

    enum MarketState {
        Open,       // aceitando previsões
        Proposed,   // resultado proposto, janela de disputa aberta
        Disputed,   // contestado, aguardando o árbitro
        Resolved,   // resultado final definido, pagamentos liberados
        Cancelled   // sem resolução ou pool vencedor vazio: reembolso integral
    }

    struct Market {
        address creator;
        string question;
        uint8 outcomeCount;          // 2..8 desfechos possíveis
        uint64 closeTime;            // fim das previsões (início do evento)
        uint64 resolutionDeadline;   // prazo para alguém propor o resultado
        uint16 creatorFeeBps;        // taxa do criador sobre o pool perdedor
        MarketState state;
        uint8 proposedOutcome;
        uint8 finalOutcome;
        address proposer;
        address disputer;
        uint64 disputeWindowEnd;
        uint256[] pools;             // total depositado por desfecho
        uint256 losingPoolNet;       // pool perdedor após taxas (fixado na resolução)
    }

    struct DivinerStats {
        uint64 predictions;          // mercados em que participou
        uint64 hits;                 // mercados em que acertou o desfecho
        uint256 volume;              // total já depositado
    }

    struct FollowConfig {
        uint256 amountPerMarket;     // quanto replicar por mercado (0 = inativo)
    }

    struct CopiedPosition {
        address prophet;
        uint8 outcome;
        uint256 amount;
    }

    // ---------------------------------------------------------------------
    // Constantes e estado
    // ---------------------------------------------------------------------

    uint16 public constant PROTOCOL_FEE_BPS = 200;     // 2% sobre o pool perdedor
    uint16 public constant MAX_CREATOR_FEE_BPS = 100;  // criador pode cobrar até 1%
    uint16 public constant PROPHET_FEE_BPS = 1000;     // 10% do lucro da posição copiada
    uint64 public constant DISPUTE_WINDOW = 24 hours;
    uint64 public constant CANCEL_GRACE = 7 days;      // após o prazo de resolução
    uint8 public constant MAX_OUTCOMES = 8;

    IERC20 public immutable token;        // stablecoin do protocolo (ex.: USDC)
    uint256 public immutable resolutionBond;

    address public owner;                 // árbitro de disputas (DAO no roadmap)
    address public treasury;
    uint256 public accruedProtocolFees;

    Market[] private _markets;

    // marketId => usuário => desfecho => valor depositado
    mapping(uint256 => mapping(address => mapping(uint8 => uint256))) public stakeOf;
    // marketId => usuário => já participou (para estatística de reputação)
    mapping(uint256 => mapping(address => bool)) public hasPredicted;
    // marketId => usuário => já sacou
    mapping(uint256 => mapping(address => bool)) public claimed;
    // taxas acumuladas por criador de mercado
    mapping(address => uint256) public creatorFees;
    // reputação on-chain dos profetas
    mapping(address => DivinerStats) public diviners;

    // copy-staking
    mapping(address => mapping(address => FollowConfig)) public follows; // seguidor => profeta
    mapping(uint256 => mapping(address => CopiedPosition)) public copiedPositions; // mercado => seguidor
    mapping(address => uint256) public prophetFees; // taxas de performance acumuladas

    // ---------------------------------------------------------------------
    // Eventos
    // ---------------------------------------------------------------------

    event MarketCreated(uint256 indexed marketId, address indexed creator, string question, uint8 outcomeCount, uint64 closeTime, uint64 resolutionDeadline);
    event Predicted(uint256 indexed marketId, address indexed diviner, uint8 outcome, uint256 amount);
    event OutcomeProposed(uint256 indexed marketId, address indexed proposer, uint8 outcome);
    event OutcomeDisputed(uint256 indexed marketId, address indexed disputer);
    event MarketResolved(uint256 indexed marketId, uint8 outcome);
    event MarketCancelled(uint256 indexed marketId);
    event Claimed(uint256 indexed marketId, address indexed diviner, uint256 payout);
    event Refunded(uint256 indexed marketId, address indexed diviner, uint256 amount);
    event Followed(address indexed follower, address indexed prophet, uint256 amountPerMarket);
    event Unfollowed(address indexed follower, address indexed prophet);
    event Copied(uint256 indexed marketId, address indexed follower, address indexed prophet, uint8 outcome, uint256 amount);

    // ---------------------------------------------------------------------
    // Modificadores
    // ---------------------------------------------------------------------

    modifier onlyOwner() {
        require(msg.sender == owner, "Divinatio: caller is not the owner");
        _;
    }

    constructor(address treasury_, address token_, uint256 resolutionBond_) {
        require(treasury_ != address(0), "Divinatio: treasury is zero");
        require(token_ != address(0), "Divinatio: token is zero");
        require(resolutionBond_ > 0, "Divinatio: bond is zero");
        owner = msg.sender;
        treasury = treasury_;
        token = IERC20(token_);
        resolutionBond = resolutionBond_;
    }

    // ---------------------------------------------------------------------
    // Criação de mercados (permissionless)
    // ---------------------------------------------------------------------

    function createMarket(
        string calldata question,
        uint8 outcomeCount,
        uint64 closeTime,
        uint64 resolutionDeadline,
        uint16 creatorFeeBps
    ) external returns (uint256 marketId) {
        require(bytes(question).length > 0, "Divinatio: empty question");
        require(outcomeCount >= 2 && outcomeCount <= MAX_OUTCOMES, "Divinatio: invalid outcome count");
        require(closeTime > block.timestamp, "Divinatio: close time in the past");
        require(resolutionDeadline > closeTime, "Divinatio: deadline before close");
        require(creatorFeeBps <= MAX_CREATOR_FEE_BPS, "Divinatio: creator fee too high");

        marketId = _markets.length;
        Market storage m = _markets.push();
        m.creator = msg.sender;
        m.question = question;
        m.outcomeCount = outcomeCount;
        m.closeTime = closeTime;
        m.resolutionDeadline = resolutionDeadline;
        m.creatorFeeBps = creatorFeeBps;
        m.state = MarketState.Open;
        m.pools = new uint256[](outcomeCount);

        emit MarketCreated(marketId, msg.sender, question, outcomeCount, closeTime, resolutionDeadline);
    }

    // ---------------------------------------------------------------------
    // Previsões (stake P2P)
    // ---------------------------------------------------------------------

    function predict(uint256 marketId, uint8 outcome, uint256 amount) external {
        _pull(msg.sender, amount);
        _stake(marketId, msg.sender, outcome, amount);
    }

    // ---------------------------------------------------------------------
    // Copy-staking
    // ---------------------------------------------------------------------

    /// @notice Passa a replicar as previsões do profeta com `amountPerMarket`
    ///         por mercado. Requer aprovação (allowance) do token para o
    ///         protocolo puxar o valor quando a cópia for executada.
    function follow(address prophet, uint256 amountPerMarket) external {
        require(prophet != address(0) && prophet != msg.sender, "Divinatio: invalid prophet");
        require(amountPerMarket > 0, "Divinatio: zero amount");
        follows[msg.sender][prophet] = FollowConfig(amountPerMarket);
        emit Followed(msg.sender, prophet, amountPerMarket);
    }

    function unfollow(address prophet) external {
        delete follows[msg.sender][prophet];
        emit Unfollowed(msg.sender, prophet);
    }

    /// @notice Replica para o seguidor a posição DOMINANTE do profeta no
    ///         mercado (o desfecho onde ele tem mais valor). Executável por
    ///         qualquer keeper; o valor sai do saldo do próprio seguidor.
    ///         Uma cópia por seguidor por mercado.
    function copyPredict(uint256 marketId, address prophet, address follower) external {
        Market storage m = _market(marketId);
        require(m.state == MarketState.Open && block.timestamp < m.closeTime, "Divinatio: market not open");

        uint256 amount = follows[follower][prophet].amountPerMarket;
        require(amount > 0, "Divinatio: not following");
        require(copiedPositions[marketId][follower].amount == 0, "Divinatio: already copied");

        // desfecho dominante do profeta neste mercado
        uint8 outcome = 0;
        uint256 best = 0;
        for (uint8 i = 0; i < m.outcomeCount; i++) {
            uint256 s = stakeOf[marketId][prophet][i];
            if (s > best) {
                best = s;
                outcome = i;
            }
        }
        require(best > 0, "Divinatio: prophet has no stake");

        copiedPositions[marketId][follower] = CopiedPosition(prophet, outcome, amount);
        _pull(follower, amount);
        _stake(marketId, follower, outcome, amount);

        emit Copied(marketId, follower, prophet, outcome, amount);
    }

    // ---------------------------------------------------------------------
    // Resolução otimista
    // ---------------------------------------------------------------------

    /// @notice Após o fechamento, qualquer pessoa propõe o resultado depositando caução.
    function proposeOutcome(uint256 marketId, uint8 outcome) external {
        Market storage m = _market(marketId);
        require(m.state == MarketState.Open, "Divinatio: not awaiting resolution");
        require(block.timestamp >= m.closeTime, "Divinatio: market still open");
        require(block.timestamp <= m.resolutionDeadline, "Divinatio: resolution deadline passed");
        require(outcome < m.outcomeCount, "Divinatio: invalid outcome");

        _pull(msg.sender, resolutionBond);
        m.state = MarketState.Proposed;
        m.proposedOutcome = outcome;
        m.proposer = msg.sender;
        m.disputeWindowEnd = uint64(block.timestamp) + DISPUTE_WINDOW;

        emit OutcomeProposed(marketId, msg.sender, outcome);
    }

    /// @notice Dentro da janela, qualquer pessoa pode contestar com caução igual.
    function dispute(uint256 marketId) external {
        Market storage m = _market(marketId);
        require(m.state == MarketState.Proposed, "Divinatio: nothing to dispute");
        require(block.timestamp < m.disputeWindowEnd, "Divinatio: dispute window closed");

        _pull(msg.sender, resolutionBond);
        m.state = MarketState.Disputed;
        m.disputer = msg.sender;

        emit OutcomeDisputed(marketId, msg.sender);
    }

    /// @notice Sem disputa, o resultado proposto torna-se final e a caução volta.
    function finalize(uint256 marketId) external {
        Market storage m = _market(marketId);
        require(m.state == MarketState.Proposed, "Divinatio: not proposed");
        require(block.timestamp >= m.disputeWindowEnd, "Divinatio: dispute window open");

        address proposer = m.proposer;
        _settle(marketId, m, m.proposedOutcome);
        _push(proposer, resolutionBond);
    }

    /// @notice O árbitro decide disputas. A caução do perdedor vai para o vencedor.
    /// @dev MVP: árbitro é o owner. Roadmap: corte descentralizada (Kleros/UMA/DAO).
    function resolveDispute(uint256 marketId, uint8 outcome) external onlyOwner {
        Market storage m = _market(marketId);
        require(m.state == MarketState.Disputed, "Divinatio: not disputed");
        require(outcome < m.outcomeCount, "Divinatio: invalid outcome");

        address bondWinner = outcome == m.proposedOutcome ? m.proposer : m.disputer;
        _settle(marketId, m, outcome);
        _push(bondWinner, 2 * resolutionBond);
    }

    /// @notice Sem resolução dentro do prazo + carência, o mercado é cancelado
    ///         e todos os participantes recuperam 100% do que depositaram.
    function cancelMarket(uint256 marketId) external {
        Market storage m = _market(marketId);
        require(
            m.state == MarketState.Open || m.state == MarketState.Proposed || m.state == MarketState.Disputed,
            "Divinatio: cannot cancel"
        );
        require(block.timestamp > uint256(m.resolutionDeadline) + CANCEL_GRACE, "Divinatio: too early to cancel");

        address proposer = m.proposer;
        address disputer = m.disputer;
        m.state = MarketState.Cancelled;
        if (proposer != address(0)) _push(proposer, resolutionBond);
        if (disputer != address(0)) _push(disputer, resolutionBond);

        emit MarketCancelled(marketId);
    }

    // ---------------------------------------------------------------------
    // Pagamentos
    // ---------------------------------------------------------------------

    /// @notice Vencedores sacam o próprio stake mais a fração pro-rata do pool
    ///         perdedor (líquido de taxas). Posições copiadas pagam 10% do
    ///         LUCRO ao profeta seguido. Em mercado cancelado, saca o reembolso.
    function claim(uint256 marketId) external {
        Market storage m = _market(marketId);
        require(!claimed[marketId][msg.sender], "Divinatio: already claimed");
        claimed[marketId][msg.sender] = true;

        if (m.state == MarketState.Cancelled) {
            uint256 refund;
            for (uint8 i = 0; i < m.outcomeCount; i++) {
                refund += stakeOf[marketId][msg.sender][i];
            }
            require(refund > 0, "Divinatio: nothing to refund");
            _push(msg.sender, refund);
            emit Refunded(marketId, msg.sender, refund);
            return;
        }

        require(m.state == MarketState.Resolved, "Divinatio: not resolved");
        uint256 winningStake = stakeOf[marketId][msg.sender][m.finalOutcome];
        require(winningStake > 0, "Divinatio: nothing to claim");

        uint256 payout = winningStake + (m.losingPoolNet * winningStake) / m.pools[m.finalOutcome];

        // taxa de performance do profeta sobre o lucro da posição copiada
        CopiedPosition storage cp = copiedPositions[marketId][msg.sender];
        if (cp.amount > 0 && cp.outcome == m.finalOutcome) {
            uint256 copiedProfit = (m.losingPoolNet * cp.amount) / m.pools[m.finalOutcome];
            uint256 prophetFee = (copiedProfit * PROPHET_FEE_BPS) / 10_000;
            payout -= prophetFee;
            prophetFees[cp.prophet] += prophetFee;
        }

        diviners[msg.sender].hits += 1;

        _push(msg.sender, payout);
        emit Claimed(marketId, msg.sender, payout);
    }

    function withdrawCreatorFees() external {
        uint256 amount = creatorFees[msg.sender];
        require(amount > 0, "Divinatio: no fees");
        creatorFees[msg.sender] = 0;
        _push(msg.sender, amount);
    }

    function withdrawProphetFees() external {
        uint256 amount = prophetFees[msg.sender];
        require(amount > 0, "Divinatio: no fees");
        prophetFees[msg.sender] = 0;
        _push(msg.sender, amount);
    }

    function withdrawProtocolFees() external {
        uint256 amount = accruedProtocolFees;
        require(amount > 0, "Divinatio: no fees");
        accruedProtocolFees = 0;
        _push(treasury, amount);
    }

    // ---------------------------------------------------------------------
    // Administração
    // ---------------------------------------------------------------------

    function setTreasury(address treasury_) external onlyOwner {
        require(treasury_ != address(0), "Divinatio: treasury is zero");
        treasury = treasury_;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Divinatio: owner is zero");
        owner = newOwner;
    }

    // ---------------------------------------------------------------------
    // Leitura
    // ---------------------------------------------------------------------

    function marketCount() external view returns (uint256) {
        return _markets.length;
    }

    function getMarket(uint256 marketId)
        external
        view
        returns (
            address creator,
            string memory question,
            uint8 outcomeCount,
            uint64 closeTime,
            uint64 resolutionDeadline,
            MarketState state,
            uint8 finalOutcome,
            uint256[] memory pools
        )
    {
        Market storage m = _market(marketId);
        return (m.creator, m.question, m.outcomeCount, m.closeTime, m.resolutionDeadline, m.state, m.finalOutcome, m.pools);
    }

    /// @notice Taxa de acerto do profeta em pontos-base (10000 = 100%).
    function accuracyBps(address diviner) external view returns (uint256) {
        DivinerStats storage s = diviners[diviner];
        if (s.predictions == 0) return 0;
        return (uint256(s.hits) * 10_000) / s.predictions;
    }

    // ---------------------------------------------------------------------
    // Internos
    // ---------------------------------------------------------------------

    function _market(uint256 marketId) private view returns (Market storage) {
        require(marketId < _markets.length, "Divinatio: unknown market");
        return _markets[marketId];
    }

    function _stake(uint256 marketId, address diviner, uint8 outcome, uint256 amount) private {
        Market storage m = _market(marketId);
        require(m.state == MarketState.Open, "Divinatio: market not open");
        require(block.timestamp < m.closeTime, "Divinatio: predictions closed");
        require(outcome < m.outcomeCount, "Divinatio: invalid outcome");
        require(amount > 0, "Divinatio: zero stake");

        m.pools[outcome] += amount;
        stakeOf[marketId][diviner][outcome] += amount;

        DivinerStats storage stats = diviners[diviner];
        if (!hasPredicted[marketId][diviner]) {
            hasPredicted[marketId][diviner] = true;
            stats.predictions += 1;
        }
        stats.volume += amount;

        emit Predicted(marketId, diviner, outcome, amount);
    }

    function _settle(uint256 marketId, Market storage m, uint8 outcome) private {
        // Pool vencedor vazio: ninguém para receber o pool perdedor — cancela
        // e devolve 100% a todos (o protocolo nunca fica com stake de usuário).
        if (m.pools[outcome] == 0) {
            m.state = MarketState.Cancelled;
            emit MarketCancelled(marketId);
            return;
        }

        uint256 losingPool;
        for (uint8 i = 0; i < m.outcomeCount; i++) {
            if (i != outcome) losingPool += m.pools[i];
        }

        uint256 protocolFee = (losingPool * PROTOCOL_FEE_BPS) / 10_000;
        uint256 creatorFee = (losingPool * m.creatorFeeBps) / 10_000;
        accruedProtocolFees += protocolFee;
        creatorFees[m.creator] += creatorFee;

        m.state = MarketState.Resolved;
        m.finalOutcome = outcome;
        m.losingPoolNet = losingPool - protocolFee - creatorFee;

        emit MarketResolved(marketId, outcome);
    }

    function _pull(address from, uint256 amount) private {
        _callToken(abi.encodeWithSelector(IERC20.transferFrom.selector, from, address(this), amount));
    }

    function _push(address to, uint256 amount) private {
        _callToken(abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
    }

    function _callToken(bytes memory data) private {
        (bool ok, bytes memory ret) = address(token).call(data);
        require(ok && (ret.length == 0 || abi.decode(ret, (bool))), "Divinatio: token transfer failed");
    }
}
