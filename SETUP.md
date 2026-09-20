# Setup: five steps only you can do

Everything on this page involves your accounts, so it has to be done by you. It takes
about ten minutes, once.

## 1. Create a Notion integration

1. Open https://www.notion.so/profile/integrations
2. Choose **New integration**, name it `health-progress`, pick your own workspace, and save.
3. Copy the token it shows (it starts with `ntn_` or `secret_`). Treat it like a password.

## 2. Give the integration a home for the databases

1. In Notion, open (or create) a page, for example `Health logbook`.
2. Click the `...` menu at the top right, then **Connections**, then add your
   `health-progress` integration.
3. Copy the page id from its URL: it is the 32 character string before the `?`.
   `notion.so/Health-logbook-1a2b3c4d5e6f7890abcdef1234567890` → `1a2b3c4d5e6f7890abcdef1234567890`

## 3. Create the four databases

In a terminal, from this folder:

```
NOTION_TOKEN=paste-your-token-here node tools/setup-notion.mjs <the page id>
```

If you would rather not paste the token into a command, list the pages first with
`NOTION_TOKEN=... node tools/setup-notion.mjs` and then run the command above.

The script creates `Gym Sessions`, `Gym Lifts`, `Meals` and `Body` with the right fields,
and writes their ids into `config.json`. Running it again reuses them instead of creating
duplicates.

## 4. Put the token in GitHub

1. Open https://github.com/wici-kt/health-progress/settings/secrets/actions
2. **New repository secret**, name it exactly `NOTION_TOKEN`, paste the token, save.

This is what lets the nightly sync read your logbook. The token never goes into the code.

## 5. Log your first rows

In Notion, add one row to each database:

| Database | What to fill in | How long |
| --- | --- | --- |
| Gym Sessions | Date, Type A/B/C, Duration min, RPE | 20 seconds |
| Gym Lifts | Date, Exercise, Sets, Reps, Weight kg (main lifts only) | 1 minute |
| Meals | Date, Calories, Protein g, Water L, On track | 30 seconds |
| Body | Date, Waist cm (weight and body fat are optional, Apple Health has them) | 20 seconds |

Then either wait for the 22:00 sync or run it immediately: GitHub → **Actions** →
**Sync Notion logbook** → **Run workflow**.

## Checking it worked

- The dashboard footer shows the last sync time.
- Empty panels stay as "waiting for the first entry" until the relevant rows exist.
- If the sync fails, the previous data stays in place and the Action run shows the error.

## Refreshing the Apple Health side

Re-export from the iPhone (Health → profile → Export All Health Data), then:

```
node tools/refresh-health.mjs ~/Downloads/export.zip
git add data && git commit -m "Refresh health data" && git push
```
