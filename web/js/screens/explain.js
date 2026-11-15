// 04 Evidence — "why does the light disappear here, and why should you believe our numbers?"
//
// Layout (one look with screen 01): a true-black stage with a large data drawing, one light answer card over it,
// a burned-in data line, a dark control bar, and the details below the fold in the quiet sources style.
//
// Stage: the horizon around the site drawn from data/inputs/panorama_<site>.json
//   horizon_el (360 values, 1 deg azimuth steps from north, clockwise), hourly sun_az / sun_el / earth_az / earth_el
//   (index i = hours since meta.time.t0_utc = 2026-11-01T00:00Z), sun_radius_deg, earth_radius_deg.
//   The Sun's path covers the mission window: 336 h from the landing time (state.time + state.delay days).
//   The marked event = the first hour in that window where the Sun's centre is below the horizon at its azimuth
//   (horizon_el interpolated at sun_az). This is drawing and array lookup, NOT a verdict.
//   The pass / fail chip on the card is read from data/outputs/heatmap.json (optional file) and nothing else.
// Bar: validation at a glance (data/outputs/validation.json → data.pgda.summary.sun / .earth, data.pgda.points).
// Below the fold: the full validation table (+ NHF rows), what is compared, provenance (data/project_meta.json and
//   validation meta: reference, calc_references, calc_si_usage), limits.
//
// Shared state used: site (default im2), time (default 2026-11-17T12:00Z, the ORIGINAL landing), delay (default 7 days).
// planb is only read for the path line, in the format of screen 02 ("wait:YYYY-MM-DD" or "move:<site_id>"; a bare id is a move).
// Local (not in the URL): the scatter series ('sun' | 'earth').

import { t, addStrings, fmt, getLang } from '../i18n.js';

const HOUR = 3600e3;
const DEF = { site: 'im2', time: '2026-11-17T12:00Z', delay: 7 };
const WINDOW_H = 336;
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const CAUSES = ['power', 'comm', 'approach'];

addStrings({
  en: {
    'ex.h1': 'Every shadow has a reason.',
    'ex.lead': 'Trace the terrain. Inspect the evidence.',
    'ex.sub': 'The real horizon around {site}, the Sun’s path for the 14 days from {date}, and Earth’s track.',
    'ex.sub.range': 'The real horizon around {site}. This landing time is outside the computed period, so no Sun path is drawn.',
    'ex.crumb.orig': 'Original {site}', 'ex.crumb.delay': 'Delay +{n} days', 'ex.crumb.delay1': 'Delay +1 day', 'ex.crumb.nodelay': 'No delay',
    'ex.crumb.alt': 'Alternative {site} · {date}',
    'ex.short.pole': 'South Pole', 'ex.short.shk': 'Shackleton floor',
    'ex.card.title': 'Why light disappears',
    'ex.card.sets': 'The local horizon rises above the Sun.',
    'ex.card.never': 'Here it does not: the Sun’s centre stays above the local horizon for all 14 days.',
    'ex.card.down': 'The Sun’s centre is already below the local horizon at landing.',
    'ex.card.range': 'This landing time is outside the computed period (Nov 2026 to Dec 2028).',
    'ex.card.landing': '{name} · landing {clock} UTC', 'ex.card.delayed': 'delayed +{n} d from {date}',
    'ex.k.after': 'After landing', 'ex.k.dir': 'Direction', 'ex.k.stays': 'Sun’s centre up', 'ex.k.closest': 'Closest to horizon',
    'ex.k.under': 'Under the horizon', 'ex.v.all': '14 d',
    'ex.line.sets': '{when} · horizon {hel}, Sun {sel}',
    'ex.line.never': 'Closest on {when}, toward {az}.',
    'ex.line.down': 'Horizon {hel}, Sun {sel}.',
    'ex.line.rise': 'Clears the horizon on {when}.',
    'ex.line.norise': 'Does not clear the horizon in the 14 days.',
    'ex.verdict': 'Pipeline verdict · assumed criteria',
    'ex.pass': 'Pass', 'ex.fail': 'Fail', 'ex.nc': 'Not computed', 'ex.c.power': 'Power', 'ex.c.comm': 'Comm', 'ex.c.approach': 'Approach',
    'ex.open': 'Open sky panorama',
    'ex.tag.sets': 'Horizon rises above the Sun', 'ex.tag.never': 'Closest to the horizon', 'ex.tag.down': 'Sun under the horizon at landing',
    'ex.tag.clear': '{d} clear', 'ex.tag.under': '{d} under',
    'ex.l.landing': 'Sun at landing', 'ex.l.end': '+14 d', 'ex.l.earth': 'Earth', 'ex.l.elev': 'ELEVATION',
    'ex.svg': 'Horizon diagram for {site}: terrain horizon over azimuth, the Sun’s path for 14 days and Earth’s track.',
    'ex.back': 'Confidence', 'ex.next': 'View decision',
    'ex.val.lab': 'Checked against NASA PGDA', 'ex.val.n': '{n} random points · {a}–{b} · ours (y) vs PGDA (x)', 'ex.val.more': 'Full table',
    'ex.sun': 'Sun visibility', 'ex.earth': 'Earth visibility', 'ex.sun.s': 'Sun', 'ex.earth.s': 'Earth',
    'ex.st.rmse': 'RMSE', 'ex.st.r': 'r {v} · n {n}',
    'ex.sc.series': 'Scatter series', 'ex.sc.title': 'Ours vs NASA PGDA, share of time visible: {s}',
    'ex.cmp.h': 'Compare the evidence.',
    'ex.cmp.val': 'Validation against NASA PGDA',
    'ex.cmp.what': 'What is compared: the share of time the Sun (any part of its disc) and Earth are above the horizon, at {n} random points, over {nt} time steps from {a} to {b} ({yrs} years), observer {h} m above the ground. Reference: {ref}. Values are fractions of time, shown in percentage points (pp).',
    'ex.th.cmp': 'Comparison', 'ex.th.n': 'n', 'ex.th.bias': 'Bias', 'ex.th.rmse': 'RMSE', 'ex.th.mae': 'MAE', 'ex.th.r': 'Pearson r', 'ex.th.loa': '95% limits of agreement',
    'ex.th.unit': 'pp',
    'ex.g.pgda': 'Our precise horizon vs NASA PGDA', 'ex.g.nhf': 'Fast neural horizon (NHF) vs NASA PGDA', 'ex.g.nhfp': 'NHF vs our precise horizon',
    'ex.to': 'to',
    'ex.nhf.h': 'NHF horizon angle error', 'ex.nhf.v': 'median {med} · 95th percentile {p95} · max {max}', 'ex.nhf.note': 'Per-point RMS difference from the precise horizon, {n} points.',
    'ex.prov.h': 'Data provenance',
    'ex.p.terrain': 'Terrain', 'ex.p.files': 'Terrain files', 'ex.p.eph': 'Ephemeris', 'ex.p.frame': 'Frame', 'ex.p.radius': 'Reference radius',
    'ex.p.mast': 'Mast height', 'ex.p.time': 'Time grid', 'ex.p.ref': 'Validation reference', 'ex.p.refs': 'References', 'ex.p.si': 'SI use', 'ex.p.gen': 'Validation computed',
    'ex.p.frame.v': '{frame}, longitude east positive', 'ex.p.time.v': '{scale}, every {step} h, {a} to {b} (exclusive), {n} steps',
    'ex.p.eph.v': '{src}. Observer: {obs}.',
    'ex.p.si.v': 'Code written with SI assistance ({tools}).',
    'ex.lim.h': 'Limits',
    'ex.lim.1': 'Criteria are assumed values. No published threshold was found, so pass and fail rest on our assumptions.',
    'ex.lim.2': 'Terrain smaller than 40 to 80 m (one DEM pixel) is not seen.',
    'ex.lim.3': 'Rays end at the DEM edge, about 80°S. Terrain beyond it is not in the horizon.',
    'ex.lim.4': 'The validation compares long-term visibility, not single events such as one sunset.',
    'ex.meta': '{site} HORIZON · WINDOW {land} +{h} H · {event} · LOLA 40/80 M · JPL HORIZONS DE441 · {scale} · COMPUTED, NOT A PHOTOGRAPH',
    'ex.meta.sets': 'SUN CENTRE BELOW HORIZON {when} · AZ {az}', 'ex.meta.never': 'SUN CENTRE ABOVE HORIZON ALL WINDOW · MIN CLEARANCE {d}',
    'ex.meta.down': 'SUN CENTRE BELOW HORIZON AT LANDING · AZ {az}', 'ex.meta.range': 'LANDING OUTSIDE COMPUTED PERIOD',
    'ex.meta.stretch': 'VERTICAL ×{v}', 'ex.meta.true': 'TRUE PROPORTIONS',
  },
  ko: {
    'ex.h1': '모든 그림자에는 이유가 있어요.',
    'ex.lead': '지형을 따라가 보고, 근거를 확인하세요.',
    'ex.sub': '{site} 주변의 실제 지평선, {date}부터 14일 동안 해가 지나는 길, 지구의 자취예요.',
    'ex.sub.range': '{site} 주변의 실제 지평선이에요. 이 착륙 시각은 계산한 기간 밖이라 해의 길은 그리지 않았어요.',
    'ex.crumb.orig': '원래 {site}', 'ex.crumb.delay': '지연 +{n}일', 'ex.crumb.delay1': '지연 +1일', 'ex.crumb.nodelay': '지연 없음',
    'ex.crumb.alt': '대안 {site} · {date}',
    'ex.short.pole': '남극점', 'ex.short.shk': '섀클턴 바닥',
    'ex.card.title': '빛이 사라지는 이유',
    'ex.card.sets': '그 방향의 지평선이 해보다 높아져요.',
    'ex.card.never': '여기서는 사라지지 않아요. 14일 내내 해의 중심이 지평선 위에 있어요.',
    'ex.card.down': '착륙할 때 해의 중심이 이미 지평선 아래에 있어요.',
    'ex.card.range': '이 착륙 시각은 계산한 기간(2026년 11월 ~ 2028년 12월) 밖이에요.',
    'ex.card.landing': '{name} · {clock} UTC 착륙', 'ex.card.delayed': '{date}에서 +{n}일 지연',
    'ex.k.after': '착륙 뒤', 'ex.k.dir': '방향', 'ex.k.stays': '해 중심이 떠 있는 기간', 'ex.k.closest': '지평선과 가장 가까울 때',
    'ex.k.under': '지평선 아래', 'ex.v.all': '14일',
    'ex.line.sets': '{when} · 지평선 {hel}, 해 {sel}',
    'ex.line.never': '가장 가까운 때는 {when}, {az} 방향이에요.',
    'ex.line.down': '지평선 {hel}, 해 {sel}.',
    'ex.line.rise': '{when}에 지평선 위로 올라와요.',
    'ex.line.norise': '14일 동안 지평선 위로 올라오지 않아요.',
    'ex.verdict': '파이프라인 판정 · 가정한 기준',
    'ex.pass': '통과', 'ex.fail': '실패', 'ex.nc': '계산 안 됨', 'ex.c.power': '전력', 'ex.c.comm': '교신', 'ex.c.approach': '접근로',
    'ex.open': '하늘 파노라마 열기',
    'ex.tag.sets': '지평선이 해보다 높아져요', 'ex.tag.never': '지평선과 가장 가까운 곳', 'ex.tag.down': '착륙 때 해가 지평선 아래',
    'ex.tag.clear': '{d} 위', 'ex.tag.under': '{d} 아래',
    'ex.l.landing': '착륙 때 해', 'ex.l.end': '+14일', 'ex.l.earth': '지구', 'ex.l.elev': '고도',
    'ex.svg': '{site}의 지평선 그림: 방위별 지형 지평선, 14일 동안 해의 길, 지구의 자취.',
    'ex.back': '신뢰도', 'ex.next': '결정 보기',
    'ex.val.lab': 'NASA PGDA와 비교했어요', 'ex.val.n': '무작위 {n}개 지점 · {a}–{b} · 우리(y) vs PGDA(x)', 'ex.val.more': '전체 표',
    'ex.sun': '해 가시성', 'ex.earth': '지구 가시성', 'ex.sun.s': '해', 'ex.earth.s': '지구',
    'ex.st.rmse': 'RMSE', 'ex.st.r': 'r {v} · n {n}',
    'ex.sc.series': '산점도 항목', 'ex.sc.title': '우리 계산 vs NASA PGDA, 보이는 시간 비율: {s}',
    'ex.cmp.h': '근거를 비교해요.',
    'ex.cmp.val': 'NASA PGDA와의 검증',
    'ex.cmp.what': '비교한 것: 해(원반의 일부라도)와 지구가 지평선 위에 있는 시간의 비율이에요. 무작위 {n}개 지점, {a}부터 {b}까지({yrs}년) {nt}개 시각, 관측 높이는 지면에서 {h} m예요. 기준 자료: {ref}. 값은 시간 비율이고 퍼센트포인트(%p)로 적었어요.',
    'ex.th.cmp': '비교', 'ex.th.n': 'n', 'ex.th.bias': '편향', 'ex.th.rmse': 'RMSE', 'ex.th.mae': 'MAE', 'ex.th.r': '피어슨 r', 'ex.th.loa': '95% 일치 한계',
    'ex.th.unit': '%p',
    'ex.g.pgda': '우리 정밀 지평선 vs NASA PGDA', 'ex.g.nhf': '빠른 신경망 지평선(NHF) vs NASA PGDA', 'ex.g.nhfp': 'NHF vs 우리 정밀 지평선',
    'ex.to': '~',
    'ex.nhf.h': 'NHF 지평선 각도 오차', 'ex.nhf.v': '중앙값 {med} · 95번째 백분위 {p95} · 최대 {max}', 'ex.nhf.note': '정밀 지평선과의 지점별 RMS 차이, {n}개 지점.',
    'ex.prov.h': '데이터 출처',
    'ex.p.terrain': '지형', 'ex.p.files': '지형 파일', 'ex.p.eph': '천체력', 'ex.p.frame': '좌표계', 'ex.p.radius': '기준 반지름',
    'ex.p.mast': '마스트 높이', 'ex.p.time': '시간 격자', 'ex.p.ref': '검증 기준 자료', 'ex.p.refs': '참고문헌', 'ex.p.si': 'SI 사용', 'ex.p.gen': '검증 계산 시각',
    'ex.p.frame.v': '{frame}, 경도는 동쪽이 +', 'ex.p.time.v': '{scale}, {step}시간 간격, {a}부터 {b} 직전까지, {n}개 시각',
    'ex.p.eph.v': '{src}. 관측자: {obs}.',
    'ex.p.si.v': 'SI의 도움을 받아 코드를 작성했어요 ({tools}).',
    'ex.lim.h': '한계',
    'ex.lim.1': '기준은 가정값이에요. 공개된 기준 숫자를 찾지 못해서, 통과와 실패는 우리가 가정한 값을 따라요.',
    'ex.lim.2': '40 ~ 80 m(DEM 한 칸)보다 작은 지형은 보이지 않아요.',
    'ex.lim.3': '광선은 DEM 끝(남위 약 80°)에서 멈춰요. 그 바깥 지형은 지평선에 들어가지 않아요.',
    'ex.lim.4': '검증은 장기 가시성을 비교한 것이에요. 해넘이 한 번 같은 개별 사건은 비교하지 않았어요.',
    'ex.meta': '{site} HORIZON · WINDOW {land} +{h} H · {event} · LOLA 40/80 M · JPL HORIZONS DE441 · {scale} · COMPUTED, NOT A PHOTOGRAPH',
    'ex.meta.sets': 'SUN CENTRE BELOW HORIZON {when} · AZ {az}', 'ex.meta.never': 'SUN CENTRE ABOVE HORIZON ALL WINDOW · MIN CLEARANCE {d}',
    'ex.meta.down': 'SUN CENTRE BELOW HORIZON AT LANDING · AZ {az}', 'ex.meta.range': 'LANDING OUTSIDE COMPUTED PERIOD',
    'ex.meta.stretch': 'VERTICAL ×{v}', 'ex.meta.true': 'TRUE PROPORTIONS',
  },
});

let root = null, M = null, V = null, ro = null;
let series = 'sun';     // 'sun' | 'earth'

const $ = (s) => root && root.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const parseUtc = (s) => Date.parse(String(s).slice(0, 16) + 'Z');   // output times carry no Z
const two = (n) => String(n).padStart(2, '0');
const isoMin = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}Z`; };
const mod360 = (a) => ((a % 360) + 360) % 360;
const rel180 = (a) => mod360(a + 180) - 180;                          // signed difference, −180 … 180
const signed = (v, digits) => (v > 0 ? '+' : '') + fmt.num(v, digits);
const f1 = (v) => v.toFixed(1);
const pp = (v, digits = 2, sg = false) => (sg ? signed(v * 100, digits) : fmt.num(v * 100, digits));

function crumbDate(ms, year = true) {
  if (getLang() === 'ko') return fmt.date(ms, 'UTC', year);
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}${year ? ' ' + d.getUTCFullYear() : ''}`;
}
function shortName(id) {
  if (id === 'im2') return 'IM-2';
  if (id === 'pole' || id === 'shk') return t('ex.short.' + id);
  return id.toUpperCase();
}

/* ---------------- the model: array lookups only ---------------- */
function build(state, PM, pano, HM) {
  const sites = PM.data.sites || [];
  const siteId = pano.data.site_id;
  const rec = sites.find((s) => s.id === siteId) || {};
  let origMs = parseUtc(state.time || DEF.time);
  if (!Number.isFinite(origMs)) origMs = parseUtc(DEF.time);
  const delay = typeof state.delay === 'number' && Number.isFinite(state.delay) ? state.delay : DEF.delay;
  const landMs = origMs + delay * 24 * HOUR;
  const d = pano.data, tm = pano.meta.time || PM.data.time;
  const t0 = parseUtc(tm.t0_utc), stepH = tm.step_h || 1;
  const hor = d.horizon_el, hstep = d.horizon_az_step_deg || 360 / hor.length;
  const horAt = (az) => { const a = mod360(az) / hstep, i = Math.floor(a), f = a - i; return hor[i % hor.length] * (1 - f) + hor[(i + 1) % hor.length] * f; };
  const i0 = Math.round((landMs - t0) / (stepH * HOUR));
  const sun = [], earth = [];
  if (Number.isFinite(i0) && i0 >= 0 && i0 < d.sun_az.length) {
    for (let k = 0; k <= WINDOW_H / stepH && i0 + k < d.sun_az.length; k++) {
      const i = i0 + k;
      const hs = horAt(d.sun_az[i]);
      sun.push({ k: k * stepH, az: d.sun_az[i], el: d.sun_el[i], hel: hs, hid: d.sun_el[i] < hs });
      earth.push({ k: k * stepH, az: d.earth_az[i], el: d.earth_el[i] });
    }
  }
  let ev = { kind: 'range' };
  if (sun.length) {
    const first = sun.findIndex((s) => s.hid);
    if (first === 0) { const rise = sun.find((s) => !s.hid); ev = { kind: 'down', s: sun[0], rise: rise || null }; }
    else if (first > 0) ev = { kind: 'sets', s: sun[first] };
    else ev = { kind: 'never', s: sun.reduce((a, b) => (b.el - b.hel < a.el - a.hel ? b : a)) };
    ev.ms = landMs + ev.s.k * HOUR;
  }
  // the verdict is the pipeline's (heatmap.json), looked up for this site and landing; null when there is no such column
  let verdict = null;
  if (HM) {
    const si = HM.data.site_ids.indexOf(siteId);
    const j = HM.data.landing_times_utc.findIndex((s) => parseUtc(s) === landMs);
    if (si >= 0 && j >= 0) verdict = { passed: HM.data.passed[si][j], margin: HM.data.overall_margin[si][j], causes: String(HM.data.fail_causes[si][j] || '').split(',').map((c) => c.trim()).filter(Boolean) };
  }
  // Plan B for the path line (screen 02 format): "move:<site>" or "wait:YYYY-MM-DD"
  let alt = null;
  if (state.planb) {
    const p = String(state.planb).toLowerCase();
    const sid = sites.map((s) => s.id).find((id) => new RegExp(`(^|[^a-z0-9])${id}([^a-z0-9]|$)`).test(p));
    const dm = p.match(/\d{4}-\d{2}-\d{2}/);
    if ((sid && sid !== siteId) || dm) alt = { site: sid || siteId, ms: dm ? Date.parse(dm[0] + 'T12:00Z') : landMs };
  }
  return {
    siteId, name: getLang() === 'ko' ? (rec.name_ko || d.name) : (rec.name_en || d.name_en || d.name),
    origMs, delay, landMs, hor, horAt, sun, earth, ev, verdict, alt,
    rSun: d.sun_radius_deg, rEarth: d.earth_radius_deg,
  };
}

/* ---------------- the stage drawing ---------------- */
function niceStep(span, target) {
  const raw = span / target, p = 10 ** Math.floor(Math.log10(raw)), m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}
function pathD(pts, jump) {
  let d = '', prev = null;
  for (const p of pts) {
    d += (prev && Math.abs(p[0] - prev[0]) < jump ? 'L' : 'M') + f1(p[0]) + ' ' + f1(p[1]);
    prev = p;
  }
  return d;
}

function draw() {
  const plot = $('#ex-plot'), svg = $('#ex-svg'), cap = $('#ex-cap'), card = $('#ex-card'), tag = $('#ex-tag');
  if (!plot || !M) return;
  const W = plot.clientWidth, H = plot.clientHeight;
  if (W < 40 || H < 40) return;
  const floating = getComputedStyle(card).position === 'absolute';
  const narrow = W < 700;
  const x0 = cap.offsetLeft, x1 = floating ? card.offsetLeft - 32 : W - x0;     // the 360 degrees sit clear of the answer card
  const capBot = cap.offsetTop + cap.offsetHeight;
  const yTop = Math.min(H - 200, Math.max(capBot + 36, H * 0.3)), yBot = H - (narrow ? 134 : 88), yAxis = H - (narrow ? 112 : 60);
  const half = 180, c = 180;
  const s = (x1 - x0) / (2 * half), xc = (x0 + x1) / 2;
  const azAt = (px) => c + (px - xc) / s;
  const inView = (az) => xc + rel180(az - c) * s;

  // elevation range: from the data (horizon, Sun and Earth in the window)
  let lo = Infinity, hi = -Infinity;
  const grow = (v) => { if (v < lo) lo = v; if (v > hi) hi = v; };
  for (const v of M.hor) grow(v);
  for (const p of M.sun) grow(p.el);
  for (const p of M.earth) grow(p.el);
  let span = hi - lo;
  hi += span * 0.08; lo -= span * 0.04; span = hi - lo;
  const sy = (yBot - yTop) / span;
  const Y = (el) => yBot - (el - lo) * sy;
  const stretch = sy / s;

  let g = '';
  // sky: elevation lines
  const step = niceStep(span, H < 600 ? 4 : 5);
  let labels = `<text class="ex-axt" x="${x0}" y="${f1(yTop - 18)}">${esc(t('ex.l.elev'))}</text>`;
  for (let e = Math.ceil(lo / step) * step; e <= hi + 1e-9; e += step) {
    const y = Y(e), z = Math.abs(e) < 1e-9;
    g += `<line class="ex-gl${z ? ' z' : ''}" x1="${x0 + 44}" x2="${W}" y1="${f1(y)}" y2="${f1(y)}"/>`;
    labels += `<text class="ex-elt" x="${x0}" y="${f1(y + 4)}">${esc((e > 0 ? '+' : '') + fmt.num(e, step < 1 ? 1 : 0) + '°')}</text>`;
  }

  // Sun and Earth, drawn behind the terrain (bright) and once more in front of it (dim)
  const sunPts = M.sun.map((p) => [inView(p.az), Y(p.el), p]);
  const earthPts = M.earth.map((p) => [inView(p.az), Y(p.el), p]);
  const jump = Math.max(40, (x1 - x0) / 2);
  let sky = '';
  if (earthPts.length > 1) sky += `<path class="ex-earth-path" d="${pathD(earthPts, jump)}"/>`;
  if (sunPts.length > 1) sky += `<path class="ex-sun-path" d="${pathD(sunPts, jump)}"/>`;
  for (const [x, y, p] of sunPts) if (p.k % 24 === 0 && p.k > 0 && p !== M.ev.s) sky += `<circle class="ex-sun-day" cx="${f1(x)}" cy="${f1(y)}" r="2.4"/>`;
  if (sunPts.length) sky += `<circle class="ex-sun-disc" cx="${f1(sunPts[0][0])}" cy="${f1(sunPts[0][1])}" r="6"/>`;
  if (earthPts.length) sky += `<circle class="ex-earth-disc" cx="${f1(earthPts[0][0])}" cy="${f1(earthPts[0][1])}" r="5.5"/>`;

  // the terrain horizon, full-bleed: the panorama wraps around past north
  let ridge = '';
  for (let px = -2; px <= W + 2; px += 2) ridge += (ridge ? 'L' : 'M') + px + ' ' + f1(Y(M.horAt(azAt(px))));
  const ground = `<path class="ex-ground" d="${ridge}L${W + 2} ${H + 2}L-2 ${H + 2}Z"/><path class="ex-ridge" d="${ridge}"/>`;

  // the stretch of horizon that covers the Sun, and the Sun at that hour
  let mark = '', evXY = null;
  if (M.ev.s) {
    const ex = inView(M.ev.s.az);
    evXY = [ex, Y(M.ev.s.el)];
    if (M.ev.kind !== 'never') {
      let dd = '';
      for (let a = -7; a <= 7 + 1e-9; a += 0.5) dd += (dd ? 'L' : 'M') + f1(ex + a * s) + ' ' + f1(Y(M.horAt(M.ev.s.az + a)));
      mark += `<path class="ex-block" d="${dd}"/>`;
    }
    mark += `<circle class="ex-sun-disc ev" cx="${f1(evXY[0])}" cy="${f1(evXY[1])}" r="5"/><circle class="ex-ev" cx="${f1(evXY[0])}" cy="${f1(evXY[1])}" r="11"/>`;
  }

  // azimuth axis on the ground
  const big = s * 45 >= 84 ? 45 : 90;
  let axis = `<line class="ex-ax" x1="0" x2="${W}" y1="${yAxis}" y2="${yAxis}"/>`;
  for (let a = Math.ceil(azAt(0) / big) * big; a <= azAt(W); a += big) {
    const x = xc + (a - c) * s, m = mod360(a), main = x >= x0 - 1 && x <= x1 + 1;
    if (x < 14 || x > W - 14) continue;
    const name = m % 45 === 0 ? fmt.compass(m) + ' ' : '';
    axis += `<line class="ex-ax" x1="${f1(x)}" x2="${f1(x)}" y1="${yAxis}" y2="${yAxis + 5}"/>`
      + `<text class="ex-azt${main ? '' : ' dim'}" x="${f1(x)}" y="${yAxis + 20}" text-anchor="${x < x0 + 20 ? 'start' : 'middle'}">${esc(name + (a >= 360 && main ? 360 : m) + '°')}</text>`;
  }

  // direct labels on the paths
  let lab = '';
  const txt = (x, y, s2, cls) => { lab += `<text class="ex-lab ${cls}" x="${f1(Math.max(x0 + 44, Math.min(W - 44, x)))}" y="${f1(y)}" text-anchor="middle">${esc(s2)}</text>`; };
  if (sunPts.length && M.ev.kind !== 'down') txt(sunPts[0][0], sunPts[0][1] - 14, t('ex.l.landing'), 'sun');
  const last = sunPts[sunPts.length - 1];
  if (last && last[2].k === WINDOW_H && last[2] !== M.ev.s) { lab += `<circle class="ex-sun-end" cx="${f1(last[0])}" cy="${f1(last[1])}" r="3.5"/>`; txt(last[0], last[1] - 12, t('ex.l.end'), 'sun'); }
  if (earthPts.length) {
    const top = earthPts.reduce((a, b) => (b[1] < a[1] ? b : a));
    txt(top[0], top[1] - 12, t('ex.l.earth'), 'earth');
  }

  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', W); svg.setAttribute('height', H);
  svg.innerHTML = `${g}<g>${sky}</g>${ground}<g class="ex-ghost">${sky}</g>${mark}${axis}${labels}${lab}<line class="ex-lead" id="ex-leadline" x1="0" y1="0" x2="0" y2="0"/>`;

  // the tag at the event, with a leader line down to the Sun
  if (evXY) {
    const sub = M.ev.kind === 'sets'
      ? `${fmt.deg(M.ev.s.az, 1)} ${fmt.compass(M.ev.s.az)} · ${fmt.utc(M.ev.ms, false)}`
      : `${t(M.ev.kind === 'never' ? 'ex.tag.clear' : 'ex.tag.under', { d: fmt.deg(Math.abs(M.ev.s.el - M.ev.s.hel), 2) })} · ${fmt.deg(M.ev.s.az, 1)} ${fmt.compass(M.ev.s.az)}`;
    tag.innerHTML = `<b>${esc(t('ex.tag.' + M.ev.kind))}</b><span>${esc(sub)}</span>`;
    tag.hidden = false;
    const tw = tag.offsetWidth, th = tag.offsetHeight;
    const i = M.sun.indexOf(M.ev.s), nb = M.sun[Math.min(M.sun.length - 1, i + 1)], pb = M.sun[Math.max(0, i - 1)];
    const dir = rel180(nb.az - pb.az) >= 0 ? 1 : -1;                              // the way the Sun travels
    const lo2 = x0 + 52, hi2 = (floating ? x1 : W - x0) - tw;                       // clear of the elevation labels
    const right = evXY[0] - 16, leftSide = evXY[0] - tw + 16;                      // tag to the right / left of the line
    let left = dir > 0 ? (right <= hi2 ? right : leftSide) : (leftSide >= lo2 ? leftSide : right);
    left = Math.max(lo2, Math.min(hi2, left));
    let top = Math.min(evXY[1] - 64 - th, yTop + 10);
    let ridgeTop = Infinity;                                                       // highest terrain under the tag
    for (let px = left; px <= left + tw; px += 4) ridgeTop = Math.min(ridgeTop, Y(M.horAt(azAt(px))));
    const below = top < capBot + 8 || top + th > ridgeTop - 6;                     // no room above: hang the tag under the Sun
    if (below) top = Math.min(evXY[1] + 34, yAxis - th - 8);
    tag.style.left = left + 'px'; tag.style.top = top + 'px';
    const ll = svg.querySelector('#ex-leadline');
    ll.setAttribute('x1', f1(evXY[0])); ll.setAttribute('x2', f1(evXY[0]));
    ll.setAttribute('y1', f1(below ? evXY[1] + 13 : top + th + 6)); ll.setAttribute('y2', f1(below ? top - 6 : evXY[1] - 13));
  } else tag.hidden = true;

  // the burned-in data line
  const E = M.ev;
  const event = E.kind === 'sets' ? t('ex.meta.sets', { when: isoMin(E.ms), az: E.s.az.toFixed(1) + '°' })
    : E.kind === 'never' ? t('ex.meta.never', { d: (E.s.el - E.s.hel).toFixed(2) + '°' })
      : E.kind === 'down' ? t('ex.meta.down', { az: E.s.az.toFixed(1) + '°' }) : t('ex.meta.range');
  $('#ex-meta').textContent = t('ex.meta', {
    site: M.siteId.toUpperCase(), land: isoMin(M.landMs), h: M.sun.length ? M.sun[M.sun.length - 1].k : WINDOW_H, event,   // shorter where the data ends
    scale: Math.abs(stretch - 1) < 0.05 ? t('ex.meta.true') : t('ex.meta.stretch', { v: stretch >= 10 ? stretch.toFixed(0) : stretch.toFixed(1) }),
  });
}

/* ---------------- validation: the scatter in the bar ---------------- */
function scatterSvg(key, size) {
  const pts = V.points, ours = 'ours_' + key, ref = 'pgda_' + key;
  let mx = 0;
  for (const p of pts) mx = Math.max(mx, p[ours], p[ref]);
  const top = Math.min(1, Math.max(0.2, Math.ceil(mx / 0.2 - 1e-9) * 0.2));
  const P = 3, pw = size - 2 * P;
  const X = (v) => P + (v / top) * pw, Yv = (v) => P + pw - (v / top) * pw;
  let s = `<rect class="ex-sc-frame" x="${P}" y="${P}" width="${pw}" height="${pw}"/>`;
  for (let v = 0.2; v < top - 1e-9; v += 0.2) s += `<line class="ex-sc-grid" x1="${f1(X(v))}" x2="${f1(X(v))}" y1="${P}" y2="${P + pw}"/><line class="ex-sc-grid" x1="${P}" x2="${P + pw}" y1="${f1(Yv(v))}" y2="${f1(Yv(v))}"/>`;
  s += `<line class="ex-sc-one" x1="${X(0)}" y1="${Yv(0)}" x2="${X(top)}" y2="${Yv(top)}"/>`;
  for (const p of pts) s += `<circle class="ex-sc-p ${key}" cx="${f1(X(p[ref]))}" cy="${f1(Yv(p[ours]))}" r="1.7"/>`;
  return `<svg viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(t('ex.sc.title', { s: t('ex.' + key) }))}">${s}</svg>`;
}
function drawScatter() {
  const box = $('#ex-sc');
  if (!box || !V) return;
  box.innerHTML = scatterSvg(series, 84);
  root.querySelectorAll('[data-series]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.series === series)));
  root.querySelectorAll('[data-stat]').forEach((b) => b.classList.toggle('on', b.dataset.stat === series));
}

/* ---------------- page ---------------- */
function crumbHtml() {
  const parts = [`<b>${esc(t('ex.crumb.orig', { site: shortName(M.siteId) }))}</b>`, `<span>${esc(crumbDate(M.origMs))}</span>`];
  parts.push(M.delay > 0 ? `<b class="ex-lime">${esc(M.delay === 1 ? t('ex.crumb.delay1') : t('ex.crumb.delay', { n: M.delay }))}</b>` : `<span>${esc(t('ex.crumb.nodelay'))}</span>`);
  if (M.alt) parts.push(`<span>${esc(t('ex.crumb.alt', { site: shortName(M.alt.site), date: crumbDate(M.alt.ms, false) }))}</span>`);
  return parts.join('<i>/</i>');
}

function cardHtml() {
  const E = M.ev;
  const clock = fmt.clock(M.landMs);
  let big = '', line = '';
  const kv = (k, v) => `<div><dt>${esc(k)}</dt><dd class="num">${esc(v)}</dd></div>`;
  const dirV = (az) => `${fmt.num(az, 0)}° ${fmt.compass(az)}`;
  if (E.kind === 'sets') {
    big = kv(t('ex.k.after'), fmt.dur(E.s.k)) + kv(t('ex.k.dir'), dirV(E.s.az));
    line = t('ex.line.sets', { when: fmt.utc(E.ms), hel: fmt.deg(E.s.hel, 2), sel: fmt.deg(E.s.el, 2) });
  } else if (E.kind === 'never') {
    big = kv(t('ex.k.stays'), t('ex.v.all')) + kv(t('ex.k.closest'), fmt.deg(E.s.el - E.s.hel, 2));
    line = t('ex.line.never', { when: fmt.utc(E.ms), az: dirV(E.s.az) });
  } else if (E.kind === 'down') {
    big = kv(t('ex.k.under'), fmt.deg(E.s.hel - E.s.el, 2)) + kv(t('ex.k.dir'), dirV(E.s.az));
    line = t('ex.line.down', { hel: fmt.deg(E.s.hel, 2), sel: fmt.deg(E.s.el, 2) }) + ' '
      + (E.rise ? t('ex.line.rise', { when: fmt.utc(M.landMs + E.rise.k * HOUR) }) : t('ex.line.norise'));
  }
  let verdict = '';
  if (M.verdict) {
    const v = M.verdict;
    const chips = v.passed === null || v.passed === undefined ? `<span class="pm-chip nc">${esc(t('ex.nc'))}</span>`
      : v.passed ? `<span class="pm-chip ok">${esc(t('ex.pass'))} ${esc(signed(v.margin, 2))}</span>`
        : (v.causes.length ? v.causes : ['other']).map((c2) => `<span class="pm-chip ${CAUSES.includes(c2) ? c2 : ''}">${esc(t('ex.fail'))} · ${esc(CAUSES.includes(c2) ? t('ex.c.' + c2) : c2)}</span>`).join('')
          + (Number.isFinite(v.margin) ? `<span class="ex-margin num">${esc(signed(v.margin, 2))}</span>` : '');
    verdict = `<div class="ex-verdict"><small>${esc(t('ex.verdict'))}</small><p>${chips}</p></div>`;
  }
  return `
    <h2>${esc(t('ex.card.title'))}</h2>
    <p class="ex-why">${esc(t('ex.card.' + E.kind))}</p>
    <div class="ex-site">
      <p><b>${esc(shortName(M.siteId))}</b> / ${esc(crumbDate(M.landMs))}</p>
      <small>${esc(t('ex.card.landing', { name: M.name, clock }))}${M.delay > 0 ? ' · ' + esc(t('ex.card.delayed', { n: M.delay, date: crumbDate(M.origMs, false) })) : ''}</small>
    </div>
    ${big ? `<dl class="ex-big">${big}</dl>` : ''}
    ${line ? `<p class="ex-line num">${esc(line)}</p>` : ''}
    ${verdict}
    <button class="ex-open" id="ex-open" type="button">${esc(t('ex.open'))} <span aria-hidden="true">↗</span></button>`;
}

function statHtml(key) {
  const S = V.summary[key];
  return `<div class="ex-stat" data-stat="${key}">
    <span class="k"><i class="ex-sw ${key}"></i>${esc(t('ex.' + key))}</span>
    <b class="num">${esc(pp(S.rmse, 1))}<small> ${esc(t('ex.th.unit'))}</small></b>
    <span class="s num">${esc(t('ex.st.rmse'))} · ${esc(t('ex.st.r', { v: S.pearson_r.toFixed(3), n: S.n }))}</span></div>`;
}

function tableHtml() {
  const S = V.summary;
  const row = (name, r) => (r ? `<tr><th scope="row">${esc(name)}</th><td>${r.n}</td><td>${esc(pp(r.bias, 2, true))}</td><td>${esc(pp(r.rmse))}</td><td>${esc(pp(r.mae))}</td><td>${r.pearson_r.toFixed(3)}</td><td>${esc(pp(r.loa_low, 2, true))} ${esc(t('ex.to'))} ${esc(pp(r.loa_high, 2, true))}</td></tr>` : '');
  const group = (title, a, b) => (a || b ? `<tr class="g"><th colspan="7" scope="colgroup">${esc(title)}</th></tr>${row(t('ex.sun'), a)}${row(t('ex.earth'), b)}` : '');
  const u = ` <span>(${esc(t('ex.th.unit'))})</span>`;
  return `<div class="ex-tablewrap"><table class="ex-table num">
    <thead><tr><th scope="col">${esc(t('ex.th.cmp'))}</th><th scope="col">${esc(t('ex.th.n'))}</th><th scope="col">${esc(t('ex.th.bias'))}${u}</th><th scope="col">${esc(t('ex.th.rmse'))}${u}</th><th scope="col">${esc(t('ex.th.mae'))}${u}</th><th scope="col">${esc(t('ex.th.r'))}</th><th scope="col">${esc(t('ex.th.loa'))}${u}</th></tr></thead>
    <tbody>${group(t('ex.g.pgda'), S.sun, S.earth)}${group(t('ex.g.nhf'), S.nhf_sun_vs_pgda, S.nhf_earth_vs_pgda)}${group(t('ex.g.nhfp'), S.nhf_sun_vs_precise, S.nhf_earth_vs_precise)}</tbody></table></div>`;
}

function linkify(s) {
  return esc(s).replace(/https?:\/\/[^\s,)]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
}

function belowHtml(PM, VM) {
  const S = V.summary, m = PM.data, vm = VM || {};
  const a = parseUtc(S.period_utc[0]), b = parseUtc(S.period_utc[1]);
  const what = t('ex.cmp.what', {
    n: S.sun.n, nt: fmt.num(S.n_times), a: fmt.date(a), b: fmt.date(b), yrs: ((b - a) / (365.25 * 24 * HOUR)).toFixed(1),
    h: fmt.num(S.observer_height_m, 0), ref: vm.reference || 'NASA PGDA',
  });
  const he = S.nhf_horizon_error_deg;
  const si = vm.calc_si_usage;
  const rows = [
    he && [t('ex.nhf.h'), esc(t('ex.nhf.v', { med: fmt.deg(he.median, 2), p95: fmt.deg(he.p95, 2), max: fmt.deg(he.max, 2) })) + `<br><span class="ex-quiet">${esc(t('ex.nhf.note', { n: he.n }))}</span>`],
  ].filter(Boolean);
  const prov = [
    [t('ex.p.terrain'), esc(m.terrain.source)],
    [t('ex.p.files'), m.terrain.files.map(esc).join('<br>')],
    [t('ex.p.eph'), esc(t('ex.p.eph.v', { src: m.ephemeris.source, obs: m.ephemeris.observer }))],
    [t('ex.p.frame'), esc(t('ex.p.frame.v', { frame: m.frame }))],
    [t('ex.p.radius'), esc(fmt.num(m.ref_radius_km, 1) + ' km')],
    [t('ex.p.mast'), esc(fmt.num(m.mast_m, 1) + ' m')],
    [t('ex.p.time'), esc(t('ex.p.time.v', { scale: m.time.scale, step: m.time.step_h, a: m.time.t0_utc, b: m.time.t_end_utc_exclusive, n: fmt.num(m.time.n_times) }))],
    vm.reference && [t('ex.p.ref'), esc(vm.reference)],
    vm.calc_references && [t('ex.p.refs'), vm.calc_references.map(linkify).join('<br>')],
    si && si.si_assisted_code && [t('ex.p.si'), esc(t('ex.p.si.v', { tools: (si.si_tools || []).join(', ') })) + (si.scope ? `<br><span class="ex-quiet">${esc(si.scope)}</span>` : '')],
    vm.generated_utc && [t('ex.p.gen'), esc(fmt.utc(parseUtc(vm.generated_utc)))],
  ].filter(Boolean);
  const dl = (list) => `<dl>${list.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
  return `
    <section class="sources ex-below" id="ex-below" aria-labelledby="ex-below-h">
      <h2 class="ex-below-h" id="ex-below-h">${esc(t('ex.cmp.h'))}</h2>
      <div class="ex-cols">
        <div class="ex-col">
          <h3>${esc(t('ex.cmp.val'))}</h3>
          <p class="ex-what">${esc(what)}</p>
          ${tableHtml()}
          ${dl(rows)}
          <h3>${esc(t('ex.lim.h'))}</h3>
          <ol class="ex-lim">${[1, 2, 3, 4].map((i) => `<li>${esc(t('ex.lim.' + i))}</li>`).join('')}</ol>
        </div>
        <div class="ex-col">
          <h3>${esc(t('ex.prov.h'))}</h3>
          ${dl(prov)}
        </div>
      </div>
    </section>`;
}

export default {
  id: 'explain',
  num: '④',
  label: 'Evidence',
  ownTitle: true,

  async render(el, ctx) {
    const st = ctx.state;
    const PM = await ctx.use('project_meta.json');
    if (!PM) return ctx.missing(['project_meta.json']);
    const ids = (PM.data.sites || []).map((s) => s.id);
    const site = ids.includes(st.site) ? st.site : DEF.site;
    const panoPath = `inputs/panorama_${site}.json`;
    const [pano, val, HM] = await Promise.all([ctx.use(panoPath), ctx.use('outputs/validation.json'), ctx.use('outputs/heatmap.json')]);
    const lacking = [!pano && panoPath, !(val && val.data && val.data.pgda) && 'outputs/validation.json'].filter(Boolean);
    if (lacking.length) return ctx.missing(lacking);

    root = el;
    M = build(st, PM, pano, HM);
    V = val.data.pgda;
    const S = V.summary;
    const subKey = M.ev.kind === 'range' ? 'ex.sub.range' : 'ex.sub';
    el.innerHTML = `
      <section class="s3 photo ex-stage" aria-label="${esc(t('step.explain'))}">
        <div class="s3-stage ex-plot" id="ex-plot">
          <svg id="ex-svg" role="img" aria-label="${esc(t('ex.svg', { site: M.name }))}"></svg>
          <p class="s3-meta" id="ex-meta"></p>
        </div>
        <div class="ex-tag" id="ex-tag" hidden></div>
        <div class="s3-caption ex-cap" id="ex-cap">
          <p class="s3-crumb">${crumbHtml()}</p>
          <h1>${esc(t('ex.h1'))}</h1>
          <p class="s3-lead">${esc(t('ex.lead'))}</p>
          <p class="s3-sub">${esc(t(subKey, { site: M.name, date: fmt.utc(M.landMs) }))}</p>
        </div>
        <aside class="ex-card" id="ex-card" aria-label="${esc(t('ex.card.title'))}">${cardHtml()}</aside>
      </section>
      <section class="s3-bar ex-bar" aria-label="${esc(t('ex.val.lab'))}">
        <button class="s3-map" id="ex-back" type="button">← ${esc(t('ex.back'))}</button>
        <div class="ex-val">
          <p class="ex-val-h"><b>${esc(t('ex.val.lab'))}</b><span>${esc(t('ex.val.n', { n: S.sun.n, a: new Date(parseUtc(S.period_utc[0])).getUTCFullYear(), b: new Date(parseUtc(S.period_utc[1])).getUTCFullYear() }))}</span>
            <button type="button" class="ex-more" id="ex-more">${esc(t('ex.val.more'))} ↓</button></p>
          <div class="ex-sc" id="ex-sc"></div>
          ${statHtml('sun')}${statHtml('earth')}
        </div>
        <div class="s3-views" role="group" aria-label="${esc(t('ex.sc.series'))}">
          <button type="button" data-series="sun" aria-pressed="${series === 'sun'}">${esc(t('ex.sun.s'))}</button>
          <button type="button" data-series="earth" aria-pressed="${series === 'earth'}">${esc(t('ex.earth.s'))}</button>
        </div>
        <button class="s3-land" id="ex-next" type="button">${esc(t('ex.next'))} →</button>
      </section>
      ${belowHtml(PM, val.meta)}`;

    $('#ex-open').addEventListener('click', () => ctx.set({ step: 'sky' }));
    $('#ex-back').addEventListener('click', () => ctx.set({ step: 'ghosts' }));
    $('#ex-next').addEventListener('click', () => ctx.set({ step: 'decision' }));
    $('#ex-more').addEventListener('click', () => { const f = $('#ex-below'); if (f) f.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    el.querySelectorAll('[data-series]').forEach((b) => b.addEventListener('click', () => { series = b.dataset.series; drawScatter(); }));
    drawScatter();
  },

  mounted() {
    document.body.classList.add('immersive');
    draw();
    if (typeof ResizeObserver !== 'undefined' && root) {
      ro = new ResizeObserver(() => draw());
      const plot = $('#ex-plot'), cap = $('#ex-cap');
      if (plot) ro.observe(plot);
      if (cap) ro.observe(cap);
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (root && root.isConnected) draw(); });
  },

  update() { return 'rerender'; },

  unmount() {
    document.body.classList.remove('immersive');
    if (ro) { ro.disconnect(); ro = null; }
    root = null; M = null; V = null;
  },
};
