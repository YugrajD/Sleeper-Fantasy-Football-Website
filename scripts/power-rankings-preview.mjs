import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bestProjectedLineup } from "../src/lib/playoff-chances.ts";
import { positionFor, scoreProjection, slotEligibility } from "../src/lib/sleeper-helpers.ts";

// Run with Node's TypeScript stripping: node --experimental-strip-types scripts/power-rankings-preview.mjs
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const origin = process.env.LEAGUE_SITE_ORIGIN ?? "http://localhost:3001";
const leagueId = process.env.SLEEPER_LEAGUE_ID ?? "1389131126982860800";
const api = "https://api.sleeper.app/v1";
const definitions = [
  { key: "record", label: "Win percentage", weight: 0.15 },
  { key: "pointDifferential", label: "Point differential per week", weight: 0.10 },
  { key: "allPlay", label: "All-play win percentage", weight: 0.20 },
  { key: "lineup", label: "Best projected lineup next week", weight: 0.20 },
  { key: "outlook", label: "Average best projected lineup remaining", weight: 0.15 },
  { key: "momentum", label: "Last three completed weeks average", weight: 0.10 },
  { key: "efficiency", label: "Actual points / optimal points", weight: 0.05 },
  { key: "schedule", label: "Remaining opponents' all-play strength", weight: 0.05, reverse: true },
];
if (Math.abs(definitions.reduce((sum, factor) => sum + factor.weight, 0) - 1) > 1e-9) throw Error("Weights must total 100%.");

async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(25_000) });
  if (!response.ok) throw Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

const [history, league, rosters, users, players] = await Promise.all([
  get(`${origin}/api/analytics`), get(`${api}/league/${leagueId}`), get(`${api}/league/${leagueId}/rosters`),
  get(`${api}/league/${leagueId}/users`), get(`${api}/players/nfl`),
]);
const start = history.throughWeek + 1;
const stop = Number(league.settings.playoff_week_start) - 1;
const weeks = Array.from({ length: Math.max(0, stop - start + 1) }, (_, i) => start + i);
if (!weeks.length) throw Error("There are no regular-season weeks left to project.");
const slots = league.roster_positions.filter((slot) => !["BN", "IR", "TAXI", "RES", "REC"].includes(slot))
  .map((label) => ({ label, positions: slotEligibility(label) }));
const positions = [...new Set(slots.flatMap((slot) => slot.positions))];
const feeds = await Promise.all(weeks.map(async (week) => {
  const [pages, matchups] = await Promise.all([
    Promise.all(positions.map((position) => get(`https://api.sleeper.com/projections/nfl/${history.season}/${week}?season_type=regular&position=${position}`))),
    get(`${api}/league/${leagueId}/matchups/${week}`),
  ]);
  const rows = pages.flat().filter((row) => !row.company || row.company === "rotowire");
  const scheduled = new Set(rows.filter((row) => row.team && row.opponent).flatMap((row) => [row.team, row.opponent]));
  if (scheduled.size < 20) throw Error(`Incomplete NFL slate in Week ${week}.`);
  return { week, rows: new Map(rows.map((row) => [row.player_id, row])), scheduled, matchups };
}));

// This preview incorporates the confirmed injury report instead of estimating a return.
const excluded = history.season === "2026" && history.throughWeek === 9 ? new Set(["9493"]) : new Set();
const fallback = { QB: 12, RB: 4, WR: 4, TE: 3, K: 5, DEF: 4 };
const metadata = new Map(rosters.map((roster) => {
  const user = users.find((user) => user.user_id === roster.owner_id);
  return [roster.roster_id, user?.metadata?.team_name?.trim() || user?.display_name || user?.username];
}));
const allPlayRecords = new Map(history.teams.map((team) => {
  let wins = 0, losses = 0, ties = 0;
  for (const result of team.weekly) {
    for (const other of history.teams) {
      if (other.rosterId === team.rosterId) continue;
      const opponent = other.weekly.find((week) => week.week === result.week);
      if (!opponent) throw Error("Missing historical score.");
      const delta = Math.round(result.actual * 100) - Math.round(opponent.actual * 100);
      if (delta > 0) wins++;
      else if (delta < 0) losses++;
      else ties++;
    }
  }
  return [team.rosterId, { wins, losses, ties, rate: (wins + ties / 2) / (wins + losses + ties) }];
}));

const entries = history.teams.map((team) => {
  const roster = rosters.find((roster) => roster.roster_id === team.rosterId);
  if (!roster) throw Error(`Missing roster ${team.rosterId}.`);
  const n = team.weekly.length;
  if (n !== history.throughWeek) throw Error(`Incomplete history for ${team.name}.`);
  const blocked = new Set([...(roster.reserve ?? []), ...(roster.taxi ?? []), ...excluded]);
  const weekly = feeds.map(({ week, rows, scheduled, matchups }) => {
    const candidates = [...new Set(roster.players)].flatMap((id) => {
      const player = players[id];
      const row = rows.get(id);
      const eligible = positionFor(id, players);
      const nflTeam = eligible.includes("DEF") ? id : row?.team ?? player?.team;
      const status = player?.injury_status?.toLowerCase();
      if (blocked.has(id) || !nflTeam || !scheduled.has(nflTeam) || ["ir", "pup", "nfi"].includes(status)
        || (week === start && ["out", "doubtful", "suspended"].includes(status))) return [];
      const projection = row?.stats ? scoreProjection(row.stats, league.scoring_settings) : null;
      return [{ name: player?.full_name || id, positions: eligible, points: projection ?? fallback[eligible[0]] ?? 3, estimated: projection === null }];
    });
    const lineup = bestProjectedLineup(slots, candidates);
    const ours = matchups.find((entry) => entry.roster_id === team.rosterId);
    const opponent = matchups.find((entry) => entry.matchup_id === ours?.matchup_id && entry.roster_id !== team.rosterId);
    if (!opponent || ours?.matchup_id == null) throw Error(`Missing schedule for ${team.name} in Week ${week}.`);
    return { week, total: lineup.reduce((sum, player) => sum + player.points, 0), lineup, opponent: opponent.roster_id };
  });
  const wins = team.weekly.filter((week) => week.actualResult === "W").length;
  const ties = team.weekly.filter((week) => week.actualResult === "T").length;
  const pointsAgainst = team.weekly.reduce((sum, week) => sum + (week.opponentActual ?? 0), 0);
  if (team.weekly.some((week) => week.opponentActual === undefined)) throw Error("Missing historical opponents.");
  const recent = [...team.weekly].sort((a, b) => b.week - a.week).slice(0, 3);
  const allPlay = allPlayRecords.get(team.rosterId);
  return {
    id: team.rosterId, team: metadata.get(team.rosterId) || team.name.trim(), record: `${wins}-${n - wins - ties}${ties ? `-${ties}` : ""}`,
    allPlayRecord: `${allPlay.wins}-${allPlay.losses}${allPlay.ties ? `-${allPlay.ties}` : ""}`, weekly,
    metrics: {
      record: (wins + ties / 2) / n,
      pointDifferential: (team.actualPoints - pointsAgainst) / n,
      allPlay: allPlay.rate,
      lineup: weekly[0].total,
      outlook: weekly.reduce((sum, week) => sum + week.total, 0) / weekly.length,
      momentum: recent.reduce((sum, week) => sum + week.actual, 0) / recent.length,
      efficiency: team.optimalPoints ? team.actualPoints / team.optimalPoints : 0,
      schedule: weekly.reduce((sum, week) => sum + allPlayRecords.get(week.opponent).rate, 0) / weekly.length,
    },
  };
});

const normalization = definitions.map((factor) => {
  const mean = entries.reduce((sum, team) => sum + team.metrics[factor.key], 0) / entries.length;
  const deviation = Math.sqrt(entries.reduce((sum, team) => sum + (team.metrics[factor.key] - mean) ** 2, 0) / entries.length);
  return { ...factor, mean, deviation };
});
for (const entry of entries) {
  entry.contributions = Object.fromEntries(normalization.map(({ key, mean, deviation, weight, reverse }) => [
    key, deviation ? 10 * weight * (entry.metrics[key] - mean) / deviation * (reverse ? -1 : 1) : 0,
  ]));
  entry.score = 100 + Object.values(entry.contributions).reduce((sum, points) => sum + points, 0);
}
entries.sort((a, b) => b.score - a.score || a.id - b.id);
const output = path.join(root, "output", "power-rankings");
await fs.mkdir(output, { recursive: true });
const report = { generated: new Date().toISOString(), throughWeek: history.throughWeek, enteringWeek: start, normalization, assumptions: [
  "Population z-scores, weighted exactly as published; score = 100 + 10 × weighted z-score.",
  "Healthy current active rosters; bye players excluded. Out/doubtful/suspended excluded next week; IR/PUP/NFI excluded throughout.",
  "Puka Nacua excluded for the remaining regular season in this Week 10 preview following the confirmed injury report.",
  "Missing projections use conservative position estimates, marked in each lineup. Returning players may still have outdated projections.",
  "Expected scoring averages raw best-lineup projections across all remaining regular-season weeks, including the upcoming week.",
  "Remaining schedule strength is opponents' season all-play win percentage; lower is better.",
], rankings: entries };
await fs.writeFile(path.join(output, `week-${start}-preview.json`), JSON.stringify(report, null, 2));
const table = ["| Rank | Team | Power score | Record | All-play | Next lineup | Remaining avg | Last 3 PPG |", "|---:|---|---:|---|---|---:|---:|---:|", ...entries.map((team, i) =>
  `| ${i + 1} | ${team.team} | ${team.score.toFixed(1)} | ${team.record} | ${team.allPlayRecord} | ${team.metrics.lineup.toFixed(2)} | ${team.metrics.outlook.toFixed(2)} | ${team.metrics.momentum.toFixed(2)} |`)].join("\n");
await fs.writeFile(path.join(output, `week-${start}-preview.md`), `# Week ${start} power rankings preview\n\nResults through Week ${history.throughWeek}.\n\n${table}\n\n${report.assumptions.map((line) => `- ${line}`).join("\n")}\n`);
console.log(table);
console.log("\nScore contributions (power-score points):");
for (const team of entries) console.log(`${team.team}: ${Object.entries(team.contributions).map(([key, value]) => `${key} ${value >= 0 ? "+" : ""}${value.toFixed(2)}`).join(", ")}`);
console.log(`\nEstimated starters: ${entries.flatMap((team) => team.weekly.flatMap((week) => week.lineup.filter((starter) => starter.estimated))).length}`);
console.log(`Reports: ${output}`);
