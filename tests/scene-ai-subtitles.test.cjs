"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {groupedAiLines,mount}=require("../scene-ai-subtitles.js");
const entries=[
 {id:"a",group:"opening",speaker:"AI VOICE",text:"Welcome to human verification."},
 {id:"b",group:"opening",speaker:"AI VOICE",text:"Please remain calm."},
 {id:"c",group:"memory",speaker:"AI VOICE",text:"Access granted."},
 {id:"x",group:"opening",speaker:"RACHEL",text:"No!"}
];
test("Only original script AI lines become manual captions",()=>{
 const g=groupedAiLines(entries);
 assert.deepEqual(Object.keys(g),["opening","memory"]);
 assert.deepEqual(g.opening.map(e=>e.id),["a","b"]);
});
function fakeAudio(){
 const events={},audio={
  paused:true,ended:false,currentTime:0,duration:8,
  addEventListener(n,fn){(events[n]??=[]).push(fn)},
  removeEventListener(n,fn){events[n]=events[n].filter(f=>f!==fn)}
 };
 return {audio,emit:n=>(events[n]||[]).forEach(fn=>fn())};
}
test("Scene caption advances only when operator presses Next, and rewinds with Previous",()=>{
 const {audio,emit}=fakeAudio();
 const shown=[],renderer={render(e){shown.push(e?.id??null)}};
 let started=false;
 const ctrl=mount({entries,media:{opening:audio},renderer,isStarted:()=>started});
 assert.equal(ctrl.sync(),null);
 started=true;audio.paused=false;emit("play");
 assert.equal(shown.at(-1),"a");assert.equal(ctrl.index,0);
 audio.currentTime=7.7;emit("timeupdate");
 assert.equal(shown.at(-1),"a","Elapsed audio time may never auto-advance");
 assert.equal(ctrl.next(),true);assert.equal(shown.at(-1),"b");
 assert.equal(ctrl.next(),false,"Last caption yields Next to the scene controller");
 assert.equal(ctrl.previous(),true);assert.equal(shown.at(-1),"a");
 assert.equal(ctrl.previous(),false);
 assert.equal(audio.currentTime,7.7,"Caption presses do not seek audio");
 assert.equal(ctrl.next(),true);
 audio.ended=true;audio.paused=true;emit("ended");
 assert.equal(shown.at(-1),"b","Completed audio preserves last manual caption");
 ctrl.clearCompleted();assert.equal(shown.at(-1),null);
 ctrl.destroy();
});
test("Pausing/rewinding and starting a new voice clears previous caption group",()=>{
 const opening=fakeAudio(),memory=fakeAudio();
 const shown=[],ctrl=mount({entries,media:{opening:opening.audio,memory:memory.audio},
  renderer:{render(e){shown.push(e?.id??null)}}});
 opening.audio.paused=false;opening.emit("play");
 ctrl.next();assert.equal(shown.at(-1),"b");
 opening.audio.paused=true;opening.emit("pause");
 assert.equal(shown.at(-1),null);
 memory.audio.paused=false;memory.emit("play");
 assert.equal(shown.at(-1),"c");
 assert.equal(ctrl.next(),false);
 ctrl.destroy();
 assert.equal(shown.at(-1),null);
});
