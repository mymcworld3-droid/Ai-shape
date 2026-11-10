"use strict";
(()=>{
 if(!["http:","https:"].includes(location.protocol)||!window.WebSocket)return;
 const pairButton=document.getElementById("remotePairButton");
 const dialog=document.getElementById("remotePairDialog");
 const status=document.getElementById("remotePairStatus");
 const linkRow=document.getElementById("remotePairLinkRow");
 const link=document.getElementById("remotePairLink");
 const copy=document.getElementById("remoteCopyButton");
 const createButton=document.getElementById("remoteCreateButton");
 const endButton=document.getElementById("remoteEndButton");
 let connection=null,room=null,lastState="",audioPrepared=false;

 // Play silent PCM on each existing element during the local pairing gesture.
 // This prepares the same elements for later cues, including both music players.
 function primeAudio(){
  if(audioPrepared)return;
  audioPrepared=true;
  remoteAudioPreparing=true;
  notifyAssetsChange();
  prepareAudio();
  const wave=new ArrayBuffer(44+3200);
  const bytes=new DataView(wave);
  bytes.setUint32(0,0x52494646);
  bytes.setUint32(4,wave.byteLength-8,true);
  bytes.setUint32(8,0x57415645);
  bytes.setUint32(12,0x666d7420);
  bytes.setUint32(16,16,true);
  bytes.setUint16(20,1,true);
  bytes.setUint16(22,1,true);
  bytes.setUint32(24,8000,true);
  bytes.setUint32(28,16000,true);
  bytes.setUint16(32,2,true);
  bytes.setUint16(34,16,true);
  bytes.setUint32(36,0x64617461);
  bytes.setUint32(40,3200,true);
  const silence=URL.createObjectURL(new Blob([wave],{type:"audio/wav"}));
  let timer;
  const deadline=new Promise(resolve=>{timer=setTimeout(resolve,1800);});
  const players=document.querySelectorAll("#visualizerWrap audio[src], #actOneBgm, #actOneBgmAlt");
  const attempts=Array.from(players,async media=>{
   const source=media.getAttribute("src");
   media.src=silence;
   try{await Promise.race([media.play(),deadline]);}catch{}
   finally{
    media.pause();
    if(source===null)media.removeAttribute("src");else media.setAttribute("src",source);
    media.load();
   }
  });
  Promise.allSettled(attempts).then(()=>{
   clearTimeout(timer);
   URL.revokeObjectURL(silence);
   remoteAudioPreparing=false;
   notifyAssetsChange();
  });
 }

 function stageState(){
  const started=startGate.started;
  let step,total,label;
  if(scriptMode){
   step=started?transcript.index:window.selectedScriptStartIndex??0;
   total=SHOW_SCRIPT.entries.length;
   const entry=SHOW_SCRIPT.entries[step];
   label=step===0?"藍色房間":entry?.text||entry?.note||"舞台提示";
  }else{
   const cue=started?stage.state:window.selectedSceneStartCue||"dark";
   step=Math.max(0,stepButtons.findIndex(button=>button.dataset.preview===(cue==="room-reveal"?"bright":cue)));
   total=stepButtons.length;
   label=stepButtons[step].children[1].firstChild.textContent.trim();
  }
  return {started,step,total,label,mode:scriptMode?"script":"cues",
   volumes:{voice:voiceVolume,effect:effectVolume,music:otherVolume},
   volumeVisible:!volumeDisplay.hidden};
 }
 function publish(){
  if(dialog.open&&startGate.started)dialog.close();
  if(!connection)return;
  const state=stageState(),serialized=JSON.stringify(state);
  if(serialized!==lastState&&connection.send({type:"state",state}))lastState=serialized;
 }
 const observer=new MutationObserver(publish);
 observer.observe(document.body,{attributes:true,attributeFilter:["data-cue","data-started","data-preview-cue","data-script-index"]});
 observer.observe(volumeDisplay,{childList:true,attributes:true,attributeFilter:["hidden"]});
 observer.observe(startLabel,{childList:true});

 function resetPairing(message){
  connection?.stop();
  connection=null;
  room=null;
  link.value="";
  linkRow.hidden=true;
  createButton.hidden=false;
  endButton.hidden=true;
  status.textContent=message;
 }
 function pair(){
  if(connection||startGate.started)return;
  primeAudio();
  createButton.hidden=true;
  endButton.hidden=false;
  connection=StageRemoteLink.connect({
   hello:()=>room?{type:"join",id:room.id,key:room.stageKey}:{type:"create"},
   onStatus(state){
    if(state==="expired"||state==="replaced"){
     resetPairing("配對已結束，可以建立新連結。");
    }else if(state!=="connected")status.textContent=state==="retrying"?"連線中斷，正在重連…":"正在建立連線…";
   },
   onMessage(message){
    if(message.type==="ready"){
     if(message.id){
      room=message;
      const url=new URL("remote.html",location.href);
      url.hash=room.id+"."+room.controlKey;
      link.value=url.href;
      linkRow.hidden=false;
      copy.textContent="複製連結";
     }
     lastState="";
     publish();
    }else if(message.type==="peer"){
     status.textContent=message.connected?"操控端已連線":"等待另一台裝置連線";
    }else if(message.type==="command"&&StageRemoteLink.actions.includes(message.action)){
     stageActions[message.action](false);
     publish();
    }
   }
  });
 }
 pairButton.addEventListener("click",()=>{dialog.showModal();if(!connection)pair();});
 createButton.addEventListener("click",pair);
 endButton.addEventListener("click",()=>{
  connection?.send({type:"end"});
  resetPairing("配對已結束。");
 });
 copy.addEventListener("click",async()=>{
  try{await navigator.clipboard.writeText(link.value);copy.textContent="已複製";}
  catch{link.select();copy.textContent="連結已選取";}
 });
 fetch(new URL("remote/health",location.href),{cache:"no-store"}).then(response=>{
  if(response.headers.get("X-Ai-Shape-Remote")==="1")pairButton.hidden=false;
 }).catch(()=>{});
})();
