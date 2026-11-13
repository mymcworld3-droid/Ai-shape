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
   onAdvance=()=>{},onError=()=>{},setOutputGain=()=>false,now=()=>performance.now(),
   setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id),
   setTicker=(fn,ms)=>setInterval(fn,ms),clearTicker=id=>clearInterval(id)}){
   if(!audio||!src)throw Error("Ending voice requires audio and src");
   Object.assign(this,{audio,src,startDelayMs,leadMs,onAdvance,onError,
    now,setTimer,clearTimer,setTicker,clearTicker,setOutputGain});
   this.masterVolume=1;this.active=false;this.audible=false;
   this.run=0;this.introTimer=null;this.advanceTicker=null;
   audio.src=src;audio.loop=false;audio.preload="auto";
   audio.volume=0;audio.load();
  }
  applyVolume(){
   const level=this.audible?this.masterVolume:0;
   // Safari may silence a media element that starts at volume=0 and gains
   // volume later. Keep the element at 100% and gate its WebAudio output.
   // Use the old HTML volume fallback only if WebAudio is unavailable.
   this.audio.volume=this.setOutputGain(level)===true?1:level;
  }
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
     if(run!==this.run||!delayed||this.audible)return;
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
    // The operator may manually advance from the preceding blackout
    // BEFORE its one-second muted intro finishes. Cancelling that timer
    // without unmuting left Ending.mp3 playing silently for the whole ending.
    this.cancelTimers();
    if(!this.active||this.audio.ended){
     this.start({delayed:false});
    }else{
     if(!this.audible){
      this.audio.currentTime=0;
      this.audible=true;
      this.applyVolume();
     }
     // A browser may pause a previously muted autoplay when it gains
     // volume; retry here when the operator enters the first credit.
     if(this.audio.paused){
      try{
       Promise.resolve(this.audio.play()).catch(error=>this.onError(error));
      }catch(error){this.onError(error);}
     }
    }
    return;
   }
   this.stop();
  }
 }
 return {Controller};
});
