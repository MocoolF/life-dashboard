'use strict';

/* ===================== utils ===================== */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');

const MON  = ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
const MONG = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const DOW  = ['пн','вт','ср','чт','пт','сб','вс'];
const WD   = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];

const iso   = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const parse = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
const addD  = (s,n) => { const d = parse(s); d.setDate(d.getDate()+n); return iso(d); };
const monStart = s => s.slice(0,8) + '01';
const monEnd   = s => { const d = parse(s); return iso(new Date(d.getFullYear(), d.getMonth()+1, 0)); };
const daysIn   = (a,b) => Math.round((parse(b) - parse(a)) / 864e5) + 1;
const mondayOf = s => addD(s, -((parse(s).getDay() + 6) % 7));
const short    = s => { const d = parse(s); return `${d.getDate()} ${MONG[d.getMonth()].slice(0,3)}`; };
const long     = s => { const d = parse(s); return `${d.getDate()} ${MONG[d.getMonth()]} ${d.getFullYear()}`; };
const dayName  = s => { const d = parse(s); return `${WD[d.getDay()]}, ${d.getDate()} ${MONG[d.getMonth()]}`; };
const span     = (a,b) => a === b ? short(a)
  : a.slice(0,7) === b.slice(0,7) ? `${parse(a).getDate()}–${short(b)}` : `${short(a)} – ${short(b)}`;

const pct = (a,b) => b > 0 ? a / b * 100 : null;
const pctS = p => p == null ? '—' : Math.round(p) + '%';
const plural = (n, f) => { const m = n % 10, h = n % 100;
  return f[(m === 1 && h !== 11) ? 0 : (m >= 2 && m <= 4 && (h < 10 || h >= 20)) ? 1 : 2]; };

const TODAY = iso(new Date());

/* ===================== зоны ===================== */
// красная < 50, голубая 50–75, зелёная ≥ 75 — как в таблице Глеба
const ZONES = [
  { id:'red',   name:'Красная', range:'меньше 50%', lo:0,  hi:50  },
  { id:'blue',  name:'Голубая', range:'50–75%',     lo:50, hi:75  },
  { id:'green', name:'Зелёная', range:'75% и выше', lo:75, hi:100 }
];
const zone = p => p == null ? null : p >= 75 ? 'green' : p >= 50 ? 'blue' : 'red';
const zvar = z => `var(--z-${z})`;

/* ===================== state ===================== */
const S = {
  habits: [], days: [], byDate: new Map(),
  from: monStart(TODAY), to: monEnd(TODAY), preset: 'month', tab: 'dyn',
  view: null,         // что и как рисовать на таймлайне — читается в boot()
  habitRange: 'half', // период на отдельном листе привычек
  H: null,            // черновик привычек за сегодня
  M: null,          // черновик отмечаемого дня
  edit: null        // черновик списка привычек
};

const REPO = 'MocoolF/life-dashboard';
const FILES = { habits:'data/habits.json', days:'data/days.json', reviews:'data/reviews.json' };

function setData(habits, days) {
  S.habits = habits;
  S.days = [...days].sort((a,b) => a.date.localeCompare(b.date));
  S.byDate = new Map(S.days.map(d => [d.date, d]));
  S.habStart = S.days.find(d => d.h)?.date || null;   // с этого дня привычки считаются ежедневно
  S.kStart = S.days.find(d => d.k)?.date || null;     // и ключевые задачи — тоже
}
const habitName = id => S.habits.find(h => h.id === id)?.name || id;

/* ===================== load ===================== */
async function boot() {
  try {
    const [habits, days] = await Promise.all([FILES.habits, FILES.days]
      .map(u => fetch(u, {cache:'no-store'}).then(r => { if (!r.ok) throw new Error(u); return r.json(); })));
    setData(habits, days);
  } catch (e) {
    $('#view-dyn').innerHTML = `<div class="card"><div class="empty">Не удалось загрузить данные: ${esc(e.message)}<br><br>
      Открой папку через локальный сервер: <code>python3 -m http.server</code></div></div>`;
    return;
  }
  S.reviews = await loadReviews();
  loadDateRange();
  S.view = loadView();
  S.habitRange = loadHabitRange();
  renderMorning();
  initTheme(); initDate(); initView(); initTabs();
  $('#updated').textContent = 'сегодня ' + long(TODAY);
  render();
  if (GH.token) reload();
  let t; addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { if (S.tab === 'dyn') { renderTimeline(); renderKeys(); } }, 120); });
}

/* ===================== итоги недели ===================== */
// разборы пишет облачная задача Claude по понедельникам (см. README) — здесь только показ
async function loadReviews() {
  try {
    const r = await fetch(FILES.reviews + '?_=' + Date.now(), {cache:'no-store'});
    if (!r.ok) return [];
    return (await r.json()).sort((a,b) => b.week.localeCompare(a.week));   // свежий — первым
  } catch { return []; }
}
function renderReview() {
  const box = $('#review');
  const R = S.reviews || [];
  if (!R.length) { box.hidden = true; return; }
  box.hidden = false;
  S.rv = Math.max(0, Math.min(R.length - 1, S.rv || 0));
  const r = R[S.rv];
  const open = (() => { try { return localStorage.getItem('life-review-open') !== '0'; } catch { return true; } })();
  const delta = (cur, prev) => {
    if (cur == null || prev == null) return '';
    const d = Math.round(cur) - Math.round(prev);
    return `<span class="rv__d ${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d > 0 ? '↑' : d < 0 ? '↓' : ''}${Math.abs(d)} п.п.</span>`;
  };
  const stat = (name, x) => x ? `<span class="rv__s"><span class="rv__sn">${name}</span>
    <b class="z-${zone(x.pct)}">${pctS(x.pct)}</b>${delta(x.pct, x.prev)}</span>` : '';
  box.innerHTML = `
    <div class="rv__head">
      <div class="rv__ttl"><span class="card__title">Итоги недели</span><span class="rv__wk">${span(r.week, r.to)}</span></div>
      <div class="rv__nav">
        <button class="btn rv__tg" id="rvToggle" aria-expanded="${open}">${open ? 'Свернуть' : 'Развернуть'}</button>
        <button class="day__nav rv__b" id="rvOld" aria-label="Неделя раньше"${S.rv >= R.length - 1 ? ' disabled' : ''}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M15 18l-6-6 6-6"/></svg></button>
        <button class="day__nav rv__b" id="rvNew" aria-label="Неделя позже"${S.rv <= 0 ? ' disabled' : ''}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 18l6-6-6-6"/></svg></button>
      </div>
    </div>
    <div class="rv__stats">${stat('Привычки', r.habits)}${stat('Задачи', r.tasks)}</div>
    <div class="rv__body"${open ? '' : ' hidden'}>
      <div class="rv__title">${esc(r.title || 'Разбор недели')}</div>
      ${(r.sections || []).map(x => `<div class="rv__sec">
        ${x.t ? `<div class="rv__st">${esc(x.t)}</div>` : ''}
        ${x.p ? `<p>${esc(x.p)}</p>` : ''}
        ${x.li ? `<ul>${x.li.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}</div>`).join('')}
    </div>`;
  $('#rvOld').onclick = () => { S.rv++; renderReview(); };
  $('#rvNew').onclick = () => { S.rv--; renderReview(); };
  // свёрнуто — остаются неделя и два числа; состояние помнится в браузере
  $('#rvToggle').onclick = () => { try { localStorage.setItem('life-review-open', open ? '0' : '1'); } catch {} renderReview(); };
}

/* ===================== ключевые задачи ===================== */
// три задачи на развитие в день: { d: сделано } — сами задачи Глеб ведёт в другом месте. Прошедший день без отметки = 0 из 3
const KEYS = 3;
function keyOn(date) {
  const rec = S.byDate.get(date);
  if (rec?.k) return { d: rec.k.filter(x => x.d).length, t: KEYS, items: rec.k };
  if (S.kStart && date >= S.kStart && date < TODAY) return { d:0, t:KEYS, items:[], unmarked:true };
  return null;
}

function renderKeys() {
  const box = $('#keys'); if (!box) return;
  const dates = datesOf(S.from, S.to);
  const vals = dates.map(keyOn);
  const tot = vals.filter(Boolean).reduce((a, v) => ({ d: a.d + v.d, t: a.t + v.t }), { d:0, t:0 });
  $('#keysHint').textContent = `${span(S.from, S.to)} · по дням`;
  $('#keysSum').innerHTML = tot.t ? `за период <b class="z-${zone(pct(tot.d, tot.t))}">${tot.d} из ${tot.t}</b> · ${pctS(pct(tot.d, tot.t))}` : '';
  box.innerHTML = '';
  if (!S.kStart) { box.append(el('div','empty','Пока нет отметок — заполни ключевые задачи на вкладке «Трекер»')); return; }

  const W = Math.max(280, box.clientWidth || 600), H = W < 520 ? 190 : 230, L = 30, R = 6, T = 10, B = 24;
  const iw = W - L - R, ih = H - T - B, n = dates.length, slot = iw / n;
  const svg = mk('svg', { viewBox:`0 0 ${W} ${H}`, width:W, height:H, class:'tl__svg', role:'img', 'aria-label':'Ключевые задачи по дням' });
  const x = i => L + (i + .5) * slot;
  const y = v => T + ih - v / KEYS * ih;
  for (let v = 0; v <= KEYS; v++) {
    svg.append(mk('line', { x1:L, x2:W - R, y1:y(v) + (v ? 0 : .5), y2:y(v) + (v ? 0 : .5), stroke: v ? 'var(--line-2)' : 'var(--line)', 'stroke-width':1 }));
    const t = mk('text', { x:L - 8, y:y(v) + 4, 'text-anchor':'end', 'font-size':11, fill:'var(--ink-3)' });
    t.textContent = v; svg.append(t);
  }
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 64))));
  dates.forEach((d, i) => {
    if (i % every && i !== n - 1) return;
    if (i === n - 1 && i % every && (i % every) < every * .6) return;
    const t = mk('text', { x:x(i), y:H - 6, 'text-anchor':'middle', 'font-size':11, fill:'var(--ink-3)' });
    t.textContent = short(d); svg.append(t);
  });
  const bw = Math.max(3, Math.min(slot * .62, 30));
  vals.forEach((v, i) => {
    if (!v) return;
    const h = v.d ? y(0) - y(v.d) : 3;                  // 0 из 3 — короткая красная полоска: день посчитан
    svg.append(mk('rect', { x:x(i) - bw/2, y:y(0) - h, width:bw, height:h, rx:Math.min(4, bw/3),
      fill:zvar(zone(pct(v.d, v.t))), 'fill-opacity': v.unmarked ? .55 : 1 }));
  });
  const hl = mk('rect', { y:T, height:ih, width:slot, fill:'var(--ink)', 'fill-opacity':.05, opacity:0 });
  svg.insertBefore(hl, svg.firstChild);
  svg.append(mk('rect', { x:L, y:0, width:iw, height:H, fill:'transparent' }));
  box.append(svg);

  const tip = $('#tip');
  const out = () => { hl.setAttribute('opacity', 0); tip.hidden = true; };
  const move = ev => {
    const pt = ev.touches ? ev.touches[0] : ev;
    const b = svg.getBoundingClientRect();
    const px = (pt.clientX - b.left) / b.width * W;
    if (px < L - 6 || px > W - R + 6) return out();
    const i = Math.max(0, Math.min(n - 1, Math.floor((px - L) / slot)));
    hl.setAttribute('x', L + i * slot); hl.setAttribute('opacity', 1);
    const v = vals[i];
    let h = `<div class="tip__d">${dayName(dates[i])}</div>`;
    if (!v) h += `<div class="tip__r"><span class="tip__n">Ключевые задачи</span><b>нет данных</b></div>`;
    else {
      h += `<div class="tip__r"><i class="tip__dot" style="background:${zvar(zone(pct(v.d, v.t)))}"></i>
        <span class="tip__n">Ключевые задачи</span><b>${v.d} из ${v.t}</b></div>`;
      if (v.unmarked) h += `<div class="tip__miss">день не отмечен</div>`;
    }
    tip.innerHTML = h; tip.hidden = false;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(innerWidth - tw - 8, pt.clientX - tw/2)) + 'px';
    tip.style.top  = (pt.clientY - th - 16 < 8 ? pt.clientY + 18 : pt.clientY - th - 16) + 'px';
  };
  svg.addEventListener('mousemove', move);
  svg.addEventListener('mouseleave', out);
  svg.addEventListener('touchstart', move, {passive:true});
  svg.addEventListener('touchmove',  move, {passive:true});
}

/* ===================== утреннее напоминание ===================== */
// просто текст для себя — правится здесь
const MORNING = [
  'Анализ привычек и задач',
  'Напоминание о целях — год, месяц, неделя',
  'Задачи на день + календарь'
];
function renderMorning() {
  const html = `<div class="morning__t">Каждое утро</div>
    <ol class="morning__l">${MORNING.map(t => `<li>${esc(t)}</li>`).join('')}</ol>`;
  $$('.js-morning').forEach(n => n.innerHTML = html);
}

/* ===================== theme ===================== */
function initTheme() {
  const saved = (() => { try { return localStorage.getItem('life-theme'); } catch { return null; } })();
  if (saved) document.documentElement.dataset.theme = saved;
  else if (matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.dataset.theme = 'dark';
  $('#themeBtn').onclick = () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('life-theme', next); } catch {}
    render();
  };
}

/* ===================== tabs ===================== */
function initTabs() {
  const tabFromHash = () => location.hash === '#mark' ? 'mark' : location.hash === '#habits' ? 'hab' : 'dyn';
  const hashForTab = tab => tab === 'mark' ? '#mark' : tab === 'hab' ? '#habits' : '#';
  const go = tab => {
    if (S.tab === 'mark' && tab !== 'mark' && isDirty() && !confirm('Отметки за день не сохранены. Уйти без сохранения?')) {
      history.replaceState(null, '', hashForTab(S.tab)); return;
    }
    S.tab = tab;
    $$('#tabs .tab').forEach(x => x.classList.toggle('is-active', x.dataset.tab === tab));
    $('#view-dyn').hidden  = tab !== 'dyn';
    $('#view-hab').hidden  = tab !== 'hab';
    $('#view-mark').hidden = tab !== 'mark';
    $('.filters').hidden   = tab !== 'dyn';
    if (tab === 'hab' && !S.H) loadHabitToday();
    if (tab === 'mark' && !S.M) loadMark(TODAY);
    render();
  };
  $$('#tabs .tab').forEach(b => b.onclick = () => { history.replaceState(null, '', hashForTab(b.dataset.tab)); go(b.dataset.tab); });
  go(tabFromHash());
  addEventListener('hashchange', () => go(tabFromHash()));
}

function render() {
  if (S.tab === 'mark') return renderMark();
  if (S.tab === 'hab') return renderHabits();
  renderReview();
  renderTop();
  renderTimeline();
  renderKeys();
}

/* ===================== расчёты ===================== */
/* один день → что о нём известно */
/* факты дня с учётом правила: привычки ежедневные, прошедший день без отметки = 0 из N */
function factsOn(date) {
  const f = dayFacts(S.byDate.get(date));
  if (!f.hab && S.habStart && date >= S.habStart && date < TODAY) {
    const n = habitCountOn(date);
    f.hab = { d:0, t:n, miss:[], unmarked:true };
  }
  return f;
}
// сколько привычек было в списке на дату: по ближайшей отметке (при равенстве — по более поздней:
// список мог смениться как раз между ними), иначе — активные сейчас
function habitCountOn(date) {
  let best = null, bestDist = Infinity;
  S.days.forEach(r => {
    if (!r.h || !Object.keys(r.h).length || r.date === date) return;
    const dist = Math.abs(Math.round((parse(date) - parse(r.date)) / 864e5));
    if (dist < bestDist || (dist === bestDist && r.date > best.date)) { best = r; bestDist = dist; }
  });
  return best ? Object.keys(best.h).length : (S.habits.filter(h => h.active).length || 1);
}

function dayFacts(rec) {
  const f = { task:null, noplan:0, hab:null };
  if (!rec) return f;
  if (rec.planned > 0) f.task = { d: rec.done || 0, t: rec.planned };
  else if (rec.planned === 0) { f.task = { d:0, t:1 }; f.noplan = 1; }   // не распланировал день = 0 из 1
  if (rec.h) {
    const ids = Object.keys(rec.h);
    if (ids.length) f.hab = { d: ids.filter(i => rec.h[i]).length, t: ids.length, miss: ids.filter(i => !rec.h[i]) };
  }
  return f;
}

/* свёртка нескольких дней в одну точку: суммы, а не среднее процентов */
function fold(dates) {
  const o = { task:null, noplan:0, hab:null, miss:new Map(), unmarked:0 };
  dates.forEach(d => {
    const f = factsOn(d);
    if (f.task) {
      o.task = o.task || { d:0, t:0 };
      o.task.d += f.task.d; o.task.t += f.task.t;
    }
    o.noplan += f.noplan;
    if (f.hab) {
      o.hab = o.hab || { d:0, t:0 };
      o.hab.d += f.hab.d; o.hab.t += f.hab.t;
      f.hab.miss.forEach(i => o.miss.set(i, (o.miss.get(i) || 0) + 1));
      if (f.hab.unmarked) o.unmarked++;
    }
  });
  o.habP  = o.hab  ? pct(o.hab.d,  o.hab.t)  : null;
  o.taskP = o.task ? pct(o.task.d, o.task.t) : null;
  return o;
}

function datesOf(a, b) { const out = []; for (let d = a; d <= b; d = addD(d, 1)) out.push(d); return out; }

function elapsedRange() {
  let to = S.to < TODAY ? S.to : TODAY;
  if (to === TODAY && !S.byDate.has(TODAY)) to = addD(to, -1);
  return to < S.from ? null : { from:S.from, to };
}

function previousRange(current) {
  if (!current) return null;
  if (S.preset === 'week') return { from:addD(current.from, -7), to:addD(current.to, -7) };
  if (S.preset === 'month' || S.preset === 'pmonth') {
    const previousMonth = addD(monStart(current.from), -1);
    const from = monStart(previousMonth);
    if (current.to === monEnd(current.from)) return { from, to:monEnd(from) };
    const day = Math.min(parse(current.to).getDate(), parse(monEnd(from)).getDate());
    const base = parse(from);
    return { from, to:iso(new Date(base.getFullYear(), base.getMonth(), day)) };
  }
  const length = daysIn(current.from, current.to);
  const to = addD(current.from, -1);
  return { from:addD(to, 1 - length), to };
}

function zoneDayCounts(dates, key) {
  const counts = { red:0, blue:0, green:0, total:0 };
  dates.forEach(date => {
    const facts = factsOn(date);
    const value = key === 'hab' ? facts.hab : facts.task;
    const z = zone(value ? pct(value.d, value.t) : null);
    if (z) { counts[z]++; counts.total++; }
  });
  return counts;
}

function greenStreak(key) {
  const todayFacts = factsOn(TODAY);
  const todayValue = key === 'hab' ? todayFacts.hab : todayFacts.task;
  let date = todayValue ? TODAY : addD(TODAY, -1);
  let streak = 0;
  while (true) {
    const facts = factsOn(date);
    const value = key === 'hab' ? facts.hab : facts.task;
    if (!value || zone(pct(value.d, value.t)) !== 'green') break;
    streak++;
    date = addD(date, -1);
  }
  return streak;
}

function buildRows(from, to) {
  // таймлайн всегда по дням, при любом периоде
  const rows = datesOf(from, to).map(d => {
    const o = fold([d]);
    return { a:d, b:d, ...o, label: short(d), title: dayName(d) };
  });
  return { rows, step:'day' };
}

/* ===================== верхние карточки ===================== */
function renderTop() {
  const currentRange = elapsedRange();
  const previous = previousRange(currentRange);
  const currentDates = currentRange ? datesOf(currentRange.from, currentRange.to) : [];
  const f = fold(currentDates);
  const before = previous ? fold(datesOf(previous.from, previous.to)) : { habP:null, taskP:null };
  const previousLabel = previous ? span(previous.from, previous.to) : '';
  const box = $('#top'); box.innerHTML = '';
  box.append(
    bigCard('Привычки', f.habP, before.habP,
      f.hab ? `${f.hab.d} из ${f.hab.t} ${plural(f.hab.t,['отметки','отметок','отметок'])}` : 'нет отметок',
      zoneDayCounts(currentDates, 'hab'), previousLabel, greenStreak('hab')),
    bigCard('Задачи', f.taskP, before.taskP,
      f.task ? `${f.task.d} из ${f.task.t} ${plural(f.task.t,['задачи','задач','задач'])}` : 'нет данных',
      zoneDayCounts(currentDates, 'task'), previousLabel, greenStreak('task'))
  );
}

function trendMarkup(current, previous, previousLabel) {
  if (current == null || previous == null) return '<span class="big__trend is-none">нет сравнения</span>';
  const diff = Math.round(current - previous);
  const cls = diff > 0 ? 'is-up' : diff < 0 ? 'is-down' : 'is-flat';
  const icon = diff > 0 ? '▲' : diff < 0 ? '▼' : '—';
  const title = `Прошлый аналогичный период (${previousLabel}): ${pctS(previous)}. Разница в процентных пунктах.`;
  return `<span class="big__trend ${cls}" title="${esc(title)}" aria-label="${esc(title)}">${icon} ${Math.abs(diff)} п.п.</span>`;
}

function zoneCountsMarkup(counts) {
  const items = [
    ['red','Красных'], ['blue','Голубых'], ['green','Зелёных']
  ].map(([id, label]) => {
    const n = counts[id];
    const aria = `${label} дней: ${n}`;
    return `<span class="big__zone" aria-label="${aria}"><i class="big__zone-dot is-${id}"></i><b>${n}</b><small>${label}</small></span>`;
  }).join('');
  const note = counts.total ? `${counts.total} ${plural(counts.total,['день','дня','дней'])} с данными` : 'нет дней с данными';
  return `<div class="big__zones" title="${note}"><div class="big__zones-title">Дни по зонам</div><div class="big__zones-list">${items}</div></div>`;
}

function bigCard(name, p, previousP, of, counts, previousLabel, streak) {
  const z = zone(p);
  const streakText = `${streak} ${plural(streak,['день','дня','дней'])}`;
  return el('div','big', `
    <div class="big__main">
      <div class="big__name">${name}</div>
      <div class="big__row">
        <span class="big__val ${z ? 'z-' + z : 'is-none'}">${pctS(p)}</span>
        ${trendMarkup(p, previousP, previousLabel)}
        <span class="big__of">${of}</span>
      </div>
      <div class="big__streak" aria-label="Текущая зелёная серия: ${streakText}">🔥 Зелёная серия <b>${streakText}</b></div>
    </div>
    ${zoneCountsMarkup(counts)}`);
}

/* ===================== таймлайн ===================== */
const SVGNS = 'http://www.w3.org/2000/svg';
const mk = (t, a) => { const n = document.createElementNS(SVGNS, t); for (const k in a) n.setAttribute(k, a[k]); return n; };

function renderTimeline() {
  const { rows, step } = buildRows(S.from, S.to);
  $('#dynHint').textContent = `${span(S.from, S.to)} · по дням`;

  const box = $('#timeline'); box.innerHTML = '';
  const width = Math.max(280, box.clientWidth || 600);
  const vis = SERIES.filter(s => S.view[s.id]);
  if (!vis.length) { box.append(el('div','empty','Ничего не выбрано — отметь «Привычки» или «Задачи» выше')); return; }

  const ch = chart(rows, width, vis);
  box.append(ch.svg);

  const tip = $('#tip');
  const move = ev => {
    const pt = ev.touches ? ev.touches[0] : ev;
    const i = ch.index(pt.clientX);
    if (i == null) return out();
    ch.mark(i);
    tip.innerHTML = tipHtml(rows[i], step, vis.map(s => s.id));
    tip.hidden = false;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(innerWidth - tw - 8, pt.clientX - tw/2)) + 'px';
    tip.style.top  = (pt.clientY - th - 16 < 8 ? pt.clientY + 18 : pt.clientY - th - 16) + 'px';
  };
  const out = () => { ch.clear(); tip.hidden = true; };
  ch.svg.addEventListener('mousemove', move);
  ch.svg.addEventListener('mouseleave', out);
  ch.svg.addEventListener('touchstart', move, {passive:true});
  ch.svg.addEventListener('touchmove',  move, {passive:true});
  S.tipOut = out;
}

/* две линии на одном поле: различаются цветом линии и формой точки, точка — цветом зоны */
const SERIES = [
  { id:'hab',  title:'Привычки', line:'var(--l-hab)',  shape:'circle', p: r => r.habP },
  { id:'task', title:'Задачи',   line:'var(--l-task)', shape:'square', p: r => r.taskP }
];
function chart(rows, W, series) {
  const H = W < 520 ? 300 : 380, L = 38, R = 8, T = 10, B = 24;
  const iw = W - L - R, ih = H - T - B, n = rows.length, slot = iw / n;
  const svg = mk('svg', { viewBox:`0 0 ${W} ${H}`, width:W, height:H, class:'tl__svg', role:'img', 'aria-label':'Привычки и задачи по дням' });
  const x = i => L + (i + .5) * slot;
  const y = p => T + ih - p / 100 * ih;

  // зоны: цветные полосы или, если выключены, пунктир на порогах 50% и 75%
  if (S.view.zones) {
    ZONES.forEach(Z => svg.append(mk('rect', { x:L, width:iw, y:y(Z.hi), height:y(Z.lo) - y(Z.hi),
      fill:zvar(Z.id), style:`fill-opacity:var(--band-${Z.id})` })));
    [50, 75].forEach(v => svg.append(mk('line', { x1:L, x2:W - R, y1:y(v), y2:y(v), stroke:'var(--surface)', 'stroke-width':1.5 })));
  } else {
    [50, 75].forEach(v => svg.append(mk('line', { x1:L, x2:W - R, y1:y(v), y2:y(v), stroke:'var(--ink-3)',
      'stroke-width':1.2, 'stroke-dasharray':'5 5', opacity:.7 })));
    svg.append(mk('line', { x1:L, x2:W - R, y1:y(0) + .5, y2:y(0) + .5, stroke:'var(--line)', 'stroke-width':1 }));
  }
  [0, 25, 50, 75, 100].forEach(v => {
    const t = mk('text', { x:L - 8, y:y(v) + 4, 'text-anchor':'end', 'font-size':11, fill:'var(--ink-3)' });
    t.textContent = v + '%'; svg.append(t);
  });

  // подписи дат: не теснее ~64px, последняя не налезает на соседнюю
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 64))));
  rows.forEach((r, i) => {
    if (i % every && i !== n - 1) return;
    if (i === n - 1 && i % every && (i % every) < every * .6) return;
    const t = mk('text', { x:x(i), y:H - 6, 'text-anchor':'middle', 'font-size':11, fill:'var(--ink-3)' });
    t.textContent = r.label; svg.append(t);
  });

  // линии рвутся только там, где дня нет в данных
  const rad = slot < 6 ? 2.6 : slot < 10 ? 3.4 : 4.8;
  if (S.view.lines) series.forEach(s => {
    let seg = [];
    const flush = () => {
      if (seg.length > 1) svg.append(mk('polyline', { points:seg.join(' '), fill:'none', stroke:s.line,
        'stroke-width':2.2, 'stroke-linejoin':'round', 'stroke-linecap':'round', 'stroke-opacity':.85 }));
      seg = [];
    };
    rows.forEach((r, i) => { const p = s.p(r); if (p == null) flush(); else seg.push(`${x(i).toFixed(1)},${y(p).toFixed(1)}`); });
    flush();
  });
  series.forEach(s => rows.forEach((r, i) => {
    const p = s.p(r); if (p == null) return;
    const a = { fill:zvar(zone(p)), stroke:'var(--surface)', 'stroke-width':2 };
    svg.append(s.shape === 'circle' ? mk('circle', { cx:x(i), cy:y(p), r:rad, ...a })
      : mk('rect', { x:x(i) - rad, y:y(p) - rad, width:rad * 2, height:rad * 2, rx:1.5, ...a }));
  }));

  // курсор
  const cross = mk('line', { y1:T, y2:T + ih, stroke:'var(--ink-3)', 'stroke-width':1, 'stroke-dasharray':'3 3', opacity:0 });
  const rings = series.map(() => mk('circle', { r:rad + 3.5, fill:'none', stroke:'var(--ink)', 'stroke-width':1.5, opacity:0 }));
  svg.append(cross, ...rings);
  svg.append(mk('rect', { x:L, y:0, width:iw, height:H, fill:'transparent' }));

  return {
    svg,
    index(clientX) {
      const b = svg.getBoundingClientRect();
      const px = (clientX - b.left) / b.width * W;
      if (px < L - 6 || px > W - R + 6) return null;
      return Math.max(0, Math.min(n - 1, Math.floor((px - L) / slot)));
    },
    mark(i) {
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('opacity', .7);
      series.forEach((s, k) => {
        const p = s.p(rows[i]);
        if (p == null) rings[k].setAttribute('opacity', 0);
        else { rings[k].setAttribute('cx', x(i)); rings[k].setAttribute('cy', y(p)); rings[k].setAttribute('opacity', .55); }
      });
    },
    clear() { cross.setAttribute('opacity', 0); rings.forEach(r => r.setAttribute('opacity', 0)); }
  };
}

function tipHtml(r, step, show = ['hab','task']) {
  const row = (name, z, val) => `<div class="tip__r"><i class="tip__dot" style="background:${z ? zvar(z) : 'rgba(255,255,255,.25)'}"></i>
    <span class="tip__n">${name}</span><b>${val}</b></div>`;
  const miss = t => `<div class="tip__miss">${t}</div>`;
  let h = `<div class="tip__d">${r.title}</div>`;

  if (!show.includes('hab')) ;
  else if (r.hab) {
    h += row('Привычки', zone(r.habP), `${r.hab.d} из ${r.hab.t} · ${pctS(r.habP)}`);
    if (r.unmarked) h += miss('день не отмечен');
  } else h += row('Привычки', null, 'нет отметки');

  if (!show.includes('task')) ;
  else if (r.task) {
    h += row('Задачи', zone(r.taskP), `${r.task.d} из ${r.task.t} · ${pctS(r.taskP)}`);
    if (r.noplan) h += miss('день не распланирован');
  } else h += row('Задачи', null, 'нет данных');
  return h;
}

/* ===================== date picker ===================== */
const PRESETS = [
  ['today','Сегодня',           () => [TODAY, TODAY]],
  ['week','Неделя',            () => [mondayOf(TODAY), addD(mondayOf(TODAY), 6)]],   // вся неделя пн–вс, будущие дни пустые
  ['month','Месяц',            () => [monStart(TODAY), monEnd(TODAY)]],
  ['pmonth','Прошлый месяц',   () => { const p = addD(monStart(TODAY), -1); return [monStart(p), p]; }],
  ['q','Последние 90 дней',    () => [addD(TODAY, -89), TODAY]],
  ['all','Всё время',          () => [S.days[0]?.date || TODAY, TODAY]]
];

let dpFrom = null, dpTo = null, dpLeft = null;
const DATE_RANGE_KEY = 'life-date-range';

function validStoredDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && iso(parse(value)) === value;
}

function loadDateRange() {
  try {
    const saved = JSON.parse(localStorage.getItem(DATE_RANGE_KEY) || 'null');
    if (!saved) return;
    const preset = PRESETS.find(p => p[0] === saved.preset);
    if (preset) {
      [S.from, S.to] = preset[2]();
      S.preset = saved.preset;
    } else if (saved.preset === 'custom' && validStoredDate(saved.from) && validStoredDate(saved.to)
      && saved.from <= saved.to && saved.to <= TODAY) {
      S.from = saved.from;
      S.to = saved.to;
      S.preset = 'custom';
    }
  } catch {}
}

function saveDateRange() {
  try { localStorage.setItem(DATE_RANGE_KEY, JSON.stringify({ from:S.from, to:S.to, preset:S.preset })); } catch {}
}

function initDate() {
  const ctrl = $('#dateCtrl'), btn = $('#dateBtn'), pop = $('#datePop');
  btn.onclick = e => {
    e.stopPropagation();
    const open = !pop.hidden;
    closeAll();
    if (!open) { dpFrom = S.from; dpTo = S.to; dpLeft = monStart(addD(monStart(S.to), -1)); pop.hidden = false; ctrl.classList.add('is-open'); drawDate(); }
  };
  pop.onclick = e => e.stopPropagation();
  applyDateLabel();
}

const QUICK = [['week','Неделя'], ['month','Месяц']];

function renderQuick() {
  const box = $('#quick'); box.innerHTML = '';
  QUICK.forEach(([id, name]) => {
    const b = el('button','quick__b' + (S.preset === id ? ' is-on' : ''), name);
    b.onclick = () => setRange(...PRESETS.find(p => p[0] === id)[2](), id);
    box.append(b);
  });
}
function setRange(a, z, preset) {
  S.from = a; S.to = z; S.preset = preset;
  saveDateRange();
  closeAll(); applyDateLabel(); render();
}

function applyDateLabel() {
  const p = PRESETS.find(p => p[0] === S.preset);
  $('#dateLabel').textContent = p ? p[1] : span(S.from, S.to);
  renderQuick();
}

function drawDate() {
  const pop = $('#datePop');
  pop.innerHTML = '';
  const pres = el('div','dp__presets');
  PRESETS.forEach(([id, name, fn]) => {
    const b = el('button','dp__preset' + (S.preset === id ? ' is-active' : ''), name);
    b.onclick = () => setRange(...fn(), id);
    pres.append(b);
  });
  const right = el('div','dp__right');
  const months = el('div','dp__months');
  months.append(monthView(dpLeft, true), monthView(monStart(addD(monEnd(dpLeft), 1)), false));
  const foot = el('div','dp__foot', `<span class="dp__cur">${dpFrom ? long(dpFrom) : '…'} — ${dpTo ? long(dpTo) : '…'}</span>`);
  const cancel = el('button','btn','Отмена'); cancel.onclick = closeAll;
  const ok = el('button','btn btn--primary','Применить');
  ok.onclick = () => { if (dpFrom) setRange(dpFrom, dpTo || dpFrom, 'custom'); };
  foot.append(cancel, ok);
  right.append(months, foot);
  pop.append(pres, right);
}

function monthView(mStart, withPrev) {
  const d = parse(mStart), Y = d.getFullYear(), M = d.getMonth();
  const wrap = el('div','dp__month');
  const nav = el('div','dp__nav');
  if (withPrev) {
    const b = el('button','dp__navbtn','<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M15 18l-6-6 6-6"/></svg>');
    b.onclick = () => { dpLeft = monStart(addD(mStart, -1)); drawDate(); };
    nav.append(b);
  } else nav.append(el('span'));
  nav.append(el('span','dp__mname', `${MON[M]} ${Y}`));
  if (!withPrev) {
    const b = el('button','dp__navbtn','<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 18l6-6-6-6"/></svg>');
    b.disabled = monStart(TODAY) <= mStart;
    b.onclick = () => { dpLeft = monStart(addD(mStart, 1)); drawDate(); };
    nav.append(b);
  } else nav.append(el('span'));

  const grid = el('div','dp__grid');
  DOW.forEach(w => grid.append(el('div','dp__dow', w)));
  const first = (new Date(Y, M, 1).getDay() + 6) % 7;
  for (let i = 0; i < first; i++) grid.append(el('span'));
  const last = new Date(Y, M+1, 0).getDate();
  for (let day = 1; day <= last; day++) {
    const ds = iso(new Date(Y, M, day));
    const dow = (new Date(Y, M, day).getDay() + 6) % 7;
    const b = el('button','dp__day' + (dow > 4 ? ' is-we' : ''), String(day));
    b.disabled = ds > TODAY;
    const a = dpFrom, z = dpTo;
    if (a && z && ds > a && ds < z) b.classList.add('in-range');
    if (ds === a || ds === z) {
      b.classList.add('is-edge');
      b.classList.add(a === z ? 'edge-both' : ds === a ? 'edge-start' : 'edge-end');
    }
    b.onclick = () => {
      if (!dpFrom || (dpFrom && dpTo)) { dpFrom = ds; dpTo = null; }
      else if (ds < dpFrom) { dpTo = dpFrom; dpFrom = ds; }
      else dpTo = ds;
      drawDate();
    };
    grid.append(b);
  }
  wrap.append(nav, grid);
  return wrap;
}

/* ===================== вид графика ===================== */
const VIEW_DEF = { hab:true, task:true, lines:true, zones:true };
function loadView() {
  try {
    const v = JSON.parse(localStorage.getItem('life-view') || 'null');
    if (v) return { ...VIEW_DEF, ...v };
    const old = localStorage.getItem('life-show');          // прежний переключатель «Обе / Привычки / Задачи»
    if (old && old !== 'both') return { ...VIEW_DEF, hab: old === 'hab', task: old === 'task' };
  } catch {}
  return { ...VIEW_DEF };
}
const VIEW_ITEMS = [
  ['hab',   'Привычки'],
  ['task',  'Задачи'],
  null,
  ['lines', 'Линии'],
  ['zones', 'Зоны']
];
/* галочки прямо в шапке таймлайна */
function initView() { drawView(); }
function drawView() {
  const box = $('#viewChecks'); box.innerHTML = '';
  VIEW_ITEMS.forEach(it => {
    if (!it) { box.append(el('span','vchk__sep')); return; }
    const [k, name] = it;
    const row = el('button','chan__row vchk__i' + (S.view[k] ? ' on' : ''), `
      <span class="chan__box"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><path d="M5 13l4 4L19 7"/></svg></span>
      <span>${name}</span>`);
    row.setAttribute('aria-pressed', S.view[k]);
    row.onclick = () => {
      S.view[k] = !S.view[k];
      try { localStorage.setItem('life-view', JSON.stringify(S.view)); } catch {}
      drawView(); renderTimeline();
    };
    box.append(row);
  });
}

/* ===================== лист «Привычки» ===================== */
const HABIT_PERIODS = [
  ['week', 'Неделя'],
  ['half', 'Полгода']
];
const HABIT_COLORS = ['var(--s1)','var(--s3)','var(--s6)','var(--s4)','var(--s5)','var(--s2)'];
const hasOwn = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);

function loadHabitRange() {
  try {
    const v = localStorage.getItem('life-habit-range');
    if (HABIT_PERIODS.some(([id]) => id === v)) return v;
  } catch {}
  return 'half';
}

function loadHabitToday() {
  const rec = S.byDate.get(TODAY) || null;
  const ids = S.habits.filter(h => h.active).map(h => h.id);
  if (rec?.h) Object.keys(rec.h).forEach(id => { if (!ids.includes(id)) ids.push(id); });
  const initial = Object.fromEntries(ids.map(id => [id, !!rec?.h?.[id]]));
  S.H = {
    date: TODAY, rec, ids,
    h: { ...initial }, initial,
    initialKnown: Object.fromEntries(ids.map(id => [id, hasOwn(rec?.h, id)]))
  };
}

const isHabitDirty = () => !!S.H && S.H.ids.some(id => S.H.h[id] !== S.H.initial[id]);

function habitPeriod() {
  if (S.habitRange === 'week') {
    const gridFrom = mondayOf(TODAY);
    return { from:gridFrom, to:TODAY, gridFrom, gridTo:addD(gridFrom, 6) };
  }
  const count = 183;
  const from = addD(TODAY, 1 - count);
  return { from, to:TODAY, gridFrom:mondayOf(from), gridTo:addD(mondayOf(TODAY), 6) };
}

function habitValue(id, date) {
  if (date > TODAY) return 'future';
  if (date === TODAY && S.H) {
    if (S.H.initialKnown[id] || S.H.h[id] !== S.H.initial[id]) return S.H.h[id];
    return null;
  }
  const rec = S.byDate.get(date);
  return hasOwn(rec?.h, id) ? !!rec.h[id] : null;
}

function habitStreak(id) {
  const today = habitValue(id, TODAY);
  if (today === false) return 0;
  let date = today === true ? TODAY : addD(TODAY, -1);
  let n = 0;
  while (n < 5000 && habitValue(id, date) === true) { n++; date = addD(date, -1); }
  return n;
}

function renderHabitPeriods() {
  const box = $('#habitPeriods'); box.innerHTML = '';
  HABIT_PERIODS.forEach(([id, name]) => {
    const b = el('button','quick__b' + (S.habitRange === id ? ' is-on' : ''), name);
    b.setAttribute('aria-pressed', S.habitRange === id);
    b.onclick = () => {
      S.habitRange = id;
      try { localStorage.setItem('life-habit-range', id); } catch {}
      renderHabits();
    };
    box.append(b);
  });
}

function habitCell(id, date) {
  const value = habitValue(id, date);
  const state = value === true ? 'done' : value === false ? 'missed' : value === 'future' ? 'future' : 'unknown';
  const c = el('span', `hcell is-${state}` + (date === TODAY ? ' is-today' : ''));
  const note = state === 'done' ? 'сделано' : state === 'missed' ? 'не сделано' : state === 'future' ? 'будущий день' : 'нет отметки';
  c.title = `${long(date)} — ${note}`;
  c.setAttribute('role', 'img');
  c.setAttribute('aria-label', c.title);
  return c;
}

function habitHeatmap(id, period) {
  const wrap = el('div','hscroll');
  const dates = datesOf(period.gridFrom, period.gridTo);
  if (S.habitRange === 'week') {
    const weekdays = el('div','hweekdays');
    dates.forEach(date => {
      const d = parse(date), day = DOW[(d.getDay() + 6) % 7];
      weekdays.append(el('span','hweekday', `${day}<b>${d.getDate()}</b>`));
    });
    const map = el('div','hmap hmap--week');
    dates.forEach(date => map.append(habitCell(id, date)));
    wrap.append(weekdays, map);
    return wrap;
  }

  const weeks = Math.ceil(dates.length / 7);
  const markers = [];
  for (let w = 0; w < weeks; w++) {
    const date = addD(period.gridFrom, w * 7), d = parse(date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!markers.length || markers[markers.length - 1].key !== key) markers.push({ col:w, key, label:MON[d.getMonth()].slice(0,3) });
  }
  const months = el('div','hmonths');
  months.style.gridTemplateColumns = `repeat(${weeks}, var(--hcell-size))`;
  markers.forEach((m, i) => {
    const n = el('span','hmonth', m.label);
    n.style.gridColumn = `${m.col + 1} / span ${Math.max(1, (markers[i + 1]?.col ?? weeks) - m.col)}`;
    months.append(n);
  });
  const map = el('div','hmap hmap--long');
  map.style.gridTemplateColumns = `repeat(${weeks}, var(--hcell-size))`;
  dates.forEach(date => {
    const c = habitCell(id, date);
    if (date < period.from) c.className = 'hcell is-pad';
    map.append(c);
  });
  wrap.append(months, map);
  return wrap;
}

function renderHabitSaveBar() {
  const H = S.H, bar = $('#habitSaveBar'); bar.innerHTML = '';
  const dirty = isHabitDirty();
  bar.hidden = !dirty;
  if (!dirty) return;
  const status = '<b>Есть несохранённая отметка за сегодня</b>';
  bar.append(el('span','savebar__t', status));
  const save = el('button','btn btn--primary', GH.token ? 'Сохранить' : 'Нужен ключ');
  save.onclick = () => saveHabitToday(save);
  bar.append(save);
}

function habitRangeLabel(from, to) {
  if (from.slice(0,4) === to.slice(0,4)) return span(from, to);
  return `${short(from)} ${from.slice(0,4)} – ${short(to)} ${to.slice(0,4)}`;
}

function renderHabits() {
  if (!S.H || S.H.date !== TODAY) loadHabitToday();
  renderHabitPeriods();
  const box = $('#habitCards'); box.innerHTML = '';
  const habits = S.habits.filter(h => h.active);
  if (!habits.length) box.append(el('div','card habit-empty','Нет активных привычек. Добавь их на листе «Отметить».'));
  const period = habitPeriod();
  habits.forEach((habit, index) => {
    const streak = habitStreak(habit.id);
    const card = el('article','hcard');
    card.style.setProperty('--habit-accent', HABIT_COLORS[index % HABIT_COLORS.length]);
    const head = el('div','hcard__head');
    const identity = el('div','hcard__identity', `<i class="hcard__dot"></i><h2 class="hcard__name">${esc(habit.name)}</h2>`);
    const meta = el('div','hcard__meta');
    const streakText = `${streak} ${plural(streak,['день','дня','дней'])}`;
    const streakNode = el('span','hcard__streak', `<span class="hcard__flame" aria-hidden="true">🔥</span><span>Серия <b>${streak}</b> ${plural(streak,['день','дня','дней'])}</span>`);
    streakNode.setAttribute('aria-label', `Серия: ${streakText}`);
    streakNode.title = streakNode.getAttribute('aria-label');
    meta.append(streakNode);
    const todayOn = !!S.H.h[habit.id];
    const today = el('button','hcard__today' + (todayOn ? ' on' : ''), `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>`);
    today.setAttribute('aria-pressed', todayOn);
    today.setAttribute('aria-label', `${habit.name}: ${todayOn ? 'сделано сегодня' : 'отметить сделанной сегодня'}`);
    today.title = todayOn ? 'Сделано сегодня' : 'Отметить сегодня';
    today.onclick = () => { S.H.h[habit.id] = !S.H.h[habit.id]; renderHabits(); };
    head.append(identity, meta, today);
    card.append(head, el('div','hcard__range', `${habitRangeLabel(period.from, period.to)} · одна клетка — один день`), habitHeatmap(habit.id, period));
    box.append(card);
  });
  renderHabitSaveBar();
  if (S.habitRange !== 'week') requestAnimationFrame(() => {
    $$('#habitCards .hscroll').forEach(n => { n.scrollLeft = n.scrollWidth; });
  });
}

async function saveHabitToday(btn) {
  if (iso(new Date()) !== TODAY) { toast('Наступил новый день — обнови страницу перед сохранением'); return; }
  if (!GH.token) { toast('Подключи ключ доступа на листе «Отметить», затем вернись сюда'); return; }
  const H = S.H;
  const active = S.habits.filter(h => h.active).map(h => h.id);
  const changed = new Set(H.ids.filter(id => H.h[id] !== H.initial[id]));
  const done = active.filter(id => H.h[id]).length;
  const msg = `${short(TODAY)} · привычки ${done}/${active.length}`;
  try {
    busy(btn, true);
    $$('#habitCards .hcard__today').forEach(b => b.disabled = true);
    const next = await ghSave(FILES.days, days => {
      const old = days.find(d => d.date === TODAY) || {};
      const h = { ...(old.h || {}) };
      changed.forEach(id => { h[id] = !!H.h[id]; });
      active.forEach(id => { if (!hasOwn(h, id)) h[id] = false; });   // невыполненные тоже пишем — иначе день считается из отмеченных
      const rec = { date:TODAY, ...old, h };
      return [...days.filter(d => d.date !== TODAY), rec].sort((a,b) => a.date.localeCompare(b.date));
    }, msg);
    setData(S.habits, next);
    if (S.M?.date === TODAY && !isDirty()) loadMark(TODAY);
    loadHabitToday(); renderHabits();
    toast('Сохранено: ' + msg);
  } catch (e) {
    toast('Не сохранилось: ' + e.message);
    $$('#habitCards .hcard__today').forEach(b => b.disabled = false);
  } finally { busy(btn, false); }
}

/* ===================== GitHub как хранилище ===================== */
const GH = {
  get token() { try { return localStorage.getItem('life-gh-token') || ''; } catch { return ''; } },
  set token(v) { try { v ? localStorage.setItem('life-gh-token', v) : localStorage.removeItem('life-gh-token'); } catch {} }
};

function b64enc(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = ''; bytes.forEach(b => bin += String.fromCharCode(b));
  return btoa(bin);
}
const b64dec = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g,'')), c => c.charCodeAt(0)));
/* одна запись — одна строка: так в истории коммитов видно, какой день поменялся */
const fmt = arr => '[\n' + arr.map(x => ' ' + JSON.stringify(x)).join(',\n') + '\n]\n';

async function ghApi(path, opts = {}) {
  const h = { 'Accept':'application/vnd.github+json', ...(opts.headers || {}) };
  if (GH.token) h.Authorization = 'Bearer ' + GH.token;
  const r = await fetch(`https://api.github.com/repos/${REPO}${path}`, { ...opts, headers: h });
  const txt = await r.text();
  if (!r.ok) throw new Error(`${r.status}: ${(JSON.parse(txt || '{}').message) || txt.slice(0,120)}`);
  return txt ? JSON.parse(txt) : {};
}
async function ghRead(file) {
  const j = await ghApi(`/contents/${file}?ref=main&_=${Date.now()}`);
  return { sha: j.sha, data: JSON.parse(b64dec(j.content)) };
}
/* запись с проверкой sha: если файл успели поменять с другого устройства — перечитать и повторить */
async function ghSave(file, mutate, message) {
  let last;
  for (let i = 0; i < 3; i++) {
    const { sha, data } = await ghRead(file);
    const next = mutate(data);
    try {
      await ghApi(`/contents/${file}`, { method:'PUT', body: JSON.stringify({
        message, content: b64enc(fmt(next)), sha, branch:'main' }) });
      return next;
    } catch (e) { last = e; if (!/^(409|422)/.test(e.message)) throw e; }
  }
  throw last;
}

async function reload() {
  try {
    const [h, d] = await Promise.all([FILES.habits, FILES.days].map(async f => GH.token
      ? (await ghRead(f)).data
      : fetch(f + '?_=' + Date.now(), {cache:'no-store'}).then(r => r.json())));
    setData(h, d);
    S.reviews = await loadReviews();
    if (S.M && !isDirty()) loadMark(S.M.date);
    if (S.H && !isHabitDirty()) loadHabitToday();
    render();
  } catch (e) { toast('Не удалось обновить данные: ' + e.message); }
}

/* ===================== лист «Отметить» ===================== */
function loadMark(date) {
  const rec = S.byDate.get(date) || null;
  const ids = S.habits.filter(h => h.active).map(h => h.id);
  if (rec?.h) Object.keys(rec.h).forEach(i => { if (!ids.includes(i)) ids.push(i); });   // отключённые позже — тоже показать
  S.M = {
    date, rec, ids,
    h: Object.fromEntries(ids.map(i => [i, !!rec?.h?.[i]])),
    done: rec?.done || 0, planned: rec?.planned || 0,
    k: Array.from({ length: KEYS }, (_, i) => ({ d: !!rec?.k?.[i]?.d })),
    hTouched: false, tTouched: false, kTouched: false
  };
}
const isDirty = () => !!S.M && (S.M.hTouched || S.M.tTouched || S.M.kTouched);

function renderMark() {
  renderAuth();
  const M = S.M;
  const rel = M.date === TODAY ? 'сегодня' : M.date === addD(TODAY, -1) ? 'вчера'
    : `${daysIn(M.date, TODAY) - 1} ${plural(daysIn(M.date, TODAY) - 1, ['день','дня','дней'])} назад`;
  const nav = $('#dayNav');
  nav.innerHTML = `
    <button class="day__nav" id="dPrev" aria-label="Предыдущий день"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M15 18l-6-6 6-6"/></svg></button>
    <div class="day__mid"><div class="day__t">${dayName(M.date)}</div><div class="day__s">${rel} · нажми, чтобы выбрать дату</div>
      <input class="day__inp" type="date" id="dPick" value="${M.date}" max="${TODAY}"></div>
    <button class="day__nav" id="dNext" aria-label="Следующий день"${M.date >= TODAY ? ' disabled' : ''}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 18l6-6-6-6"/></svg></button>`;
  const goDay = d => {
    if (!d || d > TODAY || d === M.date) return;
    if (isDirty() && !confirm('Отметки за этот день не сохранены. Переключиться без сохранения?')) return renderMark();
    loadMark(d); renderMark();
  };
  $('#dPrev').onclick = () => goDay(addD(M.date, -1));
  $('#dNext').onclick = () => goDay(addD(M.date, 1));
  $('#dPick').onchange = e => goDay(e.target.value);

  // привычки
  const hd = M.ids.filter(i => M.h[i]).length, ht = M.ids.length;
  const showH = M.hTouched || M.rec?.h;
  setPill('#habPill', showH ? pct(hd, ht) : null, showH ? `${hd}/${ht} · ${pctS(pct(hd, ht))}` : `0/${ht}`);
  const list = $('#habList'); list.innerHTML = '';
  M.ids.forEach(id => {
    const b = el('button','hb' + (M.h[id] ? ' on' : ''), `
      <span class="hb__box"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4"><path d="M5 13l4 4L19 7"/></svg></span>
      <span class="hb__n">${esc(habitName(id))}</span>`);
    b.onclick = () => { M.h[id] = !M.h[id]; M.hTouched = true; renderMark(); };
    list.append(b);
  });

  // ключевые задачи: сами задачи выписаны у Глеба в другом месте — здесь только отметка 1/2/3
  const kd = M.k.filter(x => x.d).length, showK = M.kTouched || M.rec?.k;
  setPill('#keyPill', showK ? pct(kd, KEYS) : null, showK ? `${kd}/${KEYS} · ${pctS(pct(kd, KEYS))}` : `0/${KEYS}`);
  const kl = $('#keyList'); kl.innerHTML = '';
  M.k.forEach((item, i) => {
    const b = el('button','hb' + (item.d ? ' on' : ''), `
      <span class="hb__box"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4"><path d="M5 13l4 4L19 7"/></svg></span>
      <span class="hb__n">Ключевая задача ${i + 1}</span>`);
    b.onclick = () => { item.d = !item.d; M.kTouched = true; renderMark(); };
    kl.append(b);
  });

  // задачи
  const showT = M.planned > 0;
  setPill('#taskPill', showT ? pct(M.done, M.planned) : 0, showT ? `${M.done}/${M.planned} · ${pctS(pct(M.done, M.planned))}` : 'не распланирован · 0%');
  const tb = $('#taskBox'); tb.innerHTML = '';
  [['done','Сделано'], ['planned','Поставлено']].forEach(([k, name]) => {
    const w = el('div','st', `<div class="st__l">${name}</div>`);
    const r = el('div','st__row');
    const minus = el('button','st__b','−'), plus = el('button','st__b','+');
    const inp = el('input','st__inp'); inp.type = 'number'; inp.min = 0; inp.inputMode = 'numeric'; inp.value = M[k];
    const set = v => {
      v = Math.max(0, Math.round(v) || 0);
      M[k] = v;
      if (k === 'done' && v > M.planned) M.planned = v;      // сделал больше, чем ставил — значит, ставил столько же
      if (k === 'planned' && M.done > v) M.done = v;
      M.tTouched = true; renderMark();
    };
    minus.onclick = () => set(M[k] - 1);
    plus.onclick  = () => set(M[k] + 1);
    inp.onchange  = () => set(parseFloat(inp.value));
    r.append(minus, inp, plus); w.append(r); tb.append(w);
  });
  tb.append(el('div','steps__note', '0 поставленных — день не распланирован: считается как 0 из 1'));

  renderSaveBar();
  renderMng();
}

function renderSaveBar() {
  const M = S.M;
  const bar = $('#saveBar'); bar.innerHTML = '';
  const known = M.rec && (M.rec.h || M.rec.k || M.rec.planned != null);
  bar.append(el('span','savebar__t', isDirty() ? '<b>Есть несохранённые изменения</b>'
    : known ? 'День сохранён' : 'День ещё не отмечен'));
  const save = el('button','btn btn--primary','Сохранить');
  save.disabled = !isDirty();
  save.onclick = () => saveDay(save);
  bar.append(save);
}

function setPill(sel, p, text) {
  const n = $(sel); n.textContent = text;
  n.className = 'pill' + (zone(p) ? ' z-' + zone(p) : '');
}

async function saveDay(btn) {
  if (!requireToken()) return;
  const M = S.M;
  const patch = {};
  if (M.hTouched || M.rec?.h) patch.h = Object.fromEntries(M.ids.map(i => [i, !!M.h[i]]));
  if (M.tTouched || M.rec?.planned != null) { patch.done = M.done; patch.planned = M.planned; }
  if (M.kTouched || M.rec?.k) patch.k = M.k.map(x => ({ d: !!x.d }));
  const hd = patch.h ? Object.values(patch.h).filter(Boolean).length : null;
  const msg = [short(M.date),
    patch.h && `привычки ${hd}/${Object.keys(patch.h).length}`,
    patch.k && `ключевые ${patch.k.filter(x => x.d).length}/${KEYS}`,
    patch.planned != null && (patch.planned ? `задачи ${patch.done}/${patch.planned}` : 'день не распланирован')].filter(Boolean).join(' · ');
  try {
    busy(btn, true);
    const next = await ghSave(FILES.days, days => {
      const old = days.find(d => d.date === M.date) || {};
      const rec = { date: M.date, ...old, ...patch };
      return [...days.filter(d => d.date !== M.date), rec].sort((a,b) => a.date.localeCompare(b.date));
    }, msg);
    setData(S.habits, next);
    if (S.H && !isHabitDirty()) loadHabitToday();
    loadMark(M.date); renderMark();
    toast('Сохранено: ' + msg);
  } catch (e) { toast('Не сохранилось: ' + e.message); }
  finally { busy(btn, false); }
}

/* ---------- список привычек ---------- */
const SLUG_MAP = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',
  н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };
function slug(s, used) {
  let out = s.toLowerCase().split('').map(c => SLUG_MAP[c] ?? c).join('')
    .replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,24) || 'habit';
  let base = out, i = 2;
  while (used.includes(out)) out = `${base}_${i++}`;
  return out;
}

function renderMng() {
  const box = $('#mngBox');
  const E = S.edit = S.edit || S.habits.map(h => ({ ...h }));
  const changed = JSON.stringify(E) !== JSON.stringify(S.habits);
  box.innerHTML = '';
  E.forEach((h, i) => {
    const r = el('div','mr' + (h.active ? '' : ' is-off'));
    const inp = el('input','inp'); inp.value = h.name; inp.placeholder = 'Название привычки';
    inp.oninput = () => { h.name = inp.value; mngFoot(); };
    const tg = el('button','btn mr__tg', h.active ? 'Отключить' : 'Вернуть');
    tg.onclick = () => {
      if (h.isNew) E.splice(i, 1); else h.active = !h.active;
      renderMng();
    };
    if (h.isNew) tg.textContent = 'Убрать';
    r.append(inp, tg); box.append(r);
  });
  const foot = el('div','mng__foot'); foot.id = 'mngFoot'; box.append(foot);
  mngFoot(changed);
}
function mngFoot() {
  const E = S.edit, foot = $('#mngFoot'); if (!foot) return;
  const changed = JSON.stringify(E) !== JSON.stringify(S.habits);
  foot.innerHTML = '';
  const add = el('button','btn','+ Добавить привычку');
  add.onclick = () => { E.push({ id:'', name:'', active:true, isNew:true }); renderMng(); $$('#mngBox .inp').pop()?.focus(); };
  foot.append(add);
  if (changed) {
    const cancel = el('button','btn','Отменить');
    cancel.onclick = () => { S.edit = null; renderMng(); };
    const save = el('button','btn btn--primary','Сохранить список');
    save.onclick = () => saveHabits(save);
    foot.append(cancel, save);
  }
}

async function saveHabits(btn) {
  if (!requireToken()) return;
  if (isDirty() && !confirm('Отметки за день не сохранены и сбросятся. Продолжить?')) return;
  const E = S.edit.filter(h => h.name.trim());
  const used = S.habits.map(h => h.id);
  const list = E.map(h => {
    const o = { id: h.id || slug(h.name.trim(), used), name: h.name.trim(), active: h.active };
    used.push(o.id); return o;
  });
  // привычки не удаляются из файла — иначе в истории потеряются названия
  S.habits.forEach(h => { if (!list.some(x => x.id === h.id)) list.push(h); });
  const added = list.filter(h => !S.habits.some(o => o.id === h.id)).length;
  const msg = 'Список привычек' + (added ? ` · +${added}` : '') + ` · активных ${list.filter(h => h.active).length}`;
  try {
    busy(btn, true);
    const next = await ghSave(FILES.habits, () => list, msg);
    setData(next, S.days);
    if (S.H && !isHabitDirty()) loadHabitToday();
    S.edit = null; loadMark(S.M.date); renderMark();
    toast('Сохранено: ' + msg);
  } catch (e) { toast('Не сохранилось: ' + e.message); }
  finally { busy(btn, false); }
}

/* ---------- подключение ---------- */
function renderAuth() {
  const box = $('#authCard');
  if (GH.token) {
    box.innerHTML = `<div class="auth auth--on"><span class="auth__dot"></span>
      <span>Подключено к <b>${REPO}</b></span><button class="btn" id="authOff">Отключить</button></div>`;
    $('#authOff').onclick = () => { GH.token = ''; renderMark(); };
    return;
  }
  box.innerHTML = `<div class="auth">
    <div class="auth__head">Чтобы сохранять отметки с этого устройства, нужен ключ доступа</div>
    <ol class="auth__steps">
      <li>Открой <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">страницу создания токена</a></li>
      <li>Repository access → <b>Only select repositories</b> → <b>${REPO.split('/')[1]}</b></li>
      <li>Permissions → <b>Contents</b> → <b>Read and write</b></li>
      <li>Generate token, скопируй и вставь сюда</li>
    </ol>
    <div class="auth__row">
      <input class="inp" id="tokenInp" type="password" placeholder="github_pat_..." autocomplete="off">
      <button class="btn btn--primary" id="authOn">Подключить</button>
    </div>
    <div class="auth__note">Ключ хранится только в этом браузере и уходит только в GitHub.</div></div>`;
  $('#authOn').onclick = async () => {
    const v = $('#tokenInp').value.trim(); if (!v) return;
    GH.token = v;
    try { await ghApi(`/contents/${FILES.days}?ref=main`); await reload(); }
    catch (e) { GH.token = ''; toast('Ключ не подошёл: ' + e.message); renderMark(); }
  };
}

function requireToken() {
  if (GH.token) return true;
  toast('Сначала подключи ключ доступа — форма вверху листа');
  scrollTo({ top:0, behavior:'smooth' });
  return false;
}
function busy(btn, on) {
  btn.disabled = on;
  btn.dataset.t = btn.dataset.t || btn.textContent;
  btn.textContent = on ? 'Сохраняю…' : btn.dataset.t;
}
function toast(msg) {
  const n = el('div','toast', esc(msg));
  document.body.append(n);
  setTimeout(() => n.remove(), 4500);
}

/* ===================== misc ===================== */
function closeAll() {
  $$('.pop').forEach(p => p.hidden = true);
  $$('.ctrl').forEach(c => c.classList.remove('is-open'));
}
document.addEventListener('click', closeAll);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });
document.addEventListener('touchstart', e => { if (!e.target.closest('.tl__svg')) S.tipOut?.(); }, {passive:true});
addEventListener('beforeunload', e => { if (isDirty() || isHabitDirty()) e.preventDefault(); });

boot();
