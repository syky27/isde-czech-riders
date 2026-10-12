// Pure data transformations for the Microplus / FICR enduro timing feeds.
// No DOM, no fetch — everything here is unit-tested against real feed samples.

const NATION = 'CZE';

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
    if (r.Naz !== nation) return;

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
    if (r.Naz !== nation) continue;
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
