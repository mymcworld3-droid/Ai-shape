"use strict";
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "test-results");
const types = { ".html":"text/html", ".js":"text/javascript", ".png":"image/png", ".mp3":"audio/mpeg", ".mp4":"video/mp4" };

const server = http.createServer((request, response) => {
  let requested;
  try { requested = decodeURIComponent(new URL(request.url, "http://localhost").pathname); }
  catch { response.writeHead(400).end(); return; }
  const file = path.resolve(root, "." + (requested === "/" ? "/index.html" : requested));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404).end(); return;
  }
  const size = fs.statSync(file).size;
  const headers = { "Content-Type":types[path.extname(file).toLowerCase()] || "application/octet-stream", "Accept-Ranges":"bytes" };
  const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range || "");
  if (range) {
    const start = Number(range[1]), end = Math.min(size-1, range[2] ? Number(range[2]) : size-1);
    if (start > end) { response.writeHead(416, {"Content-Range":`bytes */${size}`}).end(); return; }
    response.writeHead(206, {...headers,"Content-Length":end-start+1,"Content-Range":`bytes ${start}-${end}/${size}`});
    fs.createReadStream(file,{start,end}).pipe(response);
  } else {
    response.writeHead(200,{...headers,"Content-Length":size}); fs.createReadStream(file).pipe(response);
  }
});

async function ready(page, url) {
  await page.goto(url);
  try {
    await page.waitForSelector('body[data-background-ready="true"][data-dark-background-ready="true"][data-video-ready="true"][data-audio-ready="true"]', {timeout:15000});
  } catch (error) {
    console.error("Media readiness",await page.evaluate(()=>({
      flags:{...document.body.dataset},
      media:Array.from(document.querySelectorAll("audio,video"),element=>({
        tag:element.tagName,readyState:element.readyState,networkState:element.networkState,
        error:element.error?.message||null,mp4:element.canPlayType('video/mp4; codecs="avc1.64001f, mp4a.40.2"')
      }))
    })));
    await page.screenshot({path:path.join(output,"media-load-failure.png")});
    throw error;
  }
}
async function state(page, expected) {
  await page.waitForFunction(value => document.body.dataset.openingState === value, expected, {timeout:35000});
}
async function roomState(page, expected) {
  await page.waitForFunction(value => document.body.dataset.roomState === value, expected, {timeout:15000});
}
async function fastReveal(page) {
  await page.keyboard.press("Space"); await roomState(page,"playing");
  await page.locator('#roomRevealVideo').evaluate(video=>{video.currentTime=video.duration-.1;});
  await roomState(page,"ready"); await page.waitForTimeout(400);
}
async function matchesStill(page, sourcePath, excludeMonitor=false) {
  const comparison=await page.evaluate(async ({sourcePath,excludeMonitor})=>{
    const img=new Image(); img.src=sourcePath; await img.decode();
    const actual=document.getElementById("visualizer"),expected=document.createElement("canvas");
    expected.width=actual.width; expected.height=actual.height;
    const context=expected.getContext("2d"); context.fillStyle="#050505";
    context.fillRect(0,0,expected.width,expected.height);
    const scale=Math.min(expected.width/img.naturalWidth,expected.height/img.naturalHeight);
    const width=img.naturalWidth*scale,height=img.naturalHeight*scale;
    const x=(expected.width-width)/2,y=(expected.height-height)/2;
    context.drawImage(img,x,y,width,height);
    const a=actual.getContext("2d").getImageData(0,0,actual.width,actual.height).data;
    const b=context.getImageData(0,0,expected.width,expected.height).data;
    let difference=0,samples=0;
    for(let py=0;py<actual.height;py+=16)for(let px=0;px<actual.width;px+=16){
      if(excludeMonitor&&px>x+width*.33&&px<x+width*.67&&py>y+height*.25&&py<y+height*.55)continue;
      const index=(py*actual.width+px)*4;
      for(let channel=0;channel<3;channel++){difference+=Math.abs(a[index+channel]-b[index+channel]);samples++;}
    }
    return difference/samples;
  },{sourcePath,excludeMonitor});
  assert.ok(comparison<1,`Projection must match ${sourcePath}; mean pixel error ${comparison}`);
}
async function noControls(page) {
  assert.equal(await page.locator('button,input,select,[role="button"],audio[controls],video[controls]').count(),0);
  assert.equal(await page.locator('#openingAudio').isVisible(),false);
  assert.equal(await page.locator('#roomRevealVideo').isVisible(),false);
  const box = await page.locator('#visualizer').boundingBox();
  const viewport = await page.evaluate(() => ({width:innerWidth,height:innerHeight,overflow:
    document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight}));
  assert.equal(box.x,0); assert.equal(box.y,0);
  assert.equal(box.width,viewport.width); assert.equal(box.height,viewport.height);
  assert.equal(viewport.overflow,false);
}

(async () => {
  fs.mkdirSync(output,{recursive:true});
  await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  let browser;
  const results=[];
  try {
    // Official Chrome includes the H.264/AAC codecs used by the supplied MP4;
    // Playwright's open-source Chromium build does not bundle every codec.
    browser=await chromium.launch({channel:"chrome",args:["--autoplay-policy=user-gesture-required"]});
    const page=await browser.newPage({viewport:{width:1280,height:720}});
    const errors=[];
    page.on("pageerror",error=>errors.push(String(error)));
    const requests=[]; page.on("request",request=>requests.push(request.url()));
    await ready(page,url); await noControls(page);
    await page.waitForTimeout(500);
    assert.equal(await page.locator('body').getAttribute('data-room-state'),"dark");
    assert.equal(await page.locator('body').getAttribute('data-opening-state'),"ready");
    assert.equal(await page.locator('#openingAudio').evaluate(audio=>audio.currentTime),0);
    assert.equal(await page.locator('#roomRevealVideo').evaluate(video=>video.currentTime),0);
    await matchesStill(page,"assets/backgrounds/Start_dark.PNG");
    await page.screenshot({path:path.join(output,"00-dark.png")});
    await page.keyboard.press("Enter"); await page.keyboard.press("Shift+Space");
    assert.equal(await page.locator('body').getAttribute('data-room-state'),"dark");
    // A click anywhere on the projection, including its letterbox, is the cue.
    await page.mouse.click(30,30); await roomState(page,"playing");
    await page.waitForTimeout(500);
    const clip=await page.locator('#roomRevealVideo').evaluate(video=>({paused:video.paused,time:video.currentTime,
      duration:video.duration,muted:video.muted,controls:video.controls,loop:video.loop,inline:video.playsInline}));
    assert.equal(clip.paused,false); assert.ok(clip.time>.1);
    assert.ok(clip.duration>4&&clip.duration<5);
    assert.equal(clip.muted,true); assert.equal(clip.controls,false);
    assert.equal(clip.loop,false); assert.equal(clip.inline,true);
    await noControls(page);
    assert.equal(await page.evaluate(()=>document.fullscreenElement?.id),"visualizerWrap");
    await page.screenshot({path:path.join(output,"01-room-video.png")});
    await page.keyboard.down("Space"); await page.keyboard.down("Space");
    await page.mouse.click(30,30); await page.mouse.click(30,30);
    assert.ok(await page.locator('#roomRevealVideo').evaluate(video=>video.currentTime)>=clip.time);
    assert.equal(await page.locator('#openingAudio').evaluate(audio=>audio.currentTime),0);
    assert.equal(await page.evaluate(()=>opening.deadline),null);
    // Play the entire supplied clip to its natural end, without seeking.
    await roomState(page,"ready"); await page.waitForTimeout(500);
    assert.equal(await page.locator('#roomRevealVideo').evaluate(video=>video.ended),true);
    assert.equal(await page.locator('#openingAudio').evaluate(audio=>audio.paused),true);
    assert.equal(await page.locator('#openingAudio').evaluate(audio=>audio.currentTime),0);
    await matchesStill(page,"assets/backgrounds/IMG_0165.png",true);
    await page.screenshot({path:path.join(output,"02-room-ready.png")});
    // A key held across the video end cannot spill into the narration cue.
    await page.keyboard.down("Space");
    assert.equal(await page.locator('body').getAttribute('data-opening-state'),"ready");
    await page.keyboard.up("Space");
    results.push("exact initial dark PNG, real full video playback from a click, no replay, natural end into original bright PNG; narration waits for a fresh cue");
    await page.keyboard.down("Space"); await state(page,"narration");
    await page.waitForTimeout(2000);
    const playing=await page.locator('#openingAudio').evaluate(audio=>({paused:audio.paused,time:audio.currentTime,duration:audio.duration}));
    assert.equal(playing.paused,false); assert.ok(playing.time>0.1);
    assert.ok(playing.duration>20 && playing.duration<30);
    assert.equal(await page.evaluate(()=>audioCtx.state),"running");
    assert.ok(await page.evaluate(()=>smooth.some(value=>value>0)),"Audio analyser receives real MP3 samples");
    assert.equal(await page.evaluate(()=>opening.deadline),null);
    await noControls(page);
    assert.equal(await page.evaluate(()=>document.fullscreenElement?.id),"visualizerWrap");
    await page.screenshot({path:path.join(output,"03-narration.png")});
    await page.keyboard.down("Space"); await page.keyboard.down("Space"); await page.keyboard.up("Space");
    await page.keyboard.press("Space");
    await page.mouse.click(30,30);
    assert.ok(await page.locator('#openingAudio').evaluate(audio=>audio.currentTime)>=playing.time);
    // Let the complete bundled recording really play to its natural media end.
    await state(page,"countdown");
    assert.equal(await page.locator('#openingAudio').evaluate(audio=>audio.ended),true);
    const deadline=await page.evaluate(()=>opening.deadline);
    await page.keyboard.press("Space"); await page.keyboard.press("Space");
    await page.mouse.click(30,30);
    assert.equal(await page.evaluate(()=>opening.deadline),deadline);
    await page.waitForTimeout(3000); await noControls(page);
    const remaining=await page.evaluate(()=>window.stageOpening.remainingMs);
    assert.ok(remaining>890000 && remaining<900000);
    assert.equal(await page.evaluate(()=>timerMorph),1);
    assert.equal(await page.evaluate(()=>timerSettle),1);
    assert.equal(await page.evaluate(()=>sceneProgress),0);
    await page.screenshot({path:path.join(output,"04-countdown.png")});
    results.push("complete real narration, audio analyser, fullscreen, natural ended event, 15-minute countdown and repeated keys");

    await page.keyboard.press("Escape"); await noControls(page);
    assert.equal(await page.evaluate(()=>opening.deadline),deadline);
    for(const viewport of [{width:1920,height:1080},{width:1440,height:900},{width:390,height:844}]) {
      await page.setViewportSize(viewport); await page.waitForTimeout(100); await noControls(page);
      const fits=await page.evaluate(()=>{const m=monitorLayout(),b=backgroundLayout();return m.x-m.width/2>=b.x &&
        m.y-m.height/2>=b.y && m.x+m.width/2<=b.x+b.width && m.y+m.height/2<=b.y+b.height;});
      assert.equal(fits,true);
    }
    assert.equal(errors.length,0,errors.join("\n"));
    assert.ok(requests.every(request=>request.startsWith(url)),"Runtime requires no external network assets");
    await page.close();
    results.push("Escape, 1920x1080, 1440x900 and 390x844 layouts; no controls or external requests");

    const failedFullscreen=await browser.newPage();
    await failedFullscreen.addInitScript(()=>{
      HTMLElement.prototype.requestFullscreen=()=>Promise.reject(new Error("Fullscreen unavailable"));
    });
    await ready(failedFullscreen,url); await fastReveal(failedFullscreen);
    await failedFullscreen.keyboard.press("Space"); await state(failedFullscreen,"narration");
    assert.equal(await failedFullscreen.locator('#openingAudio').evaluate(audio=>audio.paused),false);
    await failedFullscreen.locator('#openingAudio').evaluate(audio=>{audio.currentTime=audio.duration-.1;});
    await state(failedFullscreen,"countdown"); await noControls(failedFullscreen); await failedFullscreen.close();
    results.push("Space-only reveal; fullscreen rejection does not block the room, narration or countdown");

    const videoRetry=await browser.newPage();
    await videoRetry.addInitScript(()=>{
      const play=HTMLMediaElement.prototype.play; let blocked=true;
      HTMLMediaElement.prototype.play=function(){
        if(this.tagName==="VIDEO"&&blocked){blocked=false;return Promise.reject(new DOMException("Blocked","NotAllowedError"));}
        return play.call(this);
      };
    });
    await ready(videoRetry,url); await videoRetry.mouse.click(30,30);
    await videoRetry.waitForSelector('body[data-video-error="true"][data-room-state="dark"]');
    await matchesStill(videoRetry,"assets/backgrounds/Start_dark.PNG");
    assert.equal(await videoRetry.locator('#openingAudio').evaluate(audio=>audio.currentTime),0);
    await videoRetry.mouse.dblclick(30,30); await roomState(videoRetry,"playing");
    await videoRetry.locator('#roomRevealVideo').evaluate(video=>{video.currentTime=video.duration-.1;});
    await roomState(videoRetry,"ready"); await videoRetry.waitForTimeout(400);
    assert.equal(await videoRetry.locator('#openingAudio').evaluate(audio=>audio.currentTime),0);
    await videoRetry.mouse.click(30,30); await state(videoRetry,"narration");
    await videoRetry.locator('#openingAudio').evaluate(audio=>{audio.currentTime=audio.duration-.1;});
    await state(videoRetry,"countdown"); await noControls(videoRetry); await videoRetry.close();
    results.push("blocked video returns to the exact dark PNG; click retry, double-click protection and a fresh click narration cue");

    const retry=await browser.newPage();
    await retry.addInitScript(()=>{
      const play=HTMLMediaElement.prototype.play; let blocked=true;
      HTMLMediaElement.prototype.play=function(){
        if(this.tagName==="AUDIO"&&blocked){blocked=false;return Promise.reject(new DOMException("Blocked","NotAllowedError"));}
        return play.call(this);
      };
    });
    await ready(retry,url); await fastReveal(retry); await retry.keyboard.press("Space");
    await retry.waitForSelector('body[data-audio-error="true"][data-opening-state="ready"]');
    assert.equal(await retry.evaluate(()=>opening.deadline),null);
    await retry.keyboard.press("Space"); await state(retry,"narration");
    await retry.locator('#openingAudio').evaluate(audio=>{audio.currentTime=audio.duration-.1;});
    await state(retry,"countdown"); await retry.close();
    results.push("browser playback failure permits a second key retry without a false countdown");

    const touch=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
    await ready(touch,url); await noControls(touch);
    await matchesStill(touch,"assets/backgrounds/Start_dark.PNG");
    await touch.touchscreen.tap(190,420); await roomState(touch,"playing");
    await noControls(touch);
    await touch.locator('#roomRevealVideo').evaluate(video=>{video.currentTime=video.duration-.1;});
    await roomState(touch,"ready"); await touch.waitForTimeout(400);
    await matchesStill(touch,"assets/backgrounds/IMG_0165.png",true);
    assert.equal(await touch.locator('#openingAudio').evaluate(audio=>audio.currentTime),0);
    await noControls(touch); await touch.close();
    results.push("390x844 touch reveal, correct stills before and after video, no controls or automatic narration");
    fs.writeFileSync(path.join(output,"browser-results.json"),JSON.stringify({passed:true,checks:results},null,2));
    for(const result of results)console.log("PASS",result);
  } finally {
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
