#!/usr/bin/env python3
"""Assemble a clean, offline Power Play web app for embedded-Node launchers."""
from pathlib import Path
import re
import shutil
import sys

SOURCE = Path(__file__).resolve().parent.parent
OUTPUT = SOURCE / ".portable-build" / "app"
WEB_FILES = [
    "index.html", "stage.css", "remote.html", "remote.css",
    "opening-config.js", "opening-controller.js", "act-one-audio.js",
    "stage-layout.js", "stage-review.js", "audio-timeline.js",
    "script-data.js", "script-controller.js", "script-runtime.js",
    "scene-ai-subtitles.js", "subtitle-motion.js", "vote-overlay.js", "visualizer.js",
    "remote-link.js", "remote-stage.js", "remote-control.js", "server.cjs",
]

def exact(text, before, after, file_name):
    matches = text.count(before)
    if matches != 1:
        raise RuntimeError(f"{file_name}: expected one edit location, got {matches}")
    return text.replace(before, after)

def make_app():
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir(parents=True)
    for name in WEB_FILES:
        shutil.copy2(SOURCE / name, OUTPUT / name)
    shutil.copytree(SOURCE / "node_modules", OUTPUT / "node_modules",
                    ignore=shutil.ignore_patterns(".bin", ".package-lock.json"))

    def edit(name, operation):
        path = OUTPUT / name
        path.write_text(operation(path.read_text(encoding="utf-8")), encoding="utf-8")

    def index_edit(text):
        text, count = re.subn(
            r'\s*<li><button type="button" data-preview="behind-the-scenes".*?</button></li>',
            '', text, count=1, flags=re.DOTALL)
        if count != 1:
            raise RuntimeError("index.html: missing bonus scene button")
        return text

    def script_edit(text):
        text, count = re.subn(
            r"// Append a bonus cue without modifying the original screenplay's dialogue\."
            r"\s*data\.entries\.push\(\{.*?\}\);\s*",
            "\n", text, count=1, flags=re.DOTALL)
        if count != 1:
            raise RuntimeError("script-data.js: missing bonus cue")
        return text

    def controller_edit(text):
        text = exact(text, '"ending-blackout", "behind-the-scenes"',
                     '"ending-blackout"', "opening-controller.js")
        text = exact(text,
                     'case "ending-blackout": this.setCue("behind-the-scenes"); return true;',
                     'case "ending-blackout": return false;', "opening-controller.js")
        return text.replace('        case "behind-the-scenes": return false;\n', '')

    def config_edit(text):
        text = exact(text, '  behindScenes: "assets/videos/behind-the-scenes.mp4",\n',
                     '', "opening-config.js")
        return exact(text,
                     '"ending-blackout": 416,\n    "behind-the-scenes": 417',
                     '"ending-blackout": 416', "opening-config.js")

    def layout_edit(text):
        text, count = re.subn(
            r',\n\s*"behind-the-scenes": \{[^\n]*\}',
            '', text, count=1)
        if count != 1:
            raise RuntimeError("stage-layout.js: missing bonus preview")
        return text

    def review_edit(text):
        text = exact(text,
            'video:cue==="bright"?config.roomReveal:\n   cue==="behind-the-scenes"?config.behindScenes:null',
            'video:cue==="bright"?config.roomReveal:null', "stage-review.js")
        return exact(text,
            'video:e.action==="reveal"?config.roomReveal:\n    e.action==="behind-the-scenes"?config.behindScenes:null',
            'video:e.action==="reveal"?config.roomReveal:null', "stage-review.js")

    for name, transform in [
        ("index.html", index_edit),
        ("script-data.js", script_edit),
        ("opening-controller.js", controller_edit),
        ("opening-config.js", config_edit),
        ("stage-layout.js", layout_edit),
        ("stage-review.js", review_edit),
    ]:
        edit(name, transform)

    # Copy only media paths referenced in the runnable app, rather than older
    # unused soundtrack alternates and any behind-the-scenes / dev materials.
    references = set()
    asset_pattern = re.compile(
        r"assets/[^\s\"'<>]+" 
        r"\.(?:png|PNG|mp3|m4a|wav|mp4|MP4|svg|jpg|jpeg|webp)")
    for name in WEB_FILES:
        references.update(asset_pattern.findall((OUTPUT / name).read_text(encoding="utf-8")))
    if any("behind-the-scenes" in ref for ref in references):
        raise RuntimeError("Bonus footage leaked into portable references")
    for rel in sorted(references):
        origin = SOURCE / rel
        if not origin.is_file():
            raise RuntimeError(f"Missing referenced media: {rel}")
        destination = OUTPUT / rel
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(origin, destination)

    launcher = r'''#!/usr/bin/env node
"use strict";
const os = require("node:os");
const cp = require("node:child_process");
const {createServer} = require("./server.cjs");
function isPrivateIPv4(ip){
  if(/^10\./.test(ip)||/^192\.168\./.test(ip))return true;
  const m=ip.match(/^172\.(\d+)\./);
  return Boolean(m&&Number(m[1])>=16&&Number(m[1])<=31);
}
const localIPs = [];
for(const list of Object.values(os.networkInterfaces()))
 for(const item of list||[])
  if(item.family==="IPv4"&&!item.internal&&isPrivateIPv4(item.address))
   localIPs.push(item.address);
const server=createServer();
server.on("error",error=>{
  console.error("無法啟動演出服務：",error.message);
  process.exitCode=1;
});
server.listen(0,"0.0.0.0",()=>{
  const port=server.address().port;
  const url="http://127.0.0.1:"+port+"/";
  console.log("\nPower Play 離線演出已啟動");
  console.log("播放畫面： "+url);
  for(const ip of [...new Set(localIPs)])
    console.log("同一 Wi-Fi 的遙控網址： http://"+ip+":"+port+"/remote.html");
  console.log("可在手機上開啟遙控網址。僅限可信任的區域網路。");
  console.log("關閉此視窗（或按 Ctrl+C）即可停止服務。\n");
  try{
    if(process.platform==="darwin"){
      cp.spawn("open",[url],{stdio:"ignore",detached:true}).unref();
    }else if(process.platform==="win32"){
      cp.spawn("cmd.exe",["/d","/s","/c",'start "" "'+url+'"'],
               {windowsHide:true,stdio:"ignore",detached:true}).unref();
    }else{
      cp.spawn("xdg-open",[url],{stdio:"ignore",detached:true}).unref();
    }
  }catch(error){console.log("無法自動開啟瀏覽器，請手動開啟： "+url);}
});
function stop(){server.close(()=>process.exit(0));}
process.on("SIGINT",stop);
process.on("SIGTERM",stop);
'''
    (OUTPUT / "portable-launcher.cjs").write_text(launcher, encoding="utf-8")

    assert 'data-preview="behind-the-scenes"' not in (OUTPUT / "index.html").read_text()
    assert 'post-show-behind-the-scenes' not in (OUTPUT / "script-data.js").read_text()
    assert "docs" not in [p.name for p in OUTPUT.iterdir()]
    assert "tests" not in [p.name for p in OUTPUT.iterdir()]
    print(f"Built clean portable app: {len(WEB_FILES)} pages/scripts, {len(references)} media assets")
    for path in sorted(references):
        print(" INCLUDED", path)

if __name__ == "__main__":
    try:
        make_app()
    except Exception as exc:
        print(f"PORTABLE BUILD ERROR: {exc}", file=sys.stderr)
        raise
