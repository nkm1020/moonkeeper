// ① 하늘 파노라마 (과제 필수) · 강민
// 착륙지에서 지면 2 m 위에 서서 360° 지평선(NASA LOLA)과 해·지구(JPL Horizons)를 봐요.
// 착륙 시각을 끌면 해가 경로를 따라 움직이다가 진짜 능선 뒤로 넘어가요.
//
// 데이터: inputs/visibility.json (표 3의 2) sun_frac[S][T], earth_vis[S][T]
//         inputs/panorama_<site>.json (표 3의 4) horizon_el[360], sun_az/el[T], earth_az/el[T]
//         project_meta.json 착륙지 이름(영어·한국어)
// 화면에서 하는 일은 표시용 처리뿐이에요: 배열에서 다음 일몰(sun_frac < 0.5)·지구몰(earth_vis = 0) 시각 찾기,
// 단위·좌표 바꾸기. 합격/불합격 판정이나 확률 계산은 하지 않아요.

import { t, addStrings, fmt, getLang } from '../i18n.js';
import { time, setGrid } from '../time.js';

const WINDOW_H = 720;        // 경로와 아래 띠: 앞으로 30일
const SIL_RANGE = [-8, 25];  // 작은 실루엣은 모두 같은 세로 눈금 → 크레이터 바닥은 구덩이로 보여요

addStrings({
  en: {
    'sky.loading': 'Loading the LOLA horizon and the JPL Horizons Sun and Earth…',
    'sky.err': 'Couldn’t load {file}.',
    'sky.err.hint': 'Serve the moonkeeper folder (python3 -m http.server) so that /data/inputs/ is reachable from /web/.',
    'sky.retry': 'Retry',
    'sky.sites': 'Landing site',
    'sky.meta': '{ll} · ground {h} m · camera {m} m above the ground',
    'sky.next': 'Replan from this landing',
    'f.sun.set': 'The Sun is {p} above the ridge and drops below half in {d}, behind the {dir} ridge (az {az}).',
    'f.sun.stay': 'The Sun is {p} above the ridge and stays up until the data ends ({end}).',
    'f.sun.rise': 'The Sun is behind the ridge ({p} of the disc shows) and rises in {d}.',
    'f.sun.never': 'The Sun never clears the ridge here between November 2026 and December 2028.',
    'f.earth.set': 'Earth is in view and sets in {d}.',
    'f.earth.stay': 'Earth stays in view until the data ends.',
    'f.earth.rise': 'Earth is below the ridge and rises in {d}.',
    'f.earth.never': 'Earth never rises above the ridge in this period.',
    'ro.sun': 'Sun above the ridge', 'ro.sun.sub': 'of the disc · el {el}, az {az}',
    'ro.sunset': 'Sunset in', 'ro.sunrise': 'Sunrise in',
    'ro.earth': 'Earth', 'ro.earth.in': 'In view', 'ro.earth.out': 'Below the ridge', 'ro.earth.sub': 'el {el}, az {az}',
    'ro.earthset': 'Earthset in', 'ro.earthrise': 'Earthrise in',
    'ro.stay': 'not before the data ends', 'ro.never': 'not in Nov 2026 – Dec 2028',
    'ro.when': '{utc} · {kst}',
    'p.title': 'The sky from 2 m above the ground',
    'p.scale': 'Height ×{x}',
    'p.scale.tip': 'Elevation is drawn {x} times taller than azimuth so the ridge and the Sun can be read.',
    'p.lg.sun': 'Sun, next 30 days', 'p.lg.earth': 'Earth, next 30 days', 'p.lg.behind': 'Dashed: behind the ridge', 'p.lg.day': 'Dots: one day apart',
    'p.centre': 'Centre the view', 'p.c.earth': 'Earth ahead', 'p.c.north': 'North ahead',
    'p.level': '0° level',
    'p.sun': 'Sun {p}', 'p.earth.in': 'Earth in view', 'p.earth.out': 'Earth below the ridge',
    'p.elaz': 'el {el} · az {az}',
    'p.aria': 'Horizon panorama of {site}: the LOLA ridge line with the Sun and Earth and their paths for the next 30 days.',
    'm.sunset': 'Sunset', 'm.sunrise': 'Sunrise', 'm.earthset': 'Earthset', 'm.earthrise': 'Earthrise',
    'tm.title': 'Landing time', 'tm.input': 'Landing time in UTC',
    'tm.bd': '−1 d', 'tm.bh': '−1 h', 'tm.fh': '+1 h', 'tm.fd': '+1 d', 'tm.now': 'Now',
    'tm.bd.l': 'One day earlier', 'tm.bh.l': 'One hour earlier', 'tm.fh.l': 'One hour later', 'tm.fd.l': 'One day later', 'tm.now.l': 'Jump to the current hour',
    'tm.slider': 'Landing time, November 2026 to December 2028',
    'tm.next': 'Next 30 days at {site}', 'tm.row.sun': 'Sun', 'tm.row.earth': 'Earth',
    'tm.hover': '{when} · Sun {p} · {earth}', 'tm.e.in': 'Earth in view', 'tm.e.out': 'no Earth',
    'tm.hint': 'Click a day in the strip to land then.',
    'tm.end': 'Data ends {d}',
    'src.title': 'Sources and limits',
    'src.terrain': 'Terrain', 'src.eph': 'Sun and Earth', 'src.rules': 'Rules', 'src.limits': 'Limits', 'src.files': 'Files',
    'src.terrain.v': '{src}: {files}. Horizon along great circles with the Moon’s curvature, every 0.5°, drawn at 1° steps.',
    'src.eph.v': '{src}, frame {frame}, the site as observer, no atmosphere. Hourly from {t0}.',
    'src.rules.v': 'Sun = share of the solar disc above the local horizon; sunset = the first hour under half. Earth in view = any part of its disc above the horizon; Earthset = the first hour with none.',
    'src.limits.v': '{lim}. Hourly steps, so every time is ±1 h.',
    'src.files.v': '{files} · {ver} · generated {gen} UTC by the Moonkeeper pipeline · real data, not dummy',
  },
  ko: {
    'sky.loading': 'LOLA 지평선과 JPL Horizons 해·지구 위치를 불러오는 중이에요…',
    'sky.err': '{file}을(를) 못 불러왔어요.',
    'sky.err.hint': 'moonkeeper 폴더에서 python3 -m http.server로 띄워야 /web/에서 /data/inputs/를 읽을 수 있어요.',
    'sky.retry': '다시 시도',
    'sky.sites': '착륙지',
    'sky.meta': '{ll} · 지면 높이 {h} m · 카메라는 지면 {m} m 위',
    'sky.next': '이 착륙으로 재계획',
    'f.sun.set': '해가 능선 위로 {p} 보여요. {d} 뒤에 {dir}쪽 능선 뒤로 절반 넘게 가려져요(방위 {az}).',
    'f.sun.stay': '해가 능선 위로 {p} 보여요. 데이터가 끝나는 {end}까지 안 져요.',
    'f.sun.rise': '해가 능선 뒤에 있어요(원반 {p} 보임). {d} 뒤에 떠요.',
    'f.sun.never': '2026년 11월~2028년 12월 동안 해가 이곳 능선 위로 한 번도 안 올라와요.',
    'f.earth.set': '지구가 보여요. {d} 뒤에 져요.',
    'f.earth.stay': '데이터가 끝날 때까지 지구가 계속 보여요.',
    'f.earth.rise': '지구는 능선 아래에 있어요. {d} 뒤에 떠요.',
    'f.earth.never': '이 기간 동안 지구가 능선 위로 안 올라와요.',
    'ro.sun': '능선 위로 보이는 해', 'ro.sun.sub': '원반 기준 · 고도 {el}, 방위 {az}',
    'ro.sunset': '일몰까지', 'ro.sunrise': '일출까지',
    'ro.earth': '지구', 'ro.earth.in': '보여요', 'ro.earth.out': '능선 아래', 'ro.earth.sub': '고도 {el}, 방위 {az}',
    'ro.earthset': '지구몰까지', 'ro.earthrise': '지구돋이까지',
    'ro.stay': '데이터 끝까지 안 져요', 'ro.never': '2026.11~2028.12에 없어요',
    'ro.when': '{utc} · {kst}',
    'p.title': '지면 2 m 위에서 본 하늘',
    'p.scale': '세로 ×{x}',
    'p.scale.tip': '능선과 해가 잘 보이도록 고도를 방위보다 {x}배 늘려 그렸어요.',
    'p.lg.sun': '해, 앞으로 30일', 'p.lg.earth': '지구, 앞으로 30일', 'p.lg.behind': '점선: 능선 뒤', 'p.lg.day': '점: 하루 간격',
    'p.centre': '가운데 방향', 'p.c.earth': '지구 쪽', 'p.c.north': '북쪽',
    'p.level': '0° 수평',
    'p.sun': '해 {p}', 'p.earth.in': '지구 보임', 'p.earth.out': '지구 능선 아래',
    'p.elaz': '고도 {el} · 방위 {az}',
    'p.aria': '{site}의 지평선 파노라마: LOLA 능선과 해·지구, 앞으로 30일의 경로예요.',
    'm.sunset': '일몰', 'm.sunrise': '일출', 'm.earthset': '지구몰', 'm.earthrise': '지구돋이',
    'tm.title': '착륙 시각', 'tm.input': '착륙 시각 (UTC)',
    'tm.bd': '−1일', 'tm.bh': '−1시간', 'tm.fh': '+1시간', 'tm.fd': '+1일', 'tm.now': '지금',
    'tm.bd.l': '하루 전', 'tm.bh.l': '한 시간 전', 'tm.fh.l': '한 시간 뒤', 'tm.fd.l': '하루 뒤', 'tm.now.l': '지금 시각으로',
    'tm.slider': '착륙 시각, 2026년 11월~2028년 12월',
    'tm.next': '{site}의 앞으로 30일', 'tm.row.sun': '해', 'tm.row.earth': '지구',
    'tm.hover': '{when} · 해 {p} · {earth}', 'tm.e.in': '지구 보임', 'tm.e.out': '지구 없음',
    'tm.hint': '띠에서 날짜를 누르면 그때 착륙해요.',
    'tm.end': '데이터는 {d}까지예요',
    'src.title': '출처와 한계',
    'src.terrain': '지형', 'src.eph': '해와 지구', 'src.rules': '규칙', 'src.limits': '한계', 'src.files': '파일',
    'src.terrain.v': '{src}: {files}. 달 곡률을 넣어 대원을 따라 0.5°마다 계산한 지평선을 1° 간격으로 그려요.',
    'src.eph.v': '{src}, 좌표계 {frame}, 착륙지 기준, 대기 없음. {t0}부터 1시간 간격.',
    'src.rules.v': '해 = 해 원반이 지평선 위로 보이는 비율, 일몰 = 처음으로 절반 아래가 되는 시각. 지구 보임 = 원반이 조금이라도 지평선 위, 지구몰 = 처음으로 안 보이는 시각.',
    'src.limits.v': '{lim}. 1시간 간격이라 모든 시각은 ±1시간이에요.',
    'src.files.v': '{files} · {ver} · Moonkeeper 파이프라인이 {gen} UTC에 만듦 · 진짜 데이터',
  },
});

/* ---------------- module state (kept between renders, so a language switch or a step back is instant) ---------------- */
let root = null;            // the screen's element
let ctx = null;             // the frame's ctx of the current render
let vis = null;             // visibility.json { meta, data }
let names = {};             // site id -> { en, ko } from project_meta.json
const P = {};               // site id -> derived panorama
const cur = { site: null, i: 0 };
let centreMode = 'earth';
let rafId = 0, commitTimer = 0;
let ro = null;
let hoverH = null;
let scrolledFor = '';

const $ = (sel) => root && root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = (v) => v.toFixed(1);

/* ---------------- data helpers ---------------- */
const siteIndex = (id) => (vis ? vis.data.site_ids.indexOf(id) : -1);
function siteName(id) {
  const ko = getLang() === 'ko';
  const p = P[id], n = names[id];
  if (p) return ko ? p.name : p.nameEn;
  if (n) return ko ? n.ko : n.en;
  return vis && ko ? vis.data.site_names[siteIndex(id)] : id;
}

function derive({ meta, data: d }) {
  console.assert(d.horizon_el.length === 360, 'horizon_el should have 360 values', d.site_id);
  console.assert(d.sun_el.length === time.n && d.earth_el.length === time.n, 'panorama length differs from the time grid', d.site_id);
  let sx = 0, sy = 0;
  for (let j = 0; j < d.earth_az.length; j += 6) { const a = d.earth_az[j] * Math.PI / 180; sx += Math.sin(a); sy += Math.cos(a); }
  const earthC = Math.round(((Math.atan2(sx, sy) * 180 / Math.PI) + 360) % 360);
  const mm = (arr) => { let lo = Infinity, hi = -Infinity; for (const v of arr) { if (v < lo) lo = v; if (v > hi) hi = v; } return [lo, hi]; };
  const [hzLo, hzHi] = mm(d.horizon_el), [sLo, sHi] = mm(d.sun_el), [eLo, eHi] = mm(d.earth_el);
  return {
    id: d.site_id, name: d.name, nameEn: d.name_en, lat: d.lat, lon: d.lon_east, groundH: d.ground_h_m,
    hz: d.horizon_el, sunAz: d.sun_az, sunEl: d.sun_el, earthAz: d.earth_az, earthEl: d.earth_el,
    sunR: d.sun_radius_deg, earthR: d.earth_radius_deg, earthC,
    lo: Math.floor(Math.min(hzLo, sLo, eLo) - 0.6), hi: Math.ceil(Math.max(hzHi, sHi, eHi) + 1.4), meta,
  };
}
function loadPano(id) {
  if (P[id]) return Promise.resolve(P[id]);
  return ctx.use(`inputs/panorama_${id}.json`).then((f) => (f ? (P[id] = derive(f)) : null));
}

function rows(id) {
  const k = siteIndex(id);
  return { sun: vis.data.sun_frac[k], earth: vis.data.earth_vis[k] };
}
// the first hour after i where test holds; -1 if it never does before the data ends
function nextHour(arr, i, test) {
  for (let j = i + 1; j < arr.length; j++) if (test(arr[j])) return j;
  return -1;
}
function events(id, i) {
  const r = rows(id);
  const sunUp = r.sun[i] >= 0.5, earthUp = r.earth[i] === 1;
  return {
    frac: r.sun[i], sunUp, earthUp,
    sunJ: sunUp ? nextHour(r.sun, i, (v) => v < 0.5) : nextHour(r.sun, i, (v) => v >= 0.5),
    earthJ: earthUp ? nextHour(r.earth, i, (v) => v === 0) : nextHour(r.earth, i, (v) => v === 1),
  };
}

/* ---------------- glyphs: the disc with the share above the ridge ---------------- */
function chordFor(frac) {
  if (frac >= 1) return -1;
  if (frac <= 0) return 1;
  let a = -1, b = 1; // area above a chord at height d (radii, up positive) falls from 1 to 0
  for (let k = 0; k < 40; k++) {
    const m = (a + b) / 2, area = (Math.acos(m) - m * Math.sqrt(1 - m * m)) / Math.PI;
    if (area > frac) a = m; else b = m;
  }
  return (a + b) / 2;
}
let gid = 0;
function sunGlyph(frac, size = 20) {
  const r = 8, cut = -chordFor(frac) * r, id = `sg${gid++}`;
  return `<svg class="glyph" viewBox="-10 -10 20 20" width="${size}" height="${size}" aria-hidden="true">
    <defs><clipPath id="${id}"><rect x="-10" y="-10" width="20" height="${(cut + 10).toFixed(2)}"/></clipPath></defs>
    <circle r="${r}" class="g-sun-hidden"/><circle r="${r}" class="g-sun" clip-path="url(#${id})"/>
    ${frac > 0 && frac < 1 ? `<line x1="-10" x2="10" y1="${cut.toFixed(2)}" y2="${cut.toFixed(2)}" class="g-ridge"/>` : ''}</svg>`;
}
function earthGlyph(up, size = 20) {
  return `<svg class="glyph" viewBox="-10 -10 20 20" width="${size}" height="${size}" aria-hidden="true"><circle r="7" class="${up ? 'g-earth' : 'g-earth-off'}"/></svg>`;
}

/* ---------------- markup ---------------- */
function shell() {
  root.innerHTML = `
    <section class="sites" aria-label="${esc(t('sky.sites'))}">
      <div class="site-strip" role="tablist" aria-label="${esc(t('sky.sites'))}" id="site-strip"></div>
    </section>
    <section class="title-row">
      <div class="title-text">
        <h1 id="sky-h1"></h1>
        <p class="meta-line" id="sky-meta"></p>
        <p class="finding" id="sky-finding"></p>
      </div>
      <button type="button" class="btn primary" id="sky-next">${esc(t('sky.next'))}</button>
    </section>
    <section class="kpis" id="readout" aria-live="polite"></section>
    <section class="pano-panel" aria-labelledby="pano-h">
      <header class="panel-head">
        <h2 id="pano-h">${esc(t('p.title'))}</h2>
        <div class="pano-tools">
          <span class="scale" id="pano-scale"></span>
          <div class="segmented" role="group" aria-label="${esc(t('p.centre'))}">
            <button type="button" data-centre="earth" aria-pressed="${centreMode === 'earth'}">${esc(t('p.c.earth'))}</button>
            <button type="button" data-centre="north" aria-pressed="${centreMode === 'north'}">${esc(t('p.c.north'))}</button>
          </div>
        </div>
      </header>
      <div class="stage" id="stage">
        <svg class="yaxis" id="yaxis" aria-hidden="true"></svg>
        <div class="scroller" id="scroller"><svg class="pano" id="pano" role="img"></svg></div>
        <div class="stage-msg" id="stage-msg" hidden></div>
      </div>
      <ul class="legend">
        <li><i class="sw sw-sun"></i>${esc(t('p.lg.sun'))}</li>
        <li><i class="sw sw-earth"></i>${esc(t('p.lg.earth'))}</li>
        <li><i class="sw sw-dash"></i>${esc(t('p.lg.behind'))}</li>
        <li><i class="sw sw-dot"></i>${esc(t('p.lg.day'))}</li>
      </ul>
    </section>
    <section class="panel time-panel" aria-labelledby="time-h">
      <header class="time-head">
        <h2 id="time-h">${esc(t('tm.title'))}</h2>
        <p class="time-now"><span id="time-utc"></span> <span class="muted" id="time-kst"></span></p>
      </header>
      <div class="time-controls">
        <button type="button" class="btn" data-step="-24" aria-label="${esc(t('tm.bd.l'))}">${esc(t('tm.bd'))}</button>
        <button type="button" class="btn" data-step="-1" aria-label="${esc(t('tm.bh.l'))}">${esc(t('tm.bh'))}</button>
        <label class="dt"><span class="sr">${esc(t('tm.input'))}</span>
          <input type="datetime-local" id="time-input" step="3600"><span class="dt-z">UTC</span></label>
        <button type="button" class="btn" data-step="1" aria-label="${esc(t('tm.fh.l'))}">${esc(t('tm.fh'))}</button>
        <button type="button" class="btn" data-step="24" aria-label="${esc(t('tm.fd.l'))}">${esc(t('tm.fd'))}</button>
        <button type="button" class="btn quiet" id="time-nowbtn" aria-label="${esc(t('tm.now.l'))}">${esc(t('tm.now'))}</button>
      </div>
      <div class="slider-wrap">
        <input type="range" id="time-slider" min="0" max="${time.n - 1}" step="1" aria-label="${esc(t('tm.slider'))}">
        <div class="slider-ticks" id="slider-ticks" aria-hidden="true"></div>
      </div>
      <div class="bands-head"><h3 id="bands-h"></h3><p class="muted" id="bands-hover">${esc(t('tm.hint'))}</p></div>
      <div class="bands" id="bands"><svg id="bands-svg" role="img"></svg></div>
    </section>
    <section class="sources" aria-labelledby="src-h">
      <h2 id="src-h">${esc(t('src.title'))}</h2>
      <dl id="src-list"></dl>
    </section>`;
  wire();
}

// one hour index for the whole screen; drawing reads cur, the shared state gets it a moment later
function goTo(i, now = true) {
  cur.i = time.clamp(i);
  scheduleDraw();
  clearTimeout(commitTimer);
  const commit = () => ctx && ctx.set({ time: time.iso(cur.i) });
  if (now) commit(); else commitTimer = setTimeout(commit, 250);
}
function scheduleDraw() {
  if (rafId) return;
  rafId = requestAnimationFrame(() => { rafId = 0; drawMoment(); });
}

function wire() {
  root.querySelectorAll('[data-centre]').forEach((b) => b.addEventListener('click', () => {
    centreMode = b.dataset.centre;
    root.querySelectorAll('[data-centre]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.centre === centreMode)));
    scrolledFor = '';
    drawStrip();
    drawPano();
  }));
  root.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => goTo(cur.i + Number(b.dataset.step))));
  $('#time-nowbtn').addEventListener('click', () => goTo(time.now()));
  const slider = $('#time-slider');
  slider.addEventListener('input', () => goTo(Number(slider.value), false));
  slider.addEventListener('change', () => goTo(Number(slider.value)));
  const input = $('#time-input');
  input.addEventListener('change', () => {
    if (!input.value) return;
    const i = time.index(input.value + 'Z');
    if (i !== null) goTo(i);
  });
  $('#sky-next').addEventListener('click', () => ctx.set({ step: 'replan' }));

  const bands = $('#bands');
  const hourAt = (ev) => {
    const svg = $('#bands-svg'), g = svg._g;
    if (!g) return null;
    const x = ev.clientX - svg.getBoundingClientRect().left - g.left;
    if (x < 0 || x > g.pw) return null;
    return Math.max(0, Math.min(g.span, Math.round((x / g.pw) * WINDOW_H)));
  };
  bands.addEventListener('mousemove', (ev) => { hoverH = hourAt(ev); drawHover(); });
  bands.addEventListener('mouseleave', () => { hoverH = null; drawHover(); });
  bands.addEventListener('click', (ev) => {
    const h = hourAt(ev);
    if (h === null || h === 0) return;
    hoverH = null;
    goTo(cur.i + h);
  });

  if (ro) ro.disconnect();
  ro = new ResizeObserver(() => { if (ready()) { drawPano(); drawBands(); } });
  ro.observe($('#stage'));
}

const ready = () => !!(root && vis && P[cur.site] && root.isConnected);

function stageMsg(html, isError) {
  const msg = $('#stage-msg');
  if (!msg) return;
  msg.hidden = !html;
  msg.classList.toggle('error', !!isError);
  msg.innerHTML = html || '';
}

/* ---------------- drawing ---------------- */
function drawAll() { if (!ready()) return; drawStrip(); drawMoment(); drawSources(); }
function drawMoment() { if (!ready()) return; drawStrip(); drawTitle(); drawReadout(); drawPano(); drawTimeHead(); drawBands(); }

function drawStrip() {
  const el = $('#site-strip');
  if (!el || !vis) return;
  const i = cur.i;
  el.innerHTML = vis.data.site_ids.map((id) => {
    const sel = id === cur.site, ev = events(id, i), p = P[id];
    return `<button type="button" role="tab" class="site" data-site="${id}" aria-selected="${sel}" tabindex="${sel ? 0 : -1}">
      ${p ? silhouette(p, i) : '<span class="sil skel"></span>'}
      <span class="nm">${esc(siteName(id))}</span>
      <span class="now">${sunGlyph(ev.frac, 14)}<span class="num">${fmt.pct(ev.frac)}</span>${earthGlyph(ev.earthUp, 14)}</span>
    </button>`;
  }).join('');
  el.querySelectorAll('.site').forEach((b) => b.addEventListener('click', () => pickSite(b.dataset.site)));
  el.onkeydown = (ev) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) return;
    const ids = vis.data.site_ids, k = ids.indexOf(cur.site);
    const n = ev.key === 'Home' ? 0 : ev.key === 'End' ? ids.length - 1 : (k + (ev.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length;
    ev.preventDefault();
    pickSite(ids[n], true);
  };
}
function pickSite(id, focus) {
  ctx.set({ site: id });
  if (focus) { const b = root.querySelector(`.site[data-site="${id}"]`); if (b) b.focus(); }
}

// a 100 × 24 mini horizon on one shared height scale, with the Sun and Earth as dots while they are up
function silhouette(p, i) {
  const W = 100, H = 24, [lo, hi] = SIL_RANGE, c = centreMode === 'earth' ? p.earthC : 0;
  const y = (el) => H - ((el - lo) / (hi - lo)) * H;
  const x = (az) => ((((az - c + 180) % 360) + 360) % 360) / 360 * W;
  let line = '';
  for (let k = 0; k <= 360; k += 3) { const az = (((c - 180 + k) % 360) + 360) % 360; line += `${k ? 'L' : 'M'}${(k / 360 * W).toFixed(1)},${y(p.hz[az]).toFixed(1)}`; }
  const ev = events(p.id, i);
  const dots = (ev.sunUp ? `<circle class="sil-sun" cx="${x(p.sunAz[i]).toFixed(1)}" cy="${y(p.sunEl[i]).toFixed(1)}" r="2.2"/>` : '')
    + (ev.earthUp ? `<circle class="sil-earth" cx="${x(p.earthAz[i]).toFixed(1)}" cy="${y(p.earthEl[i]).toFixed(1)}" r="2.6"/>` : '');
  return `<svg class="sil" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${dots}<path class="sil-ground" d="${line}L${W},${H}L0,${H}Z"/><path class="sil-ridge" d="${line}"/></svg>`;
}

function drawTitle() {
  const p = P[cur.site], i = cur.i, ev = events(p.id, i);
  $('#sky-h1').textContent = siteName(p.id);
  $('#sky-meta').textContent = t('sky.meta', { ll: fmt.latlon(p.lat, p.lon), h: fmt.num(p.groundH), m: String(p.meta.mast_m ?? 2) });
  let s;
  if (ev.sunUp) {
    s = ev.sunJ >= 0
      ? t('f.sun.set', { p: fmt.pct(ev.frac), d: fmt.dur(ev.sunJ - i), dir: fmt.compass(p.sunAz[ev.sunJ]), az: fmt.deg(p.sunAz[ev.sunJ], 0) })
      : t('f.sun.stay', { p: fmt.pct(ev.frac), end: fmt.date(time.ms(time.n - 1)) });
  } else {
    s = ev.sunJ >= 0 ? t('f.sun.rise', { p: fmt.pct(ev.frac), d: fmt.dur(ev.sunJ - i) }) : t('f.sun.never');
  }
  let e;
  if (ev.earthUp) e = ev.earthJ >= 0 ? t('f.earth.set', { d: fmt.dur(ev.earthJ - i) }) : t('f.earth.stay');
  else e = ev.earthJ >= 0 ? t('f.earth.rise', { d: fmt.dur(ev.earthJ - i) }) : t('f.earth.never');
  $('#sky-finding').textContent = `${s} ${e}`;
}

const when = (j) => { const ms = time.ms(j); return t('ro.when', { utc: fmt.utc(ms, false), kst: fmt.kst(ms) }); };

function drawReadout() {
  const p = P[cur.site], i = cur.i, ev = events(p.id, i);
  const cd = (j, key) => (j >= 0 ? { v: esc(fmt.dur(j - i)), sub: esc(when(j)) } : { v: '<span class="dash">—</span>', sub: esc(t(key)) });
  const sun = cd(ev.sunJ, ev.sunUp ? 'ro.stay' : 'ro.never');
  const earth = cd(ev.earthJ, ev.earthUp ? 'ro.stay' : 'ro.never');
  $('#readout').innerHTML = `
    <div class="ro"><div class="ro-label">${esc(t('ro.sun'))}</div>
      <div class="ro-value">${sunGlyph(ev.frac, 22)}<span class="num">${fmt.pct(ev.frac)}</span></div>
      <div class="ro-sub">${esc(t('ro.sun.sub', { el: fmt.deg(p.sunEl[i], 2), az: fmt.deg(p.sunAz[i], 0) }))}</div></div>
    <div class="ro lead"><div class="ro-label">${esc(t(ev.sunUp ? 'ro.sunset' : 'ro.sunrise'))}</div>
      <div class="ro-value num">${sun.v}</div><div class="ro-sub">${sun.sub}</div></div>
    <div class="ro"><div class="ro-label">${esc(t('ro.earth'))}</div>
      <div class="ro-value">${earthGlyph(ev.earthUp, 22)}<span>${esc(t(ev.earthUp ? 'ro.earth.in' : 'ro.earth.out'))}</span></div>
      <div class="ro-sub">${esc(t('ro.earth.sub', { el: fmt.deg(p.earthEl[i], 2), az: fmt.deg(p.earthAz[i], 0) }))}</div></div>
    <div class="ro lead"><div class="ro-label">${esc(t(ev.earthUp ? 'ro.earthset' : 'ro.earthrise'))}</div>
      <div class="ro-value num">${earth.v}</div><div class="ro-sub">${earth.sub}</div></div>`;
}

/* ----- the panorama ----- */
function geom(p) {
  const yw = 40, avail = Math.max(0, $('#stage').clientWidth - yw);
  const phone = avail < 680;
  const H = phone ? 300 : 310, W = phone ? 980 : Math.floor(avail);
  const top = 28, bot = 30, ph = H - top - bot;
  const c = centreMode === 'earth' ? p.earthC : 0;
  const kX = W / 360, kY = ph / (p.hi - p.lo);
  const x = (az) => ((((az - c + 180) % 360) + 360) % 360) * kX;
  const y = (el) => top + (p.hi - el) * kY;
  return { W, H, yw, top, bot, ph, c, kX, kY, x, y, ex: kY / kX, phone };
}
const tickStep = (span) => { for (const s of [1, 2, 5, 10]) if (span / s <= 7) return s; return 10; };

function trackPaths(az, el, ok, i0, i1, g) {
  const out = { a: '', b: '' };
  let last = null;
  for (let j = i0 + 1; j <= i1; j++) {
    const x0 = g.x(az[j - 1]), y0 = g.y(el[j - 1]), x1 = g.x(az[j]), y1 = g.y(el[j]);
    if (Math.abs(x1 - x0) > g.W / 2) { last = null; continue; } // the path wraps across the panorama's edge
    const k = ok(j) ? 'a' : 'b';
    if (last !== k) { out[k] += `M${f1(x0)},${f1(y0)}`; last = k; }
    out[k] += `L${f1(x1)},${f1(y1)}`;
  }
  return out;
}

function drawPano() {
  const p = P[cur.site], svg = $('#pano'), yax = $('#yaxis');
  if (!p || !svg || !root.isConnected) return;
  stageMsg('');
  const g = geom(p), i = cur.i, ev = events(p.id, i), r = rows(p.id);
  const i1 = Math.min(time.n - 1, i + WINDOW_H);
  svg.setAttribute('viewBox', `0 0 ${g.W} ${g.H}`);
  svg.setAttribute('width', g.W); svg.setAttribute('height', g.H);
  svg.setAttribute('aria-label', t('p.aria', { site: siteName(p.id) }));
  yax.setAttribute('viewBox', `0 0 ${g.yw} ${g.H}`); yax.setAttribute('width', g.yw); yax.setAttribute('height', g.H);

  const ex = g.ex >= 10 ? Math.round(g.ex) : Math.round(g.ex * 10) / 10;
  const sc = $('#pano-scale'); sc.textContent = t('p.scale', { x: ex }); sc.title = t('p.scale.tip', { x: ex });

  // grid and the elevation scale
  const step = tickStep(p.hi - p.lo);
  let grid = '', yl = '';
  for (let v = Math.ceil(p.lo / step) * step; v <= p.hi; v += step) {
    const yy = f1(g.y(v));
    if (v !== 0) grid += `<line class="gl" x1="0" x2="${g.W}" y1="${yy}" y2="${yy}"/>`;
    yl += `<text x="${g.yw - 8}" y="${yy}" dy="4" text-anchor="end">${fmt.deg(v, 0)}</text>`;
  }
  yax.innerHTML = yl;

  // the ridge: 361 points from the left edge (centre − 180°) to the right edge
  let ridge = '';
  for (let k = 0; k <= 360; k++) {
    const az = (((g.c - 180 + k) % 360) + 360) % 360;
    ridge += `${k ? 'L' : 'M'}${f1(k * g.kX)},${f1(g.y(p.hz[az]))}`;
  }
  const ground = `${ridge}L${g.W},${g.H}L0,${g.H}Z`;

  // compass along the foot
  const cn = t('compass').split(',');
  let comp = '';
  for (let a = 0; a < 360; a += 45) {
    const xx = g.x(a);
    if (xx < 14 || xx > g.W - 14) continue;
    comp += `<text x="${f1(xx)}" y="${g.H - 10}" text-anchor="middle">${cn[a / 45]} <tspan class="cdeg">${a}°</tspan></text>`;
  }

  // the Sun and Earth now (drawn under the ground, so the ridge hides what the data hides)
  const sx = g.x(p.sunAz[i]), sy = g.y(p.sunEl[i]), sr = Math.max(4.5, p.sunR * g.kY);
  const exx = g.x(p.earthAz[i]), ey = g.y(p.earthEl[i]), er = Math.max(6, p.earthR * g.kY);

  // the next 30 days of both paths, dashed where the data says hidden
  const sp = trackPaths(p.sunAz, p.sunEl, (j) => r.sun[j] >= 0.5, i, i1, g);
  const ep = trackPaths(p.earthAz, p.earthEl, (j) => r.earth[j] === 1, i, i1, g);
  let dots = '';
  for (let dd = 1; i + dd * 24 <= i1; dd++) {
    const j = i + dd * 24;
    dots += `<circle class="day" cx="${f1(g.x(p.sunAz[j]))}" cy="${f1(g.y(p.sunEl[j]))}" r="${dd % 5 ? 1.6 : 2.4}"/>`;
  }

  // the next sunset / Earthset (or rise) on its path
  const marks = [];
  const mark = (j, key, cls) => {
    if (j < 0 || j > i1) return;
    const az = cls === 'sun' ? p.sunAz[j] : p.earthAz[j], el = cls === 'sun' ? p.sunEl[j] : p.earthEl[j];
    marks.push({ x: g.x(az), y: g.y(el), label: t(key), sub: fmt.dur(j - i), cls });
  };
  mark(ev.sunJ, ev.sunUp ? 'm.sunset' : 'm.sunrise', 'sun');
  mark(ev.earthJ, ev.earthUp ? 'm.earthset' : 'm.earthrise', 'earth');

  // labels beside the discs, kept apart from each other
  const lab = (x0, y0, rr, l1, l2, cls, side) => {
    const right = side ? side > 0 : x0 < g.W - 190;
    const tx = right ? x0 + rr + 10 : x0 - rr - 10;
    const ty = Math.max(g.top + 4, y0 - 3);
    return { tx, ty, anchor: right ? 'start' : 'end', l1, l2, cls, right };
  };
  const sunLab = lab(sx, sy, sr, t('p.sun', { p: fmt.pct(ev.frac) }), t('p.elaz', { el: fmt.deg(p.sunEl[i], 2), az: fmt.deg(p.sunAz[i], 0) }), 'sun');
  let earthLab = lab(exx, ey, er, t(ev.earthUp ? 'p.earth.in' : 'p.earth.out'), t('p.elaz', { el: fmt.deg(p.earthEl[i], 2), az: fmt.deg(p.earthAz[i], 0) }), 'earth');
  const clash = (a, b) => Math.abs(a.ty - b.ty) < 36 && Math.abs(a.tx - b.tx) < 200;
  if (clash(sunLab, earthLab)) {
    earthLab = lab(exx, ey, er, earthLab.l1, earthLab.l2, 'earth', sunLab.right ? -1 : 1);
    if (clash(sunLab, earthLab)) earthLab.ty = sunLab.ty + 36;
  }
  const labText = (L) => `<text class="lab lab-${L.cls}" x="${f1(L.tx)}" y="${f1(L.ty)}" text-anchor="${L.anchor}">${esc(L.l1)}<tspan class="lab2" x="${f1(L.tx)}" dy="15">${esc(L.l2)}</tspan></text>`;
  const markText = (m) => {
    const ty = m.y - 12 > g.top + 14 ? m.y - 12 : m.y + 22;
    const anchor = m.x < 60 ? 'start' : m.x > g.W - 60 ? 'end' : 'middle';
    return `<g class="mk mk-${m.cls}"><circle cx="${f1(m.x)}" cy="${f1(m.y)}" r="4.5"/>
      <text x="${f1(m.x)}" y="${f1(ty)}" text-anchor="${anchor}">${esc(m.label)} <tspan class="mk2">+${esc(m.sub)}</tspan></text></g>`;
  };

  const level = g.y(0);
  svg.innerHTML = `
    <g class="grid">${grid}</g>
    <g class="under">
      <circle class="earth" cx="${f1(exx)}" cy="${f1(ey)}" r="${f1(er)}"/>
      <circle class="sun" cx="${f1(sx)}" cy="${f1(sy)}" r="${f1(sr)}"/>
    </g>
    <path class="ground" d="${ground}"/>
    <path class="ridge" d="${ridge}"/>
    <line class="level" x1="0" x2="${g.W}" y1="${f1(level)}" y2="${f1(level)}"/>
    <text class="level-t" x="6" y="${f1(level - 5)}">${esc(t('p.level'))}</text>
    <g class="over">
      <path class="path-earth" d="${ep.a}"/><path class="path-earth hidden" d="${ep.b}"/>
      <path class="path-sun" d="${sp.a}"/><path class="path-sun hidden" d="${sp.b}"/>
      <g class="days">${dots}</g>
      <circle class="earth-ring" cx="${f1(exx)}" cy="${f1(ey)}" r="${f1(er)}"/>
      <circle class="sun-ring" cx="${f1(sx)}" cy="${f1(sy)}" r="${f1(sr)}"/>
    </g>
    ${marks.map(markText).join('')}
    ${labText(earthLab)}${labText(sunLab)}
    <g class="compass">${comp}</g>`;

  // phone: the panorama scrolls inside its frame; centre it on the Sun once per site
  const scr = $('#scroller'), key = `${p.id}|${centreMode}|${g.phone}`;
  if (g.phone && scrolledFor !== key) scr.scrollLeft = Math.max(0, sx - scr.clientWidth / 2);
  scrolledFor = key;
}

/* ----- the time panel ----- */
function drawTimeHead() {
  const i = cur.i, ms = time.ms(i);
  $('#time-utc').textContent = fmt.utc(ms);
  $('#time-kst').textContent = fmt.kst(ms);
  const slider = $('#time-slider');
  slider.max = String(time.n - 1);
  if (Number(slider.value) !== i) slider.value = String(i);
  slider.setAttribute('aria-valuetext', `${fmt.utc(ms)}, ${fmt.kst(ms)}`);
  const input = $('#time-input');
  input.min = time.iso(0).slice(0, 16);
  input.max = time.iso(time.n - 1).slice(0, 16);
  if (document.activeElement !== input) input.value = time.iso(i).slice(0, 16);
  // slider ticks: the first hour, each new year, the last hour
  // a tick label needs about 80 px; one that would touch its neighbour is left out
  const sw = Math.max(1, slider.clientWidth), all = [0, time.index('2027-01-01T00:00Z'), time.index('2028-01-01T00:00Z'), time.n - 1];
  const ticks = all.filter((k, n) => n === 0 || n === all.length - 1
    || ((k - all[n - 1]) / (time.n - 1)) * sw > 80 && ((all[n + 1] - k) / (time.n - 1)) * sw > 80);
  $('#slider-ticks').innerHTML = ticks.map((k, n) => {
    const cls = n === 0 ? 'first' : n === ticks.length - 1 ? 'last' : '';
    return `<span class="${cls}" style="left:${((k / (time.n - 1)) * 100).toFixed(3)}%">${esc(fmt.month(time.ms(k)))}</span>`;
  }).join('');
  $('#bands-h').textContent = t('tm.next', { site: siteName(cur.site) });
}

function drawBands() {
  const svg = $('#bands-svg'), p = P[cur.site];
  if (!svg || !p || !root.isConnected) return;
  const W = Math.max(280, $('#bands').clientWidth);
  const left = W < 520 ? 44 : 60, pw = W - left - 4, rowH = 22, gapR = 22, top = 20;
  const H = top + rowH * 2 + gapR + 26;
  const i = cur.i, r = rows(p.id), ev = events(p.id, i);
  const span = Math.min(WINDOW_H, time.n - 1 - i);
  const x = (h) => left + (h / WINDOW_H) * pw;
  const yS = top, yE = top + rowH + gapR;
  // Sun: the visible share of the disc as an area, with the half line the sunset rule uses
  let area = `M${f1(x(0))},${yS + rowH}`;
  for (let h = 0; h <= span; h++) area += `L${f1(x(h))},${f1(yS + rowH * (1 - r.sun[i + h]))}`;
  area += `L${f1(x(span))},${yS + rowH}Z`;
  // Earth: one block per run of hours in view
  let blocks = '', run = -1;
  for (let h = 0; h <= span + 1; h++) {
    const on = h <= span && r.earth[i + h] === 1;
    if (on && run < 0) run = h;
    if (!on && run >= 0) { blocks += `<rect class="b-earth" x="${f1(x(run))}" y="${yE}" width="${f1(Math.max(1, x(h) - x(run)))}" height="${rowH}"/>`; run = -1; }
  }
  // days: a faint line each day, a date every 5 days (0, 5 … 30 lands on the end); every 10 on a phone
  let days = '', labels = '';
  for (let d = 0; d <= 30; d++) {
    const xx = f1(x(d * 24));
    if (d > 0 && d < 30) days += `<line class="dl" x1="${xx}" x2="${xx}" y1="${yS}" y2="${yE + rowH}"/>`;
    if (d % (W >= 520 ? 5 : 10) === 0) {
      const anchor = d === 0 ? 'start' : d === 30 ? 'end' : 'middle';
      labels += `<text x="${xx}" y="${H - 6}" text-anchor="${anchor}">${esc(fmt.date(time.ms(i + d * 24), 'UTC', false))}</text>`;
    }
  }
  const evMark = (j, key, y0) => {
    if (j < 0 || j - i > span) return '';
    const xx = f1(x(j - i));
    return `<line class="ev" x1="${xx}" x2="${xx}" y1="${y0 - 4}" y2="${y0 + rowH + 4}"/>`
      + `<text class="ev-t" x="${xx}" y="${y0 - 8}" text-anchor="${(j - i) / WINDOW_H > 0.85 ? 'end' : 'start'}">${esc(t(key))}</text>`;
  };
  const end = span < WINDOW_H ? `<text class="end-t" x="${f1(x(span) + 6)}" y="${yE + rowH / 2 + 4}">${esc(t('tm.end', { d: fmt.date(time.ms(time.n - 1)) }))}</text>` : '';
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('width', W); svg.setAttribute('height', H);
  svg.setAttribute('aria-label', `${t('tm.next', { site: siteName(p.id) })}. ${$('#sky-finding').textContent}`);
  svg.innerHTML = `
    <text class="rl" x="0" y="${yS + rowH / 2 + 4}">${esc(t('tm.row.sun'))}</text>
    <text class="rl" x="0" y="${yE + rowH / 2 + 4}">${esc(t('tm.row.earth'))}</text>
    <rect class="track" x="${left}" y="${yS}" width="${pw}" height="${rowH}"/>
    <rect class="track" x="${left}" y="${yE}" width="${pw}" height="${rowH}"/>
    <path class="b-sun" d="${area}"/>
    ${blocks}
    <g>${days}</g>
    <line class="half" x1="${left}" x2="${f1(x(span))}" y1="${yS + rowH / 2}" y2="${yS + rowH / 2}"/>
    ${evMark(ev.sunJ, ev.sunUp ? 'm.sunset' : 'm.sunrise', yS)}
    ${evMark(ev.earthJ, ev.earthUp ? 'm.earthset' : 'm.earthrise', yE)}
    ${end}
    <line class="hover" id="bands-cursor" x1="0" x2="0" y1="${yS - 2}" y2="${yE + rowH + 2}" visibility="hidden"/>
    <g class="dates">${labels}</g>`;
  svg._g = { left, pw, span, x };
  drawHover();
}

function drawHover() {
  const out = $('#bands-hover'), cursor = $('#bands-cursor'), svg = $('#bands-svg'), p = P[cur.site];
  if (!out || !p) return;
  if (hoverH === null || !svg._g) { out.textContent = t('tm.hint'); if (cursor) cursor.setAttribute('visibility', 'hidden'); return; }
  const i = cur.i + hoverH, r = rows(p.id), ms = time.ms(i);
  out.textContent = t('tm.hover', { when: `${fmt.utc(ms, false)} · ${fmt.kst(ms)}`, p: fmt.pct(r.sun[i]), earth: t(r.earth[i] ? 'tm.e.in' : 'tm.e.out') });
  if (cursor) { const xx = f1(svg._g.x(hoverH)); cursor.setAttribute('x1', xx); cursor.setAttribute('x2', xx); cursor.setAttribute('visibility', 'visible'); }
}

function drawSources() {
  const dl = $('#src-list'), p = P[cur.site];
  if (!dl || !p || !vis) return;
  const m = p.meta, tr = m.terrain || {}, ep = m.ephemeris || {};
  const lim = tr.limits ? tr.limits.charAt(0).toUpperCase() + tr.limits.slice(1) : '';
  dl.innerHTML = [
    ['src.terrain', t('src.terrain.v', { src: tr.source, files: (tr.files || []).join(', ') })],
    ['src.eph', t('src.eph.v', { src: ep.source, frame: m.frame, t0: m.time ? m.time.t0_utc : '' })],
    ['src.rules', t('src.rules.v')],
    ['src.limits', t('src.limits.v', { lim })],
    ['src.files', t('src.files.v', { files: `visibility.json, ${m.file}`, ver: m.version, gen: (m.generated_utc || '').replace('T', ' ').replace('Z', '') })],
  ].map(([k, v]) => `<dt>${esc(t(k))}</dt><dd>${esc(v)}</dd>`).join('');
  console.assert(m.dummy === false && vis.meta.dummy === false, 'data marked as dummy');
}

/* ---------------- screen contract (see js/app.js) ---------------- */
function syncFromState(state) {
  if (vis && state.site && vis.data.site_ids.includes(state.site)) cur.site = state.site;
  if (state.time) { const i = time.index(state.time); if (i !== null) cur.i = time.clamp(i); }
}

export default {
  id: 'sky',
  num: '①',
  label: '하늘 파노라마',
  ownTitle: true,

  async render(el, c) {
    ctx = c;
    root = el;
    const v = await c.use('inputs/visibility.json');
    if (!v) return c.missing(['inputs/visibility.json']);
    vis = v;
    setGrid(vis.data.times_utc);
    const meta = await c.use('project_meta.json');
    if (meta && Array.isArray(meta.data.sites)) names = Object.fromEntries(meta.data.sites.map((s) => [s.id, { en: s.name_en, ko: s.name_ko }]));
    const ids = vis.data.site_ids;
    const st = c.state;
    cur.site = ids.includes(st.site) ? st.site : ids[0];
    const ti = st.time ? time.index(st.time) : null;
    cur.i = ti === null ? time.now() : time.clamp(ti);
    const p = await loadPano(cur.site);
    if (!p) return c.missing([`inputs/panorama_${cur.site}.json`]);
    shell();
  },

  // called by the frame once the screen is on the page (sizes are known now)
  mounted(state) {
    if (!root || !vis) return;
    drawAll();
    // the shared state gets the site and time this screen shows
    if (state.site !== cur.site || state.time !== time.iso(cur.i)) ctx.set({ site: cur.site, time: time.iso(cur.i) });
    vis.data.site_ids.forEach((id) => { if (!P[id]) loadPano(id).then(() => drawStrip()); });
  },

  update(state, changed) {
    if (!root || !vis) return;
    const before = cur.site;
    syncFromState(state);
    if (changed.site && cur.site !== before) {
      if (!P[cur.site]) {
        stageMsg(`<p>${esc(t('sky.loading'))}</p>`);
        drawStrip();
        const id = cur.site;
        loadPano(id).then((pp) => {
          if (pp) { if (cur.site === id) drawAll(); return; }
          stageMsg(`<p>${esc(t('sky.err', { file: `data/inputs/panorama_${id}.json` }))}</p><p class="muted">${esc(t('sky.err.hint'))}</p>
            <button type="button" class="btn" id="sky-retry">${esc(t('sky.retry'))}</button>`, true);
          $('#sky-retry').addEventListener('click', () => this.update(ctx.state, { site: true }));
        });
        return;
      }
      scrolledFor = '';
      drawAll();
      return;
    }
    if (changed.time) scheduleDraw();
  },
};
