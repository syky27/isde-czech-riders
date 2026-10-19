import { test } from 'node:test';
import assert from 'node:assert/strict';

import { EDITIONS, DEFAULT_EDITION, editionByYear, editionByEvent, urlsFor, liveUrl } from '../src/api.js';

test('editions are looked up by year and by event code', () => {
  assert.equal(DEFAULT_EDITION.year, 2026);
  assert.equal(editionByYear('2025').event, 'ENDUROISDE2025');
  assert.equal(editionByYear(2026), DEFAULT_EDITION);
  assert.equal(editionByYear('1999'), null);
  assert.equal(editionByEvent('ENDUROISDE2025').year, 2025);
  assert.ok(EDITIONS.every((e) => e.event && e.year && e.place && e.app));
});

test('archived editions read the data folder, live editions the timing API', () => {
  const archived = urlsFor({ event: 'ENDUROISDE2025', archived: true, app: 'https://x' });
  assert.equal(archived.tests('ISDE1', 3), 'data/ENDUROISDE2025/END/mpcache-20/get/plus/risultatiprove/ISDE1/3.json');
  assert.equal(archived.rider('ISDE2', '603'), 'data/ENDUROISDE2025/END/get/plus/resultconc/ISDE2/603.json');
  assert.equal(archived.final('ISDE1'), 'data/ENDUROISDE2025/final/ISDE1.json');
  assert.equal(archived.pdfPage('ISDE1', 2), 'https://x/#/END/plus/pdf/ISDE1/2');
  const live = urlsFor({ event: 'ENDUROISDE2027', archived: false, app: 'https://y' });
  assert.equal(live.program('ISDE1'), 'https://apienduro.ficr.it/ENDUROISDE2027/END/mpcache-20/get/plus/program/ISDE1');
  assert.equal(liveUrl({ event: 'E' }, 'a/b'), 'https://apienduro.ficr.it/E/END/a/b');
});
