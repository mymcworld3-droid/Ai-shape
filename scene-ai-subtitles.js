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
 // A recording starts the first caption. The operator, not elapsed audio
 // time, decides when to advance or rewind all subsequent sentences.
 // When a recording finishes, keep its last selected caption visible until
 // the operator moves to another cue.
 function mount({entries,media,renderer,isStarted=()=>true}){
  const groups=groupedAiLines(entries);
  const subscriptions=[];
  let currentGroup=null,index=0,current=null;
  function display(){
   const entry=currentGroup?groups[currentGroup]?.[index]??null:null;
   if((entry?.id??null)!==current){
    current=entry?.id??null;
    renderer.render(entry);
   }
   return entry;
  }
  function clear(){
   currentGroup=null;index=0;display();
  }
  function findPlaying(){
   if(!isStarted())return null;
   for(const [group,audio] of Object.entries(media)){
    if(!groups[group]?.length||!audio||audio.paused||audio.ended)continue;
    return group;
   }
   return null;
  }
  function sync(){
   if(!isStarted()){clear();return null;}
   const playing=findPlaying();
   if(playing&&currentGroup!==playing){currentGroup=playing;index=0;}
   else if(currentGroup){
    const audio=media[currentGroup];
    // A deliberate pause/rewind removes the caption; a normal "ended" event
    // does not discard text while the operator is still on this cue.
    if(!audio||audio.paused&&!audio.ended)clear();
   }
   return display();
  }
  function next(){
   sync();
   if(!currentGroup)return false;
   const lines=groups[currentGroup];
   if(index>=lines.length-1)return false;
   index++;display();return true;
  }
  function previous(){
   sync();
   if(!currentGroup||index<=0)return false;
   index--;display();return true;
  }
  function clearCompleted(){
   if(currentGroup&&media[currentGroup]?.ended)clear();
  }
  for(const audio of Object.values(media))if(audio){
   for(const event of ["play","playing","pause","ended","emptied"]){
    audio.addEventListener(event,sync);subscriptions.push([audio,event,sync]);
   }
  }
  return {sync,next,previous,clear,clearCompleted,
   get group(){return currentGroup;},
   get index(){return index;},
   destroy(){
    for(const [audio,event,listener] of subscriptions)audio.removeEventListener(event,listener);
    clear();
   }};
 }
 return {GROUPS,groupedAiLines,mount};
});
