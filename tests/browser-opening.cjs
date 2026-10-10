"use strict";
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "test-results");
const types = { ".html":"text/html", ".js":"text/javascript", ".png":"image/png", ".svg":"image/svg+xml", ".mp3":"audio/mpeg", ".mp4":"video/mp4" };

// A short, quiet PCM test tone exercises the optional audio slot. It is never
// shipped as a show effect or configured on the production page.
const effectFixture = Buffer.alloc(44 + 16000);
effectFixture.write("RIFF",0); effectFixture.writeUInt32LE(effectFixture.length-8,4);
effectFixture.write("WAVEfmt ",8); effectFixture.writeUInt32LE(16,16);
effectFixture.writeUInt16LE(1,20); effectFixture.writeUInt16LE(1,22);
effectFixture.writeUInt32LE(8000,24); effectFixture.writeUInt32LE(16000,28);
effectFixture.writeUInt16LE(2,32); effectFixture.writeUInt16LE(16,34);
effectFixture.write("data",36); effectFixture.writeUInt32LE(16000,40);
for(let i=0;i<8000;i++)effectFixture.writeInt16LE(Math.round(Math.sin(i*Math.PI*2*300/8000)*800),44+i*2);

const server = http.createServer((request, response) => {
  let requested;
  try { requested = decodeURIComponent(new URL(request.url, "http://localhost").pathname); }
  catch { response.writeHead(400).end(); return; }
  if(requested === "/test-fixtures/door-kick.wav") {
    response.writeHead(200,{"Content-Type":"audio/wav","Content-Length":effectFixture.length});
    response.end(effectFixture); return;
  }
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
    await page.waitForSelector('body[data-background-ready="true"][data-dark-background-ready="true"][data-video-ready="true"][data-audio-ready="true"][data-card-ready="true"]', {timeout:15000});
  } catch (error) {
    console.error("Media readiness",await page.evaluate(()=>({
      flags:{...document.body.dataset},
      media:Array.from(document.querySelectorAll("audio,video"),element=>({
        tag:element.tagName,readyState:element.readyState,networkState:element.networkState,
        error:element.error?.message||null
      }))
    })));
    await page.screenshot({path:path.join(output,"media-load-failure.png")}); throw error;
  }
}
async function flag(page, name, expected, timeout=35000) {
  await page.waitForFunction(({name,expected})=>document.body.dataset[name]===expected,{name,expected},{timeout});
}
async function cue(page, expected) { await flag(page,"cue",expected); }
async function state(page, expected) { await flag(page,"openingState",expected); }
async function roomState(page, expected) { await flag(page,"roomState",expected,15000); }
async function fastReveal(page) {
  await page.keyboard.press("Space"); await roomState(page,"playing");
  await page.locator('#roomRevealVideo').evaluate(video=>{video.currentTime=video.duration-.1;});
  await cue(page,"bright"); await page.waitForTimeout(350);
}
async function prepareWelcome(page) {
  await page.keyboard.press("Space"); await cue(page,"ai"); await page.waitForTimeout(1000);
  await page.keyboard.press("Space"); await cue(page,"door-kick"); await page.waitForTimeout(200);
}
async function expectedDifference(page, sourcePath, region=null, threshold=15) {
  return page.evaluate(async ({sourcePath,region,threshold})=>{
    const img=new Image(); img.src=sourcePath; await img.decode();
    const actual=document.getElementById("visualizer"),expected=document.createElement("canvas");
    expected.width=actual.width; expected.height=actual.height;
    const context=expected.getContext("2d"); context.fillStyle="#050505";
    context.fillRect(0,0,expected.width,expected.height);
    const scale=Math.min(expected.width/img.naturalWidth,expected.height/img.naturalHeight);
    const width=img.naturalWidth*scale,height=img.naturalHeight*scale;
    context.drawImage(img,(expected.width-width)/2,(expected.height-height)/2,width,height);
    const a=actual.getContext("2d").getImageData(0,0,actual.width,actual.height).data;
    const b=context.getImageData(0,0,expected.width,expected.height).data;
    let difference=0,samples=0,minX=actual.width,maxX=-1,minY=actual.height,maxY=-1;
    const bounds=region||[0,0,1,1];
    for(let py=Math.floor(bounds[1]*actual.height);py<bounds[3]*actual.height;py++)
      for(let px=Math.floor(bounds[0]*actual.width);px<bounds[2]*actual.width;px++){
        const index=(py*actual.width+px)*4;
        let changed=false;
        for(let channel=0;channel<3;channel++){
          const delta=Math.abs(a[index+channel]-b[index+channel]);
          difference+=delta;samples++;if(delta>threshold)changed=true;
        }
        if(changed){minX=Math.min(minX,px);maxX=Math.max(maxX,px);minY=Math.min(minY,py);maxY=Math.max(maxY,py);}
      }
    const dpr=actual.width/actual.clientWidth;
    return {mean:difference/samples,x:minX/dpr,y:minY/dpr,width:(maxX-minX+1)/dpr,
      height:(maxY-minY+1)/dpr,centerY:(minY+maxY)/2/dpr};
  },{sourcePath,region,threshold});
}
async function matchesStill(page, sourcePath, region=null) {
  const comparison=await expectedDifference(page,sourcePath,region);
  assert.ok(comparison.mean<1,`Projection must match ${sourcePath}; mean pixel error ${comparison.mean}`);
}
async function noControls(page) {
  assert.equal(await page.locator('button,input,select,[role="button"],audio[controls],video[controls]').count(),0);
  for(const id of ['openingAudio','roomRevealVideo','doorKickAudio'])assert.equal(await page.locator('#'+id).isVisible(),false);
  const box = await page.locator('#visualizer').boundingBox();
  const viewport = await page.evaluate(() => ({width:innerWidth,height:innerHeight,overflow:
    document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight}));
  assert.equal(box.x,0); assert.equal(box.y,0);
  assert.equal(box.width,viewport.width); assert.equal(box.height,viewport.height);
  assert.equal(viewport.overflow,false);
}
async function naturalAudioEnd(page) {
  await page.locator('#openingAudio').evaluate(audio=>{audio.currentTime=audio.duration-.1;});
  await state(page,"countdown"); await page.waitForTimeout(1100);
}
async function checkClockPlacement(page) {
  const viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));
  const bounds=await expectedDifference(page,"assets/backgrounds/IMG_0165.png",[.1,.2,.9,.55]);
  const expectedWidth=Math.min(viewport.width,viewport.height)*.23*.012*236*.37;
  assert.ok(Math.abs(bounds.centerY-viewport.height*.4)<6,`Clock Y must be 40%: ${JSON.stringify(bounds)}`);
  assert.ok(Math.abs(bounds.width-expectedWidth)<12,`Clock scale must be 37%: ${JSON.stringify(bounds)}`);
}

(async () => {
  fs.mkdirSync(output,{recursive:true});
  await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  let browser;
  const results=[];
  try {
    browser=await chromium.launch({channel:"chrome",args:["--autoplay-policy=user-gesture-required"]});
    const page=await browser.newPage({viewport:{width:1280,height:720}});
    const errors=[],requests=[];
    page.on("pageerror",error=>errors.push(String(error)));
    page.on("request",request=>requests.push(request.url()));
    await ready(page,url); await noControls(page); await page.waitForTimeout(150);
    await matchesStill(page,"assets/backgrounds/Start_dark.PNG");
    assert.equal(await page.locator('body').getAttribute('data-cue'),"dark");
    await page.screenshot({path:path.join(output,"00-dark.png")});
    await page.keyboard.press("Enter"); await page.keyboard.press("Shift+Space");
    await cue(page,"dark");
    await page.mouse.click(30,30); await roomState(page,"playing");
    const video=await page.locator('#roomRevealVideo').evaluate(v=>({muted:v.muted,inline:v.playsInline,loop:v.loop}));
    assert.deepEqual(video,{muted:true,inline:true,loop:false});
    await page.waitForTimeout(500); await page.screenshot({path:path.join(output,"01-room-reveal.png")});
    await page.keyboard.down("Space"); await page.keyboard.down("Space");
    // Let the supplied video finish naturally, without synthetic end events.
    await cue(page,"bright"); await page.waitForTimeout(400);
    await page.keyboard.down("Space");
    await matchesStill(page,"assets/backgrounds/IMG_0165.png");
    assert.equal(await page.locator('#openingAudio').evaluate(a=>a.currentTime),0);
    await page.screenshot({path:path.join(output,"02-bright-empty.png")});
    await page.keyboard.up("Space"); await page.keyboard.press("Space"); await cue(page,"ai");
    await page.keyboard.press("Space"); await cue(page,"ai"); // Fade cannot be skipped.
    await page.waitForTimeout(1000); await page.screenshot({path:path.join(output,"03-ai.png")});
    const ai=await expectedDifference(page,"assets/backgrounds/IMG_0165.png",[.1,.2,.9,.6],50);
    assert.ok(Math.abs(ai.centerY-720*.4)<12,"AI center must settle at Y=40%");
    await page.keyboard.press("Space"); await cue(page,"door-kick");
    assert.equal(await page.locator('body').getAttribute('data-effect-state'),"missing");
    assert.equal(await page.locator('#doorKickAudio').getAttribute('src'),null);
    await page.waitForTimeout(200); await page.keyboard.press("Space"); await state(page,"narration");
    await page.waitForTimeout(2200);
    const playing=await page.locator('#openingAudio').evaluate(a=>({time:a.currentTime,paused:a.paused}));
    assert.ok(playing.time>1); assert.equal(playing.paused,false);
    assert.equal(await page.evaluate(()=>opening.deadline),null);
    assert.ok(await page.evaluate(()=>smooth.some(v=>v>0)),"Real narration must reach the analyser");
    assert.equal(await page.evaluate(()=>document.fullscreenElement?.id),"visualizerWrap");
    await page.screenshot({path:path.join(output,"04-welcome.png")});
    await page.keyboard.press("Space"); await cue(page,"clock"); await page.waitForTimeout(1400);
    assert.equal(await page.evaluate(()=>transitions.clock.value),1);
    assert.equal(await page.evaluate(()=>stageOpening.remainingMs),900000);
    assert.equal(await page.evaluate(()=>opening.deadline),null);
    assert.equal(await page.locator('#openingAudio').evaluate(a=>a.paused),false);
    await page.screenshot({path:path.join(output,"05-clock-during-speech.png")});
    await page.waitForTimeout(1100);
    assert.equal(await page.evaluate(()=>stageOpening.remainingMs),900000);
    await page.keyboard.down("Space"); // Card is blocked while speech continues.
    await cue(page,"clock");
    // Play the entire supplied recording to its genuine natural end.
    await state(page,"countdown");
    assert.equal(await page.locator('#openingAudio').evaluate(a=>a.ended),true);
    const deadline=await page.evaluate(()=>opening.deadline);
    await page.waitForTimeout(1200); await page.keyboard.down("Space");
    await cue(page,"clock"); await page.keyboard.up("Space");
    assert.equal(await page.evaluate(()=>transitions.scene.value),0);
    await checkClockPlacement(page); await noControls(page);
    const remaining=await page.evaluate(()=>stageOpening.remainingMs);
    assert.ok(remaining>890000&&remaining<900000);
    await page.screenshot({path:path.join(output,"06-countdown.png")});
    results.push("natural MP4 and MP3 ends; eight separate cues, AI fade, waiting 15:00 during speech, automatic shrink and real countdown");

    await page.keyboard.press("Escape");
    for(const viewport of [{width:1920,height:1080},{width:1440,height:900},{width:390,height:844}]) {
      await page.setViewportSize(viewport); await page.waitForTimeout(100);
      await noControls(page); await checkClockPlacement(page);
    }
    await page.setViewportSize({width:1280,height:720}); await page.waitForTimeout(100);
    await page.keyboard.press("Space"); await cue(page,"card");
    await page.keyboard.press("Space"); await cue(page,"card");
    await page.waitForTimeout(500);
    const card=await expectedDifference(page,"assets/backgrounds/IMG_0165.png",[.1,.55,.9,.95]);
    assert.ok(card.width>400&&card.height>240,"Card must actually be projected below the clock");
    await page.screenshot({path:path.join(output,"07-card.png")});
    assert.equal(await page.evaluate(()=>opening.deadline),deadline);
    await page.keyboard.press("Space"); await cue(page,"card-hidden"); await page.waitForTimeout(500);
    await matchesStill(page,"assets/backgrounds/IMG_0165.png",[0,.55,1,1]);
    await page.screenshot({path:path.join(output,"08-card-hidden.png")});
    await page.keyboard.press("Space"); await cue(page,"blackout"); await page.waitForTimeout(1300);
    const brightest=await page.locator('#visualizer').evaluate(canvas=>{
      const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      let maximum=0;for(let i=0;i<data.length;i++)if(i%4!==3)maximum=Math.max(maximum,data[i]);return maximum;
    });
    assert.equal(brightest,0,"Every RGB pixel must be truly black");
    await page.screenshot({path:path.join(output,"09-blackout.png")});
    const hiddenRemaining=await page.evaluate(()=>stageOpening.remainingMs);
    await page.keyboard.press("Space"); await page.mouse.dblclick(30,30); await page.waitForTimeout(200);
    assert.equal(await page.evaluate(()=>opening.deadline),deadline);
    assert.ok(await page.evaluate(()=>stageOpening.remainingMs)<hiddenRemaining);
    await noControls(page);
    assert.equal(errors.length,0,errors.join("\n"));
    assert.ok(requests.every(request=>request.startsWith(url)),"Show assets must be local");
    await page.close();
    results.push("Y=40% and scale=37% measured from pixels at three aspect ratios; card show/hide, exact black pixels and uninterrupted deadline");

    const failedFullscreen=await browser.newPage();
    await failedFullscreen.addInitScript(()=>{HTMLElement.prototype.requestFullscreen=()=>Promise.reject(new Error("Unavailable"));});
    await ready(failedFullscreen,url); await fastReveal(failedFullscreen); await prepareWelcome(failedFullscreen);
    await failedFullscreen.keyboard.press("Space"); await state(failedFullscreen,"narration");
    await naturalAudioEnd(failedFullscreen); await cue(failedFullscreen,"welcome");
    assert.equal(await failedFullscreen.evaluate(()=>transitions.scene.value),0);
    await failedFullscreen.keyboard.press("Space"); await cue(failedFullscreen,"clock");
    await noControls(failedFullscreen); await failedFullscreen.close();
    results.push("Space-only operation and fullscreen rejection; automatic shrink also works before the manual clock cue");

    const videoRetry=await browser.newPage();
    await videoRetry.addInitScript(()=>{
      const play=HTMLMediaElement.prototype.play;let blocked=true;
      HTMLMediaElement.prototype.play=function(){if(this.tagName==="VIDEO"&&blocked){blocked=false;return Promise.reject(new DOMException("Blocked","NotAllowedError"));}return play.call(this);};
    });
    await ready(videoRetry,url); await videoRetry.mouse.click(30,30);
    await flag(videoRetry,"videoError","true"); await cue(videoRetry,"dark");
    await matchesStill(videoRetry,"assets/backgrounds/Start_dark.PNG");
    await videoRetry.mouse.dblclick(30,30); await roomState(videoRetry,"playing");
    await videoRetry.locator('#roomRevealVideo').evaluate(v=>{v.currentTime=v.duration-.1;});
    await cue(videoRetry,"bright"); await videoRetry.waitForTimeout(400);
    await matchesStill(videoRetry,"assets/backgrounds/IMG_0165.png");
    assert.equal(await videoRetry.locator('#openingAudio').evaluate(a=>a.currentTime),0);
    await videoRetry.close();
    results.push("blocked video returns to the original dark PNG; retry and double-click cannot spill into AI or speech");

    const audioRetry=await browser.newPage();
    await audioRetry.addInitScript(()=>{
      const play=HTMLMediaElement.prototype.play;let blocked=true;
      HTMLMediaElement.prototype.play=function(){if(this.id==="openingAudio"&&blocked){blocked=false;return Promise.reject(new DOMException("Blocked","NotAllowedError"));}return play.call(this);};
    });
    await ready(audioRetry,url); await fastReveal(audioRetry); await prepareWelcome(audioRetry);
    await audioRetry.keyboard.press("Space"); await flag(audioRetry,"audioError","true"); await cue(audioRetry,"door-kick");
    assert.equal(await audioRetry.evaluate(()=>opening.deadline),null);
    await audioRetry.keyboard.press("Space"); await state(audioRetry,"narration");
    await naturalAudioEnd(audioRetry); await audioRetry.close();
    results.push("blocked welcome voice retries without replaying the room or starting a false countdown");

    const effectPage=await browser.newPage();
    await effectPage.route('**/opening-config.js',route=>route.fulfill({contentType:'text/javascript',body:
      fs.readFileSync(path.join(root,'opening-config.js'),'utf8').replace('doorKick: null','doorKick: "test-fixtures/door-kick.wav"')}));
    await effectPage.addInitScript(()=>{
      const play=HTMLMediaElement.prototype.play;let blocked=true;
      HTMLMediaElement.prototype.play=function(){if(this.id==="doorKickAudio"&&blocked){blocked=false;return Promise.reject(new DOMException("Blocked","NotAllowedError"));}return play.call(this);};
    });
    await ready(effectPage,url); await fastReveal(effectPage);
    await effectPage.keyboard.press("Space"); await cue(effectPage,"ai"); await effectPage.waitForTimeout(1000);
    await effectPage.keyboard.press("Space"); await flag(effectPage,"effectState","error");
    assert.equal(await effectPage.locator('#openingAudio').evaluate(a=>a.currentTime),0);
    await effectPage.keyboard.press("Space"); await flag(effectPage,"effectState","playing");
    await effectPage.keyboard.press("Space"); await cue(effectPage,"door-kick");
    await flag(effectPage,"effectState","finished");
    assert.equal(await effectPage.locator('#doorKickAudio').evaluate(a=>a.ended),true);
    assert.equal(await effectPage.locator('#openingAudio').evaluate(a=>a.currentTime),0);
    await effectPage.keyboard.press("Space"); await state(effectPage,"narration");
    await noControls(effectPage); await effectPage.close();
    results.push("optional SFX slot tested with real PCM fixture playback, failure/retry and separate welcome cue; production stays explicitly silent until the effect is supplied");

    const touch=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
    await ready(touch,url); await touch.touchscreen.tap(190,420); await roomState(touch,"playing");
    await touch.locator('#roomRevealVideo').evaluate(v=>{v.currentTime=v.duration-.1;});
    await cue(touch,"bright"); await touch.waitForTimeout(400);
    await matchesStill(touch,"assets/backgrounds/IMG_0165.png");
    await touch.touchscreen.tap(190,420); await cue(touch,"ai"); await touch.waitForTimeout(1000);
    await touch.touchscreen.tap(190,420); await cue(touch,"door-kick"); await touch.waitForTimeout(200);
    await touch.touchscreen.tap(190,420); await state(touch,"narration");
    await noControls(touch); await touch.close();
    results.push("touch advances the separate room, AI, effect and voice cues with no visible controls");

    fs.writeFileSync(path.join(output,"browser-results.json"),JSON.stringify({passed:true,checks:results},null,2));
    for(const result of results)console.log("PASS",result);
  } finally {
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
