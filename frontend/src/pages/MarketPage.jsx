import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import {
  predict,
  claim,
  proposeOutcome,
  disputeOutcome,
  finalizeMarket,
  resolveDispute,
  cancelMarket,
  getConfig,
} from "../eth";
import { CURRENCY, parseQuestion, fmtEth, shortAddr, PROTOCOL_FEE_BPS, toUnits } from "../util";
import { OddsList, StateBadge, Countdown } from "../components";
import MarketChart from "../MarketChart";

export default function MarketPage({ account, onConnect, notify }) {
  const { id } = useParams();
  const [market, setMarket] = useState(null);
  const [selected, setSelected] = useState(0);
  const [amount, setAmount] = useState("10");
  const [busy, setBusy] = useState(false);
  const [config, setConfig] = useState(null);
  // relógio que avança a cada 15s para reavaliar prazos (propor/finalizar)
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  const load = () => api.market(id).then(setMarket).catch(() => {});
  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [id]);

  useEffect(() => {
    getConfig().then(setConfig).catch(() => {});
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 15000);
    return () => clearInterval(t);
  }, []);

  const estimate = useMemo(() => {
    if (!market || !amount || Number(amount) <= 0) return null;
    try {
      // converte o valor humano para unidades cruas do token (decimais do
      // /api/config: USDC=6, dUSD=18) — os pools também estão em unidades cruas.
      const stake = toUnits(amount);
      let losing = 0n;
      market.pools.forEach((p, i) => {
        if (i !== selected) losing += BigInt(p);
      });
      const winPool = BigInt(market.pools[selected]) + stake;
      const feeBps = BigInt(PROTOCOL_FEE_BPS + 100);
      const losingNet = losing - (losing * feeBps) / 10000n;
      const payout = stake + (losingNet * stake) / winPool;
      return { payout, mult: Number((payout * 1000n) / stake) / 1000 };
    } catch {
      return null;
    }
  }, [market, amount, selected]);

  if (!market) {
    return (
      <div className="container" style={{ padding: "60px 24px" }}>
        <div className="skeleton" />
      </div>
    );
  }

  const { question, labels } = parseQuestion(market.question, market.outcomeCount);
  const isArbiter =
    config?.owner && account && config.owner.toLowerCase() === account.toLowerCase();
  const bond = config?.resolutionBond || market.bondAmount || "0";

  async function run(fn, okMsg) {
    if (!account) return onConnect();
    setBusy(true);
    try {
      await fn();
      if (okMsg) notify(okMsg, "success");
      load();
    } catch (e) {
      notify(e.shortMessage || e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  const handlePredict = () =>
    run(
      () => predict(market.id, selected, amount),
      `Previsão registrada: ${amount} ${CURRENCY} em "${labels[selected]}" 🔮`
    );
  const handleClaim = () =>
    run(() => claim(market.id), "Saque realizado. Os deuses sorriram para você 👑");
  const handlePropose = () =>
    run(
      () => proposeOutcome(market.id, selected),
      `Resultado proposto: "${labels[selected]}". Janela de disputa de 24h iniciada.`
    );
  const handleDispute = () =>
    run(
      () => disputeOutcome(market.id, market.bondAmount),
      "Resultado contestado. O árbitro vai decidir a disputa."
    );
  const handleFinalize = () =>
    run(() => finalizeMarket(market.id), "Mercado finalizado. Pagamentos liberados ✨");
  const handleResolve = () =>
    run(() => resolveDispute(market.id, selected), `Disputa resolvida: "${labels[selected]}" 👑`);
  const handleCancel = () =>
    run(() => cancelMarket(market.id), "Mercado cancelado. Todos podem sacar o reembolso.");

  // --- decide qual painel de ação mostrar à direita ---
  const pastClose = now >= market.closeTime;
  const pastDeadline = now >= market.resolutionDeadline;
  const windowOpen = market.disputeWindowEnd && now < market.disputeWindowEnd;

  // função (não componente aninhado) para não remontar o <select> a cada
  // re-render — evita o dropdown fechar sozinho durante as atualizações.
  const outcomePicker = (label) => (
    <div>
      <label className="input-label">{label}</label>
      <select
        className="input"
        value={selected}
        onChange={(e) => setSelected(Number(e.target.value))}
      >
        {labels.map((l, i) => (
          <option key={i} value={i}>{l}</option>
        ))}
      </select>
    </div>
  );

  function actionPanel() {
    // 1) Aberto e ainda dentro do prazo de previsões → apostar
    if (market.state === "open" && !pastClose) {
      return (
        <>
          <h3>Fazer minha previsão</h3>
          {outcomePicker("Desfecho escolhido")}
          <div>
            <label className="input-label">Valor ({CURRENCY})</label>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          {estimate && (
            <div className="payout-box">
              Se &ldquo;{labels[selected]}&rdquo; vencer, você recebe cerca de
              <div className="big">{fmtEth(estimate.payout.toString())} {CURRENCY}</div>
              (~{estimate.mult.toFixed(2)}x) com os pools atuais
            </div>
          )}
          <button className="btn btn-gold" onClick={handlePredict} disabled={busy}>
            {busy ? "Consultando o oráculo…" : account ? "Confirmar previsão" : "Conectar carteira"}
          </button>
          <p className="fine-print">
            Modelo parimutuel: os vencedores dividem o pool dos perdedores
            proporcionalmente. Taxa de 2% do protocolo + até 1% do criador, apenas
            sobre o pool perdedor. O DIVINATIO nunca é contraparte da sua aposta.
          </p>
        </>
      );
    }

    // 2) Fechado, dentro do prazo de resolução, sem proposta → propor resultado
    if (market.state === "open" && pastClose && !pastDeadline) {
      return (
        <>
          <h3>Propor o resultado</h3>
          <p className="fine-print" style={{ marginTop: 0 }}>
            O evento acabou. Informe o desfecho correto, depositando uma caução de{" "}
            <strong>{fmtEth(bond)} {CURRENCY}</strong>. Abre uma janela de 24h: se ninguém
            contestar, o resultado vale e você recebe a caução de volta.
          </p>
          {outcomePicker("Resultado correto")}
          <button className="btn btn-gold" onClick={handlePropose} disabled={busy}>
            {busy ? "Enviando…" : account ? `Propor "${labels[selected]}"` : "Conectar carteira"}
          </button>
          <p className="fine-print">
            Se você propor um resultado falso, qualquer pessoa pode contestar e você
            perde a caução. Proponha apenas o desfecho verdadeiro.
          </p>
        </>
      );
    }

    // 3) Fechado, prazo de resolução vencido sem proposta → cancelar/reembolsar
    if (market.state === "open" && pastDeadline) {
      return (
        <>
          <h3>Sem resultado no prazo</h3>
          <p className="fine-print" style={{ marginTop: 0 }}>
            Ninguém propôs um resultado dentro do prazo. Após a carência, o mercado
            pode ser cancelado e <strong>todos são reembolsados 100%</strong>.
          </p>
          <button className="btn" onClick={handleCancel} disabled={busy}>
            {busy ? "Cancelando…" : "Cancelar e reembolsar"}
          </button>
        </>
      );
    }

    // 4) Resultado proposto → contestar (na janela) ou finalizar (após a janela)
    if (market.state === "proposed") {
      return (
        <>
          <h3>Resultado proposto</h3>
          <p style={{ marginBottom: 8 }}>
            Proposto: <strong>👉 {labels[market.proposedOutcome]}</strong>
            {market.proposer && (
              <span className="fine-print"> por {shortAddr(market.proposer)}</span>
            )}
          </p>
          {windowOpen ? (
            <>
              <p className="fine-print" style={{ marginTop: 0 }}>
                Janela de disputa fecha em <Countdown to={market.disputeWindowEnd} />. Se você
                discorda, conteste depositando <strong>{fmtEth(bond)} {CURRENCY}</strong> — quem
                estiver certo (decidido pelo árbitro) leva as duas cauções.
              </p>
              <button className="btn" onClick={handleDispute} disabled={busy}>
                {busy ? "Contestando…" : account ? "Contestar resultado" : "Conectar carteira"}
              </button>
            </>
          ) : (
            <>
              <p className="fine-print" style={{ marginTop: 0 }}>
                A janela de disputa terminou sem contestação. Finalize para liberar os
                pagamentos (a caução volta a quem propôs).
              </p>
              <button className="btn btn-gold" onClick={handleFinalize} disabled={busy}>
                {busy ? "Finalizando…" : "Finalizar e liberar pagamentos"}
              </button>
            </>
          )}
        </>
      );
    }

    // 5) Em disputa → árbitro decide; demais aguardam
    if (market.state === "disputed") {
      return (
        <>
          <h3>Em disputa</h3>
          <p className="fine-print" style={{ marginTop: 0 }}>
            O resultado proposto (<strong>{labels[market.proposedOutcome]}</strong>) foi
            contestado. {isArbiter ? "Como árbitro, decida o desfecho correto." : "O árbitro vai decidir o desfecho correto."}
          </p>
          {isArbiter && (
            <>
              {outcomePicker("Desfecho correto (árbitro)")}
              <button className="btn btn-gold" onClick={handleResolve} disabled={busy}>
                {busy ? "Decidindo…" : `Resolver: "${labels[selected]}"`}
              </button>
            </>
          )}
        </>
      );
    }

    // 6) Resolvido / cancelado → sacar
    return (
      <>
        <h3>{market.state === "resolved" ? "Mercado resolvido" : "Mercado cancelado"}</h3>
        {market.state === "resolved" && market.finalOutcome !== null && (
          <p style={{ marginBottom: 14 }}>
            Desfecho vencedor: <strong>👑 {labels[market.finalOutcome]}</strong>
          </p>
        )}
        <button className="btn btn-gold" onClick={handleClaim} disabled={busy}>
          {busy ? "Sacando…" : market.state === "resolved" ? "Sacar meus ganhos" : "Sacar reembolso"}
        </button>
        <p className="fine-print">
          {market.state === "cancelled"
            ? "Mercados cancelados devolvem 100% do valor a todos os participantes."
            : "Apenas quem previu o desfecho vencedor tem valores a sacar."}
        </p>
      </>
    );
  }

  return (
    <div className="container market-detail">
      <div className="panel">
        <div className="detail-meta">
          <StateBadge state={market.state} />
          {market.state === "open" && !pastClose && (
            <span>
              ⏳ Fecha em <Countdown to={market.closeTime} />
            </span>
          )}
          <span>💰 {fmtEth(market.totalPool)} {CURRENCY} em jogo</span>
          <span>✍️ criador {shortAddr(market.creator)}</span>
        </div>
        <h2>{question}</h2>
        <OddsList
          market={market}
          selected={market.state === "open" ? selected : undefined}
          onSelect={setSelected}
        />

        <MarketChart marketId={market.id} labels={labels} />

        {market.predictions?.length > 0 && (
          <>
            <h3 style={{ marginTop: 28 }}>Últimas previsões</h3>
            <div className="pred-list">
              {market.predictions.map((p, i) => (
                <div key={i} className="pred-item">
                  <span className="addr">{shortAddr(p.diviner)}</span>
                  <span>{labels[p.outcome]}</span>
                  <span className="amt">{fmtEth(p.amount)} {CURRENCY}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="panel stake-form">{actionPanel()}</div>
    </div>
  );
}
