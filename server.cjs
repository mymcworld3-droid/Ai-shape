"use strict";
const {createServer:createHttpServer}=require("node:http");
const {randomBytes}=require("node:crypto");
const serveStatic=require("serve-static");
const {WebSocket,WebSocketServer}=require("ws");
const {actions,validRoom}=require("./remote-link.js");

const publicFiles=new Set([
 "/","/index.html","/stage.css","/opening-config.js","/stage-layout.js",
 "/opening-controller.js","/act-one-audio.js","/script-data.js","/script-controller.js",
 "/visualizer.js","/subtitle-motion.js","/script-runtime.js","/audio-timeline.js",
 "/stage-review.js","/remote.html","/remote.css","/remote-link.js","/remote-stage.js","/remote-control.js"
]);
const offlineTimeout=2*60*1000;
const roomLifetime=8*60*60*1000;
const token=bytes=>randomBytes(bytes).toString("base64url");
const isOpen=socket=>socket?.readyState===WebSocket.OPEN;
function send(socket,message){
 if(isOpen(socket)&&socket.bufferedAmount<65536)socket.send(JSON.stringify(message));
}
function stageState(state){
 if(!state||typeof state.started!=="boolean"||typeof state.volumeVisible!=="boolean"||
  !["cues","script"].includes(state.mode)||typeof state.label!=="string"||
  !Number.isInteger(state.step)||!Number.isInteger(state.total)||
  state.step<0||state.step>=state.total||state.total>10000)return null;
 const {voice,effect,music}=state.volumes??{};
 if(![voice,effect,music].every(value=>Number.isInteger(value)&&value>=0&&value<=100))return null;
 const next=state.mode==="cues"?state.nextPreview:null;
 let nextPreview=null;
 if(next&&typeof next==="object"&&Number.isInteger(next.step)&&
    next.step===state.step+1&&next.step<state.total&&typeof next.label==="string"&&
    Array.isArray(next.lines)&&next.lines.length<=3){
  const parseLine=line=>line&&typeof line.speaker==="string"&&
   typeof line.text==="string"&&line.speaker.length<=60&&line.text.length<=500?
    {speaker:line.speaker,text:line.text}:null;
  const lines=next.lines.map(parseLine),leadIn=next.leadIn==null?null:parseLine(next.leadIn);
  if(lines.every(Boolean)&&(next.leadIn==null||leadIn))
   nextPreview={step:next.step,label:next.label.slice(0,120),leadIn,lines};
 }
 return {started:state.started,mode:state.mode,step:state.step,total:state.total,
  label:state.label.slice(0,500),nextPreview,
  volumes:{voice,effect,music},volumeVisible:state.volumeVisible};
}

function validateLevels(levels){
 if(!levels||typeof levels!=="object")return null;
 const values={};
 for(const channel of ["voice","effect","music"]){
  const value=levels[channel];
  if(!Number.isInteger(value)||value< -60||value>0)return null;
  values[channel]=value;
 }
 return values;
}
function validateCommand(message){
 if(!actions.includes(message.action))return null;
 if(message.action==="setVolume"){
  const {channel,value}=message;
  if(!["voice","effect","music"].includes(channel)||!Number.isInteger(value)||value<0||value>100)return null;
  return {type:"command",action:"setVolume",channel,value};
 }
 return {type:"command",action:message.action};
}
function createServer({publicOrigin=process.env.PUBLIC_ORIGIN}={}){
 const serve=serveStatic(__dirname,{dotfiles:"deny",redirect:false,maxAge:0});
 const server=createHttpServer((request,response)=>{
  response.setHeader("Referrer-Policy","no-referrer");
  response.setHeader("X-Content-Type-Options","nosniff");
  if(!["GET","HEAD"].includes(request.method)){response.writeHead(405,{Allow:"GET, HEAD"}).end();return;}
  let pathname;
  try{pathname=decodeURIComponent(new URL(request.url,"http://local").pathname);}
  catch{response.writeHead(400).end();return;}
  if(pathname==="/remote/health"){
   response.writeHead(204,{"X-Ai-Shape-Remote":"1","Cache-Control":"no-store"}).end();
   return;
  }
  const asset=pathname.startsWith("/assets/")&&pathname.split("/").slice(2)
   .every(part=>part&&!part.startsWith(".")&&!part.includes("\\")&&!part.includes("\0"));
  if(publicFiles.has(pathname)||asset)serve(request,response,()=>response.writeHead(404).end());
  else response.writeHead(404).end();
 });

 const rooms=new Map();
 // Exactly one active projection is the shared show. Any number of other browsers
 // can observe and control it; only the projection owns media and show state.
 let liveStage=null,liveState=null;
 const liveControls=new Set();
 const wss=new WebSocketServer({noServer:true,maxPayload:8192});
 function notifyLive(){
  for(const control of liveControls)send(control,{type:"peer",connected:isOpen(liveStage)});
 }
 function publishLive(state){
  liveState=state;
  for(const control of liveControls)send(control,{type:"state",state});
 }
 function notifyPeers(room){
  send(room.stage,{type:"peer",connected:isOpen(room.control)});
  send(room.control,{type:"peer",connected:isOpen(room.stage)});
 }
 function endRoom(room){
  rooms.delete(room.id);
  for(const socket of [room.stage,room.control])socket?.close(4001,"Room closed");
 }
 function attach(socket,room,role,details={}){
  clearTimeout(socket.authTimer);
  const previous=room[role];
  room[role]=socket;
  socket.room=room;
  socket.role=role;
  previous?.close(4002,"Another connection took over");
  send(socket,{type:"ready",...details});
  notifyPeers(room);
  if(role==="control"&&room.state)send(socket,{type:"state",state:room.state});
 }
 function authenticate(socket,message){
  if(message.type==="host"){
   // The first started projection wins. A second one retries until the first
   // disconnects, rather than stealing its show.
   if(isOpen(liveStage)){socket.close(4003,"Projection already active");return;}
   clearTimeout(socket.authTimer);
   socket.role="live-stage";
   liveStage=socket;
   liveState=null;
   send(socket,{type:"ready"});
   notifyLive();
   return;
  }
  if(message.type==="watch"){
   if(liveControls.size>=128){socket.close(4003,"Too many controllers");return;}
   clearTimeout(socket.authTimer);
   socket.role="live-control";
   liveControls.add(socket);
   send(socket,{type:"ready"});
   send(socket,{type:"peer",connected:isOpen(liveStage)});
   if(liveState)send(socket,{type:"state",state:liveState});
   return;
  }
  if(message.type==="create"&&rooms.size<64){
   const room={id:token(12),stageKey:token(24),controlKey:token(24),created:Date.now()};
   rooms.set(room.id,room);
   attach(socket,room,"stage",{id:room.id,stageKey:room.stageKey,controlKey:room.controlKey});
   return;
  }
  if(message.type==="join"&&validRoom(message.id,message.key)){
   const room=rooms.get(message.id);
   if(room&&Date.now()-room.created<roomLifetime&&
      (room.stage||Date.now()-room.offlineSince<offlineTimeout)){
    const role=message.key===room.stageKey?"stage":message.key===room.controlKey?"control":null;
    if(role){attach(socket,room,role);return;}
   }
  }
  socket.close(4001,"Pairing unavailable");
 }
 wss.on("connection",socket=>{
  socket.alive=true;
  socket.authTimer=setTimeout(()=>socket.close(4001,"Pairing required"),5000);
  socket.on("error",()=>{});
  socket.on("pong",()=>{socket.alive=true;});
  socket.on("message",data=>{
   let message;
   try{message=JSON.parse(data.toString());}catch{return;}
   if(!message||typeof message.type!=="string")return;
   if(socket.role==="live-stage"){
    if(socket!==liveStage)return;
    if(message.type==="meter"){
     const levels=validateLevels(message.levels);
     if(levels)for(const control of liveControls)send(control,{type:"meter",levels});
     return;
    }
    if(message.type==="state"){
     const state=stageState(message.state);
     if(state?.started)publishLive(state);
    }
    return;
   }
   if(socket.role==="live-control"){
    if(!liveControls.has(socket))return;
    if(message.type==="command"&&isOpen(liveStage)&&liveState?.started){
     const command=validateCommand(message);
     if(!command)return;
     const now=Date.now(),identifier=command.action==="setVolume"?
      "setVolume:"+command.channel:command.action;
     if(command.action!=="setVolume"&&socket.lastAction===identifier&&
        now-(socket.lastCommand??0)<80)return;
     socket.lastAction=identifier;
     socket.lastCommand=now;
     send(liveStage,command);
    }
    return;
   }
   const {room,role}=socket;
   if(!room){authenticate(socket,message);return;}
   if(rooms.get(room.id)!==room||room[role]!==socket)return;
   if(role==="stage"){
    if(message.type==="end"){endRoom(room);return;}
    if(message.type==="meter"){
     const levels=validateLevels(message.levels);
     if(levels)send(room.control,{type:"meter",levels});
     return;
    }
    if(message.type!=="state")return;
    const state=stageState(message.state);
    if(state){room.state=state;send(room.control,{type:"state",state});}
   }else if(message.type==="command"&&isOpen(room.stage)){
    const command=validateCommand(message);
    if(!command)return;
    const now=Date.now();
    if(command.action!=="setVolume"&&socket.lastAction===command.action&&
       now-(socket.lastCommand??0)<80)return;
    socket.lastAction=command.action;
    socket.lastCommand=now;
    send(room.stage,command);
   }
  });
  socket.on("close",()=>{
   clearTimeout(socket.authTimer);
   if(socket.role==="live-stage"){
    if(liveStage===socket){
     liveStage=null;
     liveState=null;
     notifyLive();
    }
    return;
   }
   if(socket.role==="live-control"){liveControls.delete(socket);return;}
   const {room,role}=socket;
   if(!room||room[role]!==socket)return;
   room[role]=null;
   if(role==="stage")room.offlineSince=Date.now();
   notifyPeers(room);
  });
 });
 server.on("upgrade",(request,socket,head)=>{
  let allowed=false;
  try{
   const origin=new URL(request.headers.origin);
   allowed=["http:","https:"].includes(origin.protocol)&&
    (origin.host===request.headers.host||origin.origin===publicOrigin);
  }catch{}
  if(!allowed||request.url!=="/remote/socket"||wss.clients.size>=256){
   socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
   return;
  }
  wss.handleUpgrade(request,socket,head,ws=>wss.emit("connection",ws,request));
 });
 const heartbeat=setInterval(()=>{
  for(const socket of wss.clients){
   if(!socket.alive){socket.terminate();continue;}
   socket.alive=false;
   socket.ping();
  }
  const now=Date.now();
  for(const room of rooms.values())
   if(now-room.created>=roomLifetime||!room.stage&&now-room.offlineSince>=offlineTimeout)endRoom(room);
 },25000);
 heartbeat.unref();
 server.on("close",()=>{
  clearInterval(heartbeat);
  for(const socket of wss.clients)socket.terminate();
 });
 return server;
}

if(require.main===module){
 const port=Number(process.env.PORT||3000);
 createServer().listen(port,"0.0.0.0",()=>console.log(`Ai-shape listening on port ${port}`));
}
module.exports={createServer};
