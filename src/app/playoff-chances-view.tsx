import { useEffect, useMemo, useRef, useState } from "react";
import { playoffTrials, simulatePlayoffs, type PlayoffForecast, type PlayoffSide, type ScenarioLocks } from "@/lib/playoff-chances";

const emptyLocks: ScenarioLocks = {};

function percentage(probability: number) {
  if (probability > 0 && probability < 0.001) return "<0.1%";
  if (probability < 1 && probability > 0.999) return ">99.9%";
  return `${Number((probability * 100).toFixed(1))}%`;
}

function Lineup({ side, name }: { side: PlayoffSide; name: string }) {
  const total = side.lineup.reduce((sum, starter) => sum + starter.points, 0);
  return <div className="playoff-lineup">
    <h5>{name} <span>{total.toFixed(2)} pts</span></h5>
    <ul>{side.lineup.map(({ slot, player, points, estimated }, index) => <li key={`${slot}-${index}`}>
      <span>{slot}</span><span>{player ?? "Open slot"}{estimated && <small>Estimate</small>}</span><span>{points.toFixed(2)}</span>
    </li>)}</ul>
  </div>;
}

function PlayoffResults({ forecast }: { forecast: PlayoffForecast }) {
  const [week, setWeek] = useState(forecast.games[0]?.week);
  const [draft, setDraft] = useState<ScenarioLocks>(emptyLocks);
  const [applied, setApplied] = useState<ScenarioLocks>(emptyLocks);
  const oddsHeading = useRef<HTMLParagraphElement>(null);
  const [draftCount, appliedCount] = [Object.keys(draft).length, Object.keys(applied).length];
  const changed = draftCount !== appliedCount || Object.keys(draft).some((key) => draft[key] !== applied[key]);
  const baseline = useMemo(() => simulatePlayoffs(forecast), [forecast]);
  const odds = useMemo(() => Object.keys(applied).length ? simulatePlayoffs(forecast, applied) : baseline, [forecast, baseline, applied]);
  const ordered = [...forecast.teams].sort((a, b) => odds[b.id] - odds[a.id] || b.pointsFor - a.pointsFor);
  const names = new Map(forecast.teams.map(({ id, name }) => [id, name]));
  const weeks = [...new Set(forecast.games.map((game) => game.week))];

  function setWinner(gameId: string, winner: string) {
    setDraft((current) => {
      const next = { ...current };
      if (winner) next[gameId] = Number(winner);
      else delete next[gameId];
      return next;
    });
  }

  return <>
    <p className="section-description">{forecast.spots} playoff spots · Standings through Week {forecast.throughWeek} · {playoffTrials.toLocaleString("en-US")} simulated seasons</p>
    <div className="playoff-odds-heading">
      <p ref={oddsHeading} className="playoff-odds-status" role="status" tabIndex={-1}>{appliedCount ? `Scenario odds · ${appliedCount} ${appliedCount === 1 ? "result" : "results"} locked` : "Baseline odds"}</p>
      {weeks.length > 0 && <a href="#playoff-scenario-title">Try a scenario ↓</a>}
    </div>
    <ol className="playoff-odds" aria-label="Team playoff chances">
      {ordered.map((team) => {
        const difference = (odds[team.id] - baseline[team.id]) * 100;
        return <li key={team.id}>
          <div className="playoff-odds-row"><div><strong>{team.name}</strong><small>{team.wins}–{team.losses}{team.ties ? `–${team.ties}` : ""} · {team.pointsFor.toFixed(2)} PF</small></div>
            <div><b>{percentage(odds[team.id])}</b>{appliedCount > 0 && <small>Base {percentage(baseline[team.id])} · {difference >= 0.05 ? "+" : ""}{Math.abs(difference) < 0.05 ? "0.0" : difference.toFixed(1)} pp</small>}</div>
          </div>
          <div className="playoff-odds-track" aria-hidden="true"><div style={{ width: `${odds[team.id] * 100}%` }} /></div>
        </li>;
      })}
    </ol>
    {weeks.length > 0 && <section className="playoff-scenario" aria-labelledby="playoff-scenario-title">
      <div className="section-heading">
        <h3 id="playoff-scenario-title">What if?</h3>
        <label className="week-picker"><span>WEEK</span><select aria-label="Scenario week" value={week} onChange={(event) => setWeek(Number(event.target.value))}>
          {weeks.map((value) => <option key={value} value={value}>Week {value}</option>)}
        </select></label>
      </div>
      <p className="section-description">Pick winners across any remaining weeks, then update the odds. Each matchup also shows the best projected lineups.</p>
      <form onSubmit={(event) => { event.preventDefault(); setApplied(draft); oddsHeading.current?.focus(); }}>
        <div className="playoff-games">
          {forecast.games.filter((game) => game.week === week).map(({ id, sides }) => {
            const [a, b] = sides.map((side) => names.get(side.teamId) ?? `Team ${side.teamId}`);
            const label = `${a} vs. ${b}`;
            return <article key={id} className="playoff-game">
              <h4>{label}</h4>
              <label className="team-picker"><span>RESULT</span><select aria-label={`Winner: ${label}`} value={draft[id] ?? ""} onChange={(event) => setWinner(id, event.target.value)}>
                <option value="">Simulate this matchup</option>
                <option value={sides[0].teamId}>{a} wins</option>
                <option value={sides[1].teamId}>{b} wins</option>
              </select></label>
              <details><summary>View projected lineups</summary><div className="playoff-lineups">{sides.map((side, index) => <Lineup key={side.teamId} side={side} name={index === 0 ? a : b} />)}</div></details>
            </article>;
          })}
        </div>
        <div className="playoff-actions">
          <button type="submit" disabled={!changed}>Update odds ({draftCount} locked)</button>
          <button type="button" disabled={!draftCount && !appliedCount} onClick={() => { setDraft(emptyLocks); setApplied(emptyLocks); }}>Reset to baseline</button>
        </div>
      </form>
    </section>}
    <details className="playoff-method"><summary>How the odds are calculated</summary>
      <p>Every remaining week uses the highest projected legal lineup from each team’s current active roster. Players on bye are excluded. Current out, doubtful, and suspended tags affect the next unscored week; players on IR, PUP, or NFI are left out. Where a scheduled player’s projection is missing, an estimate is marked in the lineup.</p>
      <p>Simulated scores blend 80% of the lineup projection and 20% of the team’s scoring average, adjusted for open slots. The spread comes from past league scores. Locked matchups draw scores that satisfy the selected result. Seeding uses record, points for, then higher points against.</p>
      <p>These are estimates using today’s rosters, with no future roster moves or commissioner overrides. Any week Sleeper hasn’t finalized is simulated in full, including games already in progress.</p>
    </details>
  </>;
}

export function PlayoffChancesView() {
  const [result, setResult] = useState<PlayoffForecast | "error" | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/playoff-chances", { signal: controller.signal }).then((response) => {
      if (!response.ok) throw new Error("Forecast unavailable");
      return response.json() as Promise<PlayoffForecast>;
    }).then(setResult).catch(() => {
      if (!controller.signal.aborted) setResult("error");
    });
    return () => controller.abort();
  }, [attempt]);
  return <section className="analytics-section" aria-labelledby="playoff-title">
    <div className="section-heading"><h2 id="playoff-title">Road to the playoffs</h2></div>
    {result === null ? <div className="analytics-loading playoff-state" role="status"><strong>Building the playoff forecast</strong><span>Loading the remaining schedule and player projections…</span></div>
      : result === "error" ? <div className="analytics-error playoff-state" role="status">The playoff forecast is temporarily unavailable.<button type="button" onClick={() => { setResult(null); setAttempt((count) => count + 1); }}>Try again</button></div>
      : <PlayoffResults forecast={result} />}
  </section>;
}
