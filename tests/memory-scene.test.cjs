"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {MemorySceneController,StageCueController,bindAdvanceKey}=require("../opening-controller.js");
class Media extends EventTarget {
 constructor(){super();this.calls=0;this.currentTime=0;this.ended=false;this.error=null;}
 play(){this.calls++;this.ended=false;return this.result||Promise.resolve();}
 pause(){this.paused=true;}
 load(){this.error=null;}
 end(){this.ended=true;this.dispatchEvent(new Event("ended"));}
}
function setup({withMedia=false,ready=true}={}){
 let time=0,available=ready;
 const voice=withMedia?new Media():null,click=withMedia?new Media():null;
 const cues=[],errors=[],ends=[];
 const scene=new MemorySceneController({voice,click,now:()=>time,isReady:()=>available,
  onCue:cue=>cues.push(cue),onError:(kind,error)=>errors.push({kind,error}),onVoiceEnd:()=>ends.push(time)});
 return {scene,voice,click,cues,errors,ends,tick:ms=>time+=ms,ready:value=>available=value};
}
test("the next room stays dark until its background is ready and a fresh operator cue arrives",async()=>{
 const c=setup({withMedia:true,ready:false});
 assert.equal(c.scene.enter(),false);assert.equal(c.scene.state,"waiting");
 assert.equal(c.voice.calls,0);assert.equal(c.click.calls,0);
 c.ready(true);assert.equal(c.scene.state,"waiting");
 const pending=c.scene.enter();assert.equal(c.click.calls,1,"Playback begins inside the cue");
 assert.equal(c.scene.state,"memory-light");await pending;
});
test("missing audio leaves four manual cues and respects every fade without queuing",async()=>{
 const c=setup();await c.scene.enter();
 assert.equal(c.scene.mediaStates.memoryClick,"missing");
 for(let i=0;i<20;i++)assert.equal(c.scene.advance(),false);
 c.tick(1001);await c.scene.advance();assert.equal(c.scene.state,"memory-welcome");
 assert.equal(c.scene.mediaStates.memoryVoice,"missing");
 c.tick(601);c.scene.advance();assert.equal(c.scene.state,"memory-room");
 c.tick(601);c.scene.advance();assert.equal(c.scene.state,"memory-blackout");
 c.tick(2000);assert.equal(c.scene.advance(),false);
 assert.deepEqual(c.cues,["memory-light","memory-welcome","memory-room","memory-blackout"]);
});
test("light audio gates the greeting until its genuine end and cannot replay during pending play",async()=>{
 const c=setup({withMedia:true});let resolve;
 c.click.result=new Promise(done=>resolve=done);
 const pending=c.scene.enter();c.tick(2000);
 assert.equal(c.scene.enter(),false);assert.equal(c.scene.advance(),false);
 resolve();await pending;
 assert.equal(c.scene.advance(),false);
 c.click.dispatchEvent(new Event("ended"));assert.equal(c.scene.advance(),false);
 c.click.end();await c.scene.advance();assert.equal(c.voice.calls,1);
 assert.equal(c.click.calls,1);
});
test("memory voice completion fades AI once, retains the manual cue and blocks held-key spill",async()=>{
 const c=setup({withMedia:true});await c.scene.enter();c.click.end();c.tick(1100);await c.scene.advance();
 c.tick(1000);
 const target=new EventTarget();bindAdvanceKey(target,()=>c.scene.advance());
 const key=(type,repeat=false)=>{const e=new Event(type);Object.assign(e,{code:"Space",repeat});target.dispatchEvent(e);};
 key("keydown");assert.equal(c.scene.state,"memory-welcome");
 c.voice.dispatchEvent(new Event("ended"));assert.equal(c.ends.length,0);
 c.voice.end();c.voice.end();assert.equal(c.ends.length,1);
 assert.equal(c.scene.state,"memory-welcome");assert.equal(c.scene.advance(),false);
 c.tick(700);key("keydown",true);key("keydown");assert.equal(c.scene.state,"memory-welcome");
 key("keyup");key("keydown");assert.equal(c.scene.state,"memory-room");
 assert.equal(c.voice.calls,1);
});
test("each failed memory asset retries its own cue without replaying the other",async()=>{
 const c=setup({withMedia:true});c.click.result=Promise.reject(new Error("Blocked"));
 await c.scene.enter();assert.equal(c.scene.state,"memory-light");
 assert.equal(c.scene.mediaStates.memoryClick,"error");assert.equal(c.voice.calls,0);
 c.tick(1100);c.click.result=Promise.resolve();await c.scene.advance();
 c.click.end();c.voice.result=Promise.reject(new Error("Blocked"));await c.scene.advance();
 assert.equal(c.scene.state,"memory-welcome");assert.equal(c.scene.mediaStates.memoryVoice,"error");
 c.tick(700);c.voice.result=Promise.resolve();await c.scene.advance();
 assert.equal(c.click.calls,2);assert.equal(c.voice.calls,2);assert.equal(c.errors.length,2);
});
test("a real memory voice end wins over late play rejection and duplicate media errors",async()=>{
 const c=setup({withMedia:true});await c.scene.enter();c.click.end();c.tick(1100);
 let reject;c.voice.result=new Promise((_,no)=>reject=no);
 const pending=c.scene.advance();c.voice.end();reject(new Error("Late failure"));await pending;
 c.voice.dispatchEvent(new Event("error"));
 assert.equal(c.scene.mediaStates.memoryVoice,"finished");assert.equal(c.errors.length,0);assert.equal(c.ends.length,1);
});
test("a memory media error invalidates its pending play; a fresh cue can retry",async()=>{
 const c=setup({withMedia:true});await c.scene.enter();c.click.end();c.tick(1100);
 let resolve;c.voice.result=new Promise(done=>resolve=done);
 const pending=c.scene.advance();c.voice.dispatchEvent(new Event("error"));resolve();await pending;
 assert.equal(c.scene.mediaStates.memoryVoice,"error");assert.equal(c.ends.length,0);
 c.tick(700);c.voice.result=Promise.resolve();await c.scene.advance();assert.equal(c.voice.calls,2);
});
test("destroy detaches memory media and cancels pending completion or new cues",async()=>{
 const c=setup({withMedia:true});await c.scene.enter();c.click.end();c.tick(1100);
 let resolve;c.voice.result=new Promise(done=>resolve=done);const pending=c.scene.advance();
 c.scene.destroy();resolve();await pending;c.voice.end();c.voice.dispatchEvent(new Event("error"));
 c.tick(2000);assert.equal(c.scene.advance(),false);assert.equal(c.scene.enter(),false);
 assert.equal(c.ends.length,0);assert.equal(c.errors.length,0);assert.equal(c.voice.paused,true);
});
test("crossing into the memory scene preserves the opening's running deadline and completed media",async()=>{
 let time=0;const video=new Media(),audio=new Media(),voice=new Media();
 const stage=new StageCueController({video,audio,now:()=>time,memoryScene:{voice}});
 const step=async(ms=0)=>{time+=ms;return stage.advance();};
 await step();video.end();await step(300);await step(1000);await step(200);
 await step(2000);audio.end();const deadline=stage.opening.deadline;
 await step(1100);await step(1300);
 await step(1300);await step(500);await step(500);
 assert.equal(stage.state,"blackout");assert.equal(await step(500),false);
 await step(800);assert.equal(stage.state,"memory-light");
 await step(1100);assert.equal(stage.state,"memory-welcome");voice.end();
 await step(700);assert.equal(stage.state,"memory-room");
 await step(700);assert.equal(stage.state,"memory-blackout");
 assert.equal(stage.opening.deadline,deadline);assert.ok(stage.opening.getRemainingMs()<900000);
 assert.equal(audio.calls,1);assert.equal(video.calls,1);assert.equal(voice.calls,1);
 time=deadline;assert.equal(stage.opening.getRemainingMs(),0);assert.equal(stage.state,"memory-blackout");
});
