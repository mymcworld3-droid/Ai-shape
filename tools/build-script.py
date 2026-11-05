"""Build deterministic manual subtitles from the supplied Word manuscript.
Usage: python tools/build-script.py [manuscript.docx]
"""
import re, json, sys, hashlib
from pathlib import Path
root=Path(__file__).resolve().parents[1]
source=root/'docs/script-source.json'
if len(sys.argv)>1:
 from zipfile import ZipFile
 from xml.etree import ElementTree as ET
 path=Path(sys.argv[1]); ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
 with ZipFile(path) as z:
  doc=ET.fromstring(z.read('word/document.xml'))
  paragraphs=[''.join(p.itertext()) if False else ''.join(t.text or '' for t in p.findall('.//w:t',ns)) for p in doc.findall('./w:body/w:p',ns)]
 source.write_text(json.dumps({'filename':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'paragraphs':paragraphs},ensure_ascii=False,indent=2)+'\n')
data=json.loads(source.read_text()); ps=data['paragraphs']
# Stage directions stay in the operator's review, never inside spoken subtitles.
def spoken(s):
 s=re.sub(r'\([^)]*\)|\[[^]]*\]|\{[^}]*\}', '',s)
 return re.sub(r'\s+',' ',s).strip()
def sentences(s):
 # Preserve ellipses and abbreviations; do not silently rewrite spelling or punctuation.
 protected=s.replace('...','\ue000')
 for ab in ['Mr.','Mrs.','Ms.','Dr.']:
  protected=protected.replace(ab,ab[:-1]+'\ue001')
 chunks=re.split(r'(?<=[.!?])\s+|(?<=[.!?])(?=[A-Z0-9])',protected)
 return [x.replace('\ue000','...').replace('\ue001','.').strip() for x in chunks if x.strip()]
look=dict(background='opening',room=False,ai=0,scene=0,clock=0,card=0,blackout=0,aiExpansion=0,vote=0,timer='opening')
# Only meaningful projection/sound changes and pauses add a blank subtitle step.
actions={17:('opening-dark',{'blackout':1}),23:('reveal',{'room':True,'blackout':0}),27:('ai',{'ai':1}),33:('doorKick',{}),42:('opening-dim',{'scene':.35}),53:('opening-full',{'scene':0}),46:('timerClick',{}),
83:('card',{'card':1}),85:('card-hide',{'card':0}),87:('doorOpen',{}),99:('blackout',{'blackout':1}),
109:('memory-light',{'background':'memory','room':True,'ai':0,'clock':0,'scene':0,'card':0,'blackout':0,'aiExpansion':0}),110:('memoryClick',{}),
185:('past-intro',{'blackout':0,'scene':.35,'ai':0}),188:('past-isolate',{'blackout':1}),191:('blackout',{'blackout':1}),
195:('office-light',{'background':'office','room':True,'scene':.35,'blackout':0}),199:('office-full',{'scene':0}),221:('office-dim',{'scene':.35}),213:('officeBang',{}),
269:('past-reflection',{'blackout':1}),284:('blackout',{'blackout':1}),
290:('discussion',{'background':'memory','room':True,'blackout':0,'scene':.2,'clock':0,'ai':0}),
403:('blackout',{'blackout':1,'ai':0,'clock':0}),
407:('ending-light',{'background':'memory','room':True,'scene':0,'blackout':0,'ai':0,'clock':0}),416:('end-blackout',{'blackout':1,'ai':0,'clock':0})}
voices={28:'opening',115:'memory',388:'prompt',390:'one',395:'two',402:'final',409:'complete',414:'revealTruth'}
# Pure spotlight directions only change the look of the NEXT real subtitle.
# They do not consume a keypress. True projection/effect transitions still do.
folded_lighting_actions={17,42,185,188,195,221,269}
entries=[];speaker='';act='I';scene='I'
def add(p,text='',action=None,group=None,kind='dialogue',note=''):
 entries.append(dict(id=f'p{p}-{sum(e["paragraph"]==p for e in entries)}',paragraph=p,act=act,scene=scene,speaker=speaker if text else '',text=text,action=action,group=group,kind=kind,note=note,look=dict(look)))
for p,raw in enumerate(ps):
 if p<11: continue
 raw=raw.strip()
 if raw.startswith('ACT '):act=raw.split()[1];scene='I';speaker='';continue
 if raw.startswith('SCENE '):scene=raw.split()[1];speaker='';continue
 if not raw or raw.startswith(('SETTING:','AT RISE:','END OF PLAY')):continue
 m=re.match(r'^(AI VOICE|EVERYONE ELSE|RACHEL|MEGAN|ETHAN|CHRISTOPHER|LIAM|CEO|Ben):',raw)
 if m:speaker=m[1];raw=raw[m.end():]
 # The source's AH! after the opening door has no explicit speaker: do not invent one.
 if p==88:speaker=''
 text=spoken(raw)
 if p in actions:
  action,patch=actions[p];look.update(patch)
  if p not in folded_lighting_actions:
   add(p,action=action,kind='cue',note=ps[p].strip())
 if p in voices:
  group=voices[p]
  if group=='opening':look.update(ai=1,clock=0)
  elif group in ('prompt','one','two','final'):look.update(ai=1,clock=0,timer='selection')
  else:look.update(ai=1,clock=0)
  for n,line in enumerate(sentences(text)):
   # Operator controls the clock switch during the last opening sentence.
   action='selection-button' if p==388 and n==0 else ('opening-clock' if group=='opening' and n==len(sentences(text))-1 else None)
   if action:look['clock']=1
   add(p,line,action,group,note='(Christopher slams the button); [light flashes]' if action=='selection-button' else '')
  look.update(ai=1 if group=='opening' else 0,clock=1 if group in ('opening','prompt','one','two') else 0)
 elif text:
  # Bare prose stage direction in Act IV is not dialogue.
  if p==405:continue # Actor entrance is not a projection button press.
  for line in sentences(text):add(p,line)
 # Silences/pauses are actor directions, not operator button presses.
 # Stage directions remain in docs/script-source.json for rehearsal.
# Operator-only holds use stable IDs so later additions do not move their boundaries.
# Keep the manuscript dialogue intact; display numbering starts at zero.
first=entries[0]
entries.insert(0,dict(first,id='pre-show',paragraph=17,speaker='',text='',action='opening-dark',group=None,kind='cue',note='全黑，無字幕',look=dict(first['look'])))
anchor=next(i for i,e in enumerate(entries) if e['id']=='p263-0')
prior=entries[anchor]
entries.insert(anchor+1,dict(prior,id='pause-after-p263',speaker='',text='',action=None,group=None,kind='cue',note='無字幕停頓（原第 251、252 步之間）',look=dict(prior['look'])))
# Omit the operator-removed step 336 by stable ID.
entries=[e for e in entries if e['id']!='p360-0']
# Review edits refer to the published zero-based steps before this deletion.
removed_ids={'p322-0', 'p327-0', 'p141-0', 'p32-1', 'p323-0', 'p321-0', 'p362-0', 'p325-1', 'p220-0', 'p164-0', 'p33-1', 'p326-0', 'p358-0', 'p325-0'}
entries=[e for e in entries if e['id'] not in removed_ids]
for e in entries:
 if e['id']=='pause-after-p263':
  e['look'].update(blackout=1,ai=0,clock=0,card=0,vote=0)
  e.update(action='blackout',note='全黑，無字幕停頓')
# Final blackout remains reachable and cannot wrap to the start.
out={'source':{k:data[k] for k in ('filename','sha256')},'entries':entries}
(root/'script-data.js').write_text('/* Generated by tools/build-script.py; do not hand-edit dialogue. */\n(function(root){const data='+json.dumps(out,ensure_ascii=False,separators=(',',':'))+';if(typeof module==="object"&&module.exports)module.exports=data;else root.SHOW_SCRIPT=data;})(typeof globalThis!=="undefined"?globalThis:this);\n')
print(len(entries),'steps;',sum(bool(e['text']) for e in entries),'spoken sentences')
