import { useEffect, useState } from "react";
import { api } from "../api";
import { fmtEth, shortAddr } from "../util";

export default function Leaderboard() {
  const [diviners, setDiviners] = useState(null);

  useEffect(() => {
    api.leaderboard().then(setDiviners).catch(() => setDiviners([]));
  }, []);

  return (
    <div className="container leaderboard">
      <h2 className="section-title">☼ Ranking de Profetas</h2>
      <p style={{ color: "var(--text-dim)", marginBottom: 24, lineHeight: 1.6 }}>
        Cada acerto e erro fica gravado on-chain — um histórico de precisão impossível
        de falsificar. Em breve: <strong style={{ color: "var(--gold-soft)" }}>copy-staking</strong>,
        para seguir os melhores Profetas e replicar suas previsões automaticamente.
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
        return (
          <div key={d.address} className="diviner-row">
            <div className="rank">{["Ⅰ", "Ⅱ", "Ⅲ"][i] || i + 1}</div>
            <div>
              <div className="addr">{shortAddr(d.address)}</div>
            </div>
            <div className="metric">
              <b>{d.predictions}</b> previsões
            </div>
            <div className="metric">
              <b>{fmtEth(d.volume, 2)}</b> ETH movidos
            </div>
            <div
              className="accuracy-ring"
              style={{ "--p": pct }}
              title={`${d.hits} acertos em ${d.predictions}`}
            >
              {pct.toFixed(0)}%
            </div>
          </div>
        );
      })}
    </div>
  );
}
