"""Adds to each story JSON the atlas region every illustrated page of its template shows (pixels, 1024x1536, top-left origin)."""
import json,sys,glob,os
from pypdf import PdfReader
from pypdf.generic import ContentStream
SRC,OUT=sys.argv[1],sys.argv[2]
def crop(page,reader):
    ops=ContentStream(page.get_contents(),reader).operations
    for i,(operands,operator) in enumerate(ops):
        if operator!=b'Do':continue
        matrix=clip=None
        for prior,op in reversed(ops[:i]):
            if matrix is None and op==b'cm' and len(prior)==6 and abs(float(prior[0]))>100 and abs(float(prior[3]))>100:matrix=[float(v) for v in prior]
            if clip is None and op==b're' and len(prior)==4:clip=[float(v) for v in prior]
            if matrix and clip:break
        if not (matrix and clip):continue
        a,_,_,d,e,f=matrix;cx,cy,cw,ch=clip
        return [round((cx-e)/a*1024),round((1-(cy+ch-f)/d)*1536),round((cx+cw-e)/a*1024),round((1-(cy-f)/d)*1536)]
    raise ValueError('no illustration on page')
for path in sorted(glob.glob(OUT+'/*.json')):
    name=os.path.basename(path)[:-5];reader=PdfReader(f'{SRC}/{name}.pdf')
    crops=[crop(reader.pages[n-1],reader) for n in (1,4,7,10,13,16,19,24)]
    assert all(0<=x0<x1<=1024 and 0<=y0<y1<=1536 and x1-x0>400 and y1-y0>150 for x0,y0,x1,y1 in crops),(name,crops)
    story=json.load(open(path,encoding='utf-8'));story['crops']={'cover':crops[0],'chapters':crops[1:7],'end':crops[7]}
    json.dump(story,open(path,'w',encoding='utf-8'),ensure_ascii=False,indent=1)
    if name.startswith('amizade'):print(name,crops)
print('ok')
