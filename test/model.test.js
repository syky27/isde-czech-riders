import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  parseTime,
  formatTime,
  testColumns,
  dayRows,
  bestPerTest,
  retiredMap,
  rankWithin,
  overallFromDays,
  latestDay,
  dayComplete,
  teamsByNumber,
} from '../src/model.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => JSON.parse(readFileSync(join(here, 'fixtures', name), 'utf8'));

const rp1 = fixture('risultatiprove_ISDE1_1.json');
const rp2 = fixture('risultatiprove_ISDE2_1.json');
const rpEmpty = fixture('risultatiprove_ISDE1_2_empty.json');
const entry1 = fixture('entrylist_ISDE1.json');
const entry2 = fixture('entrylist_ISDE2.json');
const cg1 = fixture('clasgiornata_ISDE1_1.json');
const clasps1 = fixture('clasps_ISDE1_1_15.json');
const clasps2 = fixture('clasps_ISDE2_1_15.json');
const program26 = fixture('program_ISDE1.json');
const program25 = fixture('program_2025_ISDE1.json');
const rc33 = fixture('resultconc_2025_ISDE1_33.json');
const rc255 = fixture('resultconc_2025_ISDE1_255.json');
const rc184 = fixture('resultconc_ISDE1_184.json');

test('parseTime handles Microplus time strings', () => {
  assert.equal(parseTime("7'20.89"), 440.89);
  assert.equal(parseTime("1:02'27.75"), 3747.75);
  assert.equal(parseTime('55.42'), 55.42);
  assert.equal(parseTime('---'), null);
  assert.equal(parseTime(''), null);
  assert.equal(parseTime(null), null);
  assert.equal(parseTime(undefined), null);
});

test('formatTime is the inverse of parseTime', () => {
  assert.equal(formatTime(440.89), "7'20.89");
  assert.equal(formatTime(3747.75), "1:02'27.75");
  assert.equal(formatTime(55.42), '55.42');
  assert.equal(formatTime(null), '');
});

test('testColumns lists special tests in order and skips the start-time pseudo column', () => {
  const cols = testColumns(rp2);
  assert.deepEqual(
    cols.map((c) => c.code),
    ['ST1', 'ST2', 'ST3', 'ST4', 'ST5', 'ST6'],
  );
  assert.equal(cols[0].name, 'ST1 ODEMIRA');
  assert.equal(cols[0].numero, '7');
  assert.deepEqual(testColumns(rpEmpty).map((c) => c.code), ['ST1', 'ST2', 'ST3', 'ST4', 'ST5', 'ST6']);
});

test('teamsByNumber maps race number to team and nation from the entry list', () => {
  const teams = teamsByNumber(entry1);
  assert.deepEqual(teams['184'], { team: 'TEAM CZECH REPUBLIC', nation: 'CZE' });
});

test('dayRows keeps only Czech riders with per-test time and position', () => {
  const rows = dayRows(rp1, { teams: teamsByNumber(entry1) });
  assert.equal(rows.length, 3);
  const chlum = rows.find((r) => r.num === '184');
  assert.equal(chlum.name, 'CHLUM Matyas');
  assert.equal(chlum.team, 'TEAM CZECH REPUBLIC');
  assert.equal(chlum.bike, 'SHERCO 300 4T');
  assert.equal(chlum.cls, 'E2');
  assert.equal(chlum.cat, 'JWT');
  assert.deepEqual(chlum.tests.ST1, { time: "7'46.97", sec: 466.97, pos: 66 });
  assert.deepEqual(chlum.tests.ST2, { time: "9'55.06", sec: 595.06, pos: 88 });
  assert.equal(chlum.tests.ST4, null);
  assert.equal(chlum.testsDone, 3);
  assert.equal(chlum.lastPs, 'ST3');
  assert.equal(chlum.dayPos, 74);
  assert.equal(chlum.dayTime, "25'35.82");
  assert.equal(chlum.dayGap, "2'50.84");
  assert.equal(chlum.started, true);
});

test('rankWithin derives category and class positions from a stage classification', () => {
  const ranks = rankWithin(clasps1);
  assert.deepEqual(Object.keys(ranks).sort(), ['184', '185', '186']);
  const noPen = { timeControl: '', penalty: '' };
  assert.deepEqual(ranks['185'], { pos: 64, fieldSize: 102, catPos: 26, catSize: 35, classPos: 30, classSize: 49, ...noPen });
  assert.deepEqual(ranks['186'], { pos: 66, fieldSize: 102, catPos: 28, catSize: 35, classPos: 21, classSize: 30, ...noPen });
  assert.deepEqual(ranks['184'], { pos: 74, fieldSize: 102, catPos: 31, catSize: 35, classPos: 36, classSize: 49, ...noPen });
  assert.deepEqual(rankWithin(null), {});
  assert.deepEqual(rankWithin({ data: {} }), {});
});

test('dayRows orders by tests done, then day position, with not-started riders last', () => {
  const rows = dayRows(rp2, { teams: teamsByNumber(entry2) });
  assert.equal(rows.length, 20);
  assert.deepEqual(
    rows.slice(0, 8).map((r) => r.num),
    ['492', '404', '405', '592', '601', '402', '401', '501'],
  );
  assert.equal(rows[8].num, '603');
  const notStarted = rows.filter((r) => !r.started);
  assert.deepEqual(notStarted.map((r) => r.num).sort(), ['503', '504', '602', '604']);
  assert.deepEqual(rows.slice(-4).map((r) => r.started), [false, false, false, false]);
  assert.equal(notStarted[0].dayPos, null);
  assert.equal(notStarted[0].dayTime, '');
});

test('dayRows returns an empty list when the day has no results yet', () => {
  assert.deepEqual(dayRows(rpEmpty, { teams: {} }), []);
});

test('bestPerTest finds the fastest Czech rider in each test', () => {
  const rows = dayRows(rp1, { teams: teamsByNumber(entry1) });
  const best = bestPerTest(rows, testColumns(rp1));
  assert.deepEqual(best, { ST1: '186', ST2: '185', ST3: '185' });
});

test('retiredMap extracts out-of-race comments from the daily classification', () => {
  assert.deepEqual(retiredMap(cg1), { 61: 'RIT  DAY 1  ST1 - ST1 ODEMIRA' });
  assert.deepEqual(retiredMap({ data: [] }), {});
  assert.deepEqual(retiredMap(null), {});
});

test('overallFromDays reads the cumulative standing, shifting the provider day index by one', () => {
  assert.deepEqual(overallFromDays(rc33.data.days), {
    afterDay: 6,
    pos: 1,
    time: "2:51'44.78",
    dayPos: 10,
    dayTime: "10'21.16",
  });
  assert.deepEqual(overallFromDays(rc255.data.days), {
    afterDay: 6,
    pos: 52,
    time: "3:06'28.38",
    dayPos: 74,
    dayTime: "11'06.80",
  });
  assert.equal(overallFromDays(rc184.data.days), null);
  assert.equal(overallFromDays(undefined), null);
});

test('latestDay is the last day with any special test started', () => {
  assert.equal(latestDay(program26), 1);
  assert.equal(latestDay(program25), 6);
  assert.equal(latestDay({ data: [] }), 1);
});

test('dayComplete is true only when every special test of the day is finished', () => {
  assert.equal(dayComplete(program26, 1), false);
  assert.equal(dayComplete(program26, 2), false);
  assert.equal(dayComplete(program25, 6), true);
  assert.equal(dayComplete(program25, 1), true);
  assert.equal(dayComplete({ data: [] }, 1), false);
});

test('rankWithin carries time-control and other penalties from the standing', () => {
  const ranks = rankWithin(clasps2);
  assert.equal(ranks['401'].timeControl, "4'00");
  assert.equal(ranks['501'].timeControl, "6'00");
  assert.equal(ranks['404'].timeControl, "2'00");
  assert.equal(ranks['401'].penalty, '');
  assert.deepEqual(ranks['492'], {
    pos: 42,
    fieldSize: 107,
    catPos: 1,
    catSize: 9,
    classPos: 34,
    classSize: 91,
    timeControl: '',
    penalty: '',
  });
});
