#!/usr/bin/env node
/**
 * Builds zh/archive/index.html from archive/report-zh-hk.md, so the Chinese
 * version of the health report is a real page on the site rather than a raw
 * markdown file.
 *
 * Run: node tools/build-zh-page.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "archive", "report-zh-hk.md");
const OUT_DIR = join(ROOT, "zh", "archive");
const OUT = join(OUT_DIR, "index.html");

if (!existsSync(SOURCE)) {
  console.error("Missing " + SOURCE);
  process.exit(1);
}

const inline = (text) => text
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
  .replace(/`([^`]+)`/g, "<code>$1</code>");

function convert(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let listType = null;
  let tableBuffer = [];

  const closeList = () => { if (listType) { html.push("</" + listType + ">"); listType = null; } };
  const flushTable = () => {
    if (!tableBuffer.length) return;
    const rows = tableBuffer.map((line) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()));
    const body = rows.filter((row) => !row.every((cell) => /^-{2,}$/.test(cell) || cell === ""));
    const head = body.shift() || [];
    html.push("<table><thead><tr>" + head.map((cell) => "<th>" + inline(cell) + "</th>").join("") + "</tr></thead><tbody>");
    body.forEach((row) => {
      html.push("<tr>" + row.map((cell) => "<td>" + inline(cell) + "</td>").join("") + "</tr>");
    });
    html.push("</tbody></table>");
    tableBuffer = [];
  };

  lines.forEach((raw) => {
    const line = raw.trimEnd();
    if (/^\|/.test(line)) { tableBuffer.push(line); return; }
    flushTable();

    if (!line.trim()) { closeList(); return; }
    if (/^---+$/.test(line.trim())) { closeList(); html.push("<hr>"); return; }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      return;
    }

    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      if (listType !== "ul") { closeList(); html.push("<ul>"); listType = "ul"; }
      html.push("<li>" + inline(bullet[1]) + "</li>");
      return;
    }

    const numbered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (numbered) {
      if (listType !== "ol") { closeList(); html.push("<ol>"); listType = "ol"; }
      html.push("<li>" + inline(numbered[1]) + "</li>");
      return;
    }

    closeList();
    html.push("<p>" + inline(line) + "</p>");
  });

  flushTable();
  closeList();
  return html.join("\n");
}

const markdown = readFileSync(SOURCE, "utf8");
const body = convert(markdown);
const built = new Date().toISOString().slice(0, 10);

const page = `<!doctype html>
<html lang="zh-Hant-HK">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>健康數據報告</title>
<meta name="description" content="Apple Health 數據分析報告（繁體中文，香港）。">
<link rel="icon" href="data:,">
<link rel="stylesheet" href="../../assets/styles.css?v=2">
</head>
<body>

<header class="topbar">
  <div class="topbar-inner">
    <a class="wordmark" href="../../">
      <span class="wordmark-mark" aria-hidden="true"></span>
      <span>健康進度</span>
    </a>
    <nav class="nav" aria-label="網站">
      <a href="../../">進度總覽</a>
      <a href="./" class="is-on">健康數據庫</a>
    </nav>
    <div class="topbar-controls">
      <div class="lang" role="group" aria-label="語言">
        <a href="../../archive/">EN</a>
        <a href="./" class="is-on">中文</a>
      </div>
      <button type="button" class="theme-toggle" id="theme-toggle" aria-label="切換主題">
        <span class="theme-toggle-label">主題</span>
        <span class="theme-toggle-value" id="theme-value">自動</span>
      </button>
    </div>
  </div>
</header>

<main class="page-body">
  <div class="callout">
    這一頁是健康數據庫的中文報告版本。想睇全部 47 項指標、137 條路線同 6 次心電圖的互動版，
    請去 <a href="../../archive/">英文互動版</a>；想睇每日進度，去 <a href="../../">進度總覽</a>。
  </div>
  <article class="prose">
${body}
  </article>
</main>

<footer class="footer">
  <p>報告由 1,847,799 個 HealthKit 記錄分析而成。<span id="built">${built}</span></p>
</footer>

<div class="tip" id="tip" hidden></div>
<script src="../../assets/i18n.js?v=2"></script>
<script src="../../assets/chart.js?v=2"></script>
<script>
  // The Chinese page is a static document; the language switch is links, so
  // only the theme control needs wiring. The dashboard preference is left
  // untouched, so visiting this page does not change the other pages.
  (function () {
    HealthCharts.initTheme();
    var label = document.getElementById("theme-value");
    function paint() {
      var mode = HealthCharts.themeMode();
      label.textContent = mode === "auto" ? "自動" : mode === "dark" ? "深色" : "淺色";
    }
    document.addEventListener("themechange", paint);
    paint();
  })();
</script>
</body>
</html>
`;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, page);
console.log("wrote zh/archive/index.html (" + Math.round(page.length / 1024) + " kB) from " + SOURCE);
