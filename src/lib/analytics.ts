import { leagueId } from "@/lib/sleeper";

const sleeperApi = "https://api.sleeper.app/v1";
const sleeperDataApi = "https://api.sleeper.com";

type User = { user_id: string; display_name?: string; username?: string; metadata?: { team_name?: string } };
type Player = { first_name?: string; last_name?: string; position?: string; fantasy_positions?: string[] };
type Roster = { roster_id: number; owner_id?: string };
type League = { name?: string; season?: string; season_type?: string; scoring_settings?: Record<string, number>; roster_positions?: string[] };
type NflState = { week?: number; display_week?: number; season?: string; league_season?: string; season_type?: string };
type Matchup = {
  roster_id: number;
  matchup_id?: number | null;
  points?: number | null;
  custom_points?: number | null;
  players?: string[];
  starters?: string[];
  players_points?: Record<string, number>;
};
type Transaction = {
  type?: string;
  status?: string;
  created?: number;
  leg?: number;
  transaction_id?: string;
  roster_ids?: number[];
  adds?: Record<string, number> | null;
  drops?: Record<string, number> | null;
  draft_picks?: Array<{ season?: string; round?: number; owner_id?: number }>;
};
type PlayerFeedRow = {
  player_id: string;
  date?: string;
  company?: string;
  player?: Player;
  stats?: Record<string, unknown>;
};

// Manager-supplied team totals fill weeks where Sleeper's projection feed is incomplete.
const manualTeamProjections: Array<{ teamAliases: string[]; weeks: Record<number, number> }> = [
  { teamAliases: ["dartvader"], weeks: { 4: 98.2, 5: 102.78 } },
  { teamAliases: ["brandonaubreysinclair"], weeks: { 4: 122.01 } },
  { teamAliases: ["bride"], weeks: { 4: 108.87 } },
  { teamAliases: ["jacobs"], weeks: { 3: 111.75 } },
];

function manualProjectionFor(team: string, week: number): number | null {
  const normalizedName = team.toLowerCase().replace(/[^a-z0-9]/g, "");
  const override = manualTeamProjections.find(({ teamAliases }) =>
    teamAliases.some((alias) => normalizedName === alias || normalizedName.startsWith(alias)),
  );
  return override?.weeks[week] ?? null;
}

export type WeeklyTeamAnalytics = {
  week: number;
  actual: number;
  projected: number | null;
  optimal: number;
  opponent?: string;
  opponentActual?: number;
  opponentOptimal?: number;
  actualResult?: "W" | "L" | "T";
  optimalResult?: "W" | "L" | "T";
};

export type TeamAnalytics = {
  rosterId: number;
  name: string;
  actualPoints: number;
  projectedPoints: number;
  projectionActualPoints: number;
  overUnder: number;
  projectionWeeks: number;
  optimalPoints: number;
  pointsLeft: number;
  optimalWins: number;
  optimalLosses: number;
  optimalTies: number;
  weekly: WeeklyTeamAnalytics[];
};

export type TradePlayerImpact = {
  playerId: string;
  name: string;
  position: string;
  points: number;
  games: number | null;
  completedWeeks: number;
  ppg: number | null;
};

export type TradeSideImpact = {
  rosterId: number;
  team: string;
  players: TradePlayerImpact[];
  picks: string[];
};

export type TradeAnalytics = {
  id: string;
  week: number;
  date: string;
  sides: TradeSideImpact[];
};

export type LeagueAnalytics = {
  league: string;
  season: string;
  throughWeek: number;
  teams: TeamAnalytics[];
  trades: TradeAnalytics[];
  note: string;
};

async function fetchJson<T>(url: string, revalidate: number): Promise<T | null> {
  try {
    const response = await fetch(url, {
      next: { revalidate },
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function userForRoster(rosterId: number, rosters: Roster[], users: User[]) {
  const roster = rosters.find((entry) => entry.roster_id === rosterId);
  return users.find((entry) => entry.user_id === roster?.owner_id);
}

function teamName(rosterId: number, rosters: Roster[], users: User[]) {
  const user = userForRoster(rosterId, rosters, users);
  return user?.metadata?.team_name || user?.display_name || user?.username || `Team ${rosterId}`;
}

function matchupResult(score: number, opponentScore: number): "W" | "L" | "T" {
  if (Math.abs(score - opponentScore) < 0.001) return "T";
  return score > opponentScore ? "W" : "L";
}

function cleanPlayerName(id: string, players: Record<string, Player>) {
  const player = players[id];
  return player ? [player.first_name, player.last_name].filter(Boolean).join(" ") || id : id;
}

function scoreProjection(stats: Record<string, unknown>, scoring: Record<string, number>) {
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

function slotEligibility(slot: string): string[] {
  if (["FLEX", "REC_FLEX", "WRRB_FLEX", "RB_WR_TE"].includes(slot)) return ["RB", "WR", "TE"];
  if (["SUPER_FLEX", "QB_FLEX", "QB_RB_WR_TE"].includes(slot)) return ["QB", "RB", "WR", "TE"];
  if (slot === "IDP_FLEX") return ["DL", "LB", "DB"];
  if (slot === "DL_FLEX") return ["DL", "DE", "DT"];
  if (slot === "DB_FLEX") return ["DB", "CB", "S"];
  if (slot === "LB_FLEX") return ["LB"];
  return [slot];
}

function positionFor(id: string, players: Record<string, Player>) {
  if (["ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN", "DET", "GB", "HOU", "IND", "JAX", "KC", "LAC", "LAR", "LV", "MIA", "MIN", "NE", "NO", "NYG", "NYJ", "PHI", "PIT", "SEA", "SF", "TB", "TEN", "WAS"].includes(id)) return ["DEF"];
  const player = players[id];
  return player?.fantasy_positions?.length ? player.fantasy_positions : player?.position ? [player.position] : [];
}

function optimalLineupPoints(matchup: Matchup, positions: string[], players: Record<string, Player>) {
  const eligiblePlayers = (matchup.players ?? Object.keys(matchup.players_points ?? {})).map((id) => ({
    id,
    positions: positionFor(id, players),
    points: Number(matchup.players_points?.[id] ?? 0),
  }));
  const starterSlots = positions.filter((slot) => !["BN", "IR", "TAXI", "RES", "REC"].includes(slot));
  const flexSlots = starterSlots.filter((slot) => slot.includes("FLEX"));
  const fixedSlots = starterSlots.filter((slot) => !slot.includes("FLEX"));
  let best = Number.NEGATIVE_INFINITY;

  function scoreFixed(reserved: Set<string>) {
    let total = 0;
    const counts = new Map<string, number>();
    for (const slot of fixedSlots) counts.set(slot, (counts.get(slot) ?? 0) + 1);
    for (const [slot, count] of counts) {
      const candidates = eligiblePlayers
        .filter((player) => !reserved.has(player.id) && slotEligibility(slot).some((position) => player.positions.includes(position)))
        .sort((a, b) => b.points - a.points)
        .slice(0, count);
      if (candidates.length < count) return Number.NEGATIVE_INFINITY;
      total += candidates.reduce((sum, player) => sum + player.points, 0);
      for (const candidate of candidates) reserved.add(candidate.id);
    }
    return total;
  }

  function assignFlex(slotIndex: number, chosen: Set<string>, flexPoints: number) {
    if (slotIndex >= flexSlots.length) {
      const fixed = scoreFixed(new Set(chosen));
      if (Number.isFinite(fixed)) best = Math.max(best, fixed + flexPoints);
      return;
    }
    const eligible = slotEligibility(flexSlots[slotIndex]);
    for (const player of eligiblePlayers) {
      if (chosen.has(player.id) || !eligible.some((position) => player.positions.includes(position))) continue;
      chosen.add(player.id);
      assignFlex(slotIndex + 1, chosen, flexPoints + player.points);
      chosen.delete(player.id);
    }
  }

  assignFlex(0, new Set(), 0);
  if (!Number.isFinite(best)) return Number(matchup.custom_points ?? matchup.points ?? 0);
  return best;
}

function gameCountFor(row: PlayerFeedRow | undefined) {
  if (!row?.stats) return null;
  const games = Number(row.stats.gp ?? row.stats.gms_active);
  return Number.isFinite(games) ? games : null;
}

function buildTradeAnalytics(
  transactions: Transaction[],
  matchupsByWeek: Map<number, Matchup[]>,
  gamesByWeek: Map<number, Map<string, PlayerFeedRow>>,
  rosters: Roster[],
  users: User[],
  players: Record<string, Player>,
  completedWeek: number,
): TradeAnalytics[] {
  const chronological = transactions
    .filter((transaction) => transaction.type === "trade" && transaction.status === "complete")
    .sort((a, b) => (a.created ?? 0) - (b.created ?? 0));

  return chronological.map((trade) => {
    const tradeWeek = Number(trade.leg ?? 0);
    const tradeDate = trade.created ? new Date(trade.created).toISOString().slice(0, 10) : null;
    const sides = (trade.roster_ids ?? []).map((rosterId): TradeSideImpact => {
      const incoming = Object.entries(trade.adds ?? {}).filter(([, destination]) => Number(destination) === rosterId);
      const nextMoveWeek = (playerId: string) => {
        const next = chronological.find((candidate) => (candidate.created ?? 0) > (trade.created ?? 0)
          && Number(candidate.drops?.[playerId]) === rosterId);
        return next ? Number(next.leg ?? completedWeek + 1) - 1 : completedWeek;
      };

      const playersForSide = incoming.map(([playerId]): TradePlayerImpact => {
        const lastWeek = Math.min(completedWeek, nextMoveWeek(playerId));
        let completedWeeks = 0;
        let totalPoints = 0;
        let games = 0;
        let hasGameData = false;
        for (let week = tradeWeek; week <= lastWeek; week += 1) {
          const gameRow = gamesByWeek.get(week)?.get(playerId);
          if (week === tradeWeek && tradeDate && gameRow?.date && gameRow.date < tradeDate) continue;
          completedWeeks += 1;
          const matchup = matchupsByWeek.get(week)?.find((entry) => entry.roster_id === rosterId);
          const score = matchup?.players_points?.[playerId];
          if (typeof score === "number") totalPoints += score;
          const gameCount = gameCountFor(gamesByWeek.get(week)?.get(playerId));
          if (gameCount !== null) {
            games += gameCount;
            hasGameData = true;
          }
        }
        return {
          playerId,
          name: cleanPlayerName(playerId, players),
          position: positionFor(playerId, players)[0] ?? "—",
          points: totalPoints,
          games: hasGameData ? games : completedWeeks > 0 ? null : 0,
          completedWeeks,
          ppg: hasGameData && games > 0 ? totalPoints / games : null,
        };
      });

      const picks = (trade.draft_picks ?? [])
        .filter((pick) => Number(pick.owner_id) === rosterId)
        .map((pick) => `${pick.season ?? "Future"}, round ${pick.round ?? "—"}`);

      return { rosterId, team: teamName(rosterId, rosters, users), players: playersForSide, picks };
    });

    const timestamp = trade.created ? new Date(trade.created).toISOString() : null;
    return {
      id: trade.transaction_id ?? `${tradeWeek}-${trade.created ?? "trade"}`,
      week: tradeWeek,
      date: timestamp ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(timestamp)) : "—",
      sides,
    };
  }).reverse();
}

export async function getLeagueAnalytics(): Promise<LeagueAnalytics> {
  const [league, users, rosters, state, players] = await Promise.all([
    fetchJson<League>(`${sleeperApi}/league/${leagueId}`, 900),
    fetchJson<User[]>(`${sleeperApi}/league/${leagueId}/users`, 900),
    fetchJson<Roster[]>(`${sleeperApi}/league/${leagueId}/rosters`, 900),
    fetchJson<NflState>(`${sleeperApi}/state/nfl`, 900),
    fetchJson<Record<string, Player>>(`${sleeperApi}/players/nfl`, 86_400),
  ]);
  if (!league || !users || !rosters || !state || !players) throw new Error("Sleeper league data is unavailable.");

  const season = league.season ?? state.league_season ?? state.season ?? "2026";
  const seasonType = league.season_type ?? state.season_type ?? "regular";
  const currentWeek = Math.max(1, Number(state.display_week ?? state.week ?? 1));
  const completedWeek = Math.min(18, currentWeek - 1);
  const weeks = Array.from({ length: completedWeek }, (_, index) => index + 1);
  const positions = [...new Set((league.roster_positions ?? [])
    .filter((position) => !["BN", "IR", "TAXI", "RES"].includes(position) && !position.includes("FLEX")))];
  const projectionPositions = [...new Set([...positions, "QB", "RB", "WR", "TE", "K", "DEF"])]
    .filter((position) => ["QB", "RB", "WR", "TE", "K", "DEF", "DL", "LB", "DB", "CB", "S", "DE", "DT"].includes(position));

  const [weeklyMatchups, weeklyTransactions, weeklyFeeds] = await Promise.all([
    Promise.all(weeks.map(async (week) => [week, await fetchJson<Matchup[]>(`${sleeperApi}/league/${leagueId}/matchups/${week}`, 1800)] as const)),
    Promise.all(Array.from({ length: currentWeek }, async (_, index) => fetchJson<Transaction[]>(`${sleeperApi}/league/${leagueId}/transactions/${index + 1}`, 1800))),
    Promise.all(weeks.map(async (week) => {
      const [projectionPages, stats] = await Promise.all([
        Promise.all(projectionPositions.map((position) => fetchJson<PlayerFeedRow[]>(`${sleeperDataApi}/projections/nfl/${season}/${week}?season_type=${seasonType}&position=${position}`, 86_400))),
        fetchJson<PlayerFeedRow[]>(`${sleeperDataApi}/stats/nfl/${season}/${week}?season_type=${seasonType}`, 86_400),
      ]);
      return [week, projectionPages.flatMap((page) => page ?? []), stats ?? []] as const;
    })),
  ]);

  const matchupsByWeek = new Map<number, Matchup[]>(weeklyMatchups.map(([week, result]) => [week, result ?? []]));
  const transactions = weeklyTransactions.flatMap((result) => result ?? []);
  const projectionsByWeek = new Map<number, Map<string, PlayerFeedRow>>();
  const gamesByWeek = new Map<number, Map<string, PlayerFeedRow>>();
  for (const [week, projectionRows, statRows] of weeklyFeeds) {
    const projections = new Map<string, PlayerFeedRow>();
    for (const row of projectionRows) {
      if (row.company && row.company !== "rotowire") continue;
      if (row.player_id && row.stats) projections.set(row.player_id, row);
    }
    const stats = new Map<string, PlayerFeedRow>();
    for (const row of statRows) if (row.player_id) stats.set(row.player_id, row);
    projectionsByWeek.set(week, projections);
    gamesByWeek.set(week, stats);
  }

  const scoring = league.scoring_settings ?? {};
  const teamStats = rosters.map((roster) => {
    const owner = userForRoster(roster.roster_id, rosters, users);
    return {
      rosterId: roster.roster_id,
      name: teamName(roster.roster_id, rosters, users),
      actualPoints: 0,
      projectedPoints: 0,
      projectionActualPoints: 0,
      overUnder: 0,
      projectionWeeks: 0,
      optimalPoints: 0,
      pointsLeft: 0,
      optimalWins: 0,
      optimalLosses: 0,
      optimalTies: 0,
      weekly: [] as WeeklyTeamAnalytics[],
    };
  });

  for (const team of teamStats) {
    for (const week of weeks) {
      const matchup = matchupsByWeek.get(week)?.find((entry) => entry.roster_id === team.rosterId);
      if (!matchup) continue;
      const actual = Number(matchup.custom_points ?? matchup.points ?? 0);
      const projectionMap = projectionsByWeek.get(week);
      const starterIds = matchup.starters ?? [];
      const projectedScores = starterIds.map((id) => {
        const row = projectionMap?.get(id);
        return row?.stats ? scoreProjection(row.stats, scoring) : null;
      });
      const allProjected = projectedScores.length > 0 && projectedScores.every((score) => score !== null);
      const generatedProjection = allProjected ? projectedScores.reduce<number>((sum, score) => sum + (score ?? 0), 0) : null;
      const projected = manualProjectionFor(team.name, week) ?? generatedProjection;
      const optimal = optimalLineupPoints(matchup, league.roster_positions ?? [], players);
      team.weekly.push({ week, actual, projected, optimal });
      team.actualPoints += actual;
      team.optimalPoints += optimal;
      team.pointsLeft += Math.max(0, optimal - actual);
      if (projected !== null) {
        team.projectedPoints += projected;
        team.projectionActualPoints += actual;
        team.overUnder += actual - projected;
        team.projectionWeeks += 1;
      }
    }
  }

  for (const week of weeks) {
    const entries = matchupsByWeek.get(week) ?? [];
    const grouped = new Map<number, Matchup[]>();
    for (const entry of entries) {
      if (entry.matchup_id == null) continue;
      grouped.set(entry.matchup_id, [...(grouped.get(entry.matchup_id) ?? []), entry]);
    }
    for (const pair of grouped.values()) {
      if (pair.length < 2) continue;
      const first = teamStats.find((team) => team.rosterId === pair[0].roster_id);
      const second = teamStats.find((team) => team.rosterId === pair[1].roster_id);
      const firstOptimal = first?.weekly.find((entry) => entry.week === week)?.optimal;
      const secondOptimal = second?.weekly.find((entry) => entry.week === week)?.optimal;
      if (!first || !second || firstOptimal === undefined || secondOptimal === undefined) continue;
      const firstWeek = first.weekly.find((entry) => entry.week === week);
      const secondWeek = second.weekly.find((entry) => entry.week === week);
      if (!firstWeek || !secondWeek) continue;
      firstWeek.opponent = second.name;
      firstWeek.opponentActual = secondWeek.actual;
      firstWeek.opponentOptimal = secondOptimal;
      firstWeek.actualResult = matchupResult(firstWeek.actual, secondWeek.actual);
      firstWeek.optimalResult = matchupResult(firstOptimal, secondOptimal);
      secondWeek.opponent = first.name;
      secondWeek.opponentActual = firstWeek.actual;
      secondWeek.opponentOptimal = firstOptimal;
      secondWeek.actualResult = matchupResult(secondWeek.actual, firstWeek.actual);
      secondWeek.optimalResult = matchupResult(secondOptimal, firstOptimal);
      if (Math.abs(firstOptimal - secondOptimal) < 0.001) {
        first.optimalTies += 1;
        second.optimalTies += 1;
      } else if (firstOptimal > secondOptimal) {
        first.optimalWins += 1;
        second.optimalLosses += 1;
      } else {
        second.optimalWins += 1;
        first.optimalLosses += 1;
      }
    }
  }

  const trades = buildTradeAnalytics(transactions, matchupsByWeek, gamesByWeek, rosters, users, players, completedWeek);
  return {
    league: league.name ?? "UCDegens",
    season,
    throughWeek: completedWeek,
    teams: teamStats,
    trades,
    note: "Weekly player projections are scored with this league’s settings, with manager-supplied team totals used where provided. Actual points and lineup scores come from Sleeper matchups.",
  };
}
