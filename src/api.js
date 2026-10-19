// Endpoints of the Microplus / FICR timing API that powers
// https://www.fim-6days.com/info/results (embedded enduroisde2026.microplustiming.com).
// Change EVENT for another edition; the path layout has been stable across years.

export const EVENT = 'ENDUROISDE2026';
export const LIVE_BASE = `https://apienduro.ficr.it/${EVENT}/END`;
export const ARCHIVE_BASE = `data/${EVENT}/END`;

/**
 * When true the page reads the archived copy of the feeds (data/<EVENT>/, made by
 * scripts/snapshot.mjs) instead of the live timing API, and stops auto-refreshing.
 * Set to false for a running event.
 */
export const ARCHIVED = true;

/** The provider's own results app, used for links to the official PDF documents. */
export const APP = 'https://enduroisde2026.microplustiming.com';

export const GROUPS = [
  { cod: 'ISDE1', label: 'World Trophy' },
  { cod: 'ISDE2', label: 'Club teams' },
];

/** Feed paths, relative to the END base. */
export const paths = {
  entrylist: (cod) => `get/plus/entrylist/${cod}`,
  program: (cod) => `mpcache-20/get/plus/program/${cod}`,
  tests: (cod, day) => `mpcache-20/get/plus/risultatiprove/${cod}/${day}`,
  dayClass: (cod, day) => `mpcache-20/get/plus/clasgiornata/${cod}/${day}`,
  stage: (cod, day, numero) => `mpcache-20/get/plus/clasps/${cod}/${day}/${numero}`,
  rider: (cod, num) => `get/plus/resultconc/${cod}/${num}`,
  teams: (cod, day, numero) => `mpcache-20/get/plus/team-clasps/${cod}/${day}/${numero}`,
  listpdf: (cod) => `get/plus/listpdf/${cod}`,
};

export const liveUrl = (path) => `${LIVE_BASE}/${path}`;
export const archiveUrl = (path) => `${ARCHIVE_BASE}/${path}.json`;
const feedUrl = (path) => (ARCHIVED ? archiveUrl(path) : liveUrl(path));

export const urls = Object.fromEntries(Object.entries(paths).map(([name, fn]) => [name, (...args) => feedUrl(fn(...args))]));
urls.pdfPage = (cod, day) => `${APP}/#/END/plus/pdf/${cod}/${day}`;
/** Final classification per event, derived from the per-rider feeds by scripts/snapshot.mjs. */
urls.final = (cod) => `data/${EVENT}/final/${cod}.json`;

export async function getJson(url) {
  const res = await fetch(url, { cache: ARCHIVED ? 'default' : 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}
