"use strict";
const assert=require("node:assert/strict");
const {once}=require("node:events");
const {chromium}=require("playwright");
const {createServer}=require("../server.cjs");
const subtitle=require("../subtitle-data");
const openingIndex=subtitle.entries.findIndex(e=>e.group==="opening");
const doorIndex=subtitle.entries.findIndex(e=>e.action==="doorOpen");

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
   await stage.waitForFunction(()=>!document.getElementById("startButton").disabled,null,{timeout:60000});
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
  // Failed readiness should explain which asset is still unavailable
  // instead of repeatedly timing out on a disabled Start button.
  try{
   await stage.waitForFunction(()=>!document.getElementById("startButton").disabled,null,{timeout:18000});
  }catch(error){
   const status=await stage.evaluate(()=>({
    buttonDisabled:document.getElementById("startButton").disabled,
    status:document.getElementById("startStatus").textContent,
    dataset:{...document.body.dataset},
    video:{state:document.getElementById("roomRevealVideo").readyState,
     error:document.getElementById("roomRevealVideo").error?.code},
    opening:{state:document.getElementById("openingAudio").readyState,
     error:document.getElementById("openingAudio").error?.code},
    endingVoice:{state:document.getElementById("endingVoiceAudio").readyState,
     error:document.getElementById("endingVoiceAudio").error?.code}
   }));
   throw new Error("Remote test projector assets blocked Start: "+JSON.stringify(status)+"; "+error.message);
  }
  await stage.locator("#startButton").click();
  await guestA.waitForFunction(()=>!document.querySelector('[data-action="next"]').disabled);
  await guestB.waitForFunction(()=>!document.querySelector('[data-action="next"]').disabled);
  assert.equal(await guestA.locator("#nextScenePrompt").isVisible(),true);
  assert.match(await guestA.locator("#nextPromptStep").textContent(),/第 1 步/);
  assert.equal(await guestA.locator("#stepContextList li").count(),4,
    "Next cue 1 has current cue 0, focus 1 and the following two cues");
  assert.deepEqual(await guestA.locator("#stepContextList li").evaluateAll(items=>
   items.map(row=>Number(row.dataset.step))),[0,1,2,3]);
  assert.equal(await guestA.locator("#stepContextList [aria-current=step]").count(),1);
  assert.match(await guestA.locator("#stepContextList").textContent(),/What is going on/);
  // The five-step context, sliders and meters must fit mobile landscapes.
  const previewLineCount=await guestA.locator("#stepContextList li").count();
  assert.equal(previewLineCount,4);
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
   assert.equal(await guestA.locator("#stepContextList li").count(),previewLineCount,
    "No neighboring step is discarded at "+viewport.width+"x"+viewport.height);
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
  assert.deepEqual(await guestB.locator("#stepContextList li").evaluateAll(items=>
   items.map(row=>Number(row.dataset.step))),[0,1,2,3,4]);
  assert.equal(await guestB.locator("#meterEffect").getAttribute("min"),"-60");
  // The controller can browse the entire scene catalog and jump across acts
  // without expanding the compact mixer or playing intermediate effects.
  await guestA.locator("#openStepList").click();
  await guestA.waitForFunction(()=>document.querySelectorAll('#remoteStepList [data-jump]').length===41);
  assert.equal(await guestA.locator('#remoteStepList [aria-current="step"]').count(),1);
  assert.equal(await guestA.locator('#remoteStepList [aria-current="step"]').getAttribute("data-jump"),"1");
  await guestA.locator("#stepSearch").fill("辦公室回憶");
  assert.equal(await guestA.locator("#remoteStepList [data-jump]").count(),1);
  assert.equal(await guestA.locator('#remoteStepList [data-jump="19"]').count(),1);
  await guestA.locator('#remoteStepList [data-jump="19"]').click();
  await guestB.waitForFunction(()=>document.getElementById("remoteStep").textContent.includes("第 19 步"));
  assert.equal(await stage.locator("body").getAttribute("data-cue"),"office-light");
  assert.equal(await stage.evaluate(()=>document.body.dataset.scene),"office");
  assert.equal(await guestA.locator("#stepDialog").isVisible(),false);
  await guestA.locator("#openStepList").click();
  await guestA.locator("#stepSearch").fill("The Button");
  assert.equal(await guestA.locator("#remoteStepList [data-jump]").count(),1);
  await guestA.locator('#remoteStepList [data-jump="40"]').click();
  await guestB.waitForFunction(()=>document.getElementById("remoteStep").textContent.includes("第 40 步"));
  assert.equal(await stage.locator("body").getAttribute("data-cue"),"credit-title");
  assert.equal(await stage.evaluate(()=>endCredits.activeId),"credit-title");
  await guestB.locator('[data-action="previous"]').click();
  await guestA.waitForFunction(()=>document.getElementById("remoteStep").textContent.includes("第 39 步"));
  assert.equal(await stage.evaluate(()=>endCredits.activeId),"credit-backgrounds");
  await stage.reload();
  await guestA.waitForFunction(()=>document.querySelector('[data-action="next"]').disabled);
  await guestB.waitForFunction(()=>document.querySelector('[data-action="next"]').disabled);
  await guestA.close();
  await guestB.close();

  // A remote command must start real AI narration without another
  // interaction on the projector. The same media continues across sentences.
  await start("/",`[data-script="${openingIndex-1}"]`,openingIndex-1);
  await remote.waitForFunction(index=>
   document.querySelector("#nextPromptStep")?.textContent.includes("第 "+index+" 步"),
   openingIndex);
  assert.equal(await remote.locator("#nextScenePrompt").isVisible(),true,
   "Subtitle mode must show the next operator cue before advancing");
  assert.ok((await remote.locator("#stepContextList").textContent())
   .includes(subtitle.entries[openingIndex].text.slice(0,14)),
   "Step context includes the actual upcoming subtitle text");
  assert.equal(await remote.locator("#stepContextList li").count(),5,
   "Script preview includes two prior, current and two upcoming steps");
  await next.tap();
  await waitForStep(openingIndex);
  await stage.waitForFunction(()=>!document.getElementById("openingAudio").paused &&
   scriptShow.active?.state==="playing");
  await remote.waitForFunction(()=>document.getElementById("remoteVoiceStatus").textContent.includes("語音播放中"));
  assert.equal(await next.isDisabled(),false,"During an AI paragraph, the next subtitle remains controllable");
  await next.tap();
  await waitForStep(openingIndex+1);
  await remote.waitForFunction(index=>
   document.getElementById("nextPromptStep").textContent.includes("第 "+index+" 步"),
   openingIndex+2);
  assert.equal(await stage.locator("#openingAudio").evaluate(media=>media.paused),false);
  // All remote controls, including the quick navigation button, stay usable
  // while the scripted subtitle hint is visible on small mobile screens.
  await remote.waitForFunction(()=>{
   const screen=document.querySelector("main").getBoundingClientRect();
   return screen.top>=-1&&screen.bottom<=innerHeight+1;
  });
  assert.equal(await remote.locator("#openStepList").isDisabled(),false);
  // Script-mode jump also uses the exact full manuscript list and must stop
  // the previous AI recording while activating the requested visual cue.
  await remote.locator("#openStepList").click();
  await remote.waitForFunction(total=>document.querySelectorAll('#remoteStepList [data-jump]').length===total,
   subtitle.entries.length);
  await remote.locator("#stepSearch").fill("Access to");
  assert.ok(await remote.locator("#remoteStepList [data-jump]").count()>0);
  await remote.locator("#stepSearch").fill(String(doorIndex));
  await remote.locator(`#remoteStepList [data-jump="${doorIndex}"]`).click();
  await waitForStep(doorIndex);
  assert.equal(await stage.evaluate(()=>scriptShow.index),doorIndex);
  assert.equal(await stage.locator("#openingAudio").evaluate(media=>media.paused),true);
  assert.equal(await stage.evaluate(()=>scriptShow.entry.action),"doorOpen");
  assert.deepEqual(await remote.locator("#stepContextList li").evaluateAll(items=>
   items.map(row=>Number(row.dataset.step))),
   [doorIndex-1,doorIndex,doorIndex+1,doorIndex+2,doorIndex+3]);
  assert.equal(await remote.locator("#nextScenePrompt").isVisible(),true);
  assert.match(await remote.locator("#nextPromptStep").textContent(),
   new RegExp("第 "+(doorIndex+1)+" 步"));

  // Scene mode permits the clock cue during narration, then gates the next
  // scene until the actual recording finishes. The remote must explain it.
  await start("/?mode=cues",'[data-preview="ai"]',2);
  await next.tap();
  await waitForStep(3);
  await stage.waitForFunction(()=>document.body.dataset.openingState==="narration" &&
   !document.getElementById("openingAudio").paused);
  await stage.waitForTimeout(1700);
  // The first sentence appears with voice playback; later sentences are
  // intentionally controlled by independent remote Next presses.
  const startTime=await stage.locator("#openingAudio").evaluate(media=>media.currentTime);
  for(let line=1;line<7;line++){
   await next.tap();
   await stage.waitForFunction(i=>window.sceneVoiceSubtitles.index===i,line);
   assert.equal(await stage.evaluate(()=>stageOpening.state),"welcome",
    "A caption press must not accidentally advance the scene");
  }
  assert.ok(await stage.locator("#openingAudio").evaluate(media=>media.currentTime)>=startTime);
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
  await start("/",`[data-script="${openingIndex-1}"]`,openingIndex-1);
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
  await waitForStep(openingIndex);
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
  await start("/",`[data-script="${doorIndex-1}"]`,doorIndex-1);
  await next.tap();
  try{
   await stage.waitForFunction(n=>Number(document.body.dataset.scriptIndex)===n,doorIndex,{timeout:8000});
   await stage.waitForFunction(()=>{const media=document.getElementById("scriptEffect-doorOpen");
    return media.currentTime>0||media.ended;},null,{timeout:8000});
  }catch(error){
   console.error("Scripted door remote diagnostic",await stage.evaluate(()=>({
    step:scriptShow.index,entry:scriptShow.entry,active:scriptShow.active?.state,
    effect:{src:document.getElementById("scriptEffect-doorOpen").src,
     time:document.getElementById("scriptEffect-doorOpen").currentTime,
     paused:document.getElementById("scriptEffect-doorOpen").paused,
     error:document.getElementById("scriptEffect-doorOpen").error?.message},
    stageFlags:{...document.body.dataset}
   })));
   throw error;
  }
  await remote.reload();
  await waitForStep(doorIndex);
  assert.equal(await remote.locator("#nextScenePrompt").isVisible(),true,
   "Subtitle next-step prompt must survive reconnect/reload");
  assert.match(await remote.locator("#nextPromptStep").textContent(),
   new RegExp("第 "+(doorIndex+1)+" 步"));
  await remote.locator("#sliderEffect").evaluate(slider=>{
   slider.value="95";
   slider.dispatchEvent(new Event("input",{bubbles:true}));
   slider.dispatchEvent(new Event("change",{bubbles:true}));
  });
  await remote.waitForFunction(()=>document.getElementById("remoteEffect").textContent==="95%");
  assert.equal(await stage.locator("#scriptEffect-doorOpen").evaluate(audio=>audio.volume),.95);
  // User's quoted example moves as early subtitles are split/merged.
  // Resolve its real index rather than assuming it remains cue 31.
  const quoteIndex=subtitle.entries.findIndex(entry=>
   entry.text?.includes("Didn’t we already do that? Can we just press the button?"));
  assert.ok(quoteIndex>2);
  await remote.locator("#openStepList").click();
  await remote.locator("#stepSearch").fill(String(quoteIndex-1));
  await remote.locator('#remoteStepList [data-jump="'+(quoteIndex-1)+'"]').click();
  await waitForStep(quoteIndex-1);
  const expectedWindow=Array.from({length:5},(_,i)=>quoteIndex-2+i);
  assert.deepEqual(await remote.locator("#stepContextList li").evaluateAll(rows=>
   rows.map(row=>Number(row.dataset.step))),expectedWindow);
  assert.equal(await remote.locator("#stepContextList [aria-current=step]").getAttribute("data-step"),
   String(quoteIndex-1));
  assert.equal(await remote.locator("#stepContextList li.is-next").getAttribute("data-step"),
   String(quoteIndex));
  assert.match(await remote.locator('#stepContextList [data-step="'+(quoteIndex-1)+'"]').textContent(),/MEGAN.*Ugh Fair/);
  assert.match(await remote.locator('#stepContextList [data-step="'+quoteIndex+'"]').textContent(),
   /RACHEL.*Didn’t we already do that\? Can we just press the button\?/);
  assert.match(await remote.locator('#stepContextList [data-step="'+(quoteIndex+1)+'"]').textContent(),/EVERYONE ELSE.*No!/);
  assert.match(await remote.locator('#stepContextList [data-step="'+(quoteIndex+2)+'"]').textContent(),
   /ETHAN.*We don't know just who the bot is/);
  await remote.reload();
  await waitForStep(quoteIndex-1);
  assert.deepEqual(await remote.locator("#stepContextList li").evaluateAll(rows=>
   rows.map(row=>Number(row.dataset.step))),expectedWindow,
   "The five-step context survives remote reconnect");
  await remote.setViewportSize({width:320,height:568});
  await remote.waitForFunction(()=>{
   const rect=document.querySelector("main").getBoundingClientRect();
   return rect.top>=-1&&rect.left>=-1&&rect.right<=innerWidth+1&&
    rect.bottom<=innerHeight+1;
  });
  assert.equal(await remote.locator("#stepContextList li").count(),5,
   "Even a short mobile remote must retain all five actual steps");
  await remote.setViewportSize({width:390,height:844});

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
