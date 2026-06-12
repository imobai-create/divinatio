// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Divinatio Dólar (dUSD) — stablecoin de teste
/// @notice ERC-20 mínimo com faucet público para demonstrações em testnet.
///         Em produção, o protocolo usa uma stablecoin real (ex.: USDC).
contract MockStablecoin {
    string public constant name = "Divinatio Dolar";
    string public constant symbol = "dUSD";
    uint8 public constant decimals = 18;
    uint256 public constant FAUCET_AMOUNT = 1_000e18;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /// @notice Qualquer pessoa pode pegar 1.000 dUSD para testar.
    function faucet() external {
        totalSupply += FAUCET_AMOUNT;
        balanceOf[msg.sender] += FAUCET_AMOUNT;
        emit Transfer(address(0), msg.sender, FAUCET_AMOUNT);
    }

    function transfer(address to, uint256 value) external returns (bool) {
        return _transfer(msg.sender, to, value);
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= value, "dUSD: insufficient allowance");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - value;
        }
        return _transfer(from, to, value);
    }

    function _transfer(address from, address to, uint256 value) private returns (bool) {
        require(balanceOf[from] >= value, "dUSD: insufficient balance");
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
        return true;
    }
}
