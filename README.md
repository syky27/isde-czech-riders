# Czech riders at the ISDE

A single static page that shows, for the riders of one nation (Czech by default, any nation selectable, or everyone) at the FIM International Six Days Enduro, editions 2026 (Portugal), 2025 (Italy) and 2024 (Spain):

- the time and position in each special test of the selected day,
- the day time, gap and position in the day classification,
- the cumulative overall standing across days.

It reads the same live JSON feeds (Microplus / FICR timing) that power the results iframe on
<https://www.fim-6days.com/info/results>, directly from the browser. No build step, no server code,
no dependencies.

Deep links: `#nation=GBR&day=2`, `#view=teams&nation=CZE&day=1`, `#edition=2025&nation=CZE&day=final`. With "All nations" the cumulative
Overall column is hidden, because it comes from a per-rider feed and fetching it for every rider would
be too much for the provider.

Clicking a rider's name opens the rider's own page with every test of every day (time, position in
the test, standing after it), the day standing and the cumulative overall after each day, from the
per-rider feed. Deep link: `#view=rider&rider=ISDE1-184`.

The Teams view shows the team standings per category (World Trophy, Junior, Women's, Manufacturer's,
Club, Women's Club, Veteran Club). The provider publishes them after each special test with times
cumulative across days, and lists a team only once all its riders have finished that test; each
category therefore opens on the latest test every team has completed, with buttons for later tests.

## Archive

The timing provider keeps an edition online for about a year. `node scripts/snapshot.mjs [EVENT]`
downloads every feed the page uses into `data/<EVENT>/END/…json` (same paths as the API) and builds
`data/<EVENT>/final/<cod>.json`, the final classification derived from the per-rider feeds. Editions
are listed in `EDITIONS` in `src/api.js`; an edition with `archived: true` is read from those files and
never refreshes, a running event has `archived: false` and is read live. The "Final" tab shows the
classification for every rider, with day times and the total. Archived so far: 2026, 2025 and 2024.
The 2024 edition was served from its own host (`wsenduroisde2024.microplustiming.com`), set as `base`
on the edition; 2023 is no longer available from the provider.

For a new edition: add it to `EDITIONS` with `archived: false` (and its `app` host), and after the
event run the snapshot and set `archived: true`.

## Files

| Path | Purpose |
| --- | --- |
| `index.html`, `style.css` | the page |
| `src/api.js` | editions and feed URLs, live or archived |
| `scripts/snapshot.mjs` | archives all feeds and builds the final classification |
| `data/` | the archived feeds, one folder per edition |
| `src/nations.js` | nation codes → names and flags |
| `src/model.js` | pure data transformations, unit-tested |
| `src/render.js` | HTML rendering |
| `src/app.js` | loading, refresh loop, day switching |
| `test/` | tests with real feed samples in `test/fixtures/` |

## Run locally

Any static file server works, for example:

```bash
python3 -m http.server 8765
```

then open <http://localhost:8765/>. Opening `index.html` straight from disk does not work because the
page uses ES modules.

## Tests

```bash
npm test
```

(Node 18 or newer, no packages to install.)

## Host on GitHub Pages

1. Create a repository on GitHub and push this folder to the `main` branch.
2. In the repository go to **Settings → Pages**.
3. Under **Build and deployment** choose **Deploy from a branch**, branch `main`, folder `/ (root)`, and save.
4. After a minute the page is live at `https://<user>.github.io/<repo>/`.

The `.nojekyll` file is already there so GitHub serves the files as they are.

## How the feeds are used

Base URL: `https://apienduro.ficr.it/<EVENT>/END/`, for example `ENDUROISDE2026`

| Feed | Used for |
| --- | --- |
| `get/plus/entrylist/{ISDE1\|ISDE2}` | nation and team of each rider |
| `mpcache-20/get/plus/program/{cod}` | which days have started, which are finished |
| `mpcache-20/get/plus/risultatiprove/{cod}/{day}` | per-test times and positions, day time, day position |
| `mpcache-20/get/plus/clasgiornata/{cod}/{day}` | riders out of the race |
| `mpcache-20/get/plus/clasps/{cod}/{day}/{test}` | standing after a test, for positions within category and penalties |
| `get/plus/resultconc/{cod}/{number}` | cumulative overall standing (one call per shown rider) |
| `mpcache-20/get/plus/team-clasps/{cod}/{day}/{test}` | team standing after a test, cumulative across days |

`ISDE1` is the World Trophy event (World, Junior and Women's Trophy), `ISDE2` the Club teams event.

The day feeds refresh every minute, the per-rider cumulative feed every five minutes.
The provider's cumulative feed lists day `k` under the label `k-1` and has no entry for day 1 alone;
`overallFromDays()` in `src/model.js` corrects for that, and on day 1 the page uses the day
classification as the overall standing.
