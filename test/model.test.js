import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  ALL,
  TEAM_TYPES,
  nationOptions,
  teamStandings,
  stageCounts,
  defaultStage,
  teamsOfNation,
  surname,
  ordinal,
  riderDetail,
  finalStanding,
  finalRows,
  lastCompletedDay,
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
import { isoCode, nationName, nationFlag } from '../src/nations.js';

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
const teams1 = fixture('teams_ISDE1_1_15.json');
const teamsClubSt1 = fixture('teams_ISDE2_1_7.json');
const teamsClubSt3 = fixture('teams_ISDE2_1_15.json');
const program26 = fixture('program_ISDE1.json');
const program25 = fixture('program_2025_ISDE1.json');
const rc33 = fixture('resultconc_2025_ISDE1_33.json');
const rc255 = fixture('resultconc_2025_ISDE1_255.json');
const rc184 = fixture('resultconc_ISDE1_184.json');
const rcLive = fixture('resultconc_ISDE1_10_day2_live.json');
const rcFinal = fixture('resultconc_ISDE1_184_final.json');
const programFinal = fixture('program_ISDE1_final.json');
const rcDnf = fixture('resultconc_ISDE2_603_dnf.json');

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
  assert.equal(chlum.startTime, '8:40');
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

test('dayRows and rankWithin return every rider when nation is ALL', () => {
  assert.equal(dayRows(rp1, { nation: ALL }).length, rp1.data.result.length);
  assert.equal(Object.keys(rankWithin(clasps1, { nation: ALL })).length, 102);
});

test('nationOptions counts riders per nation across entry lists', () => {
  const options = nationOptions([entry1, entry2]);
  const cze = options.find((o) => o.code === 'CZE');
  assert.deepEqual(cze, { code: 'CZE', count: 23 });
  const total = options.reduce((sum, o) => sum + o.count, 0);
  assert.equal(total, entry1.data.iscritti.length + entry2.data.iscritti.length);
  assert.deepEqual(
    options.map((o) => o.code),
    [...options.map((o) => o.code)].sort(),
  );
  assert.ok(options.every((o) => o.code && o.count > 0));
  assert.deepEqual(nationOptions([null, { data: {} }]), []);
});

test('nations map the timing codes to names and flags', () => {
  assert.equal(nationName('CZE', 'en'), 'Czechia');
  assert.equal(nationName('GBR', 'en'), 'United Kingdom');
  assert.equal(nationName('CHI', 'en'), 'Chile');
  assert.equal(nationName('CZE', 'cs'), 'Česko');
  assert.equal(nationName('ZZZ', 'en'), 'ZZZ');
  assert.equal(nationFlag('CZE'), '🇨🇿');
  assert.equal(nationFlag('ZZZ'), '');
  const codes = new Set([...entry1.data.iscritti, ...entry2.data.iscritti].map((r) => r.naz));
  const unmapped = [...codes].filter((c) => !isoCode(c));
  assert.deepEqual(unmapped, []);
});

test('teamStandings ranks teams per category with gaps, nation and riders', () => {
  const standings = teamStandings(teams1);
  assert.deepEqual(Object.keys(standings).sort(), ['JW', 'MT', 'WT', 'WW']);
  assert.equal(standings.JW.length, 14);
  const leader = standings.JW[0];
  assert.equal(leader.pos, 1);
  assert.equal(leader.name, 'TEAM ITALY');
  assert.equal(leader.nation, 'ITA');
  assert.equal(leader.time, "1:11'41.91");
  assert.equal(leader.gap, '');
  const cze = standings.JW[9];
  assert.equal(cze.pos, 10);
  assert.equal(cze.name, 'TEAM CZECH REPUBLIC');
  assert.equal(cze.nation, 'CZE');
  assert.equal(cze.time, "1:15'47.97");
  assert.equal(cze.gap, "4'06.06");
  assert.deepEqual(
    cze.riders.map((r) => [r.num, r.name, r.time]),
    [
      ['185', 'Kalny', "25'05.05"],
      ['186', 'Skorepa', "25'07.10"],
      ['184', 'Chlum', "25'35.82"],
    ],
  );
  assert.deepEqual(teamStandings(null), {});
  assert.deepEqual(teamStandings({ data: {} }), {});
});

test('teamStandings takes the majority nation of mixed club teams', () => {
  const standings = teamStandings(teamsClubSt1);
  const gottbros = standings.CV.find((t) => t.name === 'GOTTBROS TEAM');
  assert.equal(gottbros.nation, 'CZE'); // CZE, CZE, SVK
  const gottbros2 = standings.CT.find((t) => t.name === 'GOTTBROS TEAM 2');
  assert.equal(gottbros2.nation, 'CZE');
  const nordbayern = standings.CT.find((t) => t.name.startsWith('TEAM GERMANY NORDBAYERN'));
  assert.equal(nordbayern.nation, 'DEU');
});

test('stageCounts and defaultStage pick the latest test every team of the category has finished', () => {
  const feeds = { ST1: teamsClubSt1, ST2: null, ST3: teamsClubSt3 };
  assert.deepEqual(stageCounts(feeds, 'CT'), [
    { code: 'ST1', count: 91 },
    { code: 'ST2', count: 0 },
    { code: 'ST3', count: 23 },
  ]);
  assert.equal(defaultStage(feeds, 'CT'), 'ST1');
  assert.equal(defaultStage(feeds, 'CV'), 'ST1');
  assert.equal(defaultStage(feeds, 'CW'), null);
  assert.equal(defaultStage({ ST3: teams1 }, 'WT'), 'ST3');
  assert.equal(defaultStage({}, 'WT'), null);
});

test('teamsOfNation lists a nation’s teams with their rank per category', () => {
  const trophy = teamsOfNation(teamStandings(teams1), 'CZE');
  assert.deepEqual(trophy, [{ type: 'JW', pos: 10, of: 14, name: 'TEAM CZECH REPUBLIC' }]);
  const club = teamsOfNation(teamStandings(teamsClubSt1), 'CZE');
  assert.deepEqual(
    club.map((t) => `${t.type} ${t.pos}/${t.of} ${t.name}`),
    [
      'CT 10/91 MOTOSPORT BOZKOV 1',
      'CT 28/91 AMK ZALANY',
      'CT 30/91 AUTOMOTOKLUB POLICE NAD M',
      'CT 38/91 MOTOSPORT BOZKOV 2',
      'CT 85/91 GOTTBROS TEAM 2',
      'CV 1/10 TEAM MOTOKROSOVA SKOLA CZ',
      'CV 2/10 GOTTBROS TEAM',
    ],
  );
  assert.deepEqual(teamsOfNation(teamStandings(teams1), ALL), []);
});

test('TEAM_TYPES lists the categories in presentation order', () => {
  assert.deepEqual(
    TEAM_TYPES.map((t) => t.code),
    ['WT', 'JW', 'WW', 'MT', 'CT', 'CW', 'CV'],
  );
  assert.equal(TEAM_TYPES.find((t) => t.code === 'JW').name, 'Junior World Trophy');
});

test('surname and ordinal helpers', () => {
  assert.equal(surname('KALNY Jaroslav'), 'Kalny');
  assert.equal(surname('LE QUERE Leo'), 'Le Quere');
  assert.equal(surname('MEJIA LEMOS Mario Alexis'), 'Mejia Lemos');
  assert.equal(surname(''), '');
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 112].map(ordinal), [
    '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '112th',
  ]);
});

test('riderDetail lays out every day and test of a rider with day and overall standings', () => {
  const d = riderDetail(rc33);
  assert.equal(d.num, '33');
  assert.equal(d.name, 'GARCIA Josep');
  assert.equal(d.nation, 'ESP');
  assert.equal(d.bike, 'KTM 250 4T');
  assert.equal(d.cls, 'E1');
  assert.equal(d.cat, 'WT');
  assert.deepEqual(d.testCodes, ['ST1', 'ST2', 'ST3', 'ST4', 'ST5', 'ST6', 'ST7', 'MX']);
  assert.equal(d.days.length, 6);
  const day1 = d.days[0];
  assert.equal(day1.day, 1);
  assert.deepEqual(day1.tests.ST1, { time: "6'15.20", pos: 3, afterPos: 3, afterTime: "6'15.20" });
  assert.deepEqual(day1.tests.ST6, { time: "4'14.95", pos: 47, afterPos: 1, afterTime: "32'19.21" });
  assert.equal(day1.dayTime, "32'19.21");
  assert.equal(day1.dayPos, 1);
  assert.equal(day1.timeControl, '');
  assert.deepEqual(day1.overall, { pos: 1, time: "32'19.21" });
  const day2 = d.days[1];
  assert.equal(day2.dayTime, "30'08.54");
  assert.deepEqual(day2.overall, { pos: 1, time: "1:02'27.75" });
  const day5 = d.days[4];
  assert.equal(day5.tests.ST1, null);
  assert.equal(day5.tests.ST2.time, "4'12.13");
  const day6 = d.days[5];
  assert.deepEqual(Object.keys(day6.tests).filter((c) => day6.tests[c]), ['MX']);
  assert.equal(day6.tests.MX.pos, 10);
  assert.deepEqual(day6.overall, { pos: 1, time: "2:51'44.78" });
});

test('riderDetail on a day in progress uses the last finished test as the day standing', () => {
  const d = riderDetail(rc184);
  assert.equal(d.days.length, 1);
  const day1 = d.days[0];
  assert.equal(day1.lastCode, 'ST3');
  assert.equal(day1.dayTime, "25'35.82");
  assert.equal(day1.dayPos, 74);
  assert.equal(day1.tests.ST4, null);
  assert.deepEqual(day1.overall, { pos: 74, time: "25'35.82" });
  assert.equal(riderDetail(null), null);
  assert.equal(riderDetail({ data: {} }), null);
});

test('overallFromDays ignores the provider’s placeholder entries for days not yet finished', () => {
  // During the event every unfinished day is listed with a 3-hour placeholder and no day
  // classification (ctp); only entries with a day classification are real.
  assert.equal(overallFromDays(rcLive.data.days), null);
  const d = riderDetail(rcLive);
  assert.equal(d.days.length, 2); // day 1 complete, day 2 has one test so far
  assert.deepEqual(d.days[0].overall, { pos: 1, time: "46'26.88" });
  assert.equal(d.days[1].day, 2);
  assert.equal(d.days[1].lastCode, 'ST1');
  assert.equal(d.days[1].overall, null);
});

test('dayComplete treats cancelled tests (status 3) as finished', () => {
  // Day 3 of ISDE 2026 had ST1 and ST4 cancelled: statuses 3,2,2,3,2,2.
  assert.equal(dayComplete(programFinal, 3), true);
  for (const day of [1, 2, 4, 5, 6]) assert.equal(dayComplete(programFinal, day), true);
});

test('riderDetail prefers the official day classification for finished days', () => {
  const d = riderDetail(rcFinal);
  assert.equal(d.days.length, 6);
  assert.deepEqual(d.days.map((x) => [x.day, x.dayPos, x.dayTime]), [
    [1, 72, "51'23.36"],
    [2, 59, "51'06.04"],
    [3, 48, "28'11.68"],
    [4, 54, "20'55.03"],
    [5, 52, "33'41.99"],
    [6, 55, "14'31.11"],
  ]);
  assert.deepEqual(d.days[5].overall, { pos: 56, time: "3:19'49.21" });
});

test('finalStanding summarises a rider for the final classification', () => {
  const f = finalStanding(rcFinal);
  assert.equal(f.num, '184');
  assert.equal(f.name, 'CHLUM Matyas');
  assert.equal(f.nation, 'CZE');
  assert.equal(f.cls, 'E2');
  assert.equal(f.cat, 'JWT');
  assert.deepEqual(f.days[0], { day: 1, pos: 72, time: "51'23.36" });
  assert.deepEqual(f.days[5], { day: 6, pos: 55, time: "14'31.11" });
  assert.deepEqual(f.total, { pos: 56, time: "3:19'49.21", afterDay: 6 });
  const live = finalStanding(rcLive);
  assert.deepEqual(live.total, { pos: 1, time: "46'26.88", afterDay: 1 });
  assert.equal(finalStanding(null), null);
});

test('finalRows filters by nation and orders by final position, unclassified riders last', () => {
  const riders = [
    { num: '2', name: 'B', nation: 'CZE', total: { pos: 2, time: "2'00.00", afterDay: 6 } },
    { num: '9', name: 'Z', nation: 'CZE', total: null },
    { num: '1', name: 'A', nation: 'ITA', total: { pos: 1, time: "1'00.00", afterDay: 6 } },
    { num: '3', name: 'C', nation: 'CZE', total: { pos: 3, time: "3'00.00", afterDay: 6 } },
  ];
  assert.deepEqual(finalRows(riders, { nation: 'CZE' }).map((r) => r.num), ['2', '3', '9']);
  assert.deepEqual(finalRows(riders, { nation: ALL }).map((r) => r.num), ['1', '2', '3', '9']);
  assert.deepEqual(finalRows(null, { nation: ALL }), []);
  // A standing after fewer days ranks below everyone standing after more days.
  const mixed = [
    { num: 'a', name: 'A', nation: 'X', total: { pos: 1, time: "1'00.00", afterDay: 1 } },
    { num: 'b', name: 'B', nation: 'X', total: { pos: 9, time: "9'00.00", afterDay: 3 } },
  ];
  assert.deepEqual(finalRows(mixed).map((r) => r.num), ['b', 'a']);
});

test('overallFromDays ignores entries whose total is not a time', () => {
  const days = [
    { giornata: '1', ctp: { Pos: '1', Tempo: "30'00.00" }, rtp: { Pos: '1', Tempo: "1:00'00.00" } },
    { giornata: '2', ctp: { Pos: '1', Tempo: '*****' }, rtp: { Pos: '1', Tempo: '*****' } },
  ];
  assert.deepEqual(overallFromDays(days, { throughDay: 6 }), { afterDay: 2, pos: 1, time: "1:00'00.00", dayPos: 1, dayTime: "30'00.00" });
});

test('lastCompletedDay counts finished days from the programme', () => {
  assert.equal(lastCompletedDay(programFinal), 6);
  assert.equal(lastCompletedDay(program26), 0);
  assert.equal(lastCompletedDay({ data: [] }), 0);
});

test('with throughDay the cumulative standing uses every day the programme has finished', () => {
  // Day 2 in progress: nothing after day 1 counts, whatever the feed lists.
  assert.equal(overallFromDays(rcLive.data.days, { throughDay: 1 }), null);
  // Event over: the last entry counts, including penalty days of riders who retired.
  assert.deepEqual(overallFromDays(rcFinal.data.days, { throughDay: 6 }), {
    afterDay: 6,
    pos: 56,
    time: "3:19'49.21",
    dayPos: 55,
    dayTime: "14'31.11",
  });
  const dnf = finalStanding(rcDnf, { throughDay: 6 });
  assert.equal(dnf.name, 'KOUBLE Krystof');
  assert.equal(dnf.days.length, 4); // did not start day 5
  assert.deepEqual(dnf.total, { pos: 278, time: "8:30'07.63", afterDay: 6 });
  // Without throughDay the retired days have no classification and are left out.
  assert.deepEqual(finalStanding(rcDnf).total, { pos: 2, time: "2:30'07.63", afterDay: 4 });
});
