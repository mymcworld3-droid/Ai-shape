"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const original=require("../script-data"),subtitles=require("../subtitle-data");
const source=require("../docs/script-source.json");
const soundOnly=/^(?:(?:huh|ugh|ah|aah|haha+|ha(?:[\s-]*ha)+|hehe+|he(?:[\s-]*he)+|hm+|hmm+|uh+|um+|ohh+|gasp|groan|chuckle)[\s.!?…]*)+$/i;

test("subtitle mode keeps all scripted media cues, but scene-mode AI sentences are untouched",()=>{
 assert.ok(subtitles.entries.length<original.entries.length);
 for(const action of ["reveal","ai","opening-clock","doorKick","timerClick",
  "card","card-hide","doorOpen","memory-light","memoryClick","officeBang",
  "selection-button","ending-light","end-blackout"]){
  assert.equal(subtitles.entries.filter(e=>e.action===action).length,
   original.entries.filter(e=>e.action===action).length,"media action "+action);
 }
 assert.equal(original.entries.filter(e=>e.group==="opening").length,7);
 assert.equal(original.entries.filter(e=>e.group==="revealTruth").length,5);
 const ai=subtitles.entries.filter(e=>e.group==="opening");
 assert.equal(ai.length,2,"Opening speech joins adjacent lines until clock cue");
 assert.equal(ai.at(-1).action,"opening-clock");
 assert.equal(subtitles.entries.at(-7).action,"end-blackout");
 assert.equal(subtitles.entries.some(e=>e.action==="behind-the-scenes"),false);
 assert.equal(subtitles.entries.at(-1).action,"credit-title");
});

test("restore all meaningful omitted lines from screenplay and latest Ben farewell",()=>{
 const allParts=subtitles.entries.flatMap(e=>e.parts||[]);
 const ids=new Set(allParts.map(p=>p.id));
 for(const id of ["p33-1","p321-0","p322-0","p323-0","p325-0",
  "p325-1","p326-0","p327-0","p360-0","p362-0","p257-ben-song","p257-ben-exit"])
  assert.ok(ids.has(id),"missing restored line "+id);
 for(const e of original.entries.filter(e=>e.text)){
  const changed=e.id==="p414-0";
  if(changed)continue;
  if(soundOnly.test(e.text.trim()))continue;
  assert.ok(allParts.some(p=>p.id===e.id&&p.text===e.text),
   "lost original spoken fragment "+e.id);
 }
 assert.ok(subtitles.entries.some(e=>e.speaker==="BEN"&&
  e.text.includes("Goodbye, Goodbye, see you tomorrow!")&&
  e.text.includes("I won't be seeing you tomorrow")));
 assert.ok(subtitles.entries.some(e=>e.group==="revealTruth"&&
  e.text.includes("There is no robot among the four of you.")));
 assert.equal(subtitles.entries.some(e=>e.text.includes("There is no robot in the room.")),false);
 assert.ok(subtitles.entries.some(e=>e.text.includes("You talk too much.")));
 assert.ok(subtitles.entries.some(e=>e.text.includes("Why are you so interested in making sure nobody decides?")));
 assert.ok(!subtitles.entries.some(e=>e.text==="It's empty."));
 assert.ok(!subtitles.entries.some(e=>e.text==="Ah!"));
});

test("uninterrupted same-speaker words are grouped, but stage/photo/voice boundaries remain",()=>{
 const entries=subtitles.entries,ids=new Set(entries.map(e=>e.id));
 for(const id of ["p122-2","p137-0","p143-0","p149-0",
  "p389-0","p407-0","p408-0","p409-0"])
  assert.ok(ids.has(id),"visual boundary "+id);
 const starts=[...entries.keys()].filter(i=>entries[i].kind==="cue");
 assert.ok(starts.length>8);
 const merged=entries.filter(e=>e.parts?.length>1);
 assert.ok(merged.length>20,"same speaker lines should actually be joined");
 assert.ok(merged.some(e=>e.parts.some(p=>p.paragraph===325)));
 assert.ok(merged.some(e=>e.parts.some(p=>p.paragraph===414)&&e.parts.length===5));
 for(const e of entries){
  if(e.kind!=="dialogue")continue;
  assert.ok(e.text.trim());
  assert.ok(!soundOnly.test(e.text.trim()),
   "sound-only line should have no subtitle "+e.id);
 }
 assert.ok(entries.every((e,i)=>i===0||e.paragraph>=entries[i-1].paragraph));
 assert.equal(source.paragraphs[414].includes("There is no robot in the room"),true,
  "archived Word source stays intact; new subtitle text follows Google Doc");
});
