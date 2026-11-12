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
 assert.equal(ai.length,6,"Opening speech uses five operator-selected screens plus timer cue");
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

test("requested subtitle breaks remain separate navigable steps",()=>{
 const entries=subtitles.entries;
 const screens=[
  ["p28-0","Welcome to HUMAN VERIFICATION TEST NUMBER #67."],
  ["p28-1","Please remain calm. There is no escape."],
  ["p28-3","You have one mission."],
  ["p28-4","There is one robot in this room, find out who, when you have decided, press the button."],
  ["p28-5","Or else, everyone will be executed."],
  ["p28-6","You have 15 minutes."],
  ["p32-0","A joke? If this were a kidnapping, my lawyers would have already infiltrated the building."],
  ["p32-3","Whoever designed this budget escape room clearly lacks taste."],
  ["p33-1","Hey! Let us out! you freaking robot!!!"],
  ["p43-0","Great. Now let's recap."],
  ["p43-2","The four of us are now trapped in a room by some mysterious robot."],
  ["p62-0","Wait. Cut it, everyone, check your pocket."],
  ["p62-1","Oh… I don’t have a pocket."],
  ["p72-0","Let me think. What are some human things? Reflexes... Heads up!"],
  ["p75-0","Wait, what is that?"],
  ["p83-1","“Access to one's memory.”"],
  ["p137-0","There's also some writing on the back."],
  ["p139-0","“To remember, to forgive, to forget. —Chris”"],
  ["p207-0","They were the one stealing!"],
  ["p207-1","They were the ones snatching other’s proposal and claiming it’s theirs!"],
  ["p207-2","What I'm doing is purely what they are doing."],
  ["p207-3","An eye for an eye."],
  ["p209-0","He wouldn’t know! Nobody’s gonna know!"],
  ["p209-2","And even if so, they had already overlooked Ben’s team so many times, just because he’s the chairman’s son."],
  ["p209-3","And you, you're the CEO’s son! Of course he is going to forgive you, like what could he possibly do."],
  ["p222-0","You know what I want to hear, don’t you? Explanation?"],
  ["p222-2","Ben showed me clear evidence that they came up with the proposal of building a psychological test."],
  ["p222-3","Detailed meeting minutes, thought processes, clearly something other groups can't put their hands on."],
  ["p222-4","So how come it was submitted by your group? There is only one explanation."],
  ["p270-0","What was I supposed to do? Take the blame for something I didn't do?"],
  ["p272-0","Lose my position? Lose everything my father had given me?"],
  ["p274-0","For what? So Liam could feel like I was a good friend?"],
  ["p277-0","He told me to tell the truth. I told the truth. I didn't lie."],
  ["p281-0","I just... ...chose which truth mattered."],
  ["p341-0","It would’ve been nice if you continue with it, parallelism（排比）, you know."],
  ["p341-1","but clearly you don’t know that sooo…"],
  ["p351-0","Don’t you think this line would fit Rachel better?"],
  ["p353-0","I get it now, so you are saying that Chris would sacrifice someone when he’s under pressure?"],
  ["p358-1","How much longer are we gonna stand here and talk?"],
  ["p358-2","We should just flip a coin and let God decide at this point."]
 ];
 for(const [id,text] of screens){
  const matches=entries.filter(e=>e.parts?.some(p=>p.id===id));
  assert.equal(matches.length,1,"unique subtitle for "+id);
  assert.equal(matches[0].text,text,"subtitle text for "+id);
 }
 const consecutiveGroups=[
  ["p28-0","p28-1","p28-3","p28-4","p28-5","p28-6"],
  ["p32-0","p32-3"],
  ["p43-0","p43-2"],
  ["p62-0","p62-1"],["p72-0","p75-0"],["p137-0","p139-0"],
  ["p207-0","p207-1","p207-2","p207-3"],
  ["p209-0","p209-2","p209-3"],
  ["p222-0","p222-2","p222-3","p222-4"],
  ["p270-0","p272-0","p274-0","p277-0","p281-0"],
  ["p341-0","p341-1"],
  ["p351-0","p353-0"],
  ["p358-1","p358-2"]
 ];
 for(const group of consecutiveGroups){
  const indices=group.map(id=>entries.findIndex(e=>e.parts?.some(p=>p.id===id)));
  for(let i=1;i<indices.length;i++)assert.equal(indices[i],indices[i-1]+1,
   "adjacent operator subtitle lines: "+group.join(", "));
 }
 const kick=entries.find(e=>e.action==="doorKick");
 assert.equal(kick?.id,"p33-0","original kick effect stays on the same step");
 assert.equal(kick?.kind,"dialogue");
 assert.equal(kick?.speaker,"MEGAN");
 assert.equal(kick?.text,"Hey! Let us out! you freaking robot!!!");
 assert.deepEqual(kick?.parts.map(part=>part.id),["p33-1","p33-2","p33-3"]);
 assert.equal(entries.filter(e=>e.paragraph===33).length,1,
  "kick effect and shouted dialogue must not be separate steps");
 const card=entries.find(e=>e.action==="card");
 assert.equal(card?.id,"p83-0","original flip-card action must remain");
 assert.equal(card?.speaker,"ETHAN");
 assert.equal(card?.text,"“Access to one's memory.”");
 assert.deepEqual(card?.parts.map(part=>part.id),["p83-1"]);
 assert.equal(entries.filter(e=>e.paragraph===83).length,1,
  "flip-card cue and reading are one navigable step");
 assert.equal(entries.length,292,
  "splitting Megan's question from the coin-flip suggestion adds one step");
});
