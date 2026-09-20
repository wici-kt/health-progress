# Health progress

A public progress log for a body composition goal: 79.3 kg to 70 kg (BMI under 25 and
body fat around 16 to 17 percent), tracked from Apple Health and a Notion logbook.

**Live site:** https://wici-kt.github.io/health-progress/

| Page | What it shows |
| --- | --- |
| `/` | Targets, body weight and body fat, gym sessions, running, meals, the daily scoreboard and supporting recovery metrics |
| `/archive/` | The full Apple Health report: 47 metrics, 174 workouts, 137 routes, 6 ECGs |

## Where the data comes from

| Source | Supplies | How it updates |
| --- | --- | --- |
| Apple Health export | weight, body fat, BMI, sleep, resting heart rate, HRV, VO2 max, steps, every run and walk | `node tools/refresh-health.mjs ~/Downloads/export.zip`, then commit and push |
| Notion logbook | gym sessions, main lifts, daily meal totals, waist measurements | GitHub Action every night at 22:00 Hong Kong time |

## Files

- `data/progress.json` – slim dashboard payload, rebuilt from the export
- `data/archive.json` – full metric set for the archive page, sanitised
- `data/logbook.json` – the Notion rows, rewritten only when they change
- `config.json` – Notion page and data source ids, written by the setup script
- `tools/` – extractor, dashboard builder, Notion setup and sync, local refresh

Both data files under `data/` are generated. Do not edit them by hand.

## Privacy

The repository is public, so the published data is deliberately limited:

- Weight, body fat, sleep, heart rate and meal totals are visible. That is the point of the site.
- Device names in the export (which contained real names) are replaced with neutral labels.
- Name and date of birth from the Health profile are removed.
- Route cards keep the shape of a walk but the GPS track is published as offsets from
  its own start point, so no coordinates, and therefore no home location, are published.
- Raw export files (the 41 MB zip, the 1 GB of unzipped XML, and `data/archive.raw.json`)
  are gitignored and never committed.

## Rebuilding after a new export

```
node tools/refresh-health.mjs ~/Downloads/export.zip
git add data && git commit -m "Refresh health data" && git push
```

## Notion setup

See [SETUP.md](SETUP.md). The short version: create an integration, share one page with
it, run `NOTION_TOKEN=... node tools/setup-notion.mjs <page-id>`, then add the token as
the `NOTION_TOKEN` repository secret.
