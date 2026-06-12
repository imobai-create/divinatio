const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const DAY = 24 * 60 * 60;
const BOND = ethers.parseEther("0.01");

describe("Divinatio", function () {
  let divinatio, owner, treasury, creator, alice, bob, carol;

  beforeEach(async function () {
    [owner, treasury, creator, alice, bob, carol] = await ethers.getSigners();
    const Divinatio = await ethers.getContractFactory("Divinatio");
    divinatio = await Divinatio.deploy(treasury.address);
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
    it("aceita stakes e soma os pools", async function () {
      await createMarket();
      await divinatio.connect(alice).predict(0, 0, { value: ethers.parseEther("1") });
      await divinatio.connect(bob).predict(0, 1, { value: ethers.parseEther("3") });
      const m = await divinatio.getMarket(0);
      expect(m.pools[0]).to.equal(ethers.parseEther("1"));
      expect(m.pools[1]).to.equal(ethers.parseEther("3"));
    });

    it("rejeita previsão após o fechamento", async function () {
      const { closeTime } = await createMarket();
      await time.increaseTo(closeTime + 1);
      await expect(
        divinatio.connect(alice).predict(0, 0, { value: 1 })
      ).to.be.revertedWith("Divinatio: predictions closed");
    });

    it("registra a participação na reputação do profeta", async function () {
      await createMarket();
      await divinatio.connect(alice).predict(0, 0, { value: ethers.parseEther("1") });
      await divinatio.connect(alice).predict(0, 0, { value: ethers.parseEther("1") });
      const stats = await divinatio.diviners(alice.address);
      expect(stats.predictions).to.equal(1); // mesmo mercado conta uma vez
      expect(stats.volume).to.equal(ethers.parseEther("2"));
    });
  });

  describe("resolução otimista", function () {
    it("propõe, finaliza após a janela e devolve a caução", async function () {
      const { closeTime } = await createMarket();
      await divinatio.connect(alice).predict(0, 0, { value: ethers.parseEther("1") });
      await divinatio.connect(bob).predict(0, 1, { value: ethers.parseEther("1") });
      await time.increaseTo(closeTime + 1);

      await divinatio.connect(carol).proposeOutcome(0, 0, { value: BOND });
      await expect(divinatio.finalize(0)).to.be.revertedWith("Divinatio: dispute window open");

      await time.increase(DAY + 1);
      await expect(divinatio.finalize(0)).to.changeEtherBalance(carol, BOND);
      expect((await divinatio.getMarket(0)).state).to.equal(3); // Resolved
    });

    it("disputa leva ao árbitro; caução do perdedor vai ao vencedor", async function () {
      const { closeTime } = await createMarket();
      await divinatio.connect(alice).predict(0, 0, { value: ethers.parseEther("1") });
      await divinatio.connect(bob).predict(0, 1, { value: ethers.parseEther("1") });
      await time.increaseTo(closeTime + 1);

      await divinatio.connect(carol).proposeOutcome(0, 1, { value: BOND });
      await divinatio.connect(alice).dispute(0, { value: BOND });

      // árbitro confirma que o desfecho correto era 0: a disputa procede
      await expect(divinatio.connect(owner).resolveDispute(0, 0)).to.changeEtherBalance(
        alice,
        2n * BOND
      );
      const m = await divinatio.getMarket(0);
      expect(m.state).to.equal(3);
      expect(m.finalOutcome).to.equal(0);
    });

    it("só o árbitro resolve disputas", async function () {
      const { closeTime } = await createMarket();
      await divinatio.connect(alice).predict(0, 0, { value: 1 });
      await divinatio.connect(bob).predict(0, 1, { value: 1 });
      await time.increaseTo(closeTime + 1);
      await divinatio.connect(carol).proposeOutcome(0, 1, { value: BOND });
      await divinatio.connect(alice).dispute(0, { value: BOND });
      await expect(divinatio.connect(bob).resolveDispute(0, 0)).to.be.revertedWith(
        "Divinatio: caller is not the owner"
      );
    });
  });

  describe("pagamentos", function () {
    it("distribui o pool perdedor pro-rata, líquido de taxas", async function () {
      const { closeTime } = await createMarket({ creatorFeeBps: 100 });
      // alice 1 ETH e carol 3 ETH no desfecho 0; bob 4 ETH no desfecho 1
      await divinatio.connect(alice).predict(0, 0, { value: ethers.parseEther("1") });
      await divinatio.connect(carol).predict(0, 0, { value: ethers.parseEther("3") });
      await divinatio.connect(bob).predict(0, 1, { value: ethers.parseEther("4") });

      await time.increaseTo(closeTime + 1);
      await divinatio.connect(owner).proposeOutcome(0, 0, { value: BOND });
      await time.increase(DAY + 1);
      await divinatio.finalize(0);

      // pool perdedor 4 ETH; taxas 2% protocolo + 1% criador = 0.12 ETH; líquido 3.88
      // alice: 1 + 3.88 * 1/4 = 1.97 | carol: 3 + 3.88 * 3/4 = 5.91
      await expect(divinatio.connect(alice).claim(0)).to.changeEtherBalance(
        alice,
        ethers.parseEther("1.97")
      );
      await expect(divinatio.connect(carol).claim(0)).to.changeEtherBalance(
        carol,
        ethers.parseEther("5.91")
      );

      // taxas: protocolo 0.08 ETH, criador 0.04 ETH
      expect(await divinatio.accruedProtocolFees()).to.equal(ethers.parseEther("0.08"));
      expect(await divinatio.creatorFees(creator.address)).to.equal(ethers.parseEther("0.04"));
      await expect(divinatio.withdrawProtocolFees()).to.changeEtherBalance(
        treasury,
        ethers.parseEther("0.08")
      );
      await expect(divinatio.connect(creator).withdrawCreatorFees()).to.changeEtherBalance(
        creator,
        ethers.parseEther("0.04")
      );
    });

    it("perdedor não tem nada a sacar e ninguém saca duas vezes", async function () {
      const { closeTime } = await createMarket();
      await divinatio.connect(alice).predict(0, 0, { value: ethers.parseEther("1") });
      await divinatio.connect(bob).predict(0, 1, { value: ethers.parseEther("1") });
      await time.increaseTo(closeTime + 1);
      await divinatio.connect(owner).proposeOutcome(0, 0, { value: BOND });
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
      await divinatio.connect(alice).predict(0, 0, { value: ethers.parseEther("1") });
      await divinatio.connect(bob).predict(0, 1, { value: ethers.parseEther("1") });
      await time.increaseTo(closeTime + 1);
      await divinatio.connect(owner).proposeOutcome(0, 0, { value: BOND });
      await time.increase(DAY + 1);
      await divinatio.finalize(0);
      await divinatio.connect(alice).claim(0);

      expect(await divinatio.accuracyBps(alice.address)).to.equal(10000); // 100%
      expect(await divinatio.accuracyBps(bob.address)).to.equal(0);
    });
  });

  describe("cancelamento e reembolso", function () {
    it("mercado sem resolução é cancelado e reembolsa todos integralmente", async function () {
      const { deadline } = await createMarket();
      await divinatio.connect(alice).predict(0, 0, { value: ethers.parseEther("2") });
      await divinatio.connect(bob).predict(0, 1, { value: ethers.parseEther("5") });

      await expect(divinatio.cancelMarket(0)).to.be.revertedWith(
        "Divinatio: too early to cancel"
      );
      await time.increaseTo(deadline + 7 * DAY + 1);
      await divinatio.cancelMarket(0);

      await expect(divinatio.connect(alice).claim(0)).to.changeEtherBalance(
        alice,
        ethers.parseEther("2")
      );
      await expect(divinatio.connect(bob).claim(0)).to.changeEtherBalance(
        bob,
        ethers.parseEther("5")
      );
    });

    it("resolução com pool vencedor vazio cancela e reembolsa", async function () {
      const { closeTime } = await createMarket();
      await divinatio.connect(alice).predict(0, 0, { value: ethers.parseEther("1") });
      await time.increaseTo(closeTime + 1);
      // desfecho 1 vence, mas ninguém apostou nele
      await divinatio.connect(owner).proposeOutcome(0, 1, { value: BOND });
      await time.increase(DAY + 1);
      await divinatio.finalize(0);

      expect((await divinatio.getMarket(0)).state).to.equal(4); // Cancelled
      await expect(divinatio.connect(alice).claim(0)).to.changeEtherBalance(
        alice,
        ethers.parseEther("1")
      );
    });
  });
});
