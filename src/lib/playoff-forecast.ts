import { cleanPlayerName, fetchJson, positionFor, scoreProjection, slotEligibility } from "@/lib/sleeper-helpers";
import { bestProjectedLineup, type PlayoffForecast, type PlayoffGame, type PlayoffTeam } from "@/lib/playoff-chances";
import { leagueId, managerName, type League, type LeagueUser, type Roster } from "@/lib/sleeper";
import { completedSleeperWeek } from "@/lib/season-progress";

const sleeper = "https://api.sleeper.app/v1";
type CurrentRoster = Roster & { reserve?: string[] | null; taxi?: string[] | null };
type Player = { first_name?: string; last_name?: string; position?: string; fantasy_positions?: string[]; team?: string; injury_status?: string };
type Matchup = { roster_id: number; matchup_id?: number | null; points?: number; custom_points?: number | null; players_points?: Record<string, number> };
type Projection = { player_id: string; team?: string; opponent?: string; company?: string; stats?: Record<string, unknown> };
const fallbackPoints: Record<string, number> = { QB: 12, RB: 4, WR: 4, TE: 3, K: 5, DEF: 4 };

function matchupPairs(rows: Matchup[] | null, teamIds: Set<number>) {
  const groups = new Map<number, Matchup[]>();
  const seen = new Set<number>();
  for (const row of rows ?? []) {
    if (row.matchup_id == null || !teamIds.has(row.roster_id) || seen.has(row.roster_id)) continue;
    seen.add(row.roster_id);
    groups.set(row.matchup_id, [...(groups.get(row.matchup_id) ?? []), row]);
  }
  if (seen.size !== teamIds.size || [...groups.values()].some((group) => group.length !== 2)) {
    throw new Error("Incomplete fantasy schedule");
  }
  return [...groups.entries()].sort(([a], [b]) => a - b).map(([id, pair]) => [id, pair as [Matchup, Matchup]] as const);
}

function actual(row: Matchup) {
  const points = row.custom_points ?? row.points;
  if (points == null || !Number.isFinite(points)) throw new Error("Missing completed score");
  return Math.round(points * 100) / 100;
}

export async function getPlayoffForecast(): Promise<PlayoffForecast> {
  const path = `${sleeper}/league/${leagueId}`;
  const [league, users, rosters, state, players] = await Promise.all([
    fetchJson<League>(path, 300), fetchJson<LeagueUser[]>(`${path}/users`, 300),
    fetchJson<CurrentRoster[]>(`${path}/rosters`, 120), fetchJson<{ week?: number }>(`${sleeper}/state/nfl`, 120),
    fetchJson<Record<string, Player>>(`${sleeper}/players/nfl`, 86_400),
  ]);
  if (!league?.season || !league.scoring_settings || !users || !rosters?.length || !players || !state?.week) throw new Error("Missing league data");
  const settings = league.settings ?? {};
  const start = Number(settings.start_week ?? 1);
  const playoffStart = Number(settings.playoff_week_start);
  const spots = Number(settings.playoff_teams);
  if (!Number.isInteger(playoffStart) || playoffStart <= start || !Number.isInteger(spots) || spots < 1 || spots > rosters.length
    || Number(settings.league_average_match ?? 0) || Number(settings.divisions ?? 0) || Number(settings.playoff_seed_type ?? 0)) {
    throw new Error("Unsupported playoff settings");
  }
  const throughWeek = Math.max(start - 1, Math.min(playoffStart - 1, completedSleeperWeek(league.season, state.week, settings.last_scored_leg)));
  const weeks = Array.from({ length: playoffStart - start }, (_, i) => start + i);
  const slots = (league.roster_positions ?? []).filter((slot) => !["BN", "IR", "TAXI", "RES", "REC"].includes(slot))
    .map((label) => ({ label, positions: slotEligibility(label) }));
  if (!slots.length || slots.length > 14) throw new Error("Unsupported lineup size");
  const positions = [...new Set(["QB", "RB", "WR", "TE", "K", "DEF", ...slots.flatMap((slot) => slot.positions)])];
  const scoring = league.scoring_settings;
  const [schedule, feeds] = await Promise.all([
    Promise.all(weeks.map((week) => fetchJson<Matchup[]>(`${path}/matchups/${week}`, week === throughWeek ? 0 : 600))),
    Promise.all(weeks.filter((week) => week > throughWeek).map(async (week) => [week, await Promise.all(positions.map((position) =>
      fetchJson<Projection[]>(`https://api.sleeper.com/projections/nfl/${league.season}/${week}?season_type=regular&position=${position}`, 3600),
    ))] as const)),
  ]);

  const teams: PlayoffTeam[] = rosters.map((roster) => ({ id: roster.roster_id, name: managerName(roster, users), wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 }));
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const ids = new Set(teamById.keys());
  const pairsByWeek = new Map(weeks.map((week, index) => [week, matchupPairs(schedule[index], ids)]));
  const teamHistory = new Map(teams.map((team) => [team.id, [] as number[]]));
  const playerHistory = new Map<string, { total: number; count: number }>();
  for (const [week, pairs] of pairsByWeek) {
    if (week > throughWeek) continue;
    for (const [, [a, b]] of pairs) {
      for (const [row, other] of [[a, b], [b, a]]) {
        const team = teamById.get(row.roster_id)!;
        const points = actual(row);
        const against = actual(other);
        team.pointsFor += points;
        team.pointsAgainst += against;
        if (points > against) team.wins++;
        else if (points < against) team.losses++;
        else team.ties++;
        teamHistory.get(team.id)!.push(points);
        for (const [id, scored] of Object.entries(row.players_points ?? {})) {
          if (!Number.isFinite(scored) || scored === 0) continue; // Zero in this feed can also mean the player didn't play.
          const previous = playerHistory.get(id) ?? { total: 0, count: 0 };
          playerHistory.set(id, { total: previous.total + scored, count: previous.count + 1 });
        }
      }
    }
  }

  const histories = new Map(teams.map(({ id }) => {
    const history = teamHistory.get(id)!;
    const n = history.length;
    const mean = n ? history.reduce((sum, points) => sum + points, 0) / n : 0;
    const squared = history.reduce((sum, points) => sum + (points - mean) ** 2, 0);
    return [id, { n, mean, squared }] as const;
  }));
  const pool = [...histories.values()].reduce((a, b) => ({ squared: a.squared + b.squared, df: a.df + Math.max(0, b.n - 1) }), { squared: 0, df: 0 });
  const poolVariance = pool.df ? pool.squared / pool.df : 22 ** 2;
  const games: PlayoffGame[] = [];
  for (const [week, pages] of feeds) {
    const rows = pages.flatMap((page) => page ?? []).filter((row) => !row.company || row.company === "rotowire");
    const projections = new Map(rows.map((row) => [row.player_id, row]));
    const scheduledTeams = new Set(rows.flatMap((row) => row.team && row.opponent ? [row.team, row.opponent] : []));
    // Only infer byes when the feed covers a plausible full NFL slate.
    if (pages.some((page) => page === null) || scheduledTeams.size < 20) throw new Error("Incomplete NFL projection schedule");
    const sides = new Map(rosters.map((roster) => {
      const excluded = new Set([...(roster.reserve ?? []), ...(roster.taxi ?? [])]);
      const candidates = [...new Set(roster.players ?? [])].flatMap((id) => {
        const player = players[id];
        const row = projections.get(id);
        const eligible = positionFor(id, players);
        const nflTeam = eligible.includes("DEF") ? id : row?.team ?? player?.team;
        const injury = player?.injury_status?.toLowerCase();
        if (!eligible.length || excluded.has(id) || !nflTeam || !scheduledTeams.has(nflTeam)
          || ["ir", "pup", "nfi"].includes(injury ?? "")
          || (week === throughWeek + 1 && ["out", "doubtful", "suspended"].includes(injury ?? ""))) return [];
        const projected = row?.stats ? scoreProjection(row.stats, scoring) : null;
        const history = playerHistory.get(id);
        const fallback = fallbackPoints[eligible[0]] ?? 3;
        const points = projected ?? (history ? (history.total + fallback * 2) / (history.count + 2) : fallback);
        return [{ name: cleanPlayerName(id, players), positions: eligible, points, estimated: projected === null }];
      });
      const lineup = bestProjectedLineup(slots, candidates);
      const projection = lineup.reduce((sum, starter) => sum + starter.points, 0);
      const history = histories.get(roster.roster_id)!;
      const filled = lineup.filter((starter) => starter.player !== null).length;
      const weight = history.n ? 0.2 : 0;
      const mean = (1 - weight) * projection + weight * history.mean * filled / slots.length;
      const spread = Math.max(12, Math.sqrt((history.squared + 5 * poolVariance) / (Math.max(0, history.n - 1) + 5)));
      return [roster.roster_id, { teamId: roster.roster_id, mean, spread, lineup }] as const;
    }));
    for (const [id, [a, b]] of pairsByWeek.get(week)!) {
      games.push({ id: `${week}-${id}`, week, sides: [sides.get(a.roster_id)!, sides.get(b.roster_id)!] });
    }
  }
  return { throughWeek, spots, teams, games };
}
