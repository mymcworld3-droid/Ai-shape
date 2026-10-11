# 第二幕 — Christopher 的回憶

依上傳劇本 `Power playyyy(1).pdf` 第 12–17 頁接入第二幕三場。
沿用 `feat/one-key-opening` 分支；開始前可靜音預覽全部 18 個步驟，
按「開始」後仍從第一段影片播放，所有按鈕隱藏。
之後以同一個 Space、點擊或觸碰推進，每按一次只處理一個步驟。

## 按鍵時機

| 步驟 | 按鍵時機 | 投影 |
| --- | --- | --- |
| 12 | 第一幕第二場，Ethan 說完 Go ahead.，準備轉幕 | 1.2 秒全暗，等待獨白進場。 |
| 13 | Christopher 走到中央，其他演員退到旁邊 | 1 秒淡入稍暗的記憶室，保留 65% 原亮度，第一段獨白。 |
| 14 | It was when I was still working as a manager. 後的停頓 | 1.2 秒投影全暗，接 There was this guy. Liam.，實際舞台保留中央追光。 |
| 15 | 第二場演員就位，Liam 進入回憶 | 1 秒淡入明亮辦公室，停留到 Christopher 說 I…，不自動切場。 |
| 16 | Christopher 說完 I…，Ben 準備進場 | 獨立 BANG 音效，背景保留辦公室；目前無聲，仍保留此步驟。 |
| 17 | Liam 離場，Ben 與 Boss 跟著離開，Christopher 獨留 | 1.2 秒投影全暗，進第三場自白；實際舞台保留中央追光。 |
| 18 | …chose which truth mattered. 結束，燈光恢復 | 1 秒回到明亮記憶室，停留等待第三幕。 |

追光由舞台燈提供；投影不繪製假聚光圈。演員台詞不設固定秒數。
漸變或實際音訊播放期間的按鍵直接忽略、不排隊，長按必須放開才能推進。
BANG 配置後等待音訊真正播完，仍須再按一鍵才能進第三場。
若播放失敗，下一按只重試 BANG，不跳場或重播開場。

背景切換都在完成的全暗下進行；第二幕不顯示 AI、碼錶或卡片。
第一場語音結束時開始的 15 分鐘期限持續運作，跨場不暫停或重設。
步驟 18 目前是此版本最後一步，第三幕還未接入。

## 素材

| 項目 | 狀態／建議位置 |
| --- | --- |
| 辦公室背景 | 已完成：`assets/backgrounds/office-memory.png`；16:9、明亮中性白光、左後方桌子、中央與右側留白，僅一扇左門。 |
| 辦公室 BANG | **待提供**：`assets/audio/office-bang.mp3`，短門撞擊聲、無長前置靜音；在 `opening-config.js` 設定 `office.bang`。 |
| 文件與資料夾 | **實體道具**：供 Christopher、Liam、Boss 持取；可使用空白內容，背景不生成可讀文件。 |
| 辦公桌 | 背景已有左後方桌子；若演員需拿取桌上文件，另備實體桌配合舞台站位。 |
| 中央追光 | 實際舞台燈，由燈光操作員配合上述台詞。 |

先前待補的踢門音效、記憶室 click／歡迎語音、正式卡片與相框道具，
請見 README。第二幕沒有新增 AI 語音，不需要預錄演員台詞。
`office.bang: null` 不請求不存在的檔案，也不以測試音當正式音效。

## 辦公室背景生成

使用內建 imagegen，以 `assets/backgrounds/IMG_0165.png` 作為材質、亮度與視角參考。
新增一張正常企業辦公室，不修改原背景。輸出為 1672×941 PNG；
在固定 16:9 投影內 cover 填滿，邊緣極少裁切，不拉伸。
最終檔案：`assets/backgrounds/office-memory.png`。

以下為實際使用的完整提示詞。

```text
Create ONE finished theatrical projection background for Act II, Scene II, Christopher's office memory in a live play. Use the attached room image ONLY as reference for photorealistic architectural realism, bright readable lighting, fixed straight-on eye-level camera, neutral light gray palette and clean perspective. Create a DIFFERENT location: an ordinary modern corporate office, not the test room. Wide landscape 16:9 composition. Bright neutral daylight with gentle warm office ceiling lights, pale gray walls, a restrained glass partition along the rear, matte medium gray floor. Place one modest business desk against the BACK LEFT of the image, a small tidy stack of paper files and folders on top, a compact desk lamp, and a low filing cabinet behind it. The desk must remain a secondary background detail, leave the entire center, right side, and foreground spacious and clear for four LIVE actors to stand in front of the projection. Include only one simple left-side doorway; do not add a second door. Plain realistic corporate setting, no futuristic architecture, no dramatic darkness, no tinted blue light. Horizontal camera, straight vertical lines, controlled wide perspective with no fisheye distortion. No people, no silhouettes, no human shadows, no television or screen, no AI shapes, no countdown, no signage, no company logos, no room numbers, no readable text, no watermark. Crisp cinematic architectural photograph, believable proportions, balanced bright exposure. Output one 16:9 background ready to fill a theater projection.
```

## 驗證

62 項控制與版面測試通過。Chrome 測試保留開場完整影片與語音自然播完、
AI 電視內框最大尺寸及三種比例的檢查，新增第二幕六步操作、獨立像素
比對稍暗記憶室／明亮辦公室／精確全暗、回到記憶室及跨幕期限不變。
另用僅存在於測試服務的 PCM 音檢驗 BANG 的真實結束、播放失敗重試與
長按限制；檢查辦公室背景載入失敗、載入完成不自動播放及開始閘門。
完整 Chrome 執行結果與實際預覽畫面會在驗證完成後附於下方。
