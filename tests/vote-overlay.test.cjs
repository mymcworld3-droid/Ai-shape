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
