const API_URL = import.meta.env.VITE_API_URL || "";

async function get(path) {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json();
}

export const api = {
  markets: (state) => get(`/api/markets${state ? `?state=${state}` : ""}`),
  market: (id) => get(`/api/markets/${id}`),
  leaderboard: () => get("/api/leaderboard"),
  stats: () => get("/api/stats"),
};
