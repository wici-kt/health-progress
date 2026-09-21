# 健身計劃（可直接輸入 Strong）

配合 `training-plan.md` 的三節全身訓練，每節約 45-55 分鐘。星期一、三、六做，中間相隔最少 48 小時。

## 怎樣在 Strong 設定

1. 開 Strong，去 **Workouts → New Routine**，名為 `Gym A`，加入下面 A 的動作。
2. 同樣建立 `Gym B` 和 `Gym C`。
3. 每個動作設定組數同次數（例如 3 sets × 8-10 reps），休息時間：大動作 90-120 秒，細動作 60 秒。
4. 設定 → **Apple Health** 開啟，Strong 的訓練就會寫入 Apple Health，之後我幫你寫的報告會自動見到。
5. 重量：做到組數上限（例如 3 組都做到 10 下）就加 2.5 公斤。

動作名稱用 Strong 內建名稱（英文），方便搜尋；中文係解釋。

## Gym A（星期一 18:15）

| # | Strong 動作名 | 中文 | 組 × 次 | 休息 |
| --- | --- | --- | --- | --- |
| 1 | Goblet Squat | 啞鈴高腳杯深蹲 | 3 × 8-10 | 120 秒 |
| 2 | Dumbbell Bench Press | 啞鈴臥推 | 3 × 8-12 | 120 秒 |
| 3 | Lat Pulldown | 滑輪下拉 | 3 × 8-12 | 90 秒 |
| 4 | Romanian Deadlift (Dumbbell) | 啞鈴羅馬尼亞硬舉 | 2 × 10 | 90 秒 |
| 5 | Plank | 平板支撐 | 3 × 30-45 秒 | 60 秒 |

## Gym B（星期三 10:00）

| # | Strong 動作名 | 中文 | 組 × 次 | 休息 |
| --- | --- | --- | --- | --- |
| 1 | Deadlift (Trap Bar) | 六角槓硬舉 | 3 × 6-8 | 150 秒 |
| 2 | Incline Dumbbell Press | 上斜啞鈴臥推 | 3 × 8-10 | 120 秒 |
| 3 | Seated Cable Row | 坐姿划船 | 3 × 10 | 90 秒 |
| 4 | Bulgarian Split Squat | 保加利亞分腿蹲 | 2 × 10 每邊 | 90 秒 |
| 5 | Hanging Knee Raise | 懸垂抬膝 | 3 × 8-12 | 60 秒 |

## Gym C（星期六 10:00）

| # | Strong 動作名 | 中文 | 組 × 次 | 休息 |
| --- | --- | --- | --- | --- |
| 1 | Dumbbell Floor Press | 啞鈴地板臥推 | 3 × 10 | 90 秒 |
| 2 | Pull Up (Assisted) | 輔助引體上升 | 3 × 8-10 | 120 秒 |
| 3 | One-Arm Dumbbell Row | 單臂啞鈴划船 | 3 × 10 | 90 秒 |
| 4 | Hip Thrust | 臀推 | 3 × 10 | 90 秒 |
| 5 | Farmer's Walk | 農夫走路 | 3 × 30 米 | 60 秒 |
| 6 | Face Pull | 面拉 | 2 × 12 | 60 秒 |

## 每次之前（8 分鐘）

健身單車或划船機 5 分鐘，之後：髖關節畫圈 × 10、前後踢腿 × 10、空手深蹲 × 10、彈力帶肩外旋 × 15。

## 記錄方式，三選一

| 方法 | 好處 | 要做的事 |
| --- | --- | --- |
| **Strong + Apple Health**（推薦） | 做完即走，唔需要另外記錄 | Strong 設定裡開啟 Apple Health，訓練自動進入健康數據，報告更新時就會見到 |
| Strong CSV 匯出 | 組數、次數、重量都可以上網頁 | 每月一次：Strong → Settings → Export Data → CSV，之後跑一次 `node tools/import-strong.mjs <檔案>` |
| Notion「Gym Lifts」 | 即時同步到網頁 | 只記主要動作，每節 3-5 行 |

## 唔需要做的事

- 唔需要做到極限，最後一下仍要保留 1-2 下的餘力。
- 唔需要每天做，三節足夠；休息日行多啲路比多做一節更有用。
- 唔需要追重量，做到次數上限才加 2.5 公斤。
