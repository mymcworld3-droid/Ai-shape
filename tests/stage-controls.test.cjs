"use strict";
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {StageCueController,bindStageKeys,adjustVolume}=require('../opening-controller.js');
class Media extends EventTarget {
 constructor(){super();this.calls=0;this.paused=true;this.ended=false;this.currentTime=0;}
 play(){++this.calls;this.paused=false;this.ended=false;return this.result||Promise.resolve();}
 pause(){this.paused=true;}
 end(){this.ended=true;this.paused=true;this.dispatchEvent(new Event('ended'));}
}
function setup(){
 let time=0,presentation={scene:'opening',value:0};
 const video=new Media(),audio=new Media(),effect=new Media(),memoryVoice=new Media(),bang=new Media(),prompt=new Media();
 const stage=new StageCueController({video,audio,effect,now:()=>time,memoryScene:{voice:memoryVoice},officeScene:{bang},votingScene:{prompt},
  capturePresentation:()=>({...presentation}),restorePresentation:saved=>{presentation=saved;}});
 return {stage,video,audio,effect,memoryVoice,bang,prompt,tick:ms=>time+=ms,
  setPresentation:value=>{presentation=value;},getPresentation:()=>presentation,
  async next(){time+=5000;await stage.advance();},
  async welcome(){await this.next();video.end();await this.next();await this.next();}
 };
}
function key(target,type,code,extra={}){
 const e=new Event(type,{cancelable:true});Object.assign(e,{code,key:code,repeat:false,...extra});target.dispatchEvent(e);return e;
}
test('F starts once, arrows and Space share a release gate, volume repeats without navigating',()=>{
 const target=new EventTarget(),calls=[];let started=false;
 const unbind=bindStageKeys(target,{start:()=>{calls.push('start');started=true;},next:()=>calls.push('next'),previous:()=>calls.push('previous'),
  volumeUp:()=>calls.push('up'),volumeDown:()=>calls.push('down'),isStarted:()=>started});
 assert.equal(key(target,'keydown','ArrowRight').defaultPrevented,false);
 key(target,'keydown','KeyF');key(target,'keydown','KeyF',{repeat:true});key(target,'keydown','ArrowRight');
 assert.deepEqual(calls,['start']);key(target,'keyup','KeyF');
 key(target,'keydown','ArrowRight');key(target,'keydown','Space');key(target,'keydown','ArrowLeft');
 assert.deepEqual(calls,['start','next']);key(target,'keyup','ArrowRight');key(target,'keydown','ArrowLeft');
 key(target,'keydown','ArrowDown');key(target,'keydown','ArrowDown',{repeat:true});key(target,'keydown','ArrowUp');
 assert.deepEqual(calls,['start','next','previous','down','down','up']);
 target.dispatchEvent(new Event('blur'));key(target,'keydown','Space');assert.equal(calls.at(-1),'next');
 unbind();key(target,'keyup','Space');key(target,'keydown','ArrowRight');assert.equal(calls.length,7);
});
test('F during loading never queues Start; shortcuts and composing input are ignored',()=>{
 const target=new EventTarget();let ready=false,starts=0,next=0;
 bindStageKeys(target,{start:()=>{if(ready)++starts;},next:()=>++next,previous:()=>{},volumeUp:()=>{},volumeDown:()=>{},isStarted:()=>false});
 key(target,'keydown','KeyF');ready=true;key(target,'keydown','KeyF',{repeat:true});assert.equal(starts,0);
 key(target,'keyup','KeyF');key(target,'keydown','KeyF');assert.equal(starts,1);key(target,'keyup','KeyF');
 for(const extra of [{ctrlKey:true},{metaKey:true},{altKey:true},{isComposing:true}]){
  key(target,'keydown','KeyF',extra);key(target,'keyup','KeyF');
 }
 assert.equal(starts,1);assert.equal(next,0);
});
test('master volume changes by five percentage points and clamps at silence and full volume',()=>{
 assert.equal(adjustVolume(100,-5),95);assert.equal(adjustVolume(95,5),100);
 assert.equal(adjustVolume(0,-5),0);assert.equal(adjustVolume(100,5),100);
});
test('Left cancels a pending original video and rejects its late completion',async()=>{
 const c=setup();let resolve;c.video.result=new Promise(done=>resolve=done);
 const pending=c.stage.advance();assert.equal(c.stage.state,'room-reveal');assert.equal(c.stage.previous(),true);
 resolve();await pending;c.video.end();assert.equal(c.stage.state,'dark');assert.equal(c.video.paused,true);
 assert.equal(c.stage.previous(),false);c.video.result=Promise.resolve();await c.stage.advance();assert.equal(c.video.calls,2);
});
test('rewinding a pending voice pauses it, ignores late failure and permits a fresh replay',async()=>{
 const c=setup();await c.next();c.video.end();await c.next();c.tick(5000);
 let reject;c.audio.result=new Promise((_,no)=>reject=no);const pending=c.stage.advance();
 assert.equal(c.stage.state,'welcome');c.stage.previous();assert.equal(c.stage.state,'ai');assert.equal(c.audio.paused,true);
 reject(new Error('late rejection'));await pending;c.audio.dispatchEvent(new Event('error'));c.audio.end();
 assert.equal(c.stage.state,'ai');assert.equal(c.stage.opening.deadline,null);
 c.audio.result=Promise.resolve();await c.next();assert.equal(c.stage.state,'welcome');assert.equal(c.audio.calls,2);
});
test('rewind restores the departing frame and replay never resets a running opening deadline',async()=>{
 const c=setup();c.setPresentation({scene:'opening',value:1});await c.welcome();c.audio.end();
 const deadline=c.stage.opening.deadline;c.tick(2000);await c.stage.advance();
 assert.equal(c.stage.state,'door-kick');c.stage.previous();assert.equal(c.stage.state,'welcome');
 c.stage.previous();assert.equal(c.stage.state,'ai');assert.deepEqual(c.getPresentation(),{scene:'opening',value:1});
 c.tick(1500);const remaining=c.stage.opening.getRemainingMs();assert.ok(remaining<900000);
 await c.next();assert.equal(c.stage.opening.state,'narration');assert.equal(c.stage.opening.deadline,deadline);
 assert.ok(c.stage.opening.getRemainingMs()<remaining);c.audio.end();assert.equal(c.stage.opening.deadline,deadline);
});
test('all 25 cues rewind across scene boundaries and can run forward again without frozen media or reset deadlines',async()=>{
 const c=setup(),visited=[];
 for(let i=0;i<25;i++){
  await c.next();if(c.stage.state==='room-reveal')c.video.end();visited.push(c.stage.state);
  if(c.stage.state==='welcome')c.audio.end();if(c.stage.state==='door-kick')c.effect.end();
  if(c.stage.state==='memory-welcome')c.memoryVoice.end();if(c.stage.state==='office-bang')c.bang.end();
  if(c.stage.state==='vote-prompt')c.prompt.end();
 }
 assert.equal(visited.length,25);assert.equal(c.stage.state,'vote-blackout');
 const opening=c.stage.opening.deadline,selection=c.stage.voting.deadline;
 for(let i=23;i>=-1;i--){assert.equal(c.stage.previous(),true);assert.equal(c.stage.state,i<0?'dark':visited[i]);}
 assert.equal(c.stage.previous(),false);assert.equal(c.stage.opening.deadline,opening);assert.equal(c.stage.voting.deadline,selection);
 for(let i=0;i<25;i++){
  await c.next();if(c.stage.state==='room-reveal')c.video.end();assert.equal(c.stage.state,visited[i]);
  if(c.stage.state==='welcome')c.audio.end();if(c.stage.state==='door-kick')c.effect.end();
  if(c.stage.state==='memory-welcome')c.memoryVoice.end();if(c.stage.state==='office-bang')c.bang.end();
  if(c.stage.state==='vote-prompt')c.prompt.end();
 }
 assert.equal(c.stage.opening.deadline,opening);assert.equal(c.stage.voting.deadline,selection);
 for(const m of [c.audio,c.memoryVoice,c.bang,c.prompt])assert.equal(m.calls,2);
});
