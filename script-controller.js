(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ScriptShow=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 class Controller {
  constructor({entries,voices={},effects={},video=null,now=()=>performance.now(),onEntry=()=>{},onVoice=()=>{},onError=()=>{},onVideo=()=>{}}){
   Object.assign(this,{entries,voices,effects,video,now,onEntry,onVoice,onError,onVideo});
   this.index=-1;this.started=false;this.deadlines={opening:null,selection:null};this.active=null;this.token=0;this.listeners=[];
   for(const [group,media] of Object.entries(voices))if(media){
    const ended=()=>{if(this.active?.media===media&&media.ended&&['starting','playing'].includes(this.active.state))this.finish(group);};
    const error=()=>{if(this.active?.media===media)this.fail(group,new Error('Voice unavailable: '+group));};
    media.addEventListener('ended',ended);media.addEventListener('error',error);this.listeners.push([media,ended,error]);
   }
   if(video){this.videoEnd=()=>{if(video.ended)this.onVideo(false);};video.addEventListener('ended',this.videoEnd);}
  }
  get entry(){return this.entries[this.index]||null;}
  remaining(kind){const duration=kind==='selection'?60000:900000;return this.deadlines[kind]===null?duration:Math.max(0,this.deadlines[kind]-this.now());}
  start(index=0){
   if(this.started||!Number.isInteger(index)||index<0||index>=this.entries.length)return false;
   this.started=true;this.index=index;
   // A rehearsal jump starts fresh timers rather than elapsing skipped scenes.
   const entry=this.entry,earlier=this.entries.slice(0,index);
   if(earlier.some(e=>e.group==='opening')&&entry.group!=='opening')
    this.deadlines.opening=this.now()+900000;
   if(earlier.some(e=>e.group==='prompt')&&entry.group!=='prompt')
    this.deadlines.selection=this.now()+60000;
   this.enter(1,true);return true;
  }
  finish(group){
   if(!this.active||this.active.group!==group)return;
   this.active.state='finished';
   const kind=group==='opening'?'opening':group==='prompt'?'selection':null;
   if(kind&&this.deadlines[kind]===null)this.deadlines[kind]=this.now()+(kind==='opening'?900000:60000);
   this.onVoice(group,'finished');
  }
  fail(group,error){if(this.active?.group!==group||this.active.state==='finished')return;this.active.media?.pause();this.active.state='error';++this.token;this.onVoice(group,'error');this.onError(group,error);}
  play(group,resume=false){
   const media=this.voices[group];const run=++this.token;
   this.active={group,media,state:media?'starting':'missing'};
   this.onVoice(group,this.active.state);
   if(!media)return;
   if(!resume)media.currentTime=0;
   if(media.error)media.load();
   try{Promise.resolve(media.play()).then(()=>{
    if(run!==this.token||this.active?.state!=='starting')return;
    this.active.state='playing';this.onVoice(group,'playing');
   }).catch(error=>{if(run===this.token)this.fail(group,error);});}
   catch(error){this.fail(group,error);}
  }
  next(){
   if(!this.started||this.index>=this.entries.length-1)return false;
   const from=this.entry,to=this.entries[this.index+1];
   if(from.group&&to.group!==from.group&&this.active?.group===from.group){
    // Changing subtitle sentences never seeks/stops a recording. Leaving the AI speech waits for its real end.
    if(['starting','playing'].includes(this.active.state))return false;
    if(this.active.state==='error'){this.play(from.group);return false;}
    if(this.active.state==='paused'){this.play(from.group,true);return false;}
    if(this.active.state==='missing')this.finish(from.group);
   }
   const resume=from.group&&from.group===to.group&&this.active?.state==='paused';
   this.index++;this.enter(1);
   if(resume)this.play(to.group,true);
   return true;
  }
  previous(){
   if(!this.started||this.index<=0)return false;
   ++this.token;
   for(const m of [...Object.values(this.voices),...Object.values(this.effects),this.video])m?.pause();
   this.onVideo(false);
   if(this.active&&['starting','playing'].includes(this.active.state))this.active.state='paused';
   this.index--;this.enter(-1);return true;
  }
  enter(direction,starting=false){
   const e=this.entry,previous=this.entries[this.index-1];
   if(direction>0&&(starting||previous?.group!==e.group)){
    this.active?.media?.pause();
    if(e.group)this.play(e.group);else this.active=null;
   }
   this.onEntry(e,{direction,index:this.index,total:this.entries.length,starting});
   if(direction<0)return;
   const effect=this.effects[e.action];
   if(effect){for(const m of Object.values(this.effects))m?.pause();effect.currentTime=0;
    try{Promise.resolve(effect.play()).catch(error=>this.onError(e.action,error));}catch(error){this.onError(e.action,error);}}
   if(e.action==='reveal'&&this.video){
    this.video.currentTime=0;this.onVideo(true);
    try{Promise.resolve(this.video.play()).catch(error=>{this.onVideo(false);this.onError('reveal',error);});}
    catch(error){this.onVideo(false);this.onError('reveal',error);}
   }
  }
  destroy(){++this.token;for(const m of [...Object.values(this.voices),...Object.values(this.effects),this.video])m?.pause();
   for(const [m,end,error] of this.listeners){m.removeEventListener('ended',end);m.removeEventListener('error',error);}
   if(this.video)this.video.removeEventListener('ended',this.videoEnd);}
 }
 return {Controller};
});
