// HTML rendering. Everything that comes from the timing feed goes through esc().

import { ALL } from './model.js';
import { nationName, nationFlag } from './nations.js';

const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const CATEGORY_NAMES = {
  WT: 'World Trophy',
  JWT: 'Junior World Trophy',
  WWT: "Women's World Trophy",
};

/** "ST3 SANTIAGO DO CACEM" → "Santiago do Cacem" */
function testPlace(name, code) {
  const rest = String(name ?? '').replace(new RegExp(`^${code}\\s*`, 'i'), '').trim();
  if (!rest) return '';
  return rest
    .toLowerCase()
    .split(' ')
    .map((w) => (w === 'do' || w === 'de' || w === 'da' ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
    .replace(/x-race/i, 'X-Race');
}

const catLabel = (cat) =>
  CATEGORY_NAMES[cat] ? `<abbr title="${esc(CATEGORY_NAMES[cat])}">${esc(cat)}</abbr>` : esc(cat);

export const hashFor = (nation, day) => `#nation=${encodeURIComponent(nation)}&day=${day}`;

export function renderTitle(el, { nation, lang }) {
  el.textContent = nation === ALL ? 'All riders' : `${nationFlag(nation)} ${nationName(nation, lang)}`.trim();
}

/** Rebuilds the <select> only when the option set changes, so an open menu is not disturbed. */
export function renderNation(select, { options, selected, lang }) {
  const total = options.reduce((sum, o) => sum + o.count, 0);
  const key = `${lang}|${options.map((o) => `${o.code}:${o.count}`).join(',')}`;
  if (select.dataset.key !== key) {
    const named = options
      .map((o) => ({ ...o, name: nationName(o.code, lang), flag: nationFlag(o.code) }))
      .sort((a, b) => a.name.localeCompare(b.name, lang));
    select.innerHTML = [
      `<option value="${ALL}">All nations (${total})</option>`,
      ...named.map((o) => `<option value="${esc(o.code)}">${esc(`${o.flag} ${o.name}`.trim())} (${o.count})</option>`),
    ].join('');
    select.dataset.key = key;
  }
  if (select.value !== selected) select.value = selected;
}

export function renderDays(container, { day, latestDay, nation }) {
  container.innerHTML = [1, 2, 3, 4, 5, 6]
    .map((d) => {
      const classes = ['day', d === day ? 'is-current' : '', d > latestDay ? 'is-future' : ''].filter(Boolean).join(' ');
      return `<a class="${classes}" href="${hashFor(nation, d)}" aria-current="${d === day ? 'page' : 'false'}"><span class="day__label">Day</span>${d}</a>`;
    })
    .join('');
}

export function renderStatus(el, { loading, updatedAt, error, hasData, note }) {
  const time = updatedAt ? updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
  let text;
  let tone = 'ok';
  if (error && hasData) {
    text = `Timing server not reachable. Showing results from ${time}, retrying every minute.`;
    tone = 'warn';
  } else if (error) {
    text = 'Timing server not reachable. Retrying every minute.';
    tone = 'warn';
  } else if (loading && !updatedAt) {
    text = 'Loading results from the timing server…';
  } else {
    text = `Updated ${time}. Refreshes every minute.`;
  }
  el.textContent = note ? `${text} ${note}` : text;
  el.dataset.tone = tone;
}

function overallCell(o) {
  if (!o) return `<td class="c-overall"><span class="muted">Not published yet</span></td>`;
  const note = o.inProgress ? `day ${o.afterDay} in progress` : `after day ${o.afterDay}`;
  return `<td class="c-overall"><span class="pos">${o.pos ?? '–'}</span><span class="t">${esc(o.time)}</span><span class="sub">${esc(note)}</span></td>`;
}

function rowHtml(row, cols, best, retired, overall, rank, { showOverall, showFlags }) {
  const out = retired[row.num];
  const classes = ['rider', out ? 'is-out' : '', !row.started ? 'is-ns' : ''].filter(Boolean).join(' ');

  let posCell;
  if (!row.started) {
    posCell = `<td class="c-pos"><span class="pos muted">–</span></td>`;
  } else if (rank) {
    const title = `${rank.catPos} of ${rank.catSize} in ${CATEGORY_NAMES[row.cat] ?? row.cat}, ${rank.classPos} of ${rank.classSize} in class ${row.cls}`;
    posCell = `<td class="c-pos"><span class="pos">${row.dayPos ?? '–'}</span><span class="sub" title="${esc(title)}">${rank.catPos}. ${esc(row.cat)}</span></td>`;
  } else {
    posCell = `<td class="c-pos"><span class="pos">${row.dayPos ?? '–'}</span><span class="sub">${catLabel(row.cat)}</span></td>`;
  }

  const flag = showFlags ? nationFlag(row.nation) : '';
  const riderCell = `<td class="c-rider"><span class="num">${esc(row.num)}</span> <span class="name">${esc(row.name)}</span>${flag ? ` <span class="flag" title="${esc(row.nation)}">${flag}</span>` : ''}<span class="sub">${esc(row.team)}${row.team && row.bike ? ', ' : ''}${esc(row.bike)}</span></td>`;

  const testCells = cols
    .map((col) => {
      const t = row.tests[col.code];
      if (!t) return `<td class="c-test"><span class="muted">–</span></td>`;
      const isBest = best[col.code] === row.num;
      return `<td class="c-test${isBest ? ' is-best' : ''}"><span class="t">${esc(t.time)}</span><span class="sub">${t.pos ?? '–'}.</span></td>`;
    })
    .join('');

  let dayCell;
  if (out) {
    dayCell = `<td class="c-day"><span class="t">Retired</span><span class="sub">${esc(out.replace(/\s+/g, ' '))}</span></td>`;
  } else if (!row.started) {
    dayCell = `<td class="c-day"><span class="muted">Not started yet</span></td>`;
  } else {
    const gap = row.dayGap ? `+${esc(row.dayGap)}` : 'leader';
    const penalties = [
      rank?.timeControl ? `<span class="sub pen">incl. ${esc(rank.timeControl)} time control</span>` : '',
      rank?.penalty ? `<span class="sub pen">incl. ${esc(rank.penalty)} penalty</span>` : '',
    ].join('');
    dayCell = `<td class="c-day"><span class="t">${esc(row.dayTime)}</span>${penalties}<span class="sub">${gap}</span></td>`;
  }

  return `<tr class="${classes}">${posCell}${riderCell}<td class="c-cls">${esc(row.cls)}</td>${testCells}${dayCell}${showOverall ? overallCell(overall) : ''}</tr>`;
}

/**
 * @param {Array<{label, day, cols, rows, best, retired, overall, ranks, loaded, fieldSize}>} groups
 * @param {{ showOverall: boolean, showFlags: boolean, nationLabel: string }} options
 */
export function renderGroups(container, groups, { showOverall = true, showFlags = false, nationLabel = '' } = {}) {
  container.innerHTML = groups
    .map((g) => {
      const count = g.rows.length;
      const header = `<h2 class="group__title">${esc(g.label)}<span class="group__count">${count ? `${count} rider${count === 1 ? '' : 's'}` : ''}</span></h2>`;
      if (!g.loaded) return `<section class="group">${header}<p class="empty">Waiting for the timing server…</p></section>`;
      if (!g.fieldSize) return `<section class="group">${header}<p class="empty">No results for day ${g.day} yet.</p></section>`;
      if (!count) return `<section class="group">${header}<p class="empty">No riders from ${esc(nationLabel)} in this event.</p></section>`;

      const testHeads = g.cols
        .map((c) => `<th class="c-test" scope="col"><span class="test-code">${esc(c.code)}</span><span class="test-name">${esc(testPlace(c.name, c.code))}</span></th>`)
        .join('');

      const body = g.rows
        .map((row) => rowHtml(row, g.cols, g.best, g.retired, g.overall[row.num], g.ranks?.[row.num], { showOverall, showFlags }))
        .join('');

      return `<section class="group">${header}
<div class="table-wrap"><table class="sheet">
<thead><tr>
<th class="c-pos" scope="col">Pos</th>
<th class="c-rider" scope="col">Rider</th>
<th class="c-cls" scope="col">Class</th>
${testHeads}
<th class="c-day" scope="col">Day ${g.day}</th>
${showOverall ? '<th class="c-overall" scope="col">Overall</th>' : ''}
</tr></thead>
<tbody>${body}</tbody>
</table></div></section>`;
    })
    .join('');
}
