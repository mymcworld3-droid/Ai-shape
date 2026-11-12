/* Subtitle-mode manuscript reconciliation (Google Doc "Power playyyy").
 * The scene-mode AI cue list in script-data.js remains unchanged.
 * Every spoken fragment retains its original paragraph and stable ID in parts.
 * Exclude sound-only vocalizations; join uninterrupted lines by the same actor.
 */
(function(root,factory){
 const source=typeof module==="object"&&module.exports?require("./script-data"):root.SHOW_SCRIPT;
 const credits=typeof module==="object"&&module.exports?require("./end-credits"):root.EndCredits;
 const result=factory(source,credits);
 if(typeof module==="object"&&module.exports)module.exports=result;
 else root.SUBTITLE_SCRIPT=result;
})(typeof globalThis!=="undefined"?globalThis:this,function(source,credits){
 "use strict";
 const entries=source.entries.map(e=>({...e,look:{...e.look},
  parts:e.text?[{id:e.id,paragraph:e.paragraph,text:e.text}]:[]}));
 // The online manuscript restores several real dialogue lines removed from
 // earlier operator-review revisions, plus Ben's newly written exit taunt.
 // "Ha Ha Ha" and "Hahaha" are sound-only; his sung words are dialogue.
 const additions=[
  {id:"p33-1",paragraph:33,speaker:"MEGAN",text:"Hey!"},
  {id:"p257-ben-song",paragraph:257,speaker:"BEN",text:"Goodbye, Goodbye, see you tomorrow!"},
  {id:"p257-ben-exit",paragraph:257,speaker:"BEN",text:"Oh sorry, I won't be seeing you tomorrow."},
  {id:"p321-0",paragraph:321,speaker:"CHRISTOPHER",text:"You."},
  {id:"p322-0",paragraph:322,speaker:"RACHEL",text:"Me?"},
  {id:"p323-0",paragraph:323,speaker:"CHRISTOPHER",text:"You talk too much."},
  {id:"p325-0",paragraph:325,speaker:"RACHEL",text:"Oh, but like, it’s not all my fault, right?"},
  {id:"p325-1",paragraph:325,speaker:"RACHEL",text:"At least now we know that she’s definitely a human."},
  {id:"p326-0",paragraph:326,speaker:"MEGAN",text:"Ohhhh ya, I got it."},
  {id:"p327-0",paragraph:327,speaker:"RACHEL",text:"Correction, I found it."},
  {id:"p360-0",paragraph:360,speaker:"CHRISTOPHER",text:"Why are you so interested in making sure nobody decides?"},
  {id:"p362-0",paragraph:362,speaker:"CHRISTOPHER",text:"This again."}
 ];
 const order=id=>{
  const m=id.match(/-(\d+)$/);
  return m?Number(m[1]):999;
 };
 for(const patch of additions){
  if(entries.some(e=>e.id===patch.id))continue;
  const next=entries.findIndex(e=>e.paragraph>patch.paragraph||
   e.paragraph===patch.paragraph&&order(e.id)>order(patch.id));
  const position=next<0?entries.length:next;
  const near=entries.slice(0,position).reverse().find(e=>e.look)||
   entries.find(e=>e.look);
  const entry={...near,id:patch.id,paragraph:patch.paragraph,
   speaker:patch.speaker,text:patch.text,action:null,group:null,
   kind:"dialogue",note:"",look:{...near.look},
   parts:[{id:patch.id,paragraph:patch.paragraph,text:patch.text}]};
  entries.splice(position,0,entry);
 }
 // Knock/kick SFX and Megan's shout are one simultaneous operator cue.
 // Retain the cue's original ID/action so the audio timeline, bookmarks and
 // playback still trigger doorKick when this one subtitle step is selected.
 const kickCue=entries.find(e=>e.id==="p33-0");
 const kickLineIds=["p33-1","p33-2","p33-3"];
 const kickLines=kickLineIds.map(id=>entries.find(e=>e.id===id));
 if(kickCue&&kickLines.every(Boolean)){
  kickCue.kind="dialogue";
  kickCue.speaker="MEGAN";
  kickCue.text=kickLines.map(e=>e.text).join(" ");
  kickCue.parts=kickLines.flatMap(e=>e.parts);
  for(const line of kickLines)entries.splice(entries.indexOf(line),1);
 }
 // The card flip and Ethan's reading are one cue. Keep the original
 // "card" action on p83-0 so the card appears together with its subtitle.
 const cardCue=entries.find(e=>e.id==="p83-0");
 const cardLine=entries.find(e=>e.id==="p83-1");
 if(cardCue&&cardLine){
  cardCue.kind="dialogue";
  cardCue.speaker=cardLine.speaker;
  cardCue.text=cardLine.text;
  cardCue.parts=[...cardLine.parts];
  entries.splice(entries.indexOf(cardLine),1);
 }
 // The latest Google Doc explicitly says "among the four of you".
 const finalFirst=entries.find(e=>e.id==="p414-0");
 if(finalFirst){
  finalFirst.text="There is no robot among the four of you.";
  finalFirst.parts=[{id:finalFirst.id,paragraph:414,text:finalFirst.text}];
 }
 // One punctuation correction for the operator's requested display text.
 // The original script wording remains preserved inside parts for traceability.
 const pocket=entries.find(e=>e.id==="p62-0");
 if(pocket)pocket.text="Wait. Cut it, everyone, check your pocket.";
 // Pure nonlexical sounds have no readable subtitle. Keep meaningful
 // interjections and lines that contain other spoken words.
 const soundOnly=/^(?:(?:huh|ugh|ah|aah|haha+|ha(?:[\s-]*ha)+|hehe+|he(?:[\s-]*he)+|hm+|hmm+|uh+|um+|ohh+|gasp|groan|chuckle)[\s.!?…]*)+$/i;
 const kept=entries.filter(e=>e.kind!=="dialogue"||!soundOnly.test(e.text.trim()));
 const visualBoundaryIds=new Set([
  "p122-2","p137-0","p143-0","p149-0",
  "p389-0","p407-0","p408-0","p409-0"
 ]);
 // Operator-directed manual subtitle boundaries. Preserve all intervening
 // stage cues and only split the explicitly selected spoken fragments.
 const manualSubtitleBreakIds=new Set([
  "p28-1","p28-3","p28-4","p28-5", // opening AI announcement: 5 screens plus timer
  "p32-3", // separate Christopher's escape-room remark
  "p43-2", // separate Ethan's recap from the next sentence
  "p62-1",  // after "check your pocket."
  "p75-0", // before "Wait, what is that?"
  "p139-0",// keep the photo inscription separate from its introduction
  "p207-1","p207-2","p207-3", // Liam's four separate sentences
  "p222-2","p222-3","p222-4" // CEO's four separate subtitle screens
 ]);
 const result=[];
 function sameLook(a,b){
  const x=a.look,y=b.look;
  return Object.keys(x).every(k=>x[k]===y[k])&&
   Object.keys(y).every(k=>x[k]===y[k]);
 }
 for(const e of kept){
  const previous=result[result.length-1];
  if(previous&&previous.kind==="dialogue"&&e.kind==="dialogue"&&
     previous.speaker===e.speaker&&previous.group===e.group&&
     previous.act===e.act&&previous.scene===e.scene&&
     !visualBoundaryIds.has(e.id)&&!manualSubtitleBreakIds.has(e.id)&&
     e.action==null&&
     (previous.action==null||previous.action==="selection-button")&&
     sameLook(previous,e)){
    previous.text=previous.text.trimEnd()+" "+e.text.trimStart();
    previous.parts.push(...e.parts);
  }else result.push(e);
 }
 // Preserve the final post-show media action and the inserted blackout hold.
 return {source:{...source.source,subtitleDocument:"Power playyyy (Google Docs)"},
  entries:credits.appendToSubtitle(result)};
});
