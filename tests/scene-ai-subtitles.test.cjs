"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {groupedAiLines,subtitleAtTime,mount}=require("../scene-ai-subtitles.js");
const entries=[
 {id:"a",group:"opening",speaker:"AI VOICE",text:"Welcome to human verification."},
 {id:"b",group:"opening",speaker:"AI VOICE",text:"Please remain calm."},
 {id:"c",group:"memory",speaker:"AI VOICE",text:"Access granted."},
 {id:"x",group:"opening",speaker:"RACHEL",text:"No!"}
];
test("Only script AI lines become captions",()=>{
 const g=groupedAiLines(entries);
 assert.deepEqual(Object.keys(g),["opening","memory"]);
 assert.deepEqual(g.opening.map(e=>e.id),["a","b"]);
});
test("Scene captions advance according to real audio time",()=>{
 const g=groupedAiLines(entries).opening;
 assert.equal(subtitleAtTime(g,0,8).id,"a");
 assert.equal(subtitleAtTime(g,7.99,8).id,"b");
 assert.equal(subtitleAtTime(g,3,NaN).id,"a");
 assert.equal(subtitleAtTime([],4,8),null);
});
test("Pausing and rewinding suppresses AI captions",()=>{
 const events={},audio={paused:true,ended:false,currentTime:0,duration:8,
  addEventListener(n,fn){(events[n]??=[]).push(fn)},
  removeEventListener(n,fn){events[n]=events[n].filter(f=>f!==fn)}};
 const rendered=[],renderer={render(e){rendered.push(e?.id??null)}};
 let started=false;
 const ctrl=mount({entries,media:{opening:audio},renderer,isStarted:()=>started});
 assert.equal(ctrl.sync(),null);
 started=true;audio.paused=false;events.play.forEach(fn=>fn());
 assert.equal(rendered.at(-1),"a");
 audio.currentTime=7.7;events.timeupdate.forEach(fn=>fn());
 assert.equal(rendered.at(-1),"b");
 audio.paused=true;events.pause.forEach(fn=>fn());
 assert.equal(rendered.at(-1),null);
 ctrl.destroy();
 assert.equal(rendered.at(-1),null);
});
