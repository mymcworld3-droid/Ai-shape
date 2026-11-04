# 手動逐句字幕與劇本對照

預設為逐句字幕模式。按 F 或開始後，空白鍵、→、單擊／單次觸碰各前進一個步驟；← 回上一個步驟。1／Q 調整語音、2／W 調整背景音樂與音效，O 顯示／隱藏音量。開始後所有控制按鈕隱藏，字幕固定在 16:9 投影內下方。

依使用者上傳的 `Power playyyy.docx`，目前共 **374 句英文字幕、417 個手動步驟**，涵蓋四幕。每句手動換，不以語音秒數或字幕長度自動跳句。純舞台動作不印成字幕；停頓、全暗及重要影音切換保留空白字幕步驟，操作員可在開始前的步驟檢視讀到原舞台指示。

字幕除了刪除原稿第 64 段 Christopher 的 `It's empty.` 外，沿用原文，包括大小寫、用字與標點，未替劇本校正文法。角色名與動作分離；跨段續說繼承角色。第 88 段開門後的「AH!」在原稿沒有標明說話者，因此投影只顯示 AH!，不自行指定角色。卡片本身保留使用者指定的 `Access to One’s Memory`；Ethan 讀卡的字幕保留原稿 `“Access to one's memory.”`。

## 操作與影音

- F 從開場開始；即使先預覽第四幕，也會回到第一個步驟。
- 歡迎語音首句啟動原 M4A，字幕可在播放中逐句前進。走到 `You have 15 minutes.` 時切成碼錶；語音期間維持 15:00，真正播完才開始倒數並縮回。
- AI 語音播完不會自動換字幕。到最後一句仍在播放時，前進按鍵忽略、不排隊；播完再按才進下一位演員台詞。
- ← 暫停影音並回上一句／動作；不重播音效，也不重設兩個倒數期限。仍留在同一段 AI 配音時，下一次前進會從暫停位置繼續；返回配音首句之前，再重新走入首句才從頭播放。字幕倒退不對錄音做逐句定位。
- 尚未提供的 AI 配音以手動字幕完成，缺檔不造成卡住、假播放或自動跳步。選擇提示未配音時，在讀完提示、前進至下一句時開始獨立一分鐘。
- 第四幕接回記憶房間慢慢亮起，保留兩名守衛進場及最後沉默的操作步驟；兩段 AI 配音預留欄位，最後一句 `You may leave.` 後可進入沉默，再全暗結束。
- 原本 25 步的場景操作模式可在開始前按「場景模式」切換，也可用 `?mode=cues` 開啟；該模式沒有逐句字幕。

## 背景與聲音對照

| 原稿段落 | 對應事件 |
| --- | --- |
| 23 | 房間從暗變亮，播放開場動畫 |
| 27–28 | AI 漸顯，歡迎語音與逐句字幕 |
| 33 | Megan 踢門，原 WAV 音效 |
| 42、53 | 開場背景稍暗／恢復明亮；實體追光由燈控執行 |
| 46 | timer clicks，已接短 click 音效 |
| 83、85 | Ethan 翻讀白卡／Megan 收回卡片，卡片顯示／隱藏 |
| 87 | 左門 click／開門聲，獨立於記憶室亮燈 |
| 99、109–110 | 進場全暗／記憶室亮起；第 110 段單獨播放 click |
| 115 | 記憶室歡迎語音，圖形放大、背景全黑，播完退場 |
| 185、188 | Christopher 獨白，稍暗房間／投影全暗 |
| 195、199、221 | 辦公室亮起／全亮／配合三追光稍暗，保留無桌背景 |
| 213 | 辦公室 BANG |
| 269、284、290 | 自白投影全暗／幕間全暗／回記憶室討論 |
| 385–388 | 按鈕、單次短暫亮光、AI 選擇提示 |
| 389–395 | Christopher 投 Ethan 一票；Megan 投 Ethan 第二票；各自 AI 確認 |
| 400–403 | Rachel? → 沒有回答 → 最後選擇提示 → 全暗 |
| 405–409 | 守衛進場 → 慢慢亮起 → Ethan 台詞 → 測試完成提示 |
| 413–416 | 沉默 → 沒有機器人的揭露 → 沉默 → 最後全暗 |

## 音效位置與對應檔名

| 音效 | 專案檔案 | 設定欄位 | 劇本位置 |
| --- | --- | --- | --- |
| 時鐘 click | `assets/audio/effects/timer-click.wav` | `scriptEffects.timerClick` | 第 46 段 `{timer clicks}` |
| 左門開啟聲 | `assets/audio/effects/door-open.mp3` | `scriptEffects.doorOpen` | 第 87 段 `{click}` |
| 記憶室 click | `assets/audio/effects/light-click.wav` | `memory.lightClick` | 第 110 段 `{click sound}`，獨立空白 cue |
| 辦公室 BANG | `assets/audio/effects/office-bang.wav` | `office.bang` | 第 213 段 Ben 進場前 |
| 按鈕拍擊（待補、選用） | `assets/audio/selection-button.wav` | `scriptEffects.selectionButton` | 第 385 段 |

時鐘、記憶室短 click 是新增的 0.18 秒提示音。原本 `開門聲.mp3` 更名並移至 effects，內容未變；辦公室 BANG 暫用與開場踢門相同的 WAV 內容，以不同播放元素和時機觸發。已有正式聲音時，可以直接換成真正的 BANG 音檔。

第一幕配樂檔名配合台詞編號更新為 `1-14.mp3`、`15-91.mp3`、`91-92(轉場).mp3`、`92-174.mp3`、`174-175(轉場).mp3`。舊的 `.mp3_` 副檔名已修正。所有原音檔只重新命名，不轉碼。

## 另缺的六段 AI 配音

| 建議檔名 | 設定欄位 | 原稿台詞 |
| --- | --- | --- |
| `selection-prompt.m4a` | `voting.prompt` | Please make your selection.One by one, state the name of the person you believe to be the robot. 1 minute remaining. |
| `selection-one.m4a` | `voting.one` | Subject Ethan. One vote. |
| `selection-two.m4a` | `voting.two` | Subject Ethan. Two votes. |
| `selection-final.m4a` | `voting.final` | Please make your final selection. |
| `test-complete.m4a` | `ending.complete` | HUMAN VERIFICATION TEST NUMBER #67 complete. Please proceed to the exit. The next test will begin in 5 minutes. |
| `test-truth.m4a` | `ending.revealTruth` | There is no robot in the room.This test does not measure artificial intelligence.It measures how quickly human beings choose to sacrifice one another under pressure.Test completed. You may leave. |

以上皆建議放入 `assets/audio/`。開場 `ai-opening.m4a` 與記憶室 `Memory-room.m4a` 沿用現有檔案，未修改內容，也未做新的逐字語音辨識。

## 核對方式

`docs/script-source.json` 保存 Word 的原始識別資訊、人工刪句紀錄，以及修訂後的段落；`tools/build-script.py` 由該來源產生 `script-data.js`。測試逐段還原所有台詞、檢查角色繼承、374 句順序、四幕背景邊界、兩票順序與終場。不是用舊版 PDF 或對話記憶生成字幕。


## 實際驗證畫面

最終執行版本 `13e4cd8` 的逐句字幕 Chrome 測試已通過：417 個步驟完整前進與倒退、374 句原稿字幕、三種畫面比例、實際 M4A 自然播完、單擊與空白鍵／方向鍵、音量及兩個倒數期限。
[執行記錄](https://github.com/mymcworld3-droid/Ai-shape/actions/runs/41561884582)。

另外在 HTTPS 預覽實際操作 F、空白鍵與左右鍵，確認開始後按鈕隱藏、暗轉亮影片自然播完、語音中字幕換句不重播音訊、語音結束不自動跳句。白卡縮至字幕模式的適合尺寸，避開上方電視碼錶與下方字幕；場景模式尺寸保持原樣。

![開始後的演員字幕](subtitles-live.jpg)
![語音中的放大圖形與字幕](subtitles-ai-live.jpg)
![讀卡時碼錶 白卡與字幕不重疊](subtitles-card-preview.jpg)

最終版本另外讓 F／開始鍵直接要求全螢幕，並以 Chrome 測試檢查全螢幕元素為 `showShell`；瀏覽器若拒絕全螢幕，固定 16:9 畫框與字幕仍可正常操作。


## 字幕動畫

字幕出現時以 220 毫秒淡入並輕微上移；換句時舊句於 110 毫秒淡出，新句延遲 40 毫秒後用 180 毫秒淡入；隱藏時用 160 毫秒淡出。移動距離隨投影尺寸縮小，保持在 16:9 畫框內。

每次按鍵立即更新目前字幕與句子位置，動畫不阻擋操作或排隊。快速連按、左右來回、淡出中重新顯示，都會取消舊動畫，以最新一句為準；同一句的語音狀態更新不會讓字幕重新閃入。系統設定「減少動態效果」時直接切換。


動畫版本 `9d99e77`：99 項控制／原稿核對測試與 7 組 Chrome 字幕／動畫檢查通過，包含 374 句字幕、417 步完整前進倒退與三種比例。
[驗證執行記錄](https://github.com/mymcworld3-droid/Ai-shape/actions/runs/41564882871)。
另於 HTTPS 預覽以 F、空白鍵與左右鍵實際檢查切句、隱藏及快速返回後不殘留舊字幕。以下為動畫完成後的投影畫面。

![字幕動畫完成後的實際投影](subtitle-animation-live.jpg)

中央追光 `[middle spot light]` 步驟只將背景調暗至 65% 亮度；圖形與碼錶保持電視內框的原位置和大小，放大只在 AI 語音步驟使用。

## 2026-11-04 調整紀錄

原稿第 64 段的 `It's empty.` 刪除後，為原稿第 110 段 `{click sound}` 新增獨立音效步驟。因此共有 374 句實際字幕及 417 個操作步驟。劇本原始檔案雜湊識別不變；修訂後內容在 `docs/script-source.json`，可由 `tools/build-script.py` 重建。
