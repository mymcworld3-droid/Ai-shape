"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {buildSegments,lanes}=require("../audio-timeline.js");

test("timeline keeps music and narration continuous but FX on distinct steps",()=>{
 const steps=[
  {label:0,media:[]},
  {label:1,media:[{kind:"配樂",src:"music/a.mp3"},{kind:"語音",src:"voice/hello.m4a"}]},
  {label:2,media:[{kind:"配樂",src:"music/a.mp3"},{kind:"語音",src:"voice/hello.m4a"},{kind:"音效",src:"fx/door.wav"}]},
  {label:3,media:[{kind:"配樂",src:"music/b.mp3"},{kind:"音效",src:"fx/door.wav"}]},
  {label:4,media:[{kind:"配樂",src:"music/b.mp3"},{kind:"影片",src:"video/reveal.mp4"}]},
  {label:5,media:[]}
 ];
 assert.deepEqual(lanes.map(l=>l.kind),["配樂","語音","音效","影片"]);
 const segments=buildSegments(steps);
 assert.deepEqual(segments,[
  {kind:"配樂",src:"music/a.mp3",start:1,end:2},
  {kind:"配樂",src:"music/b.mp3",start:3,end:4},
  {kind:"語音",src:"voice/hello.m4a",start:1,end:2},
  {kind:"音效",src:"fx/door.wav",start:2,end:2},
  {kind:"音效",src:"fx/door.wav",start:3,end:3},
  {kind:"影片",src:"video/reveal.mp4",start:4,end:4}
 ]);
});
test("two occurrences of the same soundtrack separated by a silent cue stay separate",()=>{
 const segments=buildSegments([
  {media:[{kind:"配樂",src:"a.mp3"}]},
  {media:[]},
  {media:[{kind:"配樂",src:"a.mp3"}]}
 ]);
 assert.deepEqual(segments,[
  {kind:"配樂",src:"a.mp3",start:0,end:0},
  {kind:"配樂",src:"a.mp3",start:2,end:2}
 ]);
});
