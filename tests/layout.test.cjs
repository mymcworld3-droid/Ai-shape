"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {fitStage,coverLayout,projectImageRegion,fitRadialGraphic,fitRectGraphic,expandGraphicPose,fadeInProgress,previewFrame}=require("../stage-layout.js");
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
test("the opening clock fills the actual TV interior and stays centered at three stage sizes",()=>{
 for(const [width,height] of [[1920,1080],[1440,810],[390,219]]){
  const screen=projectImageRegion(width,height,1536,1024,{x:552,y:310,width:430,height:195});
  const pose=fitRectGraphic(screen,236,84,screen.width/430*2);
  close(pose.x,screen.x+screen.width/2);close(pose.y,screen.y+screen.height/2);
  close(236*pose.scale,pose.clip.width);
  assert.ok(84*pose.scale<=pose.clip.height);
  assert.ok(pose.x-118*pose.scale>=screen.x&&pose.x+118*pose.scale<=screen.x+screen.width+1e-8);
 }
});
test("rectangular graphics use the largest uniform scale for wide and tall apertures",()=>{
 for(const region of [{x:50,y:20,width:360,height:160},{x:20,y:90,width:90,height:300}]){
  const pose=fitRectGraphic(region,236,84,2);
  assert.ok(236*pose.scale<=pose.clip.width+1e-8&&84*pose.scale<=pose.clip.height+1e-8);
  assert.ok(Math.abs(236*pose.scale-pose.clip.width)<1e-8||Math.abs(84*pose.scale-pose.clip.height)<1e-8);
  close(pose.x,region.x+region.width/2);close(pose.y,region.y+region.height/2);
 }
});
test("rectangular fitting rejects unloaded dimensions or invalid inset",()=>{
 const region={x:20,y:10,width:430,height:195};
 for(const bad of [0,-1,NaN,Infinity])assert.throws(()=>fitRectGraphic(region,bad,84),RangeError);
 assert.throws(()=>fitRectGraphic(region,236,84,-1),RangeError);
 assert.throws(()=>fitRectGraphic({...region,height:0},236,84),RangeError);
});
test("AI expansion returns exactly to the idle graphic position and size",()=>{
 const home=projectImageRegion(1280,720,1536,1024,{x:552,y:310,width:430,height:195});
 const foreground={x:51.2,y:36,width:1177.6,height:648};
 const rest=fitRadialGraphic(home,400,5/3,.98);
 for(const p of [0,-2])assert.deepEqual(expandGraphicPose(home,foreground,400,p,5/3),rest);
});
test("only the radial graphic scales up smoothly, bounded by the stage at three ratios",()=>{
 for(const [width,height] of [[1920,1080],[1440,810],[390,219]]){
  const home=projectImageRegion(width,height,1536,1024,{x:552,y:310,width:430,height:195});
  const area={x:width*.04,y:height*.05,width:width*.92,height:height*.9};
  const rest=expandGraphicPose(home,area,400,0),front=expandGraphicPose(home,area,400,1);
  close(front.x,width/2);close(front.y,height/2);assert.ok(front.scale>rest.scale*3);
  for(const p of [.1,.4,.7,1]){
   const pose=expandGraphicPose(home,area,400,p),r=400*pose.scale;
   close(pose.scale,rest.scale+(front.scale-rest.scale)*p);
   assert.ok(pose.x-r>=pose.clip.x-1e-8&&pose.x+r<=pose.clip.x+pose.clip.width+1e-8);
   assert.ok(pose.y-r>=pose.clip.y-1e-8&&pose.y+r<=pose.clip.y+pose.clip.height+1e-8);
  }
 }
});
test("enlarged selection AI reserves its caption without stretching or leaving the stage",()=>{
 const home={x:460,y:206.75,width:1075/3,height:162.5};
 const area={x:51.2,y:14.4,width:1177.6,height:547.2};
 for(const p of [0,.3,.5,.8,1,3]){
  const pose=expandGraphicPose(home,area,400,p),r=pose.scale*400;
  assert.ok(pose.x-r>=0&&pose.x+r<=1280);
  assert.ok(pose.y-r>=0&&pose.y+r<=720*.78+1e-8);
 }
});
test("graphic expansion rejects invalid radius, progress and area dimensions",()=>{
 const home={x:100,y:80,width:400,height:200},area={x:0,y:0,width:1280,height:720};
 for(const bad of [0,-1,NaN,Infinity])assert.throws(()=>expandGraphicPose(home,area,bad,1),RangeError);
 assert.throws(()=>expandGraphicPose(home,area,400,NaN),RangeError);
 assert.throws(()=>expandGraphicPose(home,{...area,height:0},400,1),RangeError);
});
test("AI fade starts fully transparent, increases smoothly and stays fully visible at the end",()=>{
 for(const duration of [600,1500,3000]){
  close(fadeInProgress(-100,duration),0);close(fadeInProgress(0,duration),0);
  close(fadeInProgress(duration*.25,duration),.0625);
  close(fadeInProgress(duration*.5,duration),.5);
  close(fadeInProgress(duration*.75,duration),.9375);
  close(fadeInProgress(duration,duration),1);close(fadeInProgress(duration*10,duration),1);
  let previous=0;
  for(let t=0;t<=duration;t+=duration/100){const p=fadeInProgress(t,duration);assert.ok(p>=previous&&p<=1);previous=p;}
 }
});
test("a static frame has no fade delay and invalid fade timing is rejected",()=>{
 close(fadeInProgress(0,0),1);
 for(const bad of [NaN,Infinity,-Infinity])assert.throws(()=>fadeInProgress(bad,1500),RangeError);
 assert.throws(()=>fadeInProgress(0,-1),RangeError);
});
test("silent step frames cover every cue and cannot mutate the playback transition data",()=>{
 const expected=["bright","ai","door-kick","welcome","clock","card","card-hidden","blackout",
  "memory-light","memory-welcome","memory-room","memory-blackout",
  "past-intro","past-isolate","office-light","office-bang","past-reflection","memory-return",
  "discussion","vote-prompt","vote-clock","vote-one","vote-two","vote-final","vote-blackout"];
 for(const cue of expected){const frame=previewFrame(cue);assert.ok(frame);assert.equal(Object.isFrozen(frame),true);}
 assert.equal(previewFrame("clock").clock,1);
 assert.equal(previewFrame("clock").scene,1);
 assert.equal(previewFrame("card").card,1);
 assert.equal(previewFrame("card").scene,0);
 assert.equal(previewFrame("blackout").blackout,1);
 assert.equal(previewFrame("memory-room").background,"memory");
 assert.equal(previewFrame("memory-room").clock,0);
 assert.equal(previewFrame("memory-room").card,0);
 for(const cue of expected.slice(12,18)){
  const frame=previewFrame(cue);assert.equal(frame.ai+frame.clock+frame.card,0);
 }
 assert.equal(previewFrame("past-intro").scene,0.35);
 assert.equal(previewFrame("past-isolate").blackout,1);
 assert.equal(previewFrame("office-light").background,"office");
 assert.equal(previewFrame("past-reflection").blackout,1);
 assert.equal(previewFrame("memory-return").background,"memory");
 for(const cue of expected.slice(18)){
  const frame=previewFrame(cue);assert.equal(frame.card,0);assert.equal(frame.background,"memory");
  if(["vote-prompt","vote-one","vote-two","vote-final"].includes(cue)){
   assert.equal(frame.ai,1);assert.equal(frame.aiExpansion,1);assert.equal(frame.clock,0);
  }else assert.equal(frame.ai,0);
 }
 assert.equal(previewFrame("vote-clock").clock,1);
 assert.equal(previewFrame("memory-welcome").aiExpansion,1);
 assert.equal(previewFrame("vote-two").timer,"selection");assert.equal(previewFrame("vote-two").vote,1);
 assert.equal(previewFrame("vote-blackout").blackout,1);
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
