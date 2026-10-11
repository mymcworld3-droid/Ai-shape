"use strict";
const pageViewButton=document.getElementById("pageViewButton");
const stepsViewButton=document.getElementById("stepsViewButton");
const stepsPanel=document.getElementById("stepsPanel");
const startButton=document.getElementById("startButton");
const startLabel=document.getElementById("startLabel");
const stepButtons=Array.from(document.querySelectorAll("[data-preview]"));
let selectedPreview="bright";

function setReviewView(view){
 if(startGate.started)return;
 document.body.dataset.view=view;
 pageViewButton.setAttribute("aria-pressed",String(view==="page"));
 stepsViewButton.setAttribute("aria-pressed",String(view==="steps"));
 stepsPanel.hidden=view!=="steps";
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
 const failed=["backgroundReady","darkBackgroundReady","cardReady","memoryBackgroundReady","videoError","audioError"]
  .some(key=>document.body.dataset[key]===(key.endsWith("Error")?"true":"false"));
 document.getElementById("startStatus").textContent=failed?"素材未載入，請重新整理":"";
}
window.addEventListener("stageassetschange",updateStartButton);
startButton.addEventListener("click",()=>startGate.start());
updateStartButton();
