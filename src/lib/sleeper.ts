export const leagueId = process.env.SLEEPER_LEAGUE_ID ?? "1389131126982860800";
const api = "https://api.sleeper.app/v1";

export type League = {
  name?: string;
  season?: string;
  status?: string;
  total_rosters?: number;
  settings?: Record<string, number | string | null>;
  scoring_settings?: Record<string, number>;
  roster_positions?: string[];
};

export type LeagueUser = {
  user_id: string;
  username?: string;
  display_name?: string;
  avatar?: string;
  metadata?: { team_name?: string };
};

export type Roster = {
  roster_id: number;
  owner_id?: string;
  players?: string[] | null;
  starters?: string[] | null;
  settings?: {
    wins?: number;
    losses?: number;
    ties?: number;
    fpts?: number;
    fpts_decimal?: number;
    fpts_against?: number;
    fpts_against_decimal?: number;
  };
};

export type Matchup = {
  roster_id: number;
  matchup_id?: number | null;
  points?: number | null;
  custom_points?: number | null;
  starters?: string[];
  players?: string[];
};

export type Player = {
  player_id?: string;
  first_name?: string;
  last_name?: string;
  position?: string;
  team?: string;
};

export type Transaction = {
  type?: string;
  status?: string;
  created?: number;
  adds?: Record<string, number> | null;
  drops?: Record<string, number> | null;
  roster_ids?: number[];
  settings?: { waiver_bid?: number } | null;
};

export type NflState = {
  week?: number;
  display_week?: number;
  season?: string;
  season_type?: string;
};

async function get<T>(path: string, revalidate = 120): Promise<T | null> {
  try {
    const response = await fetch(`${api}${path}`, {
      next: { revalidate },
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function getLeagueData() {
  const [league, users, rosters, state] = await Promise.all([
    get<League>(`/league/${leagueId}`),
    get<LeagueUser[]>(`/league/${leagueId}/users`),
    get<Roster[]>(`/league/${leagueId}/rosters`),
    get<NflState>("/state/nfl"),
  ]);

  const week = state?.display_week ?? state?.week ?? null;
  const [matchups, transactions] = week
    ? await Promise.all([
        get<Matchup[]>(`/league/${leagueId}/matchups/${week}`),
        get<Transaction[]>(`/league/${leagueId}/transactions/${week}`),
      ])
    : [null, null];

  // Sleeper recommends refreshing its roughly 5 MB player map no more than daily.
  const players = league && rosters?.length
    ? await get<Record<string, Player>>("/players/nfl", 86_400)
    : null;

  return { league, users: users ?? [], rosters: rosters ?? [], state, week, matchups: matchups ?? [], transactions: transactions ?? [], players: players ?? {} };
}

export function managerName(roster: Roster, users: LeagueUser[]) {
  const user = users.find((entry) => entry.user_id === roster.owner_id);
  return user?.metadata?.team_name || user?.display_name || user?.username || `Team ${roster.roster_id}`;
}

export function playerName(id: string, players: Record<string, Player>) {
  if (!id) return "Unknown player";
  const player = players[id];
  if (!player) return id;
  return [player.first_name, player.last_name].filter(Boolean).join(" ") || id;
}

export function points(value?: number | null) {
  return typeof value === "number" ? value.toFixed(2) : "—";
}
