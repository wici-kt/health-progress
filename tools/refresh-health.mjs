#!/usr/bin/env node
/**
 * Rebuilds the Apple Health data from a new export.
 *
 *   node tools/refresh-health.mjs ~/Downloads/export.zip
 *
 * Unzips to a temporary folder, runs the extractor, then rebuilds
 * data/archive.json and data/progress.json. The unzipped XML is deleted
 * afterwards, and neither the zip nor the raw extraction is ever committed.
 */

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = process.argv[2];

if (!source || !existsSync(source)) {
  console.error("Usage: node tools/refresh-health.mjs /path/to/export.zip");
  process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), "health-refresh-"));
console.log("unzipping " + source + " to " + work);
try {
  execFileSync("unzip", ["-o", "-q", source, "-d", work], { stdio: "inherit" });
  const extracted = existsSync(join(work, "apple_health_export"))
    ? join(work, "apple_health_export")
    : work;

  console.log("extracting records (about twenty seconds for a two year export)");
  const python = spawnSync("python3", [
    join(ROOT, "tools", "extract_health.py"),
    extracted,
    "--out",
    join(ROOT, "data", "archive.raw.json")
  ], { stdio: "inherit" });
  if (python.status !== 0) throw new Error("extractor failed");

  console.log("building the site data files");
  execFileSync("node", [join(ROOT, "tools", "build-data.mjs")], { stdio: "inherit" });
  console.log("\nDone. data/archive.json and data/progress.json are up to date.");
  console.log("Commit and push them to publish: git add data && git commit -m \"Refresh health data\" && git push");
} finally {
  rmSync(work, { recursive: true, force: true });
}
