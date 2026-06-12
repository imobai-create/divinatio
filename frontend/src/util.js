import { formatEther } from "ethers";

export const PROTOCOL_FEE_BPS = 200;

export const STATE_PT = {
  open: "Aberto",
  proposed: "Resultado proposto",
  disputed: "Em disputa",
  resolved: "Resolvido",
  cancelled: "Cancelado",
};

/** Linha 1 = pergunta; linhas seguintes = rótulos dos desfechos. */
export function parseQuestion(raw, outcomeCount) {
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const question = lines[0] || raw;
  const labels = [];
  for (let i = 0; i < outcomeCount; i++) {
    labels.push(lines[i + 1] || `Desfecho ${i + 1}`);
  }
  return { question, labels };
}

export function fmtEth(wei, digits = 3) {
  const value = Number(formatEther(BigInt(wei)));
  return value.toLocaleString("pt-BR", { maximumFractionDigits: digits });
}

export function shortAddr(addr) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Participação de cada pool no total (0–100). */
export function poolShares(pools) {
  const total = pools.reduce((acc, p) => acc + BigInt(p), 0n);
  if (total === 0n) return pools.map(() => 0);
  return pools.map((p) => Number((BigInt(p) * 10000n) / total) / 100);
}

/**
 * Multiplicador parimutuel estimado por desfecho: quanto cada 1 ETH apostado
 * recebe se esse desfecho vencer (líquido da taxa de protocolo), dado o
 * estado atual dos pools.
 */
export function impliedMultipliers(pools, creatorFeeBps = 100) {
  const feeBps = BigInt(PROTOCOL_FEE_BPS + creatorFeeBps);
  return pools.map((p, i) => {
    const winPool = BigInt(p);
    if (winPool === 0n) return null;
    let losing = 0n;
    pools.forEach((q, j) => {
      if (j !== i) losing += BigInt(q);
    });
    const losingNet = losing - (losing * feeBps) / 10000n;
    return 1 + Number((losingNet * 1000n) / winPool) / 1000;
  });
}

export function timeLeft(unixSeconds) {
  const diff = unixSeconds * 1000 - Date.now();
  if (diff <= 0) return null;
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}
