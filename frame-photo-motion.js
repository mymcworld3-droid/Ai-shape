/* Memory-room photo entrance, turnover and removal; independent of cue numbering. */
(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.FramePhotoMotion=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const DURATIONS=Object.freeze({appear:650,turn:820,disappear:460,recover:260});
 const clamp=x=>Math.max(0,Math.min(1,x));
 const lerp=(a,b,t)=>a+(b-a)*t;
 const smooth=x=>{const p=clamp(x);return p*p*(3-2*p);};
 const out=x=>1-Math.pow(1-clamp(x),3);
 const resting=side=>({side,opacity:side?1:0,scale:1,offsetY:0,widthRatio:1,turning:false});

 class Controller{
  constructor(){this.target=null;this.transition=null;}
  pose(now){
   const transition=this.transition;
   if(!transition)return resting(this.target);
   const t=clamp((now-transition.startedAt)/transition.duration);
   if(t>=1){this.transition=null;return resting(this.target);}
   const {type,fromSide,toSide,fromOpacity,fromScale,fromY,fromWidth}=transition;
   if(type==="turn"){
    const first=t<.5,phase=first?t*2:(t-.5)*2;
    return {
     side:first?fromSide:toSide,
     opacity:lerp(fromOpacity,1,smooth(t)),
     scale:lerp(fromScale,1,smooth(t))-.025*Math.sin(Math.PI*t),
     offsetY:lerp(fromY,0,smooth(t)),
     widthRatio:first?lerp(fromWidth,0,smooth(phase)):smooth(phase),
     turning:true
    };
   }
   if(type==="disappear")return {
    side:fromSide,opacity:lerp(fromOpacity,0,smooth(t)),
    scale:lerp(fromScale,.955,smooth(t)),
    offsetY:lerp(fromY,18,smooth(t)),
    widthRatio:lerp(fromWidth,1,smooth(t)),turning:false
   };
   const p=type==="appear"?out(t):smooth(t);
   return {
    side:toSide,opacity:lerp(fromOpacity,1,p),
    scale:lerp(fromScale,1,p),offsetY:lerp(fromY,0,p),
    widthRatio:lerp(fromWidth,1,p),turning:false
   };
  }
  update(side,now,instant=false){
   const next=side==="front"||side==="back"?side:null;
   if(instant){this.target=next;this.transition=null;return resting(next);}
   if(next!==this.target){
    const current=this.pose(now);
    const type=!next?"disappear":!current.side||current.opacity<.01?"appear":
      current.side!==next?"turn":"recover";
    this.target=next;
    this.transition={
      type,fromSide:current.side,toSide:next,
      fromOpacity:current.opacity,
      fromScale:type==="appear"?.92:current.scale,
      fromY:type==="appear"?20:current.offsetY,
      fromWidth:current.widthRatio,
      startedAt:now,duration:DURATIONS[type]
    };
   }
   return this.pose(now);
  }
 }
 return {Controller,DURATIONS};
});