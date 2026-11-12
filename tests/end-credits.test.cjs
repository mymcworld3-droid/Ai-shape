"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const EndCredits=require("../end-credits");
const subtitle=require("../subtitle-data");
const {STAGE_START_CUES}=require("../opening-controller");
const StageLayout=require("../stage-layout");

test("six credit cues append after the bonus cue in both modes without a black pause",()=>{
 const ids=EndCredits.cards.map(card=>card.id);
 assert.deepEqual(ids,[
  "credit-directed","credit-conversation","credit-produced",
  "credit-executive","credit-backgrounds","credit-title"
 ]);
 assert.deepEqual(STAGE_START_CUES.slice(-6),ids);
 assert.deepEqual(subtitle.entries.slice(-6).map(entry=>entry.id),ids);
 assert.equal(STAGE_START_CUES.at(-7),"behind-the-scenes");
 assert.equal(subtitle.entries.at(-7).action,"behind-the-scenes");
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
 assert.equal(EndCredits.CARD_DURATION_MS,2500);
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
  if(card.id!=="credit-title")assert.ok(pattern.enterMs+pattern.leaveMs<=EndCredits.CARD_DURATION_MS,
   "Both entrance and exit must fit into the card's 2.5s");
  assert.ok(pattern.enter.length>=2&&pattern.leave.length>=2);
  enterShapes.add(JSON.stringify(pattern.enter));
  leaveShapes.add(JSON.stringify(pattern.leave));
 }
 assert.equal(enterShapes.size,6,"All entry animations differ");
 assert.equal(leaveShapes.size,6,"All exit animations differ");
 const zoom=EndCredits.motion.infinity.enter;
 assert.equal(zoom[0].transform,"scale(160)");
 assert.deepEqual(zoom.map(frame=>frame.offset),[0,.46,.72,1]);
 assert.equal(zoom[2].easing,"linear","The last shrink segment must have constant speed");
 assert.equal(zoom[3].transform,"scale(1)");
});
