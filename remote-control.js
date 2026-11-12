"use strict";
(()=>{
 const status=document.getElementById("remoteStatus");
 const step=document.getElementById("remoteStep");
 const cue=document.getElementById("remoteCue");
 const voiceStatusElement=document.getElementById("remoteVoiceStatus");
 const prompt=document.getElementById("nextScenePrompt");
 const promptStep=document.getElementById("nextPromptStep");
 const promptLeads=document.getElementById("nextPromptLeads");
 const promptLines=document.getElementById("nextPromptLines");
 const buttons=Array.from(document.querySelectorAll("[data-action]"));
 const openStepList=document.getElementById("openStepList");
 const closeStepList=document.getElementById("closeStepList");
 const stepDialog=document.getElementById("stepDialog");
 const stepSearch=document.getElementById("stepSearch");
 const stepList=document.getElementById("remoteStepList");
 const stepDialogInfo=document.getElementById("stepDialogInfo");
 // Use the same subtitle data as the projection: no independent copy of
 // step numbers or dialogue that could go stale after manuscript edits.
 const scriptCatalog=(window.SUBTITLE_SCRIPT?.entries||[]).map((entry,index)=>({
  index,title:entry.text||entry.note||entry.action||"舞台提示",
  detail:[entry.speaker,entry.act&&"第 "+entry.act+" 幕",
   entry.scene&&"場景 "+entry.scene].filter(Boolean).join(" · ")
 }));
 let sceneCatalog=null,sceneCatalogError=false;
 let renderedCatalogKey="",renderedCurrent=-1;
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
 const layout=document.querySelector("main");
 let fitFrame=0;
 // Keep every cue and all three mixer channels visible in the available
 // Safari Split View height. Scale only when the compact layout still needs it.
 function scheduleLayoutFit(){
  if(fitFrame)return;
  fitFrame=requestAnimationFrame(()=>{
   fitFrame=0;
   const viewport=window.visualViewport;
   const width=viewport?.width||window.innerWidth;
   const height=viewport?.height||window.innerHeight;
   const availableWidth=Math.max(160,width-12);
   const availableHeight=Math.max(120,height-6);
   const sizeAt=scale=>{
    layout.style.width=Math.min(660,availableWidth/scale)+"px";
    layout.style.setProperty("--remote-fit",String(scale));
    return layout.scrollHeight*scale;
   };
   if(sizeAt(1)<=availableHeight)return;
   let lo=.3,hi=1;
   for(let i=0;i<13;i++){
    const mid=(lo+hi)/2;
    if(sizeAt(mid)<=availableHeight)lo=mid;
    else hi=mid;
   }
   sizeAt(lo);
  });
 }
 let connection,connectionState,peer=false,state=null,levels=null;
 function catalogForMode(){
  return state?.mode==="script"?scriptCatalog:state?.mode==="cues"?sceneCatalog:null;
 }
 function renderStepDialog(){
  if(!stepDialog.open)return;
  const catalog=catalogForMode(),query=stepSearch.value.trim().toLocaleLowerCase();
  const compatible=Array.isArray(catalog)&&catalog.length===state?.total;
  stepDialogInfo.textContent=compatible?
   (state.mode==="script"?"逐句字幕":"場景模式")+" · 目前第 "+state.step+
   " 步 / 共 "+state.total+" 步":
   sceneCatalogError&&state?.mode==="cues"?"場景步驟載入失敗，請重新整理":
   "正在取得播放端的步驟清單…";
  const key=[state?.mode,state?.total,compatible,query].join("|");
  if(key!==renderedCatalogKey){
   renderedCatalogKey=key;renderedCurrent=-1;
   stepList.replaceChildren();
   if(compatible){
    const fragment=document.createDocumentFragment();
    for(const entry of catalog){
     if(query&&![String(entry.index),entry.title,entry.detail].some(value=>
      value.toLocaleLowerCase().includes(query)))continue;
     const item=document.createElement("li"),button=document.createElement("button");
     const number=document.createElement("span"),copy=document.createElement("span");
     const name=document.createElement("span"),detail=document.createElement("span");
     button.type="button";button.dataset.jump=String(entry.index);
     button.disabled=!active();
     number.className="step-index";number.textContent=String(entry.index).padStart(2,"0");
     copy.className="step-copy";name.className="step-title";name.textContent=entry.title;
     detail.className="step-detail";detail.textContent=entry.detail;
     copy.append(name,detail);button.append(number,copy);
     item.append(button);fragment.append(item);
    }
    stepList.append(fragment);
   }
   if(!stepList.children.length){
    const empty=document.createElement("li");empty.className="step-empty";
    empty.textContent=compatible?"沒有符合的步驟":"尚無可顯示的步驟";
    stepList.append(empty);
   }
  }
  if(renderedCurrent!==state?.step){
   for(const old of stepList.querySelectorAll('[aria-current="step"]')){
    old.removeAttribute("aria-current");
    old.querySelector(".step-current")?.remove();
   }
   renderedCurrent=state?.step??-1;
   const current=stepList.querySelector('[data-jump="'+renderedCurrent+'"]');
   if(current){
    current.setAttribute("aria-current","step");
    const marker=document.createElement("span");marker.className="step-current";
    marker.textContent="目前";current.append(marker);
   }
  }
  for(const button of stepList.querySelectorAll("button[data-jump]"))button.disabled=!active();
 }
 // Read scene names directly from the projection's actual step buttons,
 // avoiding a duplicated list that drifts when the show is edited.
 fetch(new URL("index.html",location.href),{cache:"no-store"})
  .then(response=>{if(!response.ok)throw Error("Stage step catalog unavailable");return response.text();})
  .then(html=>{
   const doc=new DOMParser().parseFromString(html,"text/html");
   sceneCatalog=Array.from(doc.querySelectorAll("#stepList [data-preview]")).map((button,index)=>({
    index,
    title:button.querySelector(".step-number")?.nextElementSibling?.firstChild?.textContent?.trim()||"舞台步驟",
    detail:button.querySelector("small")?.textContent?.trim()||""
   }));
   if(!sceneCatalog.length)throw Error("Empty scene step catalog");
   renderedCatalogKey="";renderStepDialog();render();
  }).catch(error=>{
   console.warn("[Remote steps]",error);
   sceneCatalogError=true;renderStepDialog();
  });
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
  const next=state?.started?state.nextPreview:null;
  prompt.hidden=!next;
  if(!next)return;
  promptStep.textContent=`第 ${next.step} 步 · ${next.label}`;
  promptLeads.replaceChildren();
  const preceding=next.leadIns||[];
  for(const line of preceding){
   const li=document.createElement("li"),speaker=document.createElement("strong");
   speaker.textContent=line.speaker+"：";
   li.append(speaker,document.createTextNode(" "+line.text));
   promptLeads.append(li);
  }
  if(!preceding.length){
   const li=document.createElement("li");
   li.className="no-dialogue";
   li.textContent="（尚無前面的台詞）";
   promptLeads.append(li);
  }
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
  document.body.classList.toggle("is-connected",
   connectionState==="connected"&&peer&&Boolean(state?.started));
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
  openStepList.disabled=!active()||catalogForMode()?.length!==state?.total;
  renderStepDialog();
  renderPrompt();
  renderMeters();
  scheduleLayoutFit();
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
 openStepList.addEventListener("click",()=>{
  if(openStepList.disabled)return;
  stepSearch.value="";renderedCatalogKey="";renderedCurrent=-1;
  stepDialog.showModal();renderStepDialog();
  stepList.querySelector('[aria-current="step"]')?.scrollIntoView({block:"center"});
  stepSearch.focus({preventScroll:true});
 });
 closeStepList.addEventListener("click",()=>stepDialog.close());
 stepSearch.addEventListener("input",()=>{renderStepDialog();stepList.scrollTop=0;});
 stepList.addEventListener("click",event=>{
  const button=event.target.closest("button[data-jump]");
  if(!button||button.disabled||!active()||!state)return;
  const index=Number(button.dataset.jump);
  if(!Number.isInteger(index)||index<0||index>=state.total)return;
  if(index===state.step){stepDialog.close();return;}
  if(connection?.send({type:"command",action:"jump",step:index}))stepDialog.close();
 });
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
 window.addEventListener("resize",scheduleLayoutFit);
 window.visualViewport?.addEventListener("resize",scheduleLayoutFit);
 window.addEventListener("orientationchange",scheduleLayoutFit);
 document.fonts?.ready?.then(scheduleLayoutFit);
 join();
})();