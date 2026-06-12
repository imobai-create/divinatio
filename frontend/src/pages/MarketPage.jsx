import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { predict, claim } from "../eth";
import { parseQuestion, fmtEth, shortAddr, PROTOCOL_FEE_BPS } from "../util";
import { OddsList, StateBadge, Countdown } from "../components";

export default function MarketPage({ account, onConnect, notify }) {
  const { id } = useParams();
  const [market, setMarket] = useState(null);
  const [selected, setSelected] = useState(0);
  const [amount, setAmount] = useState("0.1");
  const [busy, setBusy] = useState(false);

  const load = () => api.market(id).then(setMarket).catch(() => {});
  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [id]);

  const estimate = useMemo(() => {
    if (!market || !amount || Number(amount) <= 0) return null;
    try {
      const stake = BigInt(Math.round(Number(amount) * 1e18));
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

  async function handlePredict() {
    if (!account) return onConnect();
    setBusy(true);
    try {
      await predict(market.id, selected, amount);
      notify(`Previsão registrada: ${amount} ETH em "${labels[selected]}" 🔮`, "success");
      load();
    } catch (e) {
      notify(e.shortMessage || e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleClaim() {
    if (!account) return onConnect();
    setBusy(true);
    try {
      await claim(market.id);
      notify("Saque realizado. Os deuses sorriram para você 👑", "success");
      load();
    } catch (e) {
      notify(e.shortMessage || e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container market-detail">
      <div className="panel">
        <div className="detail-meta">
          <StateBadge state={market.state} />
          {market.state === "open" && (
            <span>
              ⏳ Fecha em <Countdown to={market.closeTime} />
            </span>
          )}
          <span>💰 {fmtEth(market.totalPool)} ETH em jogo</span>
          <span>✍️ criador {shortAddr(market.creator)}</span>
        </div>
        <h2>{question}</h2>
        <OddsList
          market={market}
          selected={market.state === "open" ? selected : undefined}
          onSelect={setSelected}
        />

        {market.predictions?.length > 0 && (
          <>
            <h3 style={{ marginTop: 28 }}>Últimas previsões</h3>
            <div className="pred-list">
              {market.predictions.map((p, i) => (
                <div key={i} className="pred-item">
                  <span className="addr">{shortAddr(p.diviner)}</span>
                  <span>{labels[p.outcome]}</span>
                  <span className="amt">{fmtEth(p.amount)} ETH</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="panel stake-form">
        {market.state === "open" ? (
          <>
            <h3>Fazer minha previsão</h3>
            <div>
              <label className="input-label">Desfecho escolhido</label>
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
            <div>
              <label className="input-label">Valor (ETH)</label>
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
                <div className="big">{fmtEth(estimate.payout.toString())} ETH</div>
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
        ) : market.state === "resolved" || market.state === "cancelled" ? (
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
        ) : (
          <>
            <h3>Aguardando resolução</h3>
            <p className="fine-print">
              O evento já ocorreu. Um resultado foi proposto e está na janela de
              disputa de 24h — qualquer pessoa pode contestá-lo depositando uma
              caução. Sem contestação, os pagamentos são liberados.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
