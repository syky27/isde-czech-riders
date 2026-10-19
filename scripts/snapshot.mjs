#!/usr/bin/env node
// Downloads every feed the page uses from the live timing API into data/<EVENT>/END/<path>.json
// and builds data/<EVENT>/final/<cod>.json (final classification from the per-rider feeds).
// Usage: node scripts/snapshot.mjs [EVENT] [--rebuild]
//   EVENT defaults to the newest edition in src/api.js; --rebuild only regenerates the final
//   classification and meta.json from the files already archived, without downloading.

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_EDITION, editionByEvent, GROUPS, pathsFor, liveUrl } from '../src/api.js';
import { finalStanding, teamsByNumber, lastCompletedDay } from '../src/model.js';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const rebuild = process.argv.includes('--rebuild');
const edition = args[0] ? editionByEvent(args[0]) : DEFAULT_EDITION;
if (!edition) throw new Error(`Unknown event ${process.argv[2]}; add it to EDITIONS in src/api.js`);
const EVENT = edition.event;
const paths = pathsFor(edition);
const DAYS = [1, 2, 3, 4, 5, 6];
const CONCURRENCY = 6;
const root = new URL(`../data/${EVENT}/`, import.meta.url);
console.log(`Archiving ${EVENT} (${edition.year}, ${edition.place})`);
let downloaded = 0;
let skipped = 0;

async function fetchJson(path) {
  if (rebuild) return JSON.parse(await readFile(fileURLToPath(new URL(`END/${path}.json`, root)), 'utf8'));
  const res = await fetch(liveUrl(edition, path));
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return res.json();
}

async function write(relative, data) {
  const file = fileURLToPath(new URL(relative, root));
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data));
}

/** Fetch a feed and store it under the same path; returns null (and logs) on failure. */
async function grab(path, { optional = false } = {}) {
  try {
    const data = await fetchJson(path);
    if (!rebuild) await write(`END/${path}.json`, data);
    downloaded += 1;
    return data;
  } catch (err) {
    skipped += 1;
    if (!optional) console.warn(`  ! ${path}: ${err.message}`);
    return null;
  }
}

async function pool(items, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await worker(items[i], i);
      }
    }),
  );
  return results;
}

for (const { cod } of GROUPS) {
  console.log(`${cod}: entry list, program, documents`);
  const entry = await grab(paths.entrylist(cod));
  const program = await grab(paths.program(cod));
  await grab(paths.listpdf(cod), { optional: true });
  if (!entry || !program) throw new Error(`${cod}: entry list or program missing, aborting`);

  for (const day of DAYS) {
    const stages = program.data.filter((s) => s.Tipo === 'PS' && Number(s.Day) === day);
    console.log(`${cod}: day ${day}, ${stages.length} tests`);
    await grab(paths.tests(cod, day));
    await grab(paths.dayClass(cod, day), { optional: true });
    await pool(stages, async (s) => {
      await grab(paths.stage(cod, day, s.Numero), { optional: true });
      if (edition.teams !== false) await grab(paths.teams(cod, day, s.Numero), { optional: true });
    });
  }

  const riders = entry.data.iscritti ?? [];
  const teams = teamsByNumber(entry);
  console.log(`${cod}: ${riders.length} rider feeds`);
  const feeds = await pool(riders, (r) => grab(paths.rider(cod, r.id)));
  const throughDay = lastCompletedDay(program);
  const standings = feeds
    .map((feed) => finalStanding(feed, { throughDay }))
    .filter(Boolean)
    .map((f) => ({ ...f, team: teams[f.num]?.team ?? '' }));
  await write(`final/${cod}.json`, { event: EVENT, cod, generatedAt: new Date().toISOString(), riders: standings });
  console.log(`${cod}: final classification with ${standings.length} riders written`);
}

await write('meta.json', { event: EVENT, year: edition.year, generatedAt: new Date().toISOString(), feeds: downloaded });
console.log(`done: ${downloaded} feeds ${rebuild ? 'read' : 'saved'}, ${skipped} skipped`);
