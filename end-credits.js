(function(root,factory){
 const api=factory();
 if(typeof module==="object"&&module.exports)module.exports=api;
 else root.EndCredits=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 // The closing sequence is operator-seekable but normally auto-advances
 // through five independently timed cards. The Button remains the final hold.
 // Timing is measured from each displayed cue, not from its entry-animation end.
 const CREDIT_HOLD_MS=Object.freeze([3000,2800,2800,2700,7000]);
 const SONG_LEAD_MS=1600;
 const TITLE_ZOOM_MS=4700;
 const TITLE_DECEL_MS=500;
 const TITLE_HANDOFF_SCALE=2.3;
 const cards=Object.freeze([
  {id:"credit-directed",label:"Directed by",role:"DIRECTED BY",
   lines:["SOPHIA CHOU","CURRY CHEN","RICKY LIU"],motion:"rise",durationMs:CREDIT_HOLD_MS[0]},
  {id:"credit-conversation",label:"Based on the conversation between",
   role:"BASED ON THE CONVERSATION BETWEEN",
   lines:["CHAT GPT","SOPHIA CHOU"],motion:"sweep",durationMs:CREDIT_HOLD_MS[1]},
  {id:"credit-produced",label:"Produced by",role:"PRODUCED BY",
   lines:["SOPHIA CHOU"],motion:"focus",durationMs:CREDIT_HOLD_MS[2]},
  {id:"credit-executive",label:"Executive producers",role:"EXECUTIVE PRODUCERS",
   lines:["CURRY CHEN","RICKY LIU"],motion:"turn",durationMs:CREDIT_HOLD_MS[3]},
  {id:"credit-backgrounds",label:"Backgrounds",role:"BACKGROUNDS",
   lines:["MUSICS — SHIU-CHEN JOU","IMAGE — RAY CHEN"],motion:"unfold",durationMs:CREDIT_HOLD_MS[4]},
  {id:"credit-title",label:"The Button",role:"",lines:["The Button"],motion:"infinity"}
 ].map(card=>Object.freeze({...card,lines:Object.freeze(card.lines)})));

 // Stable IDs prevent subtitle renumbering from shifting finale positions.
 const endingAiPositions=Object.freeze({
  // The first credit is subtitle step 293; the preceding blackout stays black.
  "credit-directed":Object.freeze({x:.85,y:.79,scale:.35}), // 293: lower-right
  "credit-conversation":Object.freeze({x:.16,y:.78,scale:.38}), // 294: lower-left
  "credit-produced":Object.freeze({x:.39,y:.63,scale:.56}), // 295: inward and larger
  "credit-executive":Object.freeze({x:.82,y:.23,scale:.47}), // 296: upper-right
  "credit-backgrounds":Object.freeze({x:.50,y:.50,scale:1.02,mist:true,fadeWithText:true}) // 297: behind text
 });
 function endingAiPose(action){return endingAiPositions[action]||null;}
 const byId=new Map(cards.map(card=>[card.id,card]));
 function get(id){return byId.get(id)||null;}
 function displayLines(id){
  const card=get(id);
  if(!card)return [];
  if(card.motion==="infinity")return [{speaker:"片名",text:"The Button"}];
  return card.lines.map(text=>({speaker:"片尾字幕",text}));
 }
 function appendToSubtitle(entries){
  const last=entries.at(-1),look={...last.look,background:"memory",room:true,
   ai:0,scene:0,clock:0,card:0,blackout:1,aiExpansion:0,vote:0};
  return [...entries,...cards.map((card,index)=>({
   id:card.id,paragraph:418+index,act:"CREDITS",scene:"CREDITS",
   speaker:"",text:"",action:card.id,group:null,kind:"cue",
   note:card.label,look:{...look},parts:[]
  }))];
 }
 // Distinct entrance AND exit motion for every lettered credit; their speeds
 // are intentionally different instead of reusing a stock crossfade.
 const motion={
  rise:{
   enter:[{opacity:0,transform:"translateY(28%) scale(.93)",filter:"blur(11px)",offset:0},
    {opacity:1,transform:"translateY(0) scale(1)",filter:"blur(0px)",offset:1}],
   leave:[{opacity:1,transform:"translateY(0)"},{opacity:0,transform:"translateY(-27%)"}],
   enterMs:1100,leaveMs:680},
  sweep:{
   enter:[{opacity:0,transform:"translateX(-35%) skewX(-9deg)",clipPath:"inset(0 100% 0 0)"},
    {opacity:1,transform:"translateX(0) skewX(0deg)",clipPath:"inset(0 0 0 0)"}],
   leave:[{opacity:1,transform:"translateX(0)",clipPath:"inset(0 0 0 0)"},
    {opacity:0,transform:"translateX(30%)",clipPath:"inset(0 0 0 100%)"}],
   enterMs:850,leaveMs:740},
  focus:{
   enter:[{opacity:0,transform:"scale(1.8)",filter:"blur(20px)"},
    {opacity:1,transform:"scale(1)",filter:"blur(0)"}],
   leave:[{opacity:1,transform:"scale(1)",filter:"blur(0px)"},
    {opacity:0,transform:"scale(.70)",filter:"blur(15px)"}],
   enterMs:1300,leaveMs:550},
  turn:{
   enter:[{opacity:0,transform:"perspective(900px) rotateX(75deg) translateY(13%)"},
    {opacity:1,transform:"perspective(900px) rotateX(0deg) translateY(0)"}],
   leave:[{opacity:1,transform:"perspective(900px) rotateY(0deg)"},
    {opacity:0,transform:"perspective(900px) rotateY(-68deg) translateX(-12%)"}],
   enterMs:1050,leaveMs:810},
  unfold:{
   enter:[{opacity:0,transform:"scaleX(.22) translateY(-13%)",filter:"blur(6px)"},
    {opacity:1,transform:"scaleX(1) translateY(0)",filter:"blur(0)"}],
   leave:[{opacity:1,transform:"scaleX(1) translateY(0)",letterSpacing:".19em"},
    {opacity:0,transform:"scaleX(1.28) translateY(24%)",letterSpacing:".35em"}],
   enterMs:1030,leaveMs:880},
  infinity:{
   // First 500ms: collapse from a practically infinite scale, initially
   // extremely fast and decelerating. After exactly 500ms: ONE constant
   // shrinking speed all the way to size 1, with no further easing phase.
   // The .999215 Bézier endpoint slope matches the linear stage's speed,
   // preventing a visible acceleration bump at the handoff.
   enter:[
    {offset:0,opacity:1,transform:"scale(160)",
     easing:"cubic-bezier(.06,.81,.2,.999215)"},
    {offset:TITLE_DECEL_MS/TITLE_ZOOM_MS,opacity:1,
     transform:"scale("+TITLE_HANDOFF_SCALE+")",easing:"linear"},
    {offset:1,opacity:1,transform:"scale(1)"}
   ],
   leave:[{opacity:1,transform:"scale(1)"},{opacity:0,transform:"scale(.68)"}],
   enterMs:TITLE_ZOOM_MS,leaveMs:900}
 };
 function mount(rootElement,{onAdvance=()=>{}}={}){
  const layer=document.createElement("div");
  layer.id="endCreditsLayer";layer.hidden=true;layer.setAttribute("aria-hidden","true");
  rootElement.append(layer);
  let current=null,id=null,preview=false,run=0;
  let exitTimer=null,advanceTimer=null,alreadyLeaving=false;
  function cancelTimers(){
   clearTimeout(exitTimer);clearTimeout(advanceTimer);
   exitTimer=null;advanceTimer=null;
  }
  function quiet(){return typeof window!=="undefined"&&window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;}
  function make(card){
   const element=document.createElement("div");
   element.className="end-credit-card end-credit-"+card.motion;
   element.dataset.credit=card.id;
   if(card.motion==="infinity"){
    const title=document.createElement("div");title.className="end-credit-film-title";
    const the=document.createElement("div");the.className="end-credit-the";the.textContent="The";
    const button=document.createElement("div");button.className="end-credit-button";button.textContent="Button";
    title.append(the,button);element.append(title);
   }else{
    const block=document.createElement("div");block.className="end-credit-block";
    const role=document.createElement("div");role.className="end-credit-role";role.textContent=card.role;
    const names=document.createElement("div");names.className="end-credit-names";
    for(const line of card.lines){const name=document.createElement("div");name.textContent=line;names.append(name);}
    block.append(role,names);element.append(block);
   }
   return element;
  }
  function show(newId,{isPreview=false}={}){
   const card=get(newId);
   const normalized=card?.id||null;
   if(id===normalized&&preview===isPreview)return;
   cancelTimers();
   id=normalized;preview=isPreview;
   layer.dataset.endingAi=endingAiPose(normalized)?"true":"false";
   const generation=++run,old=current,wasLeaving=alreadyLeaving;
   alreadyLeaving=false;current=null;
   for(const element of [...layer.children])if(element!==old)element.remove();
   if(!card&&!old){layer.hidden=true;return;}
   layer.hidden=false;
   if(old){
    old.getAnimations().forEach(animation=>animation.cancel());
    const oldCard=get(old.dataset.credit),model=motion[oldCard?.motion];
    if(isPreview||quiet()||wasLeaving||!model||typeof old.animate!=="function")old.remove();
    else{
     const animation=old.animate(model.leave,{duration:model.leaveMs,easing:"ease-in",fill:"both"});
     animation.finished.then(()=>{old.remove();if(generation===run&&!current)layer.hidden=true;},
      ()=>old.remove());
    }
   }
   if(!card){
    if(isPreview||quiet())layer.hidden=true;
    return;
   }
   const element=make(card);
   layer.append(element);current=element;
   const model=motion[card.motion];
   if(!isPreview&&!quiet()&&typeof element.animate==="function"){
    // Title easing lives on individual keyframe segments, not a single ease-out.
    element.animate(model.enter,{duration:model.enterMs,
     easing:card.motion==="infinity"?"linear":"cubic-bezier(.18,.58,.2,1)",
     fill:"both"});
   }
   // Every card must enter, remain visible, and disappear during its own
   // specified slot. An operator jump cancels all obsolete animation timers.
   if(isPreview||card.motion==="infinity")return;
   const durationMs=card.durationMs;
   exitTimer=setTimeout(()=>{
    if(run!==generation||id!==normalized)return;
    alreadyLeaving=true;
    element.getAnimations().forEach(animation=>animation.cancel());
    if(!quiet()&&typeof element.animate==="function"){
     element.animate(model.leave,{duration:model.leaveMs,easing:"ease-in",fill:"forwards"});
    }else element.style.opacity="0";
   },durationMs-model.leaveMs);
   advanceTimer=setTimeout(()=>{
    if(run!==generation||id!==normalized)return;
    onAdvance();
   },durationMs);
  }
  return {show,get activeId(){return id;},get preview(){return preview;},
   get visualOpacity(){
    if(!current)return 0;
    // Follow precisely the letters' Web Animation opacity during exit.
    const value=Number.parseFloat(getComputedStyle(current).opacity);
    return Number.isFinite(value)?Math.max(0,Math.min(1,value)):1;
   },layer};
 }
 return {cards,get,displayLines,appendToSubtitle,mount,motion,endingAiPose,CREDIT_HOLD_MS,SONG_LEAD_MS,
  TITLE_ZOOM_MS,TITLE_DECEL_MS,TITLE_HANDOFF_SCALE};
});
