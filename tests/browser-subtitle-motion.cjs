'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch(process.env.LOCAL_CHROMIUM?{}:{channel:'chrome'});
 const checks=[];
 try{
  for(const viewport of [{width:1280,height:720},{width:1440,height:900},{width:390,height:844}]){
   const page=await browser.newPage({viewport});
   await page.setContent(`<style>${fs.readFileSync(path.join(root,'stage.css'),'utf8')}</style><main id="showShell"><div id="projectionViewport"><div id="visualizerWrap"><div id="subtitles" hidden><div id="subtitleSpeaker"></div><div id="subtitleText"></div></div></div></div></main>`);
   await page.addScriptTag({path:path.join(root,'stage-layout.js')});await page.addScriptTag({path:path.join(root,'subtitle-motion.js')});
   await page.evaluate(()=>{const box=StageLayout.fitStage(innerWidth,innerHeight),wrap=document.querySelector('#visualizerWrap');wrap.style.width=box.width+'px';wrap.style.height=box.height+'px';window.motion=new SubtitleMotion.Renderer({element:document.querySelector('#subtitles')});});
   await page.evaluate(()=>motion.render({id:'a',speaker:'RACHEL',text:'What the hell..?'}));
   assert.equal(await page.locator('#subtitleText').textContent(),'What the hell..?');
   await page.waitForTimeout(65);
   const middle=await page.locator('#subtitles').evaluate(e=>({opacity:Number(getComputedStyle(e).opacity),y:e.getBoundingClientRect().y}));
   assert.ok(middle.opacity>0&&middle.opacity<1,'Appearance must have a visible intermediate opacity');
   await page.evaluate(()=>motion.incoming.finished);
   const end=await page.locator('#subtitles').evaluate(e=>({opacity:Number(getComputedStyle(e).opacity),y:e.getBoundingClientRect().y}));
   assert.equal(end.opacity,1);assert.ok(middle.y>end.y,'Appearance moves slightly upward');
   await page.evaluate(()=>{window.firstAnimation=motion.incoming;motion.render({id:'a',speaker:'RACHEL',text:'What the hell..?'});});
   assert.equal(await page.evaluate(()=>motion.incoming===firstAnimation),true,'Same-entry voice callbacks do not restart the animation');
   await page.evaluate(()=>motion.render({id:'b',speaker:'MEGAN',text:'Wait, where am I?'}));
   assert.equal(await page.locator('#subtitleText').textContent(),'Wait, where am I?');
   assert.equal(await page.locator('[data-subtitle-ghost]').count(),1);
   assert.equal(await page.locator('[data-subtitle-ghost]').getAttribute('aria-hidden'),'true');
   assert.equal(await page.locator('[data-subtitle-ghost] [id]').count(),0,'Outgoing layer cannot duplicate DOM ids');
   assert.equal(await page.locator('#subtitleText').count(),1);
   await page.evaluate(()=>motion.incoming.finished);await page.waitForTimeout(10);
   assert.equal(await page.locator('[data-subtitle-ghost]').count(),0);
   await page.evaluate(()=>motion.render(null));
   assert.equal(await page.locator('#subtitles').isVisible(),false);
   assert.equal(await page.locator('[data-subtitle-ghost]').count(),1,'Hiding retains a temporary outgoing visual for fade-out');
   await page.waitForTimeout(70);
   const hiding=await page.locator('[data-subtitle-ghost]').evaluate(e=>Number(getComputedStyle(e).opacity));
   assert.ok(hiding>0&&hiding<1,'Hiding fades through intermediate opacity');
   // Interrupt the hide with a new line; old completion cannot hide this new subtitle.
   await page.evaluate(()=>motion.render({id:'c',speaker:'CHRISTOPHER',text:'INTERESTING.'}));
   await page.waitForTimeout(280);
   assert.equal(await page.locator('#subtitles').isVisible(),true);assert.equal(await page.locator('#subtitleText').textContent(),'INTERESTING.');
   assert.equal(await page.locator('[data-subtitle-ghost]').count(),0);
   await page.evaluate(()=>{for(let i=0;i<40;i++){motion.render({id:'rapid-'+i,speaker:i%2?'ETHAN':'MEGAN',text:'Line '+i});if(i%3===0)motion.render(null);}motion.render({id:'latest',speaker:'RACHEL',text:'Only the latest sentence.'});});
   assert.ok(await page.locator('[data-subtitle-ghost]').count()<=1);
   await page.waitForTimeout(300);
   assert.equal(await page.locator('#subtitleText').textContent(),'Only the latest sentence.');assert.equal(await page.locator('[data-subtitle-ghost]').count(),0);
   const bounds=await page.evaluate(()=>{const a=document.querySelector('#visualizerWrap').getBoundingClientRect(),b=document.querySelector('#subtitles').getBoundingClientRect();return b.x>=a.x&&b.right<=a.right&&b.y>=a.y&&b.bottom<=a.bottom;});assert.equal(bounds,true);
   await page.emulateMedia({reducedMotion:'reduce'});
   await page.evaluate(()=>motion.render({id:'reduced',speaker:'ETHAN',text:'No motion.'}));
   assert.equal(await page.locator('#subtitles').evaluate(e=>e.getAnimations().length),0);
   assert.equal(await page.locator('#subtitles').evaluate(e=>getComputedStyle(e).opacity),'1');assert.equal(await page.locator('[data-subtitle-ghost]').count(),0);
   await page.evaluate(()=>motion.render(null));assert.equal(await page.locator('[data-subtitle-ghost]').count(),0);
   await page.close();
  }
  checks.push('visible intermediate fade-in and upward motion, outgoing/incoming crossfade, and fade-out at three screen ratios');
  checks.push('rapid forward/backward-style updates and hide/show interruption keep only the latest sentence; no stale ghost, duplicate id or hidden new subtitle');
  checks.push('same-entry callbacks never restart the transition; reduced-motion switches immediately; final text remains inside the projection');
  for(const s of checks)console.log('PASS',s);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
