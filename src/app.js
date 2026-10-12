import { GROUPS, urls, getJson } from './api.js';
import {
  latestDay,
  dayComplete,
  teamsByNumber,
  testColumns,
  dayRows,
  bestPerTest,
  retiredMap,
  rankWithin,
  overallFromDays,
} from './model.js';
import { renderDays, renderGroups, renderStatus } from './render.js';

const NATION = 'CZE';
const DAY_REFRESH_MS = 60_000;
const OVERALL_REFRESH_MS = 5 * 60_000;
const RETRY_MS = 60_000;

const state = {
  day: 1,
  latestDay: 1,
  programs: {},
  teams: {},
  riders: {}, // cod → race numbers of Czech riders
  tests: {}, // cod → day → risultatiprove feed
  dayClass: {}, // cod → day → clasgiornata feed
  stageClass: {}, // cod → day → test code → clasps feed (standing after that test)
  overall: {}, // cod → num → cumulative standing
  updatedAt: null,
  error: null,
  loading: true,
};

const els = {
  days: document.getElementById('days'),
  status: document.getElementById('status'),
  main: document.getElementById('main'),
};

const clampDay = (d) => Math.min(6, Math.max(1, d));

function hashDay() {
  const m = /day=(\d)/.exec(location.hash);
  return m ? clampDay(Number(m[1])) : null;
}

function overallFor(cod, num) {
  const o = state.overall[cod]?.[num];
  if (o) {
    return { ...o, inProgress: !dayComplete(state.programs[cod], o.afterDay) };
  }
  // Until the provider publishes cumulative standings (from day 2 on),
  // the overall standing equals the day 1 classification.
  if (state.latestDay === 1) {
    const feed = state.tests[cod]?.[1];
    if (!feed) return null;
    const row = dayRows(feed, { teams: state.teams[cod], nation: NATION }).find((r) => r.num === num);
    if (!row || !row.started) return null;
    return { pos: row.dayPos, time: row.dayTime, afterDay: 1, inProgress: !dayComplete(state.programs[cod], 1) };
  }
  return null;
}

function paint() {
  renderDays(els.days, { day: state.day, latestDay: state.latestDay });

  const groups = GROUPS.map((g) => {
    const feed = state.tests[g.cod]?.[state.day];
    const cols = feed ? testColumns(feed) : [];
    const rows = feed ? dayRows(feed, { teams: state.teams[g.cod], nation: NATION }) : [];
    const overall = Object.fromEntries(rows.map((r) => [r.num, overallFor(g.cod, r.num)]));
    const stages = state.stageClass[g.cod]?.[state.day] ?? {};
    const ranks = {};
    for (const row of rows) {
      if (row.lastPs && stages[row.lastPs]) ranks[row.num] = rankWithin(stages[row.lastPs], { nation: NATION })[row.num];
    }
    return {
      label: g.label,
      day: state.day,
      loaded: Boolean(feed),
      cols,
      rows,
      best: bestPerTest(rows, cols),
      retired: retiredMap(state.dayClass[g.cod]?.[state.day]),
      overall,
      ranks,
    };
  });
  renderGroups(els.main, groups);

  const hasData = groups.some((g) => g.loaded);
  renderStatus(els.status, { loading: state.loading, updatedAt: state.updatedAt, error: state.error, hasData });
  document.title = `Czech riders at ISDE 2026, day ${state.day}`;
}

let dayToken = 0;
async function refreshDay() {
  const day = state.day;
  const token = ++dayToken;
  state.loading = true;
  paint();

  const results = await Promise.allSettled(
    GROUPS.map(async (g) => {
      const tests = await getJson(urls.tests(g.cod, day));
      const dayClass = await getJson(urls.dayClass(g.cod, day)).catch(() => null);
      // Standing after each test a Czech rider has just finished, for category positions.
      const numeroByCode = Object.fromEntries(testColumns(tests).map((c) => [c.code, c.numero]));
      const codes = [...new Set(dayRows(tests, { nation: NATION }).map((r) => r.lastPs).filter((c) => c && numeroByCode[c]))];
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
  await Promise.all(
    GROUPS.map(async (g) => {
      const nums = state.riders[g.cod] ?? [];
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

async function loadStatic() {
  await Promise.all(
    GROUPS.map(async (g) => {
      const [program, entry] = await Promise.all([getJson(urls.program(g.cod)), getJson(urls.entrylist(g.cod))]);
      state.programs[g.cod] = program;
      state.teams[g.cod] = teamsByNumber(entry);
      state.riders[g.cod] = (entry?.data?.iscritti ?? []).filter((r) => r.naz === NATION).map((r) => r.id);
    }),
  );
}

async function init() {
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
  state.day = hashDay() ?? state.latestDay;

  await refreshDay();
  refreshOverall();

  setInterval(refreshDay, DAY_REFRESH_MS);
  setInterval(refreshOverall, OVERALL_REFRESH_MS);
  window.addEventListener('hashchange', () => {
    const d = hashDay();
    if (d && d !== state.day) {
      state.day = d;
      refreshDay();
    }
  });
}

init();
