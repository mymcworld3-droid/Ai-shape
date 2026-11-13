(function(root,factory){
 "use strict";
 const api=factory();
 if(typeof module==="object"&&module.exports)module.exports=api;
 else root.EndingVoice=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const clamp=n=>Math.max(0,Math.min(1,n));
 // Independent AI narration player, including the original 1-second
 // muted warm-up and 1.6-second audible lead into the first credit.
 class Controller{
  constructor({audio,src,startDelayMs=1000,leadMs=1600,
   onAdvance=()=>{},onError=()=>{},now=()=>performance.now(),
   setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id),
   setTicker=(fn,ms)=>setInterval(fn,ms),clearTicker=id=>clearInterval(id)}){
   if(!audio||!src)throw Error("Ending voice requires audio and src");
   Object.assign(this,{audio,src,startDelayMs,leadMs,onAdvance,onError,
    now,setTimer,clearTimer,setTicker,clearTicker});
   this.masterVolume=1;this.active=false;this.audible=false;
   this.run=0;this.introTimer=null;this.advanceTicker=null;
   audio.src=src;audio.loop=false;audio.preload="auto";
   audio.volume=0;audio.load();
  }
  applyVolume(){this.audio.volume=this.audible?this.masterVolume:0;}
  setMasterVolume(n){this.masterVolume=clamp(n);this.applyVolume();}
  cancelTimers(){
   if(this.introTimer!==null)this.clearTimer(this.introTimer);
   if(this.advanceTicker!==null)this.clearTicker(this.advanceTicker);
   this.introTimer=null;this.advanceTicker=null;
  }
  stop(){
   ++this.run;this.cancelTimers();this.active=false;this.audible=false;
   this.audio.pause();this.applyVolume();
   if(this.audio.readyState>0)this.audio.currentTime=0;
  }
  start({delayed=false}={}){
   this.stop();this.active=true;
   this.audio.loop=false;this.audio.currentTime=0;
   this.audible=!delayed;this.applyVolume();
   const run=this.run,began=this.now();
   const fail=error=>{if(run!==this.run)return;this.stop();this.onError(error);};
   try{
    // play() is called during the operator gesture at zero gain. Starting
    // it later inside a timer would fail Safari's autoplay restriction.
    Promise.resolve(this.audio.play()).then(()=>{
     if(run!==this.run||!delayed)return;
     const remaining=Math.max(0,this.startDelayMs-(this.now()-began));
     this.introTimer=this.setTimer(()=>{
      this.introTimer=null;
      if(run!==this.run)return;
      this.audio.currentTime=0;this.audible=true;this.applyVolume();
      this.advanceTicker=this.setTicker(()=>{
       if(run!==this.run||!this.active)return;
       if(!this.audio.paused&&this.audio.currentTime>=this.leadMs/1000){
        this.clearTicker(this.advanceTicker);this.advanceTicker=null;
        this.onAdvance();
       }
      },25);
     },remaining);
    }).catch(fail);
   }catch(error){fail(error);}
  }
  cue(action,live=true){
   if(!live)return;
   if(action==="end-blackout"||action==="ending-blackout"){
    this.start({delayed:true});return;
   }
   if(action?.startsWith("credit-")){
    this.cancelTimers();
    // Direct rehearsal jumps to a credit start this same voice without
    // a second delayed intro; normal progression never restarts it.
    if(!this.active)this.start();
    return;
   }
   this.stop();
  }
 }
 return {Controller};
});
