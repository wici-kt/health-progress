# 用 Vercel 幫呢個 repo 加一個「填表」介面

GitHub Pages 只能顯示靜態內容，唔可以接收資料。Vercel 就可以：同一份 code，多一個 serverless function（`/api/notion`），表單填完就寫入你原本嘅 Notion 資料庫。

**重點：唔需要改動現有嘅 GitHub Pages 網站。** 表單寫入 Notion → 每晚 GitHub Action 同步 → 進度頁照舊更新。兩個網址同時存在，睇你想用邊個。

## 你需要做嘅 5 步（大約 5 分鐘）

1. 去 https://vercel.com/signup ，揀 **Continue with GitHub**，用你嘅 GitHub 帳號登入（免費 Hobby 方案已足夠）。
2. 按 **Add New → Project**，揀 `health-progress` repo，按 **Import**。
3. 在 **Environment Variables** 加入以下三個（其餘設定保持預設）：

| 名稱 | 值 | 用途 |
| --- | --- | --- |
| `NOTION_TOKEN` | 你嘅 Notion connection token（同 GitHub Secret 一樣） | 伺服器寫入 Notion 用，唔會送到瀏覽器 |
| `FORM_PASSCODE` | 自訂一串字，例如 `kaden-2026` | 防止陌生人寫入你嘅記錄 |
| `NOTION_MEALS_DS` / `NOTION_GYM_DS` / `NOTION_LIFTS_DS` / `NOTION_BODY_DS` | 可留空 | 留空就用 repo 內預設嘅四個 data source id |

4. 按 **Deploy**，等大約一分鐘。
5. 開 `https://<你的專案名>.vercel.app/form/`，第一次輸入密碼，然後開始記錄。

## 加到手機主畫面

Safari 開表單網址 → 分享 → **加入主畫面**。之後就同一個 app 一樣，一按即填。

## 三個表單分別寫入邊度

| 分頁 | 寫入 | 你只需要填 |
| --- | --- | --- |
| 飲食 | Notion「Meals」 | 日期、餐別、模板（卡路里同蛋白質自動帶入） |
| 健身 | Notion「Gym Sessions」＋「Gym Lifts」 | 日期、類型 A/B/C、時長、RPE，可選填主要動作嘅組數／次數／重量 |
| 身體 | Notion「Body」 | 日期、腰圍，體重同體脂可留空 |

## 安全同注意

- Notion token **只存在 Vercel 嘅環境變數**，函式在伺服器端使用，瀏覽器永遠見唔到。
- 冇 `FORM_PASSCODE` 嘅話，任何知道網址嘅人都可以寫入你嘅資料，所以一定要設定。
- Vercel Hobby 方案免費，但條款限定個人、非商業用途；你嘅用途完全符合。
- GitHub Pages 版本嘅 `/form/` 會顯示「無法連線到 /api/notion」，因為靜態托管冇 API，呢個係正常，用 Vercel 網址就得。

## 想再進一步（可選）

現時流程係「Vercel 寫入 Notion → GitHub Action 每晚同步 → 網站顯示」。如果你想要即時（填完即刻見到），可以將整個網站搬去 Vercel，並且由瀏覽器直接讀 Notion API（同樣經 serverless function）。講聲我可以改。
