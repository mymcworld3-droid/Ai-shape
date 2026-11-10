"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {Controller,trackForStep}=require("../act-one-audio.js");

const tracks=[
 {from:23,to:29,src:"intro.mp3"},
 {from:30,to:98,src:"dialogue.mp3"},
 {from:99,to:103,src:"transition.mp3",loop:false},
 {from:104,to:178,src:"memory.mp3"},
 {from:179,to:184,src:"final-transition.mp3",loop:false},
 {from:290,to:402,src:"act3.mp3"},
 {from:407,to:415,src:"act4.m4a"}
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

test("all 32 scene cues cover Act IV as well as the existing soundtrack",()=>{
 const fs=require('node:fs'),vm=require('node:vm');
 const source=fs.readFileSync(require.resolve('../opening-config.js'),'utf8');
 const context={window:{}};vm.runInNewContext(source,context);
 const config=context.window.OPENING_CONFIG;
 const {STAGE_START_CUES}=require('../opening-controller.js');
 const cueSteps=config.sceneMusicSteps;
 assert.equal(Object.keys(cueSteps).length,34);
 assert.equal(cueSteps.dark,20);
 assert.equal(trackForStep(cueSteps.dark,config.actOneMusic),null);
 assert.equal(trackForStep(cueSteps['room-reveal'],config.actOneMusic).src,
  'assets/audio/background/act-1/1-14.mp3');
 for(const cue of STAGE_START_CUES){
  assert.equal(Number.isInteger(cueSteps[cue]),true,'missing paragraph for '+cue);
  const track=trackForStep(cueSteps[cue],config.actOneMusic);
  if(['dark','vote-blackout','ending-blackout'].includes(cue))assert.equal(track,null,'pre-show and blackouts remain silent');
  else assert.ok(track,'no music for '+cue);
 }
 assert.equal(trackForStep(cueSteps.card,config.actOneMusic).src,
  'assets/audio/background/act-1/15-91.mp3');
 assert.equal(trackForStep(cueSteps['door-open'],config.actOneMusic).src,
  'assets/audio/background/act-1/15-91.mp3');
 assert.equal(trackForStep(cueSteps.blackout,config.actOneMusic).src,
  'assets/audio/background/act-1/91-92(轉場).mp3');
 assert.equal(trackForStep(cueSteps['memory-light'],config.actOneMusic).src,
  'assets/audio/background/act-1/92-174.mp3');
 assert.equal(trackForStep(cueSteps['memory-blackout'],config.actOneMusic).src,
  'assets/audio/background/act-1/174-175(轉場).mp3');
 assert.equal(trackForStep(cueSteps['past-intro'],config.actOneMusic).src,
  'assets/audio/background/act-2/175-180.mp3');
 assert.equal(trackForStep(cueSteps['office-light'],config.actOneMusic).src,
  'assets/audio/background/act-2/181-263.mp3');
 assert.equal(trackForStep(cueSteps['past-reflection'],config.actOneMusic).src,
  'assets/audio/background/act-2/264-277.mp3');
 assert.equal(trackForStep(cueSteps['discussion'],config.actOneMusic).src,
  'assets/audio/background/act-3/Act3.mp3');
 assert.equal(trackForStep(cueSteps['ending-light'],config.actOneMusic).src,
  'assets/audio/background/act-4/Act4.m4a');
 assert.equal(trackForStep(cueSteps['ending-reveal'],config.actOneMusic).src,
  'assets/audio/background/act-4/Act4.m4a');
});
 
test("opening first three steps are pure silence; cue 4 fades the first track in",async()=>{
 const {music,a,b,tick}=setup();
 for(let step=20;step<=22;step++)music.setStep(step);
 assert.equal(trackForStep(22,tracks),null);
 assert.ok(a.paused&&b.paused);
 assert.deepEqual([a.src,b.src],["",""]);
 music.setStep(23);await flush();
 assert.equal(music.activeAudio,a);
 assert.equal(a.src,"intro.mp3");
 close(a.volume,0);
 tick(700);close(a.volume,.4*Math.SQRT1_2);
 tick(700);close(a.volume,.4);
 assert.ok(!a.paused);
 const plays=a.events.filter(e=>e.startsWith("play:")).length;
 music.setStep(29);
 assert.equal(a.events.filter(e=>e.startsWith("play:")).length,plays);
});

test("cue change crossfades for 1.4 seconds; outgoing audio is not cut on change",async()=>{
 const {music,a,b,tick}=setup();
 music.setStep(23);await flush();tick(1400);
 music.setStep(30);await flush();
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

test("the 3/E master-volume adjustment preserves both fade envelopes",async()=>{
 const {music,a,b,tick}=setup();
 music.setStep(23);await flush();tick(1400);
 music.setStep(30);await flush();tick(700);
 music.setMasterVolume(.2);
 close(a.volume,.2*Math.SQRT1_2);
 close(b.volume,.2*Math.SQRT1_2);
 music.setMasterVolume(0);
 close(a.volume,0);close(b.volume,0);
 music.setMasterVolume(.4);tick(700);close(b.volume,.4);
});

test("Act II fades the last track out; rewinding into black stops immediately",async()=>{
 const {music,a,b,tick}=setup();
 music.setStep(179);await flush();tick(1400);
 const active=music.activeAudio;
 assert.equal(active.src,"final-transition.mp3");
 music.setStep(186);
 assert.equal(music.current,null);
 assert.equal(active.paused,false);
 tick(550);close(active.volume,.4*Math.SQRT1_2);
 tick(550);close(active.volume,0);
 assert.equal(active.paused,true);
 assert.deepEqual([a.src,b.src],["",""]);
 music.setStep(23);await flush();tick(1400);
 music.setStep(22);
 assert.ok(a.paused&&b.paused);
 assert.deepEqual([a.src,b.src],["",""]);
});

test("Act III music starts on paragraph 290, repeats through 402, and fades at blackout 403",async()=>{
 const {music,a,b,tick}=setup();
 for(const step of [185,186,289])music.setStep(step);
 assert.equal(trackForStep(289,tracks),null);
 assert.ok(a.paused&&b.paused);
 music.setStep(290);await flush();
 assert.equal(music.current.src,"act3.mp3");
 assert.equal(music.activeAudio.src,"act3.mp3");
 assert.equal(music.activeAudio.loop,true);
 tick(1400);close(music.activeAudio.volume,.4);
 const active=music.activeAudio,plays=active.events.filter(e=>e==="play:act3.mp3").length;
 for(const step of [291,365,388,402])music.setStep(step);
 assert.equal(music.activeAudio,active);
 assert.equal(active.events.filter(e=>e==="play:act3.mp3").length,plays);
 music.setMasterVolume(.2);close(active.volume,.2);
 music.setStep(403);
 assert.equal(music.current,null);
 assert.equal(active.paused,false);
 tick(550);close(active.volume,.2*Math.SQRT1_2);
 tick(550);assert.equal(active.paused,true);
 assert.deepEqual([a.src,b.src],["",""]);
 music.setStep(402);await flush();tick(1400);
 assert.equal(music.current.src,"act3.mp3");
});
test("Act IV audio-only AAC plays from paragraph 407 through 415 and fades at the final blackout",async()=>{
 const {music,a,b,tick}=setup();
 for(const step of [403,404,406])music.setStep(step);
 assert.equal(trackForStep(406,tracks),null);
 assert.ok(a.paused&&b.paused);
 music.setStep(407);await flush();
 assert.equal(music.current.src,"act4.m4a");
 assert.equal(music.activeAudio.src,"act4.m4a");
 assert.equal(music.activeAudio.loop,true);
 tick(1400);close(music.activeAudio.volume,.4);
 const active=music.activeAudio,plays=active.events.filter(e=>e==="play:act4.m4a").length;
 for(const step of [408,409,410,414,415])music.setStep(step);
 assert.equal(music.activeAudio,active);
 assert.equal(active.events.filter(e=>e==="play:act4.m4a").length,plays);
 music.setMasterVolume(.22);close(active.volume,.22);
 music.setStep(416);assert.equal(music.current,null);
 tick(550);close(active.volume,.22*Math.SQRT1_2);
 tick(550);assert.ok(active.paused);
 assert.deepEqual([a.src,b.src],["",""]);
 music.setStep(407);await flush();
 assert.equal(music.current.src,"act4.m4a","rehearsal jump must replay the soundtrack");
});
test("rapid switching cancels stale fades and leaves no overlapping tail",async()=>{
 const {music,a,b,tick}=setup();
 music.setStep(23);await flush();tick(1400);
 music.setStep(30);await flush();tick(350);
 music.setStep(99);await flush();tick(1400);
 assert.equal(music.current.src,"transition.mp3");
 assert.equal(music.activeAudio.paused,false);
 assert.equal([a,b].filter(x=>!x.paused).length,1);
 assert.equal(music.activeAudio.loop,false);
 music.setStep(104);await flush();tick(1400);
 assert.equal(music.current.src,"memory.mp3");
 assert.equal([a,b].filter(x=>!x.paused).length,1);
});

test("failed next-track playback reports error and retries without abruptly stopping old track",async()=>{
 const {music,a,b,errors,tick}=setup();
 music.setStep(23);await flush();tick(1400);
 let tries=0;
 b.play=function(){tries++;return tries===1?Promise.reject(new Error("blocked")):FakeAudio.prototype.play.call(this);};
 music.setStep(30);await flush();
 assert.deepEqual(errors,["blocked"]);
 assert.equal(music.failed,true);
 assert.equal(a.paused,false);
 music.setStep(31);await flush();tick(1400);
 assert.equal(tries,2);
 assert.equal(music.failed,false);
 assert.equal(a.paused,true);
 assert.equal(b.paused,false);
});

test("quickly advancing while the new file buffers keeps the audible old song",async()=>{
 const {music,a,b,tick}=setup();
 music.setStep(23);await flush();tick(1400);
 let attempts=0;
 b.play=function(){attempts++;if(attempts===1){this.paused=false;return new Promise(()=>{});}return FakeAudio.prototype.play.call(this);};
 music.setStep(30);
 close(a.volume,.4);
 music.setStep(99);await flush();
 assert.equal(music.current.src,"transition.mp3");
 assert.equal(a.paused,false,"audible song survives rapid jump");
 tick(700);
 assert.ok(a.volume>0&&b.volume>0);
 tick(700);
 assert.equal(a.paused,true);
 assert.equal(b.paused,false);
});
