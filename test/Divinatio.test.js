const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const DAY = 24 * 60 * 60;
const BOND = ethers.parseEther("10"); // 10 dUSD
const dusd = (v) => ethers.parseEther(String(v));

describe("Divinatio", function () {
  let divinatio, token, owner, treasury, creator, alice, bob, carol;

  beforeEach(async function () {
    [owner, treasury, creator, alice, bob, carol] = await ethers.getSigners();

    const MockStablecoin = await ethers.getContractFactory("MockStablecoin");
    token = await MockStablecoin.deploy();

    const Divinatio = await ethers.getContractFactory("Divinatio");
    divinatio = await Divinatio.deploy(treasury.address, await token.getAddress(), BOND);

    // todos pegam dUSD no faucet e aprovam o protocolo
    for (const signer of [owner, creator, alice, bob, carol]) {
      await token.connect(signer).faucet();
      await token.connect(signer).approve(await divinatio.getAddress(), ethers.MaxUint256);
    }
  });

  async function createMarket({ outcomes = 2, creatorFeeBps = 100 } = {}) {
    const now = await time.latest();
    const closeTime = now + 7 * DAY;
    const deadline = closeTime + 3 * DAY;
    await divinatio
      .connect(creator)
      .createMarket("Quem vence a Copa do Mundo FIFA 2026?", outcomes, closeTime, deadline, creatorFeeBps);
    return { marketId: 0, closeTime, deadline };
  }

  describe("criação de mercado", function () {
    it("cria um mercado permissionless com parâmetros válidos", async function () {
      await createMarket();
      const m = await divinatio.getMarket(0);
      expect(m.creator).to.equal(creator.address);
      expect(m.outcomeCount).to.equal(2);
      expect(await divinatio.marketCount()).to.equal(1);
    });

    it("rejeita taxa de criador acima do teto", async function () {
      const now = await time.latest();
      await expect(
        divinatio.createMarket("?", 2, now + DAY, now + 2 * DAY, 101)
      ).to.be.revertedWith("Divinatio: creator fee too high");
    });

    it("rejeita número de desfechos inválido", async function () {
      const now = await time.latest();
      await expect(
        divinatio.createMarket("?", 1, now + DAY, now + 2 * DAY, 0)
      ).to.be.revertedWith("Divinatio: invalid outcome count");
      await expect(
        divinatio.createMarket("?", 9, now + DAY, now + 2 * DAY, 0)
      ).to.be.revertedWith("Divinatio: invalid outcome count");
    });
  });

  describe("previsões", function () {
    it("aceita stakes em dUSD e soma os pools", async function () {
      await createMarket();
      await expect(divinatio.connect(alice).predict(0, 0, dusd(100))).to.changeTokenBalance(
        token,
        alice,
        -dusd(100)
      );
      await divinatio.connect(bob).predict(0, 1, dusd(300));
      const m = await divinatio.getMarket(0);
      expect(m.pools[0]).to.equal(dusd(100));
      expect(m.pools[1]).to.equal(dusd(300));
    });

    it("rejeita previsão após o fechamento", async function () {
      const { closeTime } = await createMarket();
      await time.increaseTo(closeTime + 1);
      await expect(divinatio.connect(alice).predict(0, 0, dusd(1))).to.be.revertedWith(
        "Divinatio: predictions closed"
      );
    });

    it("rejeita previsão sem saldo/allowance", async function () {
      await createMarket();
      const [, , , , , , broke] = await ethers.getSigners();
      await expect(divinatio.connect(broke).predict(0, 0, dusd(1))).to.be.revertedWith(
        "Divinatio: token transfer failed"
      );
    });

    it("registra a participação na reputação do profeta", async function () {
      await createMarket();
      await divinatio.connect(alice).predict(0, 0, dusd(100));
      await divinatio.connect(alice).predict(0, 0, dusd(100));
      const stats = await divinatio.diviners(alice.address);
      expect(stats.predictions).to.equal(1); // mesmo mercado conta uma vez
      expect(stats.volume).to.equal(dusd(200));
    });
  });

  describe("resolução otimista", function () {
    it("propõe, finaliza após a janela e devolve a caução", async function () {
      const { closeTime } = await createMarket();
      await divinatio.connect(alice).predict(0, 0, dusd(100));
      await divinatio.connect(bob).predict(0, 1, dusd(100));
      await time.increaseTo(closeTime + 1);

      await expect(divinatio.connect(carol).proposeOutcome(0, 0)).to.changeTokenBalance(
        token,
        carol,
        -BOND
      );
      await expect(divinatio.finalize(0)).to.be.revertedWith("Divinatio: dispute window open");

      await time.increase(DAY + 1);
      await expect(divinatio.finalize(0)).to.changeTokenBalance(token, carol, BOND);
      expect((await divinatio.getMarket(0)).state).to.equal(3); // Resolved
    });

    it("disputa leva ao árbitro; caução do perdedor vai ao vencedor", async function () {
      const { closeTime } = await createMarket();
      await divinatio.connect(alice).predict(0, 0, dusd(100));
      await divinatio.connect(bob).predict(0, 1, dusd(100));
      await time.increaseTo(closeTime + 1);

      await divinatio.connect(carol).proposeOutcome(0, 1);
      await divinatio.connect(alice).dispute(0);

      // árbitro confirma que o desfecho correto era 0: a disputa procede
      await expect(divinatio.connect(owner).resolveDispute(0, 0)).to.changeTokenBalance(
        token,
        alice,
        2n * BOND
      );
      const m = await divinatio.getMarket(0);
      expect(m.state).to.equal(3);
      expect(m.finalOutcome).to.equal(0);
    });

    it("só o árbitro resolve disputas", async function () {
      const { closeTime } = await createMarket();
      await divinatio.connect(alice).predict(0, 0, dusd(1));
      await divinatio.connect(bob).predict(0, 1, dusd(1));
      await time.increaseTo(closeTime + 1);
      await divinatio.connect(carol).proposeOutcome(0, 1);
      await divinatio.connect(alice).dispute(0);
      await expect(divinatio.connect(bob).resolveDispute(0, 0)).to.be.revertedWith(
        "Divinatio: caller is not the owner"
      );
    });

    it("caução ajustável: só o árbitro muda; o valor congela por mercado", async function () {
      // só o árbitro ajusta
      await expect(divinatio.connect(alice).setResolutionBond(dusd(1))).to.be.revertedWith(
        "Divinatio: caller is not the owner"
      );
      await expect(divinatio.connect(owner).setResolutionBond(dusd(1)))
        .to.emit(divinatio, "ResolutionBondUpdated")
        .withArgs(BOND, dusd(1));
      expect(await divinatio.resolutionBond()).to.equal(dusd(1));

      // novo mercado usa a nova caução (1)
      const { closeTime } = await createMarket();
      await divinatio.connect(alice).predict(0, 0, dusd(100));
      await divinatio.connect(bob).predict(0, 1, dusd(100));
      await time.increaseTo(closeTime + 1);
      await expect(divinatio.connect(carol).proposeOutcome(0, 0)).to.changeTokenBalance(
        token,
        carol,
        -dusd(1)
      );

      // árbitro muda a caução DEPOIS da proposta: a devolução usa o valor
      // congelado (1), não o novo (5) — contabilidade exata.
      await divinatio.connect(owner).setResolutionBond(dusd(5));
      await time.increase(DAY + 1);
      await expect(divinatio.finalize(0)).to.changeTokenBalance(token, carol, dusd(1));
    });
  });

  describe("pagamentos", function () {
    it("distribui o pool perdedor pro-rata, líquido de taxas", async function () {
      const { closeTime } = await createMarket({ creatorFeeBps: 100 });
      // alice 100 e carol 300 no desfecho 0; bob 400 no desfecho 1
      await divinatio.connect(alice).predict(0, 0, dusd(100));
      await divinatio.connect(carol).predict(0, 0, dusd(300));
      await divinatio.connect(bob).predict(0, 1, dusd(400));

      await time.increaseTo(closeTime + 1);
      await divinatio.connect(owner).proposeOutcome(0, 0);
      await time.increase(DAY + 1);
      await divinatio.finalize(0);

      // pool perdedor 400; taxas 2% protocolo + 1% criador = 12; líquido 388
      // alice: 100 + 388 * 1/4 = 197 | carol: 300 + 388 * 3/4 = 591
      await expect(divinatio.connect(alice).claim(0)).to.changeTokenBalance(
        token,
        alice,
        dusd(197)
      );
      await expect(divinatio.connect(carol).claim(0)).to.changeTokenBalance(
        token,
        carol,
        dusd(591)
      );

      // taxas: protocolo 8, criador 4
      expect(await divinatio.accruedProtocolFees()).to.equal(dusd(8));
      expect(await divinatio.creatorFees(creator.address)).to.equal(dusd(4));
      await expect(divinatio.withdrawProtocolFees()).to.changeTokenBalance(
        token,
        treasury,
        dusd(8)
      );
      await expect(divinatio.connect(creator).withdrawCreatorFees()).to.changeTokenBalance(
        token,
        creator,
        dusd(4)
      );
    });

    it("perdedor não tem nada a sacar e ninguém saca duas vezes", async function () {
      const { closeTime } = await createMarket();
      await divinatio.connect(alice).predict(0, 0, dusd(100));
      await divinatio.connect(bob).predict(0, 1, dusd(100));
      await time.increaseTo(closeTime + 1);
      await divinatio.connect(owner).proposeOutcome(0, 0);
      await time.increase(DAY + 1);
      await divinatio.finalize(0);

      await expect(divinatio.connect(bob).claim(0)).to.be.revertedWith(
        "Divinatio: nothing to claim"
      );
      await divinatio.connect(alice).claim(0);
      await expect(divinatio.connect(alice).claim(0)).to.be.revertedWith(
        "Divinatio: already claimed"
      );
    });

    it("atualiza a reputação do vencedor no claim", async function () {
      const { closeTime } = await createMarket();
      await divinatio.connect(alice).predict(0, 0, dusd(100));
      await divinatio.connect(bob).predict(0, 1, dusd(100));
      await time.increaseTo(closeTime + 1);
      await divinatio.connect(owner).proposeOutcome(0, 0);
      await time.increase(DAY + 1);
      await divinatio.finalize(0);
      await divinatio.connect(alice).claim(0);

      expect(await divinatio.accuracyBps(alice.address)).to.equal(10000); // 100%
      expect(await divinatio.accuracyBps(bob.address)).to.equal(0);
    });
  });

  describe("copy-staking", function () {
    it("replica a posição dominante do profeta para o seguidor", async function () {
      await createMarket({ outcomes: 2 });
      // alice (profeta) aposta nos dois lados, mais forte no 0
      await divinatio.connect(alice).predict(0, 0, dusd(200));
      await divinatio.connect(alice).predict(0, 1, dusd(50));
      // carol segue alice com 80 por mercado
      await divinatio.connect(carol).follow(alice.address, dusd(80));

      // qualquer keeper executa a cópia
      await expect(
        divinatio.connect(owner).copyPredict(0, alice.address, carol.address)
      ).to.changeTokenBalance(token, carol, -dusd(80));

      expect(await divinatio.stakeOf(0, carol.address, 0)).to.equal(dusd(80));
      const cp = await divinatio.copiedPositions(0, carol.address);
      expect(cp.prophet).to.equal(alice.address);
      expect(cp.outcome).to.equal(0);
    });

    it("rejeita cópia sem follow, duplicada ou de profeta sem posição", async function () {
      await createMarket();
      await expect(
        divinatio.copyPredict(0, alice.address, carol.address)
      ).to.be.revertedWith("Divinatio: not following");

      await divinatio.connect(carol).follow(alice.address, dusd(80));
      await expect(
        divinatio.copyPredict(0, alice.address, carol.address)
      ).to.be.revertedWith("Divinatio: prophet has no stake");

      await divinatio.connect(alice).predict(0, 0, dusd(100));
      await divinatio.copyPredict(0, alice.address, carol.address);
      await expect(
        divinatio.copyPredict(0, alice.address, carol.address)
      ).to.be.revertedWith("Divinatio: already copied");
    });

    it("unfollow desativa novas cópias", async function () {
      await createMarket();
      await divinatio.connect(alice).predict(0, 0, dusd(100));
      await divinatio.connect(carol).follow(alice.address, dusd(80));
      await divinatio.connect(carol).unfollow(alice.address);
      await expect(
        divinatio.copyPredict(0, alice.address, carol.address)
      ).to.be.revertedWith("Divinatio: not following");
    });

    it("profeta recebe 10% do lucro da posição copiada no claim", async function () {
      const { closeTime } = await createMarket({ creatorFeeBps: 0 });
      await divinatio.connect(alice).predict(0, 0, dusd(100)); // profeta
      await divinatio.connect(bob).predict(0, 1, dusd(400)); // contraparte
      await divinatio.connect(carol).follow(alice.address, dusd(100));
      await divinatio.copyPredict(0, alice.address, carol.address);

      await time.increaseTo(closeTime + 1);
      await divinatio.connect(owner).proposeOutcome(0, 0);
      await time.increase(DAY + 1);
      await divinatio.finalize(0);

      // pool perdedor 400, taxa protocolo 2% => líquido 392; pool vencedor 200
      // carol: stake 100 + lucro 196 - taxa do profeta 19.6 = 276.4
      await expect(divinatio.connect(carol).claim(0)).to.changeTokenBalance(
        token,
        carol,
        dusd("276.4")
      );
      expect(await divinatio.prophetFees(alice.address)).to.equal(dusd("19.6"));
      await expect(divinatio.connect(alice).withdrawProphetFees()).to.changeTokenBalance(
        token,
        alice,
        dusd("19.6")
      );

      // o claim do próprio profeta não paga taxa a ninguém
      await expect(divinatio.connect(alice).claim(0)).to.changeTokenBalance(
        token,
        alice,
        dusd(296) // 100 + 196
      );
    });

    it("posição copiada perdedora não paga taxa e é reembolsada em cancelamento", async function () {
      const { deadline } = await createMarket();
      await divinatio.connect(alice).predict(0, 0, dusd(100));
      await divinatio.connect(carol).follow(alice.address, dusd(50));
      await divinatio.copyPredict(0, alice.address, carol.address);

      await time.increaseTo(deadline + 7 * DAY + 1);
      await divinatio.cancelMarket(0);

      await expect(divinatio.connect(carol).claim(0)).to.changeTokenBalance(
        token,
        carol,
        dusd(50)
      );
      expect(await divinatio.prophetFees(alice.address)).to.equal(0);
    });
  });

  describe("cancelamento e reembolso", function () {
    it("mercado sem resolução é cancelado e reembolsa todos integralmente", async function () {
      const { deadline } = await createMarket();
      await divinatio.connect(alice).predict(0, 0, dusd(200));
      await divinatio.connect(bob).predict(0, 1, dusd(500));

      await expect(divinatio.cancelMarket(0)).to.be.revertedWith(
        "Divinatio: too early to cancel"
      );
      await time.increaseTo(deadline + 7 * DAY + 1);
      await divinatio.cancelMarket(0);

      await expect(divinatio.connect(alice).claim(0)).to.changeTokenBalance(
        token,
        alice,
        dusd(200)
      );
      await expect(divinatio.connect(bob).claim(0)).to.changeTokenBalance(
        token,
        bob,
        dusd(500)
      );
    });

    it("resolução com pool vencedor vazio cancela e reembolsa", async function () {
      const { closeTime } = await createMarket();
      await divinatio.connect(alice).predict(0, 0, dusd(100));
      await time.increaseTo(closeTime + 1);
      // desfecho 1 vence, mas ninguém apostou nele
      await divinatio.connect(owner).proposeOutcome(0, 1);
      await time.increase(DAY + 1);
      await divinatio.finalize(0);

      expect((await divinatio.getMarket(0)).state).to.equal(4); // Cancelled
      await expect(divinatio.connect(alice).claim(0)).to.changeTokenBalance(
        token,
        alice,
        dusd(100)
      );
    });
  });
});
