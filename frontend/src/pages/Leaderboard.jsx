import { useEffect, useState } from "react";
import { api } from "../api";
import { follow } from "../eth";
import { CURRENCY, fmtEth, shortAddr } from "../util";

export default function Leaderboard({ account, onConnect, notify }) {
  const [diviners, setDiviners] = useState(null);
  const [followTarget, setFollowTarget] = useState(null);
  const [amount, setAmount] = useState("25");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.leaderboard().then(setDiviners).catch(() => setDiviners([]));
  }, []);

  async function handleFollow(prophet) {
    if (!account) return onConnect();
    setBusy(true);
    try {
      await follow(prophet, amount);
      notify(
        `Você agora segue ${shortAddr(prophet)} com ${amount} ${CURRENCY} por mercado 🔭`,
        "success"
      );
      setFollowTarget(null);
    } catch (e) {
      notify(e.shortMessage || e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container leaderboard">
      <h2 className="section-title">☼ Ranking de Profetas</h2>
      <p style={{ color: "var(--text-dim)", marginBottom: 24, lineHeight: 1.6 }}>
        Cada acerto e erro fica gravado on-chain — um histórico de precisão impossível
        de falsificar. Com o{" "}
        <strong style={{ color: "var(--gold-soft)" }}>copy-staking</strong>, você segue
        um Profeta e replica as previsões dele automaticamente; ele recebe 10% do lucro
        que gerar para você.
      </p>

      {diviners === null && <div className="skeleton" />}
      {diviners?.length === 0 && (
        <div className="empty-state">
          <span className="orb">☄️</span>
          Nenhum profeta registrado ainda. Faça a primeira previsão!
        </div>
      )}
      {diviners?.map((d, i) => {
        const pct = d.accuracyBps / 100;
        const isSelf = account && account.toLowerCase() === d.address.toLowerCase();
        return (
          <div key={d.address}>
            <div className="diviner-row">
              <div className="rank">{["Ⅰ", "Ⅱ", "Ⅲ"][i] || i + 1}</div>
              <div>
                <div className="addr">{shortAddr(d.address)}</div>
                {d.followers > 0 && (
                  <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
                    🔭 {d.followers} seguidor{d.followers > 1 ? "es" : ""}
                  </div>
                )}
              </div>
              <div className="metric">
                <b>{d.predictions}</b> previsões
              </div>
              <div className="metric">
                <b>{fmtEth(d.volume, 0)}</b> {CURRENCY} movidos
              </div>
              <div
                className="accuracy-ring"
                style={{ "--p": pct }}
                title={`${d.hits} acertos em ${d.predictions}`}
              >
                {pct.toFixed(0)}%
              </div>
              {!isSelf && (
                <button
                  className="btn"
                  onClick={() =>
                    setFollowTarget(followTarget === d.address ? null : d.address)
                  }
                >
                  Seguir
                </button>
              )}
            </div>
            {followTarget === d.address && (
              <div className="follow-form">
                <label className="input-label">
                  Quanto replicar por mercado ({CURRENCY})
                </label>
                <div className="outcome-input-row">
                  <input
                    className="input"
                    type="number"
                    min="1"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  <button
                    className="btn btn-gold"
                    disabled={busy}
                    onClick={() => handleFollow(d.address)}
                  >
                    {busy ? "Assinando…" : account ? "Confirmar" : "Conectar carteira"}
                  </button>
                </div>
                <p className="fine-print">
                  Sempre que este Profeta entrar num mercado, sua posição será replicada
                  com esse valor (limite de uma cópia por mercado). Você pode deixar de
                  seguir a qualquer momento e o valor sai apenas do seu próprio saldo.
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
