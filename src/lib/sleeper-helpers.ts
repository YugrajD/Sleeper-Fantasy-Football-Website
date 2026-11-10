type Player = { first_name?: string; last_name?: string; position?: string; fantasy_positions?: string[] };

export async function fetchJson<T>(url: string, revalidate: number): Promise<T | null> {
  try {
    const response = await fetch(url, {
      ...(revalidate === 0 ? { cache: "no-store" as const } : { next: { revalidate } }),
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export function cleanPlayerName(id: string, players: Record<string, Player>) {
  const player = players[id];
  return player ? [player.first_name, player.last_name].filter(Boolean).join(" ") || id : id;
}

export function scoreProjection(stats: Record<string, unknown>, scoring: Record<string, number>) {
  let score = 0;
  let matches = 0;
  for (const [stat, multiplier] of Object.entries(scoring)) {
    const value = Number(stats[stat]);
    if (!Number.isFinite(value)) continue;
    score += value * multiplier;
    matches += 1;
  }
  return matches ? score : null;
}

export function slotEligibility(slot: string): string[] {
  if (["FLEX", "RB_WR_TE"].includes(slot)) return ["RB", "WR", "TE"];
  if (slot === "REC_FLEX") return ["WR", "TE"];
  if (slot === "WRRB_FLEX") return ["WR", "RB"];
  if (["SUPER_FLEX", "QB_FLEX", "QB_RB_WR_TE"].includes(slot)) return ["QB", "RB", "WR", "TE"];
  if (slot === "IDP_FLEX") return ["DL", "LB", "DB"];
  if (slot === "DL_FLEX") return ["DL", "DE", "DT"];
  if (slot === "DB_FLEX") return ["DB", "CB", "S"];
  if (slot === "LB_FLEX") return ["LB"];
  return [slot];
}

export function positionFor(id: string, players: Record<string, Player>) {
  if (["ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN", "DET", "GB", "HOU", "IND", "JAX", "KC", "LAC", "LAR", "LV", "MIA", "MIN", "NE", "NO", "NYG", "NYJ", "PHI", "PIT", "SEA", "SF", "TB", "TEN", "WAS"].includes(id)) return ["DEF"];
  const player = players[id];
  return player?.fantasy_positions?.length ? player.fantasy_positions : player?.position ? [player.position] : [];
}
