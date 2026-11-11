"use strict";
(()=>{
 const status=document.getElementById("remoteStatus");
 const step=document.getElementById("remoteStep");
 const cue=document.getElementById("remoteCue");
 const voiceStatusElement=document.getElementById("remoteVoiceStatus");
 const prompt=document.getElementById("nextScenePrompt");
 const promptStep=document.getElementById("nextPromptStep");
 const promptLead=document.getElementById("nextPromptLead");
 const promptLines=document.getElementById("nextPromptLines");
 const buttons=Array.from(document.querySelectorAll("[data-action]"));
 const volumeToggle=buttons.find(button=>button.dataset.action==="toggleVolumeDisplay");
 const channels=["voice","effect","music"];
 const outputs={voice:document.getElementById("remoteVoice"),
  effect:document.getElementById("remoteEffect"),music:document.getElementById("remoteMusic")};
 const sliders={voice:document.getElementById("sliderVoice"),
  effect:document.getElementById("sliderEffect"),music:document.getElementById("sliderMusic")};
 const meters={voice:document.getElementById("meterVoice"),
  effect:document.getElementById("meterEffect"),music:document.getElementById("meterMusic")};
 const meterLabels={voice:document.getElementById("levelVoice"),
  effect:document.getElementById("levelEffect"),music:document.getElementById("levelMusic")};
 const editing=new Set(),lastSent=Object.create(null),pending=Object.create(null);
 let connection,connectionState,peer=false,state=null,levels=null;
 function active(){return connectionState==="connected"&&peer&&Boolean(state?.started)&&state.audioReady!==false;}
 function renderMeters(){
  for(const channel of channels){
   const db=active()&&levels?levels[channel]:-60;
   const valid=Number.isInteger(db)&&db>=-60&&db<=0;
   meters[channel].value=valid?db:-60;
   meterLabels[channel].textContent=valid&&db>-60?`${db} dBFS`:"靜音";
  }
 }
 function renderPrompt(){
  const next=state?.mode==="cues"&&state?.started?state.nextPreview:null;
  prompt.hidden=!next;
  if(!next)return;
  promptStep.textContent=`第 ${next.step} 步 · ${next.label}`;
  promptLead.textContent=next.leadIn?
   `${next.leadIn.speaker}：${next.leadIn.text}`:"（無上一句台詞）";
  promptLines.replaceChildren();
  for(const line of next.lines){
   const li=document.createElement("li"),speaker=document.createElement("strong");
   speaker.textContent=line.speaker+"：";
   li.append(speaker,document.createTextNode(" "+line.text));
   promptLines.append(li);
  }
  if(!next.lines.length){
   const li=document.createElement("li");
   li.className="no-dialogue";
   li.textContent="這一步主要是畫面／音效轉換，沒有獨立台詞。";
   promptLines.append(li);
  }
 }
 function render(){
  status.textContent={
   connecting:"正在連線…",retrying:"連線中斷，正在重連…",
   expired:"配對已結束，請重新開啟操控連結。",
   replaced:"另一台操控裝置已接手。",
   invalid:"請開啟投影端提供的正確連結。",
   connected:!peer?"等待播放裝置按「開始」":
    state?.audioReady===false?"正在啟用播放端音訊…":
    state?.started?"正在操控播放裝置":"正在同步演出狀態…"
  }[connectionState]||"連線中";
  step.textContent=state?`${state.mode==="cues"?"場景模式":"逐句字幕"} · 第 ${state.step} 步 · 共 ${state.total} 步`:"等待投影端";
  cue.textContent=state?.label??"—";
  const speech=state?.voiceStatus,seconds=speech?.remaining;
  const remaining=Number.isInteger(seconds)?"（約剩 "+seconds+" 秒）":"";
  let voiceNotice="";
  if(state?.audioRecovery?.state==="retrying")
   voiceNotice="AI 語音啟動遭瀏覽器阻擋，系統正在自動重試（第 "+
    state.audioRecovery.attempt+" 次），不會跳過演出步驟。";
  else if(state?.audioRecovery?.state==="needs-gesture")
   voiceNotice="自動重試仍遭瀏覽器阻擋。請在播放裝置按一次「啟用語音並重試」；遠端裝置無法代替本機授權。";
  else if(speech?.state==="error")voiceNotice="語音播放失敗，可點「下一步」重試。";
  else if(speech?.holdNext)voiceNotice="AI 語音正在播放"+remaining+"，結束後即可切換下一場。";
  else if(["starting","playing"].includes(speech?.state))voiceNotice="AI 語音播放中"+remaining+"，可繼續切換台詞或允許的場景。";
  voiceStatusElement.hidden=!voiceNotice;
  voiceStatusElement.textContent=voiceNotice;
  for(const channel of channels){
   sliders[channel].disabled=!active();
   if(!editing.has(channel)){
    const value=state?.volumes[channel];
    if(Number.isInteger(value)){
     sliders[channel].value=String(value);
     outputs[channel].textContent=value+"%";
    }else outputs[channel].textContent="—";
   }
  }
  volumeToggle.setAttribute("aria-pressed",String(Boolean(state?.volumeVisible)));
  for(const button of buttons){
   const {action}=button.dataset;
   button.disabled=!active()||(action==="previous"&&state.step===0)||
    (action==="next"&&(state.step>=state.total-1||Boolean(speech?.holdNext)));
  }
  renderPrompt();
  renderMeters();
 }
 function sendVolume(channel,final=false){
  if(!active())return;
  const send=()=>{
   if(!active())return;
   lastSent[channel]=Date.now();
   connection?.send({type:"command",action:"setVolume",channel,value:Number(sliders[channel].value)});
  };
  clearTimeout(pending[channel]);
  const remaining=75-(Date.now()-(lastSent[channel]??0));
  if(final||remaining<=0)send();
  else pending[channel]=setTimeout(send,remaining);
 }
 for(const channel of channels){
  const slider=sliders[channel];
  slider.addEventListener("pointerdown",()=>editing.add(channel));
  slider.addEventListener("input",()=>{
   editing.add(channel);
   outputs[channel].textContent=slider.value+"%";
   sendVolume(channel);
  });
  slider.addEventListener("change",()=>{
   sendVolume(channel,true);
   editing.delete(channel);
  });
  slider.addEventListener("pointercancel",()=>editing.delete(channel));
  slider.addEventListener("blur",()=>editing.delete(channel));
 }
 function join(){
  connection?.stop();
  connection=null;
  peer=false;state=null;levels=null;
  for(const channel of channels)clearTimeout(pending[channel]);
  const openControl=!location.hash||location.hash==="#";
  const [id,key,...extra]=location.hash.slice(1).split(".");
  if(!["http:","https:"].includes(location.protocol)||
     (!openControl&&(extra.length||!StageRemoteLink.validRoom(id,key)))){
   connectionState="invalid";
   render();
   return;
  }
  connection=StageRemoteLink.connect({
   hello:()=>openControl?{type:"watch"}:{type:"join",id,key},
   onStatus(value){
    connectionState=value;
    if(value!=="connected"){peer=false;state=null;levels=null;}
    render();
   },
   onMessage(message){
    if(message.type==="peer"){
     peer=message.connected;
     if(!peer){state=null;levels=null;}
    }
    if(message.type==="meter"){levels=message.levels;renderMeters();return;}
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