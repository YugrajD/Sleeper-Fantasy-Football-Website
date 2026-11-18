"""Convert the ranking report's editable source flowables into native Word content."""
import contextlib
import io
import runpy
from pathlib import Path
from html.parser import HTMLParser
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.opc.constants import RELATIONSHIP_TYPE as RT
from reportlab.platypus import SimpleDocTemplate, Paragraph, Table, PageBreak, Spacer, KeepTogether

ROOT = Path(__file__).resolve().parents[1]
source = []
original = SimpleDocTemplate.build
def capture(self, flowables, **kwargs):
    source.extend(flowables)
SimpleDocTemplate.build = capture
try:
    with contextlib.redirect_stdout(io.StringIO()):
        runpy.run_path(str(ROOT / 'scripts/build-power-rankings-pdf.py'))
finally:
    SimpleDocTemplate.build = original

document = Document()
section = document.sections[0]
section.page_width = Inches(8.5)
section.page_height = Inches(11)
section.top_margin = Pt(52)
section.bottom_margin = Pt(52)
section.left_margin = Pt(44)
section.right_margin = Pt(44)
section.header_distance = Pt(23)
section.footer_distance = Pt(23)
styles = document.styles
for name in ['Normal', 'Title', 'Heading 1', 'Heading 2', 'Heading 3', 'Caption']:
    styles[name].font.name = 'Arial'
    styles[name].font.color.rgb = RGBColor(0, 0, 0)
    styles[name].paragraph_format.space_after = Pt(8)
styles['Normal'].font.size = Pt(11)
styles['Normal'].paragraph_format.line_spacing = Pt(15)
styles['Title'].font.name = 'Georgia'
styles['Title'].font.size = Pt(26)
styles['Title'].paragraph_format.line_spacing = Pt(32)
styles['Heading 1'].font.name = 'Georgia'
styles['Heading 1'].font.size = Pt(19)
styles['Heading 1'].font.bold = False
styles['Heading 1'].paragraph_format.space_before = Pt(0)
styles['Heading 1'].paragraph_format.space_after = Pt(12)
styles['Heading 2'].font.size = Pt(15)
styles['Heading 2'].paragraph_format.space_before = Pt(0)
styles['Heading 2'].paragraph_format.space_after = Pt(4)
for style in styles:
    for borders in style.element.findall('.//' + qn('w:pBdr')):
        borders.getparent().remove(borders)
    for fonts in style.element.findall('.//' + qn('w:rFonts')):
        for key in ['asciiTheme', 'hAnsiTheme', 'eastAsiaTheme', 'cstheme']:
            fonts.attrib.pop(qn('w:' + key), None)

class Inline(HTMLParser):
    def __init__(self, paragraph):
        super().__init__(convert_charrefs=True)
        self.paragraph = paragraph
        self.bold = 0
        self.italic = 0
        self.link = None
    def handle_starttag(self, tag, attrs):
        if tag in ['b', 'strong']: self.bold += 1
        if tag in ['i', 'em']: self.italic += 1
        if tag == 'br': self.paragraph.add_run().add_break()
        if tag == 'link': self.link = dict(attrs).get('href')
    def handle_endtag(self, tag):
        if tag in ['b', 'strong']: self.bold = max(0, self.bold - 1)
        if tag in ['i', 'em']: self.italic = max(0, self.italic - 1)
        if tag == 'link': self.link = None
    def handle_data(self, text):
        if self.link:
            element = OxmlElement('w:hyperlink')
            element.set(qn('r:id'), self.paragraph.part.relate_to(self.link, RT.HYPERLINK, is_external=True))
            run = OxmlElement('w:r')
            value = OxmlElement('w:t')
            value.text = text
            run.append(value)
            element.append(run)
            self.paragraph._p.append(element)
        else:
            run = self.paragraph.add_run(text)
            run.bold = bool(self.bold) if self.bold else None
            run.italic = bool(self.italic) if self.italic else None

def fill(paragraph, item, cell=False):
    name = item.style.name
    mapping = {'TitleDraft':'Title', 'SectionDraft':'Heading 1', 'TeamDraft':'Heading 2'}
    paragraph.style = mapping.get(name, 'Normal')
    fmt = paragraph.paragraph_format
    fmt.widow_control = True
    if name in ['SmallDraft', 'MetaDraft', 'CellDraft', 'HeadDraft']:
        fmt.line_spacing = Pt(12 if not cell else 11.5)
        fmt.space_after = Pt(8 if not cell else 0)
    if name == 'MetaDraft': fmt.keep_with_next = True
    Inline(paragraph).feed(item.text)
    for run in paragraph.runs:
        run.font.name = 'Georgia' if name in ['TitleDraft','SectionDraft'] else 'Arial'
        if name in ['SmallDraft','MetaDraft']:
            run.font.size = Pt(8.6 if name == 'SmallDraft' else 9)
            run.font.color.rgb = RGBColor.from_string('607080' if name == 'SmallDraft' else '667C37')
        if cell:
            run.font.size = Pt(8.4)
            if name == 'HeadDraft': run.bold = True

def add_table(item):
    rows = item._cellvalues
    widths = item._colWidths
    table = document.add_table(rows=0, cols=len(widths))
    table.autofit = False
    for column, width in zip(table.columns, widths): column.width = Pt(width)
    props = table._tbl.tblPr
    margins = OxmlElement('w:tblCellMar')
    for side,value in [('top',120),('bottom',120),('left',100),('right',100)]:
        node=OxmlElement(f'w:{side}');node.set(qn('w:w'),str(value));node.set(qn('w:type'),'dxa');margins.append(node)
    props.append(margins)
    for i,row in enumerate(rows):
        target = table.add_row()
        no_split = OxmlElement('w:cantSplit');target._tr.get_or_add_trPr().append(no_split)
        if i == 0: target._tr.get_or_add_trPr().append(OxmlElement('w:tblHeader'))
        for cell,width,value in zip(target.cells,widths,row):
            cell.width=Pt(width)
            tc=cell._tc.get_or_add_tcPr()
            if i==0:
                shading=OxmlElement('w:shd');shading.set(qn('w:fill'),'F3F5F6');tc.append(shading)
            borders=OxmlElement('w:tcBorders');bottom=OxmlElement('w:bottom');bottom.set(qn('w:val'),'single');bottom.set(qn('w:sz'),'4');bottom.set(qn('w:color'),'DCE1E5');borders.append(bottom);tc.append(borders)
            fill(cell.paragraphs[0],value,cell=True)
    return table

def add(item):
    if isinstance(item, Paragraph):
        paragraph = document.add_paragraph()
        fill(paragraph, item)
    elif isinstance(item, Table): add_table(item)
    elif isinstance(item, PageBreak): document.add_page_break()
    elif isinstance(item, Spacer):
        paragraph=document.add_paragraph()
        paragraph.paragraph_format.space_after=Pt(0)
        paragraph.paragraph_format.line_spacing=Pt(max(1,item.height))
        paragraph.add_run().font.size=Pt(1)
    elif isinstance(item, KeepTogether):
        before=len(document.paragraphs)
        for child in item._content: add(child)
        for paragraph in document.paragraphs[before:-1]: paragraph.paragraph_format.keep_with_next=True

header=section.header.paragraphs[0]
header.style='Normal'
header.paragraph_format.tab_stops.add_tab_stop(Pt(355))
run=header.add_run('UCDegens Power Rankings\tWeek 10  |  Results through Week 9')
run.font.size=Pt(8)
run.font.color.rgb=RGBColor(0,0,0)
footer=section.footer.paragraphs[0]
footer.paragraph_format.tab_stops.add_tab_stop(Pt(475))
footer.add_run('UCDegens  /  Week 10  /  Draft for review\t')
for name in ['PAGE','NUMPAGES']:
    if name=='NUMPAGES': footer.add_run(' / ')
    field=OxmlElement('w:fldSimple');field.set(qn('w:instr'),name);footer._p.append(field)
for run in footer.runs: run.font.size=Pt(8)
for item in source: add(item)
document.core_properties.title='UCDegens Power Rankings Week 10'
document.core_properties.author='UCDegens Hub'
document.core_properties.subject='Editable draft with results through Week 9'
out=ROOT/'output/docx/UCDegens-Power-Rankings-Week-10-Editable.docx'
out.parent.mkdir(parents=True,exist_ok=True)
document.save(out)
print(f'{out}\nNative tables: {len(document.tables)}; paragraphs: {len(document.paragraphs)}')
