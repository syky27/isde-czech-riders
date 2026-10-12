// Pure data transformations for the Microplus / FICR enduro timing feeds.
// No DOM, no fetch — everything here is unit-tested against real feed samples.

const NATION = 'CZE';

/** Pass as `nation` to select every rider. */
export const ALL = 'ALL';

/** "1:02'27.75" | "7'20.89" | "55.42" → seconds (number) or null when missing. */
export function parseTime(value) {
  if (value == null) return null;
  const str = String(value).trim();
  if (!str || str === '---') return null;
  const match = /^(?:(\d+):)?(?:(\d+)')?(\d+(?:\.\d+)?)$/.exec(str);
  if (!match) return null;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3]);
  return Math.round((hours * 3600 + minutes * 60 + seconds) * 100) / 100;
}

/** seconds → Microplus style string ("1:02'27.75", "7'20.89", "55.42"). */
export function formatTime(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return '';
  const total = Math.round(seconds * 100);
  const hours = Math.floor(total / 360000);
  const minutes = Math.floor((total % 360000) / 6000);
  const secs = (total % 6000) / 100;
  const secStr = secs.toFixed(2).padStart(hours || minutes ? 5 : 1, '0');
  if (hours) return `${hours}:${String(minutes).padStart(2, '0')}'${secStr}`;
  if (minutes) return `${minutes}'${secStr}`;
  return secStr;
}

const toInt = (value) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
};

/** Special-test columns for one day, from the risultatiprove feed. */
export function testColumns(rp) {
  const list = rp?.data?.psName ?? [];
  return list
    .filter((ps) => ps.Cod && ps.Cod !== 'Start Time' && ps.Numero !== '0')
    .map((ps) => ({ code: ps.Cod, name: ps.Stage ?? ps.Cod, numero: ps.Numero }));
}

/** Race number → { team, nation } from the entry list feed. */
export function teamsByNumber(entry) {
  const out = {};
  for (const rider of entry?.data?.iscritti ?? []) {
    out[rider.id] = { team: rider.motoclub ?? '', nation: rider.naz ?? '' };
  }
  return out;
}

/** Nations present in the entry lists, as [{ code, count }] sorted by code. */
export function nationOptions(entries) {
  const counts = {};
  for (const entry of entries ?? []) {
    for (const rider of entry?.data?.iscritti ?? []) {
      if (rider.naz) counts[rider.naz] = (counts[rider.naz] ?? 0) + 1;
    }
  }
  return Object.keys(counts)
    .sort()
    .map((code) => ({ code, count: counts[code] }));
}

/** Last day (1–6) that has at least one special test started, from the program feed. */
export function latestDay(program) {
  let day = 1;
  for (const stage of program?.data ?? []) {
    if (stage.Tipo === 'PS' && stage.StageStatus && stage.StageStatus !== '0') {
      day = Math.max(day, toInt(stage.Day) ?? 1);
    }
  }
  return day;
}

/** Race number → out-of-race comment ("RIT DAY 1 ST1 …") from the daily classification feed. */
export function retiredMap(cg) {
  const out = {};
  const list = Array.isArray(cg?.data) ? cg.data : [];
  for (const rider of list) {
    if (rider.CommentoFuoriGara) out[rider.Numero] = rider.CommentoFuoriGara;
  }
  return out;
}

/**
 * Rows for riders of one nation for one day, in the feed ordering
 * (tests done desc, then day time asc — the same order the official page uses).
 */
export function dayRows(rp, { teams = {}, nation = NATION } = {}) {
  const all = rp?.data?.result ?? [];
  const cols = testColumns(rp);
  const rows = [];
  all.forEach((r) => {
    if (nation !== ALL && r.Naz !== nation) return;

    const tests = {};
    let testsDone = 0;
    for (const col of cols) {
      const sec = parseTime(r[col.code]);
      if (sec == null) {
        tests[col.code] = null;
      } else {
        tests[col.code] = { time: r[col.code], sec, pos: toInt(r[`${col.code}P`]) };
        testsDone += 1;
      }
    }
    const started = testsDone > 0;
    const info = teams[r.Numero] ?? {};
    rows.push({
      num: r.Numero,
      name: r.CognomeNome,
      nation: r.Naz,
      bike: r.Moto,
      team: info.team ?? '',
      cls: r.classe,
      cat: r.q,
      tests,
      testsDone,
      started,
      lastPs: started ? r.LastPs : null,
      dayPos: started ? toInt(r.LastPsP) : null,
      dayTime: started ? r.Tempo ?? '' : '',
      dayGap: started ? r.Dist ?? '' : '',
      startTime: r['Start Time'] ?? '',
    });
  });
  return rows;
}

/**
 * Positions within category (q) and class from a stage classification feed
 * (clasps → data.rps, the overall standing after that special test).
 * Returns race number → { pos, fieldSize, catPos, catSize, classPos, classSize,
 * timeControl, penalty } for riders of the given nation. timeControl is the
 * time-control (lateness) penalty already included in the day time; penalty
 * is any other penalty, both as time strings or ''.
 */
export function rankWithin(clasps, { nation = NATION } = {}) {
  const list = (clasps?.data?.rps ?? [])
    .filter((r) => r.Pos != null && r.Tempo)
    .map((r) => ({ ...r, posNum: toInt(r.Pos) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.posNum - b.posNum);
  const cat = {};
  const cls = {};
  const catSize = {};
  const classSize = {};
  for (const r of list) {
    catSize[r.q] = (catSize[r.q] ?? 0) + 1;
    classSize[r.classe] = (classSize[r.classe] ?? 0) + 1;
  }
  const out = {};
  for (const r of list) {
    cat[r.q] = (cat[r.q] ?? 0) + 1;
    cls[r.classe] = (cls[r.classe] ?? 0) + 1;
    if (nation !== ALL && r.Naz !== nation) continue;
    out[r.Numero] = {
      pos: r.posNum,
      fieldSize: list.length,
      catPos: cat[r.q],
      catSize: catSize[r.q],
      classPos: cls[r.classe],
      classSize: classSize[r.classe],
      timeControl: r.Penco ?? '',
      penalty: r.Pen ?? '',
    };
  }
  return out;
}

/** test code → race number of the fastest rider among the given rows. */
export function bestPerTest(rows, cols) {
  const best = {};
  for (const col of cols) {
    let top = null;
    for (const row of rows) {
      const t = row.tests[col.code];
      if (t && (top == null || t.sec < top.sec)) top = { sec: t.sec, num: row.num };
    }
    if (top) best[col.code] = top.num;
  }
  return best;
}

/**
 * Cumulative standing from the per-rider feed (resultconc → data.days).
 * The provider's entry "giornata k" holds the classification of day k+1 and
 * the cumulative total through day k+1 (day 1 alone is never listed).
 */
export function overallFromDays(days) {
  if (!Array.isArray(days)) return null;
  let found = null;
  for (const entry of days) {
    const rtp = entry?.rtp;
    if (rtp && rtp.Tempo) {
      found = {
        afterDay: (toInt(entry.giornata) ?? 0) + 1,
        pos: toInt(rtp.Pos),
        time: rtp.Tempo,
        dayPos: toInt(entry.ctp?.Pos),
        dayTime: entry.ctp?.Tempo ?? '',
      };
    }
  }
  return found;
}

/** True when every special test of the given day is marked finished in the program feed. */
export function dayComplete(program, day) {
  const stages = (program?.data ?? []).filter((s) => s.Tipo === 'PS' && toInt(s.Day) === day);
  return stages.length > 0 && stages.every((s) => s.StageStatus === '2');
}

// ---- Teams -------------------------------------------------------------

/** Team categories in presentation order, with the codes used by the team feed. */
export const TEAM_TYPES = [
  { code: 'WT', name: 'World Trophy' },
  { code: 'JW', name: 'Junior World Trophy' },
  { code: 'WW', name: "Women's World Trophy" },
  { code: 'MT', name: "Manufacturer's Team Award" },
  { code: 'CT', name: 'Club Team Award' },
  { code: 'CW', name: "Women's Club Team" },
  { code: 'CV', name: 'Veteran Club Team' },
];

/** "LE QUERE Leo" → "Le Quere": the leading upper-case words are the surname. */
export function surname(fullName) {
  const words = String(fullName ?? '').trim().split(/\s+/).filter(Boolean);
  const upper = [];
  for (const w of words) {
    if (w === w.toUpperCase() && /\p{L}/u.test(w)) upper.push(w);
    else break;
  }
  const parts = upper.length ? upper : words.slice(0, 1);
  return parts.map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
}

/** 1 → "1st", 22 → "22nd", 13 → "13th". */
export function ordinal(n) {
  const v = Math.abs(Number(n));
  const suffix = v % 100 >= 11 && v % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][v % 10] ?? 'th';
  return `${n}${suffix}`;
}

function majorityNation(riders) {
  const counts = {};
  for (const r of riders) if (r.Naz) counts[r.Naz] = (counts[r.Naz] ?? 0) + 1;
  let best = '';
  for (const r of riders) {
    if (r.Naz && (best === '' || counts[r.Naz] > counts[best])) best = r.Naz;
  }
  return best;
}

/**
 * Team standing from a team-clasps feed (standing after one special test;
 * times are cumulative across days). Returns category code → ranked teams.
 */
export function teamStandings(feed) {
  const out = {};
  for (const team of feed?.data?.squadre ?? []) {
    const sec = parseTime(team.Tempo);
    if (sec == null || !team.SquTipo) continue;
    const riders = (team.Concorrenti ?? [])
      .map((r) => ({
        num: r.Numero,
        name: surname(r.CognomeNome),
        nation: r.Naz ?? '',
        time: r.Tempo ?? '',
        sec: parseTime(r.Tempo),
      }))
      .sort((a, b) => (a.sec ?? Infinity) - (b.sec ?? Infinity));
    (out[team.SquTipo] ??= []).push({
      name: team.Squadra ?? '',
      nation: majorityNation(team.Concorrenti ?? []),
      time: team.Tempo,
      sec,
      riders,
    });
  }
  for (const type of Object.keys(out)) {
    const list = out[type].sort((a, b) => a.sec - b.sec);
    const leader = list[0].sec;
    list.forEach((t, i) => {
      t.pos = i + 1;
      t.gap = i === 0 ? '' : formatTime(Math.round((t.sec - leader) * 100) / 100);
    });
  }
  return out;
}

/** Teams of a category listed after each test of the day: [{ code, count }] in test order. */
export function stageCounts(feedsByCode, type) {
  return Object.keys(feedsByCode ?? {}).map((code) => ({
    code,
    count: (feedsByCode[code]?.data?.squadre ?? []).filter((t) => t.SquTipo === type).length,
  }));
}

/** Latest test that every team of the category has finished (the one with the most teams), or null. */
export function defaultStage(feedsByCode, type) {
  const counts = stageCounts(feedsByCode, type);
  const max = Math.max(0, ...counts.map((c) => c.count));
  if (!max) return null;
  const full = counts.filter((c) => c.count === max);
  return full[full.length - 1].code;
}

/** A nation's teams across categories: [{ type, pos, of, name }], in category order. */
export function teamsOfNation(standings, nation) {
  if (nation === ALL) return [];
  const out = [];
  for (const { code } of TEAM_TYPES) {
    const list = standings?.[code] ?? [];
    for (const team of list) {
      if (team.nation === nation) out.push({ type: code, pos: team.pos, of: list.length, name: team.name });
    }
  }
  return out;
}

// ---- Rider detail ------------------------------------------------------

/**
 * Everything the per-rider feed (resultconc) knows about one rider:
 * tests per day with time, position in the test and standing after it,
 * the day standing (after the last finished test) and the cumulative overall.
 */
export function riderDetail(feed) {
  const driver = feed?.data?.driver;
  if (!driver) return null;
  const list = feed.data.list_ps ?? [];
  const testCodes = [];
  const byDay = new Map();
  for (const ps of list) {
    if (ps.StageCode && !testCodes.includes(ps.StageCode)) testCodes.push(ps.StageCode);
    const day = toInt(ps.Day);
    if (day == null) continue;
    if (!byDay.has(day)) byDay.set(day, { day, tests: {}, lastCode: null, last: null });
    const entry = byDay.get(day);
    const time = ps.cps?.Tempo;
    if (!time || parseTime(time) == null) {
      entry.tests[ps.StageCode] = null;
      continue;
    }
    entry.tests[ps.StageCode] = {
      time,
      pos: toInt(ps.cps.Pos),
      afterPos: toInt(ps.rps?.Pos),
      afterTime: ps.rps?.Tempo ?? '',
    };
    entry.lastCode = ps.StageCode;
    entry.last = ps.rps ?? {};
  }
  const overallByDay = {};
  for (const d of feed.data.days ?? []) {
    if (d?.rtp?.Tempo) overallByDay[(toInt(d.giornata) ?? 0) + 1] = { pos: toInt(d.rtp.Pos), time: d.rtp.Tempo };
  }
  const days = [...byDay.values()]
    .filter((d) => d.lastCode)
    .sort((a, b) => a.day - b.day)
    .map((d) => {
      for (const code of testCodes) if (!(code in d.tests)) d.tests[code] = null;
      const overall = overallByDay[d.day] ?? (d.day === 1 ? { pos: toInt(d.last.Pos), time: d.last.Tempo ?? '' } : null);
      return {
        day: d.day,
        tests: d.tests,
        lastCode: d.lastCode,
        dayTime: d.last.Tempo ?? '',
        dayPos: toInt(d.last.Pos),
        dayGap: d.last.Dist ?? '',
        timeControl: d.last.Penco ?? '',
        penalty: d.last.Pen ?? '',
        overall,
      };
    });
  return {
    num: driver.Numero,
    name: driver.CognomeNome,
    nation: driver.Naz ?? '',
    bike: driver.Moto ?? '',
    cls: driver.classe ?? '',
    cat: driver.q ?? '',
    testCodes,
    days,
  };
}
