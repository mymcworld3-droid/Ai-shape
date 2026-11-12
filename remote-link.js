(function(root,factory){
 const api=factory();
 if(typeof module==="object"&&module.exports)module.exports=api;
 else root.StageRemoteLink=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const actions=Object.freeze([
  "previous","next","voiceDown","voiceUp","effectDown","effectUp",
  "otherDown","otherUp","toggleVolumeDisplay","setVolume","jump"
 ]);
 const validRoom=(id,key)=>typeof id==="string"&&typeof key==="string"&&
  /^[A-Za-z0-9_-]{16}$/.test(id)&&/^[A-Za-z0-9_-]{32}$/.test(key);

 function connect({hello,onStatus,onMessage}){
  const url=new URL("remote/socket",location.href);
  url.protocol=location.protocol==="https:"?"wss:":"ws:";
  let socket,ready=false,stopped=false,retry,keepalive,attempts=0;
  function send(message){
   if(!ready||socket.readyState!==WebSocket.OPEN)return false;
   socket.send(JSON.stringify(message));
   return true;
  }
  function open(){
   socket=new WebSocket(url);
   socket.addEventListener("open",()=>socket.send(JSON.stringify(hello())));
   socket.addEventListener("message",event=>{
    const message=JSON.parse(event.data);
    if(message.type==="ready"){
     ready=true;
     attempts=0;
     keepalive=setInterval(()=>send({type:"ping"}),30000);
     onStatus("connected");
    }
    onMessage(message);
   });
   socket.addEventListener("close",event=>{
    clearInterval(keepalive);
    ready=false;
    if(stopped)return;
    if(event.code===4001||event.code===4002){
     onStatus(event.code===4001?"expired":"replaced");
     return;
    }
    onStatus("retrying");
    retry=setTimeout(open,Math.min(8000,500*2**Math.min(attempts++,4)));
   });
  }
  onStatus("connecting");
  open();
  return {send,stop(){
   stopped=true;
   clearTimeout(retry);
   clearInterval(keepalive);
   socket.close();
  }};
 }
 return {actions,validRoom,connect};
});
