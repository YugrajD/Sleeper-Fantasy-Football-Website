import fs from 'node:fs/promises';
import path from 'node:path';
import {bestProjectedLineup} from '../src/lib/playoff-chances.ts';
import {scoreProjection, slotEligibility, positionFor} from '../src/lib/sleeper-helpers.ts';

const root=process.cwd(), dir=path.join(root,'output/playoff-forecast');
await fs.mkdir(path.join(dir,'inputs'),{recursive:true});
const sources=[];
async function get(url,key){
  const target=path.join(dir,'inputs',key+'.json');
  let value;
  if(process.argv.includes('--cached')) value=JSON.parse(await fs.readFile(target,'utf8'));
  else {
    for(let attempt=0;attempt<3;attempt++){
      try { const response=await fetch(url,{signal:AbortSignal.timeout(45000)}); if(!response.ok) throw Error('HTTP '+response.status); value=await response.json(); break; }
      catch(error){if(attempt===2) throw Error(url+': '+error.message);}
    }
    await fs.writeFile(target,JSON.stringify(value));
  }
  sources.push({url,file:'inputs/'+key+'.json'});return value;
}
const api='https://api.sleeper.app/v1', leagueId='1389131126982860800';
const [history,league,rosters,users,players]=await Promise.all([
 get('http://localhost:3001/api/analytics','analytics'),get(`${api}/league/${leagueId}`,'league'),
 get(`${api}/league/${leagueId}/rosters`,'rosters'),get(`${api}/league/${leagueId}/users`,'users'),get(`${api}/players/nfl`,'players')]);
const settings=league.settings;
if(settings.divisions||settings.league_average_match||settings.playoff_seed_type) throw Error('Unsupported seeding rules');
const through=history.throughWeek, start=through+1, stop=settings.playoff_week_start-1;
if(start>stop)throw Error('No remaining regular season');
const weeks=Array.from({length:stop-through},(_,i)=>start+i);
const slots=league.roster_positions.filter(x=>!['BN','IR','TAXI','RES','REC'].includes(x)).map(label=>({label,positions:slotEligibility(label)}));
const positions=[...new Set(slots.flatMap(s=>s.positions))];
const owned=new Set(rosters.flatMap(r=>r.players??[]));
const fallback={QB:12,RB:4,WR:4,TE:3,K:5,DEF:4};
const exclusions=Object.entries(players).filter(([id,p])=>id==='9493'||[p.full_name,[p.first_name,p.last_name].join(' ')].includes('Michael Wilson')).map(([id,p])=>({id,name:p.full_name||[p.first_name,p.last_name].join(' '),reason:'User-supplied remainder-of-season absence assumption; not a verified return-date forecast.'}));
const excludedIds=new Set(exclusions.map(p=>p.id));
const feed=[];
// Bound external concurrency to one week at a time; cache every input for reproducibility.
for(const week of weeks){
 const [pages,matchups]=await Promise.all([
  Promise.all(positions.map(pos=>get(`https://api.sleeper.com/projections/nfl/${history.season}/${week}?season_type=regular&position=${pos}`,`week-${week}-${pos}`))),
  get(`${api}/league/${leagueId}/matchups/${week}`,`week-${week}-matchups`)]);
 const rows=pages.flat().filter(r=>!r.company||r.company==='rotowire');
 const scheduled=new Set(rows.filter(r=>r.team&&r.opponent).flatMap(r=>[r.team,r.opponent]));
 if(scheduled.size<20)throw Error('Incomplete projection schedule '+week);
 feed.push({week,rows:new Map(rows.map(r=>[r.player_id,r])),scheduled,matchups});
 console.log('Fetched week '+week);
}
const availability=[];
const teams=history.teams.map(t=>{
 const r=rosters.find(r=>r.roster_id===t.rosterId), user=users.find(u=>u.user_id===r.owner_id);
 const record={wins:t.weekly.filter(w=>w.actualResult==='W').length,losses:t.weekly.filter(w=>w.actualResult==='L').length,ties:t.weekly.filter(w=>w.actualResult==='T').length};
 if(record.wins+record.losses+record.ties!==through)throw Error('Incomplete record');
 return {id:t.rosterId,name:(user?.metadata?.team_name||user?.display_name||t.name).trim(),...record,pf:t.weekly.reduce((a,w)=>a+w.actual,0),pa:t.weekly.reduce((a,w)=>a+w.opponentActual,0),weekly:[]};
});
const benchmarks=[];
for(const f of feed){
 function candidate(id, rostered){
  const p=players[id], row=f.rows.get(id), pos=positionFor(id,players), nflTeam=pos.includes('DEF')?id:row?.team??p?.team;
  const status=p?.injury_status?.toLowerCase();
  if(!p||!nflTeam||!f.scheduled.has(nflTeam)||excludedIds.has(id))return null;
  if(['ir','pup','nfi'].includes(status)||(f.week===start&&['out','doubtful','suspended'].includes(status)))return null;
  const projected=row?.stats?scoreProjection(row.stats,league.scoring_settings):null;
  if(!rostered&&projected===null)return null;
  return {id,name:p.full_name||[p.first_name,p.last_name].filter(Boolean).join(' ')||id,positions:pos,points:projected??fallback[pos[0]]??3,estimated:projected===null};
 }
 const bench={week:f.week};
 for(const pos of ['K','DEF']){
  const pool=Object.keys(players).filter(id=>!owned.has(id)&&positionFor(id,players).includes(pos)).map(id=>candidate(id,false)).filter(Boolean).sort((a,b)=>b.points-a.points||a.id.localeCompare(b.id));
  if(pool.length<3)throw Error('Fewer than three streaming options '+pos+' '+f.week);
  bench[pos]={points:pool[1].points,options:pool.slice(0,3).map(({id,name,points})=>({id,name,points})),poolSize:pool.length};
 }
 benchmarks.push(bench);
 for(const team of teams){
  const r=rosters.find(r=>r.roster_id===team.id);
  const candidates=(r.players??[]).map(id=>candidate(id,true)).filter(Boolean).filter(p=>!(r.taxi??[]).includes(p.id));
  // Reserve-list membership alone is not a medical return-date prediction; injury status governs eligibility.
  const raw=bestProjectedLineup(slots,candidates);
  const stream=raw.map(s=>({...s,streaming:false}));
  for(const s of stream){if(['K','DEF'].includes(s.slot)&&(f.week>start||!s.player)&&bench[s.slot].points>s.points){s.player='Streaming '+s.slot+' benchmark';s.points=bench[s.slot].points;s.estimated=false;s.streaming=true;}}
  const own=f.matchups.find(m=>m.roster_id===team.id), opp=f.matchups.find(m=>m.matchup_id===own?.matchup_id&&m.roster_id!==team.id);
  if(!opp||own.matchup_id==null)throw Error('Incomplete schedule');
  team.weekly.push({week:f.week,opponent:opp.roster_id,matchup:own.matchup_id,current:raw,streaming:stream,currentMean:raw.reduce((a,s)=>a+s.points,0),streamingMean:stream.reduce((a,s)=>a+s.points,0)});
 }
}
for(const r of rosters)for(const id of r.players??[]){const p=players[id];if(p?.injury_status||excludedIds.has(id))availability.push({team:r.roster_id,id,name:p.full_name||[p.first_name,p.last_name].join(' '),status:p.injury_status||'manual exclusion',excluded:excludedIds.has(id)?'All remaining weeks (manual)': ['IR','PUP','NFI'].includes(p.injury_status?.toUpperCase())?'All remaining weeks (conservative, no return date)': ['out','doubtful','suspended'].includes(p.injury_status?.toLowerCase())?'Upcoming week only':'Eligible; projection used without availability haircut'});}
const errors=[],missing=[];
for(const t of history.teams)for(const w of t.weekly){
 if(Number.isFinite(w.projected)&&Number.isFinite(w.actual))errors.push({team:t.rosterId,week:w.week,projected:w.projected,actual:w.actual,error:w.actual-w.projected});
 else missing.push({team:t.rosterId,week:w.week});
}
if(errors.length<30)throw Error('Not enough complete projection errors');
const mean=errors.reduce((a,e)=>a+e.error,0)/errors.length, sd=Math.sqrt(errors.reduce((a,e)=>a+(e.error-mean)**2,0)/(errors.length-1));
for(const team of teams){
 const r=rosters.find(r=>r.roster_id===team.id);
 if(r.settings.wins!==team.wins||r.settings.losses!==team.losses||r.settings.ties!==team.ties||Math.abs(r.settings.fpts+(r.settings.fpts_decimal??0)/100-team.pf)>.011)throw Error('Standings mismatch '+team.name);
 for(const w of team.weekly){const opposite=teams.find(t=>t.id===w.opponent)?.weekly.find(x=>x.week===w.week);if(opposite?.opponent!==team.id)throw Error('Non-reciprocal schedule');}
}
const trials=10000, seed=20261111;
function simulate(mode){
 let state=seed;const random=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return(state+.5)/4294967296;};
 const out=Object.fromEntries(teams.map(t=>[t.id,{qualify:0,wins:0,seeds:Array(teams.length).fill(0),nextWin:0,nextWinQualify:0,nextLoss:0,nextLossQualify:0,nextTie:0}]));
 const index=new Map(teams.map((t,i)=>[t.id,i]));
 for(let trial=0;trial<trials;trial++){
  const table=teams.map(t=>({id:t.id,wins:t.wins,ties:t.ties,pf:Math.round(t.pf*100),pa:Math.round(t.pa*100),coin:random(),next:0}));
  for(const week of weeks){
   const scores=new Map(teams.map(t=>{const w=t.weekly.find(w=>w.week===week);const error=errors[Math.floor(random()*errors.length)].error;return[t.id,Math.round(100*(w[mode+'Mean']+error))];}));
   for(const team of teams){const w=team.weekly.find(w=>w.week===week), row=table[index.get(team.id)], a=scores.get(team.id), b=scores.get(w.opponent);row.pf+=a;row.pa+=b;row.wins+=a>b?1:0;row.ties+=a===b?1:0;if(week===start)row.next=Math.sign(a-b);}
  }
  table.sort((a,b)=>(2*b.wins+b.ties)-(2*a.wins+a.ties)||b.pf-a.pf||b.pa-a.pa||b.coin-a.coin);
  table.forEach((t,i)=>{const o=out[t.id],q=i<settings.playoff_teams;o.qualify+=q?1:0;o.wins+=t.wins;o.seeds[i]++;if(t.next>0){o.nextWin++;o.nextWinQualify+=q?1:0;}else if(t.next<0){o.nextLoss++;o.nextLossQualify+=q?1:0;}else o.nextTie++;});
 }
 for(const o of Object.values(out)){o.odds=o.qualify/trials;o.expectedWins=o.wins/trials;o.ifWin=o.nextWin?o.nextWinQualify/o.nextWin:null;o.ifLoss=o.nextLoss?o.nextLossQualify/o.nextLoss:null;}
 if(Object.values(out).reduce((a,o)=>a+o.qualify,0)!==trials*settings.playoff_teams)throw Error('Qualification totals invalid');
 for(let i=0;i<teams.length;i++)if(Object.values(out).reduce((a,o)=>a+o.seeds[i],0)!==trials)throw Error('Seed counts invalid');
 return out;
}
const streaming=simulate('streaming'),current=simulate('current');
const inputCaptured=new Date(Math.max(...await Promise.all(sources.map(async s=>(await fs.stat(path.join(dir,s.file))).mtimeMs)))).toISOString();
const report={version:'empirical-errors-streaming-v1',generated:new Date().toISOString(),inputCaptured,leagueId,season:history.season,throughWeek:through,weeks,spots:settings.playoff_teams,trials,seed,settings,slots,exclusions,availability,benchmarks,errors,missing,errorMean:mean,errorSd:sd,sources,teams:teams.map(t=>({...t,forecast:streaming[t.id],currentForecast:current[t.id]}))};
await fs.writeFile(path.join(dir,'forecast.json'),JSON.stringify(report,null,2));
console.table(report.teams.sort((a,b)=>b.forecast.odds-a.forecast.odds).map(t=>({team:t.name,odds:(100*t.forecast.odds).toFixed(1),rosterOnly:(100*t.currentForecast.odds).toFixed(1),expectedWins:t.forecast.expectedWins.toFixed(2)})));
console.log(JSON.stringify({through,spots:report.spots,weeks,errors:errors.length,missing:missing.length,errorMean:mean,errorSd:sd,estimated:teams.flatMap(t=>t.weekly.flatMap(w=>w.current.filter(s=>s.estimated))).length,availability:availability.length}));
