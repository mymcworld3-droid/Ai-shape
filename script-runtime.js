'use strict';
if(scriptMode){
 const subtitleRenderer=new SubtitleMotion.Renderer({element:document.getElementById('subtitles')});
 const voices={opening:audioElement,memory:memoryAudio,...selectionAudio};
 for(const name of ['complete','revealTruth']){
  const media=document.createElement('audio');media.id=name+'Audio';media.preload='auto';media.hidden=true;
  visualizerWrap.append(media);narrationMedia.push(media);
  if(config.ending[name]){media.src=config.ending[name];media.load();}
  voices[name]=config.ending[name]?media:null;
 }
 for(const name of ['prompt','one','two','final'])if(!config.voting[name])voices[name]=null;
 const effects={doorKick:effectElement};
 for(const [name,path] of Object.entries({doorOpen:config.scriptEffects.doorOpen,timerClick:config.scriptEffects.timerClick,
  'selection-button':config.scriptEffects.selectionButton,memoryClick:config.memory.lightClick,officeBang:config.office.bang})){
  const media=document.createElement('audio');media.id='scriptEffect-'+name;media.hidden=true;media.preload='auto';visualizerWrap.append(media);
  if(path){media.src=path;media.load();effects[name]=media;}
 }
 // The Act I soundtrack follows fixed manuscript paragraphs, not mutable cue numbers. Two hidden elements
 // overlap for 1.4s only while crossfading; the second is not an extra song.
 const actOneMusic=new ActOneMusic.Controller({
  audio:document.getElementById('actOneBgm'),
  alternateAudio:document.getElementById('actOneBgmAlt'),
  tracks:config.actOneMusic,
  fadeMs:1400,
  fadeOutMs:1100,
  onError(error){document.body.dataset.musicError='true';console.error('[Act I BGM]',error);}
 });
 window.actOneBackgroundMusic=actOneMusic;
 applyVolumes(); // Include ending voices and newly constructed scripted effects.
 let previewEntry=null,scriptPreviewAiStartedAt=null,flashUntil=0;
 // Immutable script IDs avoid coupling the visual effect to mutable step counts.
 const cornerStart=SUBTITLE_SCRIPT.entries.findIndex(e=>e.id==='p389-0');
 const backgroundStart=SUBTITLE_SCRIPT.entries.findIndex(e=>e.id==='p407-0');
 const backgroundEnd=SUBTITLE_SCRIPT.entries.findIndex(e=>e.id==='p408-0');
 const finalShapeStart=SUBTITLE_SCRIPT.entries.findIndex(e=>e.id==='p409-0');
 const finalShapeEnd=SUBTITLE_SCRIPT.entries.findLastIndex(e=>e.group==='revealTruth');
 if([cornerStart,backgroundStart,backgroundEnd,finalShapeStart,finalShapeEnd].some(i=>i<0))
  throw Error('Voting cue boundaries unavailable');
 const votingState=entry=>{
  const index=SUBTITLE_SCRIPT.entries.indexOf(entry);
  // Stages 380–381 are the background-only reveal; after 381, return to black.
  const backgroundOnly=index>=backgroundStart&&index<=backgroundEnd;
  const finalShape=index>=finalShapeStart&&index<=finalShapeEnd;
  return {hideBackground:index>=cornerStart&&!backgroundOnly,
   backgroundOnly,finalShape,
   corner:index>=cornerStart&&index<backgroundStart&&entry.action!=='blackout'};
 };
 const frontStart=SUBTITLE_SCRIPT.entries.findIndex(e=>e.id==='p122-2');
 const backStart=SUBTITLE_SCRIPT.entries.findIndex(e=>e.id==='p137-0');
 const frontReturn=SUBTITLE_SCRIPT.entries.findIndex(e=>e.id==='p143-0');
 const photoEnd=SUBTITLE_SCRIPT.entries.findIndex(e=>e.id==='p149-0');
 const photoForEntry=entry=>{
  const i=SUBTITLE_SCRIPT.entries.indexOf(entry);
  if(frontStart<0||backStart<0||frontReturn<0||photoEnd<0)return null;
  if(i>=frontStart&&i<backStart)return 'front';
  if(i>=backStart&&i<frontReturn)return 'back';
  if(i>=frontReturn&&i<photoEnd)return 'front';
  return null;
 };
 const applyEntry=(entry,direction=1)=>{
  if(!entry)return;
  document.body.dataset.scene=entry.look.background;
  document.body.dataset.scriptIndex=String(transcript?.index??-1);
  document.body.dataset.scriptParagraph=String(entry.paragraph);
  document.body.dataset.scriptAction=entry.action||'';
  document.body.dataset.cue='script-'+entry.id;
  const active=transcript?.active;
  const speaking=entry.group&&(!startGate.started||active?.group===entry.group&&['starting','playing','missing'].includes(active.state));
  const values={...entry.look},voteState=votingState(entry);
  if(entry.group){
   if(speaking){values.ai=1;if(entry.group==='opening')values.scene=1;else values.aiExpansion=1;}
   else if(active?.state==='finished'||active?.state==='error'){
    // After the final reveal voice, keep its dark AI scene on screen.
    // The next manual cue cuts directly to black; never flash the lit room.
    if(entry.group==='revealTruth'){values.ai=1;values.aiExpansion=1;}
    else if(entry.group==='opening')values.scene=0;
    else{values.ai=0;values.aiExpansion=0;}
   }
  }
  // Act III is untimed. Preserve the script's AI and voting stage directions,
  // but never render the clock, even during speech completion or rewinding.
  if(['p384-0','p388-0'].includes(entry.id)){
   values.ai=1;values.aiExpansion=1;
  }
  values.voteCorner=voteState.corner?1:0;
  if(voteState.corner){values.ai=1;values.aiExpansion=1;}
  if(voteState.backgroundOnly){
   // The memory room appears alone in steps 380–381.
   values.ai=0;values.clock=0;values.card=0;values.vote=0;values.aiExpansion=0;
  }
  if(voteState.finalShape){
   // Keep the final AI artwork alive after either AI recording finishes.
   values.ai=1;values.aiExpansion=1;
   values.clock=0;values.card=0;values.vote=0;values.voteCorner=0;
  }
  if(entry.act==='III')values.clock=0;
  // Step 0 keeps the blue room image but reduces projector output to 5%.
  // There is no subtitle, timer, music or sound until the first real cue.
  if(entry.id==='pre-show'){
   values.room=false;values.blackout=0;values.ai=0;values.clock=0;
  }
  const duration=direction<=0||!startGate.started||transcript?.index===0||
   (entry.act==='I'&&entry.paragraph<=22&&values.blackout===1)||
   ['opening-dark','end-blackout'].includes(entry.action)?0:entry.action==='ending-light'?2200:entry.action?.includes('blackout')?1200:entry.action==='ai'?1500:600;
  for(const name of Object.keys(transitions))animate(name,values[name]||0,duration);
  subtitleRenderer.render(entry);
  // The flash is triggered only on operator input; AI callbacks do not replay it.
 };
 transcript=new ScriptShow.Controller({entries:SUBTITLE_SCRIPT.entries,voices,effects,video:revealVideo,
  onEntry(entry,{direction,index,starting}){
   document.body.dataset.musicError='false';
   actOneMusic.setStep(entry.paragraph);
   // The AI reveal itself is an animated cue even when rehearsal begins here.
   // Other direct rehearsal jumps continue to render without a transition.
   if(starting&&entry.action==='ai')animate('ai',0,0);
   applyEntry(entry,starting&&index>0&&entry.action!=='ai'?0:direction);
   endCredits.show(entry.action);
   syncBehindScenes(entry.action==='behind-the-scenes');
   if(entry.action==='selection-button'&&direction>0&&startGate.started)flashUntil=performance.now()+280;
  },
  onVoice(group,state){document.body.dataset.scriptVoice=group+':'+state;
   if(state==='playing')completeAudioRecovery(group);
   if(state==='starting'&&voices[group])prepareAudio(voices[group]);
   if(transcript?.entry?.group===group)applyEntry(transcript.entry);},
  onVideo(playing){
   if(playing){scriptRevealHandoffAt=null;revealFreezeReady=false;}
   else if(scriptVideoPlaying&&revealVideo.ended)scriptRevealHandoffAt=performance.now();
   scriptVideoPlaying=playing;
  },
  onError(kind,error){document.body.dataset.scriptMediaError=kind;
   scheduleAudioRecovery(kind,error);console.error('[Script]',kind,error);}
 });
 window.scriptShow=transcript;
 window.scriptProjectionFrame=()=>{
  const entry=startGate.started?transcript.entry:previewEntry;
  if(!entry)return {...StageLayout.previewFrame("dark"),script:true,preview:true,caption:null,cueZero:true};
  const visualValues=Object.fromEntries(Object.entries(transitions).map(([name,t])=>[name,t.value]));
  // Silent script-step previews must fade as well. Do not consume the fade
  // before the projector background finishes loading.
  if(!startGate.started&&entry.action==='ai'){
   if(backgroundReady&&scriptPreviewAiStartedAt===null)scriptPreviewAiStartedAt=performance.now();
   visualValues.ai=scriptPreviewAiStartedAt===null?0:
    StageLayout.fadeInProgress(performance.now()-scriptPreviewAiStartedAt,config.aiFadeMs);
  }
  return {...entry.look,voiceGroup:entry.group,preview:!startGate.started,caption:null,script:true,
   photoSide:photoForEntry(entry),
   cueZero:entry.id==='pre-show',
   hideBackground:votingState(entry).hideBackground,
   backgroundOnly:votingState(entry).backgroundOnly,
   finalShape:votingState(entry).finalShape,
   ...visualValues,
   flash:Math.max(0,(flashUntil-performance.now())/280)};
 };
 window.previewScriptEntry=index=>{if(startGate.started)return;previewEntry=SUBTITLE_SCRIPT.entries[index]||null;
  scriptPreviewAiStartedAt=null;
  if(previewEntry)applyEntry(previewEntry,0);
  else subtitleRenderer.render(null);
  endCredits.show(previewEntry?.action||null,{isPreview:true});};
}

// Scene-mode narration uses the same original AI VOICE sentences, but only
// the operator's Next/Previous input changes the displayed line.
// The recording continues uninterrupted while the text is switched manually.
if(!scriptMode){
 const activeSceneNarrationCues=new Set(["welcome","clock","memory-welcome",
  "vote-prompt","vote-one","vote-two","vote-final","ending-complete","ending-reveal"]);
 const renderer=new SubtitleMotion.Renderer({element:document.getElementById("subtitles")});
 window.sceneVoiceSubtitles=SceneAiSubtitles.mount({
  entries:SHOW_SCRIPT.entries,
  media:{opening:audioElement,memory:memoryAudio,
   prompt:selectionAudio.prompt,one:selectionAudio.one,
   two:selectionAudio.two,final:selectionAudio.final,
   complete:endingCompleteAudio,revealTruth:endingRevealAudio},
  // Silent narration priming at Start is not an AI scene. The projector's
  // first Next must reveal the room, never consume an invisible AI caption.
  renderer,isStarted:()=>startGate.started&&!remoteAudioPreparing&&activeSceneNarrationCues.has(stage.state)
 });
}
