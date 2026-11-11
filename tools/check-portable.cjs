"use strict";
// Smoke-test the stripped release payload, not the development source tree.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const app=path.resolve(process.argv[2]||".portable-build/app");
const entries=require(path.join(app,"script-data.js")).entries;
assert.ok(entries.length>=370,"Expected complete four-act show");
assert.equal(entries.at(-1).id,"p416-0","Final blackout must be last");
assert.ok(!entries.some(e=>e.action==="behind-the-scenes"));
const html=fs.readFileSync(path.join(app,"index.html"),"utf8");
assert.ok(!html.includes('data-preview="behind-the-scenes"'));
for(const dir of ["docs","tests","tools"]){
 assert.equal(fs.existsSync(path.join(app,dir)),false,dir+" must not ship");
}
const {createServer}=require(path.join(app,"server.cjs"));
const WebSocket=require(path.join(app,"node_modules/ws"));
const server=createServer();
function request(origin,url,options){return fetch(origin+url,options);}
(async()=>{
 await new Promise((resolve,reject)=>{
  server.once("error",reject);server.listen(0,"127.0.0.1",resolve);
 });
 const origin="http://127.0.0.1:"+server.address().port;
 for(const endpoint of ["/","/index.html","/remote.html","/opening-config.js"]){
  const res=await request(origin,endpoint);
  assert.equal(res.status,200,endpoint);
 }
 let res=await request(origin,"/remote/health");
 assert.equal(res.status,204);
 assert.equal(res.headers.get("x-ai-shape-remote"),"1");
 res=await request(origin,"/assets/audio/background/act-4/Ending.m4a",{headers:{Range:"bytes=0-15"}});
 assert.equal(res.status,206,"Act IV music must stream over local HTTP");
 assert.equal((await res.arrayBuffer()).byteLength,16);
 for(const forbidden of ["/docs/behind-the-scenes.md","/server.cjs","/tests/browser-remote.cjs"]){
  res=await request(origin,forbidden);
  assert.equal(res.status,404,forbidden);
 }
 const ws=new WebSocket(origin.replace("http:","ws:")+"/remote/socket",{origin});
 await new Promise((resolve,reject)=>{
  ws.once("open",resolve);ws.once("error",reject);
 });
 ws.send(JSON.stringify({type:"watch"}));
 const ready=await new Promise((resolve,reject)=>{
  ws.once("message",d=>resolve(JSON.parse(String(d))));
  ws.once("error",reject);
 });
 assert.equal(ready.type,"ready");
 ws.close();
 console.log("PASS: portable app, music streaming, WebSocket remote, final blackout, no behind-the-scenes");
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.close());
