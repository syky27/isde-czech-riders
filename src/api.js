// Endpoints of the Microplus / FICR timing API that powers
// https://www.fim-6days.com/info/results (embedded enduroisde2026.microplustiming.com).
// Change EVENT for another edition; the path layout has been stable across years.

export const EVENT = 'ENDUROISDE2026';
const BASE = `https://apienduro.ficr.it/${EVENT}/END`;

export const GROUPS = [
  { cod: 'ISDE1', label: 'World Trophy' },
  { cod: 'ISDE2', label: 'Club teams' },
];

export const urls = {
  entrylist: (cod) => `${BASE}/get/plus/entrylist/${cod}`,
  program: (cod) => `${BASE}/mpcache-20/get/plus/program/${cod}`,
  tests: (cod, day) => `${BASE}/mpcache-20/get/plus/risultatiprove/${cod}/${day}`,
  dayClass: (cod, day) => `${BASE}/mpcache-20/get/plus/clasgiornata/${cod}/${day}`,
  stage: (cod, day, numero) => `${BASE}/mpcache-20/get/plus/clasps/${cod}/${day}/${numero}`,
  rider: (cod, num) => `${BASE}/get/plus/resultconc/${cod}/${num}`,
  teams: (cod, day, numero) => `${BASE}/mpcache-20/get/plus/team-clasps/${cod}/${day}/${numero}`,
};

export async function getJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}
