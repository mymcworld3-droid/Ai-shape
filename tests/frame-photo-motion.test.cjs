"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {Controller,DURATIONS}=require("../frame-photo-motion.js");

test("the photo enters smoothly without skipping directly to full size",()=>{
 const motion=new Controller();
 const start=motion.update("front",100);
 assert.equal(start.side,"front");
 assert.equal(start.opacity,0);
 assert.ok(start.scale<1);
 const mid=motion.update("front",100+DURATIONS.appear/2);
 assert.ok(mid.opacity>0&&mid.opacity<1);
 assert.ok(mid.scale>.92&&mid.scale<1);
 const end=motion.update("front",100+DURATIONS.appear);
 assert.deepEqual(end,{side:"front",opacity:1,scale:1,offsetY:0,widthRatio:1,turning:false});
});

test("the front flips to the back at the edge, with readable unmirrored images",()=>{
 const motion=new Controller();
 motion.update("front",0,true);
 const first=motion.update("back",100);
 assert.equal(first.side,"front");
 assert.equal(first.turning,true);
 const left=motion.update("back",100+DURATIONS.turn*.25);
 assert.equal(left.side,"front");
 assert.ok(left.widthRatio>0&&left.widthRatio<1);
 const edge=motion.update("back",100+DURATIONS.turn*.5);
 assert.equal(edge.side,"back");
 assert.ok(edge.widthRatio<.001);
 const right=motion.update("back",100+DURATIONS.turn*.75);
 assert.equal(right.side,"back");
 assert.ok(right.widthRatio>0&&right.widthRatio<1);
 const end=motion.update("back",100+DURATIONS.turn);
 assert.equal(end.side,"back");
 assert.equal(end.widthRatio,1);
});

test("stepping through several transcript lines with the same photo does not restart it",()=>{
 const motion=new Controller();
 motion.update("front",0);
 const mid=motion.update("front",400);
 const continued=motion.update("front",401);
 assert.ok(continued.opacity>=mid.opacity);
 assert.equal(motion.update("front",1000).opacity,1);
});

test("leaving the photo fades it out, then exposes the room",()=>{
 const motion=new Controller();
 motion.update("back",0,true);
 const first=motion.update(null,100);
 assert.equal(first.side,"back");
 assert.equal(first.opacity,1);
 const mid=motion.update(null,100+DURATIONS.disappear/2);
 assert.ok(mid.opacity>0&&mid.opacity<1);
 assert.ok(mid.scale<1);
 const finished=motion.update(null,100+DURATIONS.disappear);
 assert.equal(finished.side,null);
 assert.equal(finished.opacity,0);
});

test("pressing previous during a turnover restores the photo instead of leaving a mirrored sliver",()=>{
 const motion=new Controller();
 motion.update("front",0,true);
 motion.update("back",100);
 const halfTurn=motion.update("back",100+DURATIONS.turn*.3);
 assert.equal(halfTurn.side,"front");
 const reverse=motion.update("front",100+DURATIONS.turn*.3+1);
 assert.equal(reverse.side,"front");
 assert.equal(reverse.turning,false);
 assert.ok(reverse.widthRatio<1);
 const settled=motion.update("front",100+DURATIONS.turn*.3+1+DURATIONS.recover);
 assert.equal(settled.widthRatio,1);
 assert.equal(settled.opacity,1);
});

test("interrupted fade-out can return to the photograph smoothly",()=>{
 const motion=new Controller();
 motion.update("front",0,true);
 motion.update(null,100);
 const fading=motion.update(null,280);
 assert.ok(fading.opacity<1);
 const returning=motion.update("front",281);
 assert.ok(returning.opacity<=1&&returning.opacity>=fading.opacity-.01);
 assert.equal(motion.update("front",281+DURATIONS.recover).opacity,1);
});

test("reduced-motion mode renders the requested photo immediately",()=>{
 const motion=new Controller();
 assert.equal(motion.update("front",0,true).opacity,1);
 assert.equal(motion.update("back",1,true).side,"back");
 assert.equal(motion.update(null,2,true).opacity,0);
});
