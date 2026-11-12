(function(root,factory){
 "use strict";
 const api=factory();
 if(typeof module==="object"&&module.exports)module.exports=api;
 else root.AudioTimeline=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const lanes=[
  {kind:"配樂",title:"背景音樂",css:"music"},
  {kind:"語音",title:"AI 語音",css:"voice"},
  {kind:"音效",title:"音效",css:"effect"},
  {kind:"影片",title:"影片素材",css:"video"}
 ];
 const basename=src=>String(src).split("/").pop();
 // Each row follows an operator cue in the step list.
 // Only continuous music/voice annotations are joined into one visual clip.
 function buildSegments(steps){
  const result=[];
  for(const lane of lanes){
   let active=null;
   steps.forEach((step,index)=>{
    const matches=(step.media||[]).filter(media=>media.kind===lane.kind&&media.src);
    if(active&&(!matches.some(m=>m.src===active.src)||lane.kind==="音效"||lane.kind==="影片")){
     result.push(active);active=null;
    }
    for(const media of matches){
     if(active&&active.src===media.src&&active.end===index-1){
      active.end=index;
     }else{
      if(active){result.push(active);active=null;}
      active={kind:lane.kind,src:media.src,start:index,end:index,
       ...(media.delayMs?{delayMs:media.delayMs}:{})};
     }
     if(lane.kind==="音效"||lane.kind==="影片"){result.push(active);active=null;}
    }
   });
   if(active)result.push(active);
  }
  return result;
 }
 function mount(host,{steps,rows,trackSelect,onSelect}){
  for(const lane of lanes)trackSelect.add(new Option(lane.title,lane.kind));
  trackSelect.value="音效";

  const cursor=document.createElement("div");
  cursor.className="timeline-cursor";
  cursor.setAttribute("aria-hidden","true");
  cursor.hidden=true;
  host.append(cursor);

  const clips=buildSegments(steps).map(clip=>{
   const button=document.createElement("button");
   const label=document.createElement("span");
   const filename=basename(clip.src);
   const range=clip.start===clip.end?`第 ${steps[clip.start].label} 步`:
    `第 ${steps[clip.start].label}–${steps[clip.end].label} 步`;
   button.type="button";
   button.className="timeline-clip timeline-clip-"+lanes.find(lane=>lane.kind===clip.kind).css;
   const delay=clip.delayMs?" · "+(clip.delayMs/1000).toFixed(1)+" 秒後開始":"";
   button.title=`${filename}${delay}\n${range}`;
   button.setAttribute("aria-label",`${clip.kind} ${filename}，${range}${delay}`);
   button.hidden=true;
   label.textContent=filename+(clip.delayMs?" · +"+(clip.delayMs/1000).toFixed(1)+"s":"");
   button.append(label);
   host.append(button);
   const segment={...clip,button,visibleRows:[]};
   button.addEventListener("click",event=>{
    const visible=segment.visibleRows;
    const y=event.clientY-host.getBoundingClientRect().top;
    const row=event.detail===0?visible[0]:visible.find(item=>y<item.bottom)??visible.at(-1);
    if(row)onSelect(row.index);
   });
   return segment;
  });

  let positions=[],selected=null;
  function placeCursor(){
   const row=positions[selected];
   cursor.hidden=!row;
   if(row){
    cursor.style.top=`${row.top}px`;
    cursor.style.height=`${row.bottom-row.top}px`;
   }
  }
  function layout(){
   if(!host.offsetWidth)return;
   const origin=host.getBoundingClientRect().top;
   positions=rows.map((row,index)=>{
    if(row.hidden)return null;
    const bounds=row.getBoundingClientRect();
    return {index,top:bounds.top-origin,bottom:bounds.bottom-origin};
   });
   for(const clip of clips){
    // The bookmark filter removes rows from the same scrollable sheet.
    clip.visibleRows=clip.kind===trackSelect.value?
     positions.slice(clip.start,clip.end+1).filter(Boolean):[];
    const first=clip.visibleRows[0],last=clip.visibleRows.at(-1);
    clip.button.hidden=!first;
    if(first){
     clip.button.style.top=`${first.top+3}px`;
     clip.button.style.height=`${last.bottom-first.top-6}px`;
    }
   }
   placeCursor();
  }
  trackSelect.addEventListener("change",layout);
  const list=rows[0]?.parentElement;
  if(list&&typeof ResizeObserver==="function")new ResizeObserver(layout).observe(list);
  return {layout,select(index){selected=index;placeCursor();}};
 }
 return {buildSegments,mount,lanes};
});
