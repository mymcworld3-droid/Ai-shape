"use strict";
const config=window.OPENING_CONFIG;
const scriptMode=new URLSearchParams(location.search).get("mode")!=="cues";
let transcript=null,scriptVideoPlaying=false;
let remoteAudioPreparing=false;
let audioRecovery=null;
const autoVoiceRetryDelays=[450,1200];
const audioElement=document.getElementById("openingAudio");
const effectElement=document.getElementById("doorKickAudio");
const memoryDoorOpenAudio=document.getElementById("memoryDoorOpenAudio");
const memoryAudio=document.getElementById("memoryWelcomeAudio");
const memoryLightAudio=document.getElementById("memoryLightAudio");
const officeBangAudio=document.getElementById("officeBangAudio");
const selectionButtonAudio=document.getElementById("selectionButtonAudio");
const selectionAudio={prompt:document.getElementById("selectionPromptAudio"),
 one:document.getElementById("selectionOneAudio"),two:document.getElementById("selectionTwoAudio"),
 final:document.getElementById("selectionFinalAudio")};
const endingCompleteAudio=document.getElementById("endingCompleteAudio");
const endingRevealAudio=document.getElementById("endingRevealAudio");
const narrationMedia=[audioElement,memoryAudio,...Object.values(selectionAudio),endingCompleteAudio,endingRevealAudio];
const revealVideo=document.getElementById("roomRevealVideo");
const canvas=document.getElementById("visualizer");
const ctx=canvas.getContext("2d");
const visualizerWrap=document.getElementById("visualizerWrap");
const behindScenesVideo=document.getElementById("behindScenesVideo");
let behindScenesRun=0;
// Never load or play this optional file until the separate post-show step.
function syncBehindScenes(isBonus){
 const run=++behindScenesRun;
 behindScenesVideo.pause();
 behindScenesVideo.hidden=true;
 if(!isBonus){document.body.dataset.behindScenesState="idle";return;}
 if(!config.behindScenes){document.body.dataset.behindScenesState="missing";return;}
 document.body.dataset.behindScenesState="loading";
 if(behindScenesVideo.getAttribute("src")!==config.behindScenes)
  behindScenesVideo.src=config.behindScenes;
 behindScenesVideo.load();
 try{behindScenesVideo.currentTime=0;}catch(_){}
 try{
  Promise.resolve(behindScenesVideo.play()).then(()=>{
   if(run!==behindScenesRun)return;
   behindScenesVideo.hidden=false;
   document.body.dataset.behindScenesState="playing";
  },error=>{
   if(run!==behindScenesRun)return;
   behindScenesVideo.hidden=true;
   document.body.dataset.behindScenesState="unavailable";
   console.info("[Post-show] Optional video not yet available.",error);
  });
 }catch(error){
  if(run!==behindScenesRun)return;
  document.body.dataset.behindScenesState="unavailable";
 }
}
behindScenesVideo.addEventListener("ended",()=>{
 if(!behindScenesVideo.hidden)document.body.dataset.behindScenesState="ended";
});
behindScenesVideo.addEventListener("error",()=>{
 behindScenesVideo.hidden=true;document.body.dataset.behindScenesState="unavailable";
});
const projectionViewport=document.getElementById("projectionViewport");
const fullscreenRoot=document.getElementById("showShell");
const backgroundImage=new Image();
const darkBackgroundImage=new Image();
const cardImage=new Image();
const memoryBackgroundImage=new Image();
const framePhotoImages={front:new Image(),back:new Image()};
framePhotoImages.front.src=config.memory.frameFront;
framePhotoImages.back.src=config.memory.frameBack;
const officeBackgroundImage=new Image();
let backgroundReady=false,darkBackgroundReady=false,cardReady=false,memoryBackgroundReady=false,officeBackgroundReady=false,roomReadyAt=null;
// Keep the last *decoded* reveal frame when the video element ends. Without
// this, browsers may drop its texture before the next still-room frame paints.
const revealFreezeFrame=document.createElement("canvas");
const revealFreezeCtx=revealFreezeFrame.getContext("2d");
let revealFreezeReady=false,scriptRevealHandoffAt=null;
let previewCue=null,previewAiStartedAt=null;
let audioCtx=null,analyser=null,source=null,dataArray=null,smooth=new Float32Array(512);
const audioSources=new Map();
const meterChannels=["voice","effect","music"];
const meterAnalysers=Object.create(null),meterBuffers=Object.create(null);
const outputGains=Object.create(null);
let dpr=1,w=0,h=0,cx=0,cy=0,scale=1,graphicGlowScale=1;
let energy=0,bassEnergy=0,midEnergy=0,highEnergy=0,pulse=0,rotation=0;
let rotationTarget=0,rotationMoving=false,rotationMoveStart=0,rotationStart=0;
const ROTATE_INTERVAL=500,ROTATE_DURATION=1400,ROTATE_STEP=Math.PI/3;
const particles=[],PARTICLES=90;
const freqMin=20,freqMax=20000;
const transitions=Object.fromEntries(["scene","ai","clock","card","blackout","vote","aiExpansion","voteCorner"].map(name=>
 [name,{value:0,from:0,target:0,start:0,duration:0}]));

function easeInOutCubic(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2}
function animate(name,target,duration){
 updateTransitions(performance.now());
 const t=transitions[name];
 Object.assign(t,{from:t.value,target,start:performance.now(),duration});
}
function updateTransitions(now){
 for(const t of Object.values(transitions)){
  const p=t.duration?Math.max(0,Math.min(1,(now-t.start)/t.duration)):1;
  t.value=t.from+(t.target-t.from)*easeInOutCubic(p);
 }
}

// Scene mode shares the script's real soundtrack files and crossfade player.
 // Keep it idle until a live cue; selecting a rehearsal preview must stay silent.
const sceneBackgroundMusic=scriptMode?null:new ActOneMusic.Controller({
 audio:document.getElementById("actOneBgm"),
 alternateAudio:document.getElementById("actOneBgmAlt"),
 tracks:config.actOneMusic,fadeMs:1400,fadeOutMs:1100,
 onError(error){document.body.dataset.musicError="true";console.error("[Scene BGM]",error);}
});
if(sceneBackgroundMusic)window.actOneBackgroundMusic=sceneBackgroundMusic;

const stage=new StageOpening.StageCueController({
 video:revealVideo,audio:audioElement,effect:config.doorKick?effectElement:null,
 doorOpen:config.scriptEffects.doorOpen?memoryDoorOpenAudio:null,
 selectionButton:config.scriptEffects.selectionButton?selectionButtonAudio:null,
 durationMs:config.countdownMs,revealFadeMs:config.revealFadeMs,
 aiFadeMs:config.aiFadeMs,expandMs:config.sceneDurationMs,
 morphMs:config.morphDurationMs,settleMs:config.settleDurationMs,
 cardFadeMs:config.cardFadeMs,blackoutMs:config.blackoutMs,
 memoryScene:{voice:config.memory.narration?memoryAudio:null,
  click:config.memory.lightClick?memoryLightAudio:null,isReady:()=>memoryBackgroundReady,
  fadeMs:config.memory.fadeMs,aiFadeMs:config.memory.aiFadeMs,voiceExpandMs:config.memory.voiceExpandMs},
 officeScene:{bang:config.office.bang?officeBangAudio:null,
  isReady:()=>officeBackgroundReady&&memoryBackgroundReady,fadeMs:config.office.fadeMs},
 votingScene:{...Object.fromEntries(Object.entries(selectionAudio).map(([kind,media])=>[kind,config.voting[kind]?media:null])),
  isReady:()=>memoryBackgroundReady,durationMs:config.voting.durationMs,fadeMs:config.voting.fadeMs,
  voiceExpandMs:config.voting.voiceExpandMs,voiceSettleMs:config.voting.voiceSettleMs},
 endingScene:{complete:config.ending.complete?endingCompleteAudio:null,
  revealTruth:config.ending.revealTruth?endingRevealAudio:null,
  isReady:()=>memoryBackgroundReady,fadeMs:1000,voiceSettleMs:600},
 capturePresentation(){
  return {scene:document.body.dataset.scene,values:Object.fromEntries(Object.entries(transitions).map(([name,t])=>[name,t.target]))};
 },
 restorePresentation(saved){
  if(!saved)return;
  document.body.dataset.scene=saved.scene;
  document.body.dataset.aiVoiceActive="none";
  for(const [name,value] of Object.entries(saved.values))animate(name,value,0);
  if(stage.room.state==="ready")roomReadyAt=performance.now()-config.revealFadeMs;
  for(const key of Object.keys(document.body.dataset))if(key.endsWith("Error"))document.body.dataset[key]="false";
 },
 onCue(cue){
  document.body.dataset.cue=cue;
  syncBehindScenes(cue==="behind-the-scenes");
  window.sceneVoiceSubtitles?.clearCompleted();
  // All live scene transitions (including rewind and a direct rehearsal jump)
  // update BGM. Stage previews never emit onCue and remain fully silent.
  if(!scriptMode&&startGate.started){
   document.body.dataset.musicError="false";
   sceneBackgroundMusic.setStep(config.sceneMusicSteps[cue]??20);
  }
  if(cue==="bright")roomReadyAt=performance.now();
  if(cue==="ai"){animate("ai",0,0);animate("ai",1,config.aiFadeMs);}
  if(cue==="door-kick"){
   animate("clock",1,0);animate("scene",0,config.settleDurationMs);
  }
  if(cue==="welcome"){animate("clock",0,0);animate("scene",1,config.sceneDurationMs);}
  if(cue==="clock")animate("clock",1,config.morphDurationMs);
  if(cue==="card")animate("card",1,config.cardFadeMs);
  if(cue==="card-hidden")animate("card",0,config.cardFadeMs);
  if(cue==="blackout")animate("blackout",1,config.blackoutMs);
  if(cue==="memory-light"){
   // Change rooms underneath the completed blackout. Never flash the old clock.
   document.body.dataset.scene="memory";
   for(const name of ["scene","ai","clock","card","aiExpansion"])animate(name,0,0);
   animate("blackout",0,config.memory.fadeMs);
  }
  if(cue==="memory-welcome")animate("ai",1,config.memory.aiFadeMs);
  if(cue==="memory-room")animate("ai",0,config.memory.aiFadeMs);
  if(cue==="memory-blackout")animate("blackout",1,config.blackoutMs);
  if(cue==="past-intro"){
   animate("scene",config.office.introDim,0);
   animate("blackout",0,config.office.fadeMs);
  }
  if(cue==="past-isolate"||cue==="past-reflection")animate("blackout",1,config.blackoutMs);
  if(cue==="office-light"||cue==="memory-return"){
   document.body.dataset.scene=cue==="office-light"?"office":"memory";
   for(const name of ["scene","ai","clock","card","aiExpansion"])animate(name,0,0);
   animate("blackout",0,config.office.fadeMs);
  }
  if(cue==="discussion"){
   for(const name of ["ai","clock","card","vote","aiExpansion"])animate(name,0,0);
   animate("scene",config.voting.discussionDim,config.voting.fadeMs);
  }
  if(cue==="vote-prompt"){
   animate("clock",0,0);
   animate("vote",1,config.voting.fadeMs);animate("ai",1,config.voting.fadeMs);
  }
  if(cue==="vote-blackout")animate("blackout",1,config.blackoutMs);
  if(cue==="ending-light"){
   document.body.dataset.scene="memory";
   for(const name of ["ai","clock","card","vote","aiExpansion","voteCorner","scene"])animate(name,0,0);
   animate("blackout",0,1000);
  }
  if(cue==="ending-dialogue"||cue==="ending-question"){
   document.body.dataset.scene="memory";
   for(const name of ["ai","aiExpansion","clock","vote","voteCorner","scene"])animate(name,0,600);
  }
  if(cue==="ending-complete"||cue==="ending-reveal"){
   document.body.dataset.scene="memory";
   for(const name of ["clock","vote","voteCorner"])animate(name,0,0);
   animate("ai",1,600);
   animate("aiExpansion",1,900);
   animate("scene",1,900);
  }
  if(cue==="ending-blackout"){
   for(const name of ["ai","aiExpansion","clock","card","vote","voteCorner"])animate(name,0,0);
   animate("blackout",1,0);
  }
 },
 onMediaState(kind,state){
  const key={room:"roomState",narration:"openingState",effect:"effectState",doorOpen:"doorOpenState",
   selectionButton:"selectionButtonState",
   endingComplete:"endingCompleteState",endingReveal:"endingRevealState",
   memoryVoice:"memoryVoiceState",memoryClick:"memoryClickState",officeBang:"officeBangState",
   selectionPrompt:"selectionPromptState",selectionOne:"selectionOneState",
   selectionTwo:"selectionTwoState",selectionFinal:"selectionFinalState"}[kind];
  document.body.dataset[key]=state;
  if((state==="playing"||kind==="narration"&&state==="narration")&&audioRecovery?.kind===kind)
   completeAudioRecovery(kind);
  if(kind==="narration"&&state==="ready")animate("scene",0,config.settleDurationMs);
  if(kind==="memoryVoice"){
   if(state==="playing")animate("aiExpansion",1,config.memory.voiceExpandMs);
   if(state==="finished"||state==="error")animate("aiExpansion",0,config.memory.aiFadeMs);
  }
  if(["selectionPrompt","selectionOne","selectionTwo","selectionFinal"].includes(kind)){
   if(state==="playing"){
    document.body.dataset.aiVoiceActive=kind;
    animate("ai",1,config.voting.fadeMs);animate("clock",0,0);
    animate("aiExpansion",1,config.voting.voiceExpandMs);
   }
   if(["finished","error","missing"].includes(state)){
    document.body.dataset.aiVoiceActive="none";
    animate("aiExpansion",0,config.voting.voiceSettleMs);
    animate("clock",0,0); // Voting narration never restores a timer.
   }
  }
  if(kind==="endingComplete"||kind==="endingReveal"){
   if(state==="starting"||state==="playing"){
    document.body.dataset.aiVoiceActive=kind;
    animate("ai",1,config.voting.fadeMs);
    animate("aiExpansion",1,config.voting.voiceExpandMs);
    animate("scene",1,config.voting.voiceExpandMs);
   }
   if(["finished","error","missing"].includes(state)){
    document.body.dataset.aiVoiceActive="none";
    if(kind==="endingComplete"){
     animate("aiExpansion",0,600);
     animate("scene",0,600);
    }
    // The final revelation keeps its graphic until the operator's blackout.
   }
  }
 },
 onNarrationEnd(){animate("scene",0,config.settleDurationMs);},
 onMemoryNarrationEnd(){animate("ai",0,config.memory.aiFadeMs);},
 onError(kind,error){
  document.body.dataset[{room:"videoError",narration:"audioError",effect:"effectError",doorOpen:"doorOpenError",
   selectionButton:"selectionButtonError",
   endingComplete:"endingCompleteError",endingReveal:"endingRevealError",
   memoryVoice:"memoryVoiceError",memoryClick:"memoryClickError",officeBang:"officeBangError",
   selectionPrompt:"selectionPromptError",selectionOne:"selectionOneError",
   selectionTwo:"selectionTwoError",selectionFinal:"selectionFinalError"}[kind]]="true";
  notifyAssetsChange();
  scheduleAudioRecovery(kind,error);
  console.error("[Opening]",error);
 }
});
const opening=stage.opening,roomReveal=stage.room;
const startGate=new StageOpening.StartGate({
 isReady:showAssetsReady,
 onStart(){
  previewCue=null;previewAiStartedAt=null;
  // Register and authorize the voice elements while the trusted Start
  // gesture is still active. Remote commands arrive without that gesture.
  for(const media of document.querySelectorAll("audio"))prepareAudio(media);
  primeRemoteNarrations();
  document.body.dataset.started="true";
  document.body.dataset.view="page";
  document.body.dataset.previewCue="dark";
  for(const id of ["reviewControls","stepsPanel","startDock"])document.getElementById(id).hidden=true;
  visualizerWrap.focus({preventScroll:true});
  resizeCanvas();
  // This is the first real cue, still inside the Start button's click event.
  if(scriptMode){transcript.start(window.selectedScriptStartIndex??0);requestStageFullscreen();}
  else{
   const cue=window.selectedSceneStartCue;
   if(!cue||cue==="dark") {
    stage.startAt("dark");
    requestStageFullscreen();
   }else if(cue==="bright"||!StageOpening.STAGE_START_CUES.includes(cue))advanceStage();
   else{
    // The selected cue is the first live cue. Skipped media are never played.
    const voice={"welcome":audioElement,"memory-welcome":memoryAudio,
     "vote-prompt":selectionAudio.prompt,"vote-one":selectionAudio.one,
     "vote-two":selectionAudio.two,"vote-final":selectionAudio.final,
     "ending-complete":endingCompleteAudio,"ending-reveal":endingRevealAudio}[cue];
    if(voice)prepareAudio(voice);
    stage.startAt(cue);
    // A rehearsal jump must show the selected stage immediately, not animate
    // from an unrelated opening-room/blackout state.
    const frame=StageLayout.previewFrame(cue);
    stage.restorePresentation({scene:frame.background||"opening",
     values:Object.fromEntries(Object.keys(transitions).map(name=>[name,Number(frame[name])||0]))});
    requestStageFullscreen();
   }
  }
 }
});
document.body.dataset.cue="dark";
document.body.dataset.openingState="ready";
document.body.dataset.roomState="dark";
document.body.dataset.effectState="idle";
document.body.dataset.effectAvailable=String(Boolean(config.doorKick));
document.body.dataset.doorOpenState="idle";
document.body.dataset.doorOpenAvailable=String(Boolean(config.scriptEffects.doorOpen));
document.body.dataset.scene="opening";
document.body.dataset.memoryVoiceState="idle";
document.body.dataset.memoryClickState="idle";
document.body.dataset.memoryVoiceAvailable=String(Boolean(config.memory.narration));
document.body.dataset.memoryClickAvailable=String(Boolean(config.memory.lightClick));
document.body.dataset.officeBangState="idle";
document.body.dataset.officeBangAvailable=String(Boolean(config.office.bang));
document.body.dataset.selectionButtonState="idle";
document.body.dataset.selectionButtonAvailable=String(Boolean(config.scriptEffects.selectionButton));
document.body.dataset.endingCompleteState="idle";
document.body.dataset.endingRevealState="idle";
document.body.dataset.endingCompleteAvailable=String(Boolean(config.ending.complete));
document.body.dataset.endingRevealAvailable=String(Boolean(config.ending.revealTruth));
document.body.dataset.aiVoiceActive="none";
for(const kind of ["Prompt","One","Two","Final"]){
 document.body.dataset["selection"+kind+"State"]="idle";
 document.body.dataset["selection"+kind+"Available"]=String(Boolean(config.voting[kind.toLowerCase()]));
}
// Read-only diagnostics for rehearsals; no control UI appears on the projection.
window.stageOpening=Object.freeze({
 get started(){return startGate.started;},
 get state(){return stage.state;},
 get roomState(){return roomReveal.state;},
 get narrationState(){return opening.state;},
 get effectAvailable(){return Boolean(config.doorKick);},
 get memoryState(){return stage.memory.state;},
 get officeState(){return stage.office.state;},
 get selectionState(){return stage.voting.state;},
 get endingState(){return stage.ending?.state;},
 get selectionRemainingMs(){return stage.voting.getRemainingMs();},
 get remainingMs(){return opening.getRemainingMs();}
});

function showAssetsReady(){
 return !remoteAudioPreparing&&backgroundReady&&darkBackgroundReady&&cardReady&&memoryBackgroundReady&&officeBackgroundReady&&revealVideo.readyState>=2&&audioElement.readyState>=2;
}
function notifyAssetsChange(){window.dispatchEvent(new Event("stageassetschange"));}
function setProjectionPreview(cue){
 if(startGate.started)return;
 previewCue=StageLayout.previewFrame(cue)?cue:null;
 previewAiStartedAt=null;
 document.body.dataset.previewCue=previewCue||"dark";
}
function projectionFrame(){
 if(scriptMode){const frame=window.scriptProjectionFrame?.();if(frame)return frame;}
 if(!startGate.started&&previewCue){
  const frame={...StageLayout.previewFrame(previewCue),preview:true};
  if(frame.ai>0&&frame.clock===0){
   const ready=frame.background==="memory"?memoryBackgroundReady:frame.background==="office"?officeBackgroundReady:backgroundReady;
   if(previewAiStartedAt===null&&ready)previewAiStartedAt=performance.now();
   frame.ai*=previewAiStartedAt===null?0:StageLayout.fadeInProgress(performance.now()-previewAiStartedAt,config.aiFadeMs);
  }
  if(previewCue==="past-intro")frame.scene=config.office.introDim;
  if(previewCue==="discussion"||previewCue.startsWith("vote-")&&previewCue!=="vote-blackout")frame.scene=config.voting.discussionDim;
  frame.caption=previewCue;
  return frame;
 }
 const background=document.body.dataset.scene;
 return {background,
  caption:stage.state,timer:"opening",
  room:background==="office"?officeBackgroundReady:background==="memory"?memoryBackgroundReady:roomReveal.state==="ready"&&backgroundReady,preview:false,
  ...Object.fromEntries(Object.entries(transitions).map(([key,t])=>[key,t.value]))};
}

backgroundImage.addEventListener("load",()=>{
 backgroundReady=true;document.body.dataset.backgroundReady="true";notifyAssetsChange();
});
backgroundImage.addEventListener("error",()=>{
 document.body.dataset.backgroundReady="false";
 notifyAssetsChange();
 console.error("[Opening] Room background could not be loaded.");
});
backgroundImage.src=config.background;
darkBackgroundImage.addEventListener("load",()=>{
 darkBackgroundReady=true;document.body.dataset.darkBackgroundReady="true";notifyAssetsChange();
});
darkBackgroundImage.addEventListener("error",()=>{
 document.body.dataset.darkBackgroundReady="false";
 notifyAssetsChange();
 console.error("[Opening] Dark room background could not be loaded.");
});
darkBackgroundImage.src=config.darkBackground;
cardImage.addEventListener("load",()=>{cardReady=true;document.body.dataset.cardReady="true";notifyAssetsChange();});
cardImage.addEventListener("error",()=>{
 document.body.dataset.cardReady="false";notifyAssetsChange();console.error("[Opening] Card image could not be loaded.");
});
cardImage.src=config.card;
memoryBackgroundImage.addEventListener("load",()=>{
 memoryBackgroundReady=true;document.body.dataset.memoryBackgroundReady="true";notifyAssetsChange();
});
memoryBackgroundImage.addEventListener("error",()=>{
 memoryBackgroundReady=false;document.body.dataset.memoryBackgroundReady="false";
 notifyAssetsChange();console.error("[Memory room] Background could not be loaded.");
});
memoryBackgroundImage.src=config.memory.background;
officeBackgroundImage.addEventListener("load",()=>{
 officeBackgroundReady=true;document.body.dataset.officeBackgroundReady="true";notifyAssetsChange();
});
officeBackgroundImage.addEventListener("error",()=>{
 officeBackgroundReady=false;document.body.dataset.officeBackgroundReady="false";
 notifyAssetsChange();console.error("[Office memory] Background could not be loaded.");
});
officeBackgroundImage.src=config.office.background;
revealVideo.addEventListener("canplay",()=>{document.body.dataset.videoReady="true";notifyAssetsChange();});
revealVideo.src=config.roomReveal;
revealVideo.load();
audioElement.addEventListener("canplay",()=>{document.body.dataset.audioReady="true";notifyAssetsChange();});
audioElement.src=config.narration;
audioElement.load();
if(config.doorKick){effectElement.src=config.doorKick;effectElement.load();}
if(config.scriptEffects.doorOpen){memoryDoorOpenAudio.src=config.scriptEffects.doorOpen;memoryDoorOpenAudio.load();}
if(config.memory.narration){memoryAudio.src=config.memory.narration;memoryAudio.load();}
if(config.memory.lightClick){memoryLightAudio.src=config.memory.lightClick;memoryLightAudio.load();}
if(config.office.bang){officeBangAudio.src=config.office.bang;officeBangAudio.load();}
if(config.scriptEffects.selectionButton){selectionButtonAudio.src=config.scriptEffects.selectionButton;selectionButtonAudio.load();}
if(config.ending.complete){endingCompleteAudio.src=config.ending.complete;endingCompleteAudio.load();}
if(config.ending.revealTruth){endingRevealAudio.src=config.ending.revealTruth;endingRevealAudio.load();}
for(const [kind,media] of Object.entries(selectionAudio)){
 if(config.voting[kind]){media.src=config.voting[kind];media.load();}
}

function meterChannelFor(media){
 if(media.id==="actOneBgm"||media.id==="actOneBgmAlt")return "music";
 if(narrationMedia.includes(media)||media.id==="completeAudio"||media.id==="revealTruthAudio")return "voice";
 return "effect";
}
function prepareAudio(media=audioElement){
 try{
  if(!audioCtx){
   const AudioContext=window.AudioContext||window.webkitAudioContext;
   if(!AudioContext)return;
   audioCtx=new AudioContext();analyser=audioCtx.createAnalyser();
   analyser.fftSize=1024;analyser.minDecibels=-90;analyser.maxDecibels=-10;
   analyser.smoothingTimeConstant=.22;
   for(const channel of meterChannels){
    const node=audioCtx.createAnalyser(),gain=audioCtx.createGain();
    node.fftSize=2048;
    node.connect(gain);
    gain.connect(audioCtx.destination);
    meterAnalysers[channel]=node;
    meterBuffers[channel]=new Float32Array(node.fftSize);
    outputGains[channel]=gain;
   }
   // Narration continues to drive the existing AI visualizer.
   analyser.connect(meterAnalysers.voice);
   dataArray=new Uint8Array(analyser.frequencyBinCount);smooth=new Float32Array(analyser.frequencyBinCount);
  }
  if(media&&!audioSources.has(media)){
   source=audioCtx.createMediaElementSource(media);
   const channel=meterChannelFor(media);
   source.connect(channel==="voice"?analyser:meterAnalysers[channel]);
   audioSources.set(media,source);
  }
  if(audioCtx.state==="suspended")audioCtx.resume().catch(error=>console.warn("[Opening] Audio analysis:",error));
 }catch(error){console.warn("[Opening] Audio analysis unavailable:",error);}
}
// A projector's Start click is the only guaranteed local user gesture.
// Warm up narration elements once with their existing audio files, routed
// through a temporarily silent WebAudio gain. Safari otherwise may block
// a later play() invoked by a WebSocket command. Do not touch the voice
// scheduled to play immediately when rehearsing from a speech cue.
function primeRemoteNarrations(){
 const selected=scriptMode?SHOW_SCRIPT.entries[window.selectedScriptStartIndex??0]:
  null;
 const directCue=scriptMode?selected?.group:window.selectedSceneStartCue;
 const immediate=new Set(["opening","memory","prompt","one","two","final",
  "complete","revealTruth","welcome","memory-welcome","vote-prompt",
  "vote-one","vote-two","vote-final","ending-complete","ending-reveal"]);
 // At a direct speech rehearsal start the target's own play is already
 // invoked in the trusted gesture. Never mute that real first sentence.
 if(immediate.has(directCue))return;
 const gain=outputGains.voice;
 if(!gain)return;
 const entries=[...new Set([...narrationMedia,
  document.getElementById("completeAudio"),document.getElementById("revealTruthAudio")])]
  .filter(media=>media?.getAttribute("src")&&!media.error);
 if(!entries.length)return;
 remoteAudioPreparing=true;
 notifyAssetsChange();
 gain.gain.value=0;
 let unfinished=entries.length;
 function release(){
  if(--unfinished===0){
   gain.gain.value=1;
   remoteAudioPreparing=false;
   notifyAssetsChange();
  }
 }
 for(const media of entries){
  let finished=false;
  const finish=()=>{
   if(finished)return;
   finished=true;
   media.pause();
   try{media.currentTime=0;}catch{}
   release();
  };
  // A deadline prevents an unloaded/missing file from muting real voices.
  setTimeout(finish,280);
  try{Promise.resolve(media.play()).then(finish,finish);}
  catch{finish();}
 }
}
// A WebSocket event has no trusted user activation. Retry transient audio
// failures automatically; a persistent NotAllowedError can only be resolved
// by one direct interaction on the projector under browser autoplay policies.
// Never advance the cue here: replay the exact rejected narration instead.
function retryableVoice(kind){
 if(!startGate.started)return null;
 if(scriptMode){
  if(transcript?.entry?.group===kind&&transcript.active?.group===kind&&
     transcript.active.state==="error")
   return ()=>transcript.play(kind);
  return null;
 }
 const cue=stage.state;
 if(kind==="narration"&&cue==="welcome"&&opening.state==="ready")
  return ()=>opening.advance();
 if(kind==="memoryVoice"&&cue==="memory-welcome"&&stage.memory?.mediaStates.memoryVoice==="error")
  return ()=>stage.memory.play("memoryVoice");
 const cues={
  selectionPrompt:"vote-prompt",selectionOne:"vote-one",
  selectionTwo:"vote-two",selectionFinal:"vote-final",
  endingComplete:"ending-complete",endingReveal:"ending-reveal"
 };
 const expectedCue=cues[kind];
 if(!expectedCue||cue!==expectedCue)return null;
 const owner=kind.startsWith("selection")?stage.voting:stage.ending;
 if(owner?.mediaStates[kind]!=="error")return null;
 return ()=>owner.play(kind);
}
function updateAudioRecoveryUI(){
 const dock=document.getElementById("audioUnlockDock");
 if(dock)dock.hidden=!audioRecovery?.needsGesture;
 document.body.dataset.audioRecovery=audioRecovery?
  audioRecovery.needsGesture?"needs-gesture":"retrying":"ready";
 notifyAssetsChange();
}
function completeAudioRecovery(kind){
 if(!audioRecovery||audioRecovery.kind!==kind)return;
 clearTimeout(audioRecovery.timer);
 audioRecovery=null;
 updateAudioRecoveryUI();
}
window.stageAudioRecoveryStatus=()=>audioRecovery?{
 state:audioRecovery.needsGesture?"needs-gesture":"retrying",
 attempt:audioRecovery.attempt
}:null;
function scheduleAudioRecovery(kind,error){
 if(error?.name!=="NotAllowedError")return;
 // Only recover recordings; a rejected effect or video must not skip a step.
 if(!retryableVoice(kind))return;
 if(!audioRecovery||audioRecovery.kind!==kind){
  if(audioRecovery)clearTimeout(audioRecovery.timer);
  audioRecovery={kind,attempt:0,timer:null,needsGesture:false};
 }
 const recovery=audioRecovery;
 clearTimeout(recovery.timer);
 if(recovery.attempt>=autoVoiceRetryDelays.length){
  recovery.needsGesture=true;
  updateAudioRecoveryUI();
  return;
 }
 const wait=autoVoiceRetryDelays[recovery.attempt++];
 recovery.needsGesture=false;
 updateAudioRecoveryUI();
 recovery.timer=setTimeout(()=>{
  if(audioRecovery!==recovery)return;
  const retry=retryableVoice(kind);
  if(!retry){completeAudioRecovery(kind);return;}
  if(audioCtx?.state==="suspended")audioCtx.resume().catch(()=>{});
  try{Promise.resolve(retry()).catch(err=>scheduleAudioRecovery(kind,err));}
  catch(err){scheduleAudioRecovery(kind,err);}
 },wait);
}
function retryVoiceOnProjector(){
 if(!audioRecovery)return;
 const kind=audioRecovery.kind,retry=retryableVoice(kind);
 if(!retry){completeAudioRecovery(kind);return;}
 clearTimeout(audioRecovery.timer);
 audioRecovery.needsGesture=false;
 updateAudioRecoveryUI();
 if(audioCtx?.state==="suspended")audioCtx.resume().catch(()=>{});
 try{Promise.resolve(retry()).catch(err=>scheduleAudioRecovery(kind,err));}
 catch(err){scheduleAudioRecovery(kind,err);}
}
// Audio RMS measured after the media elements' volume settings.
// -60 dBFS is the display's silence floor, 0 dBFS is digital full scale.
window.stageAudioLevels=function stageAudioLevels(){
 const result={voice:-60,effect:-60,music:-60};
 if(!audioCtx||audioCtx.state!=="running")return result;
 for(const channel of meterChannels){
  const node=meterAnalysers[channel],buffer=meterBuffers[channel];
  if(!node||!buffer)continue;
  node.getFloatTimeDomainData(buffer);
  let squares=0;
  for(let i=0;i<buffer.length;i++)squares+=buffer[i]*buffer[i];
  const rms=Math.sqrt(squares/buffer.length);
  result[channel]=rms<=.001?-60:Math.max(-60,Math.min(0,Math.round(20*Math.log10(rms))));
 }
 return result;
};
function requestStageFullscreen(){
 if(!document.fullscreenElement&&fullscreenRoot.requestFullscreen){
  try{
   const request=fullscreenRoot.requestFullscreen();
   if(request&&request.catch)request.catch(()=>{});
  }catch(_){}
 }
}
document.getElementById("audioUnlockButton").addEventListener("click",retryVoiceOnProjector);
function advanceStage(fullscreen=true){
 if(!startGate.started)return;
 if(scriptMode){transcript.next();if(fullscreen)requestStageFullscreen();return;}
 // The same Next button first advances an AI caption, not the whole scene.
 // Caption navigation is allowed during fade/voice locks and never seeks audio.
 if(window.sceneVoiceSubtitles?.next()){if(fullscreen)requestStageFullscreen();return;}
 if(!backgroundReady||!darkBackgroundReady)return;
 if(stage.state==="door-kick"&&!cardReady)return;
 if(performance.now()<stage.busyUntil)return;
 if(stage.state==="dark")document.body.dataset.videoError="false";
 if(stage.state==="ai"||(stage.state==="welcome"&&stage.opening.state==="ready")){
  document.body.dataset.audioError="false";prepareAudio();
 }
 if(stage.state==="memory-light"&&config.memory.narration){
  document.body.dataset.memoryVoiceError="false";prepareAudio(memoryAudio);
 }
 if(stage.state==="memory-welcome"&&stage.memory.mediaStates.memoryVoice==="error"){
  document.body.dataset.memoryVoiceError="false";prepareAudio(memoryAudio);
 }
 if(stage.state==="blackout"||stage.state==="memory-light")document.body.dataset.memoryClickError="false";
 if(stage.state==="card-hidden"||stage.state==="door-open")document.body.dataset.doorOpenError="false";
 if(stage.state==="office-light"||stage.state==="office-bang")document.body.dataset.officeBangError="false";
 if(stage.state==="discussion"||stage.state.startsWith("vote-")){
  for(const [kind,media] of Object.entries(selectionAudio))if(config.voting[kind])prepareAudio(media);
 }
 if(stage.state==="discussion")document.body.dataset.selectionButtonError="false";
 if(stage.state==="ending-dialogue"||stage.state==="ending-complete"){
  document.body.dataset.endingCompleteError="false";
  if(config.ending.complete)prepareAudio(endingCompleteAudio);
 }
 if(stage.state==="ending-question"||stage.state==="ending-reveal"){
  document.body.dataset.endingRevealError="false";
  if(config.ending.revealTruth)prepareAudio(endingRevealAudio);
 }
 for(const kind of ["Prompt","One","Two","Final"])document.body.dataset["selection"+kind+"Error"]="false";
 stage.advance();if(fullscreen)requestStageFullscreen();
}
let voiceVolume=100,effectVolume=100,otherVolume=100;
const volumeDisplay=document.getElementById("volumeDisplay");
function applyVolumes(){
 for(const media of document.querySelectorAll("audio,video")){
  // Music crossfades own the gain of both soundtrack players.
  if(media.id==="actOneBgm"||media.id==="actOneBgmAlt")continue;
  const isVoice=narrationMedia.includes(media);
  media.volume=(isVoice?voiceVolume:effectVolume)/100;
 }
 // 3/E changes the common master without interrupting either fade.
 const soundtrackLevel=otherVolume/100*.4;
 if(window.actOneBackgroundMusic)window.actOneBackgroundMusic.setMasterVolume(soundtrackLevel);
 else{
  document.getElementById("actOneBgm").volume=soundtrackLevel;
  document.getElementById("actOneBgmAlt").volume=0;
 }
 volumeDisplay.textContent="語音 "+voiceVolume+"%\n音效 "+effectVolume+"%\n背景音樂 "+otherVolume+"%";
}
function setChannelVolume(channel,value){
 if(!["voice","effect","music"].includes(channel)||!Number.isInteger(value)||value<0||value>100)return false;
 if(channel==="voice")voiceVolume=value;
 else if(channel==="effect")effectVolume=value;
 else otherVolume=value;
 applyVolumes();
 return true;
}
function changeVoiceVolume(delta){voiceVolume=StageOpening.adjustVolume(voiceVolume,delta);applyVolumes();}
function changeEffectVolume(delta){effectVolume=StageOpening.adjustVolume(effectVolume,delta);applyVolumes();}
function changeOtherVolume(delta){otherVolume=StageOpening.adjustVolume(otherVolume,delta);applyVolumes();}
function toggleVolumeDisplay(){volumeDisplay.hidden=!volumeDisplay.hidden;}
applyVolumes();
const stageActions={
 start:()=>startGate.start(),next:advanceStage,
 previous:()=>{if(startGate.started){if(scriptMode)transcript.previous();else if(!window.sceneVoiceSubtitles?.previous())stage.previous();}},
 voiceUp:()=>changeVoiceVolume(5),voiceDown:()=>changeVoiceVolume(-5),
 effectUp:()=>changeEffectVolume(5),effectDown:()=>changeEffectVolume(-5),
 otherUp:()=>changeOtherVolume(5),otherDown:()=>changeOtherVolume(-5),
 setVolume:setChannelVolume,
 toggleVolumeDisplay,
 isStarted:()=>startGate.started
};
StageOpening.bindStageKeys(window,stageActions);
StageOpening.bindAdvanceClick(projectionViewport,advanceStage);
document.addEventListener("fullscreenchange",resizeCanvas);
window.addEventListener("resize",resizeCanvas);

function drawRevealVideo(alpha){
 if(alpha<=0)return;
 const decoded=revealVideo.readyState>=2&&revealVideo.videoWidth>0;
 // Save the most recent live frame before video.ended can invalidate it.
 if(decoded&&!revealVideo.ended&&(roomReveal.state==="playing"||scriptVideoPlaying)){
  const vw=revealVideo.videoWidth,vh=revealVideo.videoHeight;
  if(revealFreezeFrame.width!==vw||revealFreezeFrame.height!==vh){
   revealFreezeFrame.width=vw;revealFreezeFrame.height=vh;
  }
  try{revealFreezeCtx.drawImage(revealVideo,0,0,vw,vh);revealFreezeReady=true;}catch(_){}
 }
 const frozen=(revealVideo.ended||roomReveal.state==="ready"||scriptRevealHandoffAt!==null)&&revealFreezeReady;
 const source=frozen?revealFreezeFrame:decoded?revealVideo:revealFreezeReady?revealFreezeFrame:null;
 if(!source)return;
 const b=StageLayout.coverLayout(w,h,source.videoWidth||source.width,source.videoHeight||source.height);
 ctx.save();ctx.globalAlpha=alpha;
 ctx.fillStyle="#050505";ctx.fillRect(0,0,w,h);
 ctx.drawImage(source,b.x,b.y,b.width,b.height);ctx.restore();
}
function roomHandoffProgress(now){
 if(roomReveal.state!=="ready"||!backgroundReady)return 0;
 return easeInOutCubic(Math.max(0,Math.min(1,(now-roomReadyAt)/config.revealFadeMs)));
}
function drawBackground(now,frame){
 ctx.clearRect(0,0,w,h);ctx.fillStyle=frame.hideBackground?"#000":"#050505";ctx.fillRect(0,0,w,h);
 if(frame.hideBackground)return; // No room or office backgrounds after the vote clock begins.
 const openingRoom=!frame.background||frame.background==="opening";
 const ready=frame.background==="office"?officeBackgroundReady:frame.background==="memory"?memoryBackgroundReady:backgroundReady;
 const image=frame.background==="office"?officeBackgroundImage:frame.background==="memory"?memoryBackgroundImage:frame.room?backgroundImage:darkBackgroundImage;
 if(frame.room?ready:openingRoom&&darkBackgroundReady){
  const b=StageLayout.coverLayout(w,h,image.naturalWidth,image.naturalHeight);ctx.drawImage(image,b.x,b.y,b.width,b.height);
 }
 // Only the step-zero backdrop is extremely dim: the next real video fades
 // over the same dim backdrop, never revealing an intervening bright photo.
 if(openingRoom&&!frame.room&&(!frame.script||frame.cueZero)){
  ctx.fillStyle=`rgba(0,0,0,${config.cueZeroDim})`;
  ctx.fillRect(0,0,w,h);
 }
 if(frame.script&&scriptVideoPlaying){
  // While the browser decodes the first reveal frame, never expose the full
  // bright still underneath. This prevents a one-frame flash on slow devices.
  if(revealVideo.readyState<2&&!revealFreezeReady){
   ctx.fillStyle="#000";ctx.fillRect(0,0,w,h);
  }else drawRevealVideo(1);
 }else if(frame.script&&scriptRevealHandoffAt!==null){
  const p=Math.max(0,Math.min(1,(now-scriptRevealHandoffAt)/config.revealFadeMs));
  if(p<1)drawRevealVideo(1-easeInOutCubic(p));
  else scriptRevealHandoffAt=null;
 }else if(!frame.script&&openingRoom&&!frame.preview&&roomReveal.state==="playing"){
  drawRevealVideo(easeInOutCubic(Math.min(1,revealVideo.currentTime*1000/config.revealFadeMs)));
 }else if(!frame.script&&openingRoom&&!frame.preview&&roomReveal.state==="ready"){
  drawRevealVideo(1-roomHandoffProgress(now));
 }
 const expansion=openingRoom?frame.scene:frame.aiExpansion||0;
 const dim=openingRoom?config.voiceDim*expansion:frame.scene+(config.voiceDim-frame.scene)*expansion;
 if(dim>0){ctx.fillStyle=`rgba(0,0,0,${dim})`;ctx.fillRect(0,0,w,h);}
}
function resizeCanvas(){
 const available=projectionViewport.getBoundingClientRect();
 const frame=StageLayout.fitStage(available.width,available.height);
 visualizerWrap.style.width=frame.width+"px";visualizerWrap.style.height=frame.height+"px";
 dpr=Math.min(window.devicePixelRatio||1,2);
 w=canvas.clientWidth;h=canvas.clientHeight;
 canvas.width=Math.max(1,Math.floor(w*dpr));canvas.height=Math.max(1,Math.floor(h*dpr));
 ctx.setTransform(dpr,0,0,dpr,0,0);cx=w/2;cy=h/2;
 scale=Math.max(.48,Math.min(Math.min(w,h)/760,1));initParticles();
}
function initParticles(){
 particles.length=0;
 for(let i=0;i<PARTICLES;i++)particles.push({a:Math.random()*Math.PI*2,band:Math.random(),
 s:.00012+Math.random()*.00065,size:.45+Math.random()*1.5,alpha:.035+Math.random()*.19});
}
resizeCanvas();
if(window.ResizeObserver)new ResizeObserver(resizeCanvas).observe(projectionViewport);

function freqToBin(freq){
 if(!analyser||!audioCtx)return 0;
 const nyquist=audioCtx.sampleRate/2;
 return Math.max(0,Math.min(analyser.frequencyBinCount-1,Math.round(freq/nyquist*analyser.frequencyBinCount)));
}
function selectedBins(){
 const lo=freqToBin(freqMin),hi=Math.max(lo+1,freqToBin(freqMax));
 return{lo,hi:Math.min(analyser?analyser.frequencyBinCount-1:hi,hi)};
}

function analyze(){
 if(!analyser||!dataArray)return{avg:0,low:0,mid:0,high:0};
 if(narrationMedia.every(media=>media.paused||media.ended)){
  for(let i=0;i<smooth.length;i++)smooth[i]*=.86;
  return{avg:0,low:0,mid:0,high:0};
 }
 analyser.getByteFrequencyData(dataArray);
 let sum=0,low=0,mid=0,high=0,n=dataArray.length;
 const range=selectedBins(),lo=range.lo,hi=range.hi;
 const span=Math.max(1,hi-lo);
 for(let i=0;i<n;i++){
  const raw=dataArray[i];
  const k=raw>smooth[i] ? .42 : .12;
  smooth[i]+=(raw-smooth[i])*k;
  if(i<lo||i>hi)continue;
  const v=smooth[i];
  sum+=v;
  const p=(i-lo)/span;
  if(p<.30)low+=v;
  else if(p<.65)mid+=v;
  else high+=v;
 }
 const count=Math.max(1,hi-lo+1);
 return{avg:sum/count,low:low/Math.max(1,span*.30),mid:mid/Math.max(1,span*.35),high:high/Math.max(1,span*.35)};
}

function radialPoint(r,a){return{x:cx+r*Math.cos(a),y:cy+r*Math.sin(a)}}
function drawSymmetricRing(r,thickness,alpha,glow){
 ctx.save();ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);
 ctx.strokeStyle=`rgba(255,255,255,${alpha})`;ctx.lineWidth=thickness;
 ctx.shadowBlur=glow*graphicGlowScale;ctx.shadowColor=`rgba(255,255,255,${Math.min(.9,alpha+.16)})`;ctx.stroke();ctx.restore();
}

// Original mirrored, squared-volume wave response; no audio-dependent normalization.
function createCoil(base,amp,alpha,line,blur,phase,bandStart,bandEnd){
 const points=300,arr=[];let radius=0;
 const range=selectedBins(),lo=range.lo,hi=range.hi;
 for(let i=0;i<points;i++){
  const t=i/points;
  const u=t<.5?t*2:(1-t)*2;
  const idx=Math.min(hi,Math.max(lo,Math.floor(lo+(hi-lo)*(bandStart+(bandEnd-bandStart)*u))));
  const idx2=Math.min(hi,Math.max(lo,Math.floor(lo+(hi-lo)*(bandStart+(bandEnd-bandStart)*Math.min(1,u+.018)))));
  const v=Math.max(0,Math.min(1,(smooth[idx]||0)/255));
  const v2=Math.max(0,Math.min(1,(smooth[idx2]||0)/255));
  const volumeSquared=v*v;
  const volumeSquared2=v2*v2;
  const harmonic=volumeSquared*.72+volumeSquared2*.28;
  const detail=.88+.12*Math.sin(u*Math.PI*22+phase);
  const ripple=harmonic*amp*scale*10*detail;
  const fine=(highEnergy/255)**2*3.2*scale*Math.sin(u*Math.PI*54+phase*2.1);
  const bassBend=(bassEnergy/255)**2*amp*.16*scale*Math.sin(u*Math.PI*6+phase*.55);
  const a=t*Math.PI*2-Math.PI/2;
  const r=base+ripple+fine+bassBend;
  radius=Math.max(radius,r);arr.push(radialPoint(r,a));
 }
 return {arr,radius,alpha,line,blur};
}
function drawCoil({arr,alpha,line,blur}){
 const points=arr.length;
 ctx.save();ctx.beginPath();ctx.moveTo(arr[0].x,arr[0].y);
 for(let i=0;i<points;i++){const p=arr[i],q=arr[(i+1)%points];ctx.quadraticCurveTo(p.x,p.y,(p.x+q.x)/2,(p.y+q.y)/2)}
 ctx.closePath();ctx.strokeStyle=`rgba(255,255,255,${alpha})`;ctx.lineWidth=line;ctx.shadowBlur=blur*graphicGlowScale;ctx.shadowColor=`rgba(255,255,255,${Math.min(1,alpha+.22)})`;ctx.stroke();ctx.restore();
}
function createCoils(base,phase){
 const coils=[
  createCoil(base,52,.045,8,28,phase,.00,.72),
  createCoil(base+2*scale,45,.075,5,20,phase*1.08+.8,.04,.78),
  createCoil(base-1*scale,39,.18,3,13,phase*1.22+1.5,.08,.84),
  createCoil(base-4*scale,34,.72,1.7,7,phase*1.45+2.7,.02,.90)
 ];
 return coils;
}

function drawBassArcs(radius,audio,phase){
 const bass=Math.pow(Math.min(1,audio.low/255),2);
 ctx.save();ctx.lineCap="round";
 for(let j=0;j<3;j++){
  ctx.beginPath();
  const arcRadius=radius+(j-1)*5*scale;
  const start=phase*.55+j*Math.PI*2/3;
  const span=.55+bass*1.05;
  ctx.arc(cx,cy,arcRadius,start,start+span);
  ctx.strokeStyle=`rgba(255,255,255,${.08+bass*.16-j*.018})`;
  ctx.lineWidth=(1.2+j*.7)*scale;ctx.shadowBlur=(5+bass*15)*scale*graphicGlowScale;ctx.shadowColor="rgba(255,255,255,.55)";ctx.stroke();
 }
 ctx.restore();
}

function updateHexRotation(now){
 if(!rotationMoving&&now-rotationMoveStart>=ROTATE_INTERVAL){rotationMoving=true;rotationStart=rotation;rotationTarget=rotation+ROTATE_STEP;rotationMoveStart=now}
 if(rotationMoving){
  const p=Math.max(0,Math.min(1,(now-rotationMoveStart)/ROTATE_DURATION));
  const eased=1-Math.pow(1-p,5);
  rotation=rotationStart+(rotationTarget-rotationStart)*eased;
  if(p>=1){rotation=rotationTarget;rotationMoving=false;rotationMoveStart=now}
 }
}

function drawHex(radius,rot,audio){
 ctx.save();ctx.translate(cx,cy);ctx.rotate(rot);
 const def=[];
 const range=selectedBins(),lo=range.lo,hi=range.hi;
 for(let i=0;i<6;i++){
  const band=Math.floor(lo+(i/6)*Math.max(1,(hi-lo)*.30));
  const v=Math.max(0,Math.min(1,(smooth[Math.min(hi,band)]||0)/255));
  def[i]=(v*v)*12*scale*(.7+(audio.low/255)**2*.8);
 }
 ctx.beginPath();
 for(let i=0;i<6;i++){const a=i*Math.PI/3-Math.PI/2,r=radius+def[i],x=r*Math.cos(a),y=r*Math.sin(a);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}
 ctx.closePath();
 const bright=Math.min(1,.24+energy*.76);
 ctx.shadowBlur=(18+energy*24)*scale*graphicGlowScale;ctx.shadowColor=`rgba(255,255,255,${bright})`;ctx.fillStyle=`rgba(255,255,255,${bright})`;ctx.fill();ctx.shadowBlur=0;
 ctx.beginPath();
 for(let i=0;i<6;i++){const a=i*Math.PI/3-Math.PI/2,r=radius*.76+def[i]*.45,x=r*Math.cos(a),y=r*Math.sin(a);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}
 ctx.closePath();ctx.fillStyle="rgba(5,5,5,.9)";ctx.fill();
 const hexVolume=Math.max(0,Math.min(1,energy));
 const edgeWidth=(1.2+hexVolume*136)*scale;
 ctx.strokeStyle=`rgba(255,255,255,${.2+hexVolume*.55})`;ctx.lineWidth=edgeWidth;ctx.stroke();
 const core=(3+energy*7+audio.high/255*2)*scale;
 ctx.beginPath();ctx.arc(0,0,core,0,Math.PI*2);ctx.fillStyle=`rgba(255,255,255,${.35+energy*.65})`;ctx.shadowBlur=10*scale*graphicGlowScale;ctx.shadowColor="rgba(255,255,255,.8)";ctx.fill();
 ctx.restore();
}

function drawOuterHex(radius,rot,audio){
 const outerScale=1.52+Math.pow(Math.min(1,energy),2)*.48;
 const outerRadius=radius*outerScale;
 const outerDef=(audio.low/255)**2*8*scale;
 ctx.save();ctx.translate(cx,cy);ctx.rotate(rot);ctx.beginPath();
 for(let i=0;i<6;i++){const a=i*Math.PI/3-Math.PI/2,r=outerRadius+outerDef,x=r*Math.cos(a),y=r*Math.sin(a);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}
 ctx.closePath();ctx.strokeStyle=`rgba(255,255,255,${.16+energy*.30})`;ctx.lineWidth=(1.1+energy*3.2)*scale;ctx.shadowBlur=(7+energy*12)*scale*graphicGlowScale;ctx.shadowColor="rgba(255,255,255,.65)";ctx.stroke();ctx.restore();
}

function drawParticles(audio,coreRadius){
 for(const p of particles){
  if(!audioElement.paused&&!audioElement.ended)p.a+=p.s*16;
  // Fixed annulus beyond the whole core, with a gap even at maximum dot size.
  const r=coreRadius+6*scale+p.band*Math.min(w,h)*.055;
  const x=cx+Math.cos(p.a)*r,y=cy+Math.sin(p.a)*r;
  ctx.beginPath();ctx.arc(x,y,p.size+(audio.high/255)*.6,0,Math.PI*2);ctx.fillStyle=`rgba(255,255,255,${Math.min(.5,p.alpha*(.3+energy*2.1))})`;ctx.fill();
 }
}
// Seven-segment electronic clock: no circular frame or caption below the digits.
const DIGITAL_SEGMENTS=[
 // a, b, c, d, e, f, g
 [[8,2],[40,2],[34,9],[14,9]],
 [[42,5],[46,9],[46,36],[41,40],[38,35],[38,14]],
 [[41,44],[46,48],[46,75],[42,79],[38,70],[38,49]],
 [[14,75],[34,75],[40,82],[8,82]],
 [[6,44],[10,49],[10,70],[6,79],[2,75],[2,48]],
 [[6,5],[10,14],[10,35],[6,40],[2,36],[2,9]],
 [[12,38],[36,38],[40,42],[36,46],[12,46],[8,42]]
];
const DIGITAL_DIGITS={
 "0":[0,1,2,3,4,5],"1":[1,2],"2":[0,1,6,4,3],
 "3":[0,1,6,2,3],"4":[5,6,1,2],"5":[0,5,6,2,3],
 "6":[0,5,6,4,2,3],"7":[0,1,2],"8":[0,1,2,3,4,5,6],
 "9":[0,1,2,3,5,6]
};
function drawDigitalDigit(character,x){
 const enabled=DIGITAL_DIGITS[character]||[];
 ctx.save();
 ctx.translate(x,0);
 // An unlit grey "8" remains underneath each illuminated numeral.
 for(let pass=0;pass<2;pass++){
  for(let i=0;i<DIGITAL_SEGMENTS.length;i++){
   if(pass===1&&!enabled.includes(i))continue;
   const vertices=DIGITAL_SEGMENTS[i];
   ctx.beginPath();
   ctx.moveTo(vertices[0][0],vertices[0][1]);
   for(let j=1;j<vertices.length;j++)ctx.lineTo(vertices[j][0],vertices[j][1]);
   ctx.closePath();
   ctx.fillStyle=pass===0?"rgba(125,130,136,.28)":"rgba(241,250,255,.97)";
   ctx.shadowBlur=pass===0?0:6;
   ctx.shadowColor="rgba(190,231,255,.58)";
   ctx.fill();
  }
 }
 ctx.restore();
}
function drawTimerFace(unit,remainingMs){
 const time=StageOpening.formatTime(remainingMs);
 // Clock coordinates are 236 wide by 84 high, with the colon between digits.
 ctx.save();
 ctx.scale(unit,unit);
 ctx.translate(-118,-42);
 drawDigitalDigit(time[0],0);
 drawDigitalDigit(time[1],56);
 drawDigitalDigit(time[3],132);
 drawDigitalDigit(time[4],188);
 for(const y of [28,56]){
  ctx.beginPath();ctx.arc(118,y,3.7,0,Math.PI*2);
  ctx.fillStyle="rgba(125,130,136,.28)";
  ctx.shadowBlur=0;
  ctx.fill();
  ctx.beginPath();ctx.arc(118,y,3.7,0,Math.PI*2);
  ctx.fillStyle="rgba(241,250,255,.97)";
  ctx.shadowBlur=6;
  ctx.shadowColor="rgba(190,231,255,.58)";
  ctx.fill();
 }
 ctx.restore();
}
function graphicPlacement(frame,radius){
 const openingRoom=!frame.background||frame.background==="opening";
 const selection=frame.script||frame.caption?.startsWith("vote-");
 const progress=openingRoom?(frame.script&&!frame.voiceGroup?0:frame.scene):frame.aiExpansion||0;
 const home=StageLayout.projectImageRegion(w,h,backgroundImage.naturalWidth,backgroundImage.naturalHeight,config.roomScreen);
 if(!openingRoom){home.x=w*config.idleShape.x-home.width/2;home.y=h*config.idleShape.y-home.height/2;}
 const full={x:w*.04,y:h*(selection ? .02 : .05),width:w*.92,height:h*(selection ? .76 : .9)};
 const foreground={x:full.x+full.width*(1-config.voiceGraphicScale)/2,
  y:full.y+full.height*(1-config.voiceGraphicScale)/2,
  width:full.width*config.voiceGraphicScale,height:full.height*config.voiceGraphicScale};
 const pose=StageLayout.expandGraphicPose(home,foreground,radius,progress,
  config.roomScreen.inset*home.width/config.roomScreen.width);
 if(frame.script&&frame.voteCorner>0){
  // Entire AI visual, including particle and waveform geometry, scales together.
  const large=StageLayout.expandGraphicPose(home,foreground,radius,1,
   config.roomScreen.inset*home.width/config.roomScreen.width);
  const p=frame.voteCorner,lerp=(a,b)=>a+(b-a)*p;
  return {x:lerp(pose.x,w*.82),y:lerp(pose.y,h*.72),
   scale:lerp(pose.scale,large.scale*.5),clip:p>=.999?null:pose.clip};
 }
 return pose;
}
function clockPlacement(frame){
 const unit=Math.min(w,h)*.23*.012;
 if(frame.background&&frame.background!=="opening"){
  const p=frame.script?(frame.voteCorner||0):0;
  return {x:w*(config.idleShape.x*(1-p)+.5*p),
   y:h*(config.idleShape.y*(1-p)+.5*p),
   scale:unit*config.idleShape.size*(1+.55*p),clip:null};
 }
 const screen=StageLayout.projectImageRegion(w,h,backgroundImage.naturalWidth,backgroundImage.naturalHeight,config.roomScreen);
 const rest=StageLayout.fitRectGraphic(screen,236,84,config.roomScreen.inset*screen.width/config.roomScreen.width);
 const p=frame.script&&!frame.voiceGroup?0:frame.scene,lerp=(a,b)=>a+(b-a)*p;
 return {x:lerp(rest.x,cx),y:lerp(rest.y,cy),scale:lerp(rest.scale,unit),
  clip:{x:lerp(rest.clip.x,0),y:lerp(rest.clip.y,0),width:lerp(rest.clip.width,w),height:lerp(rest.clip.height,h)}};
}
function draw(){
 requestAnimationFrame(draw);
 const now=performance.now();opening.getRemainingMs();updateTransitions(now);
 const frame=projectionFrame();
 // Complete blackout includes the room, clock, card and letterbox pixels.
 // The audio-owned deadline continues even while nothing is projected.
 // Cue 0 deliberately shows the supplied blue-tinted Start_dark.PNG room.
 // Explicit blackouts still cover the full frame with real black.
 if(frame.blackout===1){
  ctx.fillStyle="#000";ctx.fillRect(0,0,w,h);return;
 }
 const a=analyze(),target=Math.min(1,a.avg/68);
 energy+=(target-energy)*.15;bassEnergy+=(a.low-bassEnergy)*.20;
 midEnergy+=(a.mid-midEnergy)*.16;highEnergy+=(a.high-highEnergy)*.25;
 const beat=Math.max(0,target-energy);pulse+=(beat*58+energy*20+(bassEnergy/255)**2*10-pulse)*.22;
 updateHexRotation(now);drawBackground(now,frame);
 // Script mode follows the exact prop reveal; scene mode exposes independent operator cues.
 // Subtitles are a separate overlay and remain controlled by the operator.
 const photoSide=frame.script?frame.photoSide:
  (frame.caption==="memory-photo-front"?"front":frame.caption==="memory-photo-back"?"back":null);
 const photo=photoSide&&frame.background==="memory"?framePhotoImages[photoSide]:null;
 if(photo?.complete&&photo.naturalWidth&&photo.naturalHeight&&frame.room){
  ctx.save();ctx.fillStyle="rgba(0,0,0,.82)";ctx.fillRect(0,0,w,h);
  const width=Math.min(w*.76,h*.86*photo.naturalWidth/photo.naturalHeight);
  const height=width*photo.naturalHeight/photo.naturalWidth;
  ctx.shadowColor="rgba(0,0,0,.6)";ctx.shadowBlur=Math.min(w,h)*.035;
  ctx.drawImage(photo,(w-width)/2,(h-height)/2,width,height);
  ctx.restore();
  return;
 }
 // The bright room also remains empty until the separate AI fade-in cue.
 if(!frame.room||(!frame.script&&!frame.preview&&frame.background==="opening"&&roomHandoffProgress(now)<1))return;
 const hexR=Math.min(w,h)*.105+energy*10*scale;
 const waveBase=Math.min(w,h)*.2;
 const ringR=frame.background==="memory"?waveBase+Math.min(w,h)*.075:waveBase-4*scale;
 const morph=frame.clock;
 const graphicOpacity=frame.ai*(1-easeInOutCubic(Math.min(1,morph/.55))*(1-(frame.voteCorner||0)));
 const clockOpacity=easeInOutCubic(Math.max(0,Math.min(1,(morph-.55)/.45)));
 if(graphicOpacity>0){
  const coils=createCoils(waveBase,now*.00045);
  // Camera scale depends only on the stage and cue, never on audio samples.
  // Reserve the core stroke margin once; particles orbit beyond this boundary.
  const radius=Math.max(ringR+10*scale,waveBase+16*scale,Math.min(w,h)*.105*1.52+3*scale)+2*scale;
  const pose=graphicPlacement(frame,radius);
  const clip=pose.clip;
  // Waves keep their fixed base and full amplitude; only the canvas crops them.
  ctx.save();
  ctx.translate(pose.x,pose.y);ctx.scale(pose.scale,pose.scale);ctx.translate(-cx,-cy);
  ctx.globalAlpha=graphicOpacity;graphicGlowScale=pose.scale*dpr;
  drawParticles(a,radius);
  for(const coil of coils)drawCoil(coil);
  ctx.restore();
  ctx.save();
  if(clip){ctx.beginPath();ctx.rect(clip.x,clip.y,clip.width,clip.height);ctx.clip();}
  ctx.translate(pose.x,pose.y);ctx.scale(pose.scale,pose.scale);ctx.translate(-cx,-cy);
  ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.clip();
  ctx.globalAlpha=graphicOpacity;graphicGlowScale=clip?pose.scale*dpr:1;
  drawSymmetricRing(ringR,1+energy*1.8,.08+energy*.15,energy*9*scale);
  drawSymmetricRing(ringR+8*scale,1,.025+energy*.065,energy*5*scale);
  drawBassArcs(ringR+3*scale,a,now*.00065);
  drawOuterHex(hexR,rotation,a);drawHex(hexR,rotation,a);
  ctx.restore();graphicGlowScale=1;
 }
 if(clockOpacity>0 && !(frame.script && transcript?.entry?.act==='III') && !(frame.caption?.startsWith("vote-"))){
  const pose=clockPlacement(frame);
  ctx.save();
  if(pose.clip){ctx.beginPath();ctx.rect(pose.clip.x,pose.clip.y,pose.clip.width,pose.clip.height);ctx.clip();}
  ctx.translate(pose.x,pose.y);
  const remaining=frame.script?transcript.remaining(frame.timer):frame.timer==="selection"?(frame.preview?config.voting.durationMs:stage.voting.getRemainingMs()):opening.getRemainingMs();
  ctx.globalAlpha=clockOpacity;drawTimerFace(pose.scale,remaining);ctx.restore();
 }
 if(cardReady&&frame.card>0){
  const width=Math.min(w*.8,h*(frame.script ? .48 : .6)),height=width*cardImage.naturalHeight/cardImage.naturalWidth;
  ctx.save();ctx.globalAlpha=frame.card;ctx.shadowColor="rgba(0,0,0,.6)";ctx.shadowBlur=24;
  ctx.drawImage(cardImage,(w-width)/2,h*(frame.script ? .68 : .72)-height/2,width,height);ctx.restore();
 }
 if(frame.flash>0){ctx.fillStyle=`rgba(255,255,255,${Math.min(.3,frame.flash*.3)})`;ctx.fillRect(0,0,w,h);}
 if(frame.blackout>0){
  ctx.fillStyle=`rgba(0,0,0,${frame.blackout})`;ctx.fillRect(0,0,w,h);
 }
}
requestAnimationFrame(draw);
