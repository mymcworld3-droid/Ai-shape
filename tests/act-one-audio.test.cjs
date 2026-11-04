"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {Controller,trackForStep}=require("../act-one-audio.js");

const tracks=[
 {from:4,to:14,src:"intro.mp3"},
 {from:15,to:90,src:"dialogue.mp3"},
 {from:91,to:91,src:"transition.mp3",loop:false},
 {from:92,to:173,src:"memory.mp3"},
 {from:174,to:174,src:"final-transition.mp3",loop:false}
];
class FakeAudio{
 constructor(id){this.id=id;this.src="";this.volume=0;this.loop=false;this.currentTime=0;this.paused=true;this.events=[];}
 play(){this.paused=false;this.events.push("play:"+this.src);return Promise.resolve();}
 pause(){this.paused=true;this.events.push("pause");}
 load(){this.events.push("load:"+this.src);}
 removeAttribute(name){if(name==="src")this.src="";}
}
function setup(){
 let now=0,frameId=0;const callbacks=new Map(),a=new FakeAudio("a"),b=new FakeAudio("b"),errors=[];
 const music=new Controller({
  audio:a,alternateAudio:b,tracks,onError:e=>errors.push(e.message),
  now:()=>now,requestFrame:fn=>{const id=++frameId;callbacks.set(id,fn);return id;},
  cancelFrame:id=>callbacks.delete(id),fadeMs:1400,fadeOutMs:1100
 });
 return {music,a,b,errors,tick(ms){
  now+=ms;const pending=[...callbacks.values()];callbacks.clear();for(const fn of pending)fn();
 }};
}
const flush=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
const close=(a,b)=>assert.ok(Math.abs(a-b)<.01,`${a} != ${b}`);

test("opening first three steps are pure silence; cue 4 fades the first track in",async()=>{
 const {music,a,b,tick}=setup();
 for(let step=1;step<=3;step++)music.setStep(step);
 assert.equal(trackForStep(3,tracks),null);
 assert.ok(a.paused&&b.paused);
 assert.deepEqual([a.src,b.src],["",""]);
 music.setStep(4);await flush();
 assert.equal(music.activeAudio,a);
 assert.equal(a.src,"intro.mp3");
 close(a.volume,0);
 tick(700);close(a.volume,.4*Math.SQRT1_2);
 tick(700);close(a.volume,.4);
 assert.ok(!a.paused);
 const plays=a.events.filter(e=>e.startsWith("play:")).length;
 music.setStep(14);
 assert.equal(a.events.filter(e=>e.startsWith("play:")).length,plays);
});

test("cue change crossfades for 1.4 seconds; outgoing audio is not cut on change",async()=>{
 const {music,a,b,tick}=setup();
 music.setStep(4);await flush();tick(1400);
 music.setStep(15);await flush();
 assert.equal(music.activeAudio,b);
 assert.equal(a.paused,false);
 assert.equal(b.paused,false);
 close(a.volume,.4);
 close(b.volume,0);
 tick(700);
 close(a.volume,.4*Math.SQRT1_2);
 close(b.volume,.4*Math.SQRT1_2);
 tick(700);
 assert.equal(a.paused,true);
 assert.equal(b.paused,false);
 close(a.volume,0);close(b.volume,.4);
 assert.equal(b.src,"dialogue.mp3");
});

test("the 2/W master-volume adjustment preserves both fade envelopes",async()=>{
 const {music,a,b,tick}=setup();
 music.setStep(4);await flush();tick(1400);
 music.setStep(15);await flush();tick(700);
 music.setMasterVolume(.2);
 close(a.volume,.2*Math.SQRT1_2);
 close(b.volume,.2*Math.SQRT1_2);
 music.setMasterVolume(0);
 close(a.volume,0);close(b.volume,0);
 music.setMasterVolume(.4);tick(700);close(b.volume,.4);
});

test("Act II fades the last track out; rewinding into black stops immediately",async()=>{
 const {music,a,b,tick}=setup();
 music.setStep(174);await flush();tick(1400);
 const active=music.activeAudio;
 assert.equal(active.src,"final-transition.mp3");
 music.setStep(175);
 assert.equal(music.current,null);
 assert.equal(active.paused,false);
 tick(550);close(active.volume,.4*Math.SQRT1_2);
 tick(550);close(active.volume,0);
 assert.equal(active.paused,true);
 assert.deepEqual([a.src,b.src],["",""]);
 music.setStep(4);await flush();tick(1400);
 music.setStep(3);
 assert.ok(a.paused&&b.paused);
 assert.deepEqual([a.src,b.src],["",""]);
});

test("rapid switching cancels stale fades and leaves no overlapping tail",async()=>{
 const {music,a,b,tick}=setup();
 music.setStep(4);await flush();tick(1400);
 music.setStep(15);await flush();tick(350);
 music.setStep(91);await flush();tick(1400);
 assert.equal(music.current.src,"transition.mp3");
 assert.equal(music.activeAudio.paused,false);
 assert.equal([a,b].filter(x=>!x.paused).length,1);
 assert.equal(music.activeAudio.loop,false);
 music.setStep(92);await flush();tick(1400);
 assert.equal(music.current.src,"memory.mp3");
 assert.equal([a,b].filter(x=>!x.paused).length,1);
});

test("failed next-track playback reports error and retries without abruptly stopping old track",async()=>{
 const {music,a,b,errors,tick}=setup();
 music.setStep(4);await flush();tick(1400);
 let tries=0;
 b.play=function(){tries++;return tries===1?Promise.reject(new Error("blocked")):FakeAudio.prototype.play.call(this);};
 music.setStep(15);await flush();
 assert.deepEqual(errors,["blocked"]);
 assert.equal(music.failed,true);
 assert.equal(a.paused,false);
 music.setStep(16);await flush();tick(1400);
 assert.equal(tries,2);
 assert.equal(music.failed,false);
 assert.equal(a.paused,true);
 assert.equal(b.paused,false);
});

test("quickly advancing while the new file buffers keeps the audible old song",async()=>{
 const {music,a,b,tick}=setup();
 music.setStep(4);await flush();tick(1400);
 let attempts=0;
 b.play=function(){attempts++;if(attempts===1){this.paused=false;return new Promise(()=>{});}return FakeAudio.prototype.play.call(this);};
 music.setStep(15);
 close(a.volume,.4);
 music.setStep(91);await flush();
 assert.equal(music.current.src,"transition.mp3");
 assert.equal(a.paused,false,"audible song survives rapid jump");
 tick(700);
 assert.ok(a.volume>0&&b.volume>0);
 tick(700);
 assert.equal(a.paused,true);
 assert.equal(b.paused,false);
});
