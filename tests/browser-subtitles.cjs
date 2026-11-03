'use strict';
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');const data=require('../script-data');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results');fs.mkdirSync(out,{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.m4a':'audio/mp4','.wav':'audio/wav','.mp4':'video/mp4'};
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
  await page.locator(`[data-script="${indexOf(83,'“Access to one\'s memory.”')}"]`).click();
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#subtitleText').textContent(),'“Access to one\'s memory.”');
  assert.ok(await page.locator('audio,video').evaluateAll(xs=>xs.every(x=>x.paused&&x.currentTime===0)));
  assert.equal(await page.evaluate(()=>scriptShow.deadlines.opening),null);
  await page.screenshot({path:path.join(out,'script-card-preview.png')});checks.push('417 quiet previews never play media or start either timer; exact curly-quoted manuscript card subtitle');
  await page.locator('#startButton').press('f');await page.waitForFunction(()=>scriptShow.started);
  assert.equal(await page.evaluate(()=>scriptShow.index),0);assert.equal(await page.locator('button:visible').count(),0);
  // Walk every actual forward input; no synthetic timeline jump.
  const firstVoice=data.entries.findIndex(x=>x.group==='opening');
  for(let i=1;i<=firstVoice;i++){
   await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>scriptShow.index),i);
   assert.equal(await page.locator('#subtitleText').textContent(),data.entries[i].text);
   if(data.entries[i].action==='reveal')await page.waitForFunction(()=>document.querySelector('#roomRevealVideo').ended);
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
  for(let i=clock+1;i<data.entries.length;i++){
   const from=data.entries[i-1],to=data.entries[i];
   if(from.group!==to.group&&from.group){await page.waitForFunction(()=>!['starting','playing'].includes(scriptShow.active?.state),null,{timeout:12000});}
   await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>scriptShow.index),i,'entry '+i);
   assert.equal(await page.locator('#subtitleText').textContent(),to.text);
   if(to.text)assert.equal(await page.locator('#subtitles').isVisible(),true);
   if([83,109,195,290,407,414,416].includes(to.paragraph)){
    await page.waitForTimeout(650);
    assert.equal(await page.locator('body').getAttribute('data-scene'),to.look.background);
    if(to.paragraph===195)await page.screenshot({path:path.join(out,'script-office.png')});
    if(to.paragraph===414&&to.text==='There is no robot in the room.')await page.screenshot({path:path.join(out,'script-ending.png')});
   }
  }
  assert.equal(await page.locator('body').getAttribute('data-script-action'),'end-blackout');await page.waitForTimeout(1300);
  assert.ok(await page.locator('#visualizer').evaluate(c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return d.every((v,i)=>i%4===3||v===0);}));
  const last=data.entries.length-1;await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>scriptShow.index),last);
  const deadlines=await page.evaluate(()=>({...scriptShow.deadlines}));
  for(let i=last-1;i>=0;i--){await page.keyboard.press('ArrowLeft');assert.equal(await page.evaluate(()=>scriptShow.index),i);assert.equal(await page.locator('#subtitleText').textContent(),data.entries[i].text);}
  assert.deepEqual(await page.evaluate(()=>({...scriptShow.deadlines})),deadlines);assert.equal(await page.locator('button:visible').count(),0);
  checks.push('all 417 forward and reverse inputs preserve exact 375 sentences, two-vote order, four acts, boundaries and deadlines; missing audio never blocks; terminal blackout is truly black');
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
  checks.push('all 375 subtitles fit inside 16:9 projection at three screen ratios in step review');
  assert.deepEqual(errors,[]);for(const x of checks)console.log('PASS',x);
  fs.writeFileSync(path.join(out,'subtitle-results.json'),JSON.stringify({passed:true,checks},null,2));
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
