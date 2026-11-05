'use strict';
if(scriptMode){
 const subtitleRenderer=new SubtitleMotion.Renderer({element:document.getElementById('subtitles')});
 const subtitlePrevious=document.getElementById('subtitlePrevious');
 const subtitleNext=document.getElementById('subtitleNext');
 const renderAdjacentLines=entry=>{
  // Only active spoken cues show previous/next; no spoilers on preview or blackout.
  const visible=startGate.started&&Boolean(entry?.text?.trim());
  const pair=visible?SubtitleMotion.spokenNeighbors(SHOW_SCRIPT.entries,transcript.index):
   {previous:null,next:null};
  for(const [node,neighbor] of [[subtitlePrevious,pair.previous],[subtitleNext,pair.next]]){
   node.hidden=!neighbor;
   node.textContent=neighbor?(neighbor.speaker?neighbor.speaker+': ':'')+neighbor.text:'';
  }
 };
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
 let previewEntry=null,flashUntil=0;
 // Immutable script IDs avoid coupling the visual effect to mutable step counts.
 const cornerStart=SHOW_SCRIPT.entries.findIndex(e=>e.id==='p389-0');
 const cornerEnd=SHOW_SCRIPT.entries.findIndex(e=>e.id==='p408-0');
 if(cornerStart<0||cornerEnd<0)throw Error('Voting cue boundaries unavailable');
 const votingState=entry=>{
  const index=SHOW_SCRIPT.entries.indexOf(entry);
  return {hideBackground:index>=cornerStart,
   corner:index>=cornerStart&&index<cornerEnd&&entry.action!=='blackout'};
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
    else{values.ai=0;values.aiExpansion=0;if(['prompt','one','two'].includes(entry.group))values.clock=1;}
   }
  }
  // Both the AI and the clock stay present at every voting cue, even when
  // a narration starts/ends. Only the dedicated blackout conceals both.
  values.voteCorner=voteState.corner?1:0;
  if(voteState.corner){values.ai=1;values.clock=1;values.aiExpansion=1;}
  const duration=direction<=0||!startGate.started||transcript?.index===0||['opening-dark','end-blackout'].includes(entry.action)?0:entry.action==='ending-light'?2200:entry.action?.includes('blackout')?1200:entry.action==='ai'?1500:600;
  for(const name of Object.keys(transitions))animate(name,values[name]||0,duration);
  subtitleRenderer.render(entry);
  renderAdjacentLines(entry);
  // The flash is triggered only on operator input; AI callbacks do not replay it.
 };
 transcript=new ScriptShow.Controller({entries:SHOW_SCRIPT.entries,voices,effects,video:revealVideo,
  onEntry(entry,{direction,index,starting}){
   document.body.dataset.musicError='false';
   actOneMusic.setStep(entry.paragraph);
   applyEntry(entry,starting&&index>0?0:direction);
   if(entry.action==='selection-button'&&direction>0&&startGate.started)flashUntil=performance.now()+280;
  },
  onVoice(group,state){document.body.dataset.scriptVoice=group+':'+state;
   if(state==='starting'&&voices[group])prepareAudio(voices[group]);
   if(transcript?.entry?.group===group)applyEntry(transcript.entry);},
  onVideo(playing){scriptVideoPlaying=playing;},
  onError(kind,error){document.body.dataset.scriptMediaError=kind;console.error('[Script]',kind,error);}
 });
 window.scriptShow=transcript;
 window.scriptProjectionFrame=()=>{
  const entry=startGate.started?transcript.entry:previewEntry;
  if(!entry)return null;
  return {...entry.look,voiceGroup:entry.group,preview:!startGate.started,caption:null,script:true,
   hideBackground:votingState(entry).hideBackground,
   ...Object.fromEntries(Object.entries(transitions).map(([name,t])=>[name,t.value])),
   flash:Math.max(0,(flashUntil-performance.now())/280)};
 };
 window.previewScriptEntry=index=>{if(startGate.started)return;previewEntry=SHOW_SCRIPT.entries[index]||null;
  if(previewEntry)applyEntry(previewEntry,0);
  else{subtitleRenderer.render(null);renderAdjacentLines(null);} };
}
