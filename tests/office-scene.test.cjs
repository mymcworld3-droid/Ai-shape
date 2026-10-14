"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {OfficeSceneController,StageCueController,bindAdvanceKey}=require("../opening-controller.js");
class Media extends EventTarget {
 constructor(){super();this.calls=0;this.currentTime=0;this.ended=false;this.error=null;}
 play(){this.calls++;this.ended=false;return this.result||Promise.resolve();}
 pause(){this.paused=true;}
 load(){this.error=null;}
 end(){this.ended=true;this.dispatchEvent(new Event("ended"));}
}
function setup({withMedia=false,ready=true}={}){
 let time=0,available=ready;
 const bang=withMedia?new Media():null,cues=[],errors=[];
 const scene=new OfficeSceneController({bang,now:()=>time,isReady:()=>available,
  onCue:cue=>cues.push(cue),onError:(kind,error)=>errors.push({kind,error})});
 return {scene,bang,cues,errors,tick:ms=>time+=ms,ready:value=>available=value};
}
function office(c){c.scene.enter();c.tick(1100);c.scene.advance();c.tick(1300);c.scene.advance();c.tick(1100);}
test("Act II waits for ready backgrounds and fresh cues instead of auto-entering",()=>{
 const c=setup({ready:false});assert.equal(c.scene.enter(),false);
 c.ready(true);assert.equal(c.scene.state,"waiting");assert.equal(c.scene.enter(),true);
 assert.equal(c.scene.enter(),false);c.tick(1100);c.scene.advance();c.tick(1300);
 c.ready(false);assert.equal(c.scene.advance(),false);assert.equal(c.scene.state,"past-isolate");
 c.ready(true);assert.equal(c.scene.state,"past-isolate");c.scene.advance();assert.equal(c.scene.state,"office-light");
});
test("six actor-paced cues respect fades, preserve a silent BANG and finish holding the Memory Room",async()=>{
 const c=setup();c.scene.enter();
 for(let i=0;i<20;i++)assert.equal(c.scene.advance(),false);
 c.tick(1100);c.scene.advance();assert.equal(c.scene.advance(),false);
 c.tick(1300);c.scene.advance();assert.equal(c.scene.advance(),false);
 c.tick(1100);await c.scene.advance();assert.equal(c.scene.bangState,"missing");
 assert.equal(c.scene.advance(),false);c.tick(200);c.scene.advance();
 c.tick(1300);c.scene.advance();c.tick(30000);assert.equal(c.scene.advance(),false);
 assert.deepEqual(c.cues,["past-intro","past-isolate","office-light","office-bang","past-reflection","memory-return"]);
});
test("office BANG starts in the operator gesture and requires the real media end",async()=>{
 const c=setup({withMedia:true});office(c);let resolve;
 c.bang.result=new Promise(done=>resolve=done);const pending=c.scene.advance();
 assert.equal(c.bang.calls,1);assert.equal(c.scene.bangState,"starting");
 c.tick(10000);assert.equal(c.scene.advance(),false);resolve();await pending;
 c.bang.dispatchEvent(new Event("ended"));assert.equal(c.scene.advance(),false);
 c.bang.end();assert.equal(c.scene.state,"office-bang");assert.equal(c.scene.advance(),true);
 assert.equal(c.scene.state,"past-reflection");assert.equal(c.bang.calls,1);
});
test("failed office BANG retries only its sound without consuming the reflection cue",async()=>{
 const c=setup({withMedia:true});office(c);c.bang.result=Promise.reject(new Error("Blocked"));
 await c.scene.advance();assert.equal(c.scene.bangState,"error");assert.equal(c.scene.state,"office-bang");
 c.bang.result=Promise.resolve();await c.scene.advance();assert.equal(c.bang.calls,2);
 assert.equal(c.scene.state,"office-bang");assert.equal(c.errors.length,1);
 c.bang.end();c.scene.advance();assert.equal(c.scene.state,"past-reflection");
});
test("genuine BANG completion wins over a late play rejection or duplicate media error",async()=>{
 const c=setup({withMedia:true});office(c);let reject;
 c.bang.result=new Promise((_,no)=>reject=no);const pending=c.scene.advance();
 c.bang.end();reject(new Error("Late"));await pending;c.bang.dispatchEvent(new Event("error"));c.bang.end();
 assert.equal(c.scene.bangState,"finished");assert.equal(c.errors.length,0);assert.equal(c.scene.state,"office-bang");
});
test("an asynchronous BANG error invalidates pending play and still permits a fresh retry",async()=>{
 const c=setup({withMedia:true});office(c);let resolve;
 c.bang.result=new Promise(done=>resolve=done);const pending=c.scene.advance();
 c.bang.dispatchEvent(new Event("error"));resolve();await pending;
 assert.equal(c.scene.bangState,"error");c.bang.result=Promise.resolve();await c.scene.advance();
 assert.equal(c.bang.calls,2);assert.equal(c.scene.bangState,"playing");
});
test("holding Space during BANG or a fade never queues the next actor cue",async()=>{
 const c=setup({withMedia:true});office(c);await c.scene.advance();
 const target=new EventTarget();bindAdvanceKey(target,()=>c.scene.advance());
 const key=(type,repeat=false)=>{const e=new Event(type);Object.assign(e,{code:"Space",repeat});target.dispatchEvent(e);};
 key("keydown");c.bang.end();key("keydown",true);key("keydown");assert.equal(c.scene.state,"office-bang");
 key("keyup");key("keydown");assert.equal(c.scene.state,"past-reflection");
 c.tick(1300);key("keydown",true);assert.equal(c.scene.state,"past-reflection");
 key("keyup");key("keydown");assert.equal(c.scene.state,"memory-return");
});
test("destroy detaches BANG events, pauses audio and prevents pending media or new cues",async()=>{
 const c=setup({withMedia:true});office(c);let resolve;
 c.bang.result=new Promise(done=>resolve=done);const pending=c.scene.advance();
 c.scene.destroy();resolve();await pending;c.bang.end();c.bang.dispatchEvent(new Event("error"));
 assert.equal(c.bang.paused,true);assert.equal(c.errors.length,0);
 c.tick(20000);assert.equal(c.scene.advance(),false);assert.equal(c.scene.enter(),false);
});
test("all eighteen cues leave the opening deadline and completed opening media untouched",async()=>{
 let time=0;const video=new Media(),audio=new Media(),bang=new Media(),cues=[];
 const stage=new StageCueController({video,audio,now:()=>time,memoryScene:{},officeScene:{bang},onCue:cue=>cues.push(cue)});
 const step=async(ms=0)=>{time+=ms;return stage.advance();};
 await step();video.end();await step(300);await step(1000);await step(200);await step(2000);
 audio.end();const deadline=stage.opening.deadline;
 await step(1100);await step(200);
 for(const ms of [1300,500,500,1300,1100,700,700])await step(ms);
 assert.equal(stage.state,"memory-blackout");assert.equal(await step(500),false);
 await step(800);assert.equal(stage.state,"past-intro");
 for(const ms of [1100,1300,1100])await step(ms);
 assert.equal(stage.state,"office-bang");await step(3000);assert.equal(stage.state,"office-bang");
 bang.end();await step();assert.equal(stage.state,"past-reflection");await step(1300);
 assert.equal(stage.state,"memory-return");assert.equal(await step(1100),false);
 assert.equal(stage.opening.deadline,deadline);assert.ok(stage.opening.getRemainingMs()<900000);
 assert.equal(audio.calls,1);assert.equal(video.calls,1);assert.equal(bang.calls,1);
 time=deadline;assert.equal(stage.opening.getRemainingMs(),0);assert.equal(stage.state,"memory-return");
 assert.deepEqual(cues.slice(-6),["past-intro","past-isolate","office-light","office-bang","past-reflection","memory-return"]);
 stage.destroy();assert.equal(bang.paused,true);
});
