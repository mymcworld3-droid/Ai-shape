"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const EndCredits=require("../end-credits");
const subtitle=require("../subtitle-data");
const {STAGE_START_CUES}=require("../opening-controller");
const StageLayout=require("../stage-layout");

test("six credit cues append directly after the final blackout in both modes",()=>{
 const ids=EndCredits.cards.map(card=>card.id);
 assert.deepEqual(ids,[
  "credit-directed","credit-conversation","credit-produced",
  "credit-executive","credit-backgrounds","credit-title"
 ]);
 assert.deepEqual(STAGE_START_CUES.slice(-6),ids);
 assert.deepEqual(subtitle.entries.slice(-6).map(entry=>entry.id),ids);
 assert.equal(STAGE_START_CUES.at(-7),"ending-blackout");
 assert.equal(subtitle.entries.at(-7).action,"end-blackout");
 assert.equal(STAGE_START_CUES.includes("behind-the-scenes"),false);
 assert.equal(subtitle.entries.some(entry=>entry.action==="behind-the-scenes"),false);
 assert.equal(STAGE_START_CUES.includes("credit-pause"),false);
 assert.equal(subtitle.entries.some(entry=>entry.action==="credit-pause"),false);
 for(const entry of subtitle.entries.slice(-6)){
  assert.equal(entry.look.blackout,1);
  assert.equal(entry.text,"");
  assert.equal(entry.action,entry.id);
  assert.equal(StageLayout.previewFrame(entry.id).blackout,1);
 }
});
test("credits copy the user's reference names and go directly to the title",()=>{
 const [directed,conversation,producer,executives,backgrounds,title]=EndCredits.cards;
 assert.deepEqual(directed.lines,["SOPHIA CHOU","CURRY CHEN","RICKY LIU"]);
 assert.deepEqual(conversation.lines,["CHAT GPT","SOPHIA CHOU"]);
 assert.deepEqual(producer.lines,["SOPHIA CHOU"]);
 assert.deepEqual(executives.lines,["CURRY CHEN","RICKY LIU"]);
 assert.deepEqual(backgrounds.lines,["MUSICS — SHIU-CHEN JOU","IMAGE — RAY CHEN"]);
 assert.deepEqual(title.lines,["The Button"]);
 assert.deepEqual(EndCredits.displayLines("credit-pause"),[]);
 assert.equal(EndCredits.SONG_LEAD_MS,1600);
 assert.deepEqual([...EndCredits.CREDIT_HOLD_MS],[3000,2800,2800,2700,7000]);
 assert.deepEqual(EndCredits.cards.slice(0,5).map(card=>card.durationMs),
  [3000,2800,2800,2700,7000]);
 assert.equal(EndCredits.cards.at(-1).durationMs,undefined,
  "The Button is held at the end and never auto-advances");
 assert.deepEqual(EndCredits.displayLines("credit-title"),[{speaker:"片名",text:"The Button"}]);
});
test("each lettered page has a distinct entry and exit and title zoom ends with a linear phase",()=>{
 const entries=EndCredits.cards;
 const motions=entries.map(card=>card.motion);
 assert.equal(new Set(motions).size,6);
 const enterShapes=new Set(),leaveShapes=new Set();
 for(const card of entries){
  const pattern=EndCredits.motion[card.motion];
  assert.ok(pattern.enterMs>0&&pattern.leaveMs>0);
  if(card.id!=="credit-title")assert.ok(pattern.enterMs+pattern.leaveMs<=card.durationMs,
   "Entrance and exit must both finish within this cue's specific duration");
  assert.ok(pattern.enter.length>=2&&pattern.leave.length>=2);
  enterShapes.add(JSON.stringify(pattern.enter));
  leaveShapes.add(JSON.stringify(pattern.leave));
 }
 assert.equal(enterShapes.size,6,"All entry animations differ");
 assert.equal(leaveShapes.size,6,"All exit animations differ");
 const zoom=EndCredits.motion.infinity.enter;
 assert.equal(zoom[0].transform,"scale(160)");
 assert.equal(EndCredits.TITLE_DECEL_MS,500);
 assert.equal(EndCredits.TITLE_ZOOM_MS,4700);
 assert.deepEqual(zoom.map(frame=>frame.offset),[0,500/4700,1]);
 assert.equal(zoom[1].transform,"scale(2.3)");
 assert.equal(zoom[1].easing,"linear","Shrink speed must stay constant after the first 0.5s");
 assert.equal(zoom[2].transform,"scale(1)");
});

test("Ending.mp3 cue sheet has the exact requested cumulative music timestamps",()=>{
 const timeline=[EndCredits.SONG_LEAD_MS];
 for(const card of EndCredits.cards.slice(0,5))timeline.push(timeline.at(-1)+card.durationMs);
 assert.deepEqual(timeline,[1600,4600,7400,10200,12900,19900]);
});

test("closing credits are large and legible in the full 16:9 projector",()=>{
 const fs=require("node:fs"),path=require("node:path");
 const css=fs.readFileSync(path.join(__dirname,"..","stage.css"),"utf8");
 assert.match(css,/\.end-credit-role\{[^}]*font-size:3\.8cqh/);
 assert.match(css,/\.end-credit-names\{[^}]*font-size:5cqh/);
 assert.match(css,/\.end-credit-unfold \.end-credit-names\{font-size:4\.4cqh/);
});
