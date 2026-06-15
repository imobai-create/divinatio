const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const DAY = 24 * 60 * 60;

// Verifica que o Divinatio é AGNÓSTICO a decimais: com um token de 6 decimais
// (como o USDC real), uma aposta de "100" deve resultar em 100 * 10^6 no pool.
describe("Divinatio — token de 6 decimais (USDC)", function () {
  let divinatio, token, treasury, creator, alice;

  // bond de 10 USDC em unidades cruas (6 decimais)
  const BOND = ethers.parseUnits("10", 6);
  const usdc = (v) => ethers.parseUnits(String(v), 6);

  beforeEach(async function () {
    [, treasury, creator, alice] = await ethers.getSigners();

    const MockUSDC6 = await ethers.getContractFactory("MockUSDC6");
    token = await MockUSDC6.deploy();

    const Divinatio = await ethers.getContractFactory("Divinatio");
    divinatio = await Divinatio.deploy(treasury.address, await token.getAddress(), BOND);

    for (const signer of [creator, alice]) {
      await token.connect(signer).faucet();
      await token.connect(signer).approve(await divinatio.getAddress(), ethers.MaxUint256);
    }
  });

  it("o token tem 6 decimais", async function () {
    expect(await token.decimals()).to.equal(6);
  });

  it("uma aposta de '100' resulta em 100 * 10^6 (=100000000) no pool", async function () {
    const now = await time.latest();
    const closeTime = now + 7 * DAY;
    await divinatio
      .connect(creator)
      .createMarket("Pergunta?", 2, closeTime, closeTime + 3 * DAY, 100);

    await divinatio.connect(alice).predict(0, 0, usdc(100));

    const m = await divinatio.getMarket(0);
    // pool[0] cru = 100_000_000 (100 USDC com 6 decimais)
    expect(m.pools[0]).to.equal(100_000_000n);
    expect(m.pools[0]).to.equal(usdc(100));
    console.log("POOL[0] CRU =", m.pools[0].toString());
  });
});
