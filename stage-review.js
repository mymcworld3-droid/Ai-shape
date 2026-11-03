"use strict";
const pageViewButton=document.getElementById("pageViewButton");
const stepsViewButton=document.getElementById("stepsViewButton");
const stepsPanel=document.getElementById("stepsPanel");
const startButton=document.getElementById("startButton");
const startLabel=document.getElementById("startLabel");
if(scriptMode){
 const list=document.getElementById('stepList');list.replaceChildren();
 document.querySelector('#stepsPanel h1').firstChild.textContent='劇本字幕';
 document.querySelector('#stepsPanel h1 span').textContent=SHOW_SCRIPT.entries.length;
 document.querySelector('#stepsPanel header p').textContent='逐句預覽，影音不播放；開始後從開場重跑';
 SHOW_SCRIPT.entries.forEach((e,index)=>{
  const li=document.createElement('li'),button=document.createElement('button'),number=document.createElement('span'),text=document.createElement('span'),small=document.createElement('small');
  button.type='button';button.dataset.script=index;button.setAttribute('aria-pressed','false');number.className='step-number';number.textContent=index+1;
  text.textContent=e.text||e.note||e.action;small.textContent=`ACT ${e.act} · SCENE ${e.scene}${e.speaker?' · '+e.speaker:''}`;
  text.append(small);button.append(number,text);li.append(button);list.append(li);
 });
}
const modeButton=document.getElementById('modeButton');
modeButton.textContent=scriptMode?'場景模式':'逐句字幕';
modeButton.addEventListener('click',()=>{if(startGate.started)return;location.search=scriptMode?'?mode=cues':'';});
let selectedScript=null;
for(const button of document.querySelectorAll('[data-script]'))button.addEventListener('click',()=>{
 if(startGate.started)return;selectedScript=Number(button.dataset.script);
 for(const other of document.querySelectorAll('[data-script]'))other.setAttribute('aria-pressed',String(other===button));
 window.previewScriptEntry(selectedScript);
});
const stepButtons=Array.from(document.querySelectorAll("[data-preview]"));
let selectedPreview="bright";

function setReviewView(view){
 if(startGate.started)return;
 document.body.dataset.view=view;
 pageViewButton.setAttribute("aria-pressed",String(view==="page"));
 stepsViewButton.setAttribute("aria-pressed",String(view==="steps"));
 stepsPanel.hidden=view!=="steps";
 if(scriptMode)window.previewScriptEntry(view==="steps"?selectedScript:null);
 setProjectionPreview(view==="steps"?selectedPreview:null);
 resizeCanvas();
}
pageViewButton.addEventListener("click",()=>setReviewView("page"));
stepsViewButton.addEventListener("click",()=>setReviewView("steps"));
for(const button of stepButtons){
 button.addEventListener("click",()=>{
  if(startGate.started)return;
  selectedPreview=button.dataset.preview;
  for(const item of stepButtons)item.setAttribute("aria-pressed",String(item===button));
  setProjectionPreview(selectedPreview);
 });
}
function updateStartButton(){
 if(startGate.started)return;
 startButton.disabled=!showAssetsReady();
 startLabel.textContent=startButton.disabled?"載入中…":"開始";
 const failed=["backgroundReady","darkBackgroundReady","cardReady","memoryBackgroundReady","officeBackgroundReady","videoError","audioError"]
  .some(key=>document.body.dataset[key]===(key.endsWith("Error")?"true":"false"));
 document.getElementById("startStatus").textContent=failed?"素材未載入，請重新整理":"";
}
window.addEventListener("stageassetschange",updateStartButton);
startButton.addEventListener("click",()=>startGate.start());
updateStartButton();
