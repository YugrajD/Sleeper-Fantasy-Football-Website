// Monday night can finish before Sleeper advances its week or scoring marker.
const confirmedThrough: Record<string, number> = { "2026": 9 };

export function completedSleeperWeek(season: string, currentWeek: number, lastScoredWeek?: number | string | null) {
  const lastScored = Number(lastScoredWeek ?? currentWeek - 1);
  const reported = Number.isInteger(lastScored) && lastScored >= 0 ? lastScored : currentWeek - 1;
  return Math.max(reported, confirmedThrough[season] ?? 0);
}
