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
