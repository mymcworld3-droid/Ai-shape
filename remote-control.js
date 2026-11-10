"use strict";
(()=>{
 const status=document.getElementById("remoteStatus");
 const step=document.getElementById("remoteStep");
 const cue=document.getElementById("remoteCue");
 const buttons=Array.from(document.querySelectorAll("[data-action]"));
 const volumeToggle=buttons.find(button=>button.dataset.action==="toggleVolumeDisplay");
 const outputs={
  voice:document.getElementById("remoteVoice"),
  effect:document.getElementById("remoteEffect"),
  music:document.getElementById("remoteMusic")
 };
 let connection,connectionState,peer=false,state=null;

 function render(){
  const active=connectionState==="connected"&&peer&&Boolean(state);
  status.textContent={
   connecting:"正在連線…",retrying:"連線中斷，正在重連…",
   expired:"配對已結束，請從投影端取得新連結。",
   replaced:"另一台操控裝置已接手。",
   invalid:"請開啟投影端提供的配對連結。",
   connected:!peer?"等待投影端連線":state?.started?"投影端已連線":"請先在投影端按「開始」"
  }[connectionState];
  step.textContent=state?`${state.mode==="cues"?"場景模式":"逐句字幕"} · 第 ${state.step} 步 · 共 ${state.total} 步`:"等待投影端";
  cue.textContent=state?.label??"—";
  for(const [channel,output] of Object.entries(outputs))
   output.textContent=state?`${state.volumes[channel]}%`:"—";
  volumeToggle.setAttribute("aria-pressed",String(Boolean(state?.volumeVisible)));
  for(const button of buttons){
   const {action}=button.dataset;
   button.disabled=!active||(action==="previous"&&(!state.started||state.step===0))||
    (action==="next"&&(!state.started||state.step>=state.total-1));
  }
 }
 function join(){
  connection?.stop();
  connection=null;
  peer=false;
  state=null;
  const [id,key,...extra]=location.hash.slice(1).split(".");
  if(extra.length||!StageRemoteLink.validRoom(id,key)||!["http:","https:"].includes(location.protocol)){
   connectionState="invalid";
   render();
   return;
  }
  connection=StageRemoteLink.connect({
   hello:()=>({type:"join",id,key}),
   onStatus(value){
    connectionState=value;
    if(value!=="connected")peer=false;
    render();
   },
   onMessage(message){
    if(message.type==="peer")peer=message.connected;
    if(message.type==="state")state=message.state;
    render();
   }
  });
 }
 for(const button of buttons)button.addEventListener("click",()=>{
  if(!button.disabled)connection?.send({type:"command",action:button.dataset.action});
 });
 window.addEventListener("hashchange",join);
 join();
})();
