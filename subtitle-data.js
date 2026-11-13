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
 // Show the requested gloss for the rhetorical term; leave source parts intact.
 const parallelismLine=entries.find(e=>e.id==="p341-0");
 if(parallelismLine)parallelismLine.text="It would’ve been nice if you continue with it, parallelism（排比）, you know.";
 // Split only the requested long actor speeches, preserving the source part
 // in the first cue for manuscript checks and stable bookmarks.
 function splitSpeech(id,first,second,nextId){
  const entry=entries.find(e=>e.id===id);
  if(!entry||entry.text!==first+" "+second||entries.some(e=>e.id===nextId))
   throw Error("Subtitle split unavailable: "+id);
  entry.text=first;
  entries.splice(entries.indexOf(entry)+1,0,{
   ...entry,id:nextId,text:second,action:null,look:{...entry.look},
   parts:[{id:nextId,paragraph:entry.paragraph,text:second}]
  });
 }
 splitSpeech("p304-1",
  "I am well aware that sometimes sacrifices are necessary,",
  "but we need to aim for the solution with minimal damage.","p304-2");
 splitSpeech("p350-0",
  "Turning literature all of the sudden, I thought our setting is comedy,",
  "judging by how we all look like dumbass clowning around.","p350-1");
 // Pure nonlexical sounds have no readable subtitle. Keep meaningful
 // interjections and lines that contain other spoken words.
 const soundOnly=/^(?:(?:huh|ugh|ah|aah|haha+|ha(?:[\s-]*ha)+|hehe+|he(?:[\s-]*he)+|hm+|hmm+|uh+|um+|ohh+|gasp|groan|chuckle)[\s.!?…]*)+$/i;
 // Remove operator step 271 ("What?" / Ethan), leaving the original source manuscript intact.
 // The following AI selection prompt becomes the next operator-controlled step.
 // Also remove Megan's "Who's this?" (former step 90) from subtitle mode.
 // Archived manuscript/scene cues remain untouched.
 const removedDialogueIds=new Set(["p384-0","p134-0"]);
 const kept=entries.filter(e=>!removedDialogueIds.has(e.id)&&
  (e.kind!=="dialogue"||!soundOnly.test(e.text.trim())));
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
  "p209-2","p209-3", // Liam's denial and accusation: three screens
  "p222-2","p222-3","p222-4", // CEO's four separate subtitle screens
  "p272-0","p274-0","p277-0","p281-0", // Christopher's five separate confession screens
  "p304-1","p304-2", // Ethan's dystopia/sacrifices/minimal-damage lines
  "p341-1", // Rachel's parallelism quip in two operator-controlled screens
  "p350-1", // Megan's comedy setup and clowning-around punchline
  "p353-0", // Ethan's two separate observations about Chris and Rachel
  "p358-2", // Split Megan's coin-flip suggestion from her preceding question
  "p363-1", // Rachel's consistency retort is a separate step
  "p375-2", // Ethan's unnecessary-actions line is a separate step
  "p383-1", // Separate Christopher's minimal-damage conclusion
  "p388-1","p388-2", // AI selection prompt: each of three sentences
  "p409-1","p409-2", // AI completion announcement: three sentences
  "p414-1","p414-2","p414-3" // AI truth reveal: four screens
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
 // The operator advances each overlapping three-person exchange once.
 // Individual names remain visible, and all original IDs remain in parts.
 function groupSimultaneous(ids){
  const start=result.findIndex(e=>e.id===ids[0]);
  const group=ids.map((id,i)=>result[start+i]);
  if(start<0||group.some((e,i)=>!e||e.id!==ids[i]))
   throw Error("Simultaneous subtitle cues unavailable: "+ids.join(", "));
  const first=group[0];
  if(group.some(e=>e.kind!=="dialogue"||e.action||e.group||
   e.act!==first.act||e.scene!==first.scene||!sameLook(e,first)))
   throw Error("Simultaneous cue has incompatible stage effects: "+ids.join(", "));
  first.lines=group.map(e=>({speaker:e.speaker,text:e.text}));
  first.parts=group.flatMap(e=>e.parts||[]);
  first.speaker="";
  first.text=first.lines.map(line=>line.speaker+": "+line.text).join("\n");
  result.splice(start,group.length,first);
 }
 // Cross-speaker lines in each exchange appear together in one manual cue.
 // The second Ethan sentence at p122-1 is already joined to p122-0.
 groupSimultaneous(["p78-0","p79-0"]);
 groupSimultaneous(["p121-0","p122-0"]);
 // Christopher's "Hilarious." and Rachel's fatalistic reply share a screen.
 groupSimultaneous(["p160-1","p161-0"]);
 groupSimultaneous(["p89-0","p90-0","p91-0"]);
 groupSimultaneous(["p378-0","p379-0","p380-0"]);
 // Preserve the final post-show media action and the inserted blackout hold.
 return {source:{...source.source,subtitleDocument:"Power playyyy (Google Docs)"},
  entries:credits.appendToSubtitle(result)};
});
