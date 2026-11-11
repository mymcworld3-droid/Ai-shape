(function(root,factory){
 "use strict";
 const api=factory();
 if(typeof module==="object"&&module.exports)module.exports=api;
 else root.SceneAiSubtitles=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const GROUPS=Object.freeze({
  opening:"opening",memory:"memory",prompt:"prompt",one:"one",
  two:"two",final:"final",complete:"complete",revealTruth:"revealTruth"
 });
 function groupedAiLines(entries){
  const groups={};
  for(const entry of entries){
   if(entry.speaker!=="AI VOICE"||!GROUPS[entry.group]||!entry.text)continue;
   (groups[entry.group]??=[]).push(entry);
  }
  return groups;
 }
 // The condensed scene mode splits each recording into approximate
 // sentence-sized captions, advanced by the actual audio playback position.
 // The step-by-step script mode retains the operator's manual subtitles.
 function subtitleAtTime(entries,time,duration){
  if(!entries?.length)return null;
  if(entries.length===1||!Number.isFinite(duration)||duration<=0)return entries[0];
  const weights=entries.map(entry=>{
   const words=entry.text.trim().split(/\s+/).length;
   return Math.max(1,words*.92+.65+(/[.!?…]$/.test(entry.text.trim())?.15:0));
  });
  const total=weights.reduce((a,b)=>a+b,0);
  const progress=Math.max(0,Math.min(.999999,Number.isFinite(time)?time/duration:0));
  let accumulated=0;
  for(let i=0;i<entries.length;i++){
   accumulated+=weights[i]/total;
   if(progress<accumulated)return entries[i];
  }
  return entries.at(-1);
 }
 function mount({entries,media,renderer,isStarted=()=>true}){
  const groups=groupedAiLines(entries);
  const subscriptions=[];
  let current=null;
  const active=()=>{
   if(!isStarted())return null;
   for(const [group,audio] of Object.entries(media)){
    if(!groups[group]?.length||!audio||audio.paused||audio.ended)continue;
    return {group,audio};
   }
   return null;
  };
  const sync=()=>{
   const playing=active();
   const entry=playing?subtitleAtTime(groups[playing.group],playing.audio.currentTime,playing.audio.duration):null;
   if((entry?.id??null)!==current){current=entry?.id??null;renderer.render(entry);}
   return entry;
  };
  for(const audio of Object.values(media))if(audio){
   for(const event of ["play","playing","timeupdate","seeked","pause","ended","loadedmetadata","durationchange","emptied"]){
    audio.addEventListener(event,sync);subscriptions.push([audio,event]);
   }
  }
  return {sync,destroy(){
   for(const [audio,event] of subscriptions)audio.removeEventListener(event,sync);
   current=null;renderer.render(null);
  }};
 }
 return {GROUPS,groupedAiLines,subtitleAtTime,mount};
});
