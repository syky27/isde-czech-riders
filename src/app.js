import { GROUPS, urls, getJson } from './api.js';
import {
  ALL,
  latestDay,
  dayComplete,
  teamsByNumber,
  testColumns,
  dayRows,
  bestPerTest,
  retiredMap,
  rankWithin,
  overallFromDays,
  nationOptions,
} from './model.js';
import { nationName } from './nations.js';
import { renderDays, renderGroups, renderStatus, renderNation, renderTitle, hashFor } from './render.js';

const DEFAULT_NATION = 'CZE';
const DAY_REFRESH_MS = 60_000;
const OVERALL_REFRESH_MS = 5 * 60_000;
const RETRY_MS = 60_000;
const lang = navigator.language || 'en';

const state = {
  nation: DEFAULT_NATION,
  day: 1,
  latestDay: 1,
  programs: {},
  teams: {},
  entries: {}, // cod → entry-list riders
  tests: {}, // cod → day → risultatiprove feed
  dayClass: {}, // cod → day → clasgiornata feed
  stageClass: {}, // cod → day → test code → clasps feed (standing after that test)
  overall: {}, // cod → num → cumulative standing
  updatedAt: null,
  error: null,
  loading: true,
};

const els = {
  title: document.getElementById('title'),
  nation: document.getElementById('nation'),
  days: document.getElementById('days'),
  status: document.getElementById('status'),
  main: document.getElementById('main'),
};

function parseHash() {
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  const nation = (params.get('nation') ?? '').toUpperCase();
  const day = Number(params.get('day'));
  return {
    nation: nation || null,
    day: Number.isInteger(day) && day >= 1 && day <= 6 ? day : null,
  };
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

function overallFor(cod, row, latestRows) {
  const o = state.overall[cod]?.[row.num];
  if (o) return { ...o, inProgress: !dayComplete(state.programs[cod], o.afterDay) };
  // Until the provider publishes cumulative standings (from day 2 on),
  // the overall standing equals the day 1 classification.
  if (state.latestDay !== 1) return null;
  const r = latestRows[row.num];
  if (!r || !r.started) return null;
  return { pos: r.dayPos, time: r.dayTime, afterDay: 1, inProgress: !dayComplete(state.programs[cod], 1) };
}

function paint() {
  const showOverall = state.nation !== ALL;
  const nationLabel = state.nation === ALL ? 'all nations' : nationName(state.nation, lang);

  renderTitle(els.title, { nation: state.nation, lang });
  renderNation(els.nation, { options: options(), selected: state.nation, lang });
  renderDays(els.days, { day: state.day, latestDay: state.latestDay, nation: state.nation });

  const groups = GROUPS.map((g) => {
    const feed = state.tests[g.cod]?.[state.day];
    const cols = feed ? testColumns(feed) : [];
    const rows = feed ? dayRows(feed, { teams: state.teams[g.cod], nation: state.nation }) : [];
    const latestFeed = state.tests[g.cod]?.[state.latestDay];
    const latestRows =
      state.day === state.latestDay || !latestFeed
        ? Object.fromEntries(rows.map((r) => [r.num, r]))
        : Object.fromEntries(dayRows(latestFeed, { nation: state.nation }).map((r) => [r.num, r]));
    const overall = showOverall ? Object.fromEntries(rows.map((r) => [r.num, overallFor(g.cod, r, latestRows)])) : {};
    const stages = state.stageClass[g.cod]?.[state.day] ?? {};
    const ranks = {};
    const rankCache = {};
    for (const row of rows) {
      if (!row.lastPs || !stages[row.lastPs]) continue;
      rankCache[row.lastPs] ??= rankWithin(stages[row.lastPs], { nation: state.nation });
      ranks[row.num] = rankCache[row.lastPs][row.num];
    }
    return {
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
  renderGroups(els.main, groups, { showOverall, showFlags: state.nation === ALL, nationLabel });

  const hasData = groups.some((g) => g.loaded);
  renderStatus(els.status, {
    loading: state.loading,
    updatedAt: state.updatedAt,
    error: state.error,
    hasData,
    note: showOverall ? '' : 'Cumulative standings are shown per nation.',
  });
  const who = state.nation === ALL ? 'All riders' : nationName(state.nation, lang);
  document.title = `${who}, ISDE 2026 day ${state.day}`;
}

let dayToken = 0;
async function refreshDay() {
  const { day, nation } = state;
  const token = ++dayToken;
  state.loading = true;
  paint();

  const results = await Promise.allSettled(
    GROUPS.map(async (g) => {
      const tests = await getJson(urls.tests(g.cod, day));
      const dayClass = await getJson(urls.dayClass(g.cod, day)).catch(() => null);
      // Standing after each test a shown rider has just finished, for category positions and penalties.
      const numeroByCode = Object.fromEntries(testColumns(tests).map((c) => [c.code, c.numero]));
      const codes = [...new Set(dayRows(tests, { nation }).map((r) => r.lastPs).filter((c) => c && numeroByCode[c]))];
      const stageFeeds = await Promise.all(
        codes.map((code) => getJson(urls.stage(g.cod, day, numeroByCode[code])).catch(() => null)),
      );
      const stageClass = Object.fromEntries(codes.map((code, i) => [code, stageFeeds[i]]).filter(([, feed]) => feed));
      return { tests, dayClass, stageClass };
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
      const nums = numbersFor(g.cod);
      const settled = await Promise.allSettled(nums.map((n) => getJson(urls.rider(g.cod, n))));
      settled.forEach((res, i) => {
        if (res.status === 'fulfilled') {
          (state.overall[g.cod] ??= {})[nums[i]] = overallFromDays(res.value?.data?.days);
        }
      });
    }),
  );
  paint();
}

/** Team names and the rider list of a group; kept only when the feed actually has riders. */
async function loadEntry(cod) {
  const entry = await getJson(urls.entrylist(cod));
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
        getJson(urls.program(g.cod)),
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
  const { nation, day } = parseHash();
  const nextNation = validNation(nation ?? state.nation);
  const nextDay = day ?? state.day;
  const nationChanged = nextNation !== state.nation;
  const dayChanged = nextDay !== state.day;
  state.nation = nextNation;
  state.day = nextDay;
  if (dayChanged || nationChanged) refreshDay();
  if (nationChanged) refreshOverall();
}

async function init() {
  const initial = parseHash();
  state.nation = initial.nation ?? DEFAULT_NATION;
  paint();
  try {
    await loadStatic();
  } catch (err) {
    console.warn('Static feeds failed', err);
    state.error = err;
    state.loading = false;
    paint();
    setTimeout(init, RETRY_MS);
    return;
  }
  state.latestDay = Math.max(...GROUPS.map((g) => latestDay(state.programs[g.cod])));
  state.day = initial.day ?? state.latestDay;
  state.nation = validNation(state.nation);

  await refreshDay();
  refreshOverall();

  setInterval(refreshDay, DAY_REFRESH_MS);
  setInterval(refreshOverall, OVERALL_REFRESH_MS);
  window.addEventListener('hashchange', applyHash);
  els.nation.addEventListener('change', () => {
    location.hash = hashFor(els.nation.value, state.day);
  });
}

init();
