"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {Controller,forScript,forScene,cueForFrame}=require("../vote-overlay.js");

test("script voting visual matches nominations and AI vote confirmations",()=>{
 assert.equal(forScript(387),null);
 assert.equal(forScript(388),null,"No voting panel during any of the three AI prompt sentences");
 assert.equal(forScript(389).id,"nomination-one","Panel begins when the AI graphic moves down");
 assert.equal(forScript(390).votes,1);
 assert.equal(forScript(392).votes,1);
 assert.equal(forScript(393).id,"nomination-two");
 assert.equal(forScript(394).votes,1,"Megan's vote is not confirmed until the AI announcement");
 assert.equal(forScript(395).votes,2);
 assert.equal(forScript(400).votes,2);
 assert.equal(forScript(402).id,"final");
 assert.match(forScript(402).detail,/AWAITING/);
 assert.equal(forScript(403),null,"blackout clears the overlay");
});
test("scene voting visual uses existing cues without an additional operator step",()=>{
 assert.equal(forScene("discussion"),null);
 assert.equal(forScene("vote-prompt").id,"request");
 assert.equal(forScene("vote-one").votes,1);
 assert.equal(forScene("vote-two").votes,2);
 assert.equal(forScene("vote-final").id,"final");
 assert.equal(forScene("vote-blackout"),null);
 assert.equal(forScene("ending-light"),null);
});
test("visual-only frame adapter is identical for live show and silent preview",()=>{
 for(const preview of [false,true]){
  for(const voteCueId of ["p388-0","p388-1","p388-2"]){
   assert.equal(cueForFrame({script:true,voteParagraph:388,voteCueId,preview}),null,
    "No HUD through 1 minute remaining, including silent preview: "+voteCueId);
  }
  assert.equal(cueForFrame({script:true,voteParagraph:389,voteCueId:"p389-0",preview}).id,"nomination-one");
 }
 assert.equal(cueForFrame({script:true,voteParagraph:390,preview:false}).votes,1);
 assert.equal(cueForFrame({script:true,voteParagraph:390,preview:true}).votes,1);
 assert.equal(cueForFrame({script:false,caption:"vote-two",preview:true}).votes,2);
});
test("voting animation never advances cues or changes their timing",()=>{
 const overlay=new Controller();
 assert.equal(overlay.state({script:true,voteParagraph:388,voteCueId:"p388-2"},900),null);
 const start=overlay.state({script:true,voteParagraph:389,voteCueId:"p389-0"},950);
 assert.equal(start.cue.id,"nomination-one");
 assert.equal(start.elapsed,0,"Overlay animation starts at the same cue as the graphic's movement");
 const first=overlay.state({script:true,voteParagraph:390},1000);
 assert.equal(first.elapsed,0);
 const samePhase=overlay.state({script:true,voteParagraph:390},1600);
 assert.equal(samePhase.elapsed,600);
 const second=overlay.state({script:true,voteParagraph:395},1800);
 assert.equal(second.elapsed,0);
 const preview=overlay.state({script:true,voteParagraph:402,preview:true},2000);
 assert.equal(preview.elapsed,2000);
 assert.equal(overlay.state({script:true,voteParagraph:403},2100),null);
 const calls=[];
 const canvas=new Proxy({},{
  get(target,key){return target[key]||function(){calls.push(key);};},
  set(target,key,value){target[key]=value;return true;}
 });
 overlay.draw(canvas,{script:false,caption:"vote-one",blackout:0},2300,1280,720);
 overlay.draw(canvas,{script:false,caption:"vote-one",blackout:0},3000,1280,720);
 assert.ok(calls.includes("fillText"));
 assert.ok(calls.includes("strokeRect"));
 const before=calls.length;
 overlay.draw(canvas,{script:false,caption:"vote-blackout",blackout:1},3100,1280,720);
 assert.equal(calls.length,before,"no artwork appears over a blackout");
});

test("tally board lists all four candidates and animates only confirmed votes",()=>{
 const tally=new Controller();
 const frames=[
  {script:true,voteParagraph:388,voteCueId:"p388-2"},
  {script:true,voteParagraph:389,voteCueId:"p389-0"},
  {script:true,voteParagraph:390,voteCueId:"p390-0"},
  {script:true,voteParagraph:393,voteCueId:"p393-0"},
  {script:true,voteParagraph:395,voteCueId:"p395-0"},
  {script:true,voteParagraph:402,voteCueId:"p402-0"}
 ];
 assert.equal(tally.state(frames[0],0),null,"No list before final prompt ends");
 assert.equal(tally.state(frames[1],100).cue.votes,0);
 assert.equal(tally.state(frames[2],200).cue.votes,1);
 assert.equal(tally.state(frames[3],300).cue.votes,1,"Second nomination alone does not add a vote");
 assert.equal(tally.state(frames[4],400).cue.votes,2);
 assert.equal(tally.state(frames[5],500).cue.votes,2);
 const labels=[];
 const canvas=new Proxy({},{
  get(target,key){return target[key]||function(...args){
   if(key==="fillText")labels.push(args[0]);
  };},
  set(target,key,value){target[key]=value;return true;}
 });
 tally.draw(canvas,frames[5],1600,1280,720);
 for(const name of ["CHRISTOPHER","ETHAN","MEGAN","RACHEL"]){
  assert.ok(labels.includes(name),"Candidate must always appear: "+name);
 }
 assert.ok(labels.includes("VOTE TALLY"));
 assert.ok(labels.includes("CONFIRMED 02"));
 assert.equal(labels.filter(label=>label==="02").length,1,"Only Ethan has two confirmed votes");
 assert.equal(labels.filter(label=>label==="00").length,3,"Other candidates retain zero votes");
 tally.draw(canvas,frames[0],1700,1280,720);
 const before=labels.length;
 tally.draw(canvas,frames[0],1800,1280,720);
 assert.equal(labels.length,before,"No tally artwork appears before the trigger");
});

test("hologram expands from the fixed top-left corner with reduced-motion fallback",()=>{
 const {motionFor,board}=require("../vote-overlay.js");
 const overlay=new Controller(),f={script:true,voteParagraph:389};
 const first=motionFor(overlay.state(f,1000));
 assert.equal(first.scale,.38);assert.equal(first.opacity,0);
 const mid=motionFor(overlay.state(f,1100));
 assert.ok(mid.scale>.38&&mid.scale<1);
 assert.ok(mid.opacity>0&&mid.opacity<1);
 assert.equal(motionFor(overlay.state(f,1275)).scale,1);
 assert.deepEqual(board,{x:48,y:45,width:720,height:490});
 assert.equal(motionFor(overlay.state(f,1100),true).scale,1);
 assert.equal(motionFor(overlay.state(f,1100),true).flash,0);
 assert.equal(motionFor(new Controller().state({...f,preview:true},1500)).scale,1);
});
test("two vote confirmations flash; nominations, rewinds and direct previews do not",()=>{
 const {motionFor}=require("../vote-overlay.js");
 const c=new Controller(),f=p=>({script:true,voteParagraph:p});
 assert.equal(c.state(f(388),0),null);
 c.state(f(389),100);
 assert.equal(motionFor(c.state(f(389),190)).flash,0);
 const first=c.state(f(390),200);
 assert.equal(first.previousVotes,0);
 assert.ok(motionFor(c.state(f(390),270)).flash>.15);
 assert.equal(motionFor(c.state(f(390),700)).flash,0);
 assert.equal(motionFor(c.state(f(393),800)).flash,0);
 c.state(f(395),900);
 assert.ok(motionFor(c.state(f(395),970)).flash>.15);
 assert.equal(motionFor(c.state(f(395),1400)).displayedVotes,2);
 assert.equal(motionFor(c.state(f(390),1450)).flash,0);
 assert.equal(motionFor(new Controller().state(f(395),1600)).flash,0);
 assert.equal(motionFor(new Controller().state({...f(395),preview:true},1700)).flash,0);
});
test("panel is large and uses a true top-left scaling pivot",()=>{
 const ops=[];
 const ctx=new Proxy({},{
  get(t,k){return k in t?t[k]:(...args)=>ops.push({name:k,args});},
  set(t,k,v){t[k]=v;return true;}
 });
 const c=new Controller(),f={script:true,voteParagraph:389};
 c.draw(ctx,f,1000,1280,720);
 c.draw(ctx,f,1100,1280,720);
 assert.ok(ops.some(c=>c.name==="translate"&&c.args[0]===48&&c.args[1]===45));
 assert.ok(ops.some(c=>c.name==="scale"&&c.args[0]>.38&&c.args[0]<1));
 assert.ok(ops.some(c=>c.name==="fillText"&&c.args[0]==="VOTE TALLY"));
 for(const name of ["CHRISTOPHER","ETHAN","MEGAN","RACHEL"])
  assert.ok(ops.some(c=>c.name==="fillText"&&c.args[0]===name));
});
