"""Record-only clinch/elimination proofs, allowing future tied matchups.

Week 10 outcomes are conditional on current leaders holding. Future PF ties
are always resolved against a clinch and in favor of avoiding elimination.
"""
import json,itertools
from pathlib import Path
R=json.loads(Path('output/playoff-clinches/live.json').read_text(encoding='utf-8'))
ids=sorted(r['roster_id'] for r in R['rosters'])
names={r['roster_id']:next(u.get('metadata',{}).get('team_name') or u['display_name'] for u in R['users'] if u['user_id']==r['owner_id']).strip() for r in R['rosters']}
base={r['roster_id']:2*r['settings']['wins']+r['settings']['ties'] for r in R['rosters']}
def pairs(week):
 groups={}
 for m in R['matchups'][str(week)]:groups.setdefault(m['matchup_id'],[]).append(m)
 assert len(groups)==6 and all(len(g)==2 for g in groups.values())
 return [(v[0]['roster_id'],v[1]['roster_id']) for k,v in sorted(groups.items())]
for a,b in pairs(10):
 rows={m['roster_id']:m for m in R['matchups']['10']}
 pa=rows[a]['custom_points'] if rows[a].get('custom_points') is not None else rows[a]['points']
 pb=rows[b]['custom_points'] if rows[b].get('custom_points') is not None else rows[b]['points']
 base[a]+=2 if pa>pb else 1 if pa==pb else 0
 base[b]+=2 if pb>pa else 1 if pa==pb else 0

def maxflow_demands(selected,demands,games):
 demand=sum(demands[i] for i in selected)
 if demand==0:return True
 active=[(a,b) for a,b in games if a in selected or b in selected]
 if 2*len(active)<demand:return False
 # Integral game points: 2-0, 1-1, or 0-2, so ties are included exactly.
 sink=1+len(active)+len(selected);graph=[{} for _ in range(sink+1)]
 def edge(a,b,c):graph[a][b]=c;graph[b].setdefault(a,0)
 nodes={x:1+len(active)+i for i,x in enumerate(selected)}
 for k,(a,b) in enumerate(active,1):
  edge(0,k,2)
  for x in (a,b):
   if x in nodes:edge(k,nodes[x],2)
 for x in selected:edge(nodes[x],sink,demands[x])
 flow=0
 while flow<demand:
  prev={0:None};q=[0]
  for v in q:
   for n,c in graph[v].items():
    if c>0 and n not in prev:prev[n]=v;q.append(n)
   if sink in prev:break
  if sink not in prev:return False
  n=sink;amount=2
  while prev[n] is not None:amount=min(amount,graph[prev[n]][n]);n=prev[n]
  n=sink
  while prev[n] is not None:
   v=prev[n];graph[v][n]-=amount;graph[n][v]+=amount;n=v
  flow+=amount
 return True

def status(target,points,games):
 others=[i for i in ids if i!=target]
 # A target losing out minimizes its record and grants all opponents wins.
 worst=points.copy();remaining=[]
 for a,b in games:
  if a==target:worst[b]+=2
  elif b==target:worst[a]+=2
  else:remaining.append((a,b))
 counts={i:sum(i in g for g in remaining) for i in others}
 candidates=[i for i in others if worst[i]+2*counts[i]>=worst[target]]
 clinched=True
 if len(candidates)>=8:
  demands={i:max(0,worst[target]-worst[i]) for i in candidates}
  for selected in itertools.combinations(candidates,8):
   if maxflow_demands(selected,demands,remaining):clinched=False;break
 # A target winning out maximizes its record. To survive top eight, four
 # other teams must be able to stay at or below its record (PF favorable).
 ceiling=points[target]+2*sum(target in g for g in games)
 low=[i for i in others if points[i]<=ceiling]
 eliminated=True
 for selected in itertools.combinations(low,4):
  cap={i:ceiling-points[i] for i in selected};feasible=True
  # Four selected teams: check every capacity-cut inequality for their
  # internal games. All games against unselected teams can be losses.
  for n in range(1,5):
   for subset in itertools.combinations(selected,n):
    required=2*sum(a in subset and b in subset for a,b in remaining)
    if required>sum(cap[i] for i in subset):feasible=False;break
   if not feasible:break
  if feasible:eliminated=False;break
 return {'clinched':clinched,'eliminated':eliminated}

week11=pairs(11);later=[g for w in range(12,15) for g in pairs(w)]
now={i:status(i,base,week11+later) for i in ids}
cases=[]
# Include Week 11 ties, not just the usual 64 decisive-outcome combinations.
for outcomes in itertools.product([0,1,2],repeat=6):
 points=base.copy()
 for (a,b),award in zip(week11,outcomes):points[a]+=award;points[b]+=2-award
 cases.append({'outcomes':outcomes,'statuses':{i:status(i,points,later) for i in ids}})
report={'captured':R['captured'],'conditional':'Week 10 current leaders hold; stat corrections ignored','names':names,'week10RecordUnits':base,'week11':week11,'now':now,'cases':cases}
Path('output/playoff-clinches/scenarios.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('Conditional records after Week 10:',{names[i]:f'{base[i]/2:g} wins-equivalent' for i in ids})
print('Status before Week 11:',{names[i]:s for i,s in now.items() if s['clinched'] or s['eliminated']})
for i in ids:
 for label in ['clinched','eliminated']:
  matches=[c for c in cases if c['statuses'][i][label]]
  if not matches:continue
  print('\n',names[i],label, len(matches),'of',len(cases))
  # Print minimal sufficient clauses: a subset of specified match results
  # guarantees this status regardless of every unspecified result.
  clauses=[]
  for n in range(0,7):
   for selected in itertools.combinations(range(6),n):
    for values in itertools.product([0,1,2],repeat=n):
     clause=tuple(zip(selected,values))
     if any(set(old).issubset(clause) for old in clauses):continue
     applicable=[c for c in cases if all(c['outcomes'][j]==v for j,v in clause)]
     if all(c['statuses'][i][label] for c in applicable):clauses.append(clause)
   if clauses and n>=3:break
  for clause in clauses:
   parts=[]
   for j,v in clause:
    a,b=week11[j]
    parts.append((names[a]+' ties '+names[b]) if v==1 else (names[a]+' beats '+names[b]) if v==2 else (names[b]+' beats '+names[a]))
   print(' AND '.join(parts) or 'Already guaranteed')
