(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SubtitleMotion=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 class Renderer {
  constructor({element,reducedMotion=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches}){
   this.element=element;this.speaker=element.querySelector('#subtitleSpeaker');this.text=element.querySelector('#subtitleText');
   this.reducedMotion=reducedMotion;this.key=null;this.incoming=null;this.outgoing=null;this.ghost=null;
   // Long, joined dialogue must remain inside the 16:9 projection even in
   // portrait split-screen preview and after a device rotation.
   this.resizeObserver=typeof ResizeObserver==="function"?
    new ResizeObserver(()=>this.fitText()):null;
   this.resizeObserver?.observe(this.element.parentElement);
  }
  fitText(){
   this.text.style.fontSize="";
   if(this.element.hidden||!this.text.textContent)return;
   const parent=this.element.parentElement;
   if(!parent?.clientHeight)return;
   const maxHeight=parent.clientHeight*.58;
   let size=parseFloat(getComputedStyle(this.text).fontSize);
   if(!Number.isFinite(size))return;
   while(this.element.getBoundingClientRect().height>maxHeight&&size>9){
    size=Math.max(9,size-1);
    this.text.style.fontSize=size+"px";
   }
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
    this.element.parentElement.append(snapshot);this.ghost=snapshot;
    const animation=snapshot.animate([{opacity:oldOpacity,transform:'translateY(0)'},{opacity:0,transform:`translateY(${-offset*.5}px)`}],
     {duration:text?110:160,easing:'ease-out',fill:'both'});
    this.outgoing=animation;
    animation.finished.then(()=>{snapshot.remove();if(this.ghost===snapshot){this.ghost=null;this.outgoing=null;}},()=>{});
   }
   // The current subtitle updates synchronously; outgoing text exists only in an aria-hidden visual layer.
   this.speaker.textContent=speaker;this.speaker.hidden=!speaker;this.text.textContent=text;this.element.hidden=!text;
   this.fitText();
   this.element.dataset.subtitleMotion=text?(visible?'switch':'enter'):'hide';
   if(text&&!immediate){
    this.incoming=this.element.animate([{opacity:0,transform:`translateY(${offset}px)`},{opacity:1,transform:'translateY(0)'}],
     {duration:visible?180:220,delay:visible?40:0,easing:'cubic-bezier(.22,.61,.36,1)',fill:'both'});
   }
  }
  destroy(){this.cancel();this.resizeObserver?.disconnect();}
 }
 return {Renderer};
});
