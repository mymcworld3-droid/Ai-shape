# Power Play 音樂重新套用（2026-11-11）

本分支以使用者 2026-11-11 上傳的 `power play音樂` ZIP 為權威來源。

- 第一幕 p23–98：`1-92.mp3`；p99–103：`92-93(轉場).mp3`；p104–178：`94-174.mp3`；p179–184：`174-175(轉場).mp3`。
- 第二幕 p185–194：`176-181.mp3`；p195–268：`182-264.mp3`；p269–283：`265-278.mp3`。
- 第三幕 p284–402：`after-chris-transition.mp3`（Christopher 獨白後即開始）。
- 第四幕 p407–415：`Ending.m4a`（從 `Ending.mp4` 無重編碼抽取 AAC 音軌）。
- p0–22、p403–406、p416 起：沒有背景音樂；第一幕兩段轉場不循環。
- `effects/door-open.mp3` 與 ZIP 的 `開門聲.mp3` 完全一致；`2/W` 控音效，`3/E` 控背景音樂。
- 沿用原本 1.4 秒交叉淡入淡出、1.1 秒停止淡出，以及原有所有旁白、場景和遙控控制。

**重要：本分支尚缺 6 個由使用者上傳的二進位檔案，暫不可直接部署／合併到 main。**

缺少：
```
assets/audio/background/act-1/1-92.mp3
assets/audio/background/act-1/92-93(轉場).mp3
assets/audio/background/act-1/94-174.mp3
assets/audio/background/act-1/174-175(轉場).mp3
assets/audio/background/act-3/after-chris-transition.mp3
assets/audio/background/act-4/Ending.m4a
```

其他第二幕 3 檔已透過 Git blob SHA 與主分支中完全相同的音訊內容建立新路徑。可直接從此次 ChatGPT 產出的更新 ZIP 提取缺少的音訊上傳至此分支，再執行 `npm test` 及 Playwright 瀏覽器測試，最後合併 main。這個分支不會影響目前 main 的演出。
