// Endpoints of the Microplus / FICR timing API that powers
// https://www.fim-6days.com/info/results (embedded enduroisde<year>.microplustiming.com).
// The path layout has been stable across editions.

/**
 * Editions the page can show. `archived` editions are read from data/<event>/ (made by
 * scripts/snapshot.mjs) and never refresh; a running event has archived: false.
 * `base` is the live API host when it is not the shared apienduro.ficr.it one; `cachePrefix`
 * the path prefix of the cached feeds (none on the older hosts); `teams: false` marks editions
 * whose provider published no team standings feed.
 */
const ws = (year) => `https://wsenduroisde${year}.microplustiming.com`;
export const EDITIONS = [
  { event: 'ENDUROISDE2026', year: 2026, place: 'Grândola, Portugal', app: 'https://enduroisde2026.microplustiming.com', archived: true },
  { event: 'ENDUROISDE2025', year: 2025, place: 'Bergamo, Italy', app: 'https://enduroisde2025.microplustiming.com', archived: true },
  { event: 'ENDUROISDE2024', year: 2024, place: 'Silleda, Spain', app: 'https://enduroisde2024.microplustiming.com', base: ws(2024), archived: true },
  { event: 'ENDUROISDE2023', year: 2023, place: 'San Juan, Argentina', app: 'https://enduroisde2023.microplustiming.com', base: ws(2023), cachePrefix: '', teams: false, archived: true },
  { event: 'ENDUROISDE2022', year: 2022, place: 'Le Puy-en-Velay, France', app: 'https://enduroisde2022.microplustiming.com', base: ws(2022), cachePrefix: '', teams: false, archived: true },
  {
    event: 'ENDUROISDE2021',
    year: 2021,
    place: 'Rivanazzano Terme, Italy',
    app: 'https://enduroisde2021.microplustiming.com',
    base: ws(2021),
    cachePrefix: '',
    teams: false,
    archived: true,
    note: "The timing provider's cumulative standings for 2021 end after day 3; day results and rider pages are complete.",
  },
];
export const DEFAULT_EDITION = EDITIONS[0];
export const editionByYear = (year) => EDITIONS.find((e) => String(e.year) === String(year)) ?? null;
export const editionByEvent = (event) => EDITIONS.find((e) => e.event === event) ?? null;

export const GROUPS = [
  { cod: 'ISDE1', label: 'World Trophy' },
  { cod: 'ISDE2', label: 'Club teams' },
];

/** Feed paths of an edition, relative to the END base. */
export function pathsFor(edition) {
  const c = edition.cachePrefix ?? 'mpcache-20/';
  return {
    entrylist: (cod) => `get/plus/entrylist/${cod}`,
    program: (cod) => `${c}get/plus/program/${cod}`,
    tests: (cod, day) => `${c}get/plus/risultatiprove/${cod}/${day}`,
    dayClass: (cod, day) => `${c}get/plus/clasgiornata/${cod}/${day}`,
    stage: (cod, day, numero) => `${c}get/plus/clasps/${cod}/${day}/${numero}`,
    rider: (cod, num) => `get/plus/resultconc/${cod}/${num}`,
    teams: (cod, day, numero) => `${c}get/plus/team-clasps/${cod}/${day}/${numero}`,
    listpdf: (cod) => `get/plus/listpdf/${cod}`,
  };
}

export const liveUrl = (edition, path) => `${edition.base ?? `https://apienduro.ficr.it/${edition.event}`}/END/${path}`;
export const archiveUrl = (edition, path) => `data/${edition.event}/END/${path}.json`;

/** URL builders for one edition: the archive when it has one, otherwise the live API. */
export function urlsFor(edition) {
  const feed = (path) => (edition.archived ? archiveUrl(edition, path) : liveUrl(edition, path));
  const urls = Object.fromEntries(Object.entries(pathsFor(edition)).map(([name, fn]) => [name, (...args) => feed(fn(...args))]));
  urls.pdfPage = (cod, day) => `${edition.app}/#/END/plus/pdf/${cod}/${day}`;
  /** Final classification per event, derived from the per-rider feeds by scripts/snapshot.mjs. */
  urls.final = (cod) => `data/${edition.event}/final/${cod}.json`;
  /** Written by the snapshot: when the archive was taken. */
  urls.meta = () => `data/${edition.event}/meta.json`;
  return urls;
}

export async function getJson(url, { live = false } = {}) {
  const res = await fetch(url, { cache: live ? 'no-store' : 'default' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}
