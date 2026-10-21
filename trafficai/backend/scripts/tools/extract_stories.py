"""Extracts the story text of every delivery template into JSON, so books can be typeset from data."""
import json,re,sys,glob,os
from pypdf import PdfReader
SRC,OUT=sys.argv[1],sys.argv[2]
os.makedirs(OUT,exist_ok=True)
HERO=re.compile(r'(?i)\b[ao]\s+(?:menina|menino|crian[cç]a)\b')
clean=lambda s:HERO.sub('{nome}',re.sub(r'\s+',' ',s).strip())
def chunks(page):
    rows=[]
    def visit(text,cm,tm,font,size):
        if text.strip():rows.append((round(cm[5],1),round(size,1),text.strip()))
    page.extract_text(visitor_text=visit)
    return rows
def by_size(page,size):return clean(' '.join(t for _,s,t in chunks(page) if s==size))
def body(page):
    """Paragraphs of a text page: each paragraph is drawn in its own text block (same origin)."""
    paragraphs=[];origin=None
    for y,size,text in chunks(page):
        if size!=17:continue
        if y!=origin:paragraphs.append([]);origin=y
        paragraphs[-1].append(text)
    return [clean(' '.join(p)) for p in paragraphs]
count=0
for path in sorted(glob.glob(SRC+'/*-men*.pdf')):
    name=os.path.basename(path)[:-4]
    if 'colorir' in name:continue
    pages=PdfReader(path).pages
    story={'title':by_size(pages[0],29),'subtitle':by_size(pages[0],12),'tagline':by_size(pages[0],13),'chapters':[]}
    for c in range(6):
        story['chapters'].append({'title':by_size(pages[3+c*3],27),'caption':by_size(pages[3+c*3],16),
            'pages':[body(pages[4+c*3]),body(pages[5+c*3])]})
    talk=[t.strip() for t in (pages[21].extract_text() or '').split('\n') if t.strip()]
    talk=talk[talk.index('Vamos conversar?')+1:]
    numbered=[i for i,t in enumerate(talk) if re.match(r'^\d+\.',t)]
    # a question may wrap onto the next line; the closing note starts after the last question mark
    questions=[];closing=[]
    for i,t in enumerate(talk[numbered[0]:]):
        if re.match(r'^\d+\.',t):questions.append(re.sub(r'^\d+\.\s*','',t))
        elif not questions[-1].endswith('?'):questions[-1]+=' '+t
        else:closing.append(t)
    story['talk']={'intro':clean(' '.join(talk[:numbered[0]])),'questions':[clean(q) for q in questions],'closing':clean(' '.join(closing))}
    end=[t.strip() for t in (pages[23].extract_text() or '').split('\n') if t.strip()]
    story['moral_line']=story['talk']['closing']
    assert story['title'] and story['subtitle'] and story['tagline'],name
    assert all(ch['title'] and ch['caption'] and all(len(p)==2 and all(len(x)>80 for x in p) for p in ch['pages']) for ch in story['chapters']),name
    assert len(story['talk']['questions'])>=3 and story['talk']['closing'],name
    json.dump(story,open(f'{OUT}/{name}.json','w',encoding='utf-8'),ensure_ascii=False,indent=1);count+=1
print('historias',count)
