'use strict';
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');const data=require('../script-data');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results');fs.mkdirSync(out,{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.m4a':'audio/mp4','.mp3':'audio/mpeg','.wav':'audio/wav','.mp4':'video/mp4'};
const server=http.createServer((req,res)=>{let p;try{p=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));}catch{res.writeHead(400).end();return;}if(p===root)p=path.join(root,'index.html');if(!p.startsWith(root+path.sep)||!fs.existsSync(p)){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':types[path.extname(p)]||'application/octet-stream'});fs.createReadStream(p).pipe(res);});
const checks=[];let browser;
const indexOf=(p,text='')=>data.entries.findIndex(x=>x.paragraph===p&&(!text||x.text===text));
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 try{
  browser=await chromium.launch(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{channel:'chrome'});
  const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(url);try{await page.waitForFunction(()=>!document.querySelector('#startButton').disabled);}catch(e){console.error(await page.evaluate(()=>({flags:{...document.body.dataset},media:[...document.querySelectorAll('audio,video')].map(a=>({id:a.id,error:a.error?.message,ready:a.readyState})),text:document.querySelector('#startStatus').textContent})),errors);throw e;}
  assert.equal(await page.locator('#stepList [data-script]').count(),data.entries.length);
  await page.locator('#stepsViewButton').click();
  assert.equal(await page.locator('#stepList .step-audio').count(),0);
  const track=page.locator('#audioTimeline'),trackSelect=page.locator('#timelineTrack');
  assert.equal(await trackSelect.inputValue(),'音效');
  assert.equal(await track.getByRole('button',{name:/^音效 Slam-button\.m4a/}).count(),1);
  await trackSelect.selectOption('語音');
  assert.equal(await track.getByRole('button',{name:/^語音 411-415ai\.m4a/}).count(),1);
  await trackSelect.selectOption('配樂');
  assert.equal(await track.getByRole('button',{name:/^配樂 Ending\.m4a/}).count(),1);
  await trackSelect.selectOption('音效');
  await track.getByRole('button',{name:/^音效 door-open\.mp3/}).click();
  assert.equal(await page.locator('#startLabel').textContent(),`從第 ${indexOf(87)} 步開始`);
  await page.locator('[data-script="0"]').click();
  assert.equal(await track.locator('.timeline-cursor').isVisible(),true);
  const narrationFiles={
   selectionPromptAudio:'387-389ai.m4a',selectionOneAudio:'391-392ai.m4a',
   selectionTwoAudio:'395-396ai.m4a',selectionFinalAudio:'399ai.m4a',
   completeAudio:'404-406ai.m4a',revealTruthAudio:'411-415ai.m4a'
  };
  for(const [id,name] of Object.entries(narrationFiles)){
   assert.equal(await page.locator('#'+id).getAttribute('src'),'assets/audio/'+name,
     'AI narration '+id+' should use the uploaded file');
  }
  assert.ok(!data.entries.some(x=>x.paragraph===405));
  for(const p of [42,185,188,195,221,269])assert.ok(!data.entries.some(x=>x.paragraph===p&&x.kind==='cue'));
  await page.locator(`[data-script="${indexOf(83,'“Access to one\'s memory.”')}"]`).click();
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#subtitles').count(),1);
  assert.equal(await page.locator('#subtitleStack, #subtitlePrevious, #subtitleNext').count(),0);
  assert.equal(await page.locator('#subtitleText').textContent(),'“Access to one\'s memory.”');
  assert.ok(await page.locator('audio,video').evaluateAll(xs=>xs.every(x=>x.paused&&x.currentTime===0)));
  assert.equal(await page.evaluate(()=>scriptShow.deadlines.opening),null);
  assert.match(await page.locator('#startLabel').textContent(),/從第 .* 步開始/);
  await page.screenshot({path:path.join(out,'script-card-preview.png')});checks.push('381 quiet previews show media filenames; step zero uses the blue room, remains silent and does not autoplay');
  // Validate a real rehearsal jump, including on-demand media and a fresh clock.
  const rehearsal=await browser.newPage({viewport:{width:1280,height:720}});
  await rehearsal.goto(url);
  await rehearsal.waitForFunction(()=>!document.getElementById('startButton').disabled);
  await rehearsal.locator('#stepsViewButton').click();
  const doorIndex=indexOf(87);
  await rehearsal.locator(`[data-script="${doorIndex}"]`).click();
  assert.equal(await rehearsal.locator('#startLabel').textContent(),`從第 ${doorIndex} 步開始`);
  await rehearsal.locator('#startButton').click();
  assert.equal(await rehearsal.evaluate(()=>scriptShow.index),doorIndex);
  assert.equal(await rehearsal.evaluate(()=>scriptShow.entry.action),'doorOpen');
  assert.ok(await rehearsal.evaluate(()=>scriptShow.deadlines.opening>performance.now()));
  assert.equal(await rehearsal.locator('#openingAudio').evaluate(a=>a.paused),true);
  await rehearsal.waitForFunction(()=>document.querySelector('#scriptEffect-doorOpen').ended||document.querySelector('#scriptEffect-doorOpen').error);
  assert.equal(await rehearsal.locator('#scriptEffect-doorOpen').evaluate(a=>a.error),null);
  await rehearsal.close();
  // The middle sentence of an AI group must still start its audio recording.
  const voiceRehearsal=await browser.newPage({viewport:{width:1280,height:720}});
  await voiceRehearsal.goto(url);
  await voiceRehearsal.waitForFunction(()=>!document.getElementById('startButton').disabled);
  await voiceRehearsal.locator('#stepsViewButton').click();
  const truthIndex=data.entries.findIndex((e,i)=>i>0&&e.group==='revealTruth'&&data.entries[i-1].group==='revealTruth');
  await voiceRehearsal.locator(`[data-script="${truthIndex}"]`).click();
  await voiceRehearsal.keyboard.press('f');
  assert.equal(await voiceRehearsal.evaluate(()=>scriptShow.index),truthIndex);
  await voiceRehearsal.waitForFunction(()=>scriptShow.active?.group==='revealTruth'&&scriptShow.active?.state==='playing');
  assert.equal(await voiceRehearsal.locator('#revealTruthAudio').evaluate(a=>a.paused),false);
  assert.equal(await voiceRehearsal.locator('#subtitleText').textContent(),data.entries[truthIndex].text);
  assert.equal(await voiceRehearsal.locator('#selectionPromptAudio').evaluate(a=>a.paused),true);
  await voiceRehearsal.close();
  // Regression: all actual current step IDs 366-379 must be visible and
  // executable after the user-requested deletions, not just present in JSON.
  const after366=await browser.newPage({viewport:{width:1280,height:720}});
  await after366.goto(url);
  await after366.waitForFunction(()=>!document.getElementById('startButton').disabled);
  await after366.locator('#stepsViewButton').click();
  assert.equal(data.entries.length,381);
  for(let i=366;i<=379;i++)
   assert.equal(await after366.locator(`#stepList [data-script="${i}"]`).count(),1,'missing visual step '+i);
  await after366.locator('[data-script="366"]').click();
  assert.equal(await after366.locator('#startLabel').textContent(),'從第 366 步開始');
  await after366.locator('#startButton').click();
  assert.equal(await after366.evaluate(()=>scriptShow.index),366);
  assert.equal(await after366.evaluate(()=>scriptShow.entry.action),'ending-light');
  for(let i=367;i<=379;i++){
   const from=data.entries[i-1],to=data.entries[i];
   if(from.group && from.group!==to.group){
    const mediaId=from.group==='complete'?'completeAudio':from.group==='revealTruth'?'revealTruthAudio':null;
    if(mediaId){
     await after366.locator('#'+mediaId).evaluate(a=>{if(Number.isFinite(a.duration))a.currentTime=Math.max(0,a.duration-.12);});
     await after366.waitForFunction(()=>!['starting','playing'].includes(scriptShow.active?.state));
    }
   }
   await after366.keyboard.press('ArrowRight');
   assert.equal(await after366.evaluate(()=>scriptShow.index),i,'post-366 navigation '+i);
   assert.equal(await after366.locator('#subtitleText').textContent(),to.text);
  }
  assert.equal(await after366.evaluate(()=>scriptShow.entry.action),'end-blackout');
  await after366.close();
  checks.push('step review retains the original Act IV steps 366-379, followed by the optional post-show cue');

  // Clearing the selection explicitly restores starting at the first cue.
  await page.locator('#resetStartStep').click();
  assert.equal(await page.locator('#startLabel').textContent(),'開始');
  assert.equal(await page.evaluate(()=>window.selectedScriptStartIndex),null);
  await page.locator('#startButton').press('f');await page.waitForFunction(()=>scriptShow.started);
  assert.equal(await page.evaluate(()=>scriptShow.index),0);assert.equal(await page.locator('button:visible').count(),0);
  assert.equal(await page.locator('#subtitleText').textContent(),data.entries[0].text);
  assert.equal(await page.locator('#subtitleStack, #subtitlePrevious, #subtitleNext').count(),0);
  assert.equal(await page.evaluate(()=>document.fullscreenElement?.id),'showShell');
  const canvasIsBlack=()=>page.locator('#visualizer').evaluate(canvas=>{
    const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    for(let i=0;i<pixels.length;i+=4)if(pixels[i]||pixels[i+1]||pixels[i+2])return false;
    return true;
  });
  await page.waitForFunction(()=>{
    const c=document.getElementById('visualizer'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    return d.some((v,i)=>i%4!==3&&v>15);
  });
  assert.equal(await canvasIsBlack(),true,'Step zero must be dim enough for stagehands (all pixels <=15)');
  assert.equal(await page.evaluate(()=>scriptProjectionFrame().room),false);
  assert.equal(await page.evaluate(()=>scriptProjectionFrame().blackout),0);
  assert.equal(await page.locator('#actOneBgm').getAttribute('src'),null);
  assert.equal(await page.locator('#actOneBgm').evaluate(a=>a.paused),true);
  assert.equal(await page.locator('audio,video').evaluateAll(xs=>xs.every(x=>x.paused)),true,'No sound before room reveal');
  await page.keyboard.press('q');
  assert.equal(await page.locator('#volumeDisplay').textContent(),'語音 95%\n音效 100%\n背景音樂 100%');
  assert.equal(await page.locator('#openingAudio').evaluate(a=>a.volume),.95);
  assert.equal(await page.evaluate(()=>actOneBackgroundMusic.masterVolume),.4);
  assert.equal(await page.locator('#actOneBgm').evaluate(a=>a.volume),0);
  await page.keyboard.press('w');
  assert.equal(await page.locator('#doorKickAudio').evaluate(a=>a.volume),.95);
  assert.equal(await page.evaluate(()=>actOneBackgroundMusic.masterVolume),.4);
  await page.keyboard.press('e');
  assert.equal(await page.evaluate(()=>actOneBackgroundMusic.masterVolume),.38);
  assert.equal(await page.locator('#actOneBgmAlt').evaluate(a=>a.volume),0);
  assert.equal(await page.locator('#openingAudio').evaluate(a=>a.volume),.95);
  await page.keyboard.press('1');await page.keyboard.press('2');await page.keyboard.press('3');
  await page.keyboard.press('o');assert.equal(await page.locator('#volumeDisplay').isHidden(),true);
  await page.keyboard.press('o');assert.equal(await page.locator('#volumeDisplay').isVisible(),true);
  // Walk every actual forward input; no synthetic timeline jump.
  const firstVoice=data.entries.findIndex(x=>x.group==='opening');
  for(let i=1;i<=firstVoice;i++){
   if(i===1)await page.locator('#visualizer').click();else await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>scriptShow.index),i);
   assert.equal(await page.locator('#subtitleText').textContent(),data.entries[i].text);
   if(data.entries[i].paragraph<23){
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(await canvasIsBlack(),true,'Early actor lines immediately cut to black after blue step zero');
    assert.equal(await page.locator('#actOneBgm').getAttribute('src'),null);
    assert.equal(await page.locator('#actOneBgm').evaluate(a=>a.paused),true);
   }
   if(data.entries[i].action==='reveal'){
    assert.equal(await page.evaluate(()=>actOneBackgroundMusic.current?.src),'assets/audio/background/act-1/1-92.mp3');
    await page.waitForFunction(()=>document.querySelector('#roomRevealVideo').ended);
   }
  }
  await page.waitForFunction(()=>!document.querySelector('#openingAudio').paused);
  const clock=data.entries.findIndex(x=>x.action==='opening-clock');
  while(await page.evaluate(()=>scriptShow.index)<clock)await page.keyboard.press('Space');
  await page.waitForTimeout(1300);
  assert.equal(await page.evaluate(()=>transitions.clock.value),1);
  assert.equal(await page.locator('#openingAudio').evaluate(a=>a.paused),false);
  assert.equal(await page.evaluate(()=>scriptShow.deadlines.opening),null);
  await page.keyboard.down('ArrowRight');await page.keyboard.down('ArrowRight');
  assert.equal(await page.evaluate(()=>scriptShow.index),clock);
  await page.waitForFunction(()=>document.querySelector('#openingAudio').ended,null,{timeout:35000});
  await page.keyboard.down('ArrowRight');assert.equal(await page.evaluate(()=>scriptShow.index),clock);
  await page.keyboard.up('ArrowRight');const deadline=await page.evaluate(()=>scriptShow.deadlines.opening);assert.ok(deadline>0);
  await page.waitForTimeout(1100);await page.screenshot({path:path.join(out,'script-clock.png')});
  checks.push('F resets preview to opening; Space advances each AI sentence while real 22.36s audio continues; clock starts only at genuine end, held key never spills to actor line');
  // Subsequent media still run naturally; AI subtitles are manual, never elapsed-time driven.
  const votingCountdown=data.entries.findIndex(e=>e.id==='p389-0');
  const fourthActStart=data.entries.findIndex(e=>e.id==='p408-0');
  assert.equal(votingCountdown,355,'The third-act voting layout starts on step 355 without a clock');
  assert.equal(fourthActStart,367,'The fourth act begins at step 366 after the requested deletions');
  // Verify the original screenplay through blackout; the bonus clip follows
  // only after an additional manual Right/Space operator action.
  for(let i=clock+1;i<data.entries.length-1;i++){
   const from=data.entries[i-1],to=data.entries[i];
   if(from.group!==to.group&&from.group){await page.waitForFunction(()=>!['starting','playing'].includes(scriptShow.active?.state),null,{timeout:60000});}
   await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>scriptShow.index),i,'entry '+i);
   const soundtrackByParagraph={
    30:'assets/audio/background/act-1/1-92.mp3',
    99:'assets/audio/background/act-1/92-93(轉場).mp3',
    104:'assets/audio/background/act-1/94-174.mp3',
    179:'assets/audio/background/act-1/174-175(轉場).mp3',
    186:'assets/audio/background/act-2/176-181.mp3',
    284:'assets/audio/background/act-3/after-chris-transition.mp3',
    290:'assets/audio/background/act-3/after-chris-transition.mp3',
    403:null,
    407:'assets/audio/background/act-4/Ending.m4a',
    416:null
   };
   if(Object.prototype.hasOwnProperty.call(soundtrackByParagraph,to.paragraph)){
    const expected=soundtrackByParagraph[to.paragraph];
    assert.equal(await page.evaluate(()=>actOneBackgroundMusic.current?.src||null),expected,
      'Music must follow the immutable manuscript paragraph '+to.paragraph);
    if(expected){
      assert.equal(await page.evaluate(()=>actOneBackgroundMusic.activeAudio?.getAttribute('src')),expected);
      if(to.paragraph===290||to.paragraph===407){
       await page.waitForFunction(()=>actOneBackgroundMusic.activeAudio&&!actOneBackgroundMusic.activeAudio.paused,
        null,{timeout:15000});
       assert.equal(await page.evaluate(()=>actOneBackgroundMusic.activeAudio.error),null);
       assert.equal(await page.evaluate(()=>actOneBackgroundMusic.activeAudio.loop),true);
      }
    }else{
      await page.waitForFunction(()=>!actOneBackgroundMusic.stopping);
      assert.ok(await page.locator('#actOneBgm, #actOneBgmAlt').evaluateAll(xs=>xs.every(x=>x.paused)));
    }
   }
   const expectedEffects={
    doorOpen:['scriptEffect-doorOpen','assets/audio/effects/door-open.mp3'],
    timerClick:['scriptEffect-timerClick','assets/audio/effects/timer-click.wav'],
    memoryClick:['scriptEffect-memoryClick','assets/audio/effects/light-click.wav'],
    officeBang:['scriptEffect-officeBang','assets/audio/door-kick.wav'],
    'selection-button':['scriptEffect-selection-button','assets/audio/Slam-button.m4a']
   };
   if(to.action==='selection-button'){
    assert.equal(to.text,'Please make your selection.');
    assert.equal(to.group,'prompt');
    assert.equal(await page.evaluate(()=>scriptShow.active?.group),'prompt');
    assert.ok(await page.evaluate(()=>scriptProjectionFrame().flash>0),'Flash must start with the slam and AI voice');
    assert.equal(data.entries[i-1].paragraph,384);
    assert.equal(data.entries[i+1].text,'One by one, state the name of the person you believe to be the robot.');
   }
   if(expectedEffects[to.action]){
    const [id,src]=expectedEffects[to.action];
    assert.equal(await page.locator('#'+id).getAttribute('src'),src,'Effect at paragraph '+to.paragraph);
    // Check the actual WAV/MP3 decoding and playback, not only its filename.
    await page.waitForFunction(id=>{
      const audio=document.getElementById(id);
      return Boolean(audio?.ended || audio?.error);
    },id,{timeout:12000});
    const effect=await page.locator('#'+id).evaluate(audio=>({
      ended:audio.ended,duration:audio.duration,
      error:audio.error?.message||null,networkState:audio.networkState
    }));
    assert.equal(effect.error,null,'Audio decoder failed: '+id);
    assert.equal(effect.ended,true,'Effect never reached the end: '+id);
    assert.ok(Number.isFinite(effect.duration)&&effect.duration>.1,'Invalid sound duration for '+id);
    // The operator may replace the door track with a shorter or longer MP3.
    // Validate successful complete playback without assuming its duration.
   }
   const memoryOnly=i===fourthActStart-1||i===fourthActStart;
   if(i>=votingCountdown){
    assert.equal(await page.evaluate(()=>scriptProjectionFrame().hideBackground),!memoryOnly,
      'Only steps 380 and 381 restore the memory room background');
   }
   if(memoryOnly){
    assert.equal(await page.evaluate(()=>scriptProjectionFrame().backgroundOnly),true);
    for(const name of ['ai','clock','voteCorner','card','vote'])
     assert.equal(await page.evaluate(name=>transitions[name].target,name),0,
       'No graphics are allowed during the background-only scene: '+name);
    await page.waitForTimeout(i===fourthActStart-1?2350:680);
    const onlyBg=await page.evaluate(()=>{
     const frame=scriptProjectionFrame(),canvas=document.querySelector('#visualizer');
     const pixel=canvas.getContext('2d').getImageData(Math.floor(canvas.width/2),Math.floor(canvas.height/4),1,1).data;
     return {ai:frame.ai,clock:frame.clock,corner:frame.voteCorner,
      background:frame.background,blackout:frame.blackout,pixel:[...pixel].slice(0,3)};
    });
    assert.equal(onlyBg.background,'memory');assert.equal(onlyBg.blackout,0);
    assert.ok(onlyBg.ai<.01&&onlyBg.clock<.01&&onlyBg.corner<.01,
      'Background-only steps must not show the AI or timer');
    assert.ok(onlyBg.pixel.some(value=>value>0),'Memory room image should render');
   }
   if(i>=votingCountdown&&i<fourthActStart-1&&to.action!=='blackout'){
    await page.waitForTimeout(to.action==='ending-light'?2350:680);
    const stagePose=await page.evaluate(()=>{
     const f=projectionFrame(),p=graphicPlacement(f,200),
       large=graphicPlacement({...f,voteCorner:0,aiExpansion:1},200),
       t=clockPlacement(f);
     return {corner:f.voteCorner,ai:f.ai,clock:f.clock,
       x:p.x/w,y:p.y/h,ratio:p.scale/large.scale,
       timerX:t.x/w,timerY:t.y/h};
    });
    assert.ok(stagePose.corner>.98,'AI must remain in corner through step 380');
    assert.ok(stagePose.ai>.98&&stagePose.clock<.02,'Third-act AI remains but the timer is absent');
    assert.ok(Math.abs(stagePose.x-.82)<.02&&Math.abs(stagePose.y-.72)<.02,
      'AI is moved to lower-right');
    assert.ok(Math.abs(stagePose.ratio-.5)<.025,'Complete AI shrinks to half size');
    assert.equal(await page.evaluate(()=>transitions.clock.target),0,
      'Neither voting narration nor operator input may reactivate the countdown');
    assert.equal(await page.locator('#visualizer').evaluate(canvas=>{
      const c=canvas.getContext('2d'),pixel=c.getImageData(8,8,1,1).data;
      return pixel[0]===0&&pixel[1]===0&&pixel[2]===0;
    }),true,'Room background must be entirely removed, not merely dimmed');
   }
   if(i>=fourthActStart+1&&i<=data.entries.findIndex(e=>e.id==='p414-4')){
    const f=await page.evaluate(()=>scriptProjectionFrame());
    assert.equal(f.hideBackground,true,'Steps 382–392 retain black background');
    assert.equal(f.backgroundOnly,false,'Room-only scene ended after step 381');
    assert.equal(f.finalShape,true,'The final AI must persist in steps 382–392');
    for(const key of ['ai','aiExpansion']){
     assert.equal(await page.evaluate(name=>transitions[name].target,key),1,
       'AI shape must remain visible at paragraph '+to.paragraph+': '+key);
    }
    assert.equal(await page.evaluate(()=>transitions.clock.target),0);
    // Rendering fades only on the first appearance; never out across actor
    // lines or recording-end callbacks, including the final spoken sentence.
    await page.waitForTimeout(680);
    const pose=await page.evaluate(()=>({
     graphic:scriptProjectionFrame().ai,expanded:scriptProjectionFrame().aiExpansion,
     clock:scriptProjectionFrame().clock
    }));
    assert.ok(pose.graphic>.98&&pose.expanded>.98&&pose.clock<.02,
      'AI remains fully visible across steps 382–392');
   }
   if(to.text==='You may leave.') {
    assert.equal(data.entries[i+1]?.action,'end-blackout','Next operator input must go straight to black');
    // Natural completion of the last AI recording must not brighten the room.
    await page.evaluate(()=>{
     if(transcript.active?.group==='revealTruth'){
      transcript.active.state='finished';
      transcript.onVoice('revealTruth','finished');
     }
    });
    assert.equal(await page.evaluate(()=>transitions.ai.target),1);
    assert.equal(await page.evaluate(()=>transitions.aiExpansion.target),1);
   }
   if(to.action==='end-blackout') {
    assert.equal(await page.evaluate(()=>scriptProjectionFrame().finalShape),false,
      'Final blackout terminates the persistent AI after step 392');
    assert.equal(await page.evaluate(()=>transitions.blackout.target),1);
    assert.equal(await page.evaluate(()=>transitions.blackout.duration),0,'Final blackout must be an instant cut');
   }
   assert.equal(await page.locator('#subtitleText').textContent(),to.text);
   if(to.text)assert.equal(await page.locator('#subtitles').isVisible(),true);
   if(to.paragraph===43){
    await page.waitForTimeout(650);
    const pose=await page.evaluate(()=>{
     const frame=projectionFrame(),bright={...frame,scene:0};
     return {dim:frame.scene,group:frame.voiceGroup,
      clock:clockPlacement(frame),restClock:clockPlacement(bright),
      ai:graphicPlacement(frame,100),restAi:graphicPlacement(bright,100)};
    });
    assert.equal(pose.dim,.35);assert.equal(pose.group,null);
    assert.deepEqual(pose.clock,pose.restClock,'Middle spotlight only dims the background; clock stays fitted to TV');
    assert.deepEqual(pose.ai,pose.restAi,'Middle spotlight never enlarges AI');
   }

   if([83,109,195,290,407,414,416].includes(to.paragraph)){
    await page.waitForTimeout(650);
    assert.equal(await page.locator('body').getAttribute('data-scene'),to.look.background);
    if(to.paragraph===195)await page.screenshot({path:path.join(out,'script-office.png')});
    if(to.paragraph===414&&to.text==='There is no robot in the room.')await page.screenshot({path:path.join(out,'script-ending.png')});
   }
  }
  assert.equal(await page.locator('body').getAttribute('data-script-action'),'end-blackout');await page.waitForTimeout(1300);
  assert.ok(await page.locator('#visualizer').evaluate(c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return d.every((v,i)=>i%4===3||v===0);}));
  assert.equal(await page.locator('#behindScenesVideo').evaluate(v=>v.hidden&&v.paused),true,
    'The final blackout must not automatically start the bonus film');
  const last=data.entries.length-1;
  assert.equal(data.entries[last].action,'behind-the-scenes');
  await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>scriptShow.index),last);
  assert.equal(await page.locator('body').getAttribute('data-script-action'),'behind-the-scenes');
  assert.equal(await page.locator('#behindScenesVideo').evaluate(v=>v.hidden),true,
    'Missing optional MP4 leaves the stage black');
  const deadlines=await page.evaluate(()=>({...scriptShow.deadlines}));
  for(let i=last-1;i>=0;i--){await page.keyboard.press('ArrowLeft');assert.equal(await page.evaluate(()=>scriptShow.index),i);assert.equal(await page.locator('#subtitleText').textContent(),data.entries[i].text);}
  assert.deepEqual(await page.evaluate(()=>({...scriptShow.deadlines})),deadlines);assert.equal(await page.locator('button:visible').count(),0);
  checks.push('all 381 forward and reverse inputs preserve existing subtitles and show boundaries; blackout is separate from the optional behind-the-scenes cue');
  // Check every subtitle at all ratios, including review pane. No text leaves the fixed projection frame.
  await page.reload();await page.waitForFunction(()=>!document.querySelector('#startButton').disabled);await page.locator('#stepsViewButton').click();
  for(const viewport of [{width:1920,height:1080},{width:1440,height:900},{width:390,height:844}]){
   await page.setViewportSize(viewport);
   for(let i=0;i<data.entries.length;i++)if(data.entries[i].text){
    await page.locator(`[data-script="${i}"]`).click();
    const boxes=await page.evaluate(()=>{const a=document.querySelector('#visualizerWrap').getBoundingClientRect(),b=document.querySelector('#subtitles').getBoundingClientRect();return {ax:a.x,ay:a.y,ar:a.right,ab:a.bottom,ratio:a.width/a.height,bx:b.x,by:b.y,br:b.right,bb:b.bottom};});
    assert.ok(Math.abs(boxes.ratio-16/9)<.01);assert.ok(boxes.bx>=boxes.ax&&boxes.br<=boxes.ar+1&&boxes.by>=boxes.ay&&boxes.bb<=boxes.ab+1,JSON.stringify({i,viewport,boxes}));
   }
  }
  checks.push('all 359 current text-bearing steps fit inside 16:9 projection at three screen ratios in step review');
  assert.deepEqual(errors,[]);for(const x of checks)console.log('PASS',x);
  fs.writeFileSync(path.join(out,'subtitle-results.json'),JSON.stringify({passed:true,checks},null,2));
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
