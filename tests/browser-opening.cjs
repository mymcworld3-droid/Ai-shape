"use strict";
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "test-results");
const types = { ".html":"text/html", ".js":"text/javascript", ".png":"image/png", ".mp3":"audio/mpeg" };

const server = http.createServer((request, response) => {
  let requested;
  try { requested = decodeURIComponent(new URL(request.url, "http://localhost").pathname); }
  catch { response.writeHead(400).end(); return; }
  const file = path.resolve(root, "." + (requested === "/" ? "/index.html" : requested));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404).end(); return;
  }
  const size = fs.statSync(file).size;
  const headers = { "Content-Type":types[path.extname(file)] || "application/octet-stream", "Accept-Ranges":"bytes" };
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
  await page.waitForSelector('body[data-background-ready="true"][data-audio-ready="true"]', {timeout:15000});
}
async function state(page, expected) {
  await page.waitForFunction(value => document.body.dataset.openingState === value, expected, {timeout:35000});
}
async function noControls(page) {
  assert.equal(await page.locator('button,input,select,[role="button"],audio[controls]').count(),0);
  assert.equal(await page.locator('#openingAudio').isVisible(),false);
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
    browser=await chromium.launch({args:["--autoplay-policy=user-gesture-required"]});
    const page=await browser.newPage({viewport:{width:1280,height:720}});
    const errors=[];
    page.on("pageerror",error=>errors.push(String(error)));
    const requests=[]; page.on("request",request=>requests.push(request.url()));
    await ready(page,url); await noControls(page);
    await page.waitForTimeout(500);
    assert.equal(await page.locator('body').getAttribute('data-opening-state'),"ready");
    assert.equal(await page.locator('#openingAudio').evaluate(audio=>audio.currentTime),0);
    await page.screenshot({path:path.join(output,"01-ready.png")});
    await page.keyboard.press("Enter"); await page.keyboard.press("Shift+Space");
    assert.equal(await page.locator('body').getAttribute('data-opening-state'),"ready");
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
    await page.screenshot({path:path.join(output,"02-narration.png")});
    await page.keyboard.down("Space"); await page.keyboard.down("Space"); await page.keyboard.up("Space");
    await page.keyboard.press("Space");
    assert.ok(await page.locator('#openingAudio').evaluate(audio=>audio.currentTime)>=playing.time);
    // Let the complete bundled recording really play to its natural media end.
    await state(page,"countdown");
    assert.equal(await page.locator('#openingAudio').evaluate(audio=>audio.ended),true);
    const deadline=await page.evaluate(()=>opening.deadline);
    await page.keyboard.press("Space"); await page.keyboard.press("Space");
    assert.equal(await page.evaluate(()=>opening.deadline),deadline);
    await page.waitForTimeout(3000); await noControls(page);
    const remaining=await page.evaluate(()=>window.stageOpening.remainingMs);
    assert.ok(remaining>890000 && remaining<900000);
    assert.equal(await page.evaluate(()=>timerMorph),1);
    assert.equal(await page.evaluate(()=>timerSettle),1);
    assert.equal(await page.evaluate(()=>sceneProgress),0);
    await page.screenshot({path:path.join(output,"03-countdown.png")});
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
    await ready(failedFullscreen,url); await failedFullscreen.keyboard.press("Space"); await state(failedFullscreen,"narration");
    assert.equal(await failedFullscreen.locator('#openingAudio').evaluate(audio=>audio.paused),false);
    await failedFullscreen.locator('#openingAudio').evaluate(audio=>{audio.currentTime=audio.duration-.1;});
    await state(failedFullscreen,"countdown"); await noControls(failedFullscreen); await failedFullscreen.close();
    results.push("fullscreen rejection does not block narration or its countdown");

    const retry=await browser.newPage();
    await retry.addInitScript(()=>{
      const play=HTMLMediaElement.prototype.play; let blocked=true;
      HTMLMediaElement.prototype.play=function(){
        if(blocked){blocked=false;return Promise.reject(new DOMException("Blocked","NotAllowedError"));}
        return play.call(this);
      };
    });
    await ready(retry,url); await retry.keyboard.press("Space");
    await retry.waitForSelector('body[data-audio-error="true"][data-opening-state="ready"]');
    assert.equal(await retry.evaluate(()=>opening.deadline),null);
    await retry.keyboard.press("Space"); await state(retry,"narration");
    await retry.locator('#openingAudio').evaluate(audio=>{audio.currentTime=audio.duration-.1;});
    await state(retry,"countdown"); await retry.close();
    results.push("browser playback failure permits a second key retry without a false countdown");
    fs.writeFileSync(path.join(output,"browser-results.json"),JSON.stringify({passed:true,checks:results},null,2));
    for(const result of results)console.log("PASS",result);
  } finally {
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
