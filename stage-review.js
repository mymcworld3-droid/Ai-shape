"use strict";
const pageViewButton=document.getElementById("pageViewButton");
const stepsViewButton=document.getElementById("stepsViewButton");
const stepsPanel=document.getElementById("stepsPanel");
const stepList=document.getElementById("stepList");
const stepReviewScroll=document.getElementById("stepReviewScroll");
const startButton=document.getElementById("startButton");
const startLabel=document.getElementById("startLabel");
const resetStartStep=document.getElementById("resetStartStep");

// Audio annotations come from the same cue and track configuration as playback.
// They describe media audible during a cue (including continuing background
// music and AI narration), not speculative music files or new playback actions.
const stepVoiceFiles={
 opening:config.narration,memory:config.memory.narration,
 prompt:config.voting.prompt,one:config.voting.one,two:config.voting.two,
 final:config.voting.final,complete:config.ending.complete,
 revealTruth:config.ending.revealTruth
};
const stepEffectFiles={
 doorKick:config.doorKick,doorOpen:config.scriptEffects.doorOpen,
 timerClick:config.scriptEffects.timerClick,memoryClick:config.memory.lightClick,
 officeBang:config.office.bang,"selection-button":config.scriptEffects.selectionButton
};
const sceneVoices={
 welcome:config.narration,clock:config.narration,"memory-welcome":config.memory.narration,
 "vote-prompt":config.voting.prompt,"vote-one":config.voting.one,
 "vote-two":config.voting.two,"vote-final":config.voting.final,
 "ending-complete":config.ending.complete,"ending-reveal":config.ending.revealTruth
};
const sceneEffects={
 "door-kick":config.doorKick,"door-open":config.scriptEffects.doorOpen,
 "memory-light":config.memory.lightClick,"office-bang":config.office.bang,
 "vote-prompt":config.scriptEffects.selectionButton
};
function stepAudioFiles({paragraph,voice=null,effect=null,video=null}){
 const media=[];
 const track=ActOneMusic.trackForStep(paragraph,config.actOneMusic);
 if(track?.src)media.push({kind:"配樂",src:track.src});
 if(voice)media.push({kind:"語音",src:voice});
 if(effect)media.push({kind:"音效",src:effect});
 if(video)media.push({kind:"影片",src:video});
 return media;
}
// The media track is aligned to the rows in the step list.
const timelineSteps=[];
function sceneStepAudio(cue){
 const paragraph=config.sceneMusicSteps[cue];
 return stepAudioFiles({paragraph,voice:sceneVoices[cue],
  effect:sceneEffects[cue],video:cue==="bright"?config.roomReveal:
   cue==="behind-the-scenes"?config.behindScenes:null});
}
if(scriptMode){
 stepList.replaceChildren();
 document.querySelector('#stepsPanel h1').firstChild.textContent='劇本字幕';
 document.querySelector('#stepsPanel h1 span').textContent=SUBTITLE_SCRIPT.entries.length;
 SUBTITLE_SCRIPT.entries.forEach((e,index)=>{
  const li=document.createElement('li'),button=document.createElement('button'),number=document.createElement('span'),text=document.createElement('span'),small=document.createElement('small');
  button.type='button';button.dataset.script=index;button.setAttribute('aria-pressed','false');number.className='step-number';number.textContent=index;
  text.textContent=e.text||e.note||e.action;small.textContent=`ACT ${e.act} · SCENE ${e.scene}${e.speaker?' · '+e.speaker:''}`;
  text.append(small);button.append(number,text);
  timelineSteps.push({label:index,media:stepAudioFiles({paragraph:e.paragraph,
   voice:stepVoiceFiles[e.group],effect:stepEffectFiles[e.action],
   video:e.action==="reveal"?config.roomReveal:
    e.action==="behind-the-scenes"?config.behindScenes:null})});
  li.append(button);stepList.append(li);
 });
}
const modeButton=document.getElementById('modeButton');
modeButton.textContent=scriptMode?'場景模式':'逐句字幕';
modeButton.addEventListener('click',()=>{if(startGate.started)return;location.search=scriptMode?'?mode=cues':'';});
let selectedScript=null;
window.selectedScriptStartIndex=null;
const sentenceButtons=Array.from(document.querySelectorAll('[data-script]'));
function scrollToReviewStep(button){
 if(!button?.offsetHeight)return;
 const row=button.getBoundingClientRect(),view=stepReviewScroll.getBoundingClientRect();
 if(row.top<view.top)stepReviewScroll.scrollTop+=row.top-view.top;
 else if(row.bottom>view.bottom)stepReviewScroll.scrollTop+=row.bottom-view.bottom;
}
function selectScriptStep(index){
 if(startGate.started||!scriptMode)return;
 selectedScript=Number.isInteger(index)&&index>=0&&index<SUBTITLE_SCRIPT.entries.length?index:null;
 window.selectedScriptStartIndex=selectedScript;
 for(const button of sentenceButtons)
  button.setAttribute('aria-pressed',String(Number(button.dataset.script)===selectedScript));
 timeline.select(selectedScript??0);
 window.previewScriptEntry(selectedScript);
 updateStartButton();
 scrollToReviewStep(sentenceButtons[selectedScript]);
}
for(const button of sentenceButtons)button.addEventListener('click',()=>selectScriptStep(Number(button.dataset.script)));
const stepButtons=Array.from(document.querySelectorAll("[data-preview]"));
if(!scriptMode)document.querySelector('#stepsPanel h1 span').textContent=stepButtons.length;
let selectedPreview=null,selectedScene=null;
window.selectedSceneStartCue=null;
if(!scriptMode){
 for(const button of stepButtons){
  button.setAttribute('aria-pressed','false');
  timelineSteps.push({label:button.querySelector('.step-number')?.textContent||'0',
   media:sceneStepAudio(button.dataset.preview)});
 }
}
const timeline=AudioTimeline.mount(document.getElementById('audioTimeline'),{
 steps:timelineSteps,
 rows:(scriptMode?sentenceButtons:stepButtons).map(button=>button.closest('li')),
 trackSelect:document.getElementById('timelineTrack'),
 onSelect(index){
  if(scriptMode)selectScriptStep(index);
  else selectSceneStep(stepButtons[index]?.dataset.preview);
 }
});
timeline.select(0);
function selectSceneStep(cue){
 if(startGate.started||scriptMode)return;
 const index=stepButtons.findIndex(item=>item.dataset.preview===cue);
 const button=stepButtons[index];
 selectedScene=button?cue:null;
 selectedPreview=selectedScene;
 window.selectedSceneStartCue=selectedScene;
 for(const item of stepButtons)item.setAttribute('aria-pressed',String(item===button));
 timeline.select(Math.max(0,index));
 setProjectionPreview(selectedPreview);
 updateStartButton();
 scrollToReviewStep(button);
}
resetStartStep.addEventListener('click',()=>scriptMode?selectScriptStep(null):selectSceneStep(null));

function setReviewView(view){
 if(startGate.started)return;
 document.body.dataset.view=view;
 pageViewButton.setAttribute("aria-pressed",String(view==="page"));
 stepsViewButton.setAttribute("aria-pressed",String(view==="steps"));
 stepsPanel.hidden=view!=="steps";
 if(view==="steps")timeline.layout();
 if(scriptMode)window.previewScriptEntry(view==="steps"?selectedScript:null);
 setProjectionPreview(view==="steps"?selectedPreview:null);
 resizeCanvas();
}
pageViewButton.addEventListener("click",()=>setReviewView("page"));
stepsViewButton.addEventListener("click",()=>setReviewView("steps"));
for(const button of stepButtons){
 button.addEventListener("click",()=>{
  if(startGate.started)return;
  selectSceneStep(button.dataset.preview);
 });
}
function updateStartButton(){
 if(startGate.started)return;
 startButton.disabled=!showAssetsReady();
 startLabel.textContent=startButton.disabled?"載入中…":
  scriptMode&&selectedScript!==null?`從第 ${selectedScript} 步開始`:
  !scriptMode&&selectedScene!==null?`從第 ${stepButtons.find(item=>item.dataset.preview===selectedScene)?.querySelector(".step-number")?.textContent?.trim()} 步開始`:"開始";
 resetStartStep.hidden=scriptMode?selectedScript===null:selectedScene===null;
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
 // A previously marked spoken sentence may now be part of an uninterrupted
 // merged subtitle. Keep its bookmark by mapping every original fragment ID
 // to the visible merged step, without affecting scene-mode bookmarks.
 const bookmarkAliases=new Map();
 if(scriptMode)for(const entry of SUBTITLE_SCRIPT.entries)
  for(const part of entry.parts||[])
   bookmarkAliases.set('script:'+part.id,'script:'+entry.id);
 let saved=[];
 try{
  const value=JSON.parse(localStorage.getItem(storageKey)||'[]');
  if(Array.isArray(value))saved=value.filter(id=>typeof id==='string')
   .map(id=>bookmarkAliases.get(id)||id);
 }catch{}
 const marked=new Set(saved),rows=[];
 let onlyMarked=false;
 const toolbar=document.createElement('div');toolbar.className='step-mark-tools';
 const filter=document.createElement('button');filter.type='button';filter.textContent='只看標記';filter.setAttribute('aria-pressed','false');
 const count=document.createElement('span');count.setAttribute('role','status');
 const empty=document.createElement('p');empty.className='step-marks-empty';empty.textContent='尚未標記步驟。點步驟右側的 ☆ 即可標記。';empty.hidden=true;
 toolbar.append(filter,count);document.querySelector('#stepsPanel header').append(toolbar);
 stepReviewScroll.append(empty);
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
  timeline.layout();
 }
 for(const button of document.querySelectorAll('#stepList [data-script], #stepList [data-preview]')){
  const index=Number(button.dataset.script);
  const id=button.dataset.script!==undefined?'script:'+SUBTITLE_SCRIPT.entries[index].id:'cue:'+button.dataset.preview;
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
