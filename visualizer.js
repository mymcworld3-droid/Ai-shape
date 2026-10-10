"use strict";
const config=window.OPENING_CONFIG;
const audioElement=document.getElementById("openingAudio");
const canvas=document.getElementById("visualizer");
const ctx=canvas.getContext("2d");
const visualizerWrap=document.getElementById("visualizerWrap");
const backgroundImage=new Image();
let backgroundReady=false;
let audioCtx=null,analyser=null,source=null,dataArray=null,smooth=new Float32Array(512);
let dpr=1,w=0,h=0,cx=0,cy=0,scale=1;
let energy=0,bassEnergy=0,midEnergy=0,highEnergy=0,pulse=0,rotation=0;
let rotationTarget=0,rotationMoving=false,rotationMoveStart=0,rotationStart=0;
const ROTATE_INTERVAL=500,ROTATE_DURATION=1400,ROTATE_STEP=Math.PI/3;
const particles=[],PARTICLES=90;
const freqMin=20,freqMax=20000;
let sceneProgress=0,sceneTarget=0,sceneFrom=0,sceneStart=0,sceneTransitioning=false;
let timerActive=false,timerMorph=0,timerMorphStart=0,timerSettle=0,timerSettleStart=null;

function easeInOutCubic(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2}
function setSceneTarget(target){
 sceneFrom=sceneProgress;sceneTarget=target;sceneStart=performance.now();sceneTransitioning=true;
}
function updateTransitions(now){
 if(sceneTransitioning){
  const p=Math.max(0,Math.min(1,(now-sceneStart)/config.sceneDurationMs));
  sceneProgress=sceneFrom+(sceneTarget-sceneFrom)*easeInOutCubic(p);
  if(p===1)sceneTransitioning=false;
 }
 if(!timerActive)return;
 const p=Math.max(0,Math.min(1,(now-timerMorphStart)/config.morphDurationMs));
 timerMorph=easeInOutCubic(p);
 if(p===1&&timerSettleStart===null){timerSettleStart=now;setSceneTarget(0);}
 if(timerSettleStart!==null){
  const q=Math.max(0,Math.min(1,(now-timerSettleStart)/config.settleDurationMs));
  timerSettle=easeInOutCubic(q);
 }
}

const opening=new StageOpening.OpeningController({
 audio:audioElement,durationMs:config.countdownMs,
 onStateChange(state){
  document.body.dataset.openingState=state;
  if(state==="narration")setSceneTarget(1);
  if(state==="countdown"){
   timerActive=true;timerMorphStart=performance.now();timerMorph=0;timerSettle=0;timerSettleStart=null;
  }
  if(state==="ready"){
   timerActive=false;timerMorph=0;timerSettle=0;timerSettleStart=null;setSceneTarget(0);
  }
 },
 onError(error){document.body.dataset.audioError="true";console.error("[Opening]",error);}
});
document.body.dataset.openingState="ready";
// Read-only diagnostics for rehearsals; no control UI appears on the projection.
window.stageOpening=Object.freeze({
 get state(){return opening.state;},
 get remainingMs(){return opening.getRemainingMs();}
});

backgroundImage.addEventListener("load",()=>{
 backgroundReady=true;document.body.dataset.backgroundReady="true";
});
backgroundImage.addEventListener("error",()=>{
 document.body.dataset.backgroundReady="false";
 console.error("[Opening] Room background could not be loaded.");
});
backgroundImage.src=config.background;
audioElement.addEventListener("canplay",()=>{document.body.dataset.audioReady="true";});
audioElement.src=config.narration;
audioElement.load();

function prepareAudio(){
 try{
  if(!audioCtx){
   const AudioContext=window.AudioContext||window.webkitAudioContext;
   if(!AudioContext)return;
   audioCtx=new AudioContext();analyser=audioCtx.createAnalyser();
   analyser.fftSize=1024;analyser.minDecibels=-90;analyser.maxDecibels=-10;
   analyser.smoothingTimeConstant=.22;
   source=audioCtx.createMediaElementSource(audioElement);
   source.connect(analyser);analyser.connect(audioCtx.destination);
   dataArray=new Uint8Array(analyser.frequencyBinCount);smooth=new Float32Array(analyser.frequencyBinCount);
  }
  if(audioCtx.state==="suspended")audioCtx.resume().catch(error=>console.warn("[Opening] Audio analysis:",error));
 }catch(error){console.warn("[Opening] Audio analysis unavailable:",error);}
}
function startOpening(){
 if(opening.state!=="ready")return;
 document.body.dataset.audioError="false";
 prepareAudio();
 // Both calls originate in the same genuine keyboard event. A fullscreen failure
 // never interrupts narration; browser audio permissions still require the key.
 opening.advance();
 if(!document.fullscreenElement&&visualizerWrap.requestFullscreen){
  try{
   const request=visualizerWrap.requestFullscreen();
   if(request&&request.catch)request.catch(()=>{});
  }catch(_){}
 }
}
StageOpening.bindAdvanceKey(window,startOpening);
document.addEventListener("fullscreenchange",resizeCanvas);
window.addEventListener("resize",resizeCanvas);

function backgroundLayout(){
 const iw=backgroundImage.naturalWidth||1536,ih=backgroundImage.naturalHeight||1024;
 const s=Math.min(w/iw,h/ih),width=iw*s,height=ih*s;
 return{x:(w-width)/2,y:(h-height)/2,width,height};
}
function monitorLayout(){
 const b=backgroundLayout(),m=config.monitor;
 return{x:b.x+b.width*(m.x+m.width/2),y:b.y+b.height*(m.y+m.height/2),
  width:b.width*m.width,height:b.height*m.height};
}
function drawBackground(){
 ctx.clearRect(0,0,w,h);ctx.fillStyle="#050505";ctx.fillRect(0,0,w,h);
 if(backgroundReady){const b=backgroundLayout();ctx.drawImage(backgroundImage,b.x,b.y,b.width,b.height);}
 if(sceneProgress>0){ctx.fillStyle=`rgba(0,0,0,${sceneProgress})`;ctx.fillRect(0,0,w,h);}
}
function resizeCanvas(){
 dpr=Math.min(window.devicePixelRatio||1,2);
 w=canvas.clientWidth;h=canvas.clientHeight;
 canvas.width=Math.max(1,Math.floor(w*dpr));canvas.height=Math.max(1,Math.floor(h*dpr));
 ctx.setTransform(dpr,0,0,dpr,0,0);cx=w/2;cy=h/2;
 scale=Math.max(.48,Math.min(Math.min(w,h)/760,1));initParticles();
}
function initParticles(){
 particles.length=0;const maxR=Math.min(w,h)*.47;
 for(let i=0;i<PARTICLES;i++)particles.push({a:Math.random()*Math.PI*2,r:maxR*(.55+Math.random()*.44),
 s:.00012+Math.random()*.00065,size:.45+Math.random()*1.5,alpha:.035+Math.random()*.19});
}
resizeCanvas();

function freqToBin(freq){
 if(!analyser||!audioCtx)return 0;
 const nyquist=audioCtx.sampleRate/2;
 return Math.max(0,Math.min(analyser.frequencyBinCount-1,Math.round(freq/nyquist*analyser.frequencyBinCount)));
}
function selectedBins(){
 const lo=freqToBin(freqMin),hi=Math.max(lo+1,freqToBin(freqMax));
 return{lo,hi:Math.min(analyser?analyser.frequencyBinCount-1:hi,hi)};
}

function analyze(){
 if(!analyser||!dataArray)return{avg:0,low:0,mid:0,high:0};
 if(audioElement.paused||audioElement.ended){
  for(let i=0;i<smooth.length;i++)smooth[i]*=.86;
  return{avg:0,low:0,mid:0,high:0};
 }
 analyser.getByteFrequencyData(dataArray);
 let sum=0,low=0,mid=0,high=0,n=dataArray.length;
 const range=selectedBins(),lo=range.lo,hi=range.hi;
 const span=Math.max(1,hi-lo);
 for(let i=0;i<n;i++){
  const raw=dataArray[i];
  const k=raw>smooth[i] ? .42 : .12;
  smooth[i]+=(raw-smooth[i])*k;
  if(i<lo||i>hi)continue;
  const v=smooth[i];
  sum+=v;
  const p=(i-lo)/span;
  if(p<.30)low+=v;
  else if(p<.65)mid+=v;
  else high+=v;
 }
 const count=Math.max(1,hi-lo+1);
 return{avg:sum/count,low:low/Math.max(1,span*.30),mid:mid/Math.max(1,span*.35),high:high/Math.max(1,span*.35)};
}

function radialPoint(r,a){return{x:cx+r*Math.cos(a),y:cy+r*Math.sin(a)}}
function drawSymmetricRing(r,thickness,alpha,glow){
 ctx.save();ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);
 ctx.strokeStyle=`rgba(255,255,255,${alpha})`;ctx.lineWidth=thickness;
 ctx.shadowBlur=glow;ctx.shadowColor=`rgba(255,255,255,${Math.min(.9,alpha+.16)})`;ctx.stroke();ctx.restore();
}

// Audio coil: every point is mirrored from the left/right partner. Amplitude is proportional to volume^2 * 10.
function drawCoil(base,amp,alpha,line,blur,phase,bandStart,bandEnd,shape){
 const points=300,arr=[];
 const range=selectedBins(),lo=range.lo,hi=range.hi;
 for(let i=0;i<points;i++){
  const t=i/points;
  const u=t<.5?t*2:(1-t)*2;
  const idx=Math.min(hi,Math.max(lo,Math.floor(lo+(hi-lo)*(bandStart+(bandEnd-bandStart)*u))));
  const idx2=Math.min(hi,Math.max(lo,Math.floor(lo+(hi-lo)*(bandStart+(bandEnd-bandStart)*Math.min(1,u+.018)))));
  const v=Math.max(0,Math.min(1,(smooth[idx]||0)/255));
  const v2=Math.max(0,Math.min(1,(smooth[idx2]||0)/255));
  const volumeSquared=v*v;
  const volumeSquared2=v2*v2;
  const harmonic=volumeSquared*.72+volumeSquared2*.28;
  const detail=.88+.12*Math.sin(u*Math.PI*22+phase);
  const ripple=harmonic*amp*scale*10*detail;
  const fine=(highEnergy/255)**2*3.2*scale*Math.sin(u*Math.PI*54+phase*2.1);
  const bassBend=(bassEnergy/255)**2*amp*.16*scale*Math.sin(u*Math.PI*6+phase*.55);
  const a=t*Math.PI*2-Math.PI/2;
  arr.push(radialPoint(base+ripple+fine+bassBend,a));
 }
 ctx.save();ctx.beginPath();ctx.moveTo(arr[0].x,arr[0].y);
 for(let i=0;i<points;i++){const p=arr[i],q=arr[(i+1)%points];ctx.quadraticCurveTo(p.x,p.y,(p.x+q.x)/2,(p.y+q.y)/2)}
 ctx.closePath();ctx.strokeStyle=`rgba(255,255,255,${alpha})`;ctx.lineWidth=line;ctx.shadowBlur=blur;ctx.shadowColor=`rgba(255,255,255,${Math.min(1,alpha+.22)})`;ctx.stroke();ctx.restore();
}
function drawCoilGlow(base,phase){
 drawCoil(base,52,.045,8,28,phase,.00,.72,"halo");
 drawCoil(base+2*scale,45,.075,5,20,phase*1.08+.8,.04,.78,"outer");
 drawCoil(base-1*scale,39,.18,3,13,phase*1.22+1.5,.08,.84,"mid");
 drawCoil(base-4*scale,34,.72,1.7,7,phase*1.45+2.7,.02,.90,"core");
}

function drawBassArcs(radius,audio,phase){
 const bass=Math.pow(Math.min(1,audio.low/255),2);
 ctx.save();ctx.lineCap="round";
 for(let j=0;j<3;j++){
  ctx.beginPath();
  const arcRadius=radius+(j-1)*5*scale+bass*18*scale;
  const start=phase*.55+j*Math.PI*2/3;
  const span=.55+bass*1.05;
  ctx.arc(cx,cy,arcRadius,start,start+span);
  ctx.strokeStyle=`rgba(255,255,255,${.08+bass*.16-j*.018})`;
  ctx.lineWidth=(1.2+j*.7)*scale;ctx.shadowBlur=(5+bass*15)*scale;ctx.shadowColor="rgba(255,255,255,.55)";ctx.stroke();
 }
 ctx.restore();
}

function updateHexRotation(now){
 if(!rotationMoving&&now-rotationMoveStart>=ROTATE_INTERVAL){rotationMoving=true;rotationStart=rotation;rotationTarget=rotation+ROTATE_STEP;rotationMoveStart=now}
 if(rotationMoving){
  const p=Math.max(0,Math.min(1,(now-rotationMoveStart)/ROTATE_DURATION));
  const eased=1-Math.pow(1-p,5);
  rotation=rotationStart+(rotationTarget-rotationStart)*eased;
  if(p>=1){rotation=rotationTarget;rotationMoving=false;rotationMoveStart=now}
 }
}

function drawHex(radius,rot,audio){
 ctx.save();ctx.translate(cx,cy);ctx.rotate(rot);
 const def=[];
 const range=selectedBins(),lo=range.lo,hi=range.hi;
 for(let i=0;i<6;i++){
  const band=Math.floor(lo+(i/6)*Math.max(1,(hi-lo)*.30));
  const v=Math.max(0,Math.min(1,(smooth[Math.min(hi,band)]||0)/255));
  def[i]=(v*v)*12*scale*(.7+(audio.low/255)**2*.8);
 }
 ctx.beginPath();
 for(let i=0;i<6;i++){const a=i*Math.PI/3-Math.PI/2,r=radius+def[i],x=r*Math.cos(a),y=r*Math.sin(a);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}
 ctx.closePath();
 const bright=Math.min(1,.24+energy*.76);
 ctx.shadowBlur=(18+energy*24)*scale;ctx.shadowColor=`rgba(255,255,255,${bright})`;ctx.fillStyle=`rgba(255,255,255,${bright})`;ctx.fill();ctx.shadowBlur=0;
 ctx.beginPath();
 for(let i=0;i<6;i++){const a=i*Math.PI/3-Math.PI/2,r=radius*.76+def[i]*.45,x=r*Math.cos(a),y=r*Math.sin(a);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}
 ctx.closePath();ctx.fillStyle="rgba(5,5,5,.9)";ctx.fill();
 const hexVolume=Math.max(0,Math.min(1,energy));
 const edgeWidth=(1.2+hexVolume*136)*scale;
 ctx.strokeStyle=`rgba(255,255,255,${.2+hexVolume*.55})`;ctx.lineWidth=edgeWidth;ctx.stroke();
 const core=(3+energy*7+audio.high/255*2)*scale;
 ctx.beginPath();ctx.arc(0,0,core,0,Math.PI*2);ctx.fillStyle=`rgba(255,255,255,${.35+energy*.65})`;ctx.shadowBlur=10*scale;ctx.shadowColor="rgba(255,255,255,.8)";ctx.fill();
 ctx.restore();
}

function drawOuterHex(radius,rot,audio){
 const outerScale=1.52+Math.pow(Math.min(1,energy),2)*.48;
 const outerRadius=radius*outerScale;
 const outerDef=(audio.low/255)**2*8*scale;
 ctx.save();ctx.translate(cx,cy);ctx.rotate(rot);ctx.beginPath();
 for(let i=0;i<6;i++){const a=i*Math.PI/3-Math.PI/2,r=outerRadius+outerDef,x=r*Math.cos(a),y=r*Math.sin(a);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}
 ctx.closePath();ctx.strokeStyle=`rgba(255,255,255,${.16+energy*.30})`;ctx.lineWidth=(1.1+energy*3.2)*scale;ctx.shadowBlur=(7+energy*12)*scale;ctx.shadowColor="rgba(255,255,255,.65)";ctx.stroke();ctx.restore();
}

function drawParticles(audio){
 for(const p of particles){
  if(!audioElement.paused&&!audioElement.ended)p.a+=p.s*16;
  const r=p.r+energy*42*scale+audio.high/255*16*scale,x=cx+Math.cos(p.a)*r,y=cy+Math.sin(p.a)*r;
  ctx.beginPath();ctx.arc(x,y,p.size+(audio.high/255)*.6,0,Math.PI*2);ctx.fillStyle=`rgba(255,255,255,${Math.min(.5,p.alpha*(.3+energy*2.1))})`;ctx.fill();
 }
}
// Draw the original visualizer as a circular timer during the morph.
// Seven-segment electronic clock: no circular frame or caption below the digits.
const DIGITAL_SEGMENTS=[
 // a, b, c, d, e, f, g
 [[8,2],[40,2],[34,9],[14,9]],
 [[42,5],[46,9],[46,36],[41,40],[38,35],[38,14]],
 [[41,44],[46,48],[46,75],[42,79],[38,70],[38,49]],
 [[14,75],[34,75],[40,82],[8,82]],
 [[6,44],[10,49],[10,70],[6,79],[2,75],[2,48]],
 [[6,5],[10,14],[10,35],[6,40],[2,36],[2,9]],
 [[12,38],[36,38],[40,42],[36,46],[12,46],[8,42]]
];
const DIGITAL_DIGITS={
 "0":[0,1,2,3,4,5],"1":[1,2],"2":[0,1,6,4,3],
 "3":[0,1,6,2,3],"4":[5,6,1,2],"5":[0,5,6,2,3],
 "6":[0,5,6,4,2,3],"7":[0,1,2],"8":[0,1,2,3,4,5,6],
 "9":[0,1,2,3,5,6]
};
function drawDigitalDigit(character,x){
 const enabled=DIGITAL_DIGITS[character]||[];
 ctx.save();
 ctx.translate(x,0);
 // An unlit grey "8" remains underneath each illuminated numeral.
 for(let pass=0;pass<2;pass++){
  for(let i=0;i<DIGITAL_SEGMENTS.length;i++){
   if(pass===1&&!enabled.includes(i))continue;
   const vertices=DIGITAL_SEGMENTS[i];
   ctx.beginPath();
   ctx.moveTo(vertices[0][0],vertices[0][1]);
   for(let j=1;j<vertices.length;j++)ctx.lineTo(vertices[j][0],vertices[j][1]);
   ctx.closePath();
   ctx.fillStyle=pass===0?"rgba(125,130,136,.28)":"rgba(241,250,255,.97)";
   ctx.shadowBlur=pass===0?0:6;
   ctx.shadowColor="rgba(190,231,255,.58)";
   ctx.fill();
  }
 }
 ctx.restore();
}
function drawTimerFace(radius){
 const time=StageOpening.formatTime(opening.getRemainingMs());
 // Clock coordinates are 236 wide by 84 high, with the colon between digits.
 const unit=radius*.012;
 ctx.save();
 ctx.translate(cx,cy);
 ctx.scale(unit,unit);
 ctx.translate(-118,-42);
 drawDigitalDigit(time[0],0);
 drawDigitalDigit(time[1],56);
 drawDigitalDigit(time[3],132);
 drawDigitalDigit(time[4],188);
 for(const y of [28,56]){
  ctx.beginPath();ctx.arc(118,y,3.7,0,Math.PI*2);
  ctx.fillStyle="rgba(125,130,136,.28)";
  ctx.shadowBlur=0;
  ctx.fill();
  ctx.beginPath();ctx.arc(118,y,3.7,0,Math.PI*2);
  ctx.fillStyle="rgba(241,250,255,.97)";
  ctx.shadowBlur=6;
  ctx.shadowColor="rgba(190,231,255,.58)";
  ctx.fill();
 }
 ctx.restore();
}
function draw(){
 requestAnimationFrame(draw);
 const now=performance.now();opening.getRemainingMs();updateTransitions(now);
 const a=analyze(),target=Math.min(1,a.avg/68);
 energy+=(target-energy)*.15;bassEnergy+=(a.low-bassEnergy)*.20;
 midEnergy+=(a.mid-midEnergy)*.16;highEnergy+=(a.high-highEnergy)*.25;
 const beat=Math.max(0,target-energy);pulse+=(beat*58+energy*20+(bassEnergy/255)**2*10-pulse)*.22;
 updateHexRotation(now);drawBackground();
 const hexR=Math.min(w,h)*.105+energy*10*scale;
 const waveBase=hexR+Math.min(w,h)*.095+pulse*scale;
 const ringR=waveBase+Math.min(w,h)*.075;
 const monitor=monitorLayout();
 // Keep the waiting graphic and settled clock inside the pictured wall screen.
 const idleScale=Math.min(monitor.width,monitor.height)*.30/(Math.min(w,h)*.275);
 const originalScale=idleScale+(1-idleScale)*sceneProgress;
 const originalX=monitor.x+(cx-monitor.x)*sceneProgress;
 const originalY=monitor.y+(cy-monitor.y)*sceneProgress;
 const timerRadius=Math.min(w,h)*.23;
 const timerTargetScale=Math.min(monitor.width*.86/(timerRadius*.012*236),
  monitor.height*.65/(timerRadius*.012*84));
 const visualScale=originalScale+(timerTargetScale-originalScale)*timerSettle;
 const visualX=originalX+(monitor.x-originalX)*timerSettle;
 const visualY=originalY+(monitor.y-originalY)*timerSettle;
 ctx.save();ctx.translate(visualX,visualY);ctx.scale(visualScale,visualScale);ctx.translate(-cx,-cy);
 const graphicOpacity=1-easeInOutCubic(Math.min(1,timerMorph/.55));
 const clockOpacity=easeInOutCubic(Math.max(0,Math.min(1,(timerMorph-.55)/.45)));
 ctx.globalAlpha=graphicOpacity;
 if(graphicOpacity>0){
  drawParticles(a);drawSymmetricRing(ringR,1+energy*1.8,.08+energy*.15,energy*9*scale);
  drawSymmetricRing(ringR+8*scale,1,.025+energy*.065,energy*5*scale);
  drawBassArcs(ringR+3*scale,a,now*.00065);drawCoilGlow(waveBase,now*.00045);
  drawOuterHex(hexR,rotation,a);drawHex(hexR,rotation,a);
 }
 if(clockOpacity>0){ctx.globalAlpha=clockOpacity;drawTimerFace(timerRadius);}
 ctx.restore();
}
requestAnimationFrame(draw);
