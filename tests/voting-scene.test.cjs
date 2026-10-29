"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {VotingSceneController,StageCueController,bindAdvanceKey}=require("../opening-controller.js");
class Media extends EventTarget {
 constructor(){super();this.calls=0;this.ended=false;this.error=null;this.currentTime=0;}
 play(){this.calls++;this.ended=false;return this.result||Promise.resolve();}
 pause(){this.paused=true;}
 load(){this.error=null;}
 end(){this.ended=true;this.dispatchEvent(new Event("ended"));}
}
function setup({withMedia=false,ready=true}={}){
 let time=0,available=ready;const media={},cues=[],errors=[];
 for(const kind of ['prompt','one','two','final'])media[kind]=withMedia?new Media():null;
 const scene=new VotingSceneController({...media,now:()=>time,isReady:()=>available,
  onCue:cue=>cues.push(cue),onError:(kind,error)=>errors.push({kind,error})});
 return {scene,...media,cues,errors,tick:ms=>time+=ms,ready:value=>available=value};
}
async function prompt(c){c.scene.enter();c.tick(700);await c.scene.advance();c.tick(700);}
test("discussion requires a ready Memory Room and a fresh cue; no narration or timer starts on entry",()=>{
 const c=setup({withMedia:true,ready:false});assert.equal(c.scene.enter(),false);
 c.ready(true);assert.equal(c.scene.state,'waiting');assert.equal(c.scene.enter(),true);
 assert.equal(c.scene.enter(),false);assert.equal(c.prompt.calls,0);assert.equal(c.scene.deadline,null);
 c.tick(20000);assert.equal(c.scene.state,'discussion');
});
test("seven silent cues follow the script and begin the minute only on the explicit clock cue",async()=>{
 const c=setup();await prompt(c);assert.equal(c.scene.deadline,null);
 assert.equal(c.scene.mediaStates.selectionPrompt,'missing');await c.scene.advance();
 assert.equal(c.scene.getRemainingMs(),60000);const deadline=c.scene.deadline;
 for(let i=0;i<3;i++){assert.equal(c.scene.advance(),false);c.tick(700);await c.scene.advance();}
 c.tick(700);c.scene.advance();assert.equal(c.scene.state,'vote-blackout');
 c.tick(10000);assert.equal(c.scene.advance(),false);assert.equal(c.scene.deadline,deadline);
 assert.deepEqual(c.cues,['discussion','vote-prompt','vote-clock','vote-one','vote-two','vote-final','vote-blackout']);
});
test("only genuine selection prompt end starts its deadline, never a premature or repeated ended event",async()=>{
 const c=setup({withMedia:true});await prompt(c);
 assert.equal(c.scene.advance(),false);c.prompt.dispatchEvent(new Event('ended'));assert.equal(c.scene.deadline,null);
 c.tick(2000);c.prompt.end();const deadline=c.scene.deadline;assert.equal(c.scene.state,'vote-prompt');
 c.tick(500);c.prompt.end();assert.equal(c.scene.deadline,deadline);assert.equal(c.scene.getRemainingMs(),59500);
 assert.equal(c.scene.advance(),false,'Shrinking must finish before the next cue');
 c.tick(100);c.scene.advance();assert.equal(c.scene.state,'vote-clock');assert.equal(c.scene.deadline,deadline);
});
test("each vote recording gates the next cue and cannot alter the selection deadline",async()=>{
 const c=setup({withMedia:true});await prompt(c);c.prompt.end();c.tick(700);c.scene.advance();const deadline=c.scene.deadline;
 for(const [kind,state] of [['one','vote-one'],['two','vote-two'],['final','vote-final']]){
  c.tick(700);await c.scene.advance();assert.equal(c.scene.state,state);assert.equal(c[kind].calls,1);
  c.tick(1000);assert.equal(c.scene.advance(),false);c[kind].end();assert.equal(c.scene.state,state);
  assert.equal(c.scene.advance(),false,'Real voice end must still complete its shrink');
  assert.equal(c.scene.deadline,deadline);
 }
 c.tick(700);c.scene.advance();assert.equal(c.scene.state,'vote-blackout');
});
test("all four failed voices retry only their own recording and retain the actor cue",async()=>{
 const c=setup({withMedia:true});c.prompt.result=Promise.reject(new Error('Blocked'));await prompt(c);
 for(const [kind,state,key] of [['prompt','vote-prompt','selectionPrompt'],['one','vote-one','selectionOne'],['two','vote-two','selectionTwo'],['final','vote-final','selectionFinal']]){
  if(kind!=='prompt'){c[kind].result=Promise.reject(new Error('Blocked'));c.tick(700);await c.scene.advance();}
  assert.equal(c.scene.state,state);assert.equal(c.scene.mediaStates[key],'error');
  c.tick(700);c[kind].result=Promise.resolve();await c.scene.advance();assert.equal(c.scene.state,state);
  assert.equal(c[kind].calls,2);c[kind].end();
  if(kind==='prompt'){c.tick(700);c.scene.advance();assert.equal(c.scene.state,'vote-clock');}
 }
 assert.equal(c.errors.length,4);assert.equal(c.prompt.calls,2);assert.equal(c.one.calls,2);
});
test("holding Space through a voice end or timer expiry never consumes the next vote",async()=>{
 const c=setup({withMedia:true});await prompt(c);
 const target=new EventTarget();bindAdvanceKey(target,()=>c.scene.advance());
 const key=(type,repeat=false)=>{const e=new Event(type);Object.assign(e,{code:'Space',repeat});target.dispatchEvent(e);};
 key('keydown');c.prompt.end();c.tick(61000);key('keydown',true);key('keydown');
 assert.equal(c.scene.state,'vote-prompt');assert.equal(c.scene.getRemainingMs(),0);
 key('keyup');key('keydown');assert.equal(c.scene.state,'vote-clock');
 c.tick(700);key('keydown',true);assert.equal(c.one.calls,0);
 key('keyup');key('keydown');assert.equal(c.scene.state,'vote-one');assert.equal(c.one.calls,1);
});
test("real voice end wins over late rejection and late error without resetting either cue or minute",async()=>{
 const c=setup({withMedia:true});let reject;c.prompt.result=new Promise((_,no)=>reject=no);
 c.scene.enter();c.tick(700);const pending=c.scene.advance();c.prompt.end();const deadline=c.scene.deadline;
 reject(new Error('Late'));await pending;c.prompt.dispatchEvent(new Event('error'));
 assert.equal(c.scene.mediaStates.selectionPrompt,'finished');assert.equal(c.errors.length,0);
 assert.equal(c.scene.deadline,deadline);assert.equal(c.scene.state,'vote-prompt');
});
test("a pending voice error invalidates its play promise and a fresh cue can retry",async()=>{
 const c=setup({withMedia:true});let resolve;c.prompt.result=new Promise(done=>resolve=done);
 c.scene.enter();c.tick(700);const pending=c.scene.advance();c.prompt.dispatchEvent(new Event('error'));resolve();await pending;
 assert.equal(c.scene.mediaStates.selectionPrompt,'error');assert.equal(c.scene.deadline,null);
 c.tick(700);c.prompt.result=Promise.resolve();await c.scene.advance();assert.equal(c.prompt.calls,2);
});
test("destroy pauses all selection voices and detaches late events or pending starts",async()=>{
 const c=setup({withMedia:true});let resolve;c.prompt.result=new Promise(done=>resolve=done);
 c.scene.enter();c.tick(700);const pending=c.scene.advance();c.scene.destroy();resolve();await pending;
 for(const kind of ['prompt','one','two','final']){c[kind].end();c[kind].dispatchEvent(new Event('error'));assert.equal(c[kind].paused,true);}
 c.tick(20000);assert.equal(c.scene.advance(),false);assert.equal(c.scene.enter(),false);
 assert.equal(c.scene.deadline,null);assert.equal(c.errors.length,0);
});
test("selection time uses an absolute deadline, stops exactly at zero and never auto-votes or auto-blacks out",async()=>{
 const c=setup();await prompt(c);c.scene.advance();c.tick(59999);assert.equal(c.scene.getRemainingMs(),1);
 c.tick(1);assert.equal(c.scene.getRemainingMs(),0);c.tick(900000);assert.equal(c.scene.getRemainingMs(),0);
 assert.equal(c.scene.state,'vote-clock');assert.equal(c.cues.length,3);
});
test("real prompt completion locks the shrink while its minute runs and never consumes the next cue",async()=>{
 const c=setup({withMedia:true});await prompt(c);c.tick(2000);c.prompt.end();
 const deadline=c.scene.deadline;
 assert.equal(c.scene.advance(),false);c.tick(599);assert.equal(c.scene.advance(),false);
 assert.equal(c.scene.state,'vote-prompt');assert.equal(c.scene.getRemainingMs(),59401);
 c.tick(1);assert.equal(c.scene.state,'vote-prompt');assert.equal(c.scene.advance(),true);
 assert.equal(c.scene.state,'vote-clock');assert.equal(c.scene.deadline,deadline);
});
test("a live voice error waits for its shrink before retrying without starting a false minute",async()=>{
 const c=setup({withMedia:true});await prompt(c);c.tick(2000);
 c.prompt.dispatchEvent(new Event('error'));assert.equal(c.scene.mediaStates.selectionPrompt,'error');
 assert.equal(c.scene.advance(),false);c.tick(599);assert.equal(c.scene.advance(),false);
 c.tick(1);await c.scene.advance();assert.equal(c.prompt.calls,2);
 assert.equal(c.scene.state,'vote-prompt');assert.equal(c.scene.deadline,null);
});
test("all twenty-five cues keep the opening deadline while selection receives its own minute",async()=>{
 let time=0;const video=new Media(),audio=new Media();
 const stage=new StageCueController({video,audio,now:()=>time,memoryScene:{},officeScene:{},votingScene:{}});
 const step=async(ms=0)=>{time+=ms;return stage.advance();};
 await step();video.end();await step(300);await step(1000);await step(200);await step(2000);audio.end();
 const original=stage.opening.deadline;
 await step(1100);await step(1300);
 for(const ms of [1300,500,500,1300,1100,700,700,1300,1100,1300,1100,200,1300])await step(ms);
 assert.equal(stage.state,'memory-return');await step(1100);assert.equal(stage.state,'discussion');
 await step(700);assert.equal(stage.state,'vote-prompt');assert.equal(stage.voting.deadline,null);
 await step(700);assert.equal(stage.state,'vote-clock');const selection=stage.voting.deadline;
 for(const ms of [700,700,700,700])await step(ms);
 assert.equal(stage.state,'vote-blackout');await step(1300);assert.equal(stage.state,'vote-blackout');
 assert.equal(stage.opening.deadline,original);assert.equal(stage.voting.deadline,selection);assert.notEqual(original,selection);
 assert.equal(video.calls,1);assert.equal(audio.calls,1);assert.ok(stage.opening.getRemainingMs()<900000);
 stage.destroy();
});
