# 第一幕第二場：記憶室

沿用 `feat/one-key-opening`、16:9 畫框、背景 cover 裁切與同一個 Space 鍵。
開始後所有控制按鍵仍隱藏。第一場第 8 段全暗可一直停留，讓演員進場，
不會自動亮起記憶室。

| 段 | 按鍵時機 | 投影 |
| --- | --- | --- |
| 09 | Megan 說完 Where's the light? | 1 秒淡入記憶室，清除第一場的 AI、碼錶與卡片。開燈音效欄位預留。 |
| 10 | Rachel 說完 Scary. | AI 漸顯，配置後播放 Welcome to the Memory Room. |
| 11 | 歡迎之後，演員開始找相框 | AI 淡出，只保留房間。演員可自行掌握對話長度。 |
| 12 | Ethan 說完 Go ahead. 且準備轉幕 | 1.2 秒淡至全暗，停留等下一幕。 |

若提供記憶室歡迎語音，AI 會在真實 `ended` 後自動淡出，
第 11 段的操作仍保留，不會因此直接跳到全暗。影音播放中、動畫中、
長按和雙擊都不會排隊推進。播放失敗時，下一個新按鍵只重試該項影音。

原本十五分鐘期限會繼續，但第二場不顯示碼錶。
記憶室歡迎語音使用獨立播放器，不會重新啟動十五分鐘，或重播第一場語音。

## 需要補的素材

| 素材 | 建議檔案／內容 |
| --- | --- |
| 記憶室歡迎語音 | `assets/audio/ai-memory-room.mp3`；Welcome to the Memory Room. |
| 開燈音效 | `assets/audio/memory-light-click.mp3`；短、獨立的 click，避免長前置靜音。 |
| 相框道具照片 | Christopher 與 Liam 的合照；實際演員或你指定的角色照片，不在這次背景中生成長相。 |
| 相框背面 | To remember, to forgive, to forget. —Chris |

語音與音效備妥後，在 `opening-config.js` 的 `memory` 中設定：

```js
narration: "assets/audio/ai-memory-room.mp3",
lightClick: "assets/audio/memory-light-click.mp3",
```

目前兩個欄位都是 `null`，不會請求不存在的檔案。
歡迎 cue 先顯示 AI，第 11 段由操作員按鍵使 AI 退場。
相框與人物照片在劇本中是演員拿取的道具，不額外加上照片投影 cue。

## 背景

已用內建生圖工具，以原本 `IMG_0165.png` 為參考，製作
`assets/backgrounds/memory-room.png`。保留冷灰金屬材質、同視角及空曠中央；
左後方只有一座小台與空相框。實際使用時等比例填滿 16:9，超出置中裁切。

最終使用的提示詞：

```text
Use case: precise-object-edit. Asset type: 16:9 theater projection background, 2048 x 1152 landscape. Edit the provided empty science-fiction room into the adjacent Memory Room in the same play. The input is the reference for photorealistic cinematic materials, straight verticals, front-facing level fixed wide camera, and restrained gray metal wall panels; preserve this visual language and perspective. Replace the original giant black display with plain gray paneling; remove the door numbers, lettering, and large screen. Make the room a little darker and cooler, but the floor and sparse furnishings must remain clearly visible when projected. Use quiet ice-blue perimeter illumination and soft overhead light. At the left upstage near the back wall, put one small dark stand with a single upright photo frame under a subtle pool of light. The photo frame interior is blank neutral gray; no invented people or portraits. Keep the middle, foreground and entire lower central area open for four live actors. Matte dark-gray floor, low reflection, restrained surface detail, spacious symmetrical architecture. Do not add robots, people, silhouettes, countdown clocks, futuristic control panels, logos, readable text, room numbers, watermarks, fish-eye distortion, dramatic fog or extra props. Render a finished photographic background only, not a UI screenshot. Use the full 16:9 image.
```

辦公室回憶的素材提示詞仍在 `background-prompts.md`，本次只接入記憶室。
