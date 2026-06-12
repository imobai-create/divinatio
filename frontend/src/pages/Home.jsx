import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { CURRENCY, fmtEth } from "../util";
import { MarketCard } from "../components";

export default function Home() {
  const [markets, setMarkets] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      Promise.all([api.markets(), api.stats()])
        .then(([m, s]) => {
          if (!alive) return;
          setMarkets(m);
          setStats(s);
        })
        .catch(() => alive && setMarkets([]));
    load();
    const t = setInterval(load, 8000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const open = (markets || []).filter((m) => m.state === "open");
  const others = (markets || []).filter((m) => m.state !== "open");

  return (
    <>
      <header className="hero">
        <div className="container">
          <h1>DIVINATIO</h1>
          <p className="tagline">
            Aposte contra <strong>outras pessoas</strong> em eventos futuros — Copa do
            Mundo, música, cultura. Sem casa de apostas: as odds nascem dos pools e os
            vencedores dividem o prêmio, on-chain.
          </p>
          <div className="hero-actions">
            <a href="#mercados" className="btn btn-gold">Explorar mercados</a>
            <Link to="/criar" className="btn">Criar o seu</Link>
          </div>
        </div>
      </header>

      <div className="container">
        {stats && (
          <div className="stats-row">
            <Stat value={stats.markets} label="Mercados" />
            <Stat value={stats.openMarkets} label="Abertos agora" />
            <Stat value={`${fmtEth(stats.totalVolume, 0)} ${CURRENCY}`} label="Volume em jogo" />
            <Stat value={stats.predictions} label="Previsões" />
            <Stat value={stats.diviners} label="Profetas" />
          </div>
        )}

        <h2 className="section-title" id="mercados">⚜ Mercados abertos</h2>
        <MarketGrid markets={markets === null ? null : open} emptyText="Nenhum mercado aberto. Seja a primeira pessoa a criar um!" />

        {others.length > 0 && (
          <>
            <h2 className="section-title">🕯 Encerrados e em resolução</h2>
            <MarketGrid markets={others} />
          </>
        )}
      </div>
    </>
  );
}

function Stat({ value, label }) {
  return (
    <div className="stat-card">
      <div className="value">{value}</div>
      <div className="label">{label}</div>
    </div>
  );
}

function MarketGrid({ markets, emptyText }) {
  if (markets === null) {
    return (
      <div className="markets-grid">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton" />
        ))}
      </div>
    );
  }
  if (markets.length === 0) {
    return (
      <div className="empty-state">
        <span className="orb">🔮</span>
        {emptyText || "Nada por aqui."}
      </div>
    );
  }
  return (
    <div className="markets-grid">
      {markets.map((m) => (
        <MarketCard key={m.id} market={m} />
      ))}
    </div>
  );
}
