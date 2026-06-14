import { useEffect, useMemo, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "";

// Cores distintas por desfecho, combinando com o tema escuro/dourado.
const COLORS = [
  "#f0c75e", // gold
  "#a78bfa", // violet-soft
  "#4ade80", // green
  "#f87171", // red
  "#38bdf8", // azul
  "#fb923c", // laranja
  "#e879f9", // magenta
  "#2dd4bf", // teal
];

const W = 720;
const H = 280;
const PAD = { top: 16, right: 16, bottom: 28, left: 36 };

function fmtDate(unix) {
  const d = new Date(unix * 1000);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/**
 * Gráfico estilo Polymarket: probabilidade implícita de cada desfecho ao longo
 * do tempo, em SVG puro (sem bibliotecas). Eixo X = tempo, Eixo Y = 0–100%.
 */
export default function MarketChart({ marketId, labels = [] }) {
  const [history, setHistory] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    setHistory(null);
    setError(false);
    const load = () =>
      fetch(`${API_URL}/api/markets/${marketId}/history`)
        .then((r) => {
          if (!r.ok) throw new Error(`API ${r.status}`);
          return r.json();
        })
        .then((data) => {
          if (alive) setHistory(Array.isArray(data) ? data : []);
        })
        .catch(() => {
          if (alive) setError(true);
        });
    load();
    const t = setInterval(load, 12000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [marketId]);

  const geom = useMemo(() => {
    if (!history || history.length === 0) return null;
    const n = history[0].probs.length;
    const ts = history.map((p) => p.t);
    const tMin = Math.min(...ts);
    const tMax = Math.max(...ts);
    const tSpan = tMax - tMin || 1;
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const x = (t) => PAD.left + ((t - tMin) / tSpan) * innerW;
    const y = (p) => PAD.top + (1 - Math.max(0, Math.min(100, p)) / 100) * innerH;

    const lines = [];
    for (let i = 0; i < n; i++) {
      const points = history.map((pt) => `${x(pt.t).toFixed(1)},${y(pt.probs[i]).toFixed(1)}`);
      lines.push({ idx: i, points: points.join(" "), last: history[history.length - 1].probs[i] });
    }
    return { lines, tMin, tMax, n };
  }, [history]);

  if (error) {
    return (
      <div className="chart-card">
        <h3>Evolução das probabilidades</h3>
        <p className="chart-empty">Não foi possível carregar o histórico agora.</p>
      </div>
    );
  }

  if (history === null) {
    return (
      <div className="chart-card">
        <h3>Evolução das probabilidades</h3>
        <div className="skeleton" style={{ height: 200 }} />
      </div>
    );
  }

  if (!geom) {
    return (
      <div className="chart-card">
        <h3>Evolução das probabilidades</h3>
        <p className="chart-empty">
          As probabilidades aparecem aqui quando as apostas começarem.
        </p>
      </div>
    );
  }

  const gridY = [0, 25, 50, 75, 100];
  const innerH = H - PAD.top - PAD.bottom;
  const yPos = (p) => PAD.top + (1 - p / 100) * innerH;

  return (
    <div className="chart-card">
      <h3>Evolução das probabilidades</h3>
      <svg
        className="chart-svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Gráfico de evolução das probabilidades"
      >
        {/* grade horizontal + rótulos do eixo Y */}
        {gridY.map((p) => (
          <g key={p}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={yPos(p)}
              y2={yPos(p)}
              className="chart-grid"
            />
            <text x={PAD.left - 6} y={yPos(p) + 3} className="chart-axis-label" textAnchor="end">
              {p}%
            </text>
          </g>
        ))}
        {/* eixo X: início e fim */}
        <text x={PAD.left} y={H - 8} className="chart-axis-label" textAnchor="start">
          {fmtDate(geom.tMin)}
        </text>
        <text x={W - PAD.right} y={H - 8} className="chart-axis-label" textAnchor="end">
          {fmtDate(geom.tMax)}
        </text>
        {/* linhas por desfecho */}
        {geom.lines.map((l) => (
          <polyline
            key={l.idx}
            points={l.points}
            fill="none"
            stroke={COLORS[l.idx % COLORS.length]}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
      </svg>
      <div className="chart-legend">
        {geom.lines.map((l) => (
          <span className="chart-legend-item" key={l.idx}>
            <i className="chart-swatch" style={{ background: COLORS[l.idx % COLORS.length] }} />
            <span className="chart-legend-label">{labels[l.idx] || `Desfecho ${l.idx + 1}`}</span>
            <strong className="chart-legend-pct">{l.last.toFixed(1)}%</strong>
          </span>
        ))}
      </div>
    </div>
  );
}
