"use strict";
const assert=require("node:assert/strict");
const {once}=require("node:events");
const {chromium}=require("playwright");
const {createServer}=require("../server.cjs");

(async()=>{
 const server=createServer();
 server.listen(0,"127.0.0.1");
 await once(server,"listening");
 const origin="http://127.0.0.1:"+server.address().port;
 let browser;
 try{
  browser=await chromium.launch({
   ...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{channel:"chrome"}),
   args:["--autoplay-policy=user-gesture-required"]
  });
  const stage=await browser.newPage({viewport:{width:1440,height:900}});
  const remote=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors=[];
  for(const page of [stage,remote])page.on("pageerror",error=>errors.push(String(error)));
  const next=remote.locator('[data-action="next"]');
  const waitForStep=index=>remote.waitForFunction(n=>
   document.getElementById("remoteStep").textContent.includes("第 "+n+" 步"),index);

  async function start(path,cue,index){
   await stage.goto(origin+path);
   await stage.locator("#stepsViewButton").click();
   await stage.locator(cue).click();
   await stage.locator("#remotePairButton").click();
   await stage.locator("#remotePairLink").waitFor({state:"visible"});
   await remote.goto(await stage.locator("#remotePairLink").inputValue());
   await waitForStep(index);
   assert.equal(await next.isDisabled(),true);
   await stage.waitForFunction(()=>document.getElementById("remotePairStatus").textContent==="操控端已連線");
   assert.equal(await stage.locator("body").getAttribute("data-started"),"false");
   await stage.getByRole("button",{name:"關閉",exact:true}).click();
   await stage.locator("#startButton").click();
   await remote.waitForFunction(()=>!document.querySelector('[data-action="next"]').disabled);
   assert.equal(await stage.locator("#remotePairButton").isVisible(),false);
  }

  // Without any pairing, one started projector is remotely controllable by
  // multiple browser tabs. These pages never open the projection itself.
  const guestA=await browser.newPage({viewport:{width:390,height:844}});
  const guestB=await browser.newPage({viewport:{width:390,height:844}});
  for(const page of [guestA,guestB])page.on("pageerror",error=>errors.push(String(error)));
  await stage.goto(origin+"/?mode=cues");
  assert.equal(await stage.locator("#remoteControlPageButton").isVisible(),true);
  await guestA.goto(origin+"/remote.html");
  await guestB.goto(origin+"/remote.html");
  assert.equal(await guestA.locator('[data-action="next"]').isDisabled(),true);
  assert.equal(await guestB.locator('[data-action="next"]').isDisabled(),true);
  await stage.locator("#startButton").click();
  await guestA.waitForFunction(()=>!document.querySelector('[data-action="next"]').disabled);
  await guestB.waitForFunction(()=>!document.querySelector('[data-action="next"]').disabled);
  assert.equal(await guestA.locator("#nextScenePrompt").isVisible(),true);
  assert.match(await guestA.locator("#nextPromptStep").textContent(),/第 1 步/);
  assert.match(await guestA.locator("#nextPromptLines").textContent(),/What is going on/);
  // Scene preview now keeps both preceding spoken lines, in original order.
  assert.equal(await guestA.locator("#nextPromptLeads li").count(),2);
  assert.deepEqual((await guestA.locator("#nextPromptLeads li").allTextContents())
   .map(text=>text.trim()),[
    "RACHEL： What the hell..?",
    "MEGAN： Wait, where am I?"
   ]);
  // The whole scene remote must fit without scrolling, even in iPad Safari
  // Split View and short mobile landscapes. Retain every actual preview line,
  // all three sliders and meters, cue navigation and volume visibility toggle.
  const previewLineCount=await guestA.locator("#nextPromptLines li").count();
  const leadLineCount=await guestA.locator("#nextPromptLeads li").count();
  assert.ok(previewLineCount>0);
  for(const viewport of [
   {width:640,height:900},{width:390,height:844},
   {width:390,height:667},{width:320,height:568},{width:600,height:500}
  ]){
   await guestA.setViewportSize(viewport);
   await guestA.waitForFunction(({width,height})=>{
    const main=document.querySelector("main"),rect=main.getBoundingClientRect();
    const parts=["header",".cue",".navigation","#nextScenePrompt",".mixer",
     '[data-action="previous"]','[data-action="next"]',
     "#sliderVoice","#sliderEffect","#sliderMusic",
     "#meterVoice","#meterEffect","#meterMusic",
     '[data-action="toggleVolumeDisplay"]'];
    return Math.abs(window.innerWidth-width)<=1&&Math.abs(window.innerHeight-height)<=1&&
     rect.left>=-1&&rect.right<=width+1&&rect.top>=-1&&rect.bottom<=height+1&&
     parts.every(selector=>{
      const el=document.querySelector(selector),r=el?.getBoundingClientRect();
      return r&&r.width>0&&r.height>0&&r.left>=-1&&
       r.right<=width+1&&r.top>=-1&&r.bottom<=height+1;
     });
   },viewport,{timeout:5000});
   assert.equal(await guestA.locator("#nextPromptLines li").count(),previewLineCount,
    "No prompt dialogue is discarded at "+viewport.width+"x"+viewport.height);
   assert.equal(await guestA.locator("#nextPromptLeads li").count(),leadLineCount,
    "No preceding dialogue is discarded at "+viewport.width+"x"+viewport.height);
   assert.equal(await guestA.evaluate(()=>getComputedStyle(document.body).overflowY),"hidden");
  }
  await guestA.setViewportSize({width:390,height:844});
  await guestA.locator("#sliderEffect").evaluate(slider=>{
   slider.value="95";
   slider.dispatchEvent(new Event("input",{bubbles:true}));
   slider.dispatchEvent(new Event("change",{bubbles:true}));
  });
  await guestA.waitForFunction(()=>document.getElementById("remoteEffect").textContent==="95%");
  await guestB.waitForFunction(()=>document.getElementById("remoteEffect").textContent==="95%");
  await guestA.locator('[data-action="next"]').click();
  await guestB.waitForFunction(()=>document.getElementById("remoteStep").textContent.includes("第 1 步"));
  assert.match(await guestB.locator("#nextPromptStep").textContent(),/第 2 步/);
  assert.equal(await guestB.locator("#meterEffect").getAttribute("min"),"-60");
  await stage.reload();
  await guestA.waitForFunction(()=>document.querySelector('[data-action="next"]').disabled);
  await guestB.waitForFunction(()=>document.querySelector('[data-action="next"]').disabled);
  await guestA.close();
  await guestB.close();

  // A remote command must start real AI narration without another
  // interaction on the projector. The same media continues across sentences.
  await start("/",'[data-script="6"]',6);
  await next.tap();
  await waitForStep(7);
  await stage.waitForFunction(()=>!document.getElementById("openingAudio").paused &&
   scriptShow.active?.state==="playing");
  await remote.waitForFunction(()=>document.getElementById("remoteVoiceStatus").textContent.includes("語音播放中"));
  assert.equal(await next.isDisabled(),false,"During an AI paragraph, the next subtitle remains controllable");
  await next.tap();
  await waitForStep(8);
  assert.equal(await stage.locator("#openingAudio").evaluate(media=>media.paused),false);

  // Scene mode permits the clock cue during narration, then gates the next
  // scene until the actual recording finishes. The remote must explain it.
  await start("/?mode=cues",'[data-preview="ai"]',2);
  await next.tap();
  await waitForStep(3);
  await stage.waitForFunction(()=>document.body.dataset.openingState==="narration" &&
   !document.getElementById("openingAudio").paused);
  await stage.waitForTimeout(1700);
  await next.tap();
  await waitForStep(4);
  await remote.waitForFunction(()=>document.querySelector('[data-action="next"]').disabled &&
   document.getElementById("remoteVoiceStatus").textContent.includes("結束後即可切換"));
  await stage.locator("#openingAudio").evaluate(media=>{
   if(Number.isFinite(media.duration))media.currentTime=Math.max(0,media.duration-.15);
  });
  await remote.waitForFunction(()=>!document.querySelector('[data-action="next"]').disabled);
  // A transient NotAllowedError recovers without anyone tapping the projector.
  await start("/?mode=cues",'[data-preview="ai"]',2);
  await stage.evaluate(()=>{
   const nativePlay=HTMLMediaElement.prototype.play;
   let blocked=false;
   HTMLMediaElement.prototype.play=function(){
    if(this.id==="openingAudio"&&!blocked){
     blocked=true;
     return Promise.reject(new DOMException("Temporary block","NotAllowedError"));
    }
    return nativePlay.call(this);
   };
  });
  await next.tap();
  await waitForStep(3);
  await stage.waitForFunction(()=>document.body.dataset.audioRecovery==="retrying");
  await stage.waitForFunction(()=>document.body.dataset.openingState==="narration" &&
   !document.getElementById("openingAudio").paused);
  assert.equal(await stage.locator("#audioUnlockDock").isVisible(),false);
  assert.equal(await stage.locator("body").getAttribute("data-audio-recovery"),"ready");

  // Script-mode narration receives the same hands-free recovery. A
  // successful retry must not advance or repeat subtitle sentences.
  await start("/",'[data-script="6"]',6);
  await stage.evaluate(()=>{
   const nativePlay=HTMLMediaElement.prototype.play;
   let rejected=false;
   HTMLMediaElement.prototype.play=function(){
    if(this.id==="openingAudio"&&!rejected){
     rejected=true;
     return Promise.reject(new DOMException("Temporary script voice block","NotAllowedError"));
    }
    return nativePlay.call(this);
   };
  });
  await next.tap();
  await waitForStep(7);
  await stage.waitForFunction(()=>document.body.dataset.scriptVoice==="opening:playing"&&
   !document.getElementById("openingAudio").paused);
  assert.equal(await stage.evaluate(()=>scriptShow.index),7);
  assert.equal(await stage.locator("#audioUnlockDock").isVisible(),false);

  // Persistently blocked browser playback cannot be bypassed by timers.
  // Only then display the one local permission-recovery button.
  await start("/?mode=cues",'[data-preview="ai"]',2);
  await stage.evaluate(()=>{
   const nativePlay=HTMLMediaElement.prototype.play;
   let permission=false;
   const unlock=document.getElementById("audioUnlockButton");
   unlock.addEventListener("pointerdown",()=>{permission=true;},{once:true});
   HTMLMediaElement.prototype.play=function(){
    if(this.id==="openingAudio"&&!permission)
     return Promise.reject(new DOMException("Gesture required","NotAllowedError"));
    return nativePlay.call(this);
   };
  });
  await next.tap();
  await waitForStep(3);
  await stage.locator("#audioUnlockButton").waitFor({state:"visible",timeout:10000});
  await remote.waitForFunction(()=>
   document.getElementById("remoteVoiceStatus").textContent.includes("自動重試仍遭瀏覽器阻擋"));
  await stage.locator("#audioUnlockButton").click();
  await stage.waitForFunction(()=>document.body.dataset.openingState==="narration" &&
   !document.getElementById("openingAudio").paused);
  assert.equal(await stage.locator("#audioUnlockDock").isVisible(),false);
  await start("/",'[data-script="75"]',75);
  await next.tap();
  await stage.waitForFunction(()=>document.body.dataset.scriptIndex==="76"&&
   document.getElementById("scriptEffect-doorOpen").currentTime>0);
  await remote.reload();
  await waitForStep(76);
  assert.equal(await remote.locator("#nextScenePrompt").isVisible(),false);
  await remote.locator("#sliderEffect").evaluate(slider=>{
   slider.value="95";
   slider.dispatchEvent(new Event("input",{bubbles:true}));
   slider.dispatchEvent(new Event("change",{bubbles:true}));
  });
  await remote.waitForFunction(()=>document.getElementById("remoteEffect").textContent==="95%");
  assert.equal(await stage.locator("#scriptEffect-doorOpen").evaluate(audio=>audio.volume),.95);

  await start("/?mode=cues",'[data-preview="card-hidden"]',7);
  await next.tap();
  await stage.waitForFunction(()=>document.body.dataset.cue==="door-open"&&
   document.getElementById("memoryDoorOpenAudio").currentTime>.1);
  await waitForStep(8);
  const levels=await stage.evaluate(()=>window.stageAudioLevels());
  for(const channel of ["voice","effect","music"])assert.ok(
   Number.isInteger(levels[channel])&&levels[channel]>=-60&&levels[channel]<=0);
  await remote.locator('[data-action="previous"]').tap();
  await waitForStep(7);
  assert.deepEqual(errors,[]);
  console.log("PASS paired browsers control real cues and audio in both modes");
 }finally{
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
