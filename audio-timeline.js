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
 // Each column is an operator cue, not a claim about media duration in seconds.
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
      active={kind:lane.kind,src:media.src,start:index,end:index};
     }
     if(lane.kind==="音效"||lane.kind==="影片"){result.push(active);active=null;}
    }
   });
   if(active)result.push(active);
  }
  return result;
 }
 function mount(host,steps,onSelect){
  if(!host||typeof document==="undefined")return null;
  const width=steps.length>100?68:100;
  const count=steps.length;
  host.className="audio-timeline";
  host.replaceChildren();
  const header=document.createElement("div");header.className="timeline-heading";
  const heading=document.createElement("strong");heading.textContent="媒體時間軸";
  const info=document.createElement("span");info.className="timeline-help";
  info.textContent="依步驟排列 · 不代表實際秒數 · 點選標尺或音軌可指定起點";
  const selection=document.createElement("span");selection.className="timeline-selection";
  selection.setAttribute("aria-live","polite");selection.textContent="尚未選擇步驟";
  header.append(heading,info,selection);
  const viewport=document.createElement("div");viewport.className="timeline-viewport";
  const labels=document.createElement("div");labels.className="timeline-labels";
  const rulerLabel=document.createElement("div");rulerLabel.className="timeline-label timeline-ruler-label";rulerLabel.textContent="步驟";
  labels.append(rulerLabel);
  for(const lane of lanes){
   const label=document.createElement("div");label.className="timeline-label timeline-label-"+lane.css;
   label.textContent=lane.title;labels.append(label);
  }
  const scroll=document.createElement("div");scroll.className="timeline-scroll";
  scroll.id="audioTimelineScroll";scroll.tabIndex=0;
  scroll.setAttribute("aria-label","音效軌道，可水平捲動檢視全部步驟");
  const content=document.createElement("div");content.className="timeline-content";
  content.style.width=(count*width)+"px";content.style.setProperty("--cue-width",width+"px");
  const cursor=document.createElement("div");cursor.className="timeline-cursor";cursor.hidden=true;
  const ruler=document.createElement("div");ruler.className="timeline-ruler";
  const marks=[];
  const fragment=document.createDocumentFragment();
  steps.forEach((step,index)=>{
   const button=document.createElement("button");button.type="button";button.className="timeline-tick";
   button.textContent=step.label===undefined?String(index):String(step.label);
   button.title="預覽第 "+button.textContent+" 步";
   button.setAttribute("aria-label","選擇第 "+button.textContent+" 步");
   button.setAttribute("aria-pressed","false");
   button.addEventListener("click",()=>onSelect(index));
   fragment.append(button);marks.push(button);
  });
  ruler.append(fragment);
  content.append(cursor,ruler);
  const rows=new Map();
  for(const lane of lanes){
   const row=document.createElement("div");row.className="timeline-lane timeline-lane-"+lane.css;
   row.setAttribute("aria-label",lane.title);rows.set(lane.kind,row);content.append(row);
  }
  for(const clip of buildSegments(steps)){
   const lane=rows.get(clip.kind);
   const segment=document.createElement("button");segment.type="button";
   segment.className="timeline-clip timeline-clip-"+lanes.find(x=>x.kind===clip.kind).css;
   segment.style.left=(clip.start*width+2)+"px";
   segment.style.width=((clip.end-clip.start+1)*width-4)+"px";
   const label=document.createElement("span");label.textContent=basename(clip.src);
   const range=clip.start===clip.end?"第 "+steps[clip.start].label+" 步":"第 "+steps[clip.start].label+"–"+steps[clip.end].label+" 步";
   segment.title=clip.kind+" · "+basename(clip.src)+"\n"+range+"\n"+clip.src;
   segment.setAttribute("aria-label",clip.kind+" "+basename(clip.src)+"，"+range);
   segment.append(label);
   segment.addEventListener("click",event=>{
    const offset=event.detail===0?0:Math.max(0,Math.floor((event.clientX-segment.getBoundingClientRect().left)/width));
    onSelect(Math.min(clip.end,clip.start+offset));
   });
   lane.append(segment);
  }
  scroll.append(content);viewport.append(labels,scroll);host.append(header,viewport);
  let selected=null;
  function select(index){
   if(selected!==null)marks[selected].setAttribute("aria-pressed","false");
   selected=Number.isInteger(index)&&index>=0&&index<count?index:null;
   cursor.hidden=selected===null;
   if(selected===null){selection.textContent="尚未選擇步驟";return;}
   marks[selected].setAttribute("aria-pressed","true");
   cursor.style.left=(selected*width)+"px";cursor.style.width=width+"px";
   const step=steps[selected],media=step.media||[];
   selection.textContent="第 "+step.label+" 步 · "+(media.length?media.map(m=>m.kind+" "+basename(m.src)).join(" / "):"無音檔");
   const left=selected*width,right=left+width;
   if(left<scroll.scrollLeft+width||right>scroll.scrollLeft+scroll.clientWidth-width)
    scroll.scrollLeft=Math.max(0,left-scroll.clientWidth/3);
  }
  return {select,buildSegments:()=>buildSegments(steps)};
 }
 return {buildSegments,mount,lanes};
});
