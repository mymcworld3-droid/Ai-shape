"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {Controller}=require("../ending-voice.js");
class Audio{
 constructor(){this.src="";this.volume=0;this.currentTime=0;this.paused=true;this.loop=false;this.readyState=4;this.plays=0;}
 play(){this.paused=false;this.plays++;return Promise.resolve();}
 pause(){this.paused=true;}
 load(){}
}
function harness(){
 const audio=new Audio(),timers=new Map(),ticks=new Map(),advances=[],errors=[];
 let now=0,next=0;
 const voice=new Controller({
  audio,src:"assets/audio/background/Ending.mp3",startDelayMs:1000,leadMs:1600,
  now:()=>now,onAdvance:()=>advances.push(now),onError:e=>errors.push(e),
  setTimer:(fn,ms)=>{const id=++next;timers.set(id,{fn,at:now+ms});return id;},
  clearTimer:id=>timers.delete(id),
  setTicker:fn=>{const id=++next;ticks.set(id,fn);return id;},
  clearTicker:id=>ticks.delete(id)
 });
 async function wait(ms){
  now+=ms;
  for(const [id,task] of [...timers])if(task.at<=now){timers.delete(id);task.fn();}
  for(const fn of [...ticks.values()])fn();
  await Promise.resolve();await Promise.resolve();
 }
 return {voice,audio,advances,errors,wait,timers,ticks};
}
test("Ending.mp3 is a voice played once, with a 1s silent lead and 1.6s audible handoff",async()=>{
 const {voice,audio,advances,wait}=harness();
 assert.equal(audio.src,"assets/audio/background/Ending.mp3");
 voice.setMasterVolume(.65);
 voice.cue("end-blackout");
 assert.equal(audio.paused,false);
 assert.equal(audio.volume,0);
 assert.equal(audio.loop,false);
 await wait(10);
 await wait(600);
 assert.equal(audio.volume,0);
 await wait(400);
 assert.equal(audio.volume,.65);
 assert.equal(audio.currentTime,0,"After silent warm-up the actual narration starts from the beginning");
 audio.currentTime=1.58;
 await wait(30);
 assert.equal(advances.length,0);
 audio.currentTime=1.63;
 await wait(30);
 assert.equal(advances.length,1);
 voice.cue("credit-directed");
 assert.equal(audio.plays,1,"The same voice keeps playing through the credits");
 voice.cue("credit-produced");
 assert.equal(audio.plays,1);
 audio.currentTime=2.5;
 await wait(40);
 assert.equal(advances.length,1,"A credit cannot automatically trigger a second advance");
});
test("1/Q updates ending voice, 3/E is irrelevant and rewinds stop the recording",async()=>{
 const {voice,audio,wait,advances}=harness();
 voice.cue("end-blackout");await wait(0);await wait(1000);
 voice.setMasterVolume(.3);assert.equal(audio.volume,.3);
 voice.setMasterVolume(1);assert.equal(audio.volume,1);
 voice.cue("discussion");
 assert.equal(audio.paused,true);
 assert.equal(audio.volume,0);
 await wait(1600);
 assert.equal(advances.length,0);
 voice.cue("credit-backgrounds");
 assert.equal(audio.paused,false);
 assert.equal(audio.volume,1);
 voice.cue("end-blackout");
 assert.equal(audio.volume,0,"Re-entering the blackout restarts the 1s lead");
});
test("direct credit preview is silent until a real cue and jump-in playback has no auto-step",async()=>{
 const {voice,audio,wait,advances}=harness();
 voice.cue("credit-directed",false);
 assert.equal(audio.plays,0);
 voice.cue("credit-directed");
 assert.equal(audio.plays,1);
 assert.equal(audio.volume,1);
 audio.currentTime=10;
 await wait(2000);
 assert.equal(advances.length,0);
 voice.cue("credit-title");
 assert.equal(audio.plays,1);
 voice.cue("memory-light");
 assert.equal(audio.paused,true);
});
