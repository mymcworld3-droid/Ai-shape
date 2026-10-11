"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {fitStage,coverLayout,projectImageRegion,fitRadialGraphic,previewFrame}=require("../stage-layout.js");
const {StartGate,bindAdvanceKey}=require("../opening-controller.js");
function close(actual,expected){assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);}

test("a 16:9 stage fits wide, tall, portrait and review panes without changing ratio",()=>{
 for(const [width,height] of [[1920,1080],[1440,900],[390,844],[844,390],[900,600]]){
  const stage=fitStage(width,height);
  close(stage.width/stage.height,16/9);
  assert.ok(stage.width<=width&&stage.height<=height);
  assert.ok(Math.abs(stage.width-width)<1e-8||Math.abs(stage.height-height)<1e-8);
 }
});
test("3:2 room fills 1280x720 by cropping top and bottom, without horizontal margins",()=>{
 const b=coverLayout(1280,720,1536,1024);
 close(b.x,0);close(b.width,1280);close(b.height,2560/3);close(b.y,-200/3);
 close(b.width/b.height,3/2);
});
test("the supplied 16:9 video exactly fills the 16:9 stage",()=>{
 assert.deepEqual(coverLayout(1920,1080,1280,720),{x:0,y:0,width:1920,height:1080});
});
test("a very wide asset is cropped at the sides instead of stretched",()=>{
 const b=coverLayout(1280,720,2000,500);
 assert.deepEqual(b,{x:-800,y:0,width:2880,height:720});
 close(b.width/b.height,4);
});
test("cover rejects unloaded or invalid dimensions rather than drawing a broken fit",()=>{
 for(const bad of [0,-1,NaN,Infinity])assert.throws(()=>coverLayout(1280,720,bad,1024),RangeError);
});
test("the room's source-pixel screen follows the same crop as the background",()=>{
 const screen=projectImageRegion(1280,720,1536,1024,{x:552,y:310,width:430,height:195});
 close(screen.x,460);close(screen.y,575/3);
 close(screen.width,1075/3);close(screen.height,162.5);
 const pose=fitRadialGraphic(screen,400,5/3);
 close(pose.x,3835/6);close(pose.y,3275/12);
 close(pose.scale*400,955/12);
 // Doubling the projection doubles the physical-screen position and aperture.
 const large=projectImageRegion(2560,1440,1536,1024,{x:552,y:310,width:430,height:195});
 for(const key of ["x","y","width","height"])close(large[key],screen[key]*2);
});
test("a radial graphic uses the largest circle that stays inside either screen orientation",()=>{
 for(const screen of [{x:50,y:30,width:360,height:160},{x:20,y:80,width:90,height:300}]){
  for(const radius of [1,100,800,100000]){
   const pose=fitRadialGraphic(screen,radius,2),r=radius*pose.scale;
   close(pose.x,screen.x+screen.width/2);close(pose.y,screen.y+screen.height/2);
   assert.ok(pose.x-r>=pose.clip.x&&pose.x+r<=pose.clip.x+pose.clip.width);
   assert.ok(pose.y-r>=pose.clip.y&&pose.y+r<=pose.clip.y+pose.clip.height);
   close(r,Math.min(pose.clip.width,pose.clip.height)/2);
  }
 }
});
test("silent step frames cover every cue and cannot mutate the playback transition data",()=>{
 const expected=["bright","ai","door-kick","welcome","clock","card","card-hidden","blackout",
  "memory-light","memory-welcome","memory-room","memory-blackout",
  "past-intro","past-isolate","office-light","office-bang","past-reflection","memory-return"];
 for(const cue of expected){const frame=previewFrame(cue);assert.ok(frame);assert.equal(Object.isFrozen(frame),true);}
 assert.equal(previewFrame("clock").clock,1);
 assert.equal(previewFrame("clock").scene,1);
 assert.equal(previewFrame("card").card,1);
 assert.equal(previewFrame("card").scene,0);
 assert.equal(previewFrame("blackout").blackout,1);
 assert.equal(previewFrame("memory-room").background,"memory");
 assert.equal(previewFrame("memory-room").clock,0);
 assert.equal(previewFrame("memory-room").card,0);
 for(const cue of expected.slice(12)){
  const frame=previewFrame(cue);assert.equal(frame.ai+frame.clock+frame.card,0);
 }
 assert.equal(previewFrame("past-intro").scene,0.35);
 assert.equal(previewFrame("past-isolate").blackout,1);
 assert.equal(previewFrame("office-light").background,"office");
 assert.equal(previewFrame("past-reflection").blackout,1);
 assert.equal(previewFrame("memory-return").background,"memory");
 assert.equal(previewFrame("unknown"),null);assert.equal(previewFrame("__proto__"),null);
});
test("merely creating a Start gate or checking readiness never begins playback",()=>{
 let ready=false,calls=0;
 const gate=new StartGate({isReady:()=>ready,onStart:()=>calls++});
 assert.equal(gate.started,false);assert.equal(calls,0);
 assert.equal(gate.start(),false);assert.equal(calls,0);
 ready=true;assert.equal(gate.started,false);assert.equal(calls,0);
 assert.equal(gate.start(),true);assert.equal(gate.started,true);assert.equal(calls,1);
});
test("Start invokes playback synchronously and latches before nested or duplicate clicks",()=>{
 const events=[];let gate;
 gate=new StartGate({isReady:()=>true,onStart:()=>{
  events.push("play");assert.equal(gate.started,true);assert.equal(gate.start(),false);
 }});
 gate.start();events.push("returned");gate.start();
 assert.deepEqual(events,["play","returned"]);
});
test("the pre-Start Space key retains native button behavior; afterward it advances once per release",()=>{
 const target=new EventTarget();let enabled=false,calls=0;
 const unbind=bindAdvanceKey(target,()=>calls++,{isEnabled:()=>enabled});
 function key(type,repeat=false){const e=new Event(type,{cancelable:true});Object.assign(e,{code:"Space",repeat});target.dispatchEvent(e);return e;}
 assert.equal(key("keydown").defaultPrevented,false);key("keyup");assert.equal(calls,0);
 enabled=true;assert.equal(key("keydown").defaultPrevented,true);
 key("keydown",true);assert.equal(calls,1);
 key("keyup");key("keydown");assert.equal(calls,2);unbind();
});
