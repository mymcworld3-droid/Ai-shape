(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SubtitleMotion=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 class Renderer {
  constructor({element,reducedMotion=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches}){
   this.element=element;this.speaker=element.querySelector('#subtitleSpeaker');this.text=element.querySelector('#subtitleText');
   this.reducedMotion=reducedMotion;this.key=null;this.incoming=null;this.outgoing=null;this.ghost=null;
  }
  cancel(){
   this.incoming?.cancel();this.outgoing?.cancel();this.incoming=null;this.outgoing=null;
   this.ghost?.remove();this.ghost=null;
  }
  render(entry){
   const text=entry?.text||'',speaker=entry?.speaker||'';
   const key=text?JSON.stringify([entry.id,text,speaker]):'empty';
   // Voice state callbacks may redraw the same entry: they must not restart its subtitle animation.
   if(key===this.key)return;
   const visible=!this.element.hidden&&Boolean(this.text.textContent);
   const oldOpacity=visible?Number(getComputedStyle(this.element).opacity):0;
   const snapshot=visible?this.element.cloneNode(true):null;
   const immediate=this.reducedMotion()||typeof this.element.animate!=='function';
   const offset=Math.min(6,this.element.parentElement.clientHeight*.018);
   this.cancel();this.key=key;
   if(snapshot&&!immediate&&oldOpacity>.01){
    snapshot.removeAttribute('id');snapshot.className='subtitle-ghost';snapshot.dataset.subtitleGhost='true';snapshot.setAttribute('aria-hidden','true');snapshot.hidden=false;
    for(const child of snapshot.querySelectorAll('[id]')){
     child.className=child.id==='subtitleSpeaker'?'subtitle-speaker':'subtitle-text';child.removeAttribute('id');
    }
    // The old line fades in place even if the adjacent-line rows reflow.
    const parentBounds=this.element.parentElement.getBoundingClientRect();
    const lineBounds=this.element.getBoundingClientRect();
    Object.assign(snapshot.style,{
     position:'absolute',left:(lineBounds.left-parentBounds.left)+'px',
     top:(lineBounds.top-parentBounds.top)+'px',right:'auto',bottom:'auto',
     width:lineBounds.width+'px'
    });
    this.element.parentElement.append(snapshot);this.ghost=snapshot;
    const animation=snapshot.animate([{opacity:oldOpacity,transform:'translateY(0)'},{opacity:0,transform:`translateY(${-offset*.5}px)`}],
     {duration:text?110:160,easing:'ease-out',fill:'both'});
    this.outgoing=animation;
    animation.finished.then(()=>{snapshot.remove();if(this.ghost===snapshot){this.ghost=null;this.outgoing=null;}},()=>{});
   }
   // The current subtitle updates synchronously; outgoing text exists only in an aria-hidden visual layer.
   this.speaker.textContent=speaker;this.speaker.hidden=!speaker;this.text.textContent=text;this.element.hidden=!text;
   this.element.dataset.subtitleMotion=text?(visible?'switch':'enter'):'hide';
   if(text&&!immediate){
    this.incoming=this.element.animate([{opacity:0,transform:`translateY(${offset}px)`},{opacity:1,transform:'translateY(0)'}],
     {duration:visible?180:220,delay:visible?40:0,easing:'cubic-bezier(.22,.61,.36,1)',fill:'both'});
   }
  }
  destroy(){this.cancel();}
 }
 function spokenNeighbors(entries,index){
  if(!Array.isArray(entries)||!Number.isInteger(index)||index<0||index>=entries.length)
   return {previous:null,next:null};
  const lookup=direction=>{
   for(let i=index+direction;i>=0&&i<entries.length;i+=direction)
    if(typeof entries[i]?.text==='string'&&entries[i].text.trim())return entries[i];
   return null;
  };
  return {previous:lookup(-1),next:lookup(1)};
 }
 return {Renderer,spokenNeighbors};
});
