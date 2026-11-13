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
 // Purely visual. Does not control the narrator, operator cues or soundtrack.
 const candidates=Object.freeze(["CHRISTOPHER","ETHAN","MEGAN","RACHEL"]);
 const board=Object.freeze({x:48,y:45,width:720,height:490});
 const ease=t=>{const p=clamp(t);return p*p*(3-2*p);};
 const easeOut=t=>1-Math.pow(1-clamp(t),3);
 const pad=n=>String(n).padStart(2,"0");
 function motionFor(result,reducedMotion=false){
  const elapsed=reducedMotion?2000:result.elapsed;
  const age=reducedMotion?2000:result.panelElapsed;
  const increase=!reducedMotion&&!result.preview&&result.cue.votes>result.previousVotes;
  return {
   scale:.38+.62*easeOut(age/275),
   opacity:ease(age/155),
   displayedVotes:result.previousVotes+(result.cue.votes-result.previousVotes)*ease(elapsed/360),
   flash:increase?clamp(1-elapsed/450)*(.38+.62*Math.sin(elapsed*Math.PI/140)**2):0,
   scan:clamp(age/630)
  };
 }
 class Controller{
  constructor(){
   this.key=null;this.context=null;this.enteredAt=0;this.panelEnteredAt=0;
   this.previousVotes=0;this.lastVotes=0;
  }
  state(frame,now){
   const cue=cueForFrame(frame);
   if(!cue){
    this.key=null;this.context=null;
    this.previousVotes=0;this.lastVotes=0;return null;
   }
   const preview=Boolean(frame.preview);
   const context=(frame.script?"script":"scene")+(preview?"-preview":"-live");
   if(this.key!==cue.id||this.context!==context){
    const first=this.key===null||this.context!==context;
    if(first)this.panelEnteredAt=preview?now-2000:now;
    // Direct jumps and rewinds never invent a vote-confirmation flash.
    this.previousVotes=first||cue.votes<=this.lastVotes?cue.votes:this.lastVotes;
    this.lastVotes=cue.votes;this.key=cue.id;this.context=context;
    this.enteredAt=preview?now-2000:now;
   }
   return {cue,preview,elapsed:Math.max(0,now-this.enteredAt),
    panelElapsed:Math.max(0,now-this.panelEnteredAt),
    previousVotes:this.previousVotes};
  }
  draw(ctx,frame,now,width,height,reducedMotion=false){
   const result=this.state(frame,now);
   if(!result||frame.blackout>=.999||width<=0||height<=0)return;
   const {cue}=result,{x,y,width:W,height:H}=board;
   const fx=motionFor(result,reducedMotion);
   const opacity=fx.opacity*clamp(1-(frame.blackout||0));
   if(opacity<=0)return;
   ctx.save();
   ctx.scale(width/1280,height/720);
   ctx.translate(x,y);
   ctx.scale(fx.scale,fx.scale);
   // The local origin stays at the fixed upper-left projection point.
   ctx.globalAlpha=opacity;
   ctx.fillStyle="rgba(3,17,32,0.76)";ctx.fillRect(0,0,W,H);
   ctx.fillStyle="rgba(11,96,131,0.13)";ctx.fillRect(0,0,W,144);
   ctx.fillStyle="rgba(25,73,109,0.10)";ctx.fillRect(0,144,W,H-144);
   ctx.save();ctx.beginPath();ctx.rect(0,0,W,H);ctx.clip();
   ctx.fillStyle="rgba(117,229,242,0.044)";
   for(let sy=8;sy<H;sy+=9)ctx.fillRect(0,sy,W,1);
   ctx.fillStyle="rgba(106,203,231,0.032)";
   for(let sx=27;sx<W;sx+=55)ctx.fillRect(sx,0,1,H);
   // An entrance-only holographic scan. Nothing flickers continuously.
   if(!reducedMotion&&fx.scan<1){
    const sy=10+fx.scan*(H-20),glow=1-fx.scan;
    ctx.fillStyle="rgba(84,218,242,"+(glow*.19).toFixed(3)+")";
    ctx.fillRect(0,sy-5,W,11);
    ctx.fillStyle="rgba(204,253,255,"+(glow*.61).toFixed(3)+")";
    ctx.fillRect(0,sy,W,2);
   }
   ctx.restore();
   ctx.strokeStyle="rgba(109,229,249,0.72)";
   ctx.lineWidth=1.5;ctx.shadowColor="#63dff1";ctx.shadowBlur=20;
   ctx.strokeRect(.75,.75,W-1.5,H-1.5);ctx.shadowBlur=0;
   ctx.strokeStyle="rgba(115,225,239,0.25)";
   ctx.lineWidth=1;ctx.strokeRect(10.5,10.5,W-21,H-21);
   ctx.strokeStyle="#a5f3ff";ctx.lineWidth=3;
   ctx.beginPath();
   for(const [bx,by,dx,dy] of [[0,0,1,1],[W,0,-1,1],[0,H,1,-1],[W,H,-1,-1]]){
    ctx.moveTo(bx+dx*36,by);ctx.lineTo(bx,by);ctx.lineTo(bx,by+dy*36);
   }
   ctx.stroke();
   ctx.font="600 14px Arial, sans-serif";
   ctx.fillStyle="#a9d1df";
   ctx.fillText("HUMAN VERIFICATION  /  TEST 67",35,43);
   ctx.fillStyle="rgba(89,218,238,0.55)";
   ctx.fillRect(34,61,W-68,1.5);
   ctx.font="700 35px Arial, sans-serif";
   ctx.fillStyle="#ecfaff";ctx.shadowColor="#35daf0";ctx.shadowBlur=9;
   ctx.fillText("VOTE TALLY",34,118);ctx.shadowBlur=0;
   ctx.textAlign="right";ctx.font="700 19px Arial, sans-serif";
   ctx.fillStyle=fx.flash>.1?"#fff0f5":"#a9e5f3";
   ctx.fillText("CONFIRMED "+pad(cue.votes),W-35,113);
   ctx.textAlign="left";ctx.font="600 13px Arial, sans-serif";
   ctx.fillStyle="#8fb8c6";
   ctx.fillText("SUBJECT",36,162);
   ctx.fillText("BALLOTS RECEIVED",314,162);
   ctx.strokeStyle="rgba(118,201,222,0.34)";
   ctx.beginPath();ctx.moveTo(34,176);ctx.lineTo(W-34,176);ctx.stroke();
   for(let i=0;i<candidates.length;i++){
    const name=candidates[i],isEthan=name==="ETHAN";
    const top=183+i*51,cy=top+27,votes=isEthan?cue.votes:0;
    const filled=isEthan?fx.displayedVotes:0;
    const flash=isEthan?fx.flash:0;
    ctx.fillStyle=isEthan&&votes>0?
     "rgba(134,39,73,"+(0.16+flash*.31).toFixed(3)+")":
     "rgba(27,85,112,0.13)";
    ctx.fillRect(28,top,W-56,45);
    if(flash>.01){
     ctx.strokeStyle="rgba(255,126,164,"+(flash*.85).toFixed(3)+")";
     ctx.lineWidth=1.5;ctx.shadowColor="#ff668f";
     ctx.shadowBlur=flash*14;
     ctx.strokeRect(28,top,W-56,45);ctx.shadowBlur=0;
    }
    ctx.font=isEthan?"700 19px Arial, sans-serif":"600 18px Arial, sans-serif";
    ctx.fillStyle=isEthan&&votes>0?"#fff1f7":"#c5d7e0";
    ctx.fillText(name,42,cy+6);
    const slotX=315,slotWidth=47,slotGap=8,slotY=top+13;
    for(let n=0;n<4;n++){
     const sx=slotX+n*(slotWidth+slotGap);
     ctx.fillStyle="rgba(103,158,185,0.21)";
     ctx.fillRect(sx,slotY,slotWidth,20);
     ctx.strokeStyle="rgba(134,211,232,0.25)";
     ctx.lineWidth=1;ctx.strokeRect(sx+.5,slotY+.5,slotWidth-1,19);
     const part=clamp(filled-n);
     if(part>0){
      const newest=isEthan&&cue.votes>result.previousVotes&&n===cue.votes-1;
      ctx.fillStyle=newest&&flash>.39?"#fff0f6":"#ff7895";
      ctx.shadowColor="#ff79a0";
      ctx.shadowBlur=newest?7+18*flash:4;
      ctx.fillRect(sx+2,slotY+2,(slotWidth-4)*part,16);
      ctx.shadowBlur=0;
     }
    }
    ctx.textAlign="right";
    ctx.font=isEthan?"700 28px Arial, sans-serif":"600 22px Arial, sans-serif";
    if(flash>.01){ctx.shadowColor="#ff7398";ctx.shadowBlur=flash*20;}
    ctx.fillStyle=flash>.38?"#fff1f6":isEthan&&votes>0?"#ffb0c2":"#b1cbd9";
    ctx.fillText(pad(votes),W-42,cy+9);ctx.shadowBlur=0;
    ctx.textAlign="left";
   }
   ctx.strokeStyle="rgba(107,215,240,0.4)";
   ctx.beginPath();ctx.moveTo(34,402);ctx.lineTo(W-34,402);ctx.stroke();
   ctx.font="700 15px Arial, sans-serif";
   ctx.fillStyle=cue.votes>0?"#ffb4c7":"#79e2ef";
   ctx.fillText(cue.heading,36,445);
   ctx.textAlign="right";ctx.font="600 14px Arial, sans-serif";
   ctx.fillStyle="#b4d3dc";ctx.fillText(cue.status,W-36,445);
   ctx.restore();
  }
 }
 return {Controller,forScript,forScene,cueForFrame,motionFor,board};
});
