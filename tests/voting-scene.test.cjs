"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {VotingSceneController,StageCueController,bindAdvanceKey}=require("../opening-controller.js");
class Media extends EventTarget {
 constructor(){super();this.calls=0;this.ended=false;this.error=null;this.currentTime=0;this.paused=true;}
 play(){this.calls++;this.ended=false;this.paused=false;return this.result||Promise.resolve();}
 pause(){this.paused=true;}
 load(){this.error=null;}
 end(){this.ended=true;this.paused=true;this.dispatchEvent(new Event("ended"));}
}
function setup({withMedia=false,ready=true}={}){
 let time=0,available=ready;const media={},cues=[],errors=[];
 for(const kind of ["prompt","one","two","final"])media[kind]=withMedia?new Media():null;
 const scene=new VotingSceneController({...media,now:()=>time,isReady:()=>available,
  onCue:cue=>cues.push(cue),onError:(kind,error)=>errors.push({kind,error})});
 return {scene,...media,cues,errors,tick:ms=>time+=ms,ready:value=>available=value};
}
async function prompt(c){c.scene.enter();c.tick(700);await c.scene.advance();c.tick(700);}
test("voting enters only from a ready memory room, without any timer",()=>{
 const c=setup({withMedia:true,ready:false});
 assert.equal(c.scene.enter(),false);
 c.ready(true);assert.equal(c.scene.enter(),true);
 assert.equal(c.scene.enter(),false);
 assert.equal(c.scene.state,"discussion");
 assert.equal(c.scene.deadline,null);
 assert.equal(c.scene.getRemainingMs(),null);
 c.tick(120000);assert.equal(c.scene.state,"discussion");
 c.scene.destroy();
});
test("all six silent selection cues advance manually without a vote-clock cue",async()=>{
 const c=setup();await prompt(c);
 assert.equal(c.scene.state,"vote-prompt");
 assert.equal(c.scene.mediaStates.selectionPrompt,"missing");
 for(const expected of ["vote-one","vote-two","vote-final","vote-blackout"]){
  assert.equal(await c.scene.advance(),true);
  assert.equal(c.scene.state,expected);
  assert.equal(c.scene.deadline,null);
  assert.equal(c.scene.getRemainingMs(),null);
  c.tick(700);
 }
 c.tick(600000);assert.equal(c.scene.advance(),false);
 assert.deepEqual(c.cues,["discussion","vote-prompt","vote-one","vote-two","vote-final","vote-blackout"]);
 c.scene.destroy();
});
test("a real prompt recording must finish naturally before the first vote",async()=>{
 const c=setup({withMedia:true});await prompt(c);
 assert.equal(c.scene.mediaStates.selectionPrompt,"playing");
 assert.equal(c.scene.advance(),false);
 c.prompt.dispatchEvent(new Event("ended"));
 assert.equal(c.scene.mediaStates.selectionPrompt,"playing","ended flag must be genuine");
 c.prompt.end();
 assert.equal(c.scene.mediaStates.selectionPrompt,"finished");
 assert.equal(c.scene.advance(),false,"voice settle must not skip the next actor cue");
 c.tick(600);await c.scene.advance();
 assert.equal(c.scene.state,"vote-one");
 assert.equal(c.one.calls,1);
 assert.equal(c.scene.deadline,null);
 c.scene.destroy();
});
test("each vote recording gates its successor and no timed expiry changes the state",async()=>{
 const c=setup({withMedia:true});await prompt(c);
 c.prompt.end();c.tick(600);await c.scene.advance();
 for(const [kind,state,next] of [["one","vote-one","vote-two"],["two","vote-two","vote-final"],["final","vote-final","vote-blackout"]]){
  assert.equal(c.scene.state,state);
  c.tick(100000);assert.equal(c.scene.state,state,"time alone never advances the vote");
  assert.equal(c.scene.advance(),false,"an unfinished voice cannot be skipped");
  c[kind].end();
  assert.equal(c.scene.advance(),false,"keep voice settle interval");
  c.tick(600);await c.scene.advance();
  assert.equal(c.scene.state,next);
  assert.equal(c.scene.deadline,null);
 }
 c.scene.destroy();
});
test("failed AI recording retries the same cue instead of advancing or launching a timer",async()=>{
 const c=setup({withMedia:true});
 c.prompt.result=Promise.reject(new Error("Blocked"));await prompt(c);
 assert.equal(c.scene.state,"vote-prompt");
 assert.equal(c.scene.mediaStates.selectionPrompt,"error");
 c.prompt.result=Promise.resolve();
 await c.scene.advance();
 assert.equal(c.prompt.calls,2);
 assert.equal(c.scene.state,"vote-prompt");
 c.prompt.end();c.tick(600);
 await c.scene.advance();assert.equal(c.scene.state,"vote-one");
 assert.equal(c.scene.deadline,null);
 assert.equal(c.errors.length,1);
 c.scene.destroy();
});
test("late media errors cannot override an already finished prompt",async()=>{
 const c=setup({withMedia:true});let reject;
 c.prompt.result=new Promise((_,no)=>reject=no);
 c.scene.enter();c.tick(700);
 const pending=c.scene.advance();
 c.prompt.end();reject(new Error("Late"));
 await pending;c.prompt.dispatchEvent(new Event("error"));
 assert.equal(c.scene.mediaStates.selectionPrompt,"finished");
 assert.equal(c.scene.deadline,null);
 assert.equal(c.errors.length,0);
 c.scene.destroy();
});
test("held Space never consumes another vote, even after a completed voice",async()=>{
 const c=setup({withMedia:true});await prompt(c);
 const target=new EventTarget();
 const unbind=bindAdvanceKey(target,()=>c.scene.advance());
 const key=(type,repeat=false)=>{const e=new Event(type);Object.assign(e,{code:"Space",repeat});target.dispatchEvent(e);};
 key("keydown");c.prompt.end();c.tick(60000);key("keydown",true);
 assert.equal(c.scene.state,"vote-prompt");
 key("keyup");key("keydown");
 assert.equal(c.scene.state,"vote-one");
 c.tick(700);key("keydown",true);assert.equal(c.two.calls,0);
 unbind();c.scene.destroy();
});
test("destroy pauses all voting voices and invalidates pending playback",async()=>{
 const c=setup({withMedia:true});let resolve;
 c.prompt.result=new Promise(done=>resolve=done);
 c.scene.enter();c.tick(700);const pending=c.scene.advance();
 c.scene.destroy();resolve();await pending;
 for(const kind of ["prompt","one","two","final"]){
  c[kind].end();c[kind].dispatchEvent(new Event("error"));
  assert.equal(c[kind].paused,true);
 }
 assert.equal(c.scene.advance(),false);
 assert.equal(c.scene.deadline,null);
 assert.equal(c.errors.length,0);
});
test("the third act retains its original opening deadline but never starts another timer",async()=>{
 let time=0;const video=new Media(),audio=new Media();
 const stage=new StageCueController({video,audio,now:()=>time,memoryScene:{},officeScene:{},votingScene:{}});
 assert.equal(await stage.startAt("discussion"),true);
 const original=stage.opening.deadline;
 assert.ok(original>0,"the first-act opening deadline remains");
 const step=async()=>{time+=700;await stage.advance();};
 await step();assert.equal(stage.state,"vote-prompt");
 for(const expected of ["vote-one","vote-two","vote-final","vote-blackout"]){
  await step();assert.equal(stage.state,expected);
  assert.equal(stage.voting.deadline,null);
 }
 assert.equal(stage.opening.deadline,original);
 assert.equal(stage.voting.getRemainingMs(),null);
 stage.destroy();
});
