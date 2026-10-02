# 用 Vercel 幫呢個 repo 加一個「填表」介面

Vercel 同時做三件事：托管靜態頁面、跑 serverless functions（`/api/notion` 寫入、`/api/data` 即時讀取）、同埋用 Edge Middleware 做登入保護。

**網站係私人嘅**：除登入頁同 `/assets/` 之外，全部路徑都要有有效 cookie 才睇得到。

## 你需要做嘅 5 步（大約 5 分鐘）

1. 去 https://vercel.com/signup ，揀 **Continue with GitHub**，用你嘅 GitHub 帳號登入（免費 Hobby 方案已足夠）。
2. 按 **Add New → Project**，揀 `health-progress` repo，按 **Import**。
3. 在 **Environment Variables** 加入以下（其餘設定保持預設）：

| 名稱 | 值 | 用途 |
| --- | --- | --- |
| `NOTION_TOKEN` | 你嘅 Notion connection token（同 GitHub Secret 一樣） | 伺服器寫入 Notion 用，唔會送到瀏覽器 |
| `FORM_PASSCODE` | 自訂一串字，例如 `swim-lift-run-2026` | 網站登入密碼，同時係 cookie 簽名金鑰 |
| `SITE_PASSWORD` | 可留空 | 想登入密碼同表單密碼分開時才填；留空就沿用 `FORM_PASSCODE` |
| `NOTION_MEALS_DS` / `NOTION_GYM_DS` / `NOTION_LIFTS_DS` / `NOTION_BODY_DS` | 可留空 | 留空就用 repo 內預設嘅四個 data source id |

4. 按 **Deploy**，等大約一分鐘。
5. 開 `https://<你的專案名>.vercel.app/`，會先見到登入頁；輸入密碼之後就可以睇數據同填表。

## 登入機制

- `middleware.js` 在 Edge 執行：冇有效 cookie 嘅請求一律 307 轉去 `/login`，`/api/*` 直接回 401。
- `/api/login` 成功後設定 **HttpOnly + Secure + SameSite=Lax** 簽名 cookie，有效期 30 日。
- 受保護範圍包括 `/archive/`、`/zh/archive/`、`/data/*.json` 同 `/form/`。
- 頁尾有「登出 Sign out」，會清除 cookie。

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
- 冇設定密碼就等於冇登入保護，所以 `FORM_PASSCODE` 一定要設定。
- Vercel Hobby 方案免費，但條款限定個人、非商業用途；你嘅用途完全符合。
- 網站唔再托管在 GitHub Pages；舊網址已經停用。
