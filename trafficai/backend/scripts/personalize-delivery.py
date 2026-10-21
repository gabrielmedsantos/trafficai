"""Fill shared name widgets and paint each appearance with a unique XObject.

No rasterization or image generation: preserves the original illustrations.
Uses stdin for personal information, avoiding names in process command lines.
"""
import json,sys,os,hashlib,re
import unicodedata
from pathlib import Path
from pypdf import PdfReader,PdfWriter
from pypdf.generic import NameObject,DictionaryObject,DecodedStreamObject,ArrayObject,TextStringObject,ByteStringObject,ContentStream,NumberObject,StreamObject
from pypdf._page import PageObject
from pypdf._font import Font

def personalize_story_page(page, pdf, name):
    """Replace generic protagonist references in existing text streams.

    Templates use embedded subset fonts, so write the name through each font's
    ToUnicode map instead of drawing over the page or flattening its artwork.
    """
    fonts=page.get('/Resources',{}).get('/Font',{})
    maps={}
    for key,ref in fonts.items():
        font=ref.get_object()
        cmap=font.get('/ToUnicode')
        if not cmap:continue
        data=cmap.get_object().get_data().decode('latin1')
        codes={int(code,16):bytes.fromhex(char).decode('utf-16-be',errors='ignore')
               for code,char in re.findall(r'<([0-9A-Fa-f]{2})>\s*<([0-9A-Fa-f]{4,})>',data)}
        reverse={char:code for code,char in codes.items() if char and char!='\x00'}
        maps[str(key)]=(codes,reverse)
    content=ContentStream(page.get_contents(),pdf)
    font_name=None;changed=False;previous=None
    replacements=re.compile(r'(?i)\b[ao]\s+(?:menina|menino|crian[cç]a)\b')
    split_noun=re.compile(r'(?i)^(?:menina|menino|crian[cç]a)\b')
    trailing_article=re.compile(r'(?i)\b[ao]\s*$')
    def encode_text(text,reverse):
        encoded=[]
        for char in text:
            code=reverse.get(char)
            if code is None:
                decomposed=''.join(c for c in unicodedata.normalize('NFKD',char) if not unicodedata.combining(c))
                code=next((reverse.get(c) for c in decomposed if reverse.get(c) is not None),None)
            if code is None:raise ValueError('O nome da criança contém um caractere que o template não suporta.')
            encoded.append(code)
        return ByteStringObject(bytes(encoded))
    def update(value,setter):
        nonlocal previous
        nonlocal changed
        if font_name not in maps or not isinstance(value,(TextStringObject,ByteStringObject)):
            return value
        codes,reverse=maps[font_name]
        raw=value.get_original_bytes() if isinstance(value,TextStringObject) else bytes(value)
        decoded=''.join(codes.get(byte,chr(byte)) for byte in raw)
        replaced=replacements.sub(name,decoded)
        # Some authored line breaks split "A criança" (and similar phrases)
        # between PDF text runs; remove the orphaned article from the prior run.
        if previous and split_noun.match(replaced):
            article=trailing_article.search(previous['text'])
            if article:
                previous['setter'](previous['text'][:article.start()].rstrip())
                previous['text']=previous['text'][:article.start()].rstrip()
                replaced=split_noun.sub(name,replaced,count=1)
                changed=True
        if replaced==decoded:result=value
        else:
            changed=True
            result=encode_text(replaced,reverse)
        previous={'text':replaced,'setter':lambda text:setter(encode_text(text,reverse))}
        return result
    for operands,operator in content.operations:
        if operator==b'Tf':font_name=str(operands[0])
        elif operator in (b'Tj',b"'",b'"') and operands:
            index=-1 if operator==b'"' else 0
            operands[index]=update(operands[index],lambda value,ops=operands,i=index:ops.__setitem__(i,value))
        elif operator==b'TJ' and operands:
            parts=operands[0]
            for i,part in enumerate(parts):parts[i]=update(part,lambda value,parts=parts,i=i:parts.__setitem__(i,value))
    if changed:
        content._data=b''
        page[NameObject('/Contents')]=pdf._add_object(content)
    return changed

def personalization_page(writer, original, spec):
    """Replace the dedication page with one that reflects the linked quiz answers."""
    width=float(original.mediabox.width);height=float(original.mediabox.height)
    page=PageObject.create_blank_page(writer,width,height)
    resources=DictionaryObject()
    fonts=DictionaryObject()
    for key,base in (('/F1','/Helvetica'),('/F2','/Helvetica-Bold')):
        fonts[NameObject(key)]=writer._add_object(DictionaryObject({
            NameObject('/Type'):NameObject('/Font'),NameObject('/Subtype'):NameObject('/Type1'),NameObject('/BaseFont'):NameObject(base),NameObject('/Encoding'):NameObject('/WinAnsiEncoding')}))
    resources[NameObject('/Font')]=fonts
    page[NameObject('/Resources')]=resources
    commands=[]
    def raw_text(value):
        return value.encode('cp1252',errors='replace').hex()
    def text(x,y,value,size=12,font='F1',color=(0.20,0.24,0.29)):
        commands.append(f'{color[0]} {color[1]} {color[2]} rg /{font} {size} Tf 1 0 0 1 {x:.1f} {y:.1f} Tm <{raw_text(value)}> Tj\n')
    def rect(x,y,w,h,color):
        commands.append(f'{color[0]} {color[1]} {color[2]} rg {x:.1f} {y:.1f} {w:.1f} {h:.1f} re f\n')
    def circle(x,y,r,color):
        # Four cubic Bézier segments form a smooth vector circle.
        k=r*0.55228475
        commands.append(f'{color[0]} {color[1]} {color[2]} rg {x-r:.1f} {y:.1f} m {x-r:.1f} {y+k:.1f} {x-k:.1f} {y+r:.1f} {x:.1f} {y+r:.1f} c {x+k:.1f} {y+r:.1f} {x+r:.1f} {y+k:.1f} {x+r:.1f} {y:.1f} c {x+r:.1f} {y-k:.1f} {x+k:.1f} {y-r:.1f} {x:.1f} {y-r:.1f} c {x-k:.1f} {y-r:.1f} {x-r:.1f} {y-k:.1f} {x-r:.1f} {y:.1f} c f\n')
    def ellipse(x,y,rx,ry,color):
        k=0.55228475
        commands.append(f'{color[0]} {color[1]} {color[2]} rg {x-rx:.1f} {y:.1f} m {x-rx:.1f} {y+k*ry:.1f} {x-k*rx:.1f} {y+ry:.1f} {x:.1f} {y+ry:.1f} c {x+k*rx:.1f} {y+ry:.1f} {x+rx:.1f} {y+k*ry:.1f} {x+rx:.1f} {y:.1f} c {x+rx:.1f} {y-k*ry:.1f} {x+k*rx:.1f} {y-ry:.1f} {x:.1f} {y-ry:.1f} c {x-k*rx:.1f} {y-ry:.1f} {x-rx:.1f} {y-k*ry:.1f} {x-rx:.1f} {y:.1f} c f\n')
    # Warm paper and a restrained editorial frame, consistent with a children's book.
    rect(0,0,width,height,(0.99,0.98,0.95))
    rect(38,height-42,width-76,2,(0.88,0.71,0.38))
    text(48,height-90,'Esta aventura é sua',24,'F2',(0.18,0.25,0.35))
    text(48,height-118,f"Preparada especialmente para {spec['name'].split()[0]}",12,'F1',(0.37,0.42,0.47))
    scene_labels={'floresta':'Floresta encantada','reino':'Reino encantado','fazendinha':'Fazendinha','fundo-do-mar':'Fundo do mar'}
    moral_labels={'amizade':'Amizade','fe':'Fé','obediencia':'Obediência'}
    if spec.get('setting') or spec.get('moral'):
        text(48,height-143,'Aventura: '+scene_labels.get(spec.get('setting'),str(spec.get('setting') or '')),10,'F2',(0.32,0.39,0.46))
        text(48,height-160,'Ensinamento: '+moral_labels.get(spec.get('moral'),str(spec.get('moral') or '')),10,'F1',(0.32,0.39,0.46))
    # A typographic monogram keeps this information page clean; the illustrated
    # protagonist appears in the scenes, where the quiz traits are applied.
    cx=width-112;cy=height-220
    circle(cx,cy,57,(0.89,0.72,0.43));circle(cx,cy,49,(0.99,0.98,0.95))
    initial=spec['name'].split()[0][:1].upper()
    text(cx-12,cy-17,initial,34,'F2',(0.20,0.40,0.36))
    text(48,height-195,'Detalhes da aventura',13,'F2',(0.18,0.25,0.35))
    details=[]
    if spec.get('age'):details.append(('Idade',spec['age']))
    if spec.get('gender'):details.append(('Perfil',spec['gender'].capitalize()))
    if spec.get('skin'):details.append(('Tom de pele',spec['skin']))
    if spec.get('hairColor') or spec.get('hairType'):details.append(('Cabelo',' · '.join(x for x in (spec.get('hairColor'),spec.get('hairType')) if x)))
    if spec.get('eyes'):details.append(('Olhos',spec['eyes']))
    traits=' · '.join(x for x in (spec.get('temperament'),spec.get('preference')) if x)
    if traits:details.append(('Jeito de ser',traits))
    y=height-225
    for label,value in details:
        text(48,y,label,9,'F2',(0.48,0.52,0.56));text(145,y,str(value)[:64],10,'F1',(0.20,0.24,0.29));y-=25
    y-=8
    if spec.get('special'):
        text(48,y,'O que a família contou',11,'F2',(0.18,0.25,0.35));y-=20
        # Keep the free-text quiz answer, but wrap by character count and bound it to the page.
        words=str(spec['special']).split();line=''
        for word in words:
            if len(line)+len(word)+1>72:
                text(48,y,line,9);line=word;y-=15
            else:line=(line+' '+word).strip()
        if line and y>95:text(48,y,line[:150],9);y-=20
    text(48,70,'Com amor,',10,'F1',(0.48,0.52,0.56))
    text(48,50,(spec.get('dedicationName') or 'sua família')[:48],12,'F2',(0.18,0.25,0.35))
    stream=DecodedStreamObject();stream.set_data(''.join(commands).encode('ascii'))
    page[NameObject('/Contents')]=writer._add_object(stream)
    return page

def personalized_story_art(spec, crop, scene_index):
    """Build one reusable vector scene for the exact crop in a story template."""
    W,H=1024,1536
    c=[]
    def color(rgb): return f'{rgb[0]:.3f} {rgb[1]:.3f} {rgb[2]:.3f}'
    def rect(x,y,w,h,rgb): c.append(f'{color(rgb)} rg {x:.1f} {y:.1f} {w:.1f} {h:.1f} re f\n')
    def ellipse(x,y,rx,ry,rgb):
        k=.55228475
        c.append(f'{color(rgb)} rg {x-rx:.1f} {y:.1f} m {x-rx:.1f} {y+k*ry:.1f} {x-k*rx:.1f} {y+ry:.1f} {x:.1f} {y+ry:.1f} c {x+k*rx:.1f} {y+ry:.1f} {x+rx:.1f} {y+k*ry:.1f} {x+rx:.1f} {y:.1f} c {x+rx:.1f} {y-k*ry:.1f} {x+k*rx:.1f} {y-ry:.1f} {x:.1f} {y-ry:.1f} c {x-k*rx:.1f} {y-ry:.1f} {x-rx:.1f} {y-k*ry:.1f} {x-rx:.1f} {y:.1f} c f\n')
    def line(points,rgb,width=3):
        if len(points)<2:return
        s=f'{color(rgb)} RG {width:.1f} w 1 J 1 j {points[0][0]:.1f} {points[0][1]:.1f} m '
        s+=' '.join(f'{x:.1f} {y:.1f} l' for x,y in points[1:])+' S\n';c.append(s)
    def curve(points,rgb):
        x,y=points[0];controls=points[1]
        if len(controls)==6:a,b,d,e,f,g=controls
        else:a,b,d,e,f,g=points[1:]
        c.append(f'{color(rgb)} rg {x:.1f} {y:.1f} m {a:.1f} {b:.1f} {d:.1f} {e:.1f} {f:.1f} {g:.1f} c f\n')
    def polygon(points,rgb):
        if not points:return
        x,y=points[0];s=f'{color(rgb)} rg {x:.1f} {y:.1f} m '
        s+=' '.join(f'{px:.1f} {py:.1f} l' for px,py in points[1:])+' h f\n';c.append(s)
    def normalized(value):
        return ''.join(ch for ch in unicodedata.normalize('NFD',str(value or '')).lower() if not unicodedata.combining(ch)).strip()
    setting=normalized(spec.get('setting'))
    skin_key=normalized(spec.get('skin'));hair_key=normalized(spec.get('hairColor'));hair_type=normalized(spec.get('hairType'));eye_key=normalized(spec.get('eyes'))
    gender=normalized(spec.get('gender'))
    skin_palette={'clara':(.98,.76,.62),'branca':(.98,.81,.69),'branco':(.98,.81,.69),'morena':(.69,.43,.30),'moreno':(.69,.43,.30),'parda':(.77,.54,.39),'negra':(.39,.24,.19),'negro':(.39,.24,.19)}
    hair_palette={'loiro':(.91,.68,.24),'loira':(.91,.68,.24),'castanho':(.37,.22,.14),'castanho escuro':(.22,.14,.10),'preto':(.13,.12,.15),'ruivo':(.72,.30,.16),'vermelho':(.72,.30,.16)}
    eyes_palette={'castanho':(.40,.23,.13),'castanhos':(.40,.23,.13),'preto':(.15,.13,.15),'pretos':(.15,.13,.15),'azul':(.20,.48,.78),'azuis':(.20,.48,.78),'verde':(.20,.55,.36),'verdes':(.20,.55,.36)}
    skin=skin_palette.get(skin_key,(.82,.57,.40));hair=hair_palette.get(hair_key,(.32,.20,.15));iris=eyes_palette.get(eye_key,(.40,.23,.13))
    dark=(.15,.18,.24);is_girl=gender=='menina'
    scene_names={'floresta':'floresta','reino':'reino','fazendinha':'fazenda','fundo-do-mar':'mar'}
    scene=scene_names.get(setting,'floresta')
    moral=normalized(spec.get('moral'))
    accent={'amizade':(.98,.70,.28),'fe':(.99,.86,.48),'obediencia':(.41,.72,.63)}.get(moral,(.98,.70,.28))
    age=normalized(spec.get('age'))
    age_scale=.91 if age in ('2-3','2 a 3','2 a 3 anos') else 1.09 if age in ('6-7','6 a 7','6 a 7 anos') else 1.16 if age in ('8-10','8 a 10','8 a 10 anos') else 1.0
    def scene_panel(x,y,w,h,index):
        sky={'floresta':(.73,.87,.77),'reino':(.69,.84,.97),'fazenda':(.70,.87,.96),'mar':(.22,.68,.83)}[scene]
        ground={'floresta':(.40,.68,.40),'reino':(.47,.69,.43),'fazenda':(.63,.77,.39),'mar':(.07,.43,.64)}[scene]
        rect(x,y,w,h,sky)
        # Soft sun, distant hills, and a varied horizon make each panel read as a scene.
        if scene!='mar':
            ellipse(x+w*.82,y+h*.80,24,24,(1,.88,.48))
            ellipse(x+w*.22,y+h*.27,w*.28,h*.20,ground);ellipse(x+w*.74,y+h*.25,w*.36,h*.24,ground)
            rect(x,y,w,h*.19,ground)
        else:
            rect(x,y,w,h*.33,(.94,.78,.52));rect(x,y+h*.24,w,h*.42,(.12,.57,.72))
            for i2 in range(4):
                yy=y+h*(.33+i2*.09);line([(x,yy),(x+w,yy)],(.52,.83,.84),2)
        if scene=='floresta':
            for tx,th in ((.07,.72),(.20,.62),(.84,.68),(.96,.76)):
                rect(x+w*tx,y+h*.18,w*.045,h*th,(.43,.28,.17))
                for dx,dy,r in ((0,.72,32),(-.025,.61,26),(.027,.61,26)):
                    ellipse(x+w*tx+w*dx,y+h*dy,r,r*.72,(.19,.48,.29) if index%2 else (.25,.55,.32))
            for fx in (.12,.29,.69,.91):
                ellipse(x+w*fx,y+h*.22,5,5,(1,.85,.45));ellipse(x+w*fx+5,y+h*.22,5,5,(1,.85,.45));ellipse(x+w*fx+2,y+h*.22+4,3,3,(.96,.55,.35))
            if index==0 or index==6:
                hx=x+w*.78;hy=y+h*.19
                rect(hx,hy,w*.15,h*.30,(.48,.29,.20));polygon([(hx-w*.025,hy+h*.30),(hx+w*.075,hy+h*.48),(hx+w*.175,hy+h*.30)],(.42,.23,.18))
                rect(hx+w*.055,hy,w*.035,h*.13,(.97,.78,.35))
                if index==6:
                    for fx in (.14,.27,.75,.91):ellipse(x+w*fx,y+h*.88,3,3,(1,.91,.59))
            elif index in (1,3):
                rect(x,y+h*.18,w,h*.12,(.20,.56,.69))
                for bx in (x+w*.30,x+w*.50,x+w*.70):
                    rect(bx,y+h*.23,w*.025,h*.18,(.45,.28,.18))
                for yy in (.27,.31):line([(x+w*.25,y+h*yy),(x+w*.75,y+h*yy)],(.56,.35,.22),4)
            elif index==2:
                line([(x+w*.79,y+h*.73),(x+w*.94,y+h*.73)],(.35,.24,.17),5)
                ellipse(x+w*.85,y+h*.80,14,8,(.23,.57,.84));ellipse(x+w*.88,y+h*.81,5,5,(.23,.57,.84))
                ellipse(x+w*.87,y+h*.82,2,2,dark);curve([(x+w*.84,y+h*.77),(x+w*.79,y+h*.74,x+w*.81,y+h*.70,x+w*.86,y+h*.72)],(.43,.72,.92))
            elif index==4:
                for fx,fy,animal in ((.18,.25,.8),(.82,.26,1.0)):
                    ellipse(x+w*fx,y+h*fy,16*animal,10*animal,(.61,.51,.32));ellipse(x+w*(fx+.035),y+h*(fy+.04),8*animal,8*animal,(.61,.51,.32))
                    ellipse(x+w*(fx+.065),y+h*(fy+.05),2,2,dark)
            elif index==5:
                hx=x+w*.78;hy=y+h*.19
                rect(hx,hy,w*.15,h*.30,(.48,.29,.20));polygon([(hx-w*.025,hy+h*.30),(hx+w*.075,hy+h*.48),(hx+w*.175,hy+h*.30)],(.42,.23,.18))
                rect(hx+w*.055,hy,w*.035,h*.13,(.97,.78,.35))
        elif scene=='reino':
            rect(x+w*.73,y+h*.35,w*.19,h*.38,(.92,.79,.59))
            for tx in (.73,.78,.85,.90):
                rect(x+w*tx,y+h*.66,w*.035,h*.34,(.87,.70,.49))
                curve([(x+w*tx-w*.025,y+h*.66),(x+w*tx-w*.025,y+h*.84,x+w*tx+w*.06,y+h*.84,x+w*tx+w*.06,y+h*.66)],(.88,.71,.50))
            for tx,ty in ((.73,.73),(.81,.82),(.89,.73)):
                curve([(x+w*tx,y+h*ty),(x+w*tx-w*.04,y+h*(ty+.14),x+w*tx+w*.04,y+h*(ty+.14),x+w*tx,y+h*(ty+.24))],(.95,.78,.42))
                line([(x+w*tx,y+h*(ty+.23)),(x+w*tx,y+h*(ty+.32))],(.86,.28,.34),2)
            if index in (0,6):
                ellipse(x+w*.18,y+h*.49,18,12,(.95,.78,.42));ellipse(x+w*.18,y+h*.49,10,7,(.72,.37,.49))
            elif index in (1,3):
                rect(x+w*.68,y+h*.18,w*.31,h*.09,(.50,.35,.28))
                for fx in (.71,.84,.96):line([(x+w*fx,y+h*.18),(x+w*fx,y+h*.54)],(.87,.69,.48),3)
            elif index==4:
                ellipse(x+w*.24,y+h*.31,20,14,(.91,.77,.51))
                for fx in (.20,.24,.28):ellipse(x+w*fx,y+h*.36,3,3,(.74,.36,.37))
            elif index==5:
                for fx in (.13,.23,.33):ellipse(x+w*fx,y+h*.31,13,8,(.96,.87,.62))
        elif scene=='fazenda':
            rect(x+w*.76,y+h*.26,w*.17,h*.30,(.77,.30,.28));curve([(x+w*.74,y+h*.55),(x+w*.74,y+h*.76,x+w*.96,y+h*.76,x+w*.96,y+h*.55)],(.49,.24,.21))
            for tx in (.76,.92):rect(x+w*tx,y+h*.34,w*.025,h*.11,(.97,.83,.64))
            for fx in (.04,.96):
                line([(x+w*fx,y+h*.18),(x+w*fx,y+h*.56)],(.92,.86,.67),3)
            for fy in (.29,.43):line([(x+w*.02,y+h*fy),(x+w*.98,y+h*fy)],(.92,.86,.67),3)
            if index in (0,6):
                rect(x+w*.80,y+h*.56,w*.035,h*.24,(.51,.35,.23))
                ellipse(x+w*.815,y+h*.78,23,4,(.89,.89,.82));line([(x+w*.815,y+h*.78),(x+w*.815,y+h*.99)],(.51,.35,.23),3)
            elif index in (1,3):
                ellipse(x+w*.20,y+h*.25,20,11,(.96,.94,.85));ellipse(x+w*.23,y+h*.25,10,6,(.96,.94,.85))
                ellipse(x+w*.19,y+h*.27,2,2,dark)
            elif index==2:
                ellipse(x+w*.22,y+h*.26,14,9,(.99,.86,.53));line([(x+w*.16,y+h*.26),(x+w*.28,y+h*.26)],(.81,.56,.28),2)
            elif index==4:
                for fx in (.14,.25,.36):ellipse(x+w*fx,y+h*.24,13,7,(.96,.93,.78))
            elif index==5:
                for fx in (.19,.28):ellipse(x+w*fx,y+h*.25,14,9,(.84,.68,.42))
        else:
            for coral_x, coral_h, coral in ((.09,.40,(.95,.43,.45)),(.90,.36,(.97,.62,.31)),(.72,.27,(.93,.43,.62))):
                line([(x+w*coral_x,y+h*.22),(x+w*coral_x,y+h*(.22+coral_h))],coral,8)
                for yy in (.38,.48,.57):
                    line([(x+w*coral_x,y+h*yy),(x+w*(coral_x-.06),y+h*(yy+.07))],coral,5)
                    line([(x+w*coral_x,y+h*yy),(x+w*(coral_x+.06),y+h*(yy+.07))],coral,5)
            for fx,fy in ((.16,.73),(.34,.57),(.76,.76),(.92,.61)):
                ellipse(x+w*fx,y+h*fy,10,5,(1,.77,.38));ellipse(x+w*(fx+.018),y+h*fy+1,2,2,dark)
            if index in (0,6):
                for fx,fy in ((.44,.72),(.49,.80),(.54,.69)):
                    ellipse(x+w*fx,y+h*fy,17,13,(.98,.67,.73));ellipse(x+w*fx,y+h*fy,7,6,(.99,.84,.55))
            elif index in (1,3):
                for fx in (.18,.82):
                    ellipse(x+w*fx,y+h*.28,14,7,(.99,.79,.43));ellipse(x+w*(fx+.02),y+h*.29,2,2,dark)
            elif index==2:
                ellipse(x+w*.52,y+h*.28,35,13,(.25,.68,.75));ellipse(x+w*.52,y+h*.28,20,7,(.96,.82,.54))
            elif index==4:
                for fx,fy in ((.28,.76),(.70,.70),(.85,.81)):
                    ellipse(x+w*fx,y+h*fy,11,6,(.87,.53,.70));ellipse(x+w*fx,y+h*fy,3,3,(1,.83,.49))
            elif index==5:
                for fx in (.12,.27,.73,.89):
                    ellipse(x+w*fx,y+h*.30,12,6,(.98,.65,.41));ellipse(x+w*fx,y+h*.30,2,2,dark)
        # A visual cue for the story's selected lesson, repeated subtly in the set.
        ellipse(x+w*.92,y+h*.84,8,8,accent)
        if scene!='mar':
            line([(x+w*.90,y+h*.84),(x+w*.92,y+h*.88),(x+w*.95,y+h*.82)],(1,1,1),2)
    def character(x,y,w,h,pose):
        # Draw the same quiz-matched protagonist in seven changing poses.
        cx=x+w*.50;foot=y+h*.18;heady=y+h*.68;sc=min(w,h*2.9);outline=dark
        shirt=(.65,.31,.63) if is_girl else (.19,.48,.72);shorts=(.30,.31,.60) if is_girl else (.20,.34,.48);shoe=(.66,.27,.24)
        # Feet and legs.
        line([(cx-13,foot+22),(cx-16,foot+2),(cx-25,foot)],outline,7);line([(cx+13,foot+22),(cx+16,foot+2),(cx+25,foot)],outline,7)
        ellipse(cx-25,foot,10,5,shoe);ellipse(cx+25,foot,10,5,shoe)
        # Torso, shirt and shorts/dress.
        ellipse(cx,foot+47,27,34,shirt)
        if is_girl:
            polygon([(cx-18,foot+58),(cx+18,foot+58),(cx+34,foot+15),(cx-34,foot+15)],shirt)
        else:rect(cx-22,foot+25,44,15,shorts)
        # Arms respond to each narrative beat.
        armposes=[((-22,foot+58),(-40,foot+82),(20,foot+58),(38,foot+81)),((-22,foot+58),(-42,foot+49),(22,foot+58),(43,foot+72)),((-22,foot+58),(-42,foot+78),(22,foot+58),(43,foot+40)),((-22,foot+58),(-40,foot+68),(22,foot+58),(42,foot+68)),((-22,foot+58),(-44,foot+79),(22,foot+58),(44,foot+79)),((-22,foot+58),(-39,foot+64),(22,foot+58),(40,foot+64)),((-22,foot+58),(-45,foot+86),(22,foot+58),(45,foot+86))]
        arm=armposes[pose]
        for a,b in ((arm[0],arm[1]),(arm[2],arm[3])):
            line([(cx+a[0],a[1]),(cx+b[0],b[1])],outline,12);line([(cx+a[0],a[1]),(cx+b[0],b[1])],skin,7);ellipse(cx+b[0],b[1],5,5,skin)
        if pose in (2,4,6):
            ellipse(cx+44 if pose!=2 else cx-44,foot+79,6,6,skin)
        # Hair silhouette first, then ears and face.
        if is_girl:ellipse(cx,heady+5,31,42,hair)
        ellipse(cx,heady,26,31,skin);ellipse(cx-25,heady+1,5,8,skin);ellipse(cx+25,heady+1,5,8,skin)
        ellipse(cx,heady+25,29,14,hair)
        if hair_type in ('cacheado','ondulado','encaracolado','crespo'):
            r=6.5 if hair_type!='crespo' else 5
            for xx,yy in ((-22,29),(-16,37),(-8,41),(0,42),(8,41),(16,37),(22,29)):
                ellipse(cx+xx,heady+yy,r,r,hair)
        else:
            curve([(cx-27,heady+19),(cx-24,heady+48,cx+10,heady+48,cx+25,heady+28)],hair)
            curve([(cx-24,heady+27),(cx-14,heady+19,cx+1,heady+20,cx+10,heady+14)],hair)
        ellipse(cx-9,heady+1,3.2,4.3,(1,1,1));ellipse(cx+9,heady+1,3.2,4.3,(1,1,1))
        ellipse(cx-9,heady+1,2,3.2,iris);ellipse(cx+9,heady+1,2,3.2,iris)
        ellipse(cx-9.6,heady+2.3,.8,.8,(1,1,1));ellipse(cx+8.4,heady+2.3,.8,.8,(1,1,1))
        line([(cx-14,heady+10),(cx-6,heady+11)],dark,1.5);line([(cx+6,heady+11),(cx+14,heady+10)],dark,1.5)
        ellipse(cx,heady-6,2,2,(.78,.45,.35));line([(cx-5,heady-13),(cx,heady-15),(cx+5,heady-13)],(.55,.20,.21),1.5)
        if is_girl:ellipse(cx+30,heady+26,7,4,(.96,.47,.61))
        # Small prop in the final panels makes the story feel active.
        if pose in (3,5):
            rect(cx+24,foot+52,27,31,(.98,.82,.47));rect(cx+27,foot+55,21,25,(.98,.97,.86))
            line([(cx+31,foot+74),(cx+44,foot+74)],(.28,.43,.48),1.2);line([(cx+31,foot+67),(cx+44,foot+67)],(.28,.43,.48),1.2)
    x,y,w,h=crop
    scene_panel(x,y,w,h,scene_index)
    center=x+w*.5;baseline=y+h*.18
    c.append(f'q {age_scale:.3f} 0 0 {age_scale:.3f} {center*(1-age_scale):.1f} {baseline*(1-age_scale):.1f} cm\n')
    character(x,y,w,h,scene_index%7)
    c.append('Q\n')
    # Form XObjects are painted into the same unit square as the old image.
    content=(f'q {1/W:.9f} 0 0 {1/H:.9f} 0 0 cm\n'+''.join(c)+'Q\n').encode('ascii')
    form=DecodedStreamObject();form.set_data(content)
    form[NameObject('/Type')]=NameObject('/XObject');form[NameObject('/Subtype')]=NameObject('/Form')
    form[NameObject('/FormType')]=NumberObject(1);form[NameObject('/BBox')]=ArrayObject([NumberObject(0),NumberObject(0),NumberObject(1),NumberObject(1)])
    form[NameObject('/Resources')]=DictionaryObject()
    return form

def replace_story_atlas(writer,spec):
    W,H=1024,1536
    replaced=0
    scene_by_page={1:0,4:0,7:1,10:2,13:3,16:4,19:5,24:6}
    for page_index,page in enumerate(writer.pages):
        resources=page.get('/Resources')
        if not resources:continue
        xobjects=resources.get_object().get('/XObject')
        if not xobjects:continue
        xobjects=xobjects.get_object()
        for key,reference in list(xobjects.items()):
            obj=reference.get_object()
            if obj.get('/Subtype')!='/Image':continue
            width=int(obj.get('/Width',0));height=int(obj.get('/Height',0))
            if width>=800 and height>=1200 and .62<=width/height<=.72:
                operations=ContentStream(page.get_contents(),writer).operations
                matrix=None;clip=None;found=False
                for oi,(operands,operator) in enumerate(operations):
                    if operator!=b'Do' or str(operands[0])!=str(key):continue
                    found=True
                    for prior_ops,prior_operator in reversed(operations[:oi]):
                        if matrix is None and prior_operator==b'cm' and len(prior_ops)==6 and abs(float(prior_ops[0]))>100 and abs(float(prior_ops[3]))>100:
                            matrix=tuple(float(v) for v in prior_ops)
                        if clip is None and prior_operator==b're' and len(prior_ops)==4:
                            clip=tuple(float(v) for v in prior_ops)
                        if matrix is not None and clip is not None:break
                    break
                if not found or not matrix or not clip:continue
                a,_,_,d,e,f=matrix;cx,cy,cw,ch=clip
                crop=((cx-e)/a*W,(cy-f)/d*H,cw/a*W,ch/d*H)
                x,y,w,h=crop
                if x<0 or y<0 or x+w>W+2 or y+h>H+2 or w<100 or h<100:continue
                # A fresh resource dictionary avoids changing other pages that
                # share the original atlas object.
                new_resources=DictionaryObject(resources.get_object())
                new_xobjects=DictionaryObject(xobjects)
                scene_index=scene_by_page.get(page_index+1,min(replaced,6))
                new_xobjects[key]=writer._add_object(personalized_story_art(spec,crop,scene_index))
                new_resources[NameObject('/XObject')]=writer._add_object(new_xobjects)
                page[NameObject('/Resources')]=writer._add_object(new_resources)
                replaced+=1
                break
    if not replaced:raise ValueError('Este template não tem atlas ilustrado compatível com a biblioteca fixa. As características do quiz não foram aplicadas às cenas.')
    return replaced

# Illustration variants ("looks"). Each template ships one child per gender; extra
# atlases with other skin/hair combinations live beside the templates as
#   templates/<version>/atlases/<setting>/<skin>-<hairColor>-<hairType>.jpg
# and must keep the template atlas layout (2 columns x 6 rows, 2:3 portrait).
DEFAULT_LOOK=('morena','castanho','cacheado')
NEAR_SKIN={frozenset(('morena','negra'))}
NEAR_HAIR_COLOR={frozenset(('castanho','preto')),frozenset(('castanho','loiro')),frozenset(('castanho','ruivo'))}
NEAR_HAIR_TYPE={frozenset(('cacheado','crespo'))}
def look_key(value):
    text=''.join(c for c in unicodedata.normalize('NFD',str(value or '')).lower() if not unicodedata.combining(c)).strip()
    return {'branca':'clara','branco':'clara','claro':'clara','moreno':'morena','parda':'morena','pardo':'morena','negro':'negra',
            'loira':'loiro','ruiva':'ruivo','vermelho':'ruivo','castanho escuro':'castanho','preta':'preto',
            'ondulado':'cacheado','encaracolado':'cacheado','lisa':'liso'}.get(text,text)
def look_score(wanted,candidate):
    score=0
    for want,have,exact,near,close in zip(wanted,candidate,(6,3,3),(2,2,2),(NEAR_SKIN,NEAR_HAIR_COLOR,NEAR_HAIR_TYPE)):
        if want==have:score+=exact
        elif frozenset((want,have)) in close:score+=near
    return score
def choose_look(spec,available):
    """Closest available look; the template's own illustration wins ties."""
    wanted=(look_key(spec.get('skin')),look_key(spec.get('hairColor')),look_key(spec.get('hairType')))
    best=DEFAULT_LOOK
    for candidate in sorted(available):
        if look_score(wanted,candidate)>look_score(wanted,best):best=candidate
    return None if best==DEFAULT_LOOK else best
def jpeg_size(data):
    assert data[:2]==b'\xff\xd8','not a JPEG'
    i=2
    while i+9<len(data):
        assert data[i]==0xff,'corrupt JPEG'
        marker=data[i+1];length=int.from_bytes(data[i+2:i+4],'big')
        if marker in (0xc0,0xc1,0xc2):
            assert data[i+4]==8 and data[i+9]==3,'JPEG must be 8-bit RGB'
            return int.from_bytes(data[i+7:i+9],'big'),int.from_bytes(data[i+5:i+7],'big')
        i+=2+length
    raise AssertionError('JPEG size not found')
def apply_look_atlas(writer,spec,templates):
    """Swap the template illustration atlas for the look closest to the quiz answers."""
    folder=templates/'atlases'/str(spec.get('setting') or '')
    if not folder.is_dir():return 'template'
    available={tuple(p.stem.split('-')):p for p in folder.glob('*.jpg') if len(p.stem.split('-'))==3}
    look=choose_look(spec,available)
    if not look:return 'template'
    try:
        data=available[look].read_bytes();width,height=jpeg_size(data)
        assert width>=1024 and abs(width/height-2/3)<.01,'atlas must be 2:3 portrait, at least 1024 px wide'
    except (AssertionError,OSError) as error:
        print(f'look atlas ignored ({available[look].name}): {error}',file=sys.stderr)
        return 'template'
    def image():
        return StreamObject.initialize_from_dictionary({
            NameObject('/Type'):NameObject('/XObject'),NameObject('/Subtype'):NameObject('/Image'),
            NameObject('/Width'):NumberObject(width),NameObject('/Height'):NumberObject(height),
            NameObject('/ColorSpace'):NameObject('/DeviceRGB'),NameObject('/BitsPerComponent'):NumberObject(8),
            NameObject('/Filter'):NameObject('/DCTDecode'),'__streamdata__':data})
    # Replace the shared atlas object itself, so the original image is not kept in the file.
    swapped=set()
    for page in writer.pages:
        resources=page.get('/Resources')
        xobjects=resources.get_object().get('/XObject') if resources else None
        if not xobjects:continue
        xobjects=xobjects.get_object()
        for key in list(xobjects.keys()):
            reference=xobjects.raw_get(key)
            if not hasattr(reference,'idnum') or reference.idnum in swapped:continue
            obj=reference.get_object()
            if obj.get('/Subtype')!='/Image':continue
            w=int(obj.get('/Width',0));h=int(obj.get('/Height',0))
            if w>=800 and h>=1200 and .62<=w/h<=.72:
                writer._replace_object(reference,image());swapped.add(reference.idnum)
    return '-'.join(look) if swapped else 'template'

def protagonist_name(name):
    """Name used inside the story text; keeps compound first names such as João Miguel."""
    try:
        import storybook
        return storybook.short_name(name)
    except Exception:
        return name.split()[0]

def storybook_file(spec,item,templates,output):
    """Typesets the story from data (see storybook.py). Returns the result entry, or None to use the classic template."""
    try:
        root=templates.parent.parent
        for extra in (str(Path(__file__).resolve().parent),str(root/'pylib')):
            if extra not in sys.path:sys.path.insert(0,extra)
        import storybook
        folder=templates/'atlases'/str(spec.get('setting') or '')
        available={tuple(p.stem.split('-')):p for p in folder.glob('*.jpg') if len(p.stem.split('-'))==3}
        look=choose_look(spec,available) or DEFAULT_LOOK
        if look not in available:return None
        dest=output/(item['kind']+'.pdf');temp=dest.with_suffix('.tmp')
        built=storybook.build(spec,item,templates,temp,available[look])
        if not built:return None
        pages,mode=built
        checked=PdfReader(temp);text='\n'.join(p.extract_text() or '' for p in checked.pages)
        assert pages==len(checked.pages)==24 and spec['name'].split()[0] in (checked.pages[0].extract_text() or '')
        assert '{nome}' not in text
        temp.replace(dest)
        return {**item,'artwork':'-'.join(look),'story':mode,'bytes':dest.stat().st_size,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'state':'pending'}
    except Exception as error:
        print(f'storybook skipped: {type(error).__name__}',file=sys.stderr)
        return None

def generate(spec):
    root=Path(os.environ['DELIVERY_STORAGE_ROOT']).resolve()
    version=spec['version']
    assert version.isalnum(), 'Invalid version'
    templates=root/'templates'/version
    catalog=json.loads((templates/'catalog.json').read_text(encoding='utf-8'))
    output=(root/'jobs'/spec['generationId']).resolve()
    assert output.parent == root/'jobs', 'Invalid generation path'
    output.mkdir(parents=True,exist_ok=True)
    result=[]
    base_spec=spec
    for item in spec['files']:
        # Livros extras da oferta de 4 aventuras: mesmo perfil, outro cenário.
        is_story=item['kind']=='historia' or item['kind'].startswith('historia-')
        spec={**base_spec,'setting':item['setting']} if is_story and item.get('setting') else base_spec
        if item['kind'].startswith('historia-'):
            assert item.get('setting') in ('floresta','reino','fazendinha','fundo-do-mar') and item['kind']=='historia-'+item['setting']
        if is_story:
            expected=f"{spec['moral']}-{spec['setting']}-{spec['gender']}"
            if item.get('template')!=expected:
                raise ValueError('O cenário, ensinamento ou gênero não corresponde ao template da história selecionada.')
        entry=catalog[item['template']]
        if is_story:
            built=storybook_file(spec,item,templates,output)
            if built:
                result.append(built);continue
        src=(templates/entry['path']).resolve()
        assert src.is_relative_to(templates.resolve())
        assert hashlib.sha256(src.read_bytes()).hexdigest()==entry['sha256'], 'Template checksum mismatch'
        reader=PdfReader(src);writer=PdfWriter();writer.clone_document_from_reader(reader)
        # Keep the template's original illustrations. replace_story_atlas() swaps them for
        # flat vector scenes, which made the delivered books look far worse than the template.
        artwork=apply_look_atlas(writer,spec,templates) if is_story else 'template'
        if is_story and len(writer.pages)>1:
            kids=writer._pages.get_object().raw_get('/Kids').get_object()
            kids[1]=writer._add_object(personalization_page(writer,writer.pages[1],spec))
        # Preserve each widget's typography, shrinking only names that would clip.
        for page in writer.pages:
            for annotation in page.get('/Annots',[]):
                widget=annotation.get_object()
                if widget.get('/Subtype')!='/Widget':continue
                da=str(widget.get_inherited('/DA'));match=re.search(r'(/\S+)\s+([\d.]+)\s+Tf',da)
                assert match, 'Missing name typography'
                font=Font.from_font_resource(widget['/AP']['/N']['/Resources']['/Font'][match[1]])
                width=font.text_width(spec['name'])/1000
                x0,y0,x1,y1=widget['/Rect']
                size=min(float(match[2]),(float(x1)-float(x0)-8)/(width or 1))
                widget[NameObject('/DA')]=TextStringObject(da[:match.start(2)]+str(size)+da[match.end(2):])
        writer.update_page_form_field_values(None,{'Nome da criança':spec['name']},auto_regenerate=False)
        if is_story:
            protagonist=protagonist_name(spec['name'])
            pages_changed=sum(personalize_story_page(page,writer,protagonist) for page in writer.pages)
            assert pages_changed>0, 'O template não contém referências personalizáveis ao protagonista.'
        for pi,page in enumerate(writer.pages):
            widgets=[a.get_object() for a in page.get('/Annots',[]) if a.get_object().get('/Subtype')=='/Widget']
            resources=page.get('/Resources').get_object()
            if '/XObject' not in resources:resources[NameObject('/XObject')]=DictionaryObject()
            xobjects=resources['/XObject'].get_object()
            additions=[]
            for wi,widget in enumerate(widgets):
                parent=widget['/Parent'].get_object()
                assert parent['/V']==spec['name'] and widget['/AP']['/N']
                key=NameObject(f'/DeliveryName{pi}_{wi}')
                xobjects[key]=widget['/AP'].raw_get('/N')
                x0,y0,x1,y1=widget['/Rect'];bbox=widget['/AP']['/N'].get_object().get('/BBox',[0,0,x1-x0,y1-y0])
                additions.append(f'q 1 0 0 1 {float(x0)-float(bbox[0])} {float(y0)-float(bbox[1])} cm {key} Do Q\n'.encode())
            if additions:
                stream=DecodedStreamObject();stream.set_data(b''.join(additions))
                old=page.get('/Contents')
                entries=list(old) if isinstance(old,ArrayObject) else ([page.raw_get('/Contents')] if old else [])
                page[NameObject('/Contents')]=ArrayObject(entries+[writer._add_object(stream)])
        writer.remove_annotations(subtypes='/Widget');writer.root_object.pop('/AcroForm',None)
        writer.add_metadata({'/Title':f'Mamãe, quero historinha - {spec["name"]} - {item["kind"]}'})
        dest=output/(item['kind']+'.pdf');temp=dest.with_suffix('.tmp')
        with temp.open('wb') as f:writer.write(f)
        checked=PdfReader(temp)
        assert len(checked.pages)==entry['pages'] and not checked.get_fields()
        assert not any(a.get_object().get('/Subtype')=='/Widget' for p in checked.pages for a in p.get('/Annots',[]))
        assert spec['name'] in checked.pages[0].extract_text(), 'Name appearance not painted'
        if is_story:
            full_text='\n'.join(p.extract_text() or '' for p in checked.pages)
            assert not re.search(r'(?i)\b[ao]\s+(?:menina|menino|crian[cç]a)\b',full_text), 'O nome não foi aplicado a todas as referências ao protagonista.'
            dedication=checked.pages[1].extract_text() or ''
            assert spec['name'].split()[0] in dedication and (spec.get('dedicationName') or 'sua família') in dedication
        temp.replace(dest)
        result.append({**item,'artwork':artwork,'bytes':dest.stat().st_size,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'state':'pending'})
    print(json.dumps(result,ensure_ascii=False))

if __name__=='__main__':
    generate(json.loads(sys.stdin.buffer.read().decode('utf-8')))
