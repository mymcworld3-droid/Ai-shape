"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {once,on}=require("node:events");
const {setTimeout:delay}=require("node:timers/promises");
const {WebSocket}=require("ws");
const {createServer}=require("../server.cjs");

async function startRelay(t){
 const server=createServer();
 const sockets=[];
 t.after(async()=>{
  for(const socket of sockets)socket.terminate();
  await new Promise(resolve=>server.close(resolve));
 });
 server.listen(0,"127.0.0.1");
 await once(server,"listening");
 const origin=`http://127.0.0.1:${server.address().port}`;
 function connect(browserOrigin=origin){
  const socket=new WebSocket(origin.replace("http:","ws:")+"/remote/socket",{origin:browserOrigin});
  sockets.push(socket);
  return socket;
 }
 async function client(){
  const socket=connect(),inbox=on(socket,"message");
  await once(socket,"open");
  return {socket,send:message=>socket.send(JSON.stringify(message)),async next(type){
   for(;;){
    const {value}=await inbox.next();
    const message=JSON.parse(value[0].toString());
    if(message.type===type)return message;
   }
  }};
 }
 return {origin,connect,client};
}

test("the pairing relay authorizes each role, forwards state and resumes the projector", {timeout:5000}, async t=>{
 const {client}=await startRelay(t);
 const stage=await client();
 stage.send({type:"create"});
 const {id,stageKey,controlKey}=await stage.next("ready");
 assert.notEqual(stageKey,controlKey);
 assert.equal((await stage.next("peer")).connected,false);
 const stranger=await client();
 const refused=once(stranger.socket,"close");
 stranger.send({type:"join",id,key:(controlKey[0]==="A"?"B":"A")+controlKey.slice(1)});
 assert.equal((await refused)[0],4001);
 const remote=await client();
 remote.send({type:"join",id,key:controlKey});
 assert.deepEqual(await remote.next("ready"),{type:"ready"});
 assert.equal((await remote.next("peer")).connected,true);
 assert.equal((await stage.next("peer")).connected,true);

 const state={started:true,mode:"script",step:76,total:380,label:"Door opening",
  volumes:{voice:90,effect:100,music:80},volumeVisible:true};
 remote.send({type:"state",state:{...state,step:10}});
 stage.send({type:"state",state});
 assert.deepEqual((await remote.next("state")).state,state);
 remote.send({type:"command",action:"start"});
 remote.send({type:"command",action:"next"});
 assert.deepEqual(await stage.next("command"),{type:"command",action:"next"});

 stage.socket.close();
 assert.equal((await remote.next("peer")).connected,false);
 remote.send({type:"command",action:"previous"});
 await delay(100);
 const resumed=await client();
 resumed.send({type:"join",id,key:stageKey});
 await resumed.next("ready");
 assert.equal((await remote.next("peer")).connected,true);
 remote.send({type:"command",action:"effectDown"});
 assert.deepEqual(await resumed.next("command"),{type:"command",action:"effectDown"});

 const disconnected=once(remote.socket,"close");
 resumed.send({type:"end"});
 assert.equal((await disconnected)[0],4001);
 const invalid=await client();
 const rejected=once(invalid.socket,"close");
 invalid.send({type:"join",id,key:controlKey});
 assert.equal((await rejected)[0],4001);
});

test("the public server supports media ranges and rejects foreign origins and files", {timeout:5000}, async t=>{
 const {origin,connect}=await startRelay(t);
 const health=await fetch(origin+"/remote/health");
 assert.equal(health.headers.get("x-ai-shape-remote"),"1");
 assert.equal((await fetch(origin+"/remote.html")).status,200);
 const credits=await fetch(origin+"/end-credits.js");
 assert.equal(credits.status,200,"Both projection and remote controller need the credit manifest");
 assert.match(await credits.text(),/credit-title/);
 const photoMotion=await fetch(origin+"/frame-photo-motion.js");
 assert.equal(photoMotion.status,200,"The projection must serve the animation module used on every frame");
 assert.match(await photoMotion.text(),/FramePhotoMotion/);
 const video=await fetch(origin+"/assets/videos/Start_animation.mp4",{headers:{Range:"bytes=0-1"}});
 assert.equal(video.status,206);
 assert.equal((await video.arrayBuffer()).byteLength,2);
 assert.equal((await fetch(origin+"/server.cjs")).status,404);
 const foreign=connect("https://other.example");
 assert.match((await once(foreign,"error"))[0].message,/403/);
});


test("shared live show allows multiple independent controllers without pairing", {timeout:7000}, async t=>{
 const {client}=await startRelay(t);
 const first=await client(),second=await client();
 first.send({type:"watch"});
 second.send({type:"watch"});
 assert.deepEqual(await first.next("ready"),{type:"ready"});
 assert.deepEqual(await second.next("ready"),{type:"ready"});
 assert.equal((await first.next("peer")).connected,false);
 assert.equal((await second.next("peer")).connected,false);

 const projection=await client();
 projection.send({type:"host"});
 assert.deepEqual(await projection.next("ready"),{type:"ready"});
 assert.equal((await first.next("peer")).connected,true);
 assert.equal((await second.next("peer")).connected,true);
 const state={started:true,mode:"script",step:5,total:380,label:"Subtitle 5",
  volumes:{voice:100,effect:90,music:85},volumeVisible:false};
 projection.send({type:"state",state});
 assert.deepEqual((await first.next("state")).state,state);
 assert.deepEqual((await second.next("state")).state,state);
 first.send({type:"command",action:"next"});
 assert.deepEqual(await projection.next("command"),{type:"command",action:"next"});
 first.send({type:"command",action:"jump",step:27});
 assert.deepEqual(await projection.next("command"),{type:"command",action:"jump",step:27});
 second.send({type:"command",action:"effectDown"});
 assert.deepEqual(await projection.next("command"),{type:"command",action:"effectDown"});

 const competing=await client(),busy=once(competing.socket,"close");
 competing.send({type:"host"});
 assert.equal((await busy)[0],4003);
 projection.socket.close();
 assert.equal((await first.next("peer")).connected,false);
 assert.equal((await second.next("peer")).connected,false);

 const replacement=await client();
 replacement.send({type:"host"});
 assert.deepEqual(await replacement.next("ready"),{type:"ready"});
 assert.equal((await first.next("peer")).connected,true);
 assert.equal((await second.next("peer")).connected,true);
 const restored={...state,step:0,label:"New show"};
 replacement.send({type:"state",state:restored});
 assert.deepEqual((await first.next("state")).state,restored);
 assert.deepEqual((await second.next("state")).state,restored);
 first.send({type:"command",action:"previous"});
 assert.deepEqual(await replacement.next("command"),{type:"command",action:"previous"});
});


test("remote sliders accept exact levels and forward real meters to all devices", {timeout:5000},async t=>{
 const {client}=await startRelay(t);
 const projection=await client();
 projection.send({type:"host"});
 assert.deepEqual(await projection.next("ready"),{type:"ready"});
 const a=await client(),b=await client();
 for(const c of [a,b]){
  c.send({type:"watch"});
  await c.next("ready");
  assert.equal((await c.next("peer")).connected,true);
 }
 const state={started:true,mode:"cues",step:7,total:32,label:"隱藏卡片",
  nextPreview:{step:8,label:"記憶室開門音效",
   leadIns:[
    {speaker:"ETHAN",text:"Do you understand?"},
    {speaker:"MEGAN",text:"What does that mean?"}
   ],
   lines:[{speaker:"RACHEL",text:"Holy—"}]},
  volumes:{voice:100,effect:100,music:100},volumeVisible:false};
 projection.send({type:"state",state});
 assert.deepEqual((await a.next("state")).state,state);
 assert.deepEqual((await b.next("state")).state,state);
 a.send({type:"command",action:"setVolume",channel:"effect",value:37});
 assert.deepEqual(await projection.next("command"),
  {type:"command",action:"setVolume",channel:"effect",value:37});
 a.send({type:"command",action:"setVolume",channel:"effect",value:140});
 a.send({type:"command",action:"setVolume",channel:"wrong",value:37});
 b.send({type:"command",action:"next"});
 assert.deepEqual(await projection.next("command"),{type:"command",action:"next"});
 const levels={voice:-36,effect:-12,music:-24};
 projection.send({type:"meter",levels});
 assert.deepEqual((await a.next("meter")).levels,levels);
 assert.deepEqual((await b.next("meter")).levels,levels);

 const pairedStage=await client();
 pairedStage.send({type:"create"});
 const room=await pairedStage.next("ready");
 await pairedStage.next("peer");
 const remote=await client();
 remote.send({type:"join",id:room.id,key:room.controlKey});
 await remote.next("ready");
 await remote.next("peer");
 await pairedStage.next("peer");
 pairedStage.send({type:"state",state});
 await remote.next("state");
 remote.send({type:"command",action:"setVolume",channel:"voice",value:48});
 assert.deepEqual(await pairedStage.next("command"),
  {type:"command",action:"setVolume",channel:"voice",value:48});
 remote.send({type:"command",action:"jump",step:5});
 assert.deepEqual(await pairedStage.next("command"),
  {type:"command",action:"jump",step:5});
 pairedStage.send({type:"meter",levels});
 assert.deepEqual((await remote.next("meter")).levels,levels);
});


test("subtitle-mode next-step preview is relayed and validated like scene previews", {timeout:5000},async t=>{
 const {client}=await startRelay(t);
 const projection=await client();
 projection.send({type:"host"});
 await projection.next("ready");
 const remote=await client();
 remote.send({type:"watch"});
 await remote.next("ready");
 await remote.next("peer");
 const state={
  started:true,mode:"script",step:7,total:381,label:"Welcome to HUMAN VERIFICATION",
  nextPreview:{step:8,label:"Please remain calm.",
   leadIns:[{speaker:"RACHEL",text:"What is going on!"},{speaker:"AI VOICE",text:"Welcome to HUMAN VERIFICATION TEST NUMBER #67."}],
   lines:[{speaker:"AI VOICE",text:"Please remain calm."},{speaker:"AI VOICE",text:"There is no escape."}]},
  volumes:{voice:90,effect:100,music:75},volumeVisible:false
 };
 projection.send({type:"state",state});
 assert.deepEqual((await remote.next("state")).state,state);
 projection.send({type:"state",state:{...state,step:8,label:"Please remain calm.",
  nextPreview:{...state.nextPreview,step:9,label:"There is no escape."}}});
 const updated=await remote.next("state");
 assert.equal(updated.state.nextPreview.step,9,"Advance updates the preview cue");
 // A forged hint cannot point to a different step or contain oversized text.
 projection.send({type:"state",state:{...state,
  nextPreview:{...state.nextPreview,step:100}}});
 const rejected=await remote.next("state");
 assert.equal(rejected.state.nextPreview,undefined);
});
test("remote preview transports exactly two previous, current and two next operator steps", {timeout:5000},async t=>{
 const {client}=await startRelay(t);
 const host=await client();host.send({type:"host"});await host.next("ready");
 const remote=await client();remote.send({type:"watch"});
 await remote.next("ready");await remote.next("peer");
 const context={step:31,items:[
  {step:29,label:"Maybe we should look around first.",speaker:"CHRISTOPHER",text:"Maybe we should look around first."},
  {step:30,label:"Ugh Fair.",speaker:"MEGAN",text:"Ugh Fair."},
  {step:31,label:"Didn’t we already do that? Can we just press the button?",speaker:"RACHEL",text:"Didn’t we already do that? Can we just press the button?"},
  {step:32,label:"No!",speaker:"EVERYONE ELSE",text:"No!"},
  {step:33,label:"We don't know just who the bot is.",speaker:"ETHAN",text:"We don't know just who the bot is."}
 ]};
 const state={started:true,mode:"script",step:31,total:270,label:context.items[2].label,
  stepContext:context,volumes:{voice:100,effect:100,music:100},volumeVisible:false};
 host.send({type:"state",state});
 assert.deepEqual((await remote.next("state")).state,state);
 // Valid new windows may include only 3 at the first and final cue.
 const first={step:0,items:context.items.slice(0,3).map((item,i)=>({...item,step:i}))};
 host.send({type:"state",state:{...state,step:0,label:"Beginning",stepContext:first}});
 assert.deepEqual((await remote.next("state")).state.stepContext,first);
 // Reject forged gaps and wrong parent step rather than displaying them.
 host.send({type:"state",state:{...state,stepContext:{
  ...context,items:[...context.items.slice(0,2),{...context.items[2],step:500},...context.items.slice(3)]
 }}});
 assert.equal((await remote.next("state")).state.stepContext,undefined);
 host.send({type:"state",state:{...state,stepContext:{...context,step:29}}});
 assert.equal((await remote.next("state")).state.stepContext,undefined);
});
test("rapid consecutive next taps each advance exactly one subtitle", {timeout:5000},async t=>{
 const {client}=await startRelay(t);
 const projection=await client();
 projection.send({type:"host"});
 await projection.next("ready");
 const remote=await client();
 remote.send({type:"watch"});
 await remote.next("ready");
 await remote.next("peer");
 const state={started:true,mode:"script",step:7,total:380,label:"AI voice",
  volumes:{voice:100,effect:100,music:100},volumeVisible:false};
 projection.send({type:"state",state});
 await remote.next("state");
 // Server must preserve both in order even when sent within one event loop.
 remote.send({type:"command",action:"next"});
 remote.send({type:"command",action:"next"});
 assert.deepEqual(await projection.next("command"),{type:"command",action:"next"});
 assert.deepEqual(await projection.next("command"),{type:"command",action:"next"});
});
