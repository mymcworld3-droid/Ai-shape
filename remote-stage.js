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
 let liveConnection=null,liveLastState="";
 function nextScenePrompt(step){
  const button=stepButtons[step+1];
  if(!button)return null;
  const cue=button.dataset.preview;
  const paragraph=config.sceneMusicSteps[cue];
  if(!Number.isInteger(paragraph))return null;
  const nextParagraph=config.sceneMusicSteps[stepButtons[step+2]?.dataset.preview]??Infinity;
  const entries=SHOW_SCRIPT.entries.filter(entry=>entry.kind==="dialogue"&&entry.text?.trim());
  const inStep=entries.filter(entry=>entry.paragraph>=paragraph&&
   entry.paragraph<Math.max(paragraph+1,nextParagraph));
  // A pure visual cue may have its first speech in the following paragraph.
  const upcoming=inStep.length?inStep:entries.filter(entry=>entry.paragraph>paragraph&&
   entry.paragraph<=paragraph+2);
  const before=entries.filter(entry=>entry.paragraph<paragraph).at(-1);
  const format=entry=>({speaker:entry.speaker||"舞台",text:entry.text});
  return {step:step+1,label:button.children[1].firstChild.textContent.trim(),
   leadIn:before?format(before):null,lines:upcoming.slice(0,3).map(format)};
 }
 function applyRemoteCommand(message){
  if(!StageRemoteLink.actions.includes(message.action))return;
  if(message.action==="setVolume")stageActions.setVolume(message.channel,message.value);
  else stageActions[message.action]?.(false);
 }

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

 // A voice cue can receive commands while its next scene is intentionally
 // gated by the recording's actual ended event. Tell all controllers why.
 function voiceStatus(){
  if(!startGate.started)return null;
  let media=null,status=null,holdNext=false;
  if(scriptMode){
   const entry=transcript?.entry,active=transcript?.active;
   if(entry?.group&&active?.group===entry.group){
    media=active.media;
    status=active.state;
    const next=SHOW_SCRIPT.entries[transcript.index+1];
    holdNext=Boolean(next&&next.group!==entry.group&&
     ["starting","playing"].includes(status));
   }
  }else{
   const cue=stage.state;
   if(cue==="welcome"||cue==="clock"){
    media=audioElement;status=opening.state==="narration"?"playing":opening.state;
    if(status==="ready"&&document.body.dataset.audioError==="true")status="error";
    holdNext=cue==="clock"&&["starting","playing","narration"].includes(opening.state);
   }else if(cue==="memory-welcome"){
    media=memoryAudio;status=stage.memory?.mediaStates.memoryVoice;
    holdNext=["starting","playing"].includes(status);
   }else{
    const mapping={
     "vote-prompt":["selectionPrompt",selectionAudio.prompt],
     "vote-one":["selectionOne",selectionAudio.one],
     "vote-two":["selectionTwo",selectionAudio.two],
     "vote-final":["selectionFinal",selectionAudio.final],
     "ending-complete":["endingComplete",endingCompleteAudio],
     "ending-reveal":["endingReveal",endingRevealAudio]
    };
    const pair=mapping[cue];
    if(pair){
     media=pair[1];
     const owner=cue.startsWith("vote-")?stage.voting:stage.ending;
     status=owner?.mediaStates[pair[0]];
     holdNext=["starting","playing"].includes(status);
    }
   }
  }
  if(!status)return null;
  const remaining=media&&Number.isFinite(media.duration)&&media.duration>0?
   Math.max(0,Math.ceil(media.duration-media.currentTime)):null;
  return {state:status==="narration"?"playing":status,
   remaining,holdNext};
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
   audioReady:!remoteAudioPreparing,
   audioRecovery:window.stageAudioRecoveryStatus?.()??null,
   voiceStatus:voiceStatus(),
   nextPreview:scriptMode?null:nextScenePrompt(step),
   volumes:{voice:voiceVolume,effect:effectVolume,music:otherVolume},
   volumeVisible:!volumeDisplay.hidden};
 }
 function publish(){
  if(dialog.open&&startGate.started)dialog.close();
  if(!connection&&!liveConnection)return;
  const state=stageState(),serialized=JSON.stringify(state);
  if(connection&&serialized!==lastState&&connection.send({type:"state",state}))lastState=serialized;
  if(liveConnection&&serialized!==liveLastState&&liveConnection.send({type:"state",state}))
   liveLastState=serialized;
 }
 // Transport meters separately so continuous levels do not re-render cue state.
 function publishMeters(){
  if(!startGate.started||!liveConnection&&!connection)return;
  const levels=window.stageAudioLevels?.();
  if(!levels)return;
  const message={type:"meter",levels};
  liveConnection?.send(message);
  connection?.send(message);
 }
 setInterval(publishMeters,125);
 // Media currentTime changes without DOM mutations. Publish only if the
 // voice status/remaining whole seconds has changed.
 setInterval(publish,350);
 function startLive(){
  if(liveConnection||!startGate.started)return;
  liveConnection=StageRemoteLink.connect({
   hello:()=>({type:"host"}),
   onStatus(value){
    if(value==="connected"){liveLastState="";publish();}
   },
   onMessage(message){
    if(message.type==="ready"){liveLastState="";publish();}
    else if(message.type==="command"){
     applyRemoteCommand(message);
     publish();
    }
   }
  });
 }
 const observer=new MutationObserver(()=>{
  if(startGate.started)startLive();
  publish();
 });
 observer.observe(document.body,{attributes:true,attributeFilter:["data-cue","data-started","data-preview-cue","data-script-index"]});
 observer.observe(volumeDisplay,{childList:true,attributes:true,attributeFilter:["hidden"]});
 observer.observe(startLabel,{childList:true});
 window.addEventListener("stageassetschange",publish);

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
    }else if(message.type==="command"){
     applyRemoteCommand(message);
     publish();
    }
   }
  });
 }
 document.getElementById("remoteControlPageButton").addEventListener("click",()=>{
  window.open(new URL("remote.html",location.href).href,"_blank","noopener");
 });
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
 if(startGate.started)startLive();
 fetch(new URL("remote/health",location.href),{cache:"no-store"}).then(response=>{
  if(response.headers.get("X-Ai-Shape-Remote")==="1")pairButton.hidden=false;
 }).catch(()=>{});
})();
