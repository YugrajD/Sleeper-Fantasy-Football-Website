"""Import the commissioner-edited Week 10 PDF without replacing its commentary."""
import json,re,shutil
from pathlib import Path
from pypdf import PdfReader
ROOT=Path(__file__).resolve().parents[1]
source=Path('C:/Users/yugra/Downloads/UCDegens-Power-Rankings-Week-10!!!.pdf')
reader=PdfReader(source)
def clean_page(page):
    lines=page.extract_text().replace('\ufffd','\u2019').splitlines()
    return '\n'.join(x.strip() for x in lines if not x.startswith('UCDegens Power Rankings Week 10') and not x.startswith('UCDegens  /  Week 10'))
text='\n'.join(clean_page(p) for p in reader.pages[3:8])
blocks=re.split(r'(?m)^(\d{2}) / (.+)\s*$',text)
assert len(blocks)==37
names=[];entries=[]
scores=[112.11,108.75,108.71,105.37,102.50,101.70,100.52,100.15,95.57,92.74,89.55,82.32]
diff=[133.04,128.90,99,130.46,-66.42,16.20,43.68,-55.52,-32.04,-52.12,-79.16,-266.02]
allplay=['65-34','62-37','61-38','58-41','58-41','47-52','49-50','51-48','52-47','37-62','30-69','24-75']
luck=[.1,.4,1.5,1.7,-1.3,-.3,.5,-.6,.3,-1.4,-.7,-.2]
lineup=[136.66,129.67,133.34,121.07,124.87,129.26,120.31,124.63,101.64,109.42,114.02,106.29]
outlook=[130.82,130.69,124.20,117.26,125.56,122.11,117.90,118.80,106.36,119.86,115.84,106.58]
recent=[136.86,118.39,103.44,125.83,112.38,116.67,123.82,113.44,140.99,113.66,90.63,77.16]
eff=[93.4,94.0,89.2,90.9,91.7,91.6,88.3,89.9,85.4,88.1,83.3,84.9]
schedule=[5,11,1,3,6,9,8,3,2,10,7,12]
coverage=[[],['Week 13: TE, K'],['Week 11: K','Week 13: DEF'],['Week 11: DEF'],['Week 11: DEF'],['Week 11: TE, K'],['Week 14: TE'],['Week 14: K'],['Week 11: WR'],['Week 11: TE'],[],['Week 13: QB, K, DEF']]
def prose(x):return re.sub(r'\s+',' ',re.sub(r'(?<=\w)-\s*\n\s*(?=\w)','-',x)).strip()
def metric(label,value,values,index):
    rank=1+sum(v>values[index] for v in values)
    return dict(label=label,value=value,rank=rank,**({'tied':True} if values.count(values[index])>1 else {}))
for i in range(12):
    rank,name,body=blocks[1+3*i:4+3*i]
    assert int(rank)==i+1
    name=name.strip();names.append(name)
    header=re.search(r'POWER ([\d.]+)\s*\|\s*([\d-]+)\s*\|\s*(No change|Up \d+|Down \d+) from Week 9[^\n]*\n',body)
    assert header and float(header[1])==scores[i]
    body=body[header.end():]
    # Section headers between team writeups are not part of the preceding advice.
    body=re.sub(r'(?m)^(The top 4|In the mix|Long shots)\s*$','',body)
    parts=re.split(r'(Why here:|Weakness:|Watch out:|How to improve:)',body)
    note=prose(parts[0]);sections={parts[j][:-1]:prose(parts[j+1]) for j in range(1,len(parts),2)}
    movement=0 if header[3]=='No change' else int(header[3].split()[1])*(1 if header[3].startswith('Up') else -1)
    metrics=[metric('Point differential',f'{diff[i]:+.2f}',diff,i),metric('All-play record',allplay[i],[int(x.split('-')[0]) for x in allplay],i),{'label':'Luck · wins','value':f'{luck[i]:+.1f}'},metric('Week 10 lineup',f'{lineup[i]:.2f}',lineup,i),metric('Remaining pts / week',f'{outlook[i]:.2f}',outlook,i),metric('Last 3 weeks · PPG',f'{recent[i]:.2f}',recent,i),metric('Lineup efficiency',f'{eff[i]:.1f}%',eff,i),{'label':'Remaining schedule','value':f'#{schedule[i]} easiest'}]
    detail=dict(score=scores[i],record=header[2],tier='The top 4' if i<4 else 'In the mix' if i<9 else 'Long shots',why=sections['Why here'],weakness=sections['Weakness'],improve=sections['How to improve'],metrics=metrics,byes=[],coverage=coverage[i])
    if 'Watch out' in sections:detail['watch']=sections['Watch out']
    entries.append(dict(team=name,note=note,movement=movement,details=detail))
assert all(e['note'] and e['details']['why'] and e['details']['improve'] for e in entries)
assert len(set(names))==12
target=ROOT/'src/lib/week-ten-rankings.ts'
target.write_text('import type { PowerRank } from "@/lib/power-rankings";\n\n// Commissioner-edited Week 10 edition, November 11, 2026. Results through Week 9.\n// Preserves names, projections, and commentary at the time of publication.\nexport const weekTenRankings: PowerRank[] = '+json.dumps(entries,ensure_ascii=False,indent=2)+';\n',encoding='utf-8')
public=ROOT/'public/rankings/ucdegens-week-10.pdf';public.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,public)
print('Imported 12 teams, all commentary and 96 metrics; original PDF available at /rankings/ucdegens-week-10.pdf')
