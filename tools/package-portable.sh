#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
NODE_VERSION="v22.16.0"
BASE="https://nodejs.org/dist/$NODE_VERSION"
mkdir -p .portable-build/downloads .portable-build/mac/runtime .portable-build/windows/runtime
curl -fL --retry 4 --retry-delay 4 "$BASE/node-$NODE_VERSION-darwin-arm64.tar.gz" -o .portable-build/downloads/mac-arm64.tgz
curl -fL --retry 4 --retry-delay 4 "$BASE/node-$NODE_VERSION-darwin-x64.tar.gz" -o .portable-build/downloads/mac-x64.tgz
curl -fL --retry 4 --retry-delay 4 "$BASE/node-$NODE_VERSION-win-x64.zip" -o .portable-build/downloads/win-x64.zip
tar -xOf .portable-build/downloads/mac-arm64.tgz "node-$NODE_VERSION-darwin-arm64/bin/node" > .portable-build/mac/runtime/node-arm64
tar -xOf .portable-build/downloads/mac-x64.tgz "node-$NODE_VERSION-darwin-x64/bin/node" > .portable-build/mac/runtime/node-x64
unzip -p .portable-build/downloads/win-x64.zip "node-$NODE_VERSION-win-x64/node.exe" > .portable-build/windows/runtime/node.exe
chmod 755 .portable-build/mac/runtime/node-arm64 .portable-build/mac/runtime/node-x64
for executable in .portable-build/mac/runtime/node-arm64 .portable-build/mac/runtime/node-x64 .portable-build/windows/runtime/node.exe; do
  test "$(stat -c%s "$executable")" -gt 20000000
  file "$executable"
done
cp -a .portable-build/app .portable-build/mac/app
cp -a .portable-build/app .portable-build/windows/app
cat > .portable-build/mac/啟動演出.command <<'MAC'
#!/bin/bash
cd "$(dirname "$0")" || exit 1
case "$(uname -m)" in
  arm64) NODE="./runtime/node-arm64" ;;
  x86_64) NODE="./runtime/node-x64" ;;
  *) echo "不支援此 Mac 處理器"; read -r -p "按 Enter 關閉"; exit 1 ;;
esac
xattr -d com.apple.quarantine "$NODE" 2>/dev/null || true
chmod +x "$NODE" 2>/dev/null || true
exec "$NODE" "./app/portable-launcher.cjs"
MAC
chmod 755 .portable-build/mac/啟動演出.command
cat > .portable-build/windows/啟動演出.bat <<'WIN'
@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "runtime\node.exe" (
  echo Missing portable runtime.
  pause
  exit /b 1
)
"runtime\node.exe" "app\portable-launcher.cjs"
if errorlevel 1 pause
WIN
cat > .portable-build/mac/使用說明.txt <<'DOC'
Power Play — Mac 免安裝演出版（Apple 晶片及 Intel 通用）

1. 解壓縮 ZIP，不要只拖出單獨的啟動檔。
2. 雙擊「啟動演出.command」，會自動開啟本機演出網頁。
3. 第一次遇到 macOS 安全提示，請按右鍵「打開」；若仍被阻擋，
   在「系統設定 > 隱私權與安全性」選擇「仍要打開」。
4. 使用手機遙控時，手機和電腦連到同一個可信任的 Wi-Fi；
   手機遙控網址會出現在啟動後的終端機視窗。
5. 關閉終端機視窗即可停止服務。

內建執行環境，不需安裝 Node.js、不需網際網路。
第四幕「最終全暗」即結束，不含幕後花絮。
DOC
cat > .portable-build/windows/使用說明.txt <<'DOC'
Power Play — Windows 64 位元免安裝演出版

1. 解壓縮 ZIP，不要只拖出單獨的啟動檔。
2. 雙擊「啟動演出.bat」，會自動開啟本機演出網頁。
3. 若防火牆提示要求允許，手機遙控時只選私人網路。
4. 使用手機遙控時，手機和電腦連到同一個可信任的 Wi-Fi；
   手機遙控網址會出現在命令視窗。
5. 關閉命令視窗即可停止服務。

內建執行環境，不需安裝 Node.js、不需網際網路。
第四幕「最終全暗」即結束，不含幕後花絮。
DOC
mkdir -p .portable-build/releases
cp -a .portable-build/mac .portable-build/releases/PowerPlay-Mac
cp -a .portable-build/windows .portable-build/releases/PowerPlay-Windows
(
  cd .portable-build/releases
  zip -qry PowerPlay-Portable-Mac-Universal.zip PowerPlay-Mac
  zip -qry PowerPlay-Portable-Windows-x64.zip PowerPlay-Windows
)
unzip -t .portable-build/releases/PowerPlay-Portable-Mac-Universal.zip | tail -1
unzip -t .portable-build/releases/PowerPlay-Portable-Windows-x64.zip | tail -1
ls -lh .portable-build/releases/*.zip
