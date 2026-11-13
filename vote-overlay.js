(function(root,factory){
 "use strict";
 const api=factory();
 if(typeof module==="object"&&module.exports)module.exports=api;
 else root.VoteOverlay=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const clamp=value=>Math.max(0,Math.min(1,value));
 const cues=Object.freeze({
  request:Object.freeze({id:"request",heading:"SELECTION REQUESTED",detail:"AWAITING NOMINATIONS",status:"INPUT OPEN",votes:0,accent:"cyan"}),
  nominationOne:Object.freeze({id:"nomination-one",heading:"NOMINATION RECEIVED",detail:"CHRISTOPHER  /  ETHAN",status:"VERIFYING INPUT",votes:0,accent:"cyan"}),
  voteOne:Object.freeze({id:"vote-one",heading:"VOTE REGISTERED",detail:"SUBJECT  /  ETHAN",status:"ONE VOTE",votes:1,accent:"red"}),
  nominationTwo:Object.freeze({id:"nomination-two",heading:"NOMINATION RECEIVED",detail:"MEGAN  /  ETHAN",status:"VERIFYING INPUT",votes:1,accent:"cyan"}),
  voteTwo:Object.freeze({id:"vote-two",heading:"VOTE REGISTERED",detail:"SUBJECT  /  ETHAN",status:"TWO VOTES",votes:2,accent:"red"}),
  final:Object.freeze({id:"final",heading:"FINAL SELECTION",detail:"AWAITING RESPONSE",status:"INPUT REQUIRED",votes:2,accent:"red"})
 });
 function forScript(paragraph){
  if(!Number.isInteger(paragraph)||paragraph<388||paragraph>402)return null;
  if(paragraph===388)return cues.request;
  if(paragraph===389)return cues.nominationOne;
  if(paragraph<393)return cues.voteOne;
  if(paragraph<395)return cues.nominationTwo;
  if(paragraph<402)return cues.voteTwo;
  return cues.final;
 }
 function forScene(cue){
  return {"vote-prompt":cues.request,"vote-one":cues.voteOne,
   "vote-two":cues.voteTwo,"vote-final":cues.final}[cue]||null;
 }
 function cueForFrame(frame){
  return frame.script?forScript(frame.voteParagraph):forScene(frame.caption);
 }
 // A visual-only overlay: the play clock, narration, step timers and
 // operator controls remain owned by their existing controllers.
 class Controller{
  constructor(){this.key=null;this.enteredAt=0;}
  state(frame,now){
   const cue=cueForFrame(frame);
   if(!cue){this.key=null;return null;}
   if(this.key!==cue.id){
    this.key=cue.id;
    this.enteredAt=frame.preview?now-2000:now;
   }
   return {cue,elapsed:Math.max(0,now-this.enteredAt)};
  }
  draw(ctx,frame,now,width,height,reducedMotion=false){
   const result=this.state(frame,now);
   if(!result||frame.blackout>=.999||width<=0||height<=0)return;
   const cue=result.cue;
   const elapsed=reducedMotion?2000:result.elapsed;
   const enter=clamp(elapsed/330);
   const opacity=enter*enter*(3-2*enter)*clamp(1-(frame.blackout||0));
   if(opacity<=0)return;
   const accent=cue.accent==="red"?"#f47480":"#78d5df";
   const x=72,y=119,w=338,h=215;
   const shift=(1-enter)*12;
   ctx.save();
   ctx.scale(width/1280,height/720);
   ctx.translate(0,shift);
   ctx.globalAlpha=opacity;
   // Keep the artwork well above the existing lower-third dialogue.
   ctx.fillStyle="rgba(4,10,19,0.82)";
   ctx.fillRect(x,y,w,h);
   ctx.strokeStyle="rgba(104,166,184,0.56)";
   ctx.lineWidth=1.4;
   ctx.strokeRect(x+.5,y+.5,w-1,h-1);
   ctx.fillStyle=accent;
   ctx.fillRect(x,y,5,h);
   ctx.fillRect(x+18,y+19,42,2);
   ctx.globalAlpha=opacity*.65;
   ctx.fillRect(x+64,y+19,Math.min(265,265*clamp(elapsed/650)),1);
   ctx.globalAlpha=opacity;
   ctx.fillStyle="#a4c2ce";
   ctx.font="600 13px Arial, sans-serif";
   ctx.fillText("HUMAN VERIFICATION  /  TEST 67",x+18,y+43);
   ctx.font="700 20px Arial, sans-serif";
   ctx.fillStyle="#f2f7fa";
   ctx.fillText(cue.heading,x+18,y+84);
   ctx.font="600 13px Arial, sans-serif";
   ctx.fillStyle=accent;
   ctx.fillText(cue.detail,x+18,y+111);
   ctx.strokeStyle="rgba(123,168,182,0.33)";
   ctx.beginPath();
   ctx.moveTo(x+18,y+132);
   ctx.lineTo(x+w-18,y+132);
   ctx.stroke();
   ctx.font="600 13px Arial, sans-serif";
   ctx.fillStyle="#b1c1c9";
   ctx.fillText(cue.status,x+18,y+163);
   if(cue.votes){
    ctx.font="700 46px Arial, sans-serif";
    ctx.fillStyle=cue.accent==="red"?"#ff929d":"#d6f8ff";
    ctx.fillText(String(cue.votes).padStart(2,"0"),x+w-78,y+180);
   }else{
    ctx.fillStyle="rgba(120,213,223,0.4)";
    for(let i=0;i<3;i++)ctx.fillRect(x+w-77+i*17,y+159,9,9);
   }
   // Short scan on cue entry only. No loop and no delayed step advancement.
   if(!reducedMotion&&elapsed<760){
    const p=clamp(elapsed/760);
    ctx.globalAlpha=opacity*(1-p)*.42;
    ctx.fillStyle=accent;
    ctx.fillRect(x+9,y+58+p*140,w-18,2);
   }
   ctx.restore();
  }
 }
 return {Controller,forScript,forScene,cueForFrame};
});
