// HTML rendering. Everything that comes from the timing feed goes through esc().

import { ALL, FINAL, ordinal } from './model.js';
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

/** URL hash for a view. The rider page is its own view and carries the rider key (e.g. ISDE1-184). */
export function hashFor(nation, day, view = 'riders', rider = null) {
  const tail = `nation=${encodeURIComponent(nation)}&day=${day}`;
  if (view === 'rider' && rider) return `#view=rider&rider=${encodeURIComponent(rider)}&${tail}`;
  if (view === 'teams') return `#view=teams&${tail}`;
  return `#${tail}`;
}

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

export function renderDays(container, { day, latestDay, nation, view, finalLabel = 'Final' }) {
  const days = [1, 2, 3, 4, 5, 6]
    .map((d) => {
      const classes = ['day', d === day ? 'is-current' : '', d > latestDay ? 'is-future' : ''].filter(Boolean).join(' ');
      return `<a class="${classes}" href="${hashFor(nation, d, view)}" aria-current="${d === day ? 'page' : 'false'}"><span class="day__label">Day</span>${d}</a>`;
    })
    .join('');
  const finalClasses = ['day', 'day--final', day === FINAL ? 'is-current' : ''].filter(Boolean).join(' ');
  const final = `<a class="${finalClasses}" href="${hashFor(nation, FINAL, view)}" aria-current="${day === FINAL ? 'page' : 'false'}"><span class="day__label">All days</span>${esc(finalLabel)}</a>`;
  container.innerHTML = days + final;
}

export function renderViews(container, { view, nation, day }) {
  container.innerHTML = [
    ['riders', 'Riders'],
    ['teams', 'Teams'],
  ]
    .map(([v, label]) => `<a class="view${v === view ? ' is-current' : ''}" href="${hashFor(nation, day, v)}" aria-current="${v === view ? 'page' : 'false'}">${label}</a>`)
    .join('');
}

const DAY_STATE = {
  live: (d) => `Day ${d} is in progress.`,
  final: (d) => `Day ${d} is final.`,
  future: (d) => `Day ${d} has not started.`,
};

export function renderStatus(el, { loading, updatedAt, error, hasData, note, day, dayState, archived }) {
  const time = updatedAt ? updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
  let text;
  let tone = 'ok';
  if (archived) {
    text = error && !hasData ? 'Could not load the archived results.' : `Final results of the event, archived on ${archived}.`;
    tone = error && !hasData ? 'warn' : 'ok';
  } else if (error && hasData) {
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
  const state = !archived && dayState && DAY_STATE[dayState] ? DAY_STATE[dayState](day) : '';
  el.textContent = [text, state, note].filter(Boolean).join(' ');
  el.dataset.tone = tone;
}

function overallCell(o) {
  if (!o) return `<td class="c-overall"><span class="muted">Not published yet</span></td>`;
  const note = o.inProgress ? `day ${o.afterDay} in progress` : `after day ${o.afterDay}`;
  return `<td class="c-overall"><span class="pos">${o.pos ?? '–'}</span><span class="t">${esc(o.time)}</span><span class="sub">${esc(note)}</span></td>`;
}

function rowHtml(row, cols, best, retired, overall, rank, { showOverall, showFlags, riderHref }) {
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
  const href = riderHref ? riderHref(row.num) : '';
  const nameHtml = href ? `<a class="name" href="${esc(href)}">${esc(row.name)}</a>` : `<span class="name">${esc(row.name)}</span>`;
  const details = [row.team, row.bike, row.startTime ? `start ${row.startTime}` : ''].filter(Boolean).map(esc).join(', ');
  const riderCell = `<td class="c-rider"><span class="num">${esc(row.num)}</span> ${nameHtml}${flag ? ` <span class="flag" title="${esc(row.nation)}">${flag}</span>` : ''}<span class="sub">${details}</span></td>`;

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
 * @param {{ showOverall: boolean, showFlags: boolean, nationLabel: string, riderHref: (cod, num) => string }} options
 */
export function renderGroups(container, groups, { showOverall = true, showFlags = false, nationLabel = '', riderHref = null } = {}) {
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
        .map((row) => rowHtml(row, g.cols, g.best, g.retired, g.overall[row.num], g.ranks?.[row.num], { showOverall, showFlags, riderHref: riderHref ? (num) => riderHref(g.cod, num) : null }))
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

const ridersLine = (riders, retired, href) =>
  riders
    .map((r) => {
      const name = href ? `<a href="${esc(href(r.num))}">${esc(r.name)}</a>` : esc(r.name);
      return `${name} ${esc(r.time)}${retired[r.num] ? ' <span class="out">(out)</span>' : ''}`;
    })
    .join(', ');

function teamSection(section, nation, riderHref) {
  const { type, name, stages, max, rows, retired = {}, cod } = section;
  const href = riderHref && cod ? (num) => riderHref(cod, num) : null;
  const selected = stages.find((s) => s.selected);
  const through = selected && selected.count === max ? `all ${max} teams through` : `${selected?.count ?? 0} of ${max} teams through`;
  const note = selected ? `After ${esc(selected.code)} ${esc(testPlace(selected.name, selected.code))}, ${through}.` : '';
  const picker = stages
    .map(
      (s) =>
        `<button type="button" class="stage${s.selected ? ' is-current' : ''}" data-type="${esc(type)}" data-code="${esc(s.code)}" aria-pressed="${s.selected}"${s.count ? '' : ' disabled'}>${esc(s.code)}<span class="stage__count">${s.count}</span></button>`,
    )
    .join('');
  const body = rows
    .map((r) => {
      const flag = nationFlag(r.nation);
      const mine = nation !== ALL && r.nation === nation;
      return `<tr class="team${mine ? ' is-mine' : ''}"><td class="c-pos"><span class="pos">${r.pos}</span></td><td class="c-team">${flag ? `<span class="flag" title="${esc(r.nation)}">${flag}</span> ` : ''}<span class="name">${esc(r.name)}</span><span class="sub">${ridersLine(r.riders, retired, href)}</span></td><td class="c-time"><span class="t">${esc(r.time)}</span></td><td class="c-gap">${r.gap ? `+${esc(r.gap)}` : 'leader'}</td></tr>`;
    })
    .join('');
  return `<section class="group">
<h2 class="group__title">${esc(name)}<span class="group__count">${rows.length} team${rows.length === 1 ? '' : 's'}</span></h2>
<p class="stage-note">${note}</p>
<nav class="stages" aria-label="Standing after test">${picker}</nav>
<div class="table-wrap"><table class="sheet teams">
<thead><tr><th class="c-pos" scope="col">Pos</th><th class="c-team" scope="col">Team</th><th class="c-time" scope="col">Time</th><th class="c-gap" scope="col">Gap</th></tr></thead>
<tbody>${body}</tbody>
</table></div></section>`;
}

/**
 * @param {{ sections, summary, nation, nationLabel, day, loaded }} view
 * sections: [{ type, name, stages: [{ code, name, count, selected }], max, rows }]
 * summary: [{ typeName, pos, of, name, stage }] — the selected nation's teams
 */
export function renderTeams(container, { sections, summary, nation, nationLabel, day, loaded, riderHref = null }) {
  if (!loaded) {
    container.innerHTML = `<p class="empty">Waiting for the timing server…</p>`;
    return;
  }
  if (!sections.length) {
    container.innerHTML = `<p class="empty">No team standings for day ${day} yet.</p>`;
    return;
  }
  let summaryHtml = '';
  if (nation !== ALL) {
    const items = summary.length
      ? `<ul class="summary__list">${summary.map((t) => `<li><b>${ordinal(t.pos)}</b> of ${t.of} in ${esc(t.typeName)} after ${esc(t.stage)}: ${esc(t.name)}</li>`).join('')}</ul>`
      : `<p class="summary__empty">No ${esc(nationLabel)} team listed yet.</p>`;
    summaryHtml = `<section class="summary"><h2 class="summary__title">${nationFlag(nation)} ${esc(nationLabel)} teams</h2>${items}</section>`;
  }
  container.innerHTML = summaryHtml + sections.map((s) => teamSection(s, nation, riderHref)).join('');
}

/** The rider page: one row per day, one cell per test, day standing and overall. */
export function renderRider(container, { detail, team, retired = '', final = null, backHref, backLabel = 'Back to results', loading, error }) {
  const close = `<a class="rider-panel__close" href="${esc(backHref)}">${esc(backLabel)}</a>`;
  if (!detail) {
    const text = error ? 'Could not load this rider from the timing server.' : loading ? 'Loading rider…' : 'No rider selected.';
    container.innerHTML = `<div class="rider-panel"><div class="rider-panel__head"><p class="empty">${text}</p>${close}</div></div>`;
    return;
  }
  const flag = nationFlag(detail.nation);
  const meta = [team, detail.bike, detail.cls ? `class ${detail.cls}` : '', CATEGORY_NAMES[detail.cat] ?? detail.cat].filter(Boolean).map(esc).join(', ');
  const out = retired ? `<p class="rider-panel__out">Retired: ${esc(retired.replace(/\s+/g, ' '))}</p>` : '';
  const finalLine = final
    ? `<p class="rider-panel__final">${final.complete ? 'Final classification' : `Overall after day ${final.afterDay}`}: <b>${ordinal(final.pos)}</b>, ${esc(final.time)}</p>`
    : '';
  const head = `<div class="rider-panel__head"><div><h2 class="rider-panel__name"><span class="num">${esc(detail.num)}</span> ${esc(detail.name)}${flag ? ` <span class="flag" title="${esc(detail.nation)}">${flag}</span>` : ''}</h2><p class="rider-panel__meta">${meta}</p>${finalLine}${out}</div>${close}</div>`;

  if (!detail.days.length) {
    container.innerHTML = `<div class="rider-panel">${head}<p class="empty">${retired ? 'No test times.' : 'No test times yet.'}</p></div>`;
    return;
  }
  const heads = detail.testCodes.map((c) => `<th class="c-test" scope="col">${esc(c)}</th>`).join('');
  const body = detail.days
    .map((d) => {
      const cells = detail.testCodes
        .map((code) => {
          const t = d.tests[code];
          if (!t) return `<td class="c-test"><span class="muted">–</span></td>`;
          return `<td class="c-test"><span class="t">${esc(t.time)}</span><span class="sub">${t.pos ?? '–'}. in test</span><span class="sub">${t.afterPos ?? '–'}. after</span></td>`;
        })
        .join('');
      const penalties = [
        d.timeControl ? `<span class="sub pen">incl. ${esc(d.timeControl)} time control</span>` : '',
        d.penalty ? `<span class="sub pen">incl. ${esc(d.penalty)} penalty</span>` : '',
      ].join('');
      const gap = d.dayGap ? `+${esc(d.dayGap)}` : 'leader';
      const dayCell = `<td class="c-day"><span class="pos">${d.dayPos ?? '–'}</span><span class="t">${esc(d.dayTime)}</span>${penalties}<span class="sub">${gap}, after ${esc(d.lastCode)}</span></td>`;
      const overallCell = d.overall
        ? `<td class="c-overall"><span class="pos">${d.overall.pos ?? '–'}</span><span class="t">${esc(d.overall.time)}</span></td>`
        : `<td class="c-overall"><span class="muted">Not published yet</span></td>`;
      return `<tr><td class="c-dayno"><span class="pos">${d.day}</span><span class="sub">day</span></td>${cells}${dayCell}${overallCell}</tr>`;
    })
    .join('');
  container.innerHTML = `<div class="rider-panel">${head}
<div class="table-wrap"><table class="sheet rider-grid">
<thead><tr><th class="c-dayno" scope="col">Day</th>${heads}<th class="c-day" scope="col">Day standing</th><th class="c-overall" scope="col">Overall</th></tr></thead>
<tbody>${body}</tbody>
</table></div></div>`;
}

export function renderPdfLinks(container, { links, day }) {
  container.innerHTML = `Official documents and PDF results for day ${day}: ${links
    .map((l) => `<a href="${esc(l.href)}" rel="noopener">${esc(l.label)}</a>`)
    .join(', ')}.`;
}

/**
 * The final (or current cumulative) classification.
 * rows: [{ num, name, nation, team, bike, cls, cat, days: [{day,pos,time}], total: {pos,time,afterDay}|null,
 *         gap, catPos, catSize, classPos, classSize }]
 */
export function renderFinal(container, { groups, days, nation, nationLabel, complete, riderHref, showFlags }) {
  const title = complete ? 'final classification' : 'overall standing so far';
  container.innerHTML = groups
    .map((g) => {
      const header = `<h2 class="group__title">${esc(g.label)}<span class="group__count">${g.rows.length ? `${g.rows.length} rider${g.rows.length === 1 ? '' : 's'}, ${title}` : title}</span></h2>`;
      if (!g.loaded) return `<section class="group">${header}<p class="empty">Waiting for the timing server…</p></section>`;
      if (!g.rows.length) return `<section class="group">${header}<p class="empty">No riders from ${esc(nationLabel)} in this event.</p></section>`;
      return `<section class="group">${header}${finalTable(g.rows, { days, nation, complete, riderHref, showFlags })}</section>`;
    })
    .join('');
}

function finalTable(rows, { days, nation, complete, riderHref, showFlags }) {
  const dayHeads = days.map((d) => `<th class="c-test" scope="col">Day ${d}</th>`).join('');
  const body = rows
    .map((r) => {
      const href = riderHref ? riderHref(r.cod, r.num) : '';
      const nameHtml = href ? `<a class="name" href="${esc(href)}">${esc(r.name)}</a>` : `<span class="name">${esc(r.name)}</span>`;
      const flag = showFlags ? nationFlag(r.nation) : '';
      const details = [r.team, r.bike].filter(Boolean).map(esc).join(', ');
      const byDay = Object.fromEntries(r.days.map((d) => [d.day, d]));
      const dayCells = days
        .map((d) => {
          const x = byDay[d];
          if (!x || !x.time) return `<td class="c-test"><span class="muted">–</span></td>`;
          return `<td class="c-test"><span class="t">${esc(x.time)}</span><span class="sub">${x.pos ?? '–'}.</span></td>`;
        })
        .join('');
      const posCell = r.total
        ? `<td class="c-pos"><span class="pos">${r.total.pos}</span><span class="sub">${r.catPos ? `${r.catPos}. ${esc(r.cat)}` : esc(r.cat)}</span></td>`
        : `<td class="c-pos"><span class="pos muted">–</span><span class="sub">${esc(r.cat)}</span></td>`;
      const totalCell = r.total
        ? `<td class="c-day"><span class="t">${esc(r.total.time)}</span><span class="sub">${r.gap ? `+${esc(r.gap)}` : 'leader'}${complete || r.total.afterDay >= 6 ? '' : `, after day ${r.total.afterDay}`}</span></td>`
        : `<td class="c-day"><span class="muted">Not classified</span></td>`;
      return `<tr class="rider${r.total ? '' : ' is-out'}">${posCell}<td class="c-rider"><span class="num">${esc(r.num)}</span> ${nameHtml}${flag ? ` <span class="flag" title="${esc(r.nation)}">${flag}</span>` : ''}<span class="sub">${details}</span></td><td class="c-cls">${esc(r.cls)}</td>${dayCells}${totalCell}</tr>`;
    })
    .join('');
  return `<div class="table-wrap"><table class="sheet">
<thead><tr><th class="c-pos" scope="col">Pos</th><th class="c-rider" scope="col">Rider</th><th class="c-cls" scope="col">Class</th>${dayHeads}<th class="c-day" scope="col">Total</th></tr></thead>
<tbody>${body}</tbody>
</table></div>`;
}
