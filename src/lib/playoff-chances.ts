export type ProjectedStarter = {
  slot: string;
  player: string | null;
  points: number;
  estimated: boolean;
};

export type PlayoffTeam = {
  id: number;
  name: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
};

export type PlayoffSide = {
  teamId: number;
  mean: number;
  spread: number;
  lineup: ProjectedStarter[];
};

export type PlayoffGame = { id: string; week: number; sides: [PlayoffSide, PlayoffSide] };
export type PlayoffForecast = { throughWeek: number; spots: number; teams: PlayoffTeam[]; games: PlayoffGame[] };
export type ScenarioLocks = Record<string, number>;

type LineupCandidate = { name: string; positions: string[]; points: number; estimated: boolean };
type Assignment = { points: number; filled: number; previous?: Assignment; slot?: number; player?: LineupCandidate };

// Assign each player at most once. Keep the best assignment for each subset of filled slots.
export function bestProjectedLineup(slots: { label: string; positions: string[] }[], players: LineupCandidate[]) {
  let states: (Assignment | undefined)[] = Array(1 << slots.length);
  states[0] = { points: 0, filled: 0 };
  for (const player of players) {
    const next = states.slice();
    states.forEach((previous, mask) => {
      if (!previous) return;
      slots.forEach(({ positions }, slot) => {
        const bit = 1 << slot;
        if ((mask & bit) || !positions.some((position) => player.positions.includes(position))) return;
        const points = previous.points + player.points;
        const filledMask = mask | bit;
        if (!next[filledMask] || points > next[filledMask].points) {
          next[filledMask] = { points, filled: previous.filled + 1, previous, slot, player };
        }
      });
    });
    states = next;
  }
  let best = states.reduce<Assignment>((winner, candidate) => candidate && (
    candidate.filled > winner.filled || (candidate.filled === winner.filled && candidate.points > winner.points)
  ) ? candidate : winner, { points: 0, filled: 0 });
  const lineup: ProjectedStarter[] = slots.map(({ label }) => ({ slot: label, player: null, points: 0, estimated: false }));
  while (best.previous && best.slot !== undefined && best.player) {
    lineup[best.slot] = { slot: slots[best.slot].label, player: best.player.name, points: best.player.points, estimated: best.player.estimated };
    best = best.previous;
  }
  return lineup;
}

export const playoffTrials = 10_000;

function randomStream(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed + 0.5) / 4294967296;
  };
}

function normal(random: () => number) {
  return Math.sqrt(-2 * Math.log(random())) * Math.cos(2 * Math.PI * random());
}

// Draw a standard normal conditional on exceeding a cutoff. Use a tail sampler for upsets.
function above(cutoff: number, random: () => number) {
  if (cutoff <= 0) {
    let z: number;
    do { z = normal(random); } while (z < cutoff);
    return z;
  }
  const rate = (cutoff + Math.hypot(cutoff, 2)) / 2;
  for (;;) {
    const z = cutoff - Math.log(random()) / rate;
    if (Math.log(random()) <= -((z - rate) ** 2) / 2) return z;
  }
}

function drawScores([a, b]: PlayoffGame["sides"], lockedWinner: number | undefined, random: () => number): [number, number] {
  if (lockedWinner === undefined) {
    return [Math.round(100 * (a.mean + a.spread * normal(random))), Math.round(100 * (b.mean + b.spread * normal(random)))];
  }
  const direction = lockedWinner === a.teamId ? 1 : -1;
  const expectedDiff = a.mean - b.mean;
  const varA = a.spread ** 2;
  const varB = b.spread ** 2;
  const diffSpread = Math.sqrt(varA + varB);
  const difference = expectedDiff + direction * diffSpread * above((0.02 - direction * expectedDiff) / diffSpread, random);
  const scoreA = a.mean + varA / (varA + varB) * (difference - expectedDiff) + Math.sqrt(varA * varB / (varA + varB)) * normal(random);
  return [Math.round(100 * scoreA), Math.round(100 * (scoreA - difference))];
}

export function simulatePlayoffs(forecast: PlayoffForecast, locks: ScenarioLocks = {}) {
  const index = new Map(forecast.teams.map((team, i) => [team.id, i]));
  const games = forecast.games.map((game, i) => ({
    game, a: index.get(game.sides[0].teamId)!, b: index.get(game.sides[1].teamId)!, random: randomStream(0x78ca + 8191 * i),
  }));
  const tieRandom = randomStream(0xb781);
  const qualified = forecast.teams.map(() => 0);
  for (let trial = 0; trial < playoffTrials; trial++) {
    const table = forecast.teams.map((team, i) => ({
      i, record: 2 * team.wins + team.ties, games: team.wins + team.losses + team.ties,
      pf: Math.round(100 * team.pointsFor), pa: Math.round(100 * team.pointsAgainst), coin: tieRandom(),
    }));
    for (const { game, a, b, random } of games) {
      const [scoreA, scoreB] = drawScores(game.sides, locks[game.id], random);
      table[a].pf += scoreA;
      table[a].pa += scoreB;
      table[b].pf += scoreB;
      table[b].pa += scoreA;
      table[a].games++;
      table[b].games++;
      table[a].record += scoreA > scoreB ? 2 : scoreA === scoreB ? 1 : 0;
      table[b].record += scoreB > scoreA ? 2 : scoreB === scoreA ? 1 : 0;
    }
    table.sort((a, b) => b.record / (b.games || 1) - a.record / (a.games || 1) || b.pf - a.pf || b.pa - a.pa || b.coin - a.coin);
    for (let i = 0; i < forecast.spots; i++) qualified[table[i].i]++;
  }
  return Object.fromEntries(forecast.teams.map((team, i) => [team.id, qualified[i] / playoffTrials]));
}
