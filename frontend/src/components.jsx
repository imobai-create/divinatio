import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { CURRENCY, STATE_PT, parseQuestion, poolShares, impliedMultipliers, fmtEth, timeLeft } from "./util";

export function Navbar({ account, balance, onConnect, onFaucet, onAddFunds, isMainnet, onLogout }) {
  return (
    <nav className="navbar">
      <div className="container navbar-inner">
        <Link to="/" className="logo">
          <span className="orb">🔮</span> DIVINATIO
        </Link>
        <div className="nav-links">
          <NavLink to="/" end>Mercados</NavLink>
          <NavLink to="/profetas">Profetas</NavLink>
          <NavLink to="/criar">Criar mercado</NavLink>
        </div>
        {account &&
          (isMainnet ? (
            <button className="btn btn-gold" onClick={onAddFunds} title="Adicionar fundos com PIX ou cartão">
              💳 {balance !== null ? `${fmtEth(balance, 0)} ${CURRENCY}` : "Adicionar fundos"}
            </button>
          ) : (
            <button className="btn" onClick={onFaucet} title={`Receba 1.000 ${CURRENCY} de teste`}>
              🚰 {balance !== null ? `${fmtEth(balance, 0)} ${CURRENCY}` : "…"}
            </button>
          ))}
        {account ? (
          <button
            className="btn btn-wallet"
            onClick={onLogout}
            title="Sair"
          >
            🜂 {account.slice(0, 6)}…{account.slice(-4)} · sair
          </button>
        ) : (
          <button className="btn btn-gold btn-wallet" onClick={onConnect}>
            Entrar
          </button>
        )}
      </div>
    </nav>
  );
}

export function StateBadge({ state }) {
  return (
    <span className={`badge badge-${state}`}>
      <span className="dot" /> {STATE_PT[state] || state}
    </span>
  );
}

export function Countdown({ to, prefix = "" }) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const left = timeLeft(to);
  return <span className="countdown">{left ? `${prefix}${left}` : "encerrado"}</span>;
}

export function OddsList({ market, selected, onSelect, compact = false }) {
  const { labels } = parseQuestion(market.question, market.outcomeCount);
  const shares = poolShares(market.pools);
  const mults = impliedMultipliers(market.pools);
  const interactive = Boolean(onSelect) && market.state === "open";

  return (
    <div className="odds-list">
      {labels.map((label, i) => (
        <div
          key={i}
          className={[
            "odds-row",
            interactive ? "clickable" : "",
            selected === i ? "selected" : "",
            market.finalOutcome === i ? "winner" : "",
          ].join(" ")}
          onClick={interactive ? () => onSelect(i) : undefined}
        >
          <div className="fill" style={{ width: `${shares[i]}%` }} />
          <div className="content">
            <span>
              {market.finalOutcome === i ? "👑 " : ""}
              {label}
              {!compact && mults[i] && <span className="mult">paga ~{mults[i].toFixed(2)}x</span>}
            </span>
            <span className="pct">{shares[i].toFixed(1)}%</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function MarketCard({ market }) {
  const { question } = parseQuestion(market.question, market.outcomeCount);
  return (
    <Link to={`/mercado/${market.id}`}>
      <div className="market-card">
        <div className="market-meta">
          <StateBadge state={market.state} />
          {market.state === "open" && <Countdown to={market.closeTime} prefix="fecha em " />}
        </div>
        <div className="question">{question}</div>
        <OddsList market={market} compact />
        <div className="market-meta">
          <span>💰 {fmtEth(market.totalPool)} {CURRENCY} em jogo</span>
          <span>{market.predictionCount} previsões</span>
        </div>
      </div>
    </Link>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        DIVINATIO — protocolo de mercados de previsão peer-to-peer. As odds emergem dos
        pools: você aposta contra outras pessoas, nunca contra a casa.
        <br />
        Protótipo em rede de teste. Não é aconselhamento financeiro.
      </div>
    </footer>
  );
}

export function ToastStack({ toasts }) {
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
