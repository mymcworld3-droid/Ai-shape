"use strict";
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "test-results");
const types = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".png":"image/png", ".svg":"image/svg+xml", ".mp3":"audio/mpeg", ".mp4":"video/mp4" };

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
const memoryVoiceFixture=Buffer.alloc(44+48000);
effectFixture.copy(memoryVoiceFixture,0,0,44);
memoryVoiceFixture.writeUInt32LE(memoryVoiceFixture.length-8,4);
memoryVoiceFixture.writeUInt32LE(48000,40);
for(let i=0;i<24000;i++)memoryVoiceFixture.writeInt16LE(Math.round(Math.sin(i*Math.PI*2*450/8000)*800),44+i*2);

const server = http.createServer((request, response) => {
  let requested;
  try { requested = decodeURIComponent(new URL(request.url, "http://localhost").pathname); }
  catch { response.writeHead(400).end(); return; }
  if(["/test-fixtures/door-kick.wav","/test-fixtures/memory-welcome.wav"].includes(requested)) {
    const fixture=requested.endsWith('memory-welcome.wav')?memoryVoiceFixture:effectFixture;
    response.writeHead(200,{"Content-Type":"audio/wav","Content-Length":fixture.length});
    response.end(fixture); return;
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
    await page.waitForFunction(()=>!document.getElementById('startButton').disabled);
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
  try {
    await page.waitForFunction(({name,expected})=>document.body.dataset[name]===expected,{name,expected},{timeout});
  } catch (error) {
    console.error("Cue failure",{waitingFor:{name,expected},observed:await page.evaluate(()=>({
      flags:{...document.body.dataset},cue:stage.state,effect:stage.effectState,
      busyFor:stage.busyUntil-performance.now(),deadline:opening.deadline,
      focused:document.activeElement?.tagName,
      media:Array.from(document.querySelectorAll('audio,video'),e=>({id:e.id,paused:e.paused,
        ended:e.ended,time:e.currentTime,duration:e.duration,ready:e.readyState,error:e.error?.message||null}))
    }))});
    await page.screenshot({path:path.join(output,`failure-${name}-${expected}.png`)});
    throw error;
  }
}
async function cue(page, expected) { await flag(page,"cue",expected); }
async function state(page, expected) { await flag(page,"openingState",expected); }
async function roomState(page, expected) { await flag(page,"roomState",expected,15000); }
async function fastReveal(page) {
  await page.locator('#startButton').click(); await roomState(page,"playing");
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
    // Independent pixel oracle: max scale must fill, cropping excess.
    const scale=Math.max(expected.width/img.naturalWidth,expected.height/img.naturalHeight);
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
async function fixedFrame(page) {
  const box=await page.locator('#visualizer').boundingBox();
  const available=await page.locator('#projectionViewport').boundingBox();
  assert.ok(Math.abs(box.width/box.height-16/9)<.003,"Stage must retain 16:9");
  assert.ok(box.width<=available.width+1&&box.height<=available.height+1);
  assert.ok(Math.abs(box.x-(available.x+(available.width-box.width)/2))<1);
  assert.ok(Math.abs(box.y-(available.y+(available.height-box.height)/2))<1);
  assert.ok(Math.abs(box.width-available.width)<1||Math.abs(box.height-available.height)<1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight),false);
}
async function noControls(page) {
  assert.equal(await page.locator('button:visible,input:visible,select:visible,[role="button"]:visible,audio[controls]:visible,video[controls]:visible').count(),0);
  assert.equal(await page.getByRole('button').count(),0,"Hidden review buttons must also leave the accessibility tree");
  for(const id of ['openingAudio','roomRevealVideo','doorKickAudio','memoryWelcomeAudio','memoryLightAudio'])assert.equal(await page.locator('#'+id).isVisible(),false);
  await fixedFrame(page);
}
async function naturalAudioEnd(page) {
  await page.locator('#openingAudio').evaluate(audio=>{audio.currentTime=audio.duration-.1;});
  await state(page,"countdown");
  // Fast seeking can end the fixture during its expansion lock. Wait for the
  // renderer and operator gate, as a real operator does, before the next cue.
  await page.waitForFunction(()=>transitions.scene.value===0&&performance.now()>=stage.busyUntil);
}
async function checkClockPlacement(page) {
  const viewport=await page.locator('#visualizer').boundingBox();
  const bounds=await expectedDifference(page,"assets/backgrounds/IMG_0165.png",[.1,.2,.9,.55]);
  const expectedWidth=Math.min(viewport.width,viewport.height)*.23*.012*236*.37;
  assert.ok(Math.abs(bounds.centerY-viewport.height*.4)<6,`Clock Y must be 40%: ${JSON.stringify(bounds)}`);
  assert.ok(Math.abs(bounds.width-expectedWidth)<12,`Clock scale must be 37%: ${JSON.stringify(bounds)}`);
}
async function fastMemory(page){
 await fastReveal(page);await prepareWelcome(page);
 await page.keyboard.press('Space');await state(page,'narration');await naturalAudioEnd(page);
 await page.keyboard.press('Space');await cue(page,'clock');await page.waitForTimeout(1300);
 await page.keyboard.press('Space');await cue(page,'card');await page.waitForTimeout(450);
 await page.keyboard.press('Space');await cue(page,'card-hidden');await page.waitForTimeout(450);
 await page.keyboard.press('Space');await cue(page,'blackout');await page.waitForTimeout(1300);
 await page.keyboard.press('Space');await cue(page,'memory-light');
 await page.waitForFunction(()=>transitions.blackout.value===0&&performance.now()>=stage.busyUntil);
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
    await ready(page,url); await fixedFrame(page); await page.waitForTimeout(150);
    assert.equal(await page.locator('#startButton').isVisible(),true);
    assert.equal(await page.locator('#stepsPanel').isVisible(),false);
    assert.equal(await page.locator('#startDock').evaluate(e=>getComputedStyle(e).position),"fixed");
    await matchesStill(page,"assets/backgrounds/Start_dark.PNG");
    assert.equal(await page.locator('body').getAttribute('data-cue'),"dark");
    await page.screenshot({path:path.join(output,"00-dark.png")});
    await page.keyboard.press("Space"); await page.keyboard.press("Enter"); await page.keyboard.press("Shift+Space");
    await page.locator('#visualizer').click(); await page.waitForTimeout(300);
    await cue(page,"dark");
    assert.equal(await page.evaluate(()=>stageOpening.started),false);
    assert.equal(await page.locator('#roomRevealVideo').evaluate(v=>v.currentTime),0);
    assert.equal(await page.locator('#openingAudio').evaluate(a=>a.currentTime),0);
    await page.locator('#startButton').click(); await roomState(page,"playing");
    await noControls(page);
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
    assert.equal(await page.evaluate(()=>document.fullscreenElement?.id),"showShell");
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
    results.push("explicit Start gate, hidden controls, natural MP4 and MP3 ends, eight separate cues, waiting clock and automatic countdown");

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
    await cue(page,'memory-light');
    await page.keyboard.down('Space'); // Held while this room fades in.
    assert.equal(await page.evaluate(()=>opening.deadline),deadline);
    assert.ok(await page.evaluate(()=>stageOpening.remainingMs)<hiddenRemaining);
    await noControls(page);
    await page.waitForTimeout(1100);await page.keyboard.down('Space');await cue(page,'memory-light');
    await matchesStill(page,'assets/backgrounds/memory-room.png');
    assert.equal(await page.evaluate(()=>transitions.clock.value+transitions.card.value+transitions.ai.value),0,
      'The previous clock, card and AI must not leak into the new room');
    assert.equal(await page.locator('#memoryWelcomeAudio').getAttribute('src'),null);
    assert.equal(await page.locator('#memoryLightAudio').getAttribute('src'),null);
    await page.screenshot({path:path.join(output,'11-memory-light.png')});
    await page.keyboard.up('Space');await page.keyboard.press('Space');await cue(page,'memory-welcome');
    await page.keyboard.press('Space');await cue(page,'memory-welcome');await page.waitForTimeout(750);
    const memoryAi=await expectedDifference(page,'assets/backgrounds/memory-room.png',[.1,.2,.9,.6],50);
    assert.ok(Math.abs(memoryAi.centerY-720*.4)<12,'Memory AI also uses Y=40%');
    await page.screenshot({path:path.join(output,'12-memory-welcome.png')});
    await page.keyboard.press('Space');await cue(page,'memory-room');await page.waitForTimeout(750);
    for(const viewport of [{width:1920,height:1080},{width:1440,height:900},{width:390,height:844}]){
      await page.setViewportSize(viewport);await page.waitForTimeout(100);
      await matchesStill(page,'assets/backgrounds/memory-room.png');await noControls(page);
    }
    await page.setViewportSize({width:1280,height:720});await page.waitForTimeout(1500);
    await cue(page,'memory-room');await matchesStill(page,'assets/backgrounds/memory-room.png');
    await page.screenshot({path:path.join(output,'13-memory-dialogue.png')});
    assert.equal(await page.evaluate(()=>opening.deadline),deadline);
    assert.equal(await page.locator('#roomRevealVideo').evaluate(v=>v.ended),true);
    assert.equal(await page.locator('#openingAudio').evaluate(a=>a.ended),true);
    await page.keyboard.press('Space');await cue(page,'memory-blackout');await page.waitForTimeout(1300);
    assert.equal(await page.locator('#visualizer').evaluate(c=>{
      const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
      return d.every((v,i)=>i%4===3||v===0);
    }),true);
    await page.keyboard.press('Space');await cue(page,'memory-blackout');await noControls(page);
    assert.equal(await page.evaluate(()=>opening.deadline),deadline);
    assert.equal(errors.length,0,errors.join("\n"));
    assert.ok(requests.every(request=>request.startsWith(url)),"Show assets must be local");
    await page.close();
    results.push("fixed 16:9 frame and cover-cropped backgrounds at three screen ratios; Y=40%, size=37%, card show/hide and exact blackout pixels");
    results.push("natural opening continues into Memory Room, held presses cannot skip the room fade, previous overlays disappear, local background fills three ratios, dialogue holds and the original deadline never resets");

    const review=await browser.newPage({viewport:{width:1440,height:900}});
    const reviewErrors=[];review.on('pageerror',error=>reviewErrors.push(String(error)));
    await ready(review,url);
    await review.locator('#stepsViewButton').click(); await flag(review,'view','steps');
    await review.waitForTimeout(100);await fixedFrame(review);
    assert.equal(await review.locator('#stepList button').count(),12);
    await matchesStill(review,"assets/backgrounds/IMG_0165.png");
    for(const preview of ['welcome','clock','card','card-hidden','blackout','ai','door-kick','bright',
      'memory-light','memory-welcome','memory-room','memory-blackout']){
      await review.locator(`[data-preview="${preview}"]`).click();await flag(review,'previewCue',preview);
      await review.waitForTimeout(60);
      assert.equal(await review.locator('#roomRevealVideo').evaluate(v=>v.currentTime),0);
      assert.equal(await review.locator('#openingAudio').evaluate(a=>a.currentTime),0);
      assert.equal(await review.locator('#memoryWelcomeAudio').evaluate(a=>a.currentTime),0);
      assert.equal(await review.locator('#memoryLightAudio').evaluate(a=>a.currentTime),0);
      assert.equal(await review.evaluate(()=>opening.deadline),null);
      assert.equal(await review.evaluate(()=>stageOpening.started),false);
    }
    await review.locator('[data-preview="card"]').click();await review.waitForTimeout(100);
    const previewCard=await expectedDifference(review,'assets/backgrounds/IMG_0165.png',[.1,.55,.9,.95]);
    assert.ok(previewCard.width>200&&previewCard.height>100,"Step card preview must actually render");
    await review.screenshot({path:path.join(output,'10-steps-review.png')});
    await review.locator('[data-preview="memory-room"]').click();await review.waitForTimeout(100);
    await matchesStill(review,'assets/backgrounds/memory-room.png');
    await review.screenshot({path:path.join(output,'14-memory-step-review.png')});
    await review.locator('#pageViewButton').click();await flag(review,'view','page');await review.waitForTimeout(100);
    await matchesStill(review,'assets/backgrounds/Start_dark.PNG');await fixedFrame(review);
    await review.locator('#stepsViewButton').click();await review.locator('[data-preview="memory-blackout"]').click();
    await flag(review,'previewCue','memory-blackout');
    // Starting after inspecting the last cue must still play the first clip.
    await review.locator('#startButton').click();await roomState(review,'playing');await noControls(review);
    await flag(review,'view','page');
    assert.equal(await review.locator('#roomRevealVideo').evaluate(v=>v.currentTime<1),true);
    await review.locator('#roomRevealVideo').evaluate(v=>{v.currentTime=v.duration-.1;});
    await cue(review,'bright');await review.waitForTimeout(400);
    await matchesStill(review,'assets/backgrounds/IMG_0165.png');
    assert.equal(reviewErrors.length,0,reviewErrors.join('\n'));
    await review.close();
    results.push("full-page and twelve silent step previews; no audio/video or timer before Start; Start from the final memory preview resets to first cue and hides every button");

    const slow=await browser.newPage();
    let releaseAudio;
    const heldAudio=new Promise(resolve=>{releaseAudio=resolve;});
    await slow.route('**/assets/audio/ai-opening.mp3',async route=>{
      await heldAudio;await route.fulfill({contentType:'audio/mpeg',body:fs.readFileSync(path.join(root,'assets/audio/ai-opening.mp3'))});
    });
    await slow.goto(url,{waitUntil:'domcontentloaded'});
    await slow.locator('#startButton').waitFor({state:'visible'});
    assert.equal(await slow.locator('#startButton').isDisabled(),true);
    await slow.keyboard.press('Space');await slow.locator('#visualizer').click();
    assert.equal(await slow.evaluate(()=>stageOpening.started),false);
    releaseAudio();
    await slow.waitForFunction(()=>!document.getElementById('startButton').disabled);
    assert.equal(await slow.locator('#roomRevealVideo').evaluate(v=>v.currentTime),0);
    assert.equal(await slow.locator('#openingAudio').evaluate(a=>a.currentTime),0);
    await slow.locator('#startButton').press('Space');await roomState(slow,'playing');await noControls(slow);
    await slow.close();
    results.push("loading cannot start the show; readiness does not autoplay; focused Start button remains keyboard-accessible");

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
    await ready(videoRetry,url); await videoRetry.locator('#startButton').click();
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

    const memoryMedia=await browser.newPage();
    await memoryMedia.route('**/opening-config.js',route=>route.fulfill({contentType:'text/javascript',body:
      fs.readFileSync(path.join(root,'opening-config.js'),'utf8')
        .replace('narration: null','narration: "test-fixtures/memory-welcome.wav"')
        .replace('lightClick: null','lightClick: "test-fixtures/door-kick.wav"')}));
    await memoryMedia.addInitScript(()=>{
      const play=HTMLMediaElement.prototype.play;const blocked=new Set(['memoryLightAudio','memoryWelcomeAudio']);
      HTMLMediaElement.prototype.play=function(){
        if(blocked.delete(this.id))return Promise.reject(new DOMException('Blocked','NotAllowedError'));
        return play.call(this);
      };
    });
    await ready(memoryMedia,url);await fastMemory(memoryMedia);
    const memoryDeadline=await memoryMedia.evaluate(()=>opening.deadline);
    await flag(memoryMedia,'memoryClickState','error');await cue(memoryMedia,'memory-light');
    await memoryMedia.keyboard.press('Space');await flag(memoryMedia,'memoryClickState','playing');
    await memoryMedia.keyboard.press('Space');await cue(memoryMedia,'memory-light');
    await flag(memoryMedia,'memoryClickState','finished');
    await memoryMedia.keyboard.press('Space');await flag(memoryMedia,'memoryVoiceState','error');
    await memoryMedia.waitForFunction(()=>performance.now()>=stage.busyUntil);
    await memoryMedia.keyboard.press('Space');await flag(memoryMedia,'memoryVoiceState','playing');
    await memoryMedia.waitForTimeout(700);
    assert.ok(await memoryMedia.evaluate(()=>smooth.some(v=>v>0)), 'Memory voice reaches the audio analyser');
    await memoryMedia.keyboard.down('Space');await cue(memoryMedia,'memory-welcome');
    await flag(memoryMedia,'memoryVoiceState','finished');
    await memoryMedia.waitForFunction(()=>transitions.ai.value===0&&performance.now()>=stage.busyUntil);
    await memoryMedia.keyboard.down('Space');await cue(memoryMedia,'memory-welcome');
    await matchesStill(memoryMedia,'assets/backgrounds/memory-room.png');
    assert.equal(await memoryMedia.evaluate(()=>opening.deadline),memoryDeadline);
    await memoryMedia.keyboard.up('Space');await memoryMedia.keyboard.press('Space');await cue(memoryMedia,'memory-room');
    await noControls(memoryMedia);await memoryMedia.close();
    results.push('Memory click and welcome slots play real PCM fixtures, retry their own failures, block premature/held cues, fade AI only at real voice end and preserve the original opening deadline');

    const touch=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
    await ready(touch,url); await fixedFrame(touch);
    await touch.locator('#stepsViewButton').click();await touch.waitForTimeout(100);await fixedFrame(touch);
    await touch.locator('[data-preview="card"]').click();await flag(touch,'previewCue','card');
    assert.equal(await touch.locator('#openingAudio').evaluate(a=>a.currentTime),0);
    const startBox=await touch.locator('#startButton').boundingBox();
    assert.ok(startBox.y+startBox.height<=844&&startBox.y>700,"Floating Start remains on-screen on mobile");
    await touch.touchscreen.tap(startBox.x+startBox.width/2,startBox.y+startBox.height/2); await roomState(touch,"playing");
    await noControls(touch);
    await touch.locator('#roomRevealVideo').evaluate(v=>{v.currentTime=v.duration-.1;});
    await cue(touch,"bright"); await touch.waitForTimeout(400);
    await matchesStill(touch,"assets/backgrounds/IMG_0165.png");
    await touch.touchscreen.tap(190,420); await cue(touch,"ai"); await touch.waitForTimeout(1000);
    await touch.touchscreen.tap(190,420); await cue(touch,"door-kick"); await touch.waitForTimeout(200);
    // A second tap inside Chrome's double-click interval is intentionally
    // filtered. A fresh tap, after releasing that gesture, is a new cue.
    await touch.touchscreen.tap(190,420); await cue(touch,"door-kick");
    assert.equal(await touch.locator('#openingAudio').evaluate(a=>a.currentTime),0);
    await touch.waitForTimeout(650);
    await touch.touchscreen.tap(190,420); await state(touch,"narration");
    await noControls(touch); await touch.close();
    results.push("mobile step review and fixed Start; touch advances cues, filters double taps and retains a 16:9 projection without visible controls");

    fs.writeFileSync(path.join(output,"browser-results.json"),JSON.stringify({passed:true,checks:results},null,2));
    for(const result of results)console.log("PASS",result);
  } finally {
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
