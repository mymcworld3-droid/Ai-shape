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
 const video=new Media(),audio=new Media(),effect=new Media(),doorOpen=new Media(),memoryVoice=new Media(),bang=new Media(),prompt=new Media(),button=new Media(),complete=new Media(),reveal=new Media();
 const stage=new StageCueController({video,audio,effect,doorOpen,selectionButton:button,now:()=>time,memoryScene:{voice:memoryVoice},officeScene:{bang},votingScene:{prompt},endingScene:{complete,revealTruth:reveal},
  capturePresentation:()=>({...presentation}),restorePresentation:saved=>{presentation=saved;}});
 return {stage,video,audio,effect,doorOpen,memoryVoice,bang,prompt,button,complete,reveal,tick:ms=>time+=ms,
  setPresentation:value=>{presentation=value;},getPresentation:()=>presentation,
  async next(){time+=5000;await stage.advance();},
  async welcome(){await this.next();video.end();await this.next();await this.next();}
 };
}
function key(target,type,code,extra={}){
 const e=new Event(type,{cancelable:true});Object.assign(e,{code,key:code,repeat:false,...extra});target.dispatchEvent(e);return e;
}
test('F starts once, arrows navigate, 1/Q, 2/W and 3/E change separate volumes, O toggles HUD',()=>{
 const target=new EventTarget(),calls=[];let started=false;
 const unbind=bindStageKeys(target,{start:()=>{calls.push('start');started=true;},
  next:()=>calls.push('next'),previous:()=>calls.push('previous'),
  voiceUp:()=>calls.push('voice+'),voiceDown:()=>calls.push('voice-'),
  effectUp:()=>calls.push('effect+'),effectDown:()=>calls.push('effect-'),
  otherUp:()=>calls.push('other+'),otherDown:()=>calls.push('other-'),
  toggleVolumeDisplay:()=>calls.push('toggle'),isStarted:()=>started});
 assert.equal(key(target,'keydown','ArrowRight').defaultPrevented,false);
 key(target,'keydown','KeyF');key(target,'keydown','KeyF',{repeat:true});key(target,'keydown','ArrowRight');
 assert.deepEqual(calls,['start']);key(target,'keyup','KeyF');
 key(target,'keydown','ArrowRight');key(target,'keydown','Space');key(target,'keydown','ArrowLeft');
 assert.deepEqual(calls,['start','next']);
 key(target,'keyup','ArrowRight');key(target,'keydown','ArrowLeft');key(target,'keyup','ArrowLeft');
 key(target,'keydown','Digit1');key(target,'keydown','Digit1',{repeat:true});
 key(target,'keydown','KeyQ');key(target,'keydown','Digit2');key(target,'keydown','KeyW');key(target,'keydown','Digit3');key(target,'keydown','KeyE');
 assert.equal(key(target,'keydown','ArrowDown').defaultPrevented,false);
 assert.equal(key(target,'keydown','ArrowUp').defaultPrevented,false);
 key(target,'keydown','KeyO');key(target,'keydown','KeyO',{repeat:true});
 assert.deepEqual(calls,['start','next','previous','voice+','voice+','voice-','effect+','effect-','other+','other-','toggle']);
 key(target,'keyup','KeyO');key(target,'keydown','KeyO');
 assert.equal(calls.at(-1),'toggle');
 target.dispatchEvent(new Event('blur'));key(target,'keydown','Space');assert.equal(calls.at(-1),'next');
 unbind();key(target,'keyup','Space');key(target,'keydown','ArrowRight');assert.equal(calls.length,13);
});
test('F during loading never queues Start; shortcuts and composing input are ignored',()=>{
 const target=new EventTarget();let ready=false,starts=0,next=0;
 bindStageKeys(target,{start:()=>{if(ready)++starts;},next:()=>++next,previous:()=>{},voiceUp:()=>{},voiceDown:()=>{},otherUp:()=>{},otherDown:()=>{},toggleVolumeDisplay:()=>{},isStarted:()=>false});
 key(target,'keydown','KeyF');ready=true;key(target,'keydown','KeyF',{repeat:true});assert.equal(starts,0);
 key(target,'keyup','KeyF');key(target,'keydown','KeyF');assert.equal(starts,1);key(target,'keyup','KeyF');
 for(const extra of [{ctrlKey:true},{metaKey:true},{altKey:true},{isComposing:true}]){
  key(target,'keydown','KeyF',extra);key(target,'keyup','KeyF');
 }
 assert.equal(starts,1);assert.equal(next,0);
});
test('blue-room step zero is silent, startable once, and advances to the original reveal',async()=>{
 const c=setup();
 assert.equal(await c.stage.startAt('dark'),true);
 assert.equal(c.stage.state,'dark');
 assert.equal(c.video.calls,0);
 assert.equal(c.audio.calls,0);
 assert.equal(c.stage.voting.deadline,null);
 assert.equal(c.stage.startAt('bright'),false,'Start at step zero can happen only once');
 await c.stage.advance();
 assert.equal(c.stage.state,'room-reveal');
 assert.equal(c.video.calls,1);
 c.stage.destroy();
});

test('each volume channel changes by five percentage points and clamps at silence and full volume',()=>{
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
 assert.equal(c.stage.state,'clock');c.stage.previous();assert.equal(c.stage.state,'welcome');
 c.stage.previous();assert.equal(c.stage.state,'ai');assert.deepEqual(c.getPresentation(),{scene:'opening',value:1});
 c.tick(1500);const remaining=c.stage.opening.getRemainingMs();assert.ok(remaining<900000);
 await c.next();assert.equal(c.stage.opening.state,'narration');assert.equal(c.stage.opening.deadline,deadline);
 assert.ok(c.stage.opening.getRemainingMs()<remaining);c.audio.end();assert.equal(c.stage.opening.deadline,deadline);
});
test('all third-act scene cues rewind and replay without starting any voting deadline',async()=>{
 const c=setup(),visited=[];
 for(let i=0;i<28;i++){
  await c.next();if(c.stage.state==='room-reveal')c.video.end();visited.push(c.stage.state);
  if(c.stage.state==='welcome')c.audio.end();if(c.stage.state==='door-kick')c.effect.end();
  if(c.stage.state==='door-open')c.doorOpen.end();
  if(c.stage.state==='memory-welcome')c.memoryVoice.end();if(c.stage.state==='office-bang')c.bang.end();
  if(c.stage.state==='vote-prompt')c.prompt.end();
 }
 assert.equal(visited.length,28);assert.equal(c.stage.state,'vote-blackout');
 const opening=c.stage.opening.deadline,selection=c.stage.voting.deadline;
 for(let i=26;i>=-1;i--){assert.equal(c.stage.previous(),true);assert.equal(c.stage.state,i<0?'dark':visited[i]);}
 assert.equal(c.stage.previous(),false);assert.equal(c.stage.opening.deadline,opening);assert.equal(c.stage.voting.deadline,selection);
 for(let i=0;i<25;i++){
  await c.next();if(c.stage.state==='room-reveal')c.video.end();assert.equal(c.stage.state,visited[i]);
  if(c.stage.state==='welcome')c.audio.end();if(c.stage.state==='door-kick')c.effect.end();
  if(c.stage.state==='door-open')c.doorOpen.end();
  if(c.stage.state==='memory-welcome')c.memoryVoice.end();if(c.stage.state==='office-bang')c.bang.end();
  if(c.stage.state==='vote-prompt')c.prompt.end();
 }
 assert.equal(c.stage.opening.deadline,opening);assert.equal(c.stage.voting.deadline,selection);
 for(const m of [c.audio,c.doorOpen,c.memoryVoice,c.bang,c.prompt,c.button])assert.equal(m.calls,2);
});

test('every one of the 41 scene cues can be selected as the first live cue',async()=>{
 const {STAGE_START_CUES}=require('../opening-controller.js');
 assert.equal(STAGE_START_CUES.length,41);
 const mediaFor={"bright":"video","welcome":"audio","door-kick":"effect","door-open":"doorOpen",
  "memory-welcome":"memoryVoice","office-bang":"bang","vote-prompt":"prompt",
  "ending-complete":"complete","ending-reveal":"reveal"};
 for(const [index,cue] of STAGE_START_CUES.entries()){
  const c=setup();
  assert.equal(await c.stage.startAt(cue),true,cue);
  assert.equal(c.stage.state,cue==='bright'?'room-reveal':cue,cue);
  for(const name of ['video','audio','effect','doorOpen','memoryVoice','bang','prompt','button','complete','reveal']){
   const expected=mediaFor[cue]===name||(cue==='vote-prompt'&&name==='button')?1:0;
   assert.equal(c[name].calls,expected,cue+': '+name);
  }
  assert.equal(c.stage.opening.deadline,index>=4?900000:null,cue+': opening deadline');
  assert.equal(c.stage.voting.deadline,null,cue+': voting has no timer');
  if(index>=10)assert.equal(c.stage.memory.state,index<=12?cue:index<=15?'memory-room':'memory-blackout');
  if(index>=17)assert.equal(c.stage.office.state,index<=22?cue:'memory-return');
  if(index>=23)assert.equal(c.stage.voting.state,index>=29?'vote-blackout':cue);
  if(index>=29)assert.equal(c.stage.ending.state,cue);
  assert.equal(c.stage.startAt('clock'),false,'cannot restart an already started scene');
  c.stage.destroy();
 }
});

test('six credit cues follow final blackout directly without a bonus step',async()=>{
 const c=setup();
 const creditIds=['credit-directed','credit-conversation','credit-produced',
  'credit-executive','credit-backgrounds','credit-title'];
 assert.equal(c.stage.startAt('ending-blackout'),true);
 for(const id of creditIds){
  await c.stage.advance();
  assert.equal(c.stage.state,id);
  assert.equal(c.stage.voting.deadline,null);
 }
 assert.equal(await c.stage.advance(),false);
 assert.equal(c.stage.state,'credit-title');
 for(let i=creditIds.length-2;i>=0;i--){
  assert.equal(c.stage.previous(),true);
  assert.equal(c.stage.state,creditIds[i]);
 }
 assert.equal(c.stage.previous(),true);
 assert.equal(c.stage.state,'ending-blackout');
 c.stage.destroy();
});
test('scene seek cancels old effects, clears cue locks and reconstructs later and earlier scenes',async()=>{
 const c=setup();
 assert.equal(c.stage.seekTo('vote-prompt'),false,'Start required');
 assert.equal(await c.stage.startAt('door-open'),true);
 await Promise.resolve();
 assert.equal(c.doorOpen.paused,false);
 assert.equal(await c.stage.seekTo('vote-prompt'),true);
 await Promise.resolve();
 assert.equal(c.doorOpen.paused,true,'Skipping from door must stop its sound');
 assert.equal(c.stage.state,'vote-prompt');
 assert.equal(c.prompt.calls,1);
 assert.equal(c.button.calls,1);
 assert.equal(c.stage.voting.deadline,null);
 assert.equal(c.stage.seekTo('memory-photo-front'),true);
 assert.equal(c.stage.state,'memory-photo-front');
 assert.equal(c.prompt.paused,true,'Old vote narration must be stopped');
 assert.equal(c.stage.opening.deadline,900000);
 assert.equal(c.stage.memory.state,'memory-room');
 assert.equal(c.stage.history.length,0);
 await c.stage.advance();
 assert.equal(c.stage.state,'memory-photo-back','Following cue still advances naturally');
 assert.equal(await c.stage.seekTo('bright'),true);
 assert.equal(c.stage.state,'room-reveal','Room reveal video is the target action');
 assert.equal(c.video.calls,1);
 assert.equal(c.stage.seekTo('dark'),true);
 assert.equal(c.video.paused,true);
 assert.equal(c.stage.state,'dark');
 assert.equal(c.stage.opening.deadline,null);
 assert.equal(c.stage.seekTo('not-a-cue'),false);
 c.stage.destroy();
});
test('memory door has its own sound, waits for completion, retries failures, and rewinds cleanly',async()=>{
 const c=setup();
 assert.equal(await c.stage.startAt('card-hidden'),true);
 assert.equal(c.doorOpen.calls,0,'entering card-hidden cannot play opening sound');
 await c.stage.advance();
 assert.equal(c.stage.state,'door-open');
 assert.equal(c.doorOpen.calls,1,'door-open must play its own media');
 assert.equal(c.stage.doorOpenState,'playing');
 await c.stage.advance();
 assert.equal(c.stage.state,'door-open','cannot blackout during door effect');
 c.doorOpen.end();
 assert.equal(c.stage.doorOpenState,'finished');
 await c.stage.advance();
 assert.equal(c.stage.state,'blackout');
 assert.equal(c.stage.previous(),true);
 assert.equal(c.stage.state,'door-open');
 assert.equal(c.doorOpen.paused,true);
 assert.equal(c.stage.previous(),true);
 assert.equal(c.stage.state,'card-hidden');
 await c.stage.advance();
 assert.equal(c.stage.state,'door-open');
 assert.equal(c.doorOpen.calls,2,'manual replay after rewind plays the door sound again');
 c.stage.destroy();
 const failed=setup();
 failed.doorOpen.result=Promise.reject(new Error('blocked'));
 assert.equal(await failed.stage.startAt('door-open'),false);
 assert.equal(failed.stage.state,'door-open');
 assert.equal(failed.stage.doorOpenState,'error');
 failed.doorOpen.result=Promise.resolve();
 assert.equal(await failed.stage.advance(),true);
 assert.equal(failed.stage.doorOpenState,'playing');
 assert.equal(failed.doorOpen.calls,2);
 failed.stage.destroy();
});

test('a direct scene jump preserves the opening timer while voting has no clock',async()=>{
 const c=setup();
 assert.equal(await c.stage.startAt('clock'),true);
 assert.equal(c.stage.opening.state,'countdown');
 assert.equal(c.stage.opening.getRemainingMs(),900000);
 c.tick(1500);
 assert.equal(c.stage.opening.getRemainingMs(),898500);
 await c.stage.advance();
 assert.equal(c.stage.state,'door-kick');
 assert.equal(c.effect.calls,1);
 const vote=setup();
 assert.equal(await vote.stage.startAt('vote-one'),true);
 assert.equal(vote.stage.voting.getRemainingMs(),null);
 vote.tick(2000);
 assert.equal(vote.stage.voting.deadline,null);
 await vote.stage.advance();assert.equal(vote.stage.state,'vote-two');
 assert.equal(vote.prompt.calls,0,'skipped AI prompt must not replay');
 assert.equal(vote.button.calls,0,'skipped button click must not replay');
 const invalid=setup();
 assert.equal(invalid.stage.startAt('not-a-cue'),false);
 assert.equal(invalid.stage.state,'dark');
 invalid.stage.destroy();vote.stage.destroy();c.stage.destroy();
});

test('voting button sound fires with the AI prompt once, never during preview or voice retries',async()=>{
 const c=setup();
 assert.equal(await c.stage.startAt('discussion'),true);
 assert.equal(c.button.calls,0);
 await c.stage.advance();
 assert.equal(c.stage.state,'vote-prompt');
 assert.equal(c.button.calls,1);
 assert.equal(c.prompt.calls,1);
 assert.equal(c.stage.selectionButtonState,'playing');
 // The sound completes independently: it does not end or restart the voice.
 c.button.end();
 assert.equal(c.stage.selectionButtonState,'finished');
 assert.equal(c.stage.voting.mediaStates.selectionPrompt,'playing');
 assert.equal(await c.stage.advance(),false);
 c.prompt.end();c.tick(700);
 await c.stage.advance();
 assert.equal(c.stage.state,'vote-one');
 assert.equal(c.button.calls,1);
 assert.equal(c.stage.previous(),true);
 assert.equal(c.stage.state,'vote-prompt');
 assert.equal(c.stage.previous(),true);
 assert.equal(c.stage.state,'discussion');
 await c.stage.advance();
 assert.equal(c.stage.state,'vote-prompt');
 assert.equal(c.button.calls,2,'re-entering cue deliberately replays button');
 assert.equal(c.prompt.calls,2);
 c.stage.destroy();

 const failed=setup();
 failed.button.result=Promise.reject(new Error('blocked'));
 assert.equal(await failed.stage.startAt('vote-prompt'),true);
 assert.equal(failed.stage.selectionButtonState,'error');
 assert.equal(failed.prompt.calls,1,'failed click cannot block or replay the AI voice');
 failed.prompt.end();
 failed.tick(700);
 assert.equal(await failed.stage.advance(),true);
 assert.equal(failed.stage.state,'vote-one');
 assert.equal(failed.button.calls,1,'narration completion does not retry the click');
 failed.stage.destroy();
});

test('selection button is independent of the voice and respects effects volume',()=>{
 const fs=require('node:fs'),vm=require('node:vm');
 const src=fs.readFileSync(require.resolve('../visualizer.js'),'utf8');
 const mixer=src.slice(src.indexOf('let voiceVolume='),src.indexOf('StageOpening.bindAdvanceClick(projectionViewport'));
 const voice={id:'selectionPromptAudio'},button={id:'selectionButtonAudio'},bgm={id:'actOneBgm'},alt={id:'actOneBgmAlt'},hud={hidden:false};
 const elements=[voice,button,bgm,alt];let keys;
 const context={document:{querySelectorAll:()=>elements,getElementById:id=>id==='volumeDisplay'?hud:elements.find(e=>e.id===id)},
  narrationMedia:[voice],window:{actOneBackgroundMusic:{setMasterVolume(value){this.master=value;}}},
  StageOpening:{adjustVolume,bindStageKeys(target,actions){keys=actions;}},startGate:{started:false},advanceStage(){}};
 vm.runInNewContext(mixer,context);
 keys.effectDown();
 assert.equal(button.volume,.95);assert.equal(voice.volume,1);
 keys.voiceDown();
 assert.equal(button.volume,.95);assert.equal(voice.volume,.95);
 keys.otherDown();
 assert.equal(button.volume,.95);assert.equal(context.window.actOneBackgroundMusic.master,.38);
});

test('Act IV continues after third-act blackout, plays both original AI recordings, then ends completely black',async()=>{
 const c=setup();
 assert.equal(await c.stage.startAt('vote-blackout'),true);
 const openingDeadline=c.stage.opening.deadline,selectionDeadline=c.stage.voting.deadline;
 await c.next();assert.equal(c.stage.state,'ending-light');
 await c.next();assert.equal(c.stage.state,'ending-dialogue');
 await c.next();assert.equal(c.stage.state,'ending-complete');
 assert.equal(c.complete.calls,1);
 await c.next();assert.equal(c.stage.state,'ending-complete','Cannot skip first final narration');
 c.complete.end();
 await c.next();assert.equal(c.stage.state,'ending-question');
 await c.next();assert.equal(c.stage.state,'ending-reveal');
 assert.equal(c.reveal.calls,1);
 await c.next();assert.equal(c.stage.state,'ending-reveal','Cannot skip truth reveal');
 c.reveal.end();
 await c.next();assert.equal(c.stage.state,'ending-blackout');
 await c.next();assert.equal(c.stage.state,'credit-directed',
  'The final blackout now leads directly to the first credit');
 assert.equal(c.stage.opening.deadline,openingDeadline);
 assert.equal(c.stage.voting.deadline,selectionDeadline);
 assert.equal(c.stage.previous(),true);
 assert.equal(c.stage.state,'ending-blackout');
 assert.equal(c.stage.previous(),true);
 assert.equal(c.stage.state,'ending-reveal');
 assert.equal(c.stage.previous(),true);
 assert.equal(c.stage.state,'ending-question');
 await c.next();assert.equal(c.stage.state,'ending-reveal');
 assert.equal(c.reveal.calls,2,'returning to revelation replays the recording');
 c.stage.destroy();
});

test('Direct entrance and failed ending recordings preserve manual cue and retry without skipping',async()=>{
 const c=setup();
 assert.equal(await c.stage.startAt('ending-complete'),true);
 assert.equal(c.complete.calls,1);
 assert.equal(c.reveal.calls,0);
 assert.equal(c.stage.ending.mediaStates.endingComplete,'playing');
 c.complete.end();await c.next();
 assert.equal(c.stage.state,'ending-question');
 c.stage.destroy();

 const failed=setup();
 failed.reveal.result=Promise.reject(new Error('blocked'));
 assert.equal(await failed.stage.startAt('ending-reveal'),false);
 assert.equal(failed.stage.state,'ending-reveal');
 assert.equal(failed.stage.ending.mediaStates.endingReveal,'error');
 failed.reveal.result=Promise.resolve();
 await failed.next();
 assert.equal(failed.stage.state,'ending-reveal');
 assert.equal(failed.reveal.calls,2);
 failed.reveal.end();await failed.next();
 assert.equal(failed.stage.state,'ending-blackout');
 failed.stage.destroy();
});

test('live mixer isolates voice, effects and BGM while retaining the crossfade master gain',()=>{
 const fs=require('node:fs'),vm=require('node:vm');
 const source=fs.readFileSync(require.resolve('../visualizer.js'),'utf8');
 const mixer=source.slice(source.indexOf('let voiceVolume='),source.indexOf('StageOpening.bindAdvanceClick(projectionViewport'));
 const voice={id:'voice'},effect={id:'scriptEffect-doorOpen'},video={id:'revealVideo'},bgm={id:'actOneBgm'},alt={id:'actOneBgmAlt'},hud={hidden:false};
 const elements=[voice,effect,video,bgm,alt];let keys;
 const context={document:{querySelectorAll:()=>elements,getElementById:id=>id==='volumeDisplay'?hud:elements.find(e=>e.id===id)},narrationMedia:[voice],window:{actOneBackgroundMusic:{setMasterVolume(value){this.master=value;}}},StageOpening:{adjustVolume,bindStageKeys(target,actions){keys=actions;}},startGate:{started:false},advanceStage(){}};
 vm.runInNewContext(mixer,context);
 keys.effectDown();assert.equal(effect.volume,.95);assert.equal(video.volume,.95);assert.equal(voice.volume,1);assert.equal(context.window.actOneBackgroundMusic.master,.4);
 keys.otherDown();assert.equal(effect.volume,.95);assert.equal(voice.volume,1);assert.equal(context.window.actOneBackgroundMusic.master,.38);
 keys.voiceDown();assert.equal(voice.volume,.95);assert.equal(effect.volume,.95);assert.equal(context.window.actOneBackgroundMusic.master,.38);
 assert.match(hud.textContent,/語音 95%\n音效 95%\n背景音樂 95%/);
});
