"""Render the saved Week 10 power-ranking snapshot into a commissioner-review PDF."""
import html
import json
from pathlib import Path
from datetime import datetime, timedelta, timezone
from reportlab.pdfgen import canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
REPORT = json.loads((ROOT / 'output/power-rankings/week-10-preview.json').read_text(encoding='utf-8'))
RANKINGS = REPORT['rankings']
assert len(RANKINGS) == 12 and REPORT['throughWeek'] == 9 and REPORT['enteringWeek'] == 10
CHECKS = json.loads((ROOT / 'output/power-rankings/historical-comparison.json').read_text(encoding='utf-8'))
OUT = ROOT / 'output/pdf/UCDegens-Power-Rankings-Week-10-Draft.pdf'
OUT.parent.mkdir(parents=True, exist_ok=True)
for name, filename in [('Body', 'arial.ttf'), ('Body-Bold', 'arialbd.ttf'), ('Body-Italic', 'ariali.ttf'), ('Display', 'georgia.ttf')]:
    pdfmetrics.registerFont(TTFont(name, f'C:/Windows/Fonts/{filename}'))
pdfmetrics.registerFontFamily('Body', normal='Body', bold='Body-Bold', italic='Body-Italic', boldItalic='Body-Bold')
INK = colors.HexColor('#182536')
MUTED = colors.HexColor('#607080')
RULE = colors.HexColor('#dce1e5')
PALE = colors.HexColor('#f3f5f6')
ACCENT = colors.HexColor('#667c37')
WIDTH = 524
STYLES = getSampleStyleSheet()
STYLES.add(ParagraphStyle(name='TitleDraft', fontName='Display', fontSize=26, leading=32, textColor=INK, spaceAfter=13))
STYLES.add(ParagraphStyle(name='SectionDraft', fontName='Display', fontSize=19, leading=24, textColor=INK, spaceAfter=12))
STYLES.add(ParagraphStyle(name='TeamDraft', fontName='Body-Bold', fontSize=15, leading=20, textColor=INK, spaceAfter=4))
STYLES.add(ParagraphStyle(name='CopyDraft', fontName='Body', fontSize=10.5, leading=14.5, textColor=INK, spaceAfter=9))
STYLES.add(ParagraphStyle(name='SmallDraft', fontName='Body', fontSize=8.6, leading=12, textColor=MUTED, spaceAfter=8))
STYLES.add(ParagraphStyle(name='MetaDraft', fontName='Body', fontSize=9, leading=13, textColor=ACCENT, spaceAfter=12))
STYLES.add(ParagraphStyle(name='CellDraft', fontName='Body', fontSize=8.4, leading=11.5, textColor=INK))
STYLES.add(ParagraphStyle(name='HeadDraft', fontName='Body-Bold', fontSize=8.2, leading=11, textColor=INK))

def p(text, style='CopyDraft'):
    return Paragraph(text, STYLES[style])

def esc(text):
    return html.escape(str(text)).replace('\u2013', '-').replace('\u2014', '-')

def number(value):
    return f'{value:.2f}'

PREVIOUS = {9:1, 8:2, 4:3, 7:4, 11:5, 3:6, 2:7, 10:8, 1:9, 12:10, 6:11, 5:12}
ALIASES = {7:'Previously Jacobs Combos', 6:"Previously I'm Gonna Nix Myself", 5:'Previously Bye Week'}
def movement(team, index):
    delta = PREVIOUS[team['id']] - index
    return f'Up {delta}' if delta > 0 else f'Down {-delta}' if delta < 0 else 'No change'

def factor_rank(team, key, reverse=False):
    values = sorted([entry['metrics'][key] for entry in RANKINGS], reverse=not reverse)
    return 1 + sum((value > team['metrics'][key] if not reverse else value < team['metrics'][key]) for value in values)

COPY = {
9: {
 'overview': "The No. 1 spot survives another week, and this time there is less room for debate. A 143.28 against Daddymundo moves Hertz to 6-3. It has the best all-play record, the most points scored, a strong lineup-efficiency mark, and the highest projected remaining scoring. There is a difference between getting hot and having the roster to stay hot. This team is doing both.",
 'why': "First in all-play, next-week lineup strength, and remaining projected scoring. Recent form and lineup efficiency both add to the lead.",
 'weakness': "Depth matters when several starters disappear at once. The Week 11 combination drops to 122.46, with Kenny Gainwell replacing some of the usual backfield strength.",
 'watch': "Week 11 is the lowest projected week on this roster. Week 13 also calls for Chig Okonkwo rather than Tyler Warren at TE.",
 'improve': "Shop for affordable depth, not a new identity. Keep the McCaffrey-Williams foundation intact and make sure the Week 11 replacement is someone you would actually feel comfortable starting."
},
4: {
 'overview': "The spreadsheet moves Kousins to second, but this is a photo finish: the margin over Jerry is less than 0.05 power-score points. A 118.16 win gets the record to 6-3. The real strength is the full-season combination of scoring, an excellent all-play record, and the league's highest lineup efficiency. The manager keeps getting the points off the bench and onto the scoreboard.",
 'why': "The second-best all-play record and second-best remaining scoring outlook, plus the best lineup efficiency. Those edges barely outweigh Jerry's better record and softer schedule.",
 'weakness': "Week 13 is a trap. The current roster has no eligible projected TE or kicker that week, and the best lineup falls to 104.74 with those slots left empty.",
 'watch': "The next three projections are strong, especially Week 12. Do not let a preventable Week 13 lineup hole undo that work.",
 'improve': "Arrange a TE and kicker replacement before Week 13. A small streaming move matters more here than paying a premium for another star."
},
8: {
 'overview': "Jerry gets the win back, 110.76 to 93.16 over aa3345, and remains tied for the best record at 7-2. The recent scoring is less convincing: 103.44 per week over the last three, tenth in the league. This is still a top-three roster with an exceptionally friendly remaining schedule. It is also a reminder that a great record does not make the weekly scoring automatic.",
 'why': "The joint-best record, a strong Week 10 lineup, and the easiest remaining schedule. Kousins edges ahead on efficiency and the remaining scoring outlook.",
 'weakness': "Momentum. The last-three-week average is dragging the score down despite a roster that still projects well.",
 'watch': "The current roster leaves kicker empty in Week 11 and defense empty in Week 13. Week 14 also makes the Dallas-heavy build less comfortable.",
 'improve': "Fix the streaming slots and preserve the reliable starters. A steady depth option is useful; a panic trade after a couple of quiet weeks is not."
},
11: {
 'overview': "A 129.64 win over Im ovulating keeps SWKL at 7-2. The record is excellent, the scoring differential is strong, and the recent average is healthy. It finally climbs from fifth to fourth. The all-play record still trails the other top teams, though, and the full remaining lineup outlook is closer to league average than the win-loss column makes it look.",
 'why': "The joint-best record, a strong point differential, and 125.83 PPG over the last three weeks. The all-play record supports a good team, even if it does not quite support the top spot.",
 'weakness': "Week 11 depth. With the current roster, the best projected lineup falls to 96.93 and has no defense.",
 'watch': "The Week 11 lineup needs Roschon Johnson and Rachaad White in the backfield. That is a much different week from simply penciling Bijan into the lineup.",
 'improve': "Find a Week 11 RB option and stream a defense. Buying one usable week of depth is more urgent than adding another name for the bench."
},
7: {
 'overview': "The name changed; the frustrating gap between the roster and the record did not. An 87.06 against SWKL makes it 4-5, but the 58-41 all-play record is tied with SWKL. That scoring would imply about 5.27 wins against an average schedule. The projected lineup is still good enough to push back into the playoff picture, provided the latest low week does not become a habit.",
 'why': "The all-play record and remaining lineup outlook carry a below-.500 team above the middle. The model rates the roster more highly than the actual record.",
 'weakness': "The negative point differential and middling recent scoring keep it out of the top tier. Week 11 is also thin once the usual core is unavailable.",
 'watch': "The best lineup dips to 108.07 in Week 11 and currently has an empty defense slot. Later weeks recover into the high 120s and low 130s.",
 'improve': "Protect the JSN-Olave-Taylor core, set the lineup carefully, and make the small Week 11 depth moves now. The path back does not require tearing down the roster."
},
2: {
 'overview': "Two straight losses have the record at 4-5, but the current lineup still looks stronger than the record. Josh Allen and Amon-Ra anchor a Week 10 projection of 129.26. The catch is that the all-play record is only 47-52: this is not a dominant team being robbed every week. It is a capable roster that needs to turn the good names into a steadier weekly score.",
 'why': "The Week 10 lineup and remaining scoring outlook lift the team above average. The losing record and below-.500 all-play record push in the other direction.",
 'weakness': "Week 11 coverage. The current roster has no projected TE or kicker that week, and the total falls to 105.61.",
 'watch': "Week 11 is the clear dip; the other four projected lineups all clear 122.00. Filling those two empty spots could materially change the outlook.",
 'improve': "Prioritize a usable TE and kicker for Week 11. A small depth move makes more sense than breaking up Allen and Amon-Ra to chase a splashier headline."
},
3: {
 'overview': "The 125.66 loss to Puka drops Maye to 5-4, but there is no collapse here. The last-three-week average is 123.82 and the point differential remains positive. The more cautious reading comes from the 49-50 all-play record and an ordinary remaining lineup projection. There is enough to compete, but the weekly floor depends heavily on getting the supporting spots right.",
 'why': "A winning record, positive point differential, and good recent scoring. The all-play record and current roster outlook keep the power score close to the league average.",
 'weakness': "Lineup efficiency is below average, and the supporting RB/WR choices are less secure than the Maye-Chase-McBride core.",
 'watch': "Week 14 currently leaves TE empty. The projected lineup is 102.53 that week, compared with 126.42 in Week 12.",
 'improve': "Plan the McBride replacement and favor reliable volume in the flex. There is more value in tightening the last few starting spots than in replacing the stars."
},
1: {
 'overview': "A 109.24 win over the team formerly called I'm Gonna Nix Myself gets Brandon to 4-5 and into eighth in these rankings. The all-play record is a little above .500, so the actual record still undersells the season slightly. The backfield is a real foundation. The remaining lineup average, however, stays below 120.00, which leaves little room for shaky receiving or tight-end weeks.",
 'why': "A slightly positive all-play record and a Week 10 lineup that grades above the league average. The negative point differential and losing record hold the score near 100.",
 'weakness': "The projected receiving and TE contribution still trails the top teams. Availability changes could shift the Rice-Tate-Brown combination quickly.",
 'watch': "The Week 14 lineup has no kicker. The five-week projection also slopes downward from 124.63 to 110.50 before any roster changes.",
 'improve': "Look for one dependable receiver or TE upgrade at a sensible price. Keep the backfield strength, and handle the Week 14 kicker before it becomes a Sunday problem."
},
10: {
 'overview': "The strangest profile in the league: three-week scoring leader at 140.99, a 148.10 win in Week 9, and a 5-4 record - yet ninth in power. This is a forward-looking injury adjustment, not punishment for the recent results. Puka is excluded for the rest of the regular season in this draft, and the Week 10 byes remove several more useful players. Yesterday's points do not fill tomorrow's WR slot.",
 'why': "The best momentum score and a winning record help. The lowest Week 10 lineup projection and a bottom-two remaining scoring outlook hurt much more under the published weights.",
 'weakness': "Immediate WR depth. The projected Week 10 lineup leans on Konata Mumpfield and KC Concepcion; the current Week 11 roster cannot fill the second WR slot.",
 'watch': "Week 10 projects for 101.64. Burden and Loveland reappear in Week 11, but Concepcion's absence still leaves a WR hole. Puka's recovery is not assumed.",
 'improve': "Find a healthy receiver who can start in Week 11 as well as now. Keep the useful RB depth unless a trade clearly improves the starting lineup. The target is survival through the byes, not replacing Puka with one desperate deal."
},
6: {
 'overview': "The record is 2-7, but the rest of the profile is less hopeless. The all-play record implies about 3.36 wins, so there has been some schedule pain. A 102.68 loss to Brandon does not help the comeback, though. Jefferson, Moore, Irving, and Hubbard give the future lineups some substance. The challenge is turning that projected talent into wins before the calendar runs out.",
 'why': "Recent scoring and the remaining lineup outlook are stronger than those of the bottom two teams. Seven losses and a poor all-play record still carry a large penalty.",
 'weakness': "The Week 10 combination needs Drew Lock and Kaleb Johnson, while the record leaves little margin for another patchwork loss.",
 'watch': "Week 11 currently has no TE. The Week 13 lineup is the brightest spot at 127.51 if the projected returning starters are available.",
 'improve': "Prioritize current-week QB/RB usability and a Week 11 TE. If making a trade, buy points that can go into the lineup immediately rather than a distant upside story."
},
12: {
 'overview': "A 110.98 loss to Kousins was more competitive than the two weeks before it, but the record is now 2-7. The last-three-week average is still only 90.63, and lineup efficiency remains the lowest in the league. The projected roster is not the worst. That distinction matters only if the manager turns the available players into a consistently legal, useful starting lineup.",
 'why': "The remaining lineup outlook is better than the record suggests, but the losses, all-play record, recent scoring, and efficiency all pull the score down.",
 'weakness': "Execution. The gap between actual and optimal scoring is larger than anyone else's, and another low-output week is expensive at this record.",
 'watch': "The best projected lineups are fully filled in all five remaining weeks. Week 11 is the lowest total at 111.80, but it is a depth issue rather than an empty-slot emergency.",
 'improve': "Make the start/sit decisions deliberately and pursue one steady WR/RB upgrade. Do not pay for a backup while leaving a better scorer on the bench."
},
5: {
 'overview': "A new name cannot hide a 68.12 against Hertz. Daddymundo is 2-7, last in all-play, last in point differential, and last in recent scoring. The 24-75 all-play record says this is mostly a scoring problem rather than a run of unlucky opponents. Barkley and a healthier receiving group can improve individual weeks, but the roster still needs basic coverage before it needs a miracle.",
 'why': "The weakest results profile across the major categories. The current and remaining projected lineups also sit near the bottom.",
 'weakness': "The Week 13 roster has no QB, kicker, or defense. The resulting 80.99 projection is a warning about coverage, not an unavoidable prediction.",
 'watch': "Weeks 11, 12, and 14 all project above 114.00. That makes the Week 13 hole a specific problem worth solving, even this late in the season.",
 'improve': "Fill the Week 13 QB, K, and DEF slots, then seek a healthy every-week scorer. Treat the last few weeks as a chance to field a competitive lineup, not as a reason to leave points unclaimed."
},
}

def table(headers, rows, widths, font=8.4):
    assert sum(widths) <= WIDTH
    cells = [[p(esc(x).replace('\n', '<br/>'), 'HeadDraft') for x in headers]] + [[p(esc(x).replace('\n', '<br/>'), 'CellDraft') for x in row] for row in rows]
    item = Table(cells, colWidths=widths, repeatRows=1, hAlign='LEFT')
    item.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), PALE), ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LINEBELOW', (0,0), (-1,0), 0.8, INK), ('LINEBELOW', (0,1), (-1,-1), 0.35, RULE),
        ('LEFTPADDING', (0,0), (-1,-1), 6), ('RIGHTPADDING', (0,0), (-1,-1), 6),
        ('TOPPADDING', (0,0), (-1,-1), 8), ('BOTTOMPADDING', (0,0), (-1,-1), 8),
    ]))
    return item

class PageNumbers(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.saved_pages = []
    def showPage(self):
        self.saved_pages.append(dict(self.__dict__))
        self._startPage()
    def save(self):
        total = len(self.saved_pages)
        for state in self.saved_pages:
            self.__dict__.update(state)
            self.setStrokeColor(RULE)
            self.line(44, 39, 568, 39)
            self.setFont('Body', 7.5)
            self.setFillColor(MUTED)
            self.drawString(44, 27, 'UCDegens  /  Week 10  /  Draft for review')
            self.drawRightString(568, 27, f'{self._pageNumber} / {total}')
            super().showPage()
        super().save()

def header(c, doc):
    c.saveState()
    c.setFont('Body', 8)
    c.setFillColor(MUTED)
    c.drawString(44, 763, 'UCDegens Power Rankings')
    c.drawRightString(568, 763, 'WEEK 10  |  RESULTS THROUGH WEEK 9')
    c.setStrokeColor(RULE)
    c.line(44, 753, 568, 753)
    c.restoreState()

story = []
def add(text, style='CopyDraft'):
    story.append(p(text, style))
def page():
    story.append(PageBreak())

add('UCDegens Power Rankings:<br/>Week 10', 'TitleDraft')
add('NOVEMBER 11, 2026  /  DRAFT FOR COMMISSIONER REVIEW', 'MetaDraft')
add("The record is real. So are the injury reports.", 'SectionDraft')
add("Week 9 gave us a 148.10 from Puka's team, another 143.28 from Hertz, and two teams sitting at 7-2. It also left the hottest recent scorer figuring out how to replace Puka. The standings remember the points you already scored. These rankings also ask who is available to score next week.")
add("Five regular-season weeks remain and eight teams make the playoffs. Hertz keeps the top spot, Kousins and Jerry are almost inseparable, and the middle is still packed. Set the lineup before bargaining with the standings.")
add('Quick takeaways', 'SectionDraft')
for line in [
    '<b>Hertz stays first.</b> Best all-play record, strongest Week 10 projected lineup, and best remaining scoring outlook.',
    '<b>Second and third are a virtual tie.</b> Kousins leads Jerry by less than 0.05 power-score points. Do not overread the order.',
    '<b>SWKL climbs to fourth.</b> A 7-2 record helps. Week 11 depth still needs attention.',
    '<b>Puka\'s team leads in recent scoring.</b> Its 140.99 last-three PPG is best in the league; injuries and byes drive the drop to ninth.',
    '<b>Plan the empty slots.</b> The current roster model leaves several teams without a starter in a later week. Those holes are fixable.',
]: add(line)
story.append(Spacer(1, 7))
add('Same weights. A reproducible score.', 'SectionDraft')
add('Record 15%  /  Point differential 10%  /  All-play 20%  /  Week 10 lineup 20%<br/>Remaining scoring 15%  /  Last three weeks 10%  /  Efficiency 5%  /  Remaining schedule 5%', 'SmallDraft')
add('<b>Power score = 100 + 10 x weighted z-score.</b> Each factor is measured against the league average and spread. A score of 100 is average. Full definitions and the historical comparison are on page 10.', 'SmallDraft')
page()

add('Power scores / Results', 'TitleDraft')
add('Results through Week 9. Movement compares with the published Week 9 edition.', 'SmallDraft')
rows=[]
for i,t in enumerate(RANKINGS,1):
    wins=int(t['record'].split('-')[0]); luck=wins-t['metrics']['allPlay']*9
    rows.append([i,t['team'],f"{t['score']:.2f}",movement(t,i),t['record'],f"{t['metrics']['pointDifferential']*9:+.2f}",t['allPlayRecord'],f'{luck:+.1f}'])
story.append(table(['#','Team','Power','Move','W-L','Point diff.','All-play','Luck'],rows,[28,162,45,60,35,65,60,69]))
story.append(Spacer(1,16))
add('<b>All-play:</b> the record a team would have earned by playing every other team each week. <b>Luck:</b> actual wins minus expected wins from the all-play win percentage. Positive means more wins than the scoring profile implies.', 'SmallDraft')
add('The top two records belong to Jerry and SWKL. The best all-play record belongs to Hertz. That is why the formula does not simply sort the standings.', 'CopyDraft')
add('Names follow the current Sleeper roster. Im ovulating was Jacobs Combos; Fuck You Navin was I\'m Gonna Nix Myself; Daddymundo was Bye Week. Movement follows the roster, not the name.', 'SmallDraft')
page()

add('Roster / Outlook', 'TitleDraft')
add('Fresh roster and projection snapshot. All fantasy-point values use this league\'s scoring settings. Parentheses show rank within the 12-team league.', 'SmallDraft')
rows=[]
for i,t in enumerate(RANKINGS,1):
    m=t['metrics']; schedule_rank=factor_rank(t,'schedule',True)
    rows.append([i,t['team'],f"{m['lineup']:.2f} ({factor_rank(t,'lineup')})",f"{m['outlook']:.2f} ({factor_rank(t,'outlook')})",f"{m['momentum']:.2f} ({factor_rank(t,'momentum')})",f"{m['efficiency']*100:.1f}%",f'#{schedule_rank}'])
story.append(table(['#','Team','Week 10\nlineup','Remaining\npts / week','Last 3\nPPG','Lineup\nefficiency','Schedule\neasiest'],rows,[28,147,75,80,70,70,54]))
story.append(Spacer(1,16))
add('<b>Lineup:</b> the best legal starting combination for Week 10 from the current active roster. <b>Remaining scoring:</b> the average of that calculation repeated independently for Weeks 10-14. It does not use the playoff simulator\'s 80/20 blend.', 'SmallDraft')
add('<b>Important:</b> players on bye are excluded. Empty slots score zero. The model assumes no future pickups or trades, so a low projected week may describe an easy roster fix rather than lasting team weakness.', 'SmallDraft')
add('Current out/doubtful tags affect Week 10. IR/PUP/NFI players and reserve/taxi players are excluded throughout. Puka is explicitly excluded for the remaining regular season; no return date is invented. Future injury recoveries are otherwise uncertain.', 'SmallDraft')
page()

for offset in range(0,12,2):
    tier='The top 4' if offset<4 else 'In the mix' if offset<8 else 'Long shots'
    add(tier, 'SectionDraft')
    for index in range(offset,offset+2):
        t=RANKINGS[index]; copy=COPY[t['id']]
        section=[p(f"{index+1:02d} / {esc(t['team'])}",'TeamDraft'),p(f"POWER {t['score']:.2f}  |  {t['record']}  |  {movement(t,index+1)} from Week 9" + (f"  |  {esc(ALIASES[t['id']])}" if t['id'] in ALIASES else ''),'MetaDraft'),p(esc(copy['overview']))]
        for label,key in [('Why here','why'),('Weakness','weakness'),('Watch out','watch'),('How to improve','improve')]:
            section.append(p(f'<b>{label}:</b> {esc(copy[key])}'))
        story.append(KeepTogether(section))
        if index==offset:
            story.append(Spacer(1,15))
    page()

add('The next five weeks', 'TitleDraft')
add('Open starting positions on current rosters, after optimizing lineups. This is a coverage check, not a prediction that managers will leave slots empty. Hertz and Chase Brown Kids fill every slot in all five weeks.', 'SmallDraft')
rows=[]
for t in RANKINGS:
    gaps=[]
    for week in t['weekly']:
        openings=[p['slot'] for p in week['lineup'] if p['player'] is None]
        if openings: gaps.append(f"W{week['week']}: {', '.join(openings)}")
    if gaps: rows.append([t['team'],'; '.join(gaps)])
story.append(table(['Team','Coverage gaps'],rows,[210,314]))
story.append(Spacer(1,13))
add('Methodology / Checks', 'SectionDraft')
add('Record uses win percentage; point differential is per completed week; all-play uses wins plus half of ties. Momentum averages the last three completed weeks. Efficiency is total actual points divided by total optimal points. Remaining schedule is the mean season all-play win percentage of future opponents, reversed so easier is better.', 'SmallDraft')
add('Normalization uses population standard deviation. A factor with no variation contributes zero. The eight weights are unchanged; scores are sorted before rounding. With the published Week 8 and Week 9 snapshot inputs, the calculation reproduced 12 of 12 positions in each edition. Average score differences were 0.10 and 0.11. That check used inverted schedule rank because the original raw schedule values were unavailable; this draft uses actual opponent all-play strength.', 'SmallDraft')
add('Sources / Limits', 'SectionDraft')
add('Sleeper public league API: <link href="https://api.sleeper.app/v1/league/1389131126982860800">league 1389131126982860800</link>; completed matchup scores and rosters. Sleeper weekly player projections: api.sleeper.com/projections/nfl/2026/{week}. Snapshot captured November 11, 2026; results stop at Week 9. The original Week 8/9 editions supply the weights, historical comparison, and prior positions.', 'SmallDraft')
add('Injury adjustment: <link href="https://www.therams.com/news/rams-injury-updates-puka-nacua-likely-going-on-injured-reserve-after-sustaining-mcl-pcl-sprain-and-turf-toe-against-commanders-latest-on-steve-avila-and-trent-mcduffie">Rams injury update, November 9</link>. Forecasts depend on current tags and projections; they do not predict future transactions or guarantee a recovery date. Writeups are generated editorial analysis for commissioner review, not quotes from the prior author.', 'SmallDraft')

doc=SimpleDocTemplate(str(OUT),pagesize=(612,792),leftMargin=44,rightMargin=44,topMargin=52,bottomMargin=52,title='UCDegens Power Rankings: Week 10 - Draft',author='UCDegens Hub',subject='Results through Week 9; November 11, 2026 snapshot')
doc.build(story,onFirstPage=header,onLaterPages=header,canvasmaker=PageNumbers)
reader=PdfReader(OUT)
print(f'{OUT}\nPages: {len(reader.pages)}')
for i,page in enumerate(reader.pages,1):
    print(i,len(page.extract_text() or ''))
