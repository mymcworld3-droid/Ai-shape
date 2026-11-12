'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {Controller}=require('../script-controller'),data=require('../script-data'),source=require('../docs/script-source.json');
const omittedSentences={"32": ["Huh."], "33": ["Hey!"], "141": ["Ugh."], "164": ["Haha."], "220": ["ah."], "321": ["You."], "322": ["Me?"], "323": ["You talk too much."], "325": ["Oh, but like, it’s not all my fault, right?", "At least now we know that she’s definitely a human."], "326": ["Ohhhh ya, I got it."], "327": ["Correction, I found it."], "358": ["Ugh!"], "362": ["This again."]};
const clean=s=>s.replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g,'').replace(/\s+/g,'').trim();
test('every spoken Word paragraph is reproduced once and in order, without stage directions',()=>{
 const entries=data.entries,actual=new Map();
 for(const e of entries){assert.ok(source.paragraphs[e.paragraph]);if(e.text)actual.set(e.paragraph,(actual.get(e.paragraph)||'')+e.text);}
 let speaker='';const expected=[];
 source.paragraphs.forEach((raw,p)=>{
  if(p<11||!raw.trim())return;raw=raw.trim();
  if(/^(ACT |SCENE |SETTING:|AT RISE:|END OF PLAY)/.test(raw)||p===405||p===360)return;
  const m=raw.match(/^(AI VOICE|EVERYONE ELSE|RACHEL|MEGAN|ETHAN|CHRISTOPHER|LIAM|CEO|Ben):/);
  if(m){speaker=m[1];raw=raw.slice(m[0].length);}
  if(p===88)speaker='';
  let text=clean(raw);for(const omitted of omittedSentences[p]||[])text=text.replace(clean(omitted),'');if(!text)return;
  expected.push(p);assert.equal(clean(actual.get(p)||''),text,'paragraph '+p);
  assert.ok(entries.filter(x=>x.paragraph===p&&x.text).every(x=>x.speaker===speaker),'speaker '+p);
 });
 assert.deepEqual([...actual.keys()],expected);
 assert.equal(entries.filter(x=>x.text).length,359);
 assert.ok(!entries.some(x=>/\bboss\b/i.test(x.speaker+' '+x.text)),'Boss is renamed CEO everywhere');
 assert.ok(entries.some(x=>x.speaker==='CEO'));

 assert.ok(!entries.some(x=>x.text==="It's empty."));
 assert.ok(entries.some(x=>x.paragraph===110&&x.action==='memoryClick'));
 assert.equal(entries.at(-2).action,'end-blackout');
 assert.equal(entries.at(-1).action,'behind-the-scenes');
 assert.equal(data.source.sha256,source.sha256);
});
test('all four acts, source-specific two-vote order, card, door, room, office and ending boundaries match',()=>{
 const e=data.entries;
 assert.deepEqual([...new Set(e.map(x=>x.act))],['I','II','III','IV']);
 for(const [p,action] of [[23,'reveal'],[27,'ai'],[33,'doorKick'],[83,'card'],[85,'card-hide'],[87,'doorOpen'],[109,'memory-light'],[110,'memoryClick'],[213,'officeBang'],[388,'selection-button'],[407,'ending-light'],[416,'end-blackout']])assert.ok(e.some(x=>x.paragraph===p&&x.action===action));
 const votes=e.filter(x=>[389,393].includes(x.paragraph));assert.deepEqual(votes.map(x=>x.speaker),['CHRISTOPHER','MEGAN']);
 assert.equal(e.filter(x=>x.group==='two').at(-1).text,'Two votes.');assert.ok(!e.some(x=>/Three votes/.test(x.text)));
 assert.ok(e.some(x=>x.group==='prompt'&&x.text==='1 minute remaining.'));
 assert.equal(e.filter(x=>x.group==='revealTruth').at(-1).text,'You may leave.');
 assert.equal(e.length,381);
 const prompt=e.find(x=>x.action==='selection-button');
 assert.equal(prompt.paragraph,388);assert.equal(prompt.group,'prompt');assert.equal(prompt.text,'Please make your selection.');
 assert.ok(!e.some(x=>x.paragraph===385||x.paragraph===386));
 assert.ok(!e.some(x=>x.kind==='pause' || x.paragraph===405),'No no-op actor cues');
 for(const p of [42,185,188,195,221,269])
  assert.equal(e.some(x=>x.kind==='cue'&&x.paragraph===p),false,'Spotlight should not need a manual step: '+p);
 assert.equal(e[0].id,'pre-show');assert.equal(e[0].text,'');
 assert.equal(e[1].paragraph,20);
 const hold=e.findIndex(x=>x.id==='pause-after-p263');
 assert.equal(e[hold-1].id,'p263-0');assert.equal(e[hold+1].id,'p270-0');
 assert.equal(e[hold].text,'');assert.equal(e[hold].look.blackout,1);
 assert.equal(e[hold].action,'blackout');
 assert.equal(e[0].look.blackout,1);
 assert.equal(e.find(x=>x.paragraph===43).look.scene,.35);
 assert.equal(e.find(x=>x.paragraph===186).look.blackout,0);
 assert.equal(e.find(x=>x.paragraph===198).look.background,'office');
 assert.equal(e.at(-3).text,'You may leave.');
 assert.equal(e.at(-2).action,'end-blackout');
 assert.equal(e.at(-2).look.blackout,1);
 assert.equal(e.at(-1).action,'behind-the-scenes');
 assert.equal(e.at(-1).look.blackout,1);
 assert.equal(e.some(x=>x.paragraph===415),false,'No extra silence or relighting after the final line');
});
class Media extends EventTarget{constructor(){super();this.ended=false;this.currentTime=0;this.calls=0;this.paused=true;}play(){this.calls++;this.paused=false;this.ended=false;return Promise.resolve();}pause(){this.paused=true;}end(){this.ended=true;this.dispatchEvent(new Event('ended'));}load(){}}
function setup(){let time=0;const opening=new Media(),effect=new Media(),events=[];const entries=[{text:'first',group:'opening'},{text:'last',group:'opening'},{text:'actor',action:'doorKick'},{text:'end'}];const c=new Controller({entries,voices:{opening},effects:{doorKick:effect},now:()=>time,onEntry:(e,m)=>events.push(m.index)});return {c,opening,effect,events,tick:n=>time+=n};}
test('button slam, flash and AI prompt are one stage entry',async()=>{
 const prompt=new Media(),button=new Media();
 const start=data.entries.findIndex(e=>e.action==='selection-button');
 const entries=data.entries.slice(start-1,start+2);
 const c=new Controller({entries,voices:{prompt},effects:{'selection-button':button}});
 assert.equal(c.start(),true);
 assert.equal(c.next(),true);
 assert.equal(c.index,1);
 assert.equal(c.entry.group,'prompt');
 assert.equal(c.entry.action,'selection-button');
 assert.equal(c.entry.text,'Please make your selection.');
 assert.equal(prompt.calls,1);assert.equal(button.calls,1);
 assert.equal(c.next(),true);
 assert.equal(prompt.calls,1);assert.equal(button.calls,1);
});
test('each next changes exactly one sentence; narration continues and only real end starts countdown',async()=>{
 const {c,opening,effect,tick}=setup();assert.equal(opening.calls,0);c.start();await Promise.resolve();
 c.next();assert.equal(c.index,1);assert.equal(opening.calls,1);assert.equal(opening.paused,false);
 assert.equal(c.deadlines.opening,null);assert.equal(c.next(),false);assert.equal(effect.calls,0);
 opening.dispatchEvent(new Event('ended'));assert.equal(c.deadlines.opening,null);
 opening.end();opening.dispatchEvent(new Event('error'));assert.equal(c.active.state,'finished');assert.equal(c.index,1);assert.equal(c.remaining('opening'),900000);
 c.next();assert.equal(c.index,2);assert.equal(effect.calls,1);tick(5000);c.previous();
 assert.equal(c.index,1);assert.equal(c.remaining('opening'),895000);
 c.next();assert.equal(c.index,2);assert.equal(c.remaining('opening'),895000);
});
test('rehearsal start jumps to cue, plays that effect once and starts a fresh timer',()=>{
 const {c,opening,effect,tick}=setup();
 assert.equal(c.start(999),false);assert.equal(c.started,false);
 assert.equal(c.start(-1),false);assert.equal(c.start(1.5),false);
 assert.equal(c.start(2),true);assert.equal(c.index,2);
 assert.equal(effect.calls,1);assert.equal(opening.calls,0);
 assert.equal(c.deadlines.opening,900000);
 tick(2500);assert.equal(c.remaining('opening'),897500);
 assert.equal(c.start(0),false);
 assert.equal(c.next(),true);assert.equal(c.index,3);
 assert.equal(c.previous(),true);assert.equal(c.index,2);
 assert.equal(effect.calls,1,'rewind does not replay effects');
});
test('direct subtitle jumps stop outgoing media and play only the target cue',async()=>{
 const {c,opening,effect}=setup();
 assert.equal(c.jumpTo(2),false,'Cannot jump before show Start');
 assert.equal(c.start(0),true);
 await Promise.resolve();
 assert.equal(c.jumpTo(1),true);
 await Promise.resolve();
 assert.equal(c.index,1);assert.equal(opening.calls,2);
 assert.equal(c.jumpTo(2),true);
 assert.equal(opening.paused,true,'Old narration must stop');
 assert.equal(effect.calls,1,'Destination effect plays exactly once');
 assert.equal(c.index,2);
 assert.equal(c.jumpTo(2),true);
 assert.equal(effect.calls,1,'Re-selecting current cue cannot replay the effect');
 assert.equal(c.jumpTo(0),true);
 assert.equal(effect.paused,true,'Leaving sound effect must stop playback');
 assert.equal(c.deadlines.opening,null,'Jumping back before the opening resets its timer');
 assert.equal(c.jumpTo(1),true);
 await Promise.resolve();
 assert.equal(opening.calls,4,'Voice cue can be replayed deliberately');
 assert.equal(c.jumpTo(-1),false);
 assert.equal(c.jumpTo(99),false);
 assert.equal(c.jumpTo(2.3),false);
 c.destroy();
});
test('rehearsal start inside a voice group starts the recording even if not first sentence',async()=>{
 const {c,opening,effect}=setup();
 assert.equal(c.start(1),true);await Promise.resolve();
 assert.equal(c.index,1);assert.equal(opening.calls,1);
 assert.equal(c.deadlines.opening,null,'opening clock waits for real recording end');
 assert.equal(effect.calls,0);assert.equal(c.next(),false);
 opening.end();assert.equal(c.deadlines.opening,900000);
 assert.equal(c.next(),true);assert.equal(effect.calls,1);
});
test('jumping directly into a vote plays its voice without inventing a one-minute timer',async()=>{
 let now=4200;const one=new Media(),prompt=new Media();
 const entries=[
  {text:'prompt',group:'prompt',look:{timer:'selection'}},
  {text:'one vote',group:'one',look:{timer:'selection'}},
  {text:'after vote',look:{timer:'selection'}}
 ];
 const c=new Controller({entries,voices:{prompt,one},now:()=>now});
 assert.equal(c.start(1),true);await Promise.resolve();
 assert.equal(prompt.calls,0);assert.equal(one.calls,1);
 assert.equal(c.deadlines.selection,null);
 now+=3000;assert.equal(c.remaining('selection'),null);
});
test('Left pauses media, never replays effects; resume cannot skip a paused unfinished voice',async()=>{
 const {c,opening,effect}=setup();c.start();await Promise.resolve();c.next();c.previous();
 assert.equal(c.index,0);assert.equal(opening.paused,true);assert.equal(effect.calls,0);
 c.next();await Promise.resolve();assert.equal(c.index,1);assert.equal(opening.paused,false);
 assert.equal(c.next(),false);opening.end();c.next();c.previous();assert.equal(effect.calls,1);
});
test('late play results and media errors cannot restore abandoned voices, and error retries do not move subtitle',async()=>{
 const {c,opening}=setup();c.start();await Promise.resolve();c.next();opening.dispatchEvent(new Event('error'));
 assert.equal(c.next(),false);assert.equal(c.index,1);assert.equal(opening.calls,2);
 c.previous();await Promise.resolve();assert.equal(c.active.state,'paused');
});
test('missing selection voice retains manually paced sentences and never creates a deadline',()=>{
 let now=100;const c=new Controller({entries:[{group:'prompt',text:'a'},{group:'prompt',text:'b'},{text:'Ethan.'}],now:()=>now});c.start();c.next();assert.equal(c.deadlines.selection,null);c.next();assert.equal(c.remaining('selection'),null);now+=1000;c.previous();c.next();assert.equal(c.remaining('selection'),null);assert.equal(c.deadlines.opening,null);
});
test('all script entries can run and rewind without audio, no wrap, both deadlines survive and no automatic subtitle advance',()=>{
 const c=new Controller({entries:data.entries});c.start();for(let i=1;i<data.entries.length;i++){assert.equal(c.next(),true);assert.equal(c.index,i);}
 const deadlines={...c.deadlines};assert.equal(c.next(),false);
 for(let i=data.entries.length-2;i>=0;i--){assert.equal(c.previous(),true);assert.equal(c.index,i);assert.deepEqual(c.deadlines,deadlines);}assert.equal(c.previous(),false);
});
