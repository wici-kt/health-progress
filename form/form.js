/* Logbook form. Posts to /api/notion, which runs as a Vercel function and
   writes the row into Notion with the server-side token. */

(function () {
  "use strict";

  var TEMPLATES = [
    "早餐A 蛋+多士+奶", "早餐B 乳酪+燕麥+香蕉", "早餐C 茶葉蛋+豆漿+包",
    "午餐A 切雞飯 少飯走汁", "午餐B 雞胸+糙米+菜", "午餐C 鮮茄牛肉飯 少飯", "午餐D 便利店",
    "晚餐A 蒸魚+飯+菜", "晚餐B 雞或牛+番薯+菜", "晚餐C 米線 少油", "晚餐D 豆腐+蝦+菜",
    "小食 豆漿+香蕉", "乳清蛋白", "外食 估算"
  ];
  var EXERCISES = [
    "Goblet Squat", "Dumbbell Bench Press", "Lat Pulldown", "Romanian Deadlift", "Plank",
    "Trap Bar Deadlift", "Incline Dumbbell Press", "Seated Cable Row", "Bulgarian Split Squat",
    "Hanging Knee Raise", "Dumbbell Floor Press", "Assisted Pull Up", "One-Arm Dumbbell Row",
    "Hip Thrust", "Farmer's Walk", "Face Pull"
  ];

  var tab = "meal";
  var $ = function (id) { return document.getElementById(id); };

  function readStored(key) {
    try { return window.localStorage.getItem(key); } catch (error) { return null; }
  }
  function writeStored(key, value) {
    try { window.localStorage.setItem(key, value); } catch (error) { /* ignore */ }
  }

  function fillSelect(element, values) {
    element.innerHTML = values.map(function (value) {
      return "<option value=\"" + value + "\">" + value + "</option>";
    }).join("");
  }

  function selectTab(next) {
    tab = next;
    document.querySelectorAll("[data-tab]").forEach(function (button) {
      button.classList.toggle("is-on", button.dataset.tab === tab);
    });
    document.querySelectorAll("[data-panel]").forEach(function (panel) {
      panel.hidden = panel.dataset.panel !== tab;
    });
    $("status").textContent = "";
    $("status").className = "status";
  }

  function payload() {
    var date = $("date").value || new Date().toISOString().slice(0, 10);
    if (tab === "meal") {
      return {
        kind: "meal", date: date, meal: $("meal").value, template: $("template").value,
        notes: $("notes").value.trim() || undefined
      };
    }
    if (tab === "gym") {
      return {
        kind: "gym", date: date, type: $("type").value,
        durationMin: $("durationMin").value, rpe: $("rpe").value,
        exercise: $("exercise").value || undefined,
        sets: $("sets").value, reps: $("reps").value, weightKg: $("weightKg").value,
        notes: $("gymNotes").value.trim() || undefined
      };
    }
    return {
      kind: "body", date: date,
      waistCm: $("waistCm").value, weightKg: $("weightKgBody").value,
      bodyFatPct: $("bodyFatPct").value,
      notes: $("bodyNotes").value.trim() || undefined
    };
  }

  function submit(event) {
    event.preventDefault();
    var button = $("submit");
    var status = $("status");
    var passcode = $("passcode").value.trim();
    if (passcode) writeStored("health-passcode", passcode);

    button.disabled = true;
    status.className = "status";
    status.textContent = "儲存中…";

    fetch("/api/notion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ passcode: passcode }, payload()))
    })
      .then(function (response) {
        /* GitHub Pages answers POST to an unknown path with 405/404: the static
           copy has no API, so say that plainly instead of showing a status code. */
        if (response.status === 405 || response.status === 404) {
          return {
            ok: false,
            error: "這頁要在 Vercel 版本才有 /api/notion，GitHub Pages 只有靜態檔案。請用 Vercel 網址填表（見 docs/deploy-vercel.md）"
          };
        }
        return response.json().catch(function () { return { ok: false, error: "HTTP " + response.status }; });
      })
      .then(function (result) {
        if (result.ok) {
          status.className = "status ok";
          status.textContent = "已儲存 ✓ 夜晚同步後會出現在進度頁。";
          if (tab === "gym") { $("exercise").value = ""; $("sets").value = ""; $("reps").value = ""; $("weightKg").value = ""; }
        } else {
          status.className = "status err";
          status.textContent = "儲存失敗：" + (result.error || "未知錯誤") +
            (String(result.error || "").indexOf("passcode") >= 0 ? "（請確認密碼）" : "");
        }
      })
      .catch(function (error) {
        status.className = "status err";
        status.textContent = "無法連線到 /api/notion：" + error.message +
          "。表單要在 Vercel 上運作，GitHub Pages 版本沒有這個 API。";
      })
      .finally(function () { button.disabled = false; });
  }

  document.addEventListener("DOMContentLoaded", function () {
    fillSelect($("template"), TEMPLATES);
    fillSelect($("exercise"), [""].concat(EXERCISES));
    $("date").value = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    var saved = readStored("health-passcode");
    if (saved) $("passcode").value = saved;
    document.querySelectorAll("[data-tab]").forEach(function (button) {
      button.addEventListener("click", function () { selectTab(button.dataset.tab); });
    });
    $("entry").addEventListener("submit", submit);
    if (window.HealthCharts) window.HealthCharts.initTheme();
  });
})();
