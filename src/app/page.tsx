"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { powerRankings } from "@/lib/power-rankings";
import type { LeagueAnalytics, TeamAnalytics, TradeAnalytics } from "@/lib/analytics";

type RankingWeek = 4 | 5;
type TabId = "rankings" | "optimal" | "projections" | "trades" | "averages";

const tabs: { id: TabId; label: string }[] = [
  { id: "rankings", label: "Power rankings" },
  { id: "optimal", label: "Perfect lineup" },
  { id: "projections", label: "Projections" },
  { id: "trades", label: "Trades" },
  { id: "averages", label: "Averages" },
];
const colors = ["#e4f222", "#a8b0b8", "#7bc5b5", "#b9a2dd", "#d39d76", "#74a9d4", "#cc8391", "#8fb56b", "#d3c776", "#81a4a2", "#a48e8a", "#888bce"];

function movementFor(team: string, rank: number) {
  const previousRank = powerRankings[4].findIndex((entry) => entry.team === team) + 1;
  if (previousRank < 1) return null;
  const change = previousRank - rank;
  if (change === 0) return { text: "—", className: "movement-even", label: "No change from Week 4" };
  return change > 0
    ? { text: `↑ ${change}`, className: "movement-up", label: `Up ${change} from Week 4` }
    : { text: `↓ ${Math.abs(change)}`, className: "movement-down", label: `Down ${Math.abs(change)} from Week 4` };
}

function fixed(value: number, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

function signed(value: number) {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${fixed(Math.abs(value))}`;
}

function normalizedTeamName(name: string) {
  return name.toLowerCase().replace(/^team\s*/, "").replace(/[^a-z0-9]/g, "");
}

function sleeperHandleForRankingTeam(name: string, teams: TeamAnalytics[]) {
  const key = normalizedTeamName(name);
  return teams.find((team) => [team.name, ...team.aliases].some((alias) => normalizedTeamName(alias) === key))?.sleeperUsername ?? null;
}

function RankingsView({ teams }: { teams: TeamAnalytics[] }) {
  const [week, setWeek] = useState<RankingWeek>(5);
  const rankings = powerRankings[week];
  const weekFour = powerRankings[4];
  const weekFiveRanks = new Map(powerRankings[5].map(({ team }, index) => [team, index + 1]));
  const width = 360;
  const height = 284;
  const x1 = 74;
  const x2 = 286;
  const top = 26;
  const step = 19.2;
  const rankY = (rank: number) => top + (rank - 1) * step;

  return (
    <>
      <section className="analytics-section ranking-trend-section" aria-labelledby="rank-trend-title">
        <div className="section-heading">
          <div><span className="section-kicker">WEEK OVER WEEK</span><h2 id="rank-trend-title">Ranking movement</h2></div>
          <span className="section-meta">W4 → W5</span>
        </div>
        <p className="section-description">Each line follows one team. Rank 1 is at the top.</p>
        <div className="rank-chart-wrap" style={{ position: "relative" }}>
          <svg className="rank-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Slope chart comparing every team’s Week 4 and Week 5 power ranking">
            {Array.from({ length: 12 }, (_, index) => index + 1).map((rank) => <g className={rank % 2 === 1 || rank === 12 ? "rank-chart-grid rank-chart-grid-labeled" : "rank-chart-grid"} key={rank}><text x="16" y={rankY(rank) + 4}>{rank % 2 === 1 || rank === 12 ? String(rank).padStart(2, "0") : ""}</text><line x1="42" y1={rankY(rank)} x2="328" y2={rankY(rank)} /></g>)}
            {weekFour.map(({ team }, index) => {
              const nextRank = weekFiveRanks.get(team) ?? index + 1;
              const color = colors[index];
              return <g key={team} className="rank-chart-series"><title>{`${team}: Week 4 rank ${index + 1}, Week 5 rank ${nextRank}`}</title><line x1={x1} y1={rankY(index + 1)} x2={x2} y2={rankY(nextRank)} stroke={color} /></g>;
            })}
            <text className="chart-week-label" x={x1} y={height - 6} textAnchor="middle">WEEK 4</text>
            <text className="chart-week-label" x={x2} y={height - 6} textAnchor="middle">WEEK 5</text>
          </svg>
          <div className="rank-chart-handles" aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            {weekFour.map(({ team }, index) => {
              const nextRank = weekFiveRanks.get(team) ?? index + 1;
              const handle = sleeperHandleForRankingTeam(team, teams);
              return [
                { key: "week4", x: x1, y: rankY(index + 1) },
                { key: "week5", x: x2, y: rankY(nextRank) },
              ].map(({ key, x, y }) => <span className={`rank-chart-avatar-position rank-chart-handle-position-${key}`} key={`${team}-${key}`} style={{ position: "absolute", left: `${x / width * 100}%`, top: `${y / height * 100}%` }}>
                <span className="rank-chart-handle" style={{ "--handle-color": colors[index] } as CSSProperties}>{handle ? `@${handle.replace(/^@/, "")}` : team}</span>
              </span>);
            })}
          </div>
        </div>
        <div className="rank-chart-key" aria-label="Power ranking movement by team">
          {weekFour.map(({ team }, index) => {
            const currentRank = weekFiveRanks.get(team) ?? index + 1;
            const move = movementFor(team, currentRank);
            const handle = sleeperHandleForRankingTeam(team, teams);
            return <div className="rank-key-row" key={team}><span className="rank-key-line" style={{ backgroundColor: colors[index] }} /><span className="rank-key-name"><strong>{team}</strong>{handle && <small>@{handle.replace(/^@/, "")}</small>}</span><span className="rank-key-change">{index + 1} → {currentRank}</span><span className={`rank-key-delta ${move?.className ?? ""}`}>{move?.text}</span></div>;
          })}
        </div>
      </section>

      <section className="analytics-section latest-rankings-section" aria-labelledby="rankings-title">
        <div className="section-heading rankings-section-heading">
          <div><span className="section-kicker">2026 · UCDEGENS</span><h2 id="rankings-title">Power rankings</h2></div>
          <label className="week-picker"><span>WEEK</span><select aria-label="Choose rankings week" value={week} onChange={(event) => setWeek(Number(event.target.value) as RankingWeek)}><option value={5}>Week 5</option><option value={4}>Week 4</option></select></label>
        </div>
        <ol className="rankings-list" aria-label={`Week ${week} power rankings`}>
          {rankings.map(({ team, note }, index) => {
            const movement = week === 5 ? movementFor(team, index + 1) : null;
            return <li className="ranking-row" key={team}><div className="ranking-row-heading"><span className={`rank-number${index === 0 ? " rank-number-first" : ""}`}>{String(index + 1).padStart(2, "0")}</span><h3>{team}</h3>{movement && <span className={`rank-movement ${movement.className}`} aria-label={movement.label}>{movement.text}</span>}</div><p>{note}</p></li>;
          })}
        </ol>
      </section>
    </>
  );
}

function OptimalStandings({ teams, throughWeek }: { teams: TeamAnalytics[]; throughWeek: number }) {
  const [expandedRoster, setExpandedRoster] = useState<number | null>(null);
  const sorted = [...teams].sort((a, b) => b.optimalWins - a.optimalWins || b.optimalTies - a.optimalTies || b.optimalPoints - a.optimalPoints);
  return (
    <section className="analytics-section" aria-labelledby="optimal-title">
      <div className="section-heading"><div><span className="section-kicker">WEEKS 1–{throughWeek || 0}</span><h2 id="optimal-title">Perfect lineup standings</h2></div><span className="section-meta">{teams.length} teams</span></div>
      <p className="section-description">Each week uses the highest-scoring legal lineup from the players on that team’s roster. The record compares those optimal scores head to head.</p>
      {!throughWeek ? <div className="empty-analytics">Completed matchups will appear here after Week 1.</div> : <ol className="optimal-list">{sorted.map((team, index) => {
        const expanded = expandedRoster === team.rosterId;
        const gamesId = `optimal-games-${team.rosterId}`;
        return <li className={`optimal-row${expanded ? " expanded" : ""}`} key={team.rosterId}>
          <button className="optimal-toggle" type="button" aria-expanded={expanded} aria-label={`${expanded ? "Hide" : "Show"} weekly games for ${team.name}`} onClick={() => setExpandedRoster(expanded ? null : team.rosterId)}>
            <span className="optimal-main"><span className={`rank-number${index === 0 ? " rank-number-first" : ""}`}>{String(index + 1).padStart(2, "0")}</span><strong>{team.name}</strong><span className="optimal-record">{team.optimalWins}-{team.optimalLosses}{team.optimalTies ? `-${team.optimalTies}` : ""}</span></span>
            <span className="optimal-metrics"><span><span>OPTIMAL PF</span><strong>{fixed(team.optimalPoints)}</strong></span><span><span>ACTUAL PF</span><strong>{fixed(team.actualPoints)}</strong></span><span><span>LEFT ON BENCH</span><strong>{fixed(team.pointsLeft)}</strong></span></span>
            <span className="optimal-expand-label">{expanded ? "HIDE GAMES" : "VIEW GAMES"}</span>
          </button>
          {expanded && <div className="optimal-game-list" id={gamesId} aria-label={`Weekly game results for ${team.name}`}>
            {team.weekly.map((game) => <article className="optimal-game" key={game.week}>
              <div className="optimal-game-heading"><span>WEEK {game.week}</span><strong>{game.opponent ? `vs ${game.opponent}` : "Opponent unavailable"}</strong></div>
              {game.opponent && game.opponentActual !== undefined && game.opponentOptimal !== undefined ? <>
                <div className="optimal-score-hint"><span>{team.name}</span><span>{game.opponent}</span></div>
                <div className="optimal-scoreline"><span>ACTUAL</span><strong>{fixed(game.actual)} <i>–</i> {fixed(game.opponentActual)}</strong><b className={`result-${game.actualResult?.toLowerCase() ?? "none"}`}>{game.actualResult ?? "—"}</b></div>
                <div className="optimal-scoreline"><span>BEST LINEUP</span><strong>{fixed(game.optimal)} <i>–</i> {fixed(game.opponentOptimal)}</strong><b className={`result-${game.optimalResult?.toLowerCase() ?? "none"}`}>{game.optimalResult ?? "—"}</b></div>
              </> : <p className="optimal-game-unavailable">Sleeper matchup details are unavailable for this week.</p>}
            </article>)}
          </div>}
        </li>;
      })}</ol>}
    </section>
  );
}

function ProjectionChart({ teams, throughWeek }: { teams: TeamAnalytics[]; throughWeek: number }) {
  const sorted = useMemo(() => [...teams].sort((a, b) => b.overUnder - a.overUnder), [teams]);
  const [selectedRoster, setSelectedRoster] = useState<number | null>(null);
  const selectedTeam = sorted.find((team) => team.rosterId === selectedRoster) ?? sorted[0];
  const weekly = selectedTeam?.weekly.filter((entry) => entry.projected !== null) ?? [];
  const chartWidth = 360;
  const chartHeight = 186;
  const left = 34;
  const right = 342;
  const top = 17;
  const bottom = 147;
  const highest = Math.max(10, ...weekly.flatMap((entry) => [entry.actual, entry.projected ?? 0]));
  const maxValue = Math.ceil(highest / 20) * 20;
  const x = (index: number) => weekly.length <= 1 ? (left + right) / 2 : left + index * (right - left) / (weekly.length - 1);
  const y = (value: number) => bottom - (value / maxValue) * (bottom - top);
  const points = (key: "actual" | "projected") => weekly.map((entry, index) => `${x(index)},${y(key === "projected" ? entry.projected ?? 0 : entry.actual)}`).join(" ");
  const actualForComparedWeeks = selectedTeam?.projectionActualPoints ?? 0;
  const deltaMax = Math.max(1, ...sorted.map((team) => Math.abs(team.overUnder)));

  return (
    <section className="analytics-section" aria-labelledby="projection-title">
      <div className="section-heading"><div><span className="section-kicker">COMPLETED WEEKS · 1–{throughWeek || 0}</span><h2 id="projection-title">Projection vs actual</h2></div></div>
      <p className="section-description">Team scoring projections are rebuilt with this league’s scoring settings. The graph compares weekly starters against their Rotowire projection.</p>
      {throughWeek === 0 ? <div className="empty-analytics">Projection history will appear after Week 1.</div> : <>
        <div className="projection-focus">
          <label className="team-picker"><span>TEAM TREND</span><select aria-label="Choose team projection trend" value={selectedTeam?.rosterId ?? ""} onChange={(event) => setSelectedRoster(Number(event.target.value))}>{sorted.map((team) => <option key={team.rosterId} value={team.rosterId}>{team.name}</option>)}</select></label>
          <div className="projection-legend"><span><i className="legend-dot actual-dot" />Actual</span><span><i className="legend-dot projected-dot" />Projected</span></div>
        </div>
        {weekly.length ? <div className="performance-chart-wrap"><svg className="performance-chart" viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label={`${selectedTeam?.name} actual points versus projected points by week`}>
          {[0, maxValue / 2, maxValue].map((value) => <g key={value}><line x1={left} x2={right} y1={y(value)} y2={y(value)} /><text x={left - 7} y={y(value) + 4} textAnchor="end">{Math.round(value)}</text></g>)}
          <polyline points={points("projected")} className="projection-line" />
          <polyline points={points("actual")} className="actual-line" />
          {weekly.map((entry, index) => <g key={entry.week}><circle className="projection-point" cx={x(index)} cy={y(entry.projected ?? 0)} r="3.5"><title>{`Week ${entry.week}: ${fixed(entry.projected ?? 0)} projected`}</title></circle><circle className="actual-point" cx={x(index)} cy={y(entry.actual)} r="3.5"><title>{`Week ${entry.week}: ${fixed(entry.actual)} actual`}</title></circle><text className="chart-week-label" x={x(index)} y={bottom + 24} textAnchor="middle">W{entry.week}</text></g>)}
        </svg></div> : <div className="empty-analytics">No historical projections are available for this team yet.</div>}
        {selectedTeam && <div className="projection-total-strip"><div><span>ACTUAL PF</span><strong>{fixed(actualForComparedWeeks)}</strong></div><div><span>PROJECTED PF</span><strong>{fixed(selectedTeam.projectedPoints)}</strong></div><div><span>OVER / UNDER</span><strong className={selectedTeam.overUnder >= 0 ? "positive-text" : "negative-text"}>{signed(selectedTeam.overUnder)}</strong></div></div>}
        <div className="section-subheading"><h3>League totals</h3><span>actual vs projection</span></div>
        <div className="projection-team-list">{sorted.map((team) => {
          const barWidth = Math.min(50, Math.abs(team.overUnder) / deltaMax * 50);
          return <button className={`projection-team-row${selectedTeam?.rosterId === team.rosterId ? " selected" : ""}`} type="button" key={team.rosterId} onClick={() => setSelectedRoster(team.rosterId)} aria-label={`Show ${team.name} weekly projection trend`}>
            <span className="projection-team-title"><strong>{team.name}</strong><b className={team.overUnder >= 0 ? "positive-text" : "negative-text"}>{team.projectionWeeks ? signed(team.overUnder) : "—"}</b></span>
            <span className="delta-track" aria-hidden="true"><span className="delta-zero" /><span className={`delta-bar${team.overUnder >= 0 ? " delta-positive" : " delta-negative"}`} style={{ "--delta-width": `${barWidth}%` } as CSSProperties} /></span>
            <span className="projection-team-total"><span>ACTUAL <b>{fixed(team.projectionActualPoints)}</b></span><span>PROJ <b>{fixed(team.projectedPoints)}</b></span><span>PF <b>{fixed(team.actualPoints)}</b></span></span>
          </button>;
        })}</div>
        <p className="method-note">Over / under uses weeks with a complete starting-lineup projection. PF is total actual points through Week {throughWeek}.</p>
      </>}
    </section>
  );
}

function TradeCard({ trade }: { trade: TradeAnalytics }) {
  return <article className="trade-card"><div className="trade-card-header"><span>WEEK {trade.week} <i>·</i> {trade.date}</span><span>{trade.sides.map((side) => side.team).join(" ↔ ")}</span></div><div className="trade-sides">{trade.sides.map((side) => <section className="trade-side" key={side.rosterId}>
    <h3>{side.team}<small>RECEIVED</small></h3>
    {side.players.length ? <ul>{side.players.map((player) => <li className="trade-player" key={player.playerId}><div className="trade-player-name"><strong>{player.name}</strong><span>{player.position}</span></div><div className="trade-player-points"><strong>{player.ppg === null ? "— PPG" : `${fixed(player.ppg)} PPG`}</strong><small>{fixed(player.points)} pts · {player.completedWeeks === 0 ? "no games yet" : player.games === null ? "GP unavailable" : `${player.games} GP`}</small></div></li>)}</ul> : <p className="trade-no-players">No players received</p>}
    {side.picks.map((pick) => <p className="trade-pick" key={pick}>Draft pick · {pick}</p>)}
  </section>)}</div></article>;
}

function TradesView({ trades, throughWeek }: { trades: TradeAnalytics[]; throughWeek: number }) {
  return <section className="analytics-section" aria-labelledby="trades-title"><div className="section-heading"><div><span className="section-kicker">PLAYER POINTS SINCE THE MOVE</span><h2 id="trades-title">Trade overview</h2></div><span className="section-meta">{trades.length} trades</span></div><p className="section-description">PPG is shown first. Totals include trade-week games played on or after the trade, plus later completed games through Week {throughWeek}.</p>{trades.length ? <div className="trade-list">{trades.map((trade) => <TradeCard trade={trade} key={trade.id} />)}</div> : <div className="empty-analytics">No completed trades yet this season.</div>}</section>;
}

function AveragesView({ teams, throughWeek }: { teams: TeamAnalytics[]; throughWeek: number }) {
  const [expandedRoster, setExpandedRoster] = useState<number | null>(null);
  const sorted = [...teams].sort((a, b) => {
    const averageA = a.weekly.length ? a.weekly.reduce((sum, week) => sum + week.actual, 0) / a.weekly.length : 0;
    const averageB = b.weekly.length ? b.weekly.reduce((sum, week) => sum + week.actual, 0) / b.weekly.length : 0;
    return averageB - averageA;
  });

  return <section className="analytics-section" aria-labelledby="averages-title">
    <div className="section-heading"><div><span className="section-kicker">COMPLETED WEEKS · 1–{throughWeek || 0}</span><h2 id="averages-title">Team scoring averages</h2></div><span className="section-meta">{teams.length} teams</span></div>
    <p className="section-description">Average points per game, plus each team’s highest and lowest weekly scores. Open a team to see every week.</p>
    {!throughWeek ? <div className="empty-analytics">Weekly scoring averages will appear after Week 1.</div> : <ol className="averages-list">{sorted.map((team, index) => {
      const weekly = [...team.weekly].sort((a, b) => a.week - b.week);
      const total = weekly.reduce((sum, entry) => sum + entry.actual, 0);
      const average = weekly.length ? total / weekly.length : 0;
      const high = weekly.reduce<(typeof weekly)[number] | null>((best, entry) => !best || entry.actual > best.actual ? entry : best, null);
      const low = weekly.reduce<(typeof weekly)[number] | null>((worst, entry) => !worst || entry.actual < worst.actual ? entry : worst, null);
      const expanded = expandedRoster === team.rosterId;
      return <li className={`average-row${expanded ? " expanded" : ""}`} key={team.rosterId}>
        <button className="average-toggle" type="button" aria-expanded={expanded} aria-label={`${expanded ? "Hide" : "Show"} weekly scores for ${team.name}`} onClick={() => setExpandedRoster(expanded ? null : team.rosterId)}>
          <span className="average-team-heading"><span className={`rank-number${index === 0 ? " rank-number-first" : ""}`}>{String(index + 1).padStart(2, "0")}</span><strong>{team.name}</strong><span className="average-ppg"><strong>{weekly.length ? fixed(average) : "—"}</strong><small>PPG</small></span></span>
          <span className="average-range"><span><small>HIGH</small><strong>{high ? fixed(high.actual) : "—"}</strong>{high && <small>W{high.week}</small>}</span><span><small>LOW</small><strong>{low ? fixed(low.actual) : "—"}</strong>{low && <small>W{low.week}</small>}</span></span>
          <span className="average-expand-label">{expanded ? "HIDE WEEKLY SCORES" : "VIEW WEEKLY SCORES"}</span>
        </button>
        {expanded && <div className="average-week-grid" aria-label={`Weekly point totals for ${team.name}`}>
          {weekly.map((entry) => <div className="average-week-cell" key={entry.week}><small>WEEK {entry.week}</small><strong>{fixed(entry.actual)}</strong></div>)}
        </div>}
      </li>;
    })}</ol>}
  </section>;
}

function AnalyticsTabs({ active, onChange }: { active: TabId; onChange: (id: TabId) => void }) {
  return <div className="analytics-tabs" role="tablist" aria-label="League analytics"><div className="analytics-tabs-inner">{tabs.map((tab) => <button key={tab.id} className={`analytics-tab${active === tab.id ? " active" : ""}`} type="button" role="tab" id={`tab-${tab.id}`} aria-selected={active === tab.id} aria-controls="analytics-panel" onClick={() => onChange(tab.id)}>{tab.label}</button>)}</div></div>;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("rankings");
  const [analytics, setAnalytics] = useState<LeagueAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/analytics", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("League analytics could not be loaded.");
        return response.json() as Promise<LeagueAnalytics>;
      })
      .then(setAnalytics)
      .catch((reason: unknown) => {
        if (reason instanceof Error && reason.name === "AbortError") return;
        setError("Sleeper’s historical data is temporarily unavailable. Try refreshing in a moment.");
      });
    return () => controller.abort();
  }, []);

  const tabTitle = tabs.find((tab) => tab.id === activeTab)?.label ?? "Power rankings";
  const orderedTeams = analytics?.teams ?? [];

  return <div className="site-shell" id="home">
    <header className="site-header ranking-header"><a className="brand" href="#home" aria-label="UCDegens league analytics home"><span className="brand-icon" aria-hidden="true">U</span><span className="brand-copy"><strong>UCDegens</strong><small>LEAGUE ANALYTICS</small></span></a></header>
    <main className="main-content analytics-content">
      <div className="analytics-page-heading"><div><div className="season-label">{analytics?.season ?? "2026"} <span>·</span> {analytics?.league ?? "UCDegens"}</div><h1>{tabTitle}</h1></div>{analytics && <span className="through-label">THROUGH WEEK {analytics.throughWeek}</span>}</div>
      <AnalyticsTabs active={activeTab} onChange={setActiveTab} />
      <div className="tab-panel" id="analytics-panel" role="tabpanel" aria-labelledby={`tab-${activeTab}`}>
        {activeTab === "rankings" && <RankingsView teams={orderedTeams} />}
        {error && activeTab !== "rankings" && <div className="analytics-error" role="status">{error}</div>}
        {!error && !analytics && activeTab !== "rankings" && <div className="analytics-loading"><strong>Loading league history</strong><span>Fetching completed weeks from Sleeper…</span></div>}
        {analytics && activeTab === "optimal" && <OptimalStandings teams={orderedTeams} throughWeek={analytics.throughWeek} />}
        {analytics && activeTab === "projections" && <ProjectionChart teams={orderedTeams} throughWeek={analytics.throughWeek} />}
        {analytics && activeTab === "trades" && <TradesView trades={analytics.trades} throughWeek={analytics.throughWeek} />}
        {analytics && activeTab === "averages" && <AveragesView teams={orderedTeams} throughWeek={analytics.throughWeek} />}
      </div>
      <footer className="rankings-footer">UCDegens · Sleeper league data</footer>
    </main>
  </div>;
}
