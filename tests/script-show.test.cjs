'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {Controller}=require('../script-controller'),data=require('../script-data'),source=require('../docs/script-source.json');
const clean=s=>s.replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g,'').replace(/\s+/g,'').trim();
test('every spoken Word paragraph is reproduced once and in order, without stage directions',()=>{
 const entries=data.entries,actual=new Map();
 for(const e of entries){assert.ok(source.paragraphs[e.paragraph]);if(e.text)actual.set(e.paragraph,(actual.get(e.paragraph)||'')+e.text);}
 let speaker='';const expected=[];
 source.paragraphs.forEach((raw,p)=>{
  if(p<11||!raw.trim())return;raw=raw.trim();
  if(/^(ACT |SCENE |SETTING:|AT RISE:|END OF PLAY)/.test(raw)||p===405)return;
  const m=raw.match(/^(AI VOICE|EVERYONE ELSE|RACHEL|MEGAN|ETHAN|CHRISTOPHER|LIAM|BOSS|Ben):/);
  if(m){speaker=m[1];raw=raw.slice(m[0].length);}
  if(p===88)speaker='';
  const text=clean(raw);if(!text)return;
  expected.push(p);assert.equal(clean(actual.get(p)||''),text,'paragraph '+p);
  assert.ok(entries.filter(x=>x.paragraph===p&&x.text).every(x=>x.speaker===speaker),'speaker '+p);
 });
 assert.deepEqual([...actual.keys()],expected);
 assert.equal(entries.filter(x=>x.text).length,374);
 assert.ok(!entries.some(x=>x.text==="It's empty."));
 assert.ok(entries.some(x=>x.paragraph===110&&x.action==='memoryClick'));
 assert.equal(entries.at(-1).action,'end-blackout');
 assert.equal(data.source.sha256,source.sha256);
});
test('all four acts, source-specific two-vote order, card, door, room, office and ending boundaries match',()=>{
 const e=data.entries;
 assert.deepEqual([...new Set(e.map(x=>x.act))],['I','II','III','IV']);
 for(const [p,action] of [[23,'reveal'],[27,'ai'],[33,'doorKick'],[83,'card'],[85,'card-hide'],[87,'doorOpen'],[109,'memory-light'],[110,'memoryClick'],[213,'officeBang'],[386,'selection-flash'],[407,'ending-light'],[416,'end-blackout']])assert.ok(e.some(x=>x.paragraph===p&&x.action===action));
 const votes=e.filter(x=>[389,393].includes(x.paragraph));assert.deepEqual(votes.map(x=>x.speaker),['CHRISTOPHER','MEGAN']);
 assert.equal(e.filter(x=>x.group==='two').at(-1).text,'Two votes.');assert.ok(!e.some(x=>/Three votes/.test(x.text)));
 assert.ok(e.some(x=>x.group==='prompt'&&x.text==='1 minute remaining.'));
 assert.equal(e.filter(x=>x.group==='revealTruth').at(-1).text,'You may leave.');
 assert.equal(e.length,416);
 assert.equal(e.at(-2).text,'You may leave.');
 assert.equal(e.at(-1).action,'end-blackout');
 assert.equal(e.at(-1).look.blackout,1);
 assert.equal(e.some(x=>x.paragraph===415),false,'No extra silence or relighting after the final line');
});
class Media extends EventTarget{constructor(){super();this.ended=false;this.currentTime=0;this.calls=0;this.paused=true;}play(){this.calls++;this.paused=false;this.ended=false;return Promise.resolve();}pause(){this.paused=true;}end(){this.ended=true;this.dispatchEvent(new Event('ended'));}load(){}}
function setup(){let time=0;const opening=new Media(),effect=new Media(),events=[];const entries=[{text:'first',group:'opening'},{text:'last',group:'opening'},{text:'actor',action:'doorKick'},{text:'end'}];const c=new Controller({entries,voices:{opening},effects:{doorKick:effect},now:()=>time,onEntry:(e,m)=>events.push(m.index)});return {c,opening,effect,events,tick:n=>time+=n};}
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
test('missing selection voice retains manual sentences and starts its own minute only when leaving the prompt',()=>{
 let now=100;const c=new Controller({entries:[{group:'prompt',text:'a'},{group:'prompt',text:'b'},{text:'Ethan.'}],now:()=>now});c.start();c.next();assert.equal(c.deadlines.selection,null);c.next();assert.equal(c.remaining('selection'),60000);now+=1000;c.previous();c.next();assert.equal(c.remaining('selection'),59000);assert.equal(c.deadlines.opening,null);
});
test('all script entries can run and rewind without audio, no wrap, both deadlines survive and no automatic subtitle advance',()=>{
 const c=new Controller({entries:data.entries});c.start();for(let i=1;i<data.entries.length;i++){assert.equal(c.next(),true);assert.equal(c.index,i);}
 const deadlines={...c.deadlines};assert.equal(c.next(),false);
 for(let i=data.entries.length-2;i>=0;i--){assert.equal(c.previous(),true);assert.equal(c.index,i);assert.deepEqual(c.deadlines,deadlines);}assert.equal(c.previous(),false);
});
