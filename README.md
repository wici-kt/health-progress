# Health progress

A public progress log for a body composition goal: 79.3 kg to 70 kg (BMI under 25 and
body fat around 16 to 17 percent), tracked from Apple Health and a Notion logbook.

**Live site:** https://health-progress-ten.vercel.app

Deploys automatically on every push to `main`. Deploy steps for a fresh setup: `docs/deploy-vercel.md`.

| Page | What it shows |
| --- | --- |
| `/` | Targets, body weight and body fat, gym sessions, running, meals, the daily scoreboard and supporting recovery metrics. Switch between English and Traditional Chinese in the header |
| `/form/` | A fill-in form for meals, gym sessions and body measurements. Needs the Vercel deployment, because it posts to `/api/notion` (see `docs/deploy-vercel.md`) |
| `/archive/` | The full Apple Health report in English: 47 metrics, 174 workouts, 137 routes, 6 ECGs |
| `/zh/archive/` | The same report as a written Traditional Chinese document, generated from `archive/report-zh-hk.md` |

Language: the choice in the header is remembered in the browser and defaults to the
browser language. The dashboard is fully bilingual; the interactive archive is English
and pairs with the Chinese report page, linked from the language switch on both.

## Where the data comes from

| Source | Supplies | How it updates |
| --- | --- | --- |
| Apple Health export | weight, body fat, BMI, sleep, resting heart rate, HRV, VO2 max, steps, every run and walk | `node tools/refresh-health.mjs ~/Downloads/export.zip`, then commit and push |
| Notion logbook | gym sessions, main lifts, meals (one row per meal, calories auto-filled from the template), waist measurements | **live**: the dashboard reads `/api/data` on Vercel, cached for one minute. The nightly Action also commits a static fallback |
| Strong app (optional) | per-set gym detail | `node tools/import-strong.mjs export.csv`, then commit |

## Logging, the short version

| What | Where | How long |
| --- | --- | --- |
| Meals | Notion → Meals: Date, Meal, Template (calories and protein come from the template) | 30 seconds a day |
| Gym | Notion → Gym Sessions (date, type, duration, RPE) and Gym Lifts for main lifts, or the Strong app | 20 seconds a session |
| Waist | Notion → Body: Date, Waist cm | every 2-4 weeks |
| Weight, body fat, sleep, runs | Apple Health, refreshed with `node tools/refresh-health.mjs ~/Downloads/export.zip` | when you re-export |

Notion also offers a Form view (Meals → the view menu → New view → Form → Copy link to view),
which gives you a plain web form to fill on your phone instead of editing the table.

### Hosting

Vercel hosts the whole thing: the static pages, `/api/data` (live Notion reads),
`/api/notion` (form writes) and the `/form/` page. Every push to `main` redeploys.
The Notion token lives only in Vercel environment variables.

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
