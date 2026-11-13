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
  // Keep all three sentences of the AI prompt, including "1 minute
  // remaining.", free of the voting panel. The panel begins on p389-0,
  // exactly when the AI graphic moves to the lower-right corner.
  if(!Number.isInteger(paragraph)||paragraph<389||paragraph>402)return null;
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
 // A visual-only tally board. It neither owns nor alters cue/voice timing.
 // Four candidates are always present; votes are counted only when the
 // scripted AI explicitly confirms them.
 const candidates=Object.freeze(["CHRISTOPHER","ETHAN","MEGAN","RACHEL"]);
 const ballotSlots=4;
 const ease=t=>{const p=clamp(t);return p*p*(3-2*p);};
 class Controller{
  constructor(){
   this.key=null;this.enteredAt=0;this.panelEnteredAt=0;
   this.previousVotes=0;this.lastVotes=0;
  }
  state(frame,now){
   const cue=cueForFrame(frame);
   if(!cue){
    this.key=null;this.previousVotes=0;this.lastVotes=0;
    return null;
   }
   if(this.key!==cue.id){
    const first=this.key===null;
    if(first)this.panelEnteredAt=frame.preview?now-2000:now;
    this.previousVotes=first?cue.votes:this.lastVotes;
    this.lastVotes=cue.votes;
    this.key=cue.id;
    this.enteredAt=frame.preview?now-2000:now;
   }
   return {cue,elapsed:Math.max(0,now-this.enteredAt),
    panelElapsed:Math.max(0,now-this.panelEnteredAt),
    previousVotes:this.previousVotes};
  }
  draw(ctx,frame,now,width,height,reducedMotion=false){
   const result=this.state(frame,now);
   if(!result||frame.blackout>=.999||width<=0||height<=0)return;
   const {cue}=result;
   const elapsed=reducedMotion?2000:result.elapsed;
   const fade=ease((reducedMotion?2000:result.panelElapsed)/180);
   const opacity=fade*clamp(1-(frame.blackout||0));
   if(opacity<=0)return;
   const displayedVotes=result.previousVotes+
    (cue.votes-result.previousVotes)*ease(elapsed/390);
   const x=64,y=102,panelWidth=452,panelHeight=330;
   const accent=cue.votes>0?"#ff8995":"#80d9e8";
   ctx.save();
   ctx.scale(width/1280,height/720);
   ctx.translate(0,(1-fade)*8);
   ctx.globalAlpha=opacity;
   // A compact upper-left tally board; the lower-third subtitles and
   // bottom-right AI figure remain completely unobstructed.
   ctx.fillStyle="rgba(5,13,24,0.87)";
   ctx.fillRect(x,y,panelWidth,panelHeight);
   ctx.strokeStyle="rgba(112,166,185,0.62)";
   ctx.lineWidth=1.4;
   ctx.strokeRect(x+.5,y+.5,panelWidth-1,panelHeight-1);
   ctx.fillStyle=accent;
   ctx.fillRect(x,y,4,panelHeight);
   ctx.font="600 13px Arial, sans-serif";
   ctx.fillStyle="#9db8c9";
   ctx.fillText("HUMAN VERIFICATION  /  TEST 67",x+21,y+30);
   ctx.strokeStyle="rgba(126,161,180,0.30)";
   ctx.beginPath();ctx.moveTo(x+21,y+45);
   ctx.lineTo(x+panelWidth-21,y+45);ctx.stroke();
   ctx.font="700 21px Arial, sans-serif";
   ctx.fillStyle="#eff8ff";
   ctx.fillText("VOTE TALLY",x+21,y+77);
   ctx.textAlign="right";
   ctx.font="700 15px Arial, sans-serif";
   ctx.fillStyle="#c5d6df";
   ctx.fillText("CONFIRMED "+String(cue.votes).padStart(2,"0"),x+panelWidth-21,y+77);
   ctx.textAlign="left";
   // Each row has four possible ballot markers. The fill animates
   // 0 -> 1 -> 2 only at an AI-confirmed vote, with no countdown.
   for(let i=0;i<candidates.length;i++){
    const name=candidates[i],isEthan=name==="ETHAN";
    const rowY=y+123+i*41;
    const confirmed=isEthan?cue.votes:0;
    const filled=isEthan?displayedVotes:0;
    ctx.fillStyle=isEthan&&confirmed>0?"#fff0f2":"#bed0db";
    ctx.font=isEthan?"700 16px Arial, sans-serif":"600 15px Arial, sans-serif";
    ctx.fillText(name,x+21,rowY);
    const slotX=x+200,slotW=34,slotGap=5,slotY=rowY-14;
    for(let n=0;n<ballotSlots;n++){
     const sx=slotX+n*(slotW+slotGap);
     ctx.fillStyle="rgba(120,155,170,0.20)";
     ctx.fillRect(sx,slotY,slotW,14);
     const strength=clamp(filled-n);
     if(strength>0){
      ctx.fillStyle="#ff7586";
      ctx.fillRect(sx,slotY,slotW*strength,14);
     }
    }
    ctx.textAlign="right";
    ctx.font=isEthan?"700 22px Arial, sans-serif":"600 19px Arial, sans-serif";
    ctx.fillStyle=isEthan&&confirmed>0?"#ff9ba6":"#aabcc8";
    ctx.fillText(String(confirmed).padStart(2,"0"),x+panelWidth-21,rowY+3);
    ctx.textAlign="left";
   }
   ctx.strokeStyle="rgba(126,161,180,0.30)";
   ctx.beginPath();ctx.moveTo(x+21,y+279);
   ctx.lineTo(x+panelWidth-21,y+279);ctx.stroke();
   ctx.font="600 12px Arial, sans-serif";
   ctx.fillStyle=accent;
   ctx.fillText(cue.heading,x+21,y+308);
   ctx.textAlign="right";
   ctx.fillStyle="#c5d6df";
   ctx.fillText(cue.status,x+panelWidth-21,y+308);
   ctx.restore();
  }
 }
 return {Controller,forScript,forScene,cueForFrame};
});
