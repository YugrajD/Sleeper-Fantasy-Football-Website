"""Create the auditable playoff forecast from the saved simulation snapshot."""
import json, html
from pathlib import Path
from datetime import datetime, timedelta, timezone
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pypdf import PdfReader

ROOT=Path(__file__).resolve().parents[1]
R=json.loads((ROOT/'output/playoff-forecast/forecast.json').read_text(encoding='utf-8'))
OUT=ROOT/'output/pdf/UCDegens-Playoff-Forecast-Week-10.pdf'
OUT.parent.mkdir(parents=True,exist_ok=True)
for name,file in [('Body','arial.ttf'),('Bold','arialbd.ttf'),('Display','georgia.ttf')]:
    pdfmetrics.registerFont(TTFont(name,'C:/Windows/Fonts/'+file))
pdfmetrics.registerFontFamily('Body',normal='Body',bold='Bold',italic='Body',boldItalic='Bold')
INK=colors.HexColor('#172633'); MUTED=colors.HexColor('#596c78'); GREEN=colors.HexColor('#397565'); PALE=colors.HexColor('#f1f5f4'); RULE=colors.HexColor('#d8e0e2')
styles={
 'title':ParagraphStyle('title',fontName='Display',fontSize=27,leading=33,textColor=INK,spaceAfter=14),
 'heading':ParagraphStyle('heading',fontName='Display',fontSize=20,leading=25,textColor=INK,spaceAfter=12),
 'sub':ParagraphStyle('sub',fontName='Bold',fontSize=12,leading=16,textColor=INK,spaceBefore=10,spaceAfter=6),
 'body':ParagraphStyle('body',fontName='Body',fontSize=10.5,leading=15,textColor=INK,spaceAfter=10),
 'small':ParagraphStyle('small',fontName='Body',fontSize=8.6,leading=12,textColor=MUTED,spaceAfter=8),
 'cell':ParagraphStyle('cell',fontName='Body',fontSize=9,leading=12,textColor=INK),
 'tiny':ParagraphStyle('tiny',fontName='Body',fontSize=7.9,leading=10.5,textColor=INK),
 'head':ParagraphStyle('head',fontName='Bold',fontSize=8.2,leading=11,textColor=INK),
 'meta':ParagraphStyle('meta',fontName='Bold',fontSize=9,leading=13,textColor=GREEN,spaceAfter=12)}
def e(x): return html.escape(str(x)).replace('\u2014','-').replace('\u2013','-')
def p(text,style='body'): return Paragraph(text,styles[style])
def num(x): return f'{x:.2f}'
def pct(x):
    if x is None:return 'N/A'
    if x>=.9995:return '&gt;99.9%'
    if x<.0005:return '&lt;0.1%'
    return f'{100*x:.1f}%'
def record(t):return f"{t['wins']}-{t['losses']}"+(f"-{t['ties']}" if t['ties'] else '')
def table(headers,rows,widths,small=False):
    st='tiny' if small else 'cell'
    data=[[p(e(x),'head') for x in headers]]+[[p(str(x),st) for x in row] for row in rows]
    t=Table(data,colWidths=widths,repeatRows=1,hAlign='LEFT')
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),PALE),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),6),('RIGHTPADDING',(0,0),(-1,-1),6),('TOPPADDING',(0,0),(-1,-1),5 if not small else 3),('BOTTOMPADDING',(0,0),(-1,-1),5 if not small else 3),('LINEBELOW',(0,0),(-1,-1),.35,RULE)]))
    return t
story=[]
def add(text,style='body'):story.append(p(text,style))
def page(title):story.append(PageBreak());add(title,'heading')
teams=sorted(R['teams'],key=lambda t:(-t['forecast']['odds'],-t['pf']))
byid={t['id']:t for t in teams}
stamp=datetime.fromisoformat(R['inputCaptured'].replace('Z','+00:00')).astimezone(timezone(timedelta(hours=-8))).strftime('%B %d, %Y at %I:%M %p PST')
add('UCDegens<br/>Playoff forecast','title')
add('ENTERING WEEK 10 / RESULTS THROUGH WEEK 9','meta')
add(f"{R['spots']} playoff spots. Weeks 10-14 remaining. {R['trials']:,} simulated seasons per scenario. Snapshot: {stamp}.")
add('Estimated chances under stated assumptions. This is an initial, unvalidated model; it is not a clinching calculation.','small')
add('<b>Conservative injury case:</b> current IR/PUP/NFI players are unavailable through Week 14. Puka and Michael Wilson are also excluded under prior user-provided assumptions. See the availability audit before interpreting the odds.','small')
story.append(table(['ID / Team','Record','Streaming','Roster only','Expected wins'],[[f"{t['id']:02d} / {e(t['name'])}",record(t),f"<b>{pct(t['forecast']['odds'])}</b>",pct(t['currentForecast']['odds']),num(t['forecast']['expectedWins'])] for t in teams],[190,48,78,78,130]))
add('How to read this','sub')
add('Streaming is the main scenario. Roster only holds every current roster fixed. Expected wins is the average final regular-season win total under streaming, not a guaranteed record. Every team is affected when opponents improve their K/DEF slots too.','small')
add('Near 100% does not mean mathematically clinched. Near 0% does not mean eliminated. Displayed percentages are rounded; the model has finite historical error support and cannot represent every possible future.','small')

page('What this week changes')
add('Conditional playoff chances under the streaming scenario. These use the simulated seasons in which the team wins or loses Week 10; they do not force arbitrary scores.','small')
story.append(table(['Team','If win','If lose','Simulated wins / losses'],[[e(t['name']),pct(t['forecast']['ifWin']),pct(t['forecast']['ifLoss']),f"{t['forecast']['nextWin']:,} / {t['forecast']['nextLoss']:,}"] for t in teams],[220,72,72,160]))
add('Conditional ties are excluded from the win/lose groups. Smaller groups have greater simulation noise. A win or loss includes the scores and points-for consequences generated in those seasons.','small')
add('Precision versus accuracy','sub')
add('At 10,000 independent trials, the largest approximate 95% Monte Carlo margin is +/-0.98 percentage points for an unconditional probability. This measures random simulation noise only. Projection mistakes, injuries, and roster assumptions can move the odds much more.','small')

page('Where teams finish')
add('Seed probabilities, streaming scenario. Columns 1-8 qualify; columns 9-12 miss. Values are percentages rounded to one decimal, so rows may not total exactly 100.','small')
story.append(table(['Team']+[str(i) for i in range(1,13)],[[e(t['name'])]+[f'{100*n/R["trials"]:.1f}' for n in t['forecast']['seeds']] for t in teams],[164]+[30]*12,True))
add('Standings rules','sub')
add('The API reports 12 teams, eight playoff places, playoff start in Week 15, no divisions, and no league-average matchup. Each simulation sorts by record (wins plus half a tie), total points for, higher points against, then a seeded random draw. All teams play the same number of games. Commissioner custom reseeding is not predicted.','small')
add('Standings were reconstructed from finalized weekly scores and checked against current Sleeper roster records and points for. Remaining schedule pairings were checked for reciprocity. Each trial assigns exactly one team to each seed and exactly eight playoff places.','small')

page('The exact scoring model')
add('1 / Project each weekly lineup','sub')
add('Score Sleeper player projections using every matching league scoring multiplier. Optimize the legal lineup by maximizing projected points, using each player at most once. Only current rostered players are eligible, apart from the K/DEF streaming benchmark. This is the best <i>projected</i> lineup, not a hindsight-perfect actual lineup.')
add('2 / Build the empirical error pool','sub')
add(f"For each complete historical team-week, error = actual score - projected score. The pool contains <b>{len(R['errors'])} observations</b> from Weeks 1-9; {len(R['missing'])} team-weeks were missing and excluded. Mean error: <b>{num(R['errorMean'])}</b> points. Sample standard deviation: <b>{num(R['errorSd'])}</b> points. Every observation is listed in the final appendix.")
add('3 / Draw scores','sub')
add('<b>Simulated score = round to hundredths (weekly lineup projection + one sampled historical error).</b> Each of the 108 errors has equal probability and is sampled with replacement. Errors are not centered: the observed average projection bias is retained. There is no normal-distribution assumption, 80/20 blend, power-ranking weight, team-form bonus, or score floor.')
add('4 / Play the season and count qualifiers','sub')
add('Draw one score per team per week, independently. Compare the same two scores for both sides of each game; an exact tie awards half a standings win. Add scores to existing PF/PA, seed the final table, and count qualifications. Playoff probability = qualifying trials / 10,000. Expected wins counts outright wins only.')
add('Reproducibility','sub')
add(f"Model version: {e(R['version'])}. Seed: {R['seed']}. PRNG: 32-bit LCG, state = (1664525 x state + 1013904223) mod 2^32; uniform = (state + 0.5) / 2^32. Each scenario resets the same seed and uses the same ordered teams, weeks, errors, and draws. Frozen inputs and full-precision results are saved with the generator.",'small')

page('Assumptions that can change the odds')
for title,body in [
 ('Current rosters, no skill-player pickups','No future trades, RB/WR/TE/QB waiver additions, drops, FAAB spending, or manager mistakes are forecast. Skill-position holes remain empty and project 0.00. Taxi players are excluded. Reserve-list membership alone does not exclude a medically eligible player.'),
 ('Conservative injury treatment','Current IR/PUP/NFI statuses are excluded for all five weeks because we do not have verified return dates. Out/doubtful/suspended players are excluded in Week 10 only and eligible later if projected and scheduled. Questionable players remain eligible without an additional participation penalty. This is a transparent simplifying assumption, not an injury prognosis.'),
 ('User-provided absences','Puka Nacua and Michael Wilson are excluded for the remaining regular season based on prior user-provided assumptions. Those assumptions have not been independently reverified for this report. Michael Wilson is not on a current league roster, so his exclusion has no direct lineup effect.'),
 ('Projection availability','Byes are inferred from team/opponent coverage in the weekly projection feeds. Every future feed covers at least 20 NFL teams; this is a coverage check, not an independently verified NFL schedule. Missing projections would use QB 12.00, RB/WR 4.00, TE 3.00, K 5.00, DEF 4.00. This snapshot used zero such fallback candidates in selected lineups.'),
 ('Historical comparability','Historical errors come from the lineups managers actually started; future lineups are optimized by projection. These are not identical decision processes. Historical team projections include the existing manager-supplied corrections in the website. Exact pregame snapshot preservation has not been verified.'),
 ('What uncertainty is not modeled','All teams use the same pooled error distribution, independently across teams and weeks. No persistent team-strength uncertainty, position-specific volatility, injury occurrence/return probabilities, NFL game correlations, or weather scenarios are simulated. Future projections are treated as fixed.'),
 ('Validation status','Data integrity checks passed; predictive calibration and a hindsight-free rolling backtest have not been established. Empirical resampling cannot generate errors outside the observed range. Results are conditional model estimates, not measured real-world frequencies.')]:
    add(e(title),'sub');add(e(body),'small')

page('Kicker and defense streaming')
add('Week 10 keeps a rostered, eligible kicker/defense; it substitutes the benchmark only when the slot is empty. Weeks 11-14 use the higher of the rostered option and the streaming benchmark. K/DEF points are included in the team projection and share the pooled team-level error draw.')
add('For each week and position, rank currently unowned, eligible players with valid projections. The benchmark is the median of the top three: the second-highest projection. The pool excludes every currently rostered player and uses that same ownership snapshot for all five weeks.','small')
rows=[]
for b in R['benchmarks']:
 for pos in ['K','DEF']:
    x=b[pos];rows.append([str(b['week']),pos,num(x['points']),'<br/>'.join(f"{e(o['name'])}: {num(o['points'])}" for o in x['options']),str(x['poolSize'])])
story.append(table(['Week','Slot','Benchmark','Top three available projections','Pool'],rows,[42,40,75,325,42],True))
add('This is a shared replacement-value benchmark, not a simulation of waiver transactions. Multiple teams may receive the same assumed quality without acquiring the same named player. Competition for scarce streamers, changing ownership, and successful bids are not modeled; this may be optimistic. The roster-only column exposes the impact of this assumption.','small')

page('Availability audit')
add('Every rostered player with a non-empty injury status, plus manual exclusions. Team IDs match the results table. IR/PUP/NFI = excluded throughout; Out/Doubtful/Suspended = excluded Week 10 only; other statuses = eligible. Manual Puka exclusion overrides his Out status.','small')
def injury_table(rows):return table(['ID','Player','Status'],[[str(a['team']),e(a['name']),e(a['status'])+(' / manual' if a['id']=='9493' else '')] for a in rows],[29,155,70],True)
audit=R['availability'];half=(len(audit)+1)//2
audit_table=Table([[injury_table(audit[:half]),injury_table(audit[half:])]],colWidths=[262,262]);audit_table.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0)]));story.append(audit_table)

for t in teams:
 page(e(t['name']))
 add(f"TEAM {t['id']:02d} / {record(t)} / PF {num(t['pf'])} / PA {num(t['pa'])}",'meta')
 add(f"<b>{pct(t['forecast']['odds'])} playoff chance</b> with streaming; {pct(t['currentForecast']['odds'])} roster only. Expected final wins: {num(t['forecast']['expectedWins'])}.")
 add('Weekly projected lineups. Final column shows roster-only alternatives to streamed slots. Totals use unrounded player projections.','small')
 rows=[]
 for w in t['weekly']:
    lineup='<br/>'.join(f"<b>{e(s['slot'])}</b> {e(s['player'] or 'EMPTY')}: {num(s['points'])}"+(' [estimate]' if s['estimated'] else '') for s in w['streaming'])
    replaced=[f"{e(s['slot'])}: {e(s['player'] or 'EMPTY')} {num(s['points'])}" for i,s in enumerate(w['current']) if w['streaming'][i]['streaming']]
    rows.append([f"<b>W{w['week']}</b><br/>{e(byid[w['opponent']]['name'])}",lineup,f"<b>{num(w['streamingMean'])}</b><br/>Roster {num(w['currentMean'])}"+('<br/><br/>'+'<br/>'.join(replaced) if replaced else '')])
 story.append(table(['Week / opponent','Selected lineup (streaming scenario)','Projected total / alternatives'],rows,[115,275,134],True))

errors=sorted(R['errors'],key=lambda x:(x['week'],x['team']))
for i in range(2):
 page(f'Historical error ledger / {i+1} of 2')
 add('Complete observations used in resampling. IDs identify teams in the main results table. Projection and actual points are displayed to hundredths; the simulation uses stored full precision. Error = actual - projected.','small')
 subset=errors[i*54:(i+1)*54]
 def ledger(part):return table(['Wk','ID','Projected','Actual','Error'],[[str(x['week']),str(x['team']),num(x['projected']),num(x['actual']),num(x['error'])] for x in part],[26,26,65,65,65],True)
 outer=Table([[ledger(subset[:27]),ledger(subset[27:])]],colWidths=[262,262]);outer.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0)]));story.append(outer)
 if i==1:
    add('Sources and reproducibility files','sub')
    add('Sleeper league API: api.sleeper.app/v1/league/1389131126982860800; player API: api.sleeper.app/v1/players/nfl. Projections: api.sleeper.com/projections/nfl/2026/{week}?season_type=regular&amp;position={position}; rows use company=rotowire or no company. History: saved localhost /api/analytics, including existing manual corrections.','small')
    add('Frozen API responses: output/playoff-forecast/inputs. Exact results/source URLs: forecast.json in that folder\'s parent. Reproduce without network: node --experimental-strip-types scripts/playoff-report.mjs --cached.','small')
    add('References: <link href="https://support.sleeper.com/en/articles/2203518-how-do-playoff-teams-get-determined" color="#397565">Sleeper playoff seeding rules</link>; <link href="https://otexts.com/fpp3/toolbox.html" color="#397565">Hyndman and Athanasopoulos, Forecasting: Principles and Practice, Chapter 5</link>. These support the rules and general forecasting techniques; the particular streaming benchmark and model assumptions are ours.','small')

def chrome(c,doc):
 c.setFont('Body',8);c.setFillColor(MUTED);c.drawString(44,758,'UCDegens / Playoff forecast');c.drawRightString(568,758,'Week 10 / Initial model');c.setStrokeColor(RULE);c.line(44,748,568,748);c.drawString(44,29,'Snapshot-based estimates / Read assumptions before sharing');c.drawRightString(568,29,str(doc.page))
doc=SimpleDocTemplate(str(OUT),pagesize=(612,792),leftMargin=44,rightMargin=44,topMargin=57,bottomMargin=46,title='UCDegens Playoff Forecast - Week 10',author='UCDegens Hub')
doc.build(story,onFirstPage=chrome,onLaterPages=chrome)
reader=PdfReader(str(OUT))
assert len(reader.pages)==21, len(reader.pages)
assert all(page.extract_text().strip() for page in reader.pages)
print(f'{OUT}\n{len(reader.pages)} pages')
