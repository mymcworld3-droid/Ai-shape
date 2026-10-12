"use strict";
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "test-results");
const types = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".png":"image/png", ".svg":"image/svg+xml", ".mp3":"audio/mpeg", ".m4a":"audio/mp4", ".mp4":"video/mp4" };

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

async function settlePreview(page) {
  await page.waitForFunction(()=>{
    const frame=projectionFrame(),target=StageLayout.previewFrame(document.body.dataset.previewCue);
    return !frame.preview||!target?.ai||target.clock===1||frame.ai===1;
  });
  await page.waitForTimeout(40);
}
async function settleLiveAi(page) {
  await page.waitForFunction(()=>transitions.ai.value===1&&performance.now()>=stage.busyUntil);
}
async function fadePixels(page) {
  return page.evaluate(async()=>{
    const c=document.getElementById('visualizer'),context=c.getContext('2d');
    const scale=Math.max(c.width/1536,c.height/1024);
    const x=Math.ceil((c.width-1536*scale)/2+554*scale),y=Math.ceil((c.height-1024*scale)/2+312*scale);
    const width=Math.floor(426*scale),height=Math.floor(191*scale),samples=[];
    const read=()=>{
      const pixels=context.getImageData(x,y,width,height).data;
      let sum=0;for(let i=0;i<pixels.length;i+=4)sum+=pixels[i]+pixels[i+1]+pixels[i+2];
      return sum/(width*height*3);
    };
    await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
    const start=performance.now(),duration=OPENING_CONFIG.aiFadeMs;
    for(const fraction of [0,.2,.4,.7,1.15]){
      while(performance.now()-start<duration*fraction)await new Promise(requestAnimationFrame);
      samples.push({elapsed:performance.now()-start,mean:read()});
    }
    return samples;
  });
}
function gradualPixels(samples,label) {
  const full=samples[4].mean;
  assert.ok(full>1,`${label}: AI must become visibly drawn`);
  assert.ok(samples[0].mean<full*.05,`${label}: must begin fully transparent: ${JSON.stringify(samples)}`);
  assert.ok(samples[1].mean<full*.25,`${label}: early frame cannot already be fully visible`);
  assert.ok(samples[2].mean>full*.15&&samples[2].mean<full*.65,`${label}: an intermediate opacity must be visible`);
  assert.ok(samples[3].mean>full*.65,`${label}: opacity must increase through the fade`);
}
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
  await page.keyboard.press("Space"); await cue(page,"ai"); await settleLiveAi(page);
  await page.keyboard.press("Space"); await cue(page,"door-kick"); await page.waitForTimeout(200);
}
async function expectedDifference(page, sourcePath, region=null, threshold=15, dim=0) {
  return page.evaluate(async ({sourcePath,region,threshold,dim})=>{
    let img=null;
    if(sourcePath){img=new Image();img.src=sourcePath;await img.decode();}
    const actual=document.getElementById("visualizer"),expected=document.createElement("canvas");
    expected.width=actual.width; expected.height=actual.height;
    const context=expected.getContext("2d"); context.fillStyle=img?"#050505":"#000";
    context.fillRect(0,0,expected.width,expected.height);
    // Independent pixel oracle: max scale must fill, cropping excess.
    if(img){
      const scale=Math.max(expected.width/img.naturalWidth,expected.height/img.naturalHeight);
      const width=img.naturalWidth*scale,height=img.naturalHeight*scale;
      context.drawImage(img,(expected.width-width)/2,(expected.height-height)/2,width,height);
    }
    if(dim){context.fillStyle=`rgba(0,0,0,${dim})`;context.fillRect(0,0,expected.width,expected.height);}
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
      height:(maxY-minY+1)/dpr,centerX:(minX+maxX)/2/dpr,centerY:(minY+maxY)/2/dpr};
  },{sourcePath,region,threshold,dim});
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
  for(const id of ['openingAudio','roomRevealVideo','doorKickAudio','memoryWelcomeAudio','memoryLightAudio','officeBangAudio',
    'selectionPromptAudio','selectionOneAudio','selectionTwoAudio','selectionFinalAudio'])assert.equal(await page.locator('#'+id).isVisible(),false);
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
  const viewport=await page.locator('#visualizer').evaluate(c=>({width:c.clientWidth,height:c.clientHeight}));
  const scale=Math.max(viewport.width/1536,viewport.height/1024);
  const screen={x:(viewport.width-1536*scale)/2+552*scale,
    y:(viewport.height-1024*scale)/2+310*scale,width:430*scale,height:195*scale};
  const bounds=await expectedDifference(page,"assets/backgrounds/IMG_0165.png",null,3);
  assert.ok(bounds.width>screen.width*.95,'Shrunk clock must fill the TV width');
  assert.ok(Math.abs(bounds.centerX-(screen.x+screen.width/2))<2,'Clock must be centered horizontally on the original TV');
  assert.ok(Math.abs(bounds.centerY-(screen.y+screen.height/2))<2,'Clock must be centered vertically on the original TV');
  assert.ok(bounds.x>=screen.x-1&&bounds.x+bounds.width<=screen.x+screen.width+1,
    `Every clock pixel and glow must stay inside the original TV horizontally: ${JSON.stringify({screen,bounds})}`);
  assert.ok(bounds.y>=screen.y-1&&bounds.y+bounds.height<=screen.y+screen.height+1,
    `Every clock pixel and glow must stay inside the original TV vertically: ${JSON.stringify({screen,bounds})}`);
}
async function checkAiScreen(page,{centered=false,large=false,front=false}={}){
  if(front)return checkVoiceForeground(page,false,true,{centered});
  const viewport=await page.locator('#visualizer').evaluate(c=>({width:c.clientWidth,height:c.clientHeight}));
  // Independently project the resting AI's measured position in the PNG.
  const scale=Math.max(viewport.width/1536,viewport.height/1024);
  const screen={x:(viewport.width-1536*scale)/2+552*scale,
    y:(viewport.height-1024*scale)/2+310*scale,width:430*scale,height:195*scale};
  const pixels=await expectedDifference(page,'assets/backgrounds/IMG_0165.png',null,3);
  assert.ok(pixels.width>0&&pixels.height>0,'AI must actually render');
  assert.ok(pixels.x>=screen.x-1&&pixels.x+pixels.width<=screen.x+screen.width+1);
  assert.ok(pixels.y>=screen.y-1&&pixels.y+pixels.height<=screen.y+screen.height+1);
  const visible=centered||large?await expectedDifference(page,'assets/backgrounds/IMG_0165.png',
    [screen.x/viewport.width,screen.y/viewport.height,(screen.x+screen.width)/viewport.width,
      (screen.y+screen.height)/viewport.height],1):pixels;
  if(centered){
    assert.ok(Math.abs(visible.centerX-(screen.x+screen.width/2))<4,'Idle AI must be centered horizontally');
    assert.ok(Math.abs(visible.centerY-(screen.y+screen.height/2))<4,'Idle AI must be centered vertically');
  }
  if(large)assert.ok(visible.height>screen.height*.8,'Idle AI must fill most of the original TV height');
}
async function checkVoiceForeground(page,voting=false,opening=false,{centered=false}={}){
  const viewport=await page.locator('#visualizer').evaluate(c=>({width:c.clientWidth,height:c.clientHeight}));
  const pixels=await expectedDifference(page,null,[0,0,1,voting ? .8 : 1],3);
  const top=viewport.height*(voting ? .02 : .05),bottom=viewport.height*(voting ? .78 : .95);
  assert.ok(pixels.height>viewport.height*(voting ? .48 : .55),'AI itself must visibly enlarge into the foreground');
  assert.ok(pixels.x>=viewport.width*.15&&pixels.x+pixels.width<=viewport.width*.85,
    `Only the radial AI should enlarge: ${JSON.stringify(pixels)}`);
  assert.ok(pixels.y>=top-1&&pixels.y+pixels.height<=bottom+1,
    `Enlarged AI and glow must stay on stage above the caption: ${JSON.stringify(pixels)}`);
  if(centered){
    assert.ok(Math.abs(pixels.centerX-viewport.width/2)<4,'Enlarged idle preview stays centered horizontally');
    assert.ok(Math.abs(pixels.centerY-viewport.height*(voting ? .4 : .5))<4,'Enlarged idle preview stays centered vertically');
  }
  // Every side-strip background pixel must reach exact black while AI remains visible.
  for(const region of [[0,0,.15,voting ? .8 : 1],[.85,0,1,voting ? .8 : 1]]){
    const background=await expectedDifference(page,null,region,0);
    assert.equal(background.mean,0,'Enlarged voice background must end at exact black');
  }
  return pixels;
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
async function fastOffice(page){
 await fastMemory(page);
 for(const next of ['memory-welcome','memory-room','memory-blackout','past-intro','past-isolate','office-light']){
  await page.keyboard.press('Space');await cue(page,next);
  await page.waitForFunction(()=>performance.now()>=stage.busyUntil);
 }
}
async function fastVoting(page){
 await fastOffice(page);
 for(const next of ['office-bang','past-reflection','memory-return','discussion','vote-prompt']){
  await page.keyboard.press('Space');await cue(page,next);
  await page.waitForFunction(()=>performance.now()>=stage.busyUntil);
 }
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
    await settleLiveAi(page); await page.screenshot({path:path.join(output,"03-ai.png")});
    await checkAiScreen(page,{centered:true,large:true});
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
    for(let frame=0;frame<4;frame++){
      await checkAiScreen(page,{front:true});await page.waitForTimeout(80);
    }
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
    results.push("explicit Start gate, hidden controls, natural MP4 and M4A ends, eight separate cues, waiting clock and automatic countdown");

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
    await page.keyboard.press('Space');await cue(page,'past-intro');
    await page.keyboard.down('Space');await cue(page,'past-intro');
    await page.waitForTimeout(1100);await page.keyboard.down('Space');await cue(page,'past-intro');
    const dimRoom=await expectedDifference(page,'assets/backgrounds/memory-room.png',null,15,.35);
    assert.ok(dimRoom.mean<1,'The opening monologue must show the dimmed Memory Room without old graphics');
    await noControls(page);
    await page.screenshot({path:path.join(output,'15-past-intro.png')});
    await page.keyboard.up('Space');await page.keyboard.press('Space');await cue(page,'past-isolate');
    await page.keyboard.press('Space');await cue(page,'past-isolate');await page.waitForTimeout(1300);
    await matchesStill(page,null);
    await page.keyboard.press('Space');await cue(page,'office-light');
    await page.keyboard.press('Space');await cue(page,'office-light');await page.waitForTimeout(1100);
    assert.equal(await page.evaluate(()=>transitions.ai.value+transitions.clock.value+transitions.card.value+transitions.scene.value),0);
    for(const viewport of [{width:1920,height:1080},{width:1440,height:900},{width:390,height:844}]){
      await page.setViewportSize(viewport);await page.waitForTimeout(100);
      await matchesStill(page,'assets/backgrounds/office-memory.png');await noControls(page);
    }
    await page.setViewportSize({width:1280,height:720});await page.waitForTimeout(1200);
    await cue(page,'office-light');await matchesStill(page,'assets/backgrounds/office-memory.png');
    assert.equal(await page.locator('#officeBangAudio').getAttribute('src'),null);
    await flag(page,'officeBangAvailable','false');
    await page.screenshot({path:path.join(output,'16-office-light.png')});
    await page.keyboard.press('Space');await cue(page,'office-bang');await flag(page,'officeBangState','missing');
    await page.waitForTimeout(300);await cue(page,'office-bang');await matchesStill(page,'assets/backgrounds/office-memory.png');
    await page.keyboard.press('Space');await cue(page,'past-reflection');await page.waitForTimeout(1300);
    assert.equal(await page.locator('#visualizer').evaluate(c=>{
      const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return d.every((v,i)=>i%4===3||v===0);
    }),true);
    await page.waitForTimeout(1000);await cue(page,'past-reflection');
    await page.screenshot({path:path.join(output,'17-past-reflection.png')});
    await page.keyboard.press('Space');await cue(page,'memory-return');await page.waitForTimeout(1100);
    for(const viewport of [{width:1920,height:1080},{width:1440,height:900},{width:390,height:844}]){
      await page.setViewportSize(viewport);await page.waitForTimeout(100);
      await matchesStill(page,'assets/backgrounds/memory-room.png');await noControls(page);
    }
    await page.setViewportSize({width:1280,height:720});await page.waitForTimeout(100);
    await cue(page,'memory-return');
    await page.screenshot({path:path.join(output,'18-memory-return.png')});
    await page.keyboard.press('Space');await cue(page,'discussion');await page.waitForTimeout(700);
    const discussion=await expectedDifference(page,'assets/backgrounds/memory-room.png',null,15,.2);
    assert.ok(discussion.mean<1,'Act III discussion retains the slightly dimmed Memory Room');
    assert.equal(await page.evaluate(()=>stage.voting.deadline),null);
    await page.waitForTimeout(1200);await cue(page,'discussion');
    await page.keyboard.press('Space');await cue(page,'vote-prompt');await page.waitForTimeout(700);
    await flag(page,'selectionPromptState','missing');assert.equal(await page.evaluate(()=>stage.voting.deadline),null);
    const promptPanel=await expectedDifference(page,'assets/backgrounds/memory-room.png',[.1,.81,.9,.98],15,.2);
    assert.ok(promptPanel.width>700&&promptPanel.height>75,'Selection prompt must visibly render');
    for(const id of ['selectionPromptAudio','selectionOneAudio','selectionTwoAudio','selectionFinalAudio']){
      assert.equal(await page.locator('#'+id).getAttribute('src'),null);
    }
    await page.keyboard.press('Space');await cue(page,'vote-clock');await page.waitForTimeout(700);
    const selectionDeadline=await page.evaluate(()=>stage.voting.deadline);
    assert.ok(await page.evaluate(()=>stage.voting.getRemainingMs())<=60000);
    assert.ok(await page.evaluate(()=>stage.voting.getRemainingMs())>58000);
    await page.keyboard.press('Space');await cue(page,'vote-one');await page.waitForTimeout(700);
    const voteOne=await page.locator('#visualizer').evaluate(c=>{
      const d=c.getContext('2d').getImageData(0,Math.round(c.height*.83),c.width,Math.round(c.height*.12)).data;
      let hash=0;for(const v of d)hash=(hash*31+v)>>>0;return hash;
    });
    await flag(page,'selectionOneState','missing');
    await page.keyboard.press('Space');await cue(page,'vote-two');await page.waitForTimeout(700);
    const voteTwo=await page.locator('#visualizer').evaluate(c=>{
      const d=c.getContext('2d').getImageData(0,Math.round(c.height*.83),c.width,Math.round(c.height*.12)).data;
      let hash=0;for(const v of d)hash=(hash*31+v)>>>0;return hash;
    });
    assert.notEqual(voteOne,voteTwo,'One vote and two votes must have distinct visible text');
    await flag(page,'selectionTwoState','missing');
    for(const viewport of [{width:1920,height:1080},{width:1440,height:900},{width:390,height:844}]){
      await page.setViewportSize(viewport);await page.waitForTimeout(100);await noControls(page);
      const room=await expectedDifference(page,'assets/backgrounds/memory-room.png',[0,0,1,.2],15,.2);
      assert.ok(room.mean<1,'Voting retains the correct background and cover crop');
      const box=await page.locator('#visualizer').boundingBox();
      const clock=await expectedDifference(page,'assets/backgrounds/memory-room.png',[.1,.2,.9,.55],15,.2);
      assert.ok(Math.abs(clock.centerY-box.height*.4)<6,'Selection clock retains Y=40%');
      assert.ok(Math.abs(clock.width-Math.min(box.width,box.height)*.23*.012*236*.37)<12,'Selection clock retains size=37%');
      const text=await expectedDifference(page,'assets/backgrounds/memory-room.png',[0,.81,1,.98],15,.2);
      assert.ok(text.x>0&&text.x+text.width<box.width,'Vote panel stays inside the stage at every ratio');
    }
    await page.setViewportSize({width:1280,height:720});await page.waitForTimeout(100);
    await page.screenshot({path:path.join(output,'20-vote-two.png')});
    await page.keyboard.press('Space');await cue(page,'vote-final');await page.waitForTimeout(700);
    await flag(page,'selectionFinalState','missing');
    assert.equal(await page.evaluate(()=>stage.voting.deadline),selectionDeadline);
    await page.keyboard.press('Space');await cue(page,'vote-blackout');await page.waitForTimeout(1300);
    assert.equal(await page.locator('#visualizer').evaluate(c=>{
      const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return d.every((v,i)=>i%4===3||v===0);
    }),true);
    await page.keyboard.press('Space');await cue(page,'vote-blackout');await noControls(page);
    assert.equal(await page.evaluate(()=>stage.voting.deadline),selectionDeadline);
    await page.screenshot({path:path.join(output,'21-vote-blackout.png')});
    assert.equal(await page.evaluate(()=>opening.deadline),deadline);
    assert.equal(errors.length,0,errors.join("\n"));
    assert.ok(requests.every(request=>request.startsWith(url)),"Show assets must be local");
    await page.close();
    results.push("fixed 16:9 frame and cover-cropped backgrounds at three screen ratios; shrunk opening clock fills the original TV center without overflowing, card show/hide and exact blackout pixels");
    results.push("natural opening continues into Memory Room, held presses cannot skip the room fade, previous overlays disappear, local background fills three ratios, dialogue holds and the original deadline never resets");
    results.push('all eighteen cues follow Act II monologue, office flashback, BANG, reflection and Memory Room return; independent pixels verify dim room, exact blackouts and clean backgrounds at three ratios; held cues never skip fades or reset the deadline');
    results.push('all twenty-five cues continue into actor-paced discussion and selection; four silent voice slots remain explicit, the separate minute starts only at the clock cue, vote text changes visibly, three ratios retain clock placement and every blackout pixel is zero');

    const fadePage=await browser.newPage({viewport:{width:1280,height:720}});
    const fadeErrors=[];fadePage.on('pageerror',error=>fadeErrors.push(String(error)));
    let releaseFadeBackground;
    const heldFadeBackground=new Promise(done=>releaseFadeBackground=done);
    await fadePage.route('**/assets/backgrounds/IMG_0165.png',async route=>{await heldFadeBackground;await route.continue();});
    await fadePage.goto(url,{waitUntil:'domcontentloaded'});
    await fadePage.locator('#stepsViewButton').click();await fadePage.locator('[data-preview="ai"]').click();
    await fadePage.waitForTimeout(1700);
    assert.equal(await fadePage.locator('#startButton').isDisabled(),true);
    assert.equal(await fadePage.evaluate(()=>projectionFrame().ai),0,'Loading must not consume the fade before the image can render');
    releaseFadeBackground();await flag(fadePage,'backgroundReady','true');
    gradualPixels(await fadePixels(fadePage),'preview after background loading');
    await fadePage.locator('[data-preview="ai"]').click();
    gradualPixels(await fadePixels(fadePage),'replaying the same second step');
    assert.equal(await fadePage.evaluate(()=>Array.from(document.querySelectorAll('audio,video')).every(m=>m.currentTime===0&&m.paused)),true);
    assert.equal(await fadePage.evaluate(()=>opening.deadline),null);
    assert.equal(await fadePage.evaluate(()=>stage.voting.deadline),null);
    await fadePage.locator('[data-preview="ai"]').click();await fadePage.waitForTimeout(200);
    await fadePage.locator('[data-preview="bright"]').click();await fadePage.waitForTimeout(1700);
    await matchesStill(fadePage,'assets/backgrounds/IMG_0165.png');
    await fadePage.locator('[data-preview="ai"]').click();await fadePage.waitForTimeout(200);
    await fastReveal(fadePage);await matchesStill(fadePage,'assets/backgrounds/IMG_0165.png');
    await fadePage.keyboard.press('Space');await cue(fadePage,'ai');
    gradualPixels(await fadePixels(fadePage),'live second cue');
    await noControls(fadePage);assert.equal(fadeErrors.length,0,fadeErrors.join('\n'));
    await fadePage.screenshot({path:path.join(output,'25-ai-fade-live.png')});await fadePage.close();
    results.push('second-step AI fades through independently measured transparent, intermediate and complete pixels in preview and live playback; delayed loading, same-step replay, switching away and Start during a fade never leak overlays or start media or timers');

    const review=await browser.newPage({viewport:{width:1440,height:900}});
    const reviewErrors=[];review.on('pageerror',error=>reviewErrors.push(String(error)));
    await ready(review,url);
    await review.locator('#stepsViewButton').click(); await flag(review,'view','steps');
    await review.waitForTimeout(100);await fixedFrame(review);
    assert.equal(await review.locator('#stepList button').count(),25);
    await matchesStill(review,"assets/backgrounds/IMG_0165.png");
    for(const preview of ['welcome','clock','card','card-hidden','blackout','ai','door-kick','bright',
      'memory-light','memory-welcome','memory-room','memory-blackout',
      'past-intro','past-isolate','office-light','office-bang','past-reflection','memory-return',
      'discussion','vote-prompt','vote-clock','vote-one','vote-two','vote-final','vote-blackout']){
      await review.locator(`[data-preview="${preview}"]`).click();await flag(review,'previewCue',preview);
      await review.waitForTimeout(60);
      assert.equal(await review.locator('#roomRevealVideo').evaluate(v=>v.currentTime),0);
      assert.equal(await review.locator('#openingAudio').evaluate(a=>a.currentTime),0);
      assert.equal(await review.locator('#memoryWelcomeAudio').evaluate(a=>a.currentTime),0);
      assert.equal(await review.locator('#memoryLightAudio').evaluate(a=>a.currentTime),0);
      assert.equal(await review.locator('#officeBangAudio').evaluate(a=>a.currentTime),0);
      for(const id of ['selectionPromptAudio','selectionOneAudio','selectionTwoAudio','selectionFinalAudio']){
        assert.equal(await review.locator('#'+id).evaluate(a=>a.currentTime),0);
      }
      assert.equal(await review.evaluate(()=>opening.deadline),null);
      assert.equal(await review.evaluate(()=>stage.voting.deadline),null);
      assert.equal(await review.evaluate(()=>stageOpening.started),false);
    }
    await review.locator('[data-preview="card"]').click();await review.waitForTimeout(100);
    const previewCard=await expectedDifference(review,'assets/backgrounds/IMG_0165.png',[.1,.55,.9,.95]);
    assert.ok(previewCard.width>200&&previewCard.height>100,"Step card preview must actually render");
    await review.screenshot({path:path.join(output,'10-steps-review.png')});
    await review.locator('[data-preview="memory-room"]').click();await review.waitForTimeout(100);
    await matchesStill(review,'assets/backgrounds/memory-room.png');
    await review.screenshot({path:path.join(output,'14-memory-step-review.png')});
    await review.locator('[data-preview="office-light"]').click();await review.waitForTimeout(100);
    await matchesStill(review,'assets/backgrounds/office-memory.png');await fixedFrame(review);
    await review.screenshot({path:path.join(output,'19-office-step-review.png')});
    await review.locator('[data-preview="vote-two"]').click();await settlePreview(review);await fixedFrame(review);
    await review.screenshot({path:path.join(output,'22-voting-step-review.png')});
    await review.locator('#pageViewButton').click();await flag(review,'view','page');await review.waitForTimeout(100);
    await matchesStill(review,'assets/backgrounds/Start_dark.PNG');await fixedFrame(review);
    await review.locator('#stepsViewButton').click();await review.locator('[data-preview="vote-blackout"]').click();
    await flag(review,'previewCue','vote-blackout');
    // Starting after inspecting the last cue must still play the first clip.
    await review.locator('#startButton').click();await roomState(review,'playing');await noControls(review);
    await flag(review,'view','page');
    assert.equal(await review.locator('#roomRevealVideo').evaluate(v=>v.currentTime<1),true);
    await review.locator('#roomRevealVideo').evaluate(v=>{v.currentTime=v.duration-.1;});
    await cue(review,'bright');await review.waitForTimeout(400);
    await matchesStill(review,'assets/backgrounds/IMG_0165.png');
    assert.equal(reviewErrors.length,0,reviewErrors.join('\n'));
    await review.close();

    const screenFit=await browser.newPage({viewport:{width:1440,height:900}});
    await ready(screenFit,url);await screenFit.locator('#stepsViewButton').click();
    for(const viewport of [{width:1920,height:1080},{width:1440,height:900},{width:390,height:844}]){
      await screenFit.setViewportSize(viewport);
      await screenFit.locator('[data-preview="ai"]').click();await settlePreview(screenFit);
      await fixedFrame(screenFit);await checkAiScreen(screenFit,{centered:true,large:true});
    }
    await screenFit.locator('#pageViewButton').click();await screenFit.locator('#stepsViewButton').click();
    await screenFit.locator('[data-preview="welcome"]').click();await settlePreview(screenFit);
    await checkAiScreen(screenFit,{centered:true,large:true,front:true});
    // Render a maximum-range spectrum in this test page only. This verifies
    // animated coils, thick hex strokes, particles and glow at their extremes.
    await screenFit.evaluate(()=>{analyze=()=>{smooth.fill(255);return{avg:255,low:255,mid:255,high:255};};});
    for(const viewport of [{width:1920,height:1080},{width:1440,height:900},{width:390,height:844}]){
      await screenFit.setViewportSize(viewport);await screenFit.waitForTimeout(400);
      for(let frame=0;frame<4;frame++){
        await checkAiScreen(screenFit,{front:true});await screenFit.waitForTimeout(60);
      }
    }
    assert.equal(await screenFit.locator('#openingAudio').evaluate(a=>a.currentTime),0);
    await fastReveal(screenFit);
    await screenFit.keyboard.press('Space');await cue(screenFit,'ai');await settleLiveAi(screenFit);
    for(const viewport of [{width:1920,height:1080},{width:1440,height:900},{width:390,height:844}]){
      await screenFit.setViewportSize(viewport);await screenFit.waitForTimeout(100);
      await noControls(screenFit);await checkAiScreen(screenFit);
    }
    await screenFit.close();
    results.push('only AI enlarges over the fixed original background during speech; independent pixels verify the background becomes exactly black, bounded glow and automatic return at three ratios');
    results.push("full-page and twenty-five silent step previews; no audio/video or either timer before Start; Start from the final selection blackout preview resets to first cue and hides every button");

    const stableSize=await browser.newPage();await ready(stableSize,url);
    await stableSize.locator('#stepsViewButton').click();
    await stableSize.evaluate(()=>{
      const place=graphicPlacement,ring=drawSymmetricRing,coils=createCoils,hex=drawHex;
      const lineTo=ctx.lineTo.bind(ctx),stroke=ctx.stroke.bind(ctx);
      ctx.lineTo=(x,y)=>{if(window.hexProbe)window.hexProbe.vertices.push([x,y]);return lineTo(x,y);};
      ctx.stroke=()=>{if(window.hexProbe)window.hexProbe.width=ctx.lineWidth;return stroke();};
      drawHex=(...args)=>{window.hexProbe={vertices:[],width:0};hex(...args);window.sizeProbe.hex=window.hexProbe;window.hexProbe=null;};
      graphicPlacement=(frame,radius)=>{
        const pose=place(frame,radius);window.sizeProbe={radius,pose,rings:[],wave:window.lastWave};return pose;
      };
      drawSymmetricRing=(radius,...args)=>{window.sizeProbe.rings.push(radius);return ring(radius,...args);};
      createCoils=(...args)=>{const result=coils(...args);window.lastWave=result[3].arr.map(p=>Math.hypot(p.x-cx,p.y-cy));return result;};
    });
    for(const viewport of [{width:1920,height:1080},{width:1440,height:900},{width:390,height:844}]){
      await stableSize.setViewportSize(viewport);
      for(const preview of ['ai','welcome','memory-welcome','vote-prompt']){
        await stableSize.locator(`[data-preview="${preview}"]`).click();await settlePreview(stableSize);
        const samples=[];
        for(const volume of [0,96,255,0]){
          await stableSize.evaluate(volume=>{analyze=()=>{smooth.fill(volume);return{avg:volume,low:volume,mid:volume,high:volume};};},volume);
          await stableSize.waitForTimeout(650);
          samples.push(await stableSize.evaluate(()=>window.sizeProbe));
        }
        for(const sample of samples.slice(1)){
          assert.deepEqual(sample.pose,samples[0].pose,`${preview}: volume must never rescale or recenter AI`);
          assert.equal(sample.radius,samples[0].radius,'The graphic envelope must be volume independent');
          assert.deepEqual(sample.rings,samples[0].rings,'Outer circle diameters must remain fixed');
        }
        assert.ok(samples[2].wave.some((r,i)=>r-samples[0].wave[i]>2),'Audio waves must respond outward as before');
        assert.notDeepEqual(samples[2].hex.vertices,samples[0].hex.vertices,'The inner hex must deform with voice volume');
        assert.ok(samples[2].hex.width>samples[0].hex.width*5,'Restore the hex volume-dependent edge thickness');
        const size=await stableSize.evaluate(()=>{
          const frame=projectionFrame(),radius=window.sizeProbe.radius;
          const home=StageLayout.projectImageRegion(w,h,backgroundImage.naturalWidth,backgroundImage.naturalHeight,config.roomScreen);
          if(frame.background!=='opening'){home.x=w*.5-home.width/2;home.y=h*.4-home.height/2;}
          const voting=frame.caption?.startsWith('vote-');
          const previous=StageLayout.expandGraphicPose(home,{x:w*.04,y:h*(voting?.02:.05),width:w*.92,height:h*(voting?.76:.9)},radius,frame.background==='opening'?frame.scene:frame.aiExpansion,config.roomScreen.inset*home.width/config.roomScreen.width);
          return{actual:graphicPlacement(frame,radius),previous};
        });
        assert.equal(size.actual.x,size.previous.x,'Keep the foreground center');
        assert.equal(size.actual.y,size.previous.y,'Keep the foreground center');
        if(preview==='ai')assert.deepEqual(size.actual,size.previous,'Idle TV graphic size stays unchanged');
        else assert.ok(Math.abs(size.actual.scale/size.previous.scale-.82)<.01,'Actual foreground pose is about 18% smaller');
      }
    }
    await stableSize.close();
    results.push('quiet, medium, maximum and returning-to-silence spectra keep identical AI scale, center, envelope and ring diameters in four cues at three ratios; outward waves and hex geometry/stroke thickness remain audio reactive; foreground size is 82%');

    const voicePreview=await browser.newPage();await ready(voicePreview,url);
    await voicePreview.locator('#stepsViewButton').click();
    await voicePreview.evaluate(()=>{analyze=()=>{smooth.fill(255);return{avg:255,low:255,mid:255,high:255};};});
    for(const viewport of [{width:1920,height:1080},{width:1440,height:900},{width:390,height:844}]){
      await voicePreview.setViewportSize(viewport);
      for(const preview of ['memory-welcome','vote-prompt','vote-one','vote-two','vote-final']){
        await voicePreview.locator(`[data-preview="${preview}"]`).click();await settlePreview(voicePreview);
        await fixedFrame(voicePreview);const box=await voicePreview.locator('#visualizer').boundingBox();
        const voting=preview.startsWith('vote-');
        await checkVoiceForeground(voicePreview,voting);
        if(voting){
          const gap=await expectedDifference(voicePreview,null,[0,.8,1,.82],0);
          assert.equal(gap.mean,0,'The caption gap must be exactly black even at maximum spectrum');
        }
        assert.equal(await voicePreview.evaluate(()=>opening.deadline),null);
        assert.equal(await voicePreview.evaluate(()=>stage.voting.deadline),null);
        assert.equal(await voicePreview.evaluate(()=>Array.from(document.querySelectorAll('audio,video')).every(m=>m.currentTime===0&&m.paused)),true);
      }
    }
    await voicePreview.close();
    results.push('Memory and four selection voice previews show enlarged AI at three ratios without playing media; maximum-spectrum strokes, particles and glow stay in the stage and clear of the caption');

    const slow=await browser.newPage();
    let releaseAudio;
    const heldAudio=new Promise(resolve=>{releaseAudio=resolve;});
    await slow.route('**/assets/audio/ai-opening.m4a',async route=>{
      await heldAudio;await route.fulfill({contentType:'audio/mp4',body:fs.readFileSync(path.join(root,'assets/audio/ai-opening.m4a'))});
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
    await checkAiScreen(failedFullscreen,{centered:true,large:true});
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
    await effectPage.keyboard.press("Space"); await cue(effectPage,"ai"); await settleLiveAi(effectPage);
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
    const memoryIdle=await expectedDifference(memoryMedia,'assets/backgrounds/memory-room.png',null,20);
    await memoryMedia.keyboard.press('Space');await flag(memoryMedia,'memoryVoiceState','playing');
    await memoryMedia.waitForFunction(()=>transitions.aiExpansion.value===1);
    assert.ok(await memoryMedia.evaluate(()=>smooth.some(v=>v>0)), 'Memory voice reaches the audio analyser');
    const memoryLarge=await checkVoiceForeground(memoryMedia);
    assert.ok(memoryLarge.height>memoryIdle.height*1.8,'Memory AI must visibly enlarge during real voice playback');
    await memoryMedia.screenshot({path:path.join(output,'23-memory-voice-expanded.png')});
    await memoryMedia.keyboard.down('Space');await cue(memoryMedia,'memory-welcome');
    await flag(memoryMedia,'memoryVoiceState','finished');
    await memoryMedia.waitForFunction(()=>transitions.ai.value===0&&transitions.aiExpansion.value===0&&performance.now()>=stage.busyUntil);
    await memoryMedia.keyboard.down('Space');await cue(memoryMedia,'memory-welcome');
    await matchesStill(memoryMedia,'assets/backgrounds/memory-room.png');
    assert.equal(await memoryMedia.evaluate(()=>opening.deadline),memoryDeadline);
    await memoryMedia.keyboard.up('Space');await memoryMedia.keyboard.press('Space');await cue(memoryMedia,'memory-room');
    await noControls(memoryMedia);await memoryMedia.close();
    results.push('Memory click and welcome slots play real PCM fixtures, retry their own failures, block premature/held cues, fade AI only at real voice end and preserve the original opening deadline');

    const officeMedia=await browser.newPage();
    await officeMedia.route('**/opening-config.js',route=>route.fulfill({contentType:'text/javascript',body:
      fs.readFileSync(path.join(root,'opening-config.js'),'utf8').replace('bang: null','bang: "test-fixtures/memory-welcome.wav"')}));
    await officeMedia.addInitScript(()=>{
      const play=HTMLMediaElement.prototype.play;let blocked=true;
      HTMLMediaElement.prototype.play=function(){
        if(this.id==='officeBangAudio'&&blocked){blocked=false;return Promise.reject(new DOMException('Blocked','NotAllowedError'));}
        return play.call(this);
      };
    });
    await ready(officeMedia,url);await fastOffice(officeMedia);
    const officeDeadline=await officeMedia.evaluate(()=>opening.deadline);
    await officeMedia.keyboard.press('Space');await flag(officeMedia,'officeBangState','error');await cue(officeMedia,'office-bang');
    await officeMedia.keyboard.press('Space');await flag(officeMedia,'officeBangState','playing');
    await officeMedia.keyboard.down('Space');await cue(officeMedia,'office-bang');
    await flag(officeMedia,'officeBangState','finished');
    assert.equal(await officeMedia.locator('#officeBangAudio').evaluate(a=>a.ended),true);
    await officeMedia.keyboard.down('Space');await cue(officeMedia,'office-bang');
    await matchesStill(officeMedia,'assets/backgrounds/office-memory.png');
    await officeMedia.keyboard.up('Space');await officeMedia.keyboard.press('Space');await cue(officeMedia,'past-reflection');
    await officeMedia.waitForFunction(()=>performance.now()>=stage.busyUntil);
    await officeMedia.keyboard.press('Space');await cue(officeMedia,'memory-return');
    await officeMedia.waitForFunction(()=>performance.now()>=stage.busyUntil);
    await matchesStill(officeMedia,'assets/backgrounds/memory-room.png');await noControls(officeMedia);
    assert.equal(await officeMedia.evaluate(()=>opening.deadline),officeDeadline);
    await officeMedia.close();
    results.push('office BANG uses real PCM fixture playback, retries only its own failure and requires genuine end plus a released operator key before reflection; production sound stays null');

    const officeLoad=await browser.newPage();let releaseOffice;
    const officePending=new Promise(done=>releaseOffice=done);
    await officeLoad.route('**/assets/backgrounds/office-memory.png',async route=>{await officePending;await route.continue();});
    await officeLoad.goto(url,{waitUntil:'domcontentloaded'});
    await officeLoad.waitForSelector('body[data-memory-background-ready="true"][data-audio-ready="true"][data-video-ready="true"]');
    assert.equal(await officeLoad.locator('#startButton').isDisabled(),true);
    await officeLoad.locator('#stepsViewButton').click();await officeLoad.locator('[data-preview="office-light"]').click();
    await officeLoad.keyboard.press('Space');assert.equal(await officeLoad.locator('#roomRevealVideo').evaluate(v=>v.currentTime),0);
    releaseOffice();await flag(officeLoad,'officeBackgroundReady','true');
    await officeLoad.waitForFunction(()=>!document.getElementById('startButton').disabled);
    assert.equal(await officeLoad.evaluate(()=>document.body.dataset.started),'false');
    await officeLoad.locator('[data-preview="office-light"]').click();await officeLoad.waitForTimeout(100);
    await matchesStill(officeLoad,'assets/backgrounds/office-memory.png');await officeLoad.close();
    const officeMissing=await browser.newPage();
    await officeMissing.route('**/assets/backgrounds/office-memory.png',route=>route.abort());
    await officeMissing.goto(url);await flag(officeMissing,'officeBackgroundReady','false');
    assert.equal(await officeMissing.locator('#startButton').isDisabled(),true);
    assert.equal(await officeMissing.locator('#startStatus').textContent(),'素材未載入，請重新整理');
    await officeMissing.close();
    results.push('office background loading gates Start, loading completion never auto-starts playback and failed loading exposes the existing material status');

    const votingMedia=await browser.newPage();
    await votingMedia.route('**/opening-config.js',route=>{
      let body=fs.readFileSync(path.join(root,'opening-config.js'),'utf8');
      for(const kind of ['prompt','one','two','final'])body=body.replace(kind+': null',kind+': "test-fixtures/memory-welcome.wav"');
      return route.fulfill({contentType:'text/javascript',body});
    });
    await votingMedia.addInitScript(()=>{
      const play=HTMLMediaElement.prototype.play;
      const blocked=new Set(['selectionPromptAudio','selectionOneAudio','selectionTwoAudio','selectionFinalAudio']);
      HTMLMediaElement.prototype.play=function(){
        if(blocked.delete(this.id))return Promise.reject(new DOMException('Blocked','NotAllowedError'));
        return play.call(this);
      };
    });
    await ready(votingMedia,url);await fastVoting(votingMedia);
    const votingOpeningDeadline=await votingMedia.evaluate(()=>opening.deadline);let votingDeadline;
    const voteIdle=await expectedDifference(votingMedia,'assets/backgrounds/memory-room.png',[0,0,1,.8],15,.2);
    for(const [kind,current,next] of [['Prompt','vote-prompt','vote-clock'],['One','vote-one','vote-two'],['Two','vote-two','vote-final'],['Final','vote-final','vote-blackout']]){
      await flag(votingMedia,'selection'+kind+'State','error');await cue(votingMedia,current);
      if(kind==='Prompt')assert.equal(await votingMedia.evaluate(()=>stage.voting.deadline),null);
      await votingMedia.waitForFunction(()=>performance.now()>=stage.busyUntil);
      await votingMedia.keyboard.press('Space');await flag(votingMedia,'selection'+kind+'State','playing');
      await votingMedia.waitForFunction(()=>transitions.aiExpansion.value===1&&transitions.clock.value===0);
      assert.ok(await votingMedia.evaluate(()=>smooth.some(v=>v>0)),'Each selection recording reaches the waveform analyser');
      const large=await checkVoiceForeground(votingMedia,true);
      assert.ok(large.height>voteIdle.height*1.8,'Each selection recording must visibly enlarge AI');
      await votingMedia.screenshot({path:path.join(output,'24-selection-'+kind.toLowerCase()+'-expanded.png')});
      await votingMedia.keyboard.down('Space');await cue(votingMedia,current);
      await flag(votingMedia,'selection'+kind+'State','finished');
      assert.equal(await votingMedia.locator('#selection'+kind+'Audio').evaluate(a=>a.ended),true);
      if(kind==='Prompt')votingDeadline=await votingMedia.evaluate(()=>stage.voting.deadline);
      assert.equal(await votingMedia.evaluate(()=>stage.voting.deadline),votingDeadline);
      await votingMedia.keyboard.down('Space');await cue(votingMedia,current);
      await votingMedia.waitForFunction(()=>transitions.aiExpansion.value===0&&performance.now()>=stage.busyUntil);
      if(kind==='Prompt'){
        const small=await expectedDifference(votingMedia,'assets/backgrounds/memory-room.png',[0,0,1,.8],15,.2);
        assert.ok(small.height<large.height*.65,'Prompt completion must visibly shrink AI before the manual clock cue');
      }else{
        assert.equal(await votingMedia.evaluate(()=>transitions.clock.value),1,'Vote completion restores the clock automatically');
        const clock=await expectedDifference(votingMedia,'assets/backgrounds/memory-room.png',[0,.2,1,.55],15,.2);
        assert.ok(clock.height<large.height*.65,'Clock replaces the enlarged figure after real voice end');
      }
      await votingMedia.keyboard.up('Space');await votingMedia.keyboard.press('Space');await cue(votingMedia,next);
      if(kind==='Prompt'){
        await votingMedia.waitForFunction(()=>performance.now()>=stage.busyUntil);
        await votingMedia.keyboard.press('Space');await cue(votingMedia,'vote-one');
      }
    }
    await votingMedia.waitForFunction(()=>performance.now()>=stage.busyUntil);
    assert.equal(await votingMedia.evaluate(()=>opening.deadline),votingOpeningDeadline);
    await noControls(votingMedia);await votingMedia.close();
    results.push('all four selection voices use real PCM playback, retry only their own failures and wait for genuine end plus a released key; only the prompt owns the minute and the original opening deadline remains unchanged');

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
    await touch.touchscreen.tap(190,420); await cue(touch,"ai"); await settleLiveAi(touch);
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
