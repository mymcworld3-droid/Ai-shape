"use strict";
const pageViewButton=document.getElementById("pageViewButton");
const stepsViewButton=document.getElementById("stepsViewButton");
const stepsPanel=document.getElementById("stepsPanel");
const startButton=document.getElementById("startButton");
const startLabel=document.getElementById("startLabel");
const resetStartStep=document.getElementById("resetStartStep");
if(scriptMode){
 const list=document.getElementById('stepList');list.replaceChildren();
 document.querySelector('#stepsPanel h1').firstChild.textContent='劇本字幕';
 document.querySelector('#stepsPanel h1 span').textContent=SHOW_SCRIPT.entries.length;
 document.querySelector('#stepsPanel header p').textContent='點選任一步驟預覽；按開始／F 便從該步驟播放';
 SHOW_SCRIPT.entries.forEach((e,index)=>{
  const li=document.createElement('li'),button=document.createElement('button'),number=document.createElement('span'),text=document.createElement('span'),small=document.createElement('small');
  button.type='button';button.dataset.script=index;button.setAttribute('aria-pressed','false');number.className='step-number';number.textContent=index;
  text.textContent=e.text||e.note||e.action;small.textContent=`ACT ${e.act} · SCENE ${e.scene}${e.speaker?' · '+e.speaker:''}`;
  text.append(small);button.append(number,text);li.append(button);list.append(li);
 });
}
const modeButton=document.getElementById('modeButton');
modeButton.textContent=scriptMode?'場景模式':'逐句字幕';
modeButton.addEventListener('click',()=>{if(startGate.started)return;location.search=scriptMode?'?mode=cues':'';});
let selectedScript=null;
window.selectedScriptStartIndex=null;
const sentenceButtons=Array.from(document.querySelectorAll('[data-script]'));
function selectScriptStep(index){
 if(startGate.started||!scriptMode)return;
 selectedScript=Number.isInteger(index)&&index>=0&&index<SHOW_SCRIPT.entries.length?index:null;
 window.selectedScriptStartIndex=selectedScript;
 for(const button of sentenceButtons)
  button.setAttribute('aria-pressed',String(Number(button.dataset.script)===selectedScript));
 window.previewScriptEntry(selectedScript);
 updateStartButton();
 if(selectedScript!==null&&document.body.dataset.view==='steps')
  sentenceButtons[selectedScript]?.scrollIntoView({block:'nearest'});
}
for(const button of sentenceButtons)button.addEventListener('click',()=>selectScriptStep(Number(button.dataset.script)));
resetStartStep.addEventListener('click',()=>selectScriptStep(null));
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
 startLabel.textContent=startButton.disabled?"載入中…":
  scriptMode&&selectedScript!==null?`從第 ${selectedScript} 步開始`:"開始";
 resetStartStep.hidden=!scriptMode||selectedScript===null;
 const failed=["backgroundReady","darkBackgroundReady","cardReady","memoryBackgroundReady","officeBackgroundReady","videoError","audioError"]
  .some(key=>document.body.dataset[key]===(key.endsWith("Error")?"true":"false"));
 document.getElementById("startStatus").textContent=failed?"素材未載入，請重新整理":"";
}
window.addEventListener("stageassetschange",updateStartButton);
startButton.addEventListener("click",()=>startGate.start());
updateStartButton();

// Stable cue IDs keep bookmarks attached to the same sentence after edits.
function setupStepMarks(){
 const storageKey='ai-shape-step-marks-v1';
 let saved=[];
 try{const value=JSON.parse(localStorage.getItem(storageKey)||'[]');if(Array.isArray(value))saved=value.filter(id=>typeof id==='string');}catch{}
 const marked=new Set(saved),rows=[];
 let onlyMarked=false;
 const toolbar=document.createElement('div');toolbar.className='step-mark-tools';
 const filter=document.createElement('button');filter.type='button';filter.textContent='只看標記';filter.setAttribute('aria-pressed','false');
 const count=document.createElement('span');count.setAttribute('role','status');
 const empty=document.createElement('p');empty.className='step-marks-empty';empty.textContent='尚未標記步驟。點步驟右側的 ☆ 即可標記。';empty.hidden=true;
 toolbar.append(filter,count);document.querySelector('#stepsPanel header').append(toolbar);
 document.getElementById('stepList').after(empty);
 let saveFailed=false;
 function refresh(){
  let total=0;
  for(const {row,mark,id,label} of rows){
   const active=marked.has(id);if(active)total++;
   row.dataset.marked=String(active);row.hidden=onlyMarked&&!active;
   mark.textContent=active?'★':'☆';mark.setAttribute('aria-pressed',String(active));
   mark.setAttribute('aria-label',(active?'取消標記':'標記')+'第 '+label+' 步');
   mark.title=active?'取消標記':'標記此步驟';
  }
  for(const divider of document.querySelectorAll('#stepList .scene-divider'))divider.hidden=onlyMarked;
  count.textContent=total+' 個標記'+(saveFailed?'（目前無法儲存）':'');
  filter.setAttribute('aria-pressed',String(onlyMarked));
  empty.hidden=!onlyMarked||total>0;
 }
 for(const button of document.querySelectorAll('#stepList [data-script], #stepList [data-preview]')){
  const index=Number(button.dataset.script);
  const id=button.dataset.script!==undefined?'script:'+SHOW_SCRIPT.entries[index].id:'cue:'+button.dataset.preview;
  const row=button.closest('li');row.classList.add('markable-step');
  const label=button.querySelector('.step-number')?.textContent||String(index);
  const mark=document.createElement('button');mark.type='button';mark.className='step-mark';
  mark.addEventListener('click',()=>{
   if(marked.has(id))marked.delete(id);else marked.add(id);
   try{localStorage.setItem(storageKey,JSON.stringify([...marked]));saveFailed=false;}catch{saveFailed=true;}
   refresh();
  });
  row.append(mark);rows.push({row,mark,id,label});
 }
 filter.addEventListener('click',()=>{onlyMarked=!onlyMarked;refresh();});
 refresh();
}
setupStepMarks();
