/* Language switch for the site. English and Traditional Chinese (Hong Kong).
   The choice is remembered in localStorage and defaults to the browser language.

   Usage:
     I18N.t("nav.overview")            -> string for the active language
     I18N.date("2026-09-13")           -> "13 Sep 2026" or "2026年9月13日"
     I18N.mountToggle(element)         -> renders the EN / 中文 control
     I18N.lang                         -> "en" or "zh"
*/

(function () {
  "use strict";

  var STRINGS = {
    "site.name": ["Health progress", "健康進度"],
    "nav.overview": ["Overview", "總覽"],
    "nav.archive": ["Health archive", "健康數據庫"],
    "nav.progress": ["Progress", "進度總覽"],
    "nav.archiveShort": ["Archive", "數據庫"],
    "common.lastSync": ["last sync", "上次同步"],
    "common.pending": ["pending", "待同步"],
    "common.theme": ["Theme", "主題"],
    "common.auto": ["Auto", "自動"],
    "common.dark": ["Dark", "深色"],
    "common.light": ["Light", "淺色"],
    "common.goal": ["goal", "目標"],
    "common.target": ["target", "目標"],
    "common.sessionsAWeek": ["sessions a week", "節／星期"],
    "gym.goalFigure": ["3 sessions a week", "每週 3 節"],
    "run.goalFigure": ["3 sessions a week", "每週 3 節"],
    "food.goalFigure": ["1,900 kcal and 150 g protein", "1,900 卡路里同 150 g 蛋白質"],
    "common.yes": ["yes", "是"],
    "common.no": ["no", "否"],
    "common.dash": ["-", "-"],
    "common.noData": ["no data", "暫無數據"],
    "common.waiting": ["waiting for data", "等待數據"],

    "hero.title": ["Getting to a normal BMI, one week at a time", "一步步回到正常 BMI"],
    "hero.note": [
      "Everything here is measured, not estimated. Apple Health supplies weight, body fat, sleep, heart rate and every run; a Notion logbook supplies gym sessions, main lifts and daily meals. The target is 70 kg, BMI under 25 and body fat around 16 to 17 percent.",
      "這裡所有數字都係量度出嚟，唔係估算。Apple Health 提供體重、體脂、睡眠、心率同每次跑步；Notion 記錄簿提供健身節數、主要動作同每日飲食。目標係 70 公斤、BMI 低於 25、體脂約 16 至 17%。"
    ],
    "hero.daysTo": ["days to {date}", "距離 {date} 仲有"],
    "hero.reached": ["target date reached", "已到目標日期"],

    "target.weight": ["Weight", "體重"],
    "target.bodyFat": ["Body fat", "體脂"],
    "target.bmi": ["BMI", "BMI"],
    "target.gymWeek": ["Gym this week", "本週健身"],
    "target.waist": ["Waist", "腰圍"],
    "target.projection": ["Projection", "預測"],
    "target.toGo": ["{kg} to go", "仲差 {kg}"],
    "target.reachedNote": ["reached", "已達到"],
    "target.targetKg": ["target {kg} kg", "目標 {kg} 公斤"],
    "target.range": ["target {low}-{high} %", "目標 {low}-{high} %"],
    "target.normalUnder": ["normal is under {max}", "正常值低於 {max}"],
    "target.noSessions": ["no sessions logged yet", "仲未記錄任何健身節數"],
    "target.sessionsLogged": ["{n} sessions logged so far", "{n} 節已記錄"],
    "target.logWaist": ["log it in Notion: Body", "在 Notion「Body」記錄"],
    "target.loggedOn": ["logged {date}", "記錄於 {date}"],
    "target.atRate": ["at the current 4-week rate", "按最近四星期的速度"],
    "target.notEnough": ["not enough data", "數據不足"],
    "target.onTrend": ["on trend {date}", "按趨勢約 {date} 達成"],
    "target.flat": ["trend is flat", "趨勢平穩"],
    "target.done": ["done", "已達成"],

    "body.weight": ["Body weight", "體重"],
    "body.fatAndWaist": ["Body fat and waist", "體脂與腰圍"],
    "body.weightNote": ["Every weigh-in from the scale, with the 70 kg target as a dashed line.", "磅重的每一次記錄，虛線為 70 公斤目標。"],
    "body.fatNote": ["Scale body fat, plus waist measurements you log yourself in Notion.", "磅重嘅體脂讀數，加上你在 Notion 自行記錄的腰圍。"],
    "body.latest": ["Latest", "最新"],
    "body.avg7": ["7-day average", "七日平均"],
    "body.changeWeek": ["Change this week", "本週變化"],
    "body.rate4": ["4-week rate", "四星期速度"],
    "body.totalChange": ["Total change", "總變化"],
    "body.bodyFat": ["Body fat", "體脂"],
    "body.waitingWeighIn": ["waiting for a weigh-in", "等待磅重記錄"],
    "body.readings": ["{n} readings", "{n} 次讀數"],
    "body.sameTime": ["same time weigh-ins", "同一時間磅重"],
    "body.needMore": ["need more readings", "需要更多讀數"],
    "body.onTrack": ["on track for the target", "符合達標進度"],
    "body.slower": ["slower than the plan", "比計劃慢"],
    "body.sinceStart": ["since {kg} kg on 20 Sep", "由 9 月 20 日的 {kg} 公斤起"],
    "body.waitingScale": ["waiting for scale data", "等待磅重數據"],
    "body.noWaist": ["No waist measurements yet", "仲未有腰圍記錄"],
    "body.noWaistHelp": ["Add a row to the Body database in Notion with the Waist cm field filled in, and it appears here after the next sync.", "在 Notion「Body」資料庫新增一列並填上腰圍（cm），下次同步後就會顯示在這裡。"],
    "body.kg": ["{v} kg", "{v} 公斤"],
    "body.percent": ["{v}% body fat", "{v}% 體脂"],
    "body.cm": ["{v} cm waist", "{v} cm 腰圍"],

    "gym.title": ["Gym", "健身"],
    "gym.note": ["Sessions per week from the Notion logbook. The dashed line is the weekly goal.", "每週節數來自 Notion 記錄簿，虛線為每週目標。"],
    "gym.recent": ["Recent sessions", "最近訓練"],
    "gym.recentNote": ["Session rows plus any main lifts you logged alongside them.", "訓練列，加上同日記錄的主要動作。"],
    "gym.emptyTitle": ["Waiting for the first gym session", "等待第一節健身記錄"],
    "gym.emptyHelp": ["Log it in the Gym Sessions database in Notion (date, type, duration, RPE), or train with the Strong app and import its CSV with tools/import-strong.mjs. The chart fills in after the next sync.", "在 Notion「Gym Sessions」記錄（日期、類型、時長、RPE），或者用 Strong app 記錄之後跑 tools/import-strong.mjs 匯入。下次同步後圖表就會更新。"],
    "gym.emptyTable": ["No sessions logged", "仲未記錄訓練"],
    "gym.emptyTableHelp": ["Once you log three sessions a week, this panel shows weekly volume, the A/B/C balance and your main lifts.", "當你每週記錄三節，這裡會顯示每週訓練量、A/B/C 分佈同主要動作。"],
    "gym.sessionsThisWeek": ["Sessions this week", "本週節數"],
    "gym.toNow": ["{date} to now", "{date} 至今"],
    "gym.last14": ["Last 14 days", "最近 14 日"],
    "gym.minutes": ["{n} minutes", "{n} 分鐘"],
    "gym.split": ["Split", "分佈"],
    "gym.splitValue": ["A {a} / B {b} / C {c}", "A {a} / B {b} / C {c}"],
    "gym.splitNote": ["aim for balance across the week", "盡量一週內平均分佈"],
    "gym.avgRpe": ["Average RPE", "平均 RPE"],
    "gym.rpeScale": ["1 to 10 scale", "1 至 10 分"],
    "gym.heaviest": ["Heaviest set", "最重一組"],
    "gym.heaviestNote": ["{exercise} on {date}", "{date} 的 {exercise}"],
    "gym.heaviestEmpty": ["log sets, reps and weight", "記錄組數、次數同重量"],
    "gym.liftEntries": ["Lift entries", "動作記錄"],
    "gym.liftEntriesNote": ["main lifts only, as planned", "只記主要動作，如計劃所定"],
    "gym.weekOf": ["Week of {date}", "{date} 該週"],
    "gym.sessionsCount": ["{n} sessions", "{n} 節"],
    "gym.volume": ["{v} kg volume", "總量 {v} 公斤"],
    "gym.col.date": ["Date", "日期"],
    "gym.col.type": ["Type", "類型"],
    "gym.col.duration": ["Duration", "時長"],
    "gym.col.rpe": ["RPE", "RPE"],
    "gym.col.lifts": ["Lifts", "動作"],
    "gym.min": ["{n} min", "{n} 分鐘"],

    "run.title": ["Running", "跑步"],
    "run.note": ["Kilometres of running per week, straight from Apple Health workouts.", "每週跑步公里數，直接來自 Apple Health 的訓練記錄。"],
    "run.paceTitle": ["Pace, last 12 runs", "最近 12 次跑步配速"],
    "run.paceNote": ["Minutes per kilometre. Lower is faster.", "每公里所需分鐘，數字越低越快。"],
    "run.planTitle": ["Where you are in the plan", "計劃進度"],
    "run.planNote": ["The ten-week walk-run progression, with the current week highlighted.", "十星期跑走進程，現時星期以底色標示。"],
    "run.recent": ["Recent runs", "最近跑步"],
    "run.runs8": ["Runs in 8 weeks", "八星期內跑步次數"],
    "run.plusWalks": ["plus {n} recorded walks", "另有 {n} 次步行記錄"],
    "run.distance": ["Distance", "距離"],
    "run.distanceNote": ["last 8 weeks of running", "最近八星期跑步"],
    "run.longest": ["Longest run", "最長一次"],
    "run.avgPace": ["Average pace", "平均配速"],
    "run.avgPaceNote": ["your last 12 runs", "最近 12 次跑步"],
    "run.planWeek": ["Plan week", "計劃週數"],
    "run.planWeekValue": ["Week {n} of 10", "第 {n} / 10 週"],
    "run.planStarted": ["started {date}", "由 {date} 開始"],
    "run.thisWeek": ["This week's runs", "本週跑步"],
    "run.thisWeekValue": ["{n} / 3", "{n} / 3"],
    "run.thisWeekNote": ["Tuesday, Thursday, Sunday", "星期二、四、日"],
    "run.paceEmpty": ["No pacing data yet", "暫無配速數據"],
    "run.paceEmptyHelp": ["Pace appears once you log a run longer than a few hundred metres.", "當你跑超過幾百米，配速就會出現。"],
    "run.noRuns": ["No runs recorded yet", "仲未有跑步記錄"],
    "run.noRunsHelp": ["Apple Health logs runs automatically once you start one on the watch.", "在手錶開始跑步，Apple Health 就會自動記錄。"],
    "run.col.date": ["Date", "日期"],
    "run.col.distance": ["Distance", "距離"],
    "run.col.duration": ["Duration", "時間"],
    "run.col.pace": ["Min/km", "每公里"],
    "run.col.hr": ["Avg HR", "平均心率"],
    "run.col.kcal": ["kcal", "卡路里"],
    "run.km": ["{v} km", "{v} 公里"],
    "run.min": ["{n} min", "{n} 分鐘"],
    "run.runsCount": ["{n} sessions", "{n} 次"],
    "run.planHead1": ["Run 1 (Tue)", "第 1 課（二）"],
    "run.planHead2": ["Run 2 (Thu)", "第 2 課（四）"],
    "run.planHeadSun": ["Sunday", "星期日"],
    "run.planHeadWeek": ["Week", "週"],

    "food.title": ["Meals", "飲食"],
    "food.note": ["Daily totals from the Notion Meals database. Dashed line is the calorie goal.", "每日總數來自 Notion「Meals」資料庫，虛線為卡路里目標。"],
    "food.proteinTitle": ["Protein", "蛋白質"],
    "food.proteinNote": ["Protein is what protects muscle at this deficit.", "在熱量赤字下，蛋白質係保住肌肉的關鍵。"],
    "food.recent": ["Recent days", "最近紀錄"],
    "food.recentNote": ["The last ten logged days, newest first.", "最近十日記錄，最新在最上。"],
    "food.emptyTitle": ["Waiting for the first meal entry", "等待第一筆飲食記錄"],
    "food.emptyHelp": ["Add a row per meal: Date, Meal and Template. Calories and protein come from the template, so there is nothing to calculate. Thirty seconds a day.", "每餐加一列：日期、餐別、模板。卡路里同蛋白質會自動由模板帶入，唔需要自己計。每日三十秒就夠。"],
    "food.kcal7": ["Calories, 7 days", "七日平均卡路里"],
    "food.protein7": ["Protein, 7 days", "七日平均蛋白質"],
    "food.daysLogged": ["Days logged", "已記錄日數"],
    "food.of28": ["{n} of 28", "28 日中有 {n} 日"],
    "food.consistency": ["consistency beats precision", "持續比精準更重要"],
    "food.onTarget": ["On target", "達標比例"],
    "food.onTargetValue": ["{pct}% of logged days", "已記錄日中 {pct}%"],
    "food.onTargetNote": ["{n} of {total}", "{total} 日中有 {n} 日"],
    "food.water7": ["Water, 7 days", "七日平均飲水"],
    "food.waterNote": ["target 2.5-3 L", "目標 2.5-3 公升"],
    "food.trend": ["Trend", "趨勢"],
    "food.trendNote": ["compare against the 4-week average", "與四星期平均比較"],
    "food.holding": ["holding", "保持"],
    "food.watchWeekends": ["watch the weekends", "留意週末"],
    "food.col.date": ["Date", "日期"],
    "food.col.kcal": ["kcal", "卡路里"],
    "food.col.protein": ["Protein g", "蛋白質 g"],
    "food.col.water": ["Water L", "飲水 L"],
    "food.col.onTarget": ["On target", "達標"],
    "food.col.notes": ["Notes", "備註"],
    "food.notLogged": ["not logged", "未記錄"],

    "score.title": ["Daily scoreboard", "每日評分表"],
    "score.note": ["Last 7 days. Waking times and lights-out come from Apple Health sleep; meals and sessions come from Notion.", "最近七日。起床同入睡時間來自 Apple Health 睡眠記錄；飲食同訓練來自 Notion。"],
    "score.day": ["Day", "日期"],
    "score.wake": ["Wake 08:45", "08:45 前起床"],
    "score.steps": ["Steps 10k", "步數 1 萬"],
    "score.protein": ["Protein 150", "蛋白質 150"],
    "score.kcal": ["kcal ≤1900", "卡路里 ≤1900"],
    "score.session": ["Session", "訓練"],
    "score.lights": ["Lights out", "入睡時間"],
    "score.score": ["Score", "得分"],

    "support.title": ["Supporting metrics", "輔助指標"],
    "support.note": ["The recovery signals behind the weight trend. Sleep and resting heart rate explain more than training does.", "體重趨勢背後的恢復訊號。睡眠同靜息心率比訓練更能解釋變化。"],
    "support.restingHr": ["Resting heart rate", "靜息心率"],
    "support.hrv": ["HRV", "心率變異度"],
    "support.vo2": ["VO2 max", "最大攝氧量"],
    "support.sleep": ["Sleep", "睡眠"],
    "support.steps": ["Steps", "步數"],
    "support.exercise": ["Exercise minutes", "運動分鐘"],
    "support.days90": ["{n} days of readings in the last 90 days", "最近 90 日有 {n} 日讀數"],
    "support.days180": ["{n} days of readings in the last 180 days", "最近 180 日有 {n} 日讀數"],
    "support.hours": ["hours", "小時"],

    "range.all": ["All", "全部"],
    "range.1y": ["1y", "一年"],
    "range.90d": ["90d", "90日"],

    "footer.health": ["Apple Health data from {date}", "Apple Health 數據截至 {date}"],
    "footer.synced": ["Notion synced {date} UTC", "Notion 已於 {date} UTC 同步"],
    "footer.notSynced": ["Notion logbook not synced yet", "Notion 記錄簿尚未同步"],
    "footer.notSyncedWhy": ["Notion logbook not synced yet ({why})", "Notion 記錄簿尚未同步（{why}）"],
    "footer.archive": ["Full health archive", "完整健康數據庫"],
    "footer.loadError": ["Could not load the data", "無法載入數據"],
    "footer.loadErrorHelp": ["{message}. The dashboard needs data/progress.json, which is generated by tools/build-data.mjs.", "{message}。此頁需要 data/progress.json，由 tools/build-data.mjs 產生。"],

    "zhPage.title": ["健康數據報告", "Health data report"],
    "zhPage.note": [
      "這一份是完整健康數據庫的中文版本。英文互動版（47 項指標、137 條路線、6 次心電圖）在這裡。",
      "This is the Chinese version of the full health archive. The interactive English version, with all 47 metrics, 137 routes and 6 ECGs, is here."
    ],
    "zhPage.englishLink": ["English interactive archive", "英文互動版"],
    "zhPage.toggleLabel": ["語言", "Language"]
  };

  var MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function readStored(key) {
    try { return window.localStorage.getItem(key); } catch (error) { return null; }
  }
  function writeStored(key, value) {
    try { window.localStorage.setItem(key, value); } catch (error) { /* ignore */ }
  }

  var stored = readStored("health-lang");
  var browser = (navigator.language || "en").toLowerCase();
  var lang = stored === "en" || stored === "zh" ? stored : (browser.indexOf("zh") === 0 ? "zh" : "en");
  document.documentElement.lang = lang === "zh" ? "zh-Hant-HK" : "en";

  function t(key, vars) {
    var entry = STRINGS[key];
    var text = entry ? (lang === "zh" ? entry[1] : entry[0]) : key;
    if (vars) {
      Object.keys(vars).forEach(function (name) {
        text = text.split("{" + name + "}").join(vars[name]);
      });
    }
    return text;
  }

  /* Date formatting: "13 Sep 2026" in English, "2026年9月13日" in Chinese. */
  function date(iso, short) {
    if (!iso) return "";
    var year = iso.slice(0, 4), month = +iso.slice(5, 7), day = +iso.slice(8, 10);
    if (lang === "zh") {
      return short ? month + "月" + day + "日" : year + "年" + month + "月" + day + "日";
    }
    return short ? day + " " + MONTHS_EN[month - 1] : day + " " + MONTHS_EN[month - 1] + " " + year;
  }

  function setLang(next) {
    lang = next === "zh" ? "zh" : "en";
    writeStored("health-lang", lang);
    document.documentElement.lang = lang === "zh" ? "zh-Hant-HK" : "en";
    document.dispatchEvent(new CustomEvent("languagechange"));
  }

  /* Renders the EN / 中文 control into a container. */
  function mountToggle(container) {
    if (!container) return;
    container.innerHTML =
      "<button type=\"button\" data-lang=\"en\" aria-pressed=\"" + (lang === "en") + "\">EN</button>" +
      "<button type=\"button\" data-lang=\"zh\" aria-pressed=\"" + (lang === "zh") + "\">中文</button>";
    container.querySelectorAll("button").forEach(function (button) {
      button.classList.toggle("is-on", button.dataset.lang === lang);
      button.addEventListener("click", function () {
        if (button.dataset.lang === lang) return;
        setLang(button.dataset.lang);
        mountToggle(container);
      });
    });
  }

  window.I18N = {
    get lang() { return lang; },
    t: t,
    date: date,
    setLang: setLang,
    mountToggle: mountToggle,
    strings: STRINGS
  };
})();
