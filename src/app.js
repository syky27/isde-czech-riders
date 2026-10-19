import { GROUPS, EDITIONS, DEFAULT_EDITION, editionByYear, urlsFor, getJson } from './api.js';
import {
  ALL,
  FINAL,
  TEAM_TYPES,
  latestDay,
  lastCompletedDay,
  dayComplete,
  teamsByNumber,
  testColumns,
  dayRows,
  bestPerTest,
  retiredMap,
  rankWithin,
  overallFromDays,
  nationOptions,
  teamStandings,
  stageCounts,
  defaultStage,
  teamsOfNation,
  riderDetail,
  finalStanding,
  finalRows,
  finalRanks,
} from './model.js';
import { nationName } from './nations.js';
import {
  renderDays,
  renderViews,
  renderGroups,
  renderTeams,
  renderFinal,
  renderStatus,
  renderNation,
  renderTitle,
  renderRider,
  renderPdfLinks,
  renderEdition,
  setEditionParam,
  hashFor,
} from './render.js';

const DEFAULT_NATION = 'CZE';
const DAY_REFRESH_MS = 60_000;
const OVERALL_REFRESH_MS = 5 * 60_000;
const RETRY_MS = 60_000;
const lang = navigator.language || 'en';

const state = {
  edition: DEFAULT_EDITION,
  view: 'riders', // 'riders' | 'teams' | 'rider'
  listView: 'riders', // the last list view, where the rider page's back link goes
  nation: DEFAULT_NATION,
  day: 1,
  latestDay: 1,
  programs: {},
  teams: {},
  entries: {}, // cod → entry-list riders
  tests: {}, // cod → day → risultatiprove feed
  dayClass: {}, // cod → day → clasgiornata feed
  stageClass: {}, // cod → day → test code → clasps feed (standing after that test)
  teamFeeds: {}, // cod → day → test code → team-clasps feed
  teamStage: {}, // team category → test code chosen by the viewer (reset per day)
  overall: {}, // cod → num → cumulative standing
  standing: {}, // cod → num → finalStanding() of fetched riders (live mode)
  final: {}, // cod → archived final classification (riders[] + generatedAt)
  rider: null, // { cod, num } of the rider panel, or null
  riderFeed: null, // { key, feed } for the open rider
  riderError: null,
  updatedAt: null,
  error: null,
  loading: true,
};

let urls = urlsFor(DEFAULT_EDITION);
const fetchJson = (url) => getJson(url, { live: !state.edition.archived });

const els = {
  title: document.getElementById('title'),
  subtitle: document.getElementById('subtitle'),
  edition: document.getElementById('edition'),
  nation: document.getElementById('nation'),
  views: document.getElementById('views'),
  days: document.getElementById('days'),
  status: document.getElementById('status'),
  main: document.getElementById('main'),
  pdf: document.getElementById('pdf-links'),
  legendRiders: document.getElementById('legend-riders'),
  legendTeams: document.getElementById('legend-teams'),
  legendRider: document.getElementById('legend-rider'),
  legendFinal: document.getElementById('legend-final'),
};

function parseHash() {
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  const nation = (params.get('nation') ?? '').toUpperCase();
  const dayParam = params.get('day');
  const day = dayParam === FINAL ? FINAL : Number(dayParam);
  const riderMatch = /^(ISDE\d+)-(\d+)$/.exec(params.get('rider') ?? '');
  const rider = riderMatch ? { cod: riderMatch[1], num: riderMatch[2] } : null;
  const requested = params.get('view');
  const view = requested === 'rider' && rider ? 'rider' : requested === 'teams' ? 'teams' : 'riders';
  return {
    edition: editionByYear(params.get('edition')) ?? DEFAULT_EDITION,
    view,
    nation: nation || null,
    day: day === FINAL || (Number.isInteger(day) && day >= 1 && day <= 6) ? day : null,
    rider: view === 'rider' ? rider : null,
  };
}

const riderKey = (r) => (r ? `${r.cod}-${r.num}` : null);
const riderHref = (cod, num) => hashFor(state.nation, state.day, 'rider', `${cod}-${num}`);

/** The day whose feeds the lists use; the Final tab shows day 6 in the Teams view. */
const feedDay = () => (state.day === FINAL ? 6 : state.day);

const eventComplete = () => GROUPS.every((g) => dayComplete(state.programs[g.cod], 6));

/** Last finished day of an event, for reading the per-rider feed. */
const throughDay = (cod) => lastCompletedDay(state.programs[cod]);

function dayState() {
  if (state.day === FINAL) return eventComplete() ? 'final' : 'live';
  if (state.day > state.latestDay) return 'future';
  return GROUPS.every((g) => dayComplete(state.programs[g.cod], state.day)) ? 'final' : 'live';
}

const options = () => nationOptions(GROUPS.map((g) => ({ data: { iscritti: state.entries[g.cod] ?? [] } })));

/** Race numbers of the selected nation in a group; empty for ALL (no per-rider feeds then). */
function numbersFor(cod) {
  if (state.nation === ALL) return [];
  const entry = state.entries[cod];
  if (entry?.length) return entry.filter((r) => r.naz === state.nation).map((r) => r.id);
  const feed = state.tests[cod]?.[state.latestDay];
  return feed ? dayRows(feed, { nation: state.nation }).map((r) => r.num) : [];
}

/**
 * Cumulative standing of one rider. The per-rider feed only lists finished days from
 * day 2 on; until then (and while day 2 is being ridden) the overall standing is the
 * day 1 classification, taken from the day 1 results feed.
 */
function overallFor(cod, row, day1Rows) {
  const fetched = state.overall[cod] && row.num in state.overall[cod];
  const o = state.overall[cod]?.[row.num];
  if (o) return { ...o, inProgress: !dayComplete(state.programs[cod], o.afterDay) };
  if (!fetched && state.latestDay > 1) return null; // not loaded yet
  const r = day1Rows[row.num];
  if (!r || !r.started) return null;
  return { pos: r.dayPos, time: r.dayTime, afterDay: 1, inProgress: !dayComplete(state.programs[cod], 1) };
}

function paintFinal(nationLabel) {
  const groups = GROUPS.map((g) => {
    const archived = state.final[g.cod]?.riders;
    const live = state.standing[g.cod] ? Object.values(state.standing[g.cod]) : null;
    const riders = archived ?? live;
    if (!riders) return { label: g.label, loaded: false, rows: [] };
    const ranks = finalRanks(riders);
    const rows = finalRows(riders, { nation: state.nation }).map((r) => ({
      ...r,
      cod: g.cod,
      team: r.team ?? state.teams[g.cod]?.[r.num]?.team ?? '',
      ...(ranks[r.num] ?? {}),
    }));
    return { label: g.label, loaded: true, rows };
  });
  const loaded = groups.some((g) => g.loaded);
  renderFinal(els.main, {
    groups,
    days: [1, 2, 3, 4, 5, 6],
    nation: state.nation,
    nationLabel,
    complete: eventComplete(),
    riderHref,
    showFlags: state.nation === ALL,
  });
  const note =
    !state.edition.archived && state.nation === ALL && !GROUPS.some((g) => state.final[g.cod])
      ? 'The cumulative classification is shown per nation while the event is running.'
      : '';
  return { hasData: loaded, note };
}

function paintRiders(nationLabel) {
  const showOverall = state.nation !== ALL;
  const groups = GROUPS.map((g) => {
    const feed = state.tests[g.cod]?.[state.day];
    const cols = feed ? testColumns(feed) : [];
    const rows = feed ? dayRows(feed, { teams: state.teams[g.cod], nation: state.nation }) : [];
    const day1Feed = state.tests[g.cod]?.[1];
    const day1Rows =
      state.day === 1
        ? Object.fromEntries(rows.map((r) => [r.num, r]))
        : Object.fromEntries((day1Feed ? dayRows(day1Feed, { nation: state.nation }) : []).map((r) => [r.num, r]));
    const overall = showOverall ? Object.fromEntries(rows.map((r) => [r.num, overallFor(g.cod, r, day1Rows)])) : {};
    const stages = state.stageClass[g.cod]?.[state.day] ?? {};
    const ranks = {};
    const rankCache = {};
    for (const row of rows) {
      if (!row.lastPs || !stages[row.lastPs]) continue;
      rankCache[row.lastPs] ??= rankWithin(stages[row.lastPs], { nation: state.nation });
      ranks[row.num] = rankCache[row.lastPs][row.num];
    }
    return {
      cod: g.cod,
      label: g.label,
      day: state.day,
      loaded: Boolean(feed),
      fieldSize: feed?.data?.result?.length ?? 0,
      cols,
      rows,
      best: bestPerTest(rows, cols),
      retired: retiredMap(state.dayClass[g.cod]?.[state.day]),
      overall,
      ranks,
    };
  });
  renderGroups(els.main, groups, { showOverall, showFlags: state.nation === ALL, nationLabel, riderHref });
  return {
    hasData: groups.some((g) => g.loaded),
    note: showOverall ? '' : 'Cumulative standings are shown per nation.',
  };
}

function paintTeams(nationLabel) {
  const day = feedDay();
  const loaded = GROUPS.some((g) => state.teamFeeds[g.cod]?.[day]);
  const sections = [];
  const selectedStandings = {};
  const selectedStage = {};
  for (const { code: type, name } of TEAM_TYPES) {
    // Each category lives in one of the two events; take the first that has teams of it.
    let found = null;
    for (const g of GROUPS) {
      const feeds = state.teamFeeds[g.cod]?.[day];
      if (!feeds) continue;
      const counts = stageCounts(feeds, type);
      const max = Math.max(0, ...counts.map((c) => c.count));
      if (max) {
        found = { cod: g.cod, feeds, counts, max };
        break;
      }
    }
    if (!found) continue;
    const nameByCode = Object.fromEntries(testColumns(state.tests[found.cod]?.[day]).map((c) => [c.code, c.name]));
    const chosen = state.teamStage[type];
    const selectedCode = chosen && found.counts.find((c) => c.code === chosen)?.count ? chosen : defaultStage(found.feeds, type);
    const rows = teamStandings(found.feeds[selectedCode])[type] ?? [];
    selectedStandings[type] = rows;
    selectedStage[type] = selectedCode;
    sections.push({
      type,
      name,
      cod: found.cod,
      retired: retiredMap(state.dayClass[found.cod]?.[day]),
      max: found.max,
      rows,
      stages: found.counts.map((c) => ({ code: c.code, name: nameByCode[c.code] ?? c.code, count: c.count, selected: c.code === selectedCode })),
    });
  }
  const typeName = Object.fromEntries(TEAM_TYPES.map((t) => [t.code, t.name]));
  const summary = teamsOfNation(selectedStandings, state.nation).map((t) => ({ ...t, typeName: typeName[t.type], stage: selectedStage[t.type] }));
  renderTeams(els.main, { sections, summary, nation: state.nation, nationLabel, day, loaded, riderHref });
  return { hasData: loaded, note: '' };
}

function paint() {
  const nationLabel = state.nation === ALL ? 'all nations' : nationName(state.nation, lang);

  const riderPage = state.view === 'rider';
  renderTitle(els.title, { nation: state.nation, lang });
  // Guarded: a browser may briefly pair a cached older index.html with the new scripts.
  if (els.subtitle) els.subtitle.textContent = `Riders at the FIM International Six Days Enduro ${state.edition.year}, ${state.edition.place}`;
  if (els.edition) renderEdition(els.edition, { editions: EDITIONS, selected: state.edition.year });
  renderNation(els.nation, { options: options(), selected: state.nation, lang });
  renderViews(els.views, { view: state.view, nation: state.nation, day: state.day });
  renderDays(els.days, { day: state.day, latestDay: state.latestDay, nation: state.nation, view: state.view, finalLabel: eventComplete() ? 'Final' : 'Overall' });
  els.nation.closest('.nation').hidden = riderPage;
  if (els.edition) els.edition.closest('.nation').hidden = riderPage;
  els.days.hidden = riderPage;

  const { hasData, note } = riderPage
    ? paintRiderPage()
    : state.view === 'teams'
      ? paintTeams(nationLabel)
      : state.day === FINAL
        ? paintFinal(nationLabel)
        : paintRiders(nationLabel);
  const finalTab = state.view === 'riders' && state.day === FINAL;
  els.legendRiders.hidden = state.view !== 'riders' || finalTab;
  els.legendFinal.hidden = !finalTab;
  els.legendTeams.hidden = state.view !== 'teams';
  els.legendRider.hidden = !riderPage;

  const archivedOn = state.edition.archived ? (GROUPS.map((g) => state.final[g.cod]?.generatedAt).find(Boolean) ?? '').slice(0, 10) || 'file' : '';
  renderStatus(els.status, { loading: state.loading, updatedAt: state.updatedAt, error: state.error, hasData, note, day: state.day, dayState: dayState(), archived: archivedOn });
  renderPdfLinks(els.pdf, { day: feedDay(), links: GROUPS.map((g) => ({ label: g.label, href: urls.pdfPage(g.cod, feedDay()) })) });
  const who = state.nation === ALL ? 'All riders' : nationName(state.nation, lang);
  if (riderPage) {
    const detail = state.riderFeed?.key === riderKey(state.rider) ? riderDetail(state.riderFeed.feed, { throughDay: throughDay(state.rider.cod) }) : null;
    document.title = `${detail ? detail.name : `Rider ${state.rider.num}`}, ISDE ${state.edition.year}`;
  } else {
    const dayLabel = state.day === FINAL ? (eventComplete() ? 'final' : 'overall') : `day ${state.day}`;
    document.title = state.view === 'teams' ? `Team standings, ISDE ${state.edition.year} ${dayLabel}` : `${who}, ISDE ${state.edition.year} ${dayLabel}`;
  }
}

function paintRiderPage() {
  const key = riderKey(state.rider);
  const feed = state.riderFeed?.key === key ? state.riderFeed.feed : null;
  const detail = feed ? riderDetail(feed, { throughDay: throughDay(state.rider.cod) }) : null;
  const team = detail ? state.teams[state.rider.cod]?.[detail.num]?.team ?? '' : '';
  // Out-of-race note from any loaded day of the rider's event.
  const retired = detail
    ? Object.values(state.dayClass[state.rider.cod] ?? {}).map((cg) => retiredMap(cg)[detail.num]).find(Boolean) ?? ''
    : '';
  const lastDay = detail ? Math.max(0, ...Object.keys(detail.overallByDay).map(Number)) : 0;
  const final = lastDay
    ? { ...detail.overallByDay[lastDay], afterDay: lastDay, complete: lastDay === 6 && eventComplete() }
    : null;
  renderRider(els.main, {
    detail,
    team,
    retired,
    final,
    backHref: hashFor(state.nation, state.day, state.listView),
    backLabel: state.listView === 'teams' ? 'Back to teams' : 'Back to riders',
    loading: !feed && !state.riderError,
    error: state.riderError,
  });
  return { hasData: Boolean(feed), note: '' };
}

async function refreshRider() {
  const rider = state.rider;
  if (!rider) return;
  const key = riderKey(rider);
  try {
    const feed = await fetchJson(urls.rider(rider.cod, rider.num));
    if (riderKey(state.rider) !== key) return;
    state.riderFeed = { key, feed };
    state.riderError = null;
  } catch (err) {
    if (riderKey(state.rider) !== key) return;
    state.riderError = err;
    console.warn('Rider feed failed', key, err);
  }
  if (state.view === 'rider') paint();
}

let dayToken = 0;
async function refreshDay() {
  const day = feedDay();
  const { nation, view } = state;
  const token = ++dayToken;
  state.loading = true;
  paint();

  if (state.day === FINAL) {
    await Promise.all(
      GROUPS.map((g) =>
        fetchJson(urls.final(g.cod))
          .then((json) => {
            state.final[g.cod] = json;
          })
          .catch(() => {}), // no archived classification (live event): built from rider feeds instead
      ),
    );
  }

  const results = await Promise.allSettled(
    GROUPS.map(async (g) => {
      const tests = await fetchJson(urls.tests(g.cod, day));
      const dayClass = await fetchJson(urls.dayClass(g.cod, day)).catch(() => null);
      const cols = testColumns(tests);
      // Standing after each test a shown rider has just finished, for category positions and penalties.
      const numeroByCode = Object.fromEntries(cols.map((c) => [c.code, c.numero]));
      const codes = [...new Set(dayRows(tests, { nation }).map((r) => r.lastPs).filter((c) => c && numeroByCode[c]))];
      const stageFeeds = await Promise.all(
        codes.map((code) => fetchJson(urls.stage(g.cod, day, numeroByCode[code])).catch(() => null)),
      );
      const stageClass = Object.fromEntries(codes.map((code, i) => [code, stageFeeds[i]]).filter(([, feed]) => feed));
      // Team standings after every test of the day, only while the Teams view is open.
      let teamFeeds = null;
      if (view === 'teams') {
        const feeds = await Promise.all(cols.map((c) => fetchJson(urls.teams(g.cod, day, c.numero)).catch(() => null)));
        teamFeeds = Object.fromEntries(cols.map((c, i) => [c.code, feeds[i]]));
      }
      return { tests, dayClass, stageClass, teamFeeds };
    }),
  );
  if (token !== dayToken) return; // superseded by a newer request

  let ok = false;
  let error = null;
  results.forEach((res, i) => {
    const { cod } = GROUPS[i];
    if (res.status === 'fulfilled') {
      (state.tests[cod] ??= {})[day] = res.value.tests;
      (state.dayClass[cod] ??= {})[day] = res.value.dayClass;
      (state.stageClass[cod] ??= {})[day] = res.value.stageClass;
      if (res.value.teamFeeds) (state.teamFeeds[cod] ??= {})[day] = res.value.teamFeeds;
      ok = true;
    } else {
      error = res.reason;
      console.warn('Day feed failed', cod, day, res.reason);
    }
  });
  if (ok) state.updatedAt = new Date();
  state.error = error;
  state.loading = false;
  paint();
}

async function refreshOverall() {
  if (state.nation === ALL) return;
  await Promise.all(
    GROUPS.map(async (g) => {
      // The entry list occasionally comes back empty; retry it until it has riders.
      if (!state.entries[g.cod]?.length) await loadEntry(g.cod).catch((err) => console.warn('Entry list failed', g.cod, err));
      // The day 1 classification doubles as the overall standing until day 2 is final.
      if (state.day !== 1) {
        await fetchJson(urls.tests(g.cod, 1))
          .then((feed) => {
            (state.tests[g.cod] ??= {})[1] = feed;
          })
          .catch((err) => console.warn('Day 1 feed failed', g.cod, err));
      }
      const nums = numbersFor(g.cod);
      const settled = await Promise.allSettled(nums.map((n) => fetchJson(urls.rider(g.cod, n))));
      settled.forEach((res, i) => {
        if (res.status === 'fulfilled') {
          (state.overall[g.cod] ??= {})[nums[i]] = overallFromDays(res.value?.data?.days, { throughDay: throughDay(g.cod) });
          const standing = finalStanding(res.value, { throughDay: throughDay(g.cod) });
          if (standing) (state.standing[g.cod] ??= {})[nums[i]] = standing;
        }
      });
    }),
  );
  paint();
}

/** Team names and the rider list of a group; kept only when the feed actually has riders. */
async function loadEntry(cod) {
  const entry = await fetchJson(urls.entrylist(cod));
  const riders = entry?.data?.iscritti ?? [];
  if (!riders.length) return;
  state.teams[cod] = teamsByNumber(entry);
  state.entries[cod] = riders;
}

/** Programs are required; entry lists are optional (team names, nation list, overall standings). */
async function loadStatic() {
  await Promise.all(
    GROUPS.map(async (g) => {
      const [program] = await Promise.all([
        fetchJson(urls.program(g.cod)),
        loadEntry(g.cod).catch((err) => console.warn('Entry list failed', g.cod, err)),
      ]);
      state.programs[g.cod] = program;
    }),
  );
}

/** A nation from the URL that is not in the entry lists falls back to the default, then to ALL. */
function validNation(code) {
  if (code === ALL) return ALL;
  const known = new Set(options().map((o) => o.code));
  if (code && known.has(code)) return code;
  if (!known.size) return code || DEFAULT_NATION; // entry lists missing: trust the URL
  return known.has(DEFAULT_NATION) ? DEFAULT_NATION : ALL;
}

function applyHash() {
  const parsed = parseHash();
  if (parsed.edition !== state.edition) {
    resetEdition(parsed.edition);
    state.nation = parsed.nation ?? state.nation;
    state.view = parsed.view;
    state.listView = parsed.view === 'rider' ? 'riders' : parsed.view;
    state.rider = parsed.rider;
    loadEdition(parsed.day);
    return;
  }
  const { view, nation, day, rider } = parsed;
  const riderChanged = riderKey(rider) !== riderKey(state.rider);
  state.rider = rider;
  if (riderChanged) {
    state.riderError = null;
    state.riderFeed = null;
    if (rider) refreshRider();
  }
  if (view === 'rider' && state.view !== 'rider') window.scrollTo({ top: 0 });
  if (view !== 'rider') state.listView = view;
  const nextNation = validNation(nation ?? state.nation);
  const nextDay = day ?? state.day;
  const nationChanged = nextNation !== state.nation;
  const dayChanged = nextDay !== state.day;
  const viewChanged = view !== state.view;
  state.nation = nextNation;
  state.day = nextDay;
  state.view = view;
  if (dayChanged) state.teamStage = {};
  if (dayChanged || nationChanged || viewChanged) refreshDay();
  if (nationChanged) refreshOverall();
}

/** Switch the feeds to another edition and drop everything loaded for the previous one. */
function resetEdition(edition) {
  state.edition = edition;
  urls = urlsFor(edition);
  setEditionParam(edition === DEFAULT_EDITION ? null : edition.year);
  for (const key of ['programs', 'teams', 'entries', 'tests', 'dayClass', 'stageClass', 'teamFeeds', 'teamStage', 'overall', 'standing', 'final']) {
    state[key] = {};
  }
  state.rider = null;
  state.riderFeed = null;
  state.riderError = null;
  state.updatedAt = null;
  state.error = null;
  state.latestDay = 1;
  state.day = 1;
}

let timersRunning = false;
function startTimers() {
  if (timersRunning) return;
  timersRunning = true;
  setInterval(refreshDay, DAY_REFRESH_MS);
  setInterval(refreshRider, DAY_REFRESH_MS);
  setInterval(refreshOverall, OVERALL_REFRESH_MS);
}

/** Load the programme and entry lists of the current edition, then the requested (or default) day. */
async function loadEdition(requestedDay) {
  const edition = state.edition;
  state.loading = true;
  paint();
  try {
    await loadStatic();
  } catch (err) {
    if (state.edition !== edition) return;
    console.warn('Static feeds failed', err);
    state.error = err;
    state.loading = false;
    paint();
    setTimeout(() => state.edition === edition && loadEdition(requestedDay), RETRY_MS);
    return;
  }
  if (state.edition !== edition) return;
  state.latestDay = Math.max(...GROUPS.map((g) => latestDay(state.programs[g.cod])));
  state.day = requestedDay ?? (eventComplete() ? FINAL : state.latestDay);
  state.nation = validNation(state.nation);

  await refreshDay();
  refreshOverall();
  refreshRider();
  if (!edition.archived) startTimers();
}

async function init() {
  const initial = parseHash();
  resetEdition(initial.edition);
  state.nation = initial.nation ?? DEFAULT_NATION;
  state.view = initial.view;
  state.rider = initial.rider;
  if (initial.view !== 'rider') state.listView = initial.view;
  await loadEdition(initial.day);

  window.addEventListener('hashchange', applyHash);
  els.nation.addEventListener('change', () => {
    location.hash = hashFor(els.nation.value, state.day, state.view);
  });
  els.edition?.addEventListener('change', () => {
    const edition = editionByYear(els.edition.value) ?? DEFAULT_EDITION;
    const prefix = edition === DEFAULT_EDITION ? '' : `edition=${edition.year}&`;
    location.hash = `#${prefix}nation=${encodeURIComponent(state.nation)}`;
  });
  els.main.addEventListener('click', (event) => {
    const button = event.target.closest('button.stage');
    if (!button) return;
    state.teamStage[button.dataset.type] = button.dataset.code;
    paint();
  });
}

init();
