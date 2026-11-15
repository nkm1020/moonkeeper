// 03 Confidence — the landing scatter ("ghost landers")
// A lander never lands exactly on the target. 1,000 sample landers are scattered around it; how many still have a working mission?
// The stage draws data/outputs/ghost_landers.json as it is: the ground cells (`grid`) and the 1,000 landers (`samples`).
// The strip in the bar draws data/outputs/nhf_check.json: the same 1,000-lander test on every date when the IM-2 centre passes.
// Nothing is computed here: the page reads the values, formats them and draws them. Fields: data/outputs/README.md.
//
// Shared state this screen reads: site, time (original landing, UTC), delay (days), planb.
//   planb is free text written by screen 02; it is read loosely:
//     a site id in it (cr1 sr1 gr1 mp1 lp1 im2 pole shk) = move to that site · a date YYYY-MM-DD in it = that landing date ·
//     the word "wait" = wait at the same site (the date comes from planb_candidates.json: same_site_later_date).
//   Missing values use the default story: im2, 2026-11-17T12:00Z, delay 7.
// The file holds ONE case (target_site + landing_time_utc). If the plan in the state is another one, the screen says so.

import { t, addStrings, getLang } from '../i18n.js';

const SITES = ['cr1', 'sr1', 'gr1', 'mp1', 'lp1', 'im2', 'pole', 'shk'];
const DEF = { site: 'im2', time: '2026-11-17T12:00Z', delay: 7 };
const ORDER = ['ok', 'power', 'comm', 'approach', 'other'];
const FALLBACK = { ok: '#D8FA5C', power: '#D98E24', comm: '#D2487B', approach: '#9A6BE3', other: '#8793A5' };
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAY = 864e5, NEAR = 440, FAR = 840;   // half-width of the view in metres (both are cell edges of the 80 m grid)
const DROP_MS = 2600;

addStrings({
  en: {
    'gh.h1a': 'A good site.', 'gh.h1b': 'A resilient plan.',
    'gh.lead': 'Test the landing scatter around {site}.',
    'gh.scope.same': 'Computed for {site}, {date}. This is the plan you selected.',
    'gh.scope.other': 'Computed for {site}, {date}. Shown as the worked example, not your selected plan ({plan}).',
    'gh.back': 'Replan', 'gh.next': 'See the evidence',
    'gh.crumb.orig': 'Original', 'gh.crumb.delay': 'Delay +{n} days', 'gh.crumb.delay1': 'Delay +1 day', 'gh.crumb.nodelay': 'No delay', 'gh.crumb.alt': 'Alternative',
    'gh.site.pole': 'South Pole', 'gh.site.shk': 'Shackleton floor',
    'gh.card.h': 'Estimated success', 'gh.card.ci.h': '95% interval', 'gh.card.ci': '{lo}–{hi}', 'gh.card.kn.h': 'Working missions', 'gh.card.kn': '{k} / {n}', 'gh.card.kn.u': 'landers',
    'gh.card.bd': 'All landers by outcome',
    'gh.card.note': 'Computed for {site}, {date} · {crit}', 'gh.assumed': 'assumed criteria', 'gh.crit.other': '{s} criteria',
    'gh.warn': '{p} outside computed grid',
    'gh.s.ok': 'OK', 'gh.s.power': 'Power', 'gh.s.comm': 'Comm', 'gh.s.approach': 'Approach', 'gh.s.other': 'Other',
    'gh.leg.landers': 'Landers', 'gh.leg.cells': 'Ground cells, {m} m', 'gh.leg.pass': 'Passes', 'gh.leg.fail': 'Fails on {c}',
    'gh.stage.aria': 'Landing scatter around {site}: {k} of {n} sample landers keep a working mission.',
    'gh.tip.lander': 'Lander {i} of {n}', 'gh.tip.from': '{r} m from the target', 'gh.tip.cell': 'Ground cell {id}',
    'gh.tip.pass': 'Passes every criterion', 'gh.tip.fail': 'Fails on {c}', 'gh.e': 'E', 'gh.w': 'W', 'gh.n': 'N', 'gh.so': 'S',
    'gh.m.sun_mean': 'Mean sunlight', 'gh.m.longest_dark_h': 'Longest dark', 'gh.m.comm_frac': 'Earth in view', 'gh.m.longest_comm_gap_h': 'Longest comm gap', 'gh.m.approach': 'Approach lighting',
    'gh.min': 'min {v}', 'gh.max': 'max {v}',
    'gh.ax.e': 'EAST (m)', 'gh.ax.n': 'NORTH (m)',
    'gh.play': 'Drop the landers again', 'gh.count': '{n} landers', 'gh.count.run': 'Lander {i} / {n}',
    'gh.strip.h': 'Success across {site} landing dates', 'gh.strip.sum': '{a} of {n} dates at or above {th}',
    'gh.strip.aria': 'Success share on each of the {n} tested landing dates. Use the arrow keys to read a date.',
    'gh.pin.map': 'Scatter map', 'gh.pin.orig': 'Original', 'gh.pin.plan': 'This plan', 'gh.pin.wait': 'Plan B wait',
    'gh.tip.p': '{p} success · 95% {lo}–{hi}', 'gh.tip.x': 'Fast horizon (NHF) {p} · site margin {m}',
    'gh.view.near': 'Landing area', 'gh.view.far': 'Whole grid',
    'gh.meta': '{site} · LANDING {iso} · {dur} H MISSION · SIGMA {sa} × {sc} M · HEADING {hd}° · SEED {seed} · N {n} · {crit} · COMPUTED, NOT A PHOTOGRAPH',
    'gh.credit': 'Computed scatter · {n} sample landers on a {m} m ground grid · NASA LRO LOLA terrain · JPL Horizons DE441 · {crit}',
    'gh.src': 'Conditions, scope and limits',
    'gh.src.scope': 'Scope', 'gh.src.plan': 'Your plan', 'gh.src.cond': 'Conditions', 'gh.src.ground': 'Ground', 'gh.src.crit': 'Criteria', 'gh.src.seed': 'Seed check',
    'gh.src.dates': 'Landing dates', 'gh.src.nhf': 'Fast horizon', 'gh.src.terrain': 'Terrain', 'gh.src.eph': 'Sun and Earth', 'gh.src.limits': 'Limits',
    'gh.src.scope.v': 'The scatter file holds one case: {name}, landing {date}. Every number on the stage and in the card belongs to that case.',
    'gh.src.scope.m': 'On that date the site centre passes with a margin of only {m}, so a landing error changes the outcome.',
    'gh.src.plan.same': 'Your plan ({plan}) is the case shown.',
    'gh.src.plan.other': 'Your plan ({plan}) was not run through the scatter map. The map is the worked example.',
    'gh.src.plan.in': '{label}, {date}: {p} success (95% {lo}–{hi}) in the per-date test.',
    'gh.src.plan.out': '{date} is not one of the {n} tested dates. The per-date test covers only dates when the {site} centre passes.',
    'gh.src.plan.fail': 'On {date} the {site} centre fails on {c}.',
    'gh.src.plan.site': 'The per-date test exists for {site} only.',
    'gh.src.cond.v': 'Target {name} · landing {date} · mission {h} h · landing error 1σ {sa} m along track, {sc} m across · heading {hd}° · seed {seed} · {n} landers.',
    'gh.src.cond.eq': 'The two sigmas are equal, so the heading does not change the result.',
    'gh.src.ground.v': '{n} cells on a {m} m grid within {r} m of the target: {list}. Landers outside the computed grid: {out}.',
    'gh.src.crit.v': '{list}. These are {status} values, not mission requirements.',
    'gh.src.seed.v': 'Across 10 seeds the success share has a standard deviation of {a} percentage points; the binomial expectation is {b}.',
    'gh.src.dates.v': '{n} dates when the {site} centre passes, each tested with the same {k} landers: {a} at or above {th}, {b} below.',
    'gh.src.nhf.v': 'The fast neural horizon (NHF) gives a success share within 5 percentage points of the precise horizon on {w} of {n} dates, and is more than 1 point higher on {h} dates.',
    'gh.src.nhf.v0': 'The fast neural horizon (NHF) gives a success share within 5 percentage points of the precise horizon on {w} of {n} dates, and is never more than 1 point higher.',
    'gh.src.limits.v': 'One case and one seed are drawn. Success means every criterion is kept for the whole mission at the cell where the lander comes down. The browser only reads and draws these values.',
    'gh.cellcount': '{label} {n}',
  },
  ko: {
    'gh.h1a': '좋은 착륙지.', 'gh.h1b': '견고한 계획.',
    'gh.lead': '{site} 주변의 착륙 오차를 시험해요.',
    'gh.scope.same': '{site}, {date} 기준으로 계산했어요. 지금 고른 계획이에요.',
    'gh.scope.other': '{site}, {date} 기준으로 계산한 예시예요. 지금 고른 계획({plan})은 아니에요.',
    'gh.back': '재계획', 'gh.next': '근거 보기',
    'gh.crumb.orig': '원래 계획', 'gh.crumb.delay': '지연 +{n}일', 'gh.crumb.delay1': '지연 +1일', 'gh.crumb.nodelay': '지연 없음', 'gh.crumb.alt': '대안',
    'gh.site.pole': '남극점', 'gh.site.shk': '섀클턴 바닥',
    'gh.card.h': '예상 성공률', 'gh.card.ci.h': '95% 구간', 'gh.card.ci': '{lo}–{hi}', 'gh.card.kn.h': '임무 유지', 'gh.card.kn': '{k} / {n}', 'gh.card.kn.u': '대',
    'gh.card.bd': '착륙선 결과',
    'gh.card.note': '{site}, {date} 기준 계산 · {crit}', 'gh.assumed': '기준은 가정값', 'gh.crit.other': '기준: {s}',
    'gh.warn': '{p}가 계산 범위 밖이에요',
    'gh.s.ok': '통과', 'gh.s.power': '전력', 'gh.s.comm': '교신', 'gh.s.approach': '접근로', 'gh.s.other': '기타',
    'gh.leg.landers': '착륙선', 'gh.leg.cells': '지면 칸, {m} m', 'gh.leg.pass': '통과', 'gh.leg.fail': '{c} 실패',
    'gh.stage.aria': '{site} 주변 착륙 분포: 착륙선 {n}대 중 {k}대가 임무를 이어가요.',
    'gh.tip.lander': '착륙선 {i} / {n}', 'gh.tip.from': '목표에서 {r} m', 'gh.tip.cell': '지면 칸 {id}',
    'gh.tip.pass': '모든 기준을 통과해요', 'gh.tip.fail': '{c} 기준에서 실패해요', 'gh.e': '동', 'gh.w': '서', 'gh.n': '북', 'gh.so': '남',
    'gh.m.sun_mean': '평균 일조', 'gh.m.longest_dark_h': '가장 긴 어둠', 'gh.m.comm_frac': '지구가 보이는 비율', 'gh.m.longest_comm_gap_h': '가장 긴 교신 공백', 'gh.m.approach': '접근로 조명',
    'gh.min': '최소 {v}', 'gh.max': '최대 {v}',
    'gh.ax.e': '동쪽 (m)', 'gh.ax.n': '북쪽 (m)',
    'gh.play': '착륙선 다시 떨어뜨리기', 'gh.count': '착륙선 {n}대', 'gh.count.run': '착륙선 {i} / {n}',
    'gh.strip.h': '{site} 착륙 날짜별 성공률', 'gh.strip.sum': '{n}개 날짜 중 {a}개가 {th} 이상이에요',
    'gh.strip.aria': '시험한 착륙 날짜 {n}개의 성공률이에요. 화살표 키로 날짜를 읽을 수 있어요.',
    'gh.pin.map': '분포 지도', 'gh.pin.orig': '원래 계획', 'gh.pin.plan': '이 계획', 'gh.pin.wait': 'Plan B 대기',
    'gh.tip.p': '성공률 {p} · 95% {lo}–{hi}', 'gh.tip.x': '빠른 지평선(NHF) {p} · 착륙지 여유 {m}',
    'gh.view.near': '착륙 구역', 'gh.view.far': '전체 격자',
    'gh.meta': '{site} · LANDING {iso} · {dur} H MISSION · SIGMA {sa} × {sc} M · HEADING {hd}° · SEED {seed} · N {n} · {crit} · COMPUTED, NOT A PHOTOGRAPH',
    'gh.credit': '계산한 분포 · {m} m 지면 격자 위 착륙선 {n}대 · NASA LRO LOLA 지형 · JPL Horizons DE441 · {crit}',
    'gh.src': '조건, 범위, 한계',
    'gh.src.scope': '범위', 'gh.src.plan': '내 계획', 'gh.src.cond': '조건', 'gh.src.ground': '지면', 'gh.src.crit': '기준', 'gh.src.seed': '시드 확인',
    'gh.src.dates': '착륙 날짜', 'gh.src.nhf': '빠른 지평선', 'gh.src.terrain': '지형', 'gh.src.eph': '해와 지구', 'gh.src.limits': '한계',
    'gh.src.scope.v': '오차 시험 파일에는 한 건만 있어요: {name}, {date} 착륙. 무대와 카드의 숫자는 모두 이 한 건의 값이에요.',
    'gh.src.scope.m': '이 날 착륙지 중심은 여유 {m}로 겨우 통과해서, 착륙 오차가 결과를 바꿔요.',
    'gh.src.plan.same': '지금 고른 계획({plan})이 바로 이 계산이에요.',
    'gh.src.plan.other': '지금 고른 계획({plan})은 분포 지도로 계산하지 않았어요. 지도는 예시예요.',
    'gh.src.plan.in': '{label}, {date}: 날짜별 시험에서 성공률 {p} (95% {lo}–{hi})이에요.',
    'gh.src.plan.out': '{date}은 시험한 {n}개 날짜에 없어요. 날짜별 시험은 {site} 중심이 통과하는 날만 다뤄요.',
    'gh.src.plan.fail': '{date}에는 {site} 중심이 {c} 기준에서 실패해요.',
    'gh.src.plan.site': '날짜별 시험은 {site}만 있어요.',
    'gh.src.cond.v': '목표 {name} · 착륙 {date} · 임무 {h}시간 · 착륙 오차 1σ 진행 방향 {sa} m, 가로 방향 {sc} m · 방위 {hd}° · 시드 {seed} · 착륙선 {n}대.',
    'gh.src.cond.eq': '두 시그마가 같아서 방위를 바꿔도 결과가 같아요.',
    'gh.src.ground.v': '목표에서 {r} m 안, {m} m 격자의 칸 {n}개: {list}. 계산 범위 밖에 떨어진 착륙선: {out}.',
    'gh.src.crit.v': '{list}. 임무 요구 조건이 아니라 가정값({status})이에요.',
    'gh.src.seed.v': '시드 10개로 돌리면 성공률의 표준편차가 {a}%p예요. 이항 분포로 기대하는 값은 {b}%p예요.',
    'gh.src.dates.v': '{site} 중심이 통과하는 날짜 {n}개를 같은 착륙선 {k}대로 시험했어요: {th} 이상 {a}개, 미만 {b}개.',
    'gh.src.nhf.v': '빠른 신경망 지평선(NHF)의 성공률은 {n}개 날짜 중 {w}개에서 정밀 지평선과 5%p 안쪽이고, 1%p 넘게 높은 날은 {h}개예요.',
    'gh.src.nhf.v0': '빠른 신경망 지평선(NHF)의 성공률은 {n}개 날짜 중 {w}개에서 정밀 지평선과 5%p 안쪽이고, 1%p 넘게 높은 날은 없어요.',
    'gh.src.limits.v': '한 건, 한 시드만 그렸어요. 성공은 착륙선이 내린 칸에서 임무 기간 내내 모든 기준을 지킨다는 뜻이에요. 브라우저는 값을 읽어서 그리기만 해요.',
    'gh.cellcount': '{label} {n}',
  },
});

/* ---------------- state of the drawn screen ---------------- */
let root = null, ctx = null, GH = null, d = null, NH = null, PB = null, P = null;
let S = null;                 // samples (columns), G = grid (columns)
let G = null, cellAt = null, D = [], strip = null, mapJ = -1, TH = 0.9, pins = [];
let cv = null, g2 = null, W = 0, H = 0, dpr = 1, geo = { cx: 0, cy: 0, k0: 0.5 }, COL = { ...FALLBACK };
let ui = null, raf = 0, ro = null, alive = false, onResize = null, hovJ = -1;

const $ = (s) => root.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const two = (n) => String(n).padStart(2, '0');
const Z = (s) => String(s || '').slice(0, 16) + 'Z';          // the outputs write UTC without the Z
const msOf = (s) => Date.parse(Z(s));
const num = (v) => Number(v).toLocaleString('en-US');
const pct = (v) => Math.round(v * 100) + '%';
const p1 = (v) => { const s = (v * 100).toFixed(1); return s.endsWith('.0') ? s.slice(0, -2) : s; };
const pct1 = (v) => p1(v) + '%';
const signed = (v) => (v < 0 ? '−' : '+') + Math.abs(v).toFixed(2);
function dateStr(ms, year = true) {
  const x = new Date(ms);
  if (getLang() === 'ko') return `${year ? x.getUTCFullYear() + '년 ' : ''}${x.getUTCMonth() + 1}월 ${x.getUTCDate()}일`;
  return `${x.getUTCDate()} ${MON[x.getUTCMonth()]}${year ? ' ' + x.getUTCFullYear() : ''}`;
}
const clock = (ms) => { const x = new Date(ms); return `${two(x.getUTCHours())}:${two(x.getUTCMinutes())} UTC`; };
const dateTime = (ms) => `${dateStr(ms)} · ${clock(ms)}`;
const siteShort = (id) => (id === 'im2' ? 'IM-2' : id === 'pole' || id === 'shk' ? t('gh.site.' + id) : String(id).toUpperCase());
function siteName(id) {
  const s = ((GH && GH.meta.sites) || []).find((x) => x.id === id);
  return s ? (getLang() === 'ko' ? s.name_ko || s.name_en : s.name_en || s.name_ko) : siteShort(id);
}
const causeList = (str) => String(str || '').split(',').map((c) => c.trim()).filter(Boolean).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
const causeText = (str) => causeList(str).map((c) => t('gh.s.' + (ORDER.includes(c) ? c : 'other'))).join(' + ');
const critText = () => (d.criteria_status === 'assumed' ? t('gh.assumed') : t('gh.crit.other', { s: d.criteria_status || '?' }));

/* ---------------- the plan in the shared state ---------------- */
function resolvePlan(st) {
  const site = SITES.includes(st.site) ? st.site : DEF.site;
  let t0 = msOf(st.time); if (!Number.isFinite(t0)) t0 = msOf(DEF.time);
  const delay = typeof st.delay === 'number' && Number.isFinite(st.delay) ? st.delay : DEF.delay;
  const t1 = t0 + delay * DAY;
  const pb = String(st.planb || '').toLowerCase();
  const pbSite = SITES.find((s) => new RegExp(`(^|[^a-z0-9])${s}([^a-z0-9]|$)`).test(pb)) || null;
  const m = pb.match(/(\d{4}-\d{2}-\d{2})(?:t(\d{2}:\d{2}))?/);
  const pbMs = m ? Date.parse(`${m[1]}T${m[2] || '12:00'}Z`) : null;
  const entry = PB ? PB.find((e) => e.from_site === site && e.delay_days === delay && msOf(e.from_date) === t0) || null : null;
  const wait = entry && entry.same_site_later_date ? msOf(entry.same_site_later_date.date) : null;
  let alt = null;
  if (pb) {
    if (pbSite && pbSite !== site) alt = { site: pbSite, ms: pbMs ?? t1 };
    else if (pbMs !== null) alt = { site, ms: pbMs };
    else if ((pbSite === site || /wait|same|later/.test(pb)) && wait !== null) alt = { site, ms: wait };
  }
  return { site, t0, delay, t1, alt, plan: alt || { site, ms: t1 }, entry, wait };
}
const planText = () => `${siteShort(P.plan.site)}, ${dateStr(P.plan.ms)}`;
const sameCase = () => P.plan.site === d.target_site && P.plan.ms === msOf(d.landing_time_utc);

/* ---------------- the dates strip (nhf_check.json) ---------------- */
function prepDates() {
  D = []; strip = null; mapJ = -1; pins = [];
  if (!NH || !Array.isArray(NH.data.ghost_landers_precise_vs_nhf)) return;
  D = NH.data.ghost_landers_precise_vs_nhf.map((r) => ({ ms: msOf(r.landing_time_utc), p: r.p_precise, lo: r.ci95_precise[0], hi: r.ci95_precise[1], nhf: r.p_nhf, margin: r.site_margin }))
    .filter((r) => Number.isFinite(r.ms) && typeof r.p === 'number').sort((a, b) => a.ms - b.ms);
  const key = Object.keys(NH.data.summary || {}).find((k) => /^p_precise_ge_/.test(k));
  TH = key ? parseFloat(key.replace('p_precise_ge_', '')) || 0.9 : 0.9;
  let u = 0; const xs = [];
  D.forEach((r, i) => { if (i) { const gap = (r.ms - D[i - 1].ms) / DAY; if (gap > 1.5) u += gap > 45 ? 3.4 : 1.7; } xs.push(u + 0.5); u += 1; });
  strip = { xs, total: u };
  const idx = (ms) => D.findIndex((r) => r.ms === ms);
  const add = (ms, kind) => { const j = idx(ms); if (j < 0) return; const e = pins.find((q) => q.j === j); if (e) e.kinds.push(kind); else pins.push({ j, kinds: [kind] }); };
  mapJ = idx(msOf(d.landing_time_utc));
  if (mapJ >= 0) add(D[mapJ].ms, 'map');
  const tgt = d.target_site;
  if (P.site === tgt && P.delay > 0) add(P.t0, 'orig');
  if (P.plan.site === tgt) add(P.plan.ms, 'plan');
  if (P.site === tgt && !P.alt && P.entry && P.entry.delayed_date_passed === false && P.wait !== null) add(P.wait, 'wait');
}
function buildStrip() {
  const box = $('#gh-strip'); if (!box || !strip) return;
  const w = box.clientWidth; if (!w) return;
  const padR = 34, FH = 28, BH = 46, plotW = w - padR, u = plotW / strip.total, bw = Math.max(1.4, u * 0.74);
  const y = (p) => FH + BH * (1 - p), f = (v) => v.toFixed(2);
  let s = `<svg width="${w}" height="${FH + BH}" viewBox="0 0 ${w} ${FH + BH}" aria-hidden="true"><rect class="gh-st-bg" x="0" y="${FH}" width="${f(plotW)}" height="${BH}" rx="3"/>`;
  D.forEach((r, i) => {
    const x = strip.xs[i] * u - bw / 2, c = r.p >= TH ? 'hi' : 'lo';
    s += `<rect class="gh-b ${c}" x="${f(x)}" y="${f(y(r.lo))}" width="${f(bw)}" height="${f(BH * r.lo)}"/>`;
    if (r.hi > r.lo) s += `<rect class="gh-b ci ${c}" x="${f(x)}" y="${f(y(r.hi))}" width="${f(bw)}" height="${f(BH * (r.hi - r.lo))}"/>`;
    s += `<rect class="gh-b tick ${c}" x="${f(x)}" y="${f(Math.min(y(r.p), FH + BH - 1.5))}" width="${f(bw)}" height="1.5"/>`;
  });
  s += `<line class="gh-st-th" x1="0" x2="${f(plotW)}" y1="${f(y(TH))}" y2="${f(y(TH))}"/><text class="gh-st-tx" x="${f(plotW + 6)}" y="${f(y(TH) + 4)}">${pct(TH)}</text>`;
  s += `<rect id="gh-st-hov" x="0" y="${FH - 3}" width="${f(bw + 3)}" height="${BH + 3}" rx="2" visibility="hidden"/>`;
  s += '</svg>';
  // month ticks under the strip: January and July, as on screen 01
  let ticks = '', lastX = -99;
  D.forEach((r, i) => {
    const x = new Date(r.ms), mo = x.getUTCMonth(), prev = i ? new Date(D[i - 1].ms) : null;
    if ((mo === 0 || mo === 6) && (!prev || prev.getUTCMonth() !== mo)) { const px = strip.xs[i] * u; if (px - lastX > 70) { ticks += `<span style="left:${f(px)}px">${MON[mo]} ${x.getUTCFullYear()}</span>`; lastX = px; } }
  });
  let flags = '';
  pins.forEach((q, n) => {
    const px = strip.xs[q.j] * u, cls = q.kinds.includes('plan') ? 'plan' : q.kinds.includes('map') ? 'map' : 'ref';
    flags += `<i class="gh-pin ${cls}" style="left:${f(px)}px" data-n="${n}"></i><span class="gh-flag ${cls}" data-n="${n}" data-x="${f(px)}">${esc(q.kinds.map((k) => t('gh.pin.' + k)).join(' = '))} <b>${pct(D[q.j].p)}</b></span>`;
  });
  box.innerHTML = s + `<span class="gh-ticks">${ticks}</span>` + flags + '<div class="gh-tip" id="gh-tip2" hidden></div>';
  // flags sit in two rows over the bars; a flag that fits in neither keeps its pin only
  const rows = [[], []];
  box.querySelectorAll('.gh-flag').forEach((el) => {
    const px = Number(el.dataset.x), fw = el.offsetWidth, left = px < plotW / 2 ? Math.max(0, px - 4) : Math.min(plotW - fw, px - fw + 4);
    const row = rows.findIndex((r) => r.every(([a, b]) => left + fw + 6 < a || left > b + 6));
    if (row < 0) { el.hidden = true; return; }
    rows[row].push([left, left + fw]);
    el.style.left = left + 'px'; el.style.top = (row * 14) + 'px';
    const pin = box.querySelector(`.gh-pin[data-n="${el.dataset.n}"]`); if (pin) pin.style.top = (row * 14 + 12) + 'px';
  });
  strip.u = u; strip.bw = bw; strip.plotW = plotW; strip.w = w;
  if (hovJ >= 0) showDate(hovJ);
}
function showDate(j) {
  const tip = $('#gh-tip2'), hov = $('#gh-st-hov'); if (!tip || !hov || !strip.u) return;
  hovJ = j;
  if (j < 0) { tip.hidden = true; hov.setAttribute('visibility', 'hidden'); return; }
  const r = D[j], px = strip.xs[j] * strip.u;
  hov.setAttribute('x', (px - strip.bw / 2 - 1.5).toFixed(2)); hov.setAttribute('visibility', 'visible');
  const tags = (pins.find((q) => q.j === j) || { kinds: [] }).kinds.map((k) => t('gh.pin.' + k)).join(' = ');
  tip.innerHTML = `<b>${esc(dateTime(r.ms))}</b>${tags ? `<em>${esc(tags)}</em>` : ''}<span>${esc(t('gh.tip.p', { p: pct1(r.p), lo: p1(r.lo), hi: pct1(r.hi) }))}</span>` +
    `<span class="q">${esc(t('gh.tip.x', { p: typeof r.nhf === 'number' ? pct1(r.nhf) : '–', m: typeof r.margin === 'number' ? signed(r.margin) : '–' }))}</span>`;
  tip.hidden = false;
  const half = tip.offsetWidth / 2;
  tip.style.left = Math.max(half, Math.min(strip.w - half, px)) + 'px';
  const box = $('#gh-strip'); box.setAttribute('aria-valuenow', j); box.setAttribute('aria-valuetext', `${dateStr(r.ms)}: ${pct1(r.p)}`);
}

/* ---------------- the stage ---------------- */
function measure() {
  const st = $('#gh-stage'); if (!st || !cv) return;
  const r = st.getBoundingClientRect(); W = r.width; H = r.height;
  if (!W || !H) return;
  dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const card = $('.gh-card'), floating = getComputedStyle(card).position === 'absolute';
  if (floating) {   // words top left, the answer card bottom left, the scatter large in the free space on the right
    const edge = $('.gh-caption').getBoundingClientRect().left - r.left, right = W - edge;
    const cardR = card.getBoundingClientRect().right - r.left;
    const textR = Math.max(edge, ...[...root.querySelectorAll('.gh-caption h1, .gh-caption .s3-lead, .gh-caption .s3-sub, .gh-legend')].map((el) => {
      const rg = document.createRange(); rg.selectNodeContents(el); return rg.getBoundingClientRect().right - r.left;   // where the words end, not the box
    }));
    const R = Math.max(110, Math.min(H / 2 - 22, (right - cardR - 16) / 2));
    const cx = Math.min(right - R, Math.max(textR + R * 0.75, (textR + right) / 2));
    geo = { cx, cy: H / 2 - 4, k0: R / NEAR };
  } else {
    geo = { cx: W / 2, cy: H / 2, k0: (Math.min(W, H) / 2 - 26) / NEAR };
  }
  draw();
}
function halo(text, x, y, fill, font, align = 'left') {
  g2.font = font; g2.textAlign = align; g2.textBaseline = 'middle';
  g2.lineWidth = 3.5; g2.lineJoin = 'round'; g2.strokeStyle = '#000'; g2.strokeText(text, x, y);
  g2.fillStyle = fill; g2.fillText(text, x, y);
}
function draw() {
  if (!g2 || !W) return;
  const k = geo.k0 * NEAR / ui.viewR, cx = geo.cx, cy = geo.cy, far = (ui.viewR - NEAR) / (FAR - NEAR);
  const X = (e) => cx + e * k, Y = (n) => cy - n * k;
  const INK = '245, 243, 238', FONT = '"Inter", "Noto Sans KR", system-ui, sans-serif', MONO = '"IBM Plex Mono", ui-monospace, monospace';
  g2.setTransform(dpr, 0, 0, dpr, 0, 0);
  g2.globalAlpha = 1; g2.fillStyle = '#000'; g2.fillRect(0, 0, W, H);

  // ground cells: the verdict of each 80 m cell, as the file gives it
  if (ui.cells) {
    const half = ui.step / 2, s = ui.step * k - 1.5;
    for (let i = 0; i < G.east_m.length; i++) {
      const e = G.east_m[i], n = G.north_m[i];
      let fade = Math.min(1, Math.max(0, (600 - Math.hypot(e, n)) / 170)); fade += (1 - fade) * far;   // the near view lets the far cells fall into the black
      if (fade < 0.02) continue;
      const x = X(e - half) + 0.75, y = Y(n + half) + 0.75, on = ui.hover && ui.hover.cell === i;
      if (G.passed[i]) { g2.globalAlpha = (on ? 0.22 : 0.085) * fade; g2.fillStyle = COL.ok; g2.fillRect(x, y, s, s); continue; }
      const cs = causeList(G.fail_causes[i]);
      g2.globalAlpha = (on ? 0.5 : 0.24) * fade; g2.fillStyle = COL[cs[0]] || COL.other; g2.fillRect(x, y, s, s);
      if (cs[1]) { g2.globalAlpha = (on ? 0.8 : 0.5) * fade; g2.fillStyle = COL[cs[1]] || COL.other; g2.beginPath(); g2.moveTo(x + s, y); g2.lineTo(x + s, y + s); g2.lineTo(x, y + s); g2.closePath(); g2.fill(); }
    }
    g2.globalAlpha = 1;
  }

  // axes in metres: East to the right, North up
  const L = ui.viewR * k, x0 = Math.max(6, cx - L), x1 = Math.min(W - 6, cx + L), y0 = Math.max(26, cy - L), y1 = Math.min(H - 30, cy + L);
  g2.strokeStyle = `rgba(${INK}, 0.26)`; g2.lineWidth = 1;
  g2.beginPath(); g2.moveTo(x0, Math.round(cy) + 0.5); g2.lineTo(x1, Math.round(cy) + 0.5); g2.moveTo(Math.round(cx) + 0.5, y0); g2.lineTo(Math.round(cx) + 0.5, y1); g2.stroke();
  const tick = far > 0.5 ? 200 : 100, lab = far > 0.5 ? 400 : 200;
  g2.strokeStyle = `rgba(${INK}, 0.5)`; g2.beginPath();
  for (let v = -Math.floor(ui.viewR / tick) * tick; v <= ui.viewR; v += tick) {
    if (!v) continue;
    const len = v % lab === 0 ? 5 : 3, px = Math.round(X(v)) + 0.5, py = Math.round(Y(v)) + 0.5;
    if (px > x0 && px < x1) { g2.moveTo(px, cy - len); g2.lineTo(px, cy + len); }
    if (py > y0 && py < y1) { g2.moveTo(cx - len, py); g2.lineTo(cx + len, py); }
  }
  g2.stroke();
  for (let v = -Math.floor(ui.viewR / lab) * lab; v <= ui.viewR; v += lab) {
    if (!v) continue;
    const s = (v < 0 ? '−' : '') + Math.abs(v);
    if (X(v) > x0 + 8 && X(v) < x1 - 8) halo(s, X(v), cy + 15, `rgba(${INK}, 0.62)`, `400 10px ${MONO}`, 'center');
    if (Y(v) > y0 + 8 && Y(v) < y1 - 8) halo(s, cx - 9, Y(v), `rgba(${INK}, 0.62)`, `400 10px ${MONO}`, 'right');
  }
  halo(t('gh.ax.e'), x1 - 2, cy - 11, `rgba(${INK}, 0.62)`, `400 10px ${MONO}`, 'right');
  // north arrow at the top of the North axis
  g2.fillStyle = `rgb(${INK})`; g2.beginPath(); g2.moveTo(cx + 0.5, y0 - 9); g2.lineTo(cx + 5, y0 + 1); g2.lineTo(cx - 4, y0 + 1); g2.closePath(); g2.fill();
  halo('N', cx + 0.5, y0 - 17, `rgb(${INK})`, `800 11px ${FONT}`, 'center');
  halo(t('gh.ax.n'), cx + 10, y0 + 6, `rgba(${INK}, 0.62)`, `400 10px ${MONO}`, 'left');

  // 1-sigma and 2-sigma of the landing error (an ellipse along the heading; a circle when the sigmas are equal)
  const hd = (d.heading_deg || 0) * Math.PI / 180, rot = Math.atan2(-Math.cos(hd), Math.sin(hd));
  g2.setLineDash([4, 4]); g2.lineWidth = 1; g2.strokeStyle = `rgba(${INK}, 0.78)`;
  for (const m of [1, 2]) { g2.beginPath(); g2.ellipse(cx, cy, d.sigma_along_m * m * k, d.sigma_cross_m * m * k, rot, 0, Math.PI * 2); g2.stroke(); }
  g2.setLineDash([]);

  // the landers
  const rDot = Math.max(1.7, Math.min(3, 1.2 + 2.4 * k)), n = Math.min(S.east_m.length, Math.floor(ui.shown)), fresh = ui.playing ? 70 : 0;
  for (let i = 0; i < n; i++) {
    const st = S.status[i]; if (ui.hidden[st]) continue;
    const x = X(S.east_m[i]), y = Y(S.north_m[i]), a = fresh && n - i < fresh ? 1 - (n - i) / fresh : 0, r = rDot * (1 + 1.5 * a);
    g2.fillStyle = '#000'; g2.beginPath(); g2.arc(x, y, r + 0.8, 0, 6.2832); g2.fill();
    g2.fillStyle = a > 0.45 ? '#fff' : COL[st] || COL.other; g2.beginPath(); g2.arc(x, y, r, 0, 6.2832); g2.fill();
  }

  // ring labels and the target on top
  const q = Math.SQRT1_2, same = d.sigma_along_m === d.sigma_cross_m;
  for (const m of [1, 2]) {
    const rr = Math.min(d.sigma_along_m, d.sigma_cross_m) * m * k;
    halo(same ? `${m}σ · ${num(d.sigma_along_m * m)} m` : `${m}σ`, cx + rr * q + 6, cy - rr * q - 6, `rgb(${INK})`, `700 11px ${FONT}`, 'left');
  }
  g2.strokeStyle = '#000'; g2.lineWidth = 5; g2.beginPath(); g2.arc(cx, cy, 8, 0, 6.2832); g2.stroke();
  g2.strokeStyle = COL.ok; g2.lineWidth = 2; g2.beginPath(); g2.arc(cx, cy, 8, 0, 6.2832);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { g2.moveTo(cx + dx * 4, cy + dy * 4); g2.lineTo(cx + dx * 14, cy + dy * 14); }
  g2.stroke();

  // scale
  const sm = far > 0.5 ? 400 : 200, sx1 = Math.min(x1, W - 12), sy = Math.min(H - 44, cy + L * 0.9);
  g2.strokeStyle = `rgb(${INK})`; g2.lineWidth = 1.5; g2.beginPath();
  g2.moveTo(sx1 - sm * k, sy - 4); g2.lineTo(sx1 - sm * k, sy); g2.lineTo(sx1, sy); g2.lineTo(sx1, sy - 4); g2.stroke();
  halo(`${sm} m`, sx1 - sm * k / 2, sy - 10, `rgb(${INK})`, `700 11px ${FONT}`, 'center');

  if (ui.hover && ui.hover.lander >= 0) {
    const i = ui.hover.lander, x = X(S.east_m[i]), y = Y(S.north_m[i]);
    g2.strokeStyle = '#000'; g2.lineWidth = 4; g2.beginPath(); g2.arc(x, y, rDot + 5, 0, 6.2832); g2.stroke();
    g2.strokeStyle = '#fff'; g2.lineWidth = 1.5; g2.beginPath(); g2.arc(x, y, rDot + 5, 0, 6.2832); g2.stroke();
  }
}

function cellOf(e, n) { const v = cellAt.get(`${Math.round(e / ui.step) * ui.step},${Math.round(n / ui.step) * ui.step}`); return v === undefined ? -1 : v; }
function pick(mx, my) {
  const k = geo.k0 * NEAR / ui.viewR, n = Math.min(S.east_m.length, Math.floor(ui.shown));
  let best = -1, bd = 13 * 13;
  for (let i = 0; i < n; i++) {
    if (ui.hidden[S.status[i]]) continue;
    const dx = geo.cx + S.east_m[i] * k - mx, dy = geo.cy - S.north_m[i] * k - my, q = dx * dx + dy * dy;
    if (q < bd) { bd = q; best = i; }
  }
  if (best >= 0) return { lander: best, cell: cellOf(S.east_m[best], S.north_m[best]) };
  const c = ui.cells ? cellOf((mx - geo.cx) / k, (geo.cy - my) / k) : -1;
  return c >= 0 ? { lander: -1, cell: c } : null;
}
function offsetText(e, n) {
  const a = `${num(Math.round(Math.abs(e)))} m ${t(e < 0 ? 'gh.w' : 'gh.e')}`, b = `${num(Math.round(Math.abs(n)))} m ${t(n < 0 ? 'gh.so' : 'gh.n')}`;
  return `${a} · ${b}`;
}
function metricRows(c) {   // the cell's values next to the assumed limits (the verdict itself comes from the file)
  const fmtV = (metric, v) => (typeof v !== 'number' ? '–' : /_h$/.test(metric) ? `${num(Math.round(v))} h` : metric === 'approach' ? String(v) : pct(v));
  return Object.values(d.criteria || {}).filter((cr) => G.metrics && Array.isArray(G.metrics[cr.metric])).map((cr) =>
    `<li><span>${esc(t('gh.m.' + cr.metric))}</span><b>${esc(fmtV(cr.metric, G.metrics[cr.metric][c]))}</b><i>${esc(t(cr.kind === 'max' ? 'gh.max' : 'gh.min', { v: fmtV(cr.metric, cr.limit) }))}</i></li>`).join('');
}
function showTip(hit, mx, my) {
  const tip = $('#gh-tip'); if (!tip) return;
  if (!hit) { tip.hidden = true; return; }
  let html = '';
  const c = hit.cell, chip = (st, label) => `<span class="pm-chip ${esc(st)}">${esc(label)}</span>`;
  if (hit.lander >= 0) {
    const i = hit.lander, e = S.east_m[i], n = S.north_m[i], st = S.status[i];
    html += `<p class="hd"><b>${esc(t('gh.tip.lander', { i: num(i + 1), n: num(S.east_m.length) }))}</b>${chip(ORDER.includes(st) ? st : 'other', t('gh.s.' + (ORDER.includes(st) ? st : 'other')))}</p>` +
      `<p>${esc(offsetText(e, n))}</p><p class="q">${esc(t('gh.tip.from', { r: num(Math.round(Math.hypot(e, n))) }))}</p>`;
  }
  if (c >= 0) {
    const pass = G.passed[c], cs = causeList(G.fail_causes[c]);
    html += `<p class="hd ${hit.lander >= 0 ? 'sep' : ''}"><b>${esc(t('gh.tip.cell', { id: G.point_id ? G.point_id[c] : c }))}</b>${hit.lander >= 0 ? '' : chip(pass ? 'ok' : cs[0] || 'other', pass ? t('gh.s.ok') : causeText(G.fail_causes[c]))}</p>` +
      (hit.lander >= 0 ? '' : `<p>${esc(offsetText(G.east_m[c], G.north_m[c]))}</p>`) +
      `<p class="q">${esc(pass ? t('gh.tip.pass') : t('gh.tip.fail', { c: causeText(G.fail_causes[c]) }))}</p><ul>${metricRows(c)}</ul>`;
  }
  tip.innerHTML = html; tip.hidden = false;
  const sec = $('.gh').getBoundingClientRect(), st = $('#gh-stage').getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
  let x = st.left - sec.left + mx + 16, y = st.top - sec.top + my + 16;
  if (x + tw > sec.width - 8) x = st.left - sec.left + mx - tw - 16;
  if (y + th > st.bottom - sec.top - 8) y = st.top - sec.top + my - th - 16;
  tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, y) + 'px';
}

/* ---------------- motion: the drop and the zoom ---------------- */
function loop(now) {
  if (!alive) return;
  let busy = false;
  if (ui.playing) {
    const n = S.east_m.length, k = Math.min(1, (now - ui.t0) / DROP_MS);
    ui.shown = k * n; busy = k < 1;
    if (!busy) { ui.playing = false; ui.shown = n; }
    setCount();
  }
  if (ui.zoom) {
    const k = Math.min(1, (now - ui.zoom.t0) / 420), e = 1 - Math.pow(1 - k, 3);
    ui.viewR = ui.zoom.a + (ui.zoom.b - ui.zoom.a) * e;
    if (k < 1) busy = true; else ui.zoom = null;
  }
  draw();
  raf = busy ? requestAnimationFrame(loop) : 0;
}
const kick = () => { if (!raf && alive) raf = requestAnimationFrame(loop); };
function setCount() {
  const el = $('#gh-count'); if (!el) return;
  const n = S.east_m.length;
  el.textContent = ui.playing ? t('gh.count.run', { i: num(Math.max(1, Math.floor(ui.shown))), n: num(n) }) : t('gh.count', { n: num(n) });
}
function play() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { ui.shown = S.east_m.length; ui.playing = false; setCount(); draw(); return; }
  ui.playing = true; ui.t0 = performance.now(); ui.shown = 0; ui.hover = null; showTip(null); kick();
}
function setView(v) {
  if (ui.view === v) return;
  ui.view = v; ui.hover = null; showTip(null);
  root.querySelectorAll('.gh-views button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
  const b = v === 'far' ? FAR : NEAR;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { ui.viewR = b; draw(); return; }
  ui.zoom = { a: ui.viewR, b, t0: performance.now() }; kick();
}

/* ---------------- page ---------------- */
function shell() {
  const caseMs = msOf(d.landing_time_utc), caseSite = siteShort(d.target_site), n = S.east_m.length;
  const counts = Object.fromEntries(ORDER.map((k) => [k, 0])); S.status.forEach((s) => { counts[ORDER.includes(s) ? s : 'other']++; });
  const cellKinds = new Map(); G.passed.forEach((p, i) => { const key = p ? '' : causeList(G.fail_causes[i]).join(','); cellKinds.set(key, (cellKinds.get(key) || 0) + 1); });
  const kinds = [...cellKinds.entries()].sort((a, b) => (a[0] === '' ? -1 : b[0] === '' ? 1 : b[1] - a[1]));
  const sw = (key) => { const cs = key.split(','); return key === '' ? '<i class="gh-sw ok"></i>' : `<i class="gh-sw" style="--a: var(--${esc(cs[0])}); --b: var(--${esc(cs[1] || cs[0])})"></i>`; };
  const crumb = [
    `<button type="button" class="s3-crumb-back" id="gh-back">← ${esc(t('gh.back'))}</button>`,
    `<span>${esc(t('gh.crumb.orig'))} <b>${esc(siteShort(P.site))}</b></span>`, `<span>${esc(dateStr(P.t0))}</span>`,
    `<b class="${P.delay ? 'gh-delay' : ''}">${esc(P.delay === 1 ? t('gh.crumb.delay1') : P.delay ? t('gh.crumb.delay', { n: P.delay }) : t('gh.crumb.nodelay'))}</b>`,
    P.alt ? `<span>${esc(t('gh.crumb.alt'))} <b>${esc(siteShort(P.alt.site))}</b> · ${esc(dateStr(P.alt.ms, new Date(P.alt.ms).getUTCFullYear() !== new Date(P.t0).getUTCFullYear()))}</span>` : '',
  ].filter(Boolean).join('<i>/</i>');
  const scope = sameCase() ? t('gh.scope.same', { site: caseSite, date: dateTime(caseMs) }) : t('gh.scope.other', { site: caseSite, date: dateTime(caseMs), plan: planText() });
  const meta = t('gh.meta', { site: caseSite.toUpperCase(), iso: Z(d.landing_time_utc), dur: num(d.duration_h), sa: num(d.sigma_along_m), sc: num(d.sigma_cross_m), hd: num(d.heading_deg), seed: d.seed, n, crit: d.criteria_status === 'assumed' ? 'ASSUMED CRITERIA' : `${String(d.criteria_status || '?').toUpperCase()} CRITERIA` }) +
    (d.outside_grid_frac > 0 ? ` · ${pct1(d.outside_grid_frac)} OUTSIDE GRID` : '');
  const sum = NH && NH.data.summary, ge = sum && sum[`p_precise_ge_${TH}`];

  const bd = d.breakdown || {}, bdKeys = ORDER.filter((k) => k !== 'other' || bd[k] > 0);

  root.innerHTML = `
    <section class="s3 photo gh" aria-label="${esc(t('gh.h1a') + ' ' + t('gh.h1b'))}">
      <div class="s3-stage" id="gh-stage"><canvas id="gh-cv" role="img" aria-label="${esc(t('gh.stage.aria', { site: caseSite, k: num(d.k), n: num(d.n) }))}"></canvas></div>
      <div class="s3-caption gh-caption">
        <p class="s3-crumb">${crumb}</p>
        <h1><span>${esc(t('gh.h1a'))}</span> <span>${esc(t('gh.h1b'))}</span></h1>
        <p class="s3-lead">${esc(t('gh.lead', { site: caseSite }))}</p>
        <p class="s3-sub${sameCase() ? '' : ' gh-other'}">${esc(scope)}</p>
        <div class="gh-legend">
          <div class="gh-lrow"><span class="gh-lh">${esc(t('gh.leg.landers'))}</span>${ORDER.filter((k) => counts[k]).map((k) =>
            `<button type="button" class="gh-lg" data-st="${k}" aria-pressed="true"><i class="gh-dot ${k}"></i>${esc(t('gh.s.' + k))} <b class="num">${num(counts[k])}</b></button>`).join('')}</div>
          <div class="gh-lrow"><button type="button" class="gh-lg gh-lh" id="gh-cells" aria-pressed="true"><i class="gh-box"></i>${esc(t('gh.leg.cells', { m: ui.step }))}</button>${kinds.map(([key, c]) =>
            `<span class="gh-lgi">${sw(key)}${esc(key === '' ? t('gh.leg.pass') : t('gh.leg.fail', { c: causeText(key) }))} <b class="num">${num(c)}</b></span>`).join('')}</div>
        </div>
      </div>
      <aside class="gh-card" aria-label="${esc(t('gh.card.h'))}">
        <div class="gh-c gh-c-a">
          <h2>${esc(t('gh.card.h'))}</h2>
          <p class="gh-big num">${esc(pct1(d.p))}</p>
        </div>
        <dl class="gh-c gh-c-n">
          <div><dt>${esc(t('gh.card.ci.h'))}</dt><dd class="num">${esc(t('gh.card.ci', { lo: p1(d.ci95[0]), hi: pct1(d.ci95[1]) }))}</dd></div>
          <div><dt>${esc(t('gh.card.kn.h'))}</dt><dd class="num">${esc(t('gh.card.kn', { k: num(d.k), n: num(d.n) }))} <small>${esc(t('gh.card.kn.u'))}</small></dd></div>
        </dl>
        <div class="gh-c gh-c-b">
          <h3>${esc(t('gh.card.bd'))}</h3>
          <span class="gh-stack" aria-hidden="true">${bdKeys.map((k) => (bd[k] > 0 ? `<i class="${k}" style="width:${(bd[k] * 100).toFixed(1)}%"></i>` : '')).join('')}</span>
          <ul class="gh-bd">${bdKeys.map((k) => `<li class="${bd[k] > 0 ? '' : 'zero'}"><span class="pm-chip ${k}">${esc(t('gh.s.' + k))}</span><b class="num">${esc(pct1(bd[k] || 0))}</b></li>`).join('')}</ul>
          ${d.outside_grid_frac > 0 ? `<p class="gh-warn"><span class="pm-chip power">${esc(t('gh.warn', { p: pct1(d.outside_grid_frac) }))}</span></p>` : ''}
        </div>
        <p class="gh-note">${esc(t('gh.card.note', { site: caseSite, date: dateStr(caseMs), crit: critText() }))}</p>
      </aside>
      <p class="s3-meta">${esc(meta)}</p>
      <div class="gh-tip" id="gh-tip" hidden></div>
    </section>
    <section class="s3-bar gh-bar">
      <div class="s3-ctl gh-ctl"><button class="s3-play" id="gh-play" type="button" aria-label="${esc(t('gh.play'))}" title="${esc(t('gh.play'))}"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 0 L12 6 L2 12 Z"/></svg></button><span class="s3-day num" id="gh-count"></span></div>
      ${strip ? `<p class="gh-key"><b>${esc(t('gh.strip.h', { site: caseSite }))}</b><span>${esc(ge && sum ? t('gh.strip.sum', { a: ge.n, n: sum.n_dates, th: pct(TH) }) : '')}</span></p>
      <div class="gh-strip" id="gh-strip" role="slider" tabindex="0" aria-label="${esc(t('gh.strip.aria', { n: D.length }))}" aria-valuemin="0" aria-valuemax="${D.length - 1}"></div>` : '<span></span><span></span>'}
      <div class="s3-views gh-views" role="group"><button type="button" data-v="near" aria-pressed="true">${esc(t('gh.view.near'))}</button><button type="button" data-v="far" aria-pressed="false">${esc(t('gh.view.far'))}</button></div>
      <button class="s3-land" id="gh-next" type="button">${esc(t('gh.next'))} →</button>
    </section>
    <p class="s3-credit">${esc(t('gh.credit', { n: num(n), m: ui.step, crit: critText() }))}</p>
    <section class="sources" aria-labelledby="gh-src-h"><h2 id="gh-src-h">${esc(t('gh.src'))}</h2><dl>${sources(kinds)}</dl></section>`;
}

function sources(kinds) {
  const caseMs = msOf(d.landing_time_utc), tgt = d.target_site, tgtS = siteShort(tgt), rows = [];
  const row = (k, v) => { if (v) rows.push(`<dt>${esc(t('gh.src.' + k))}</dt><dd>${esc(v)}</dd>`); };
  const caseRow = mapJ >= 0 ? D[mapJ] : null;
  row('scope', t('gh.src.scope.v', { name: siteName(tgt), date: dateTime(caseMs) }) + (caseRow && typeof caseRow.margin === 'number' ? ' ' + t('gh.src.scope.m', { m: caseRow.margin.toFixed(2) }) : ''));
  // the plan in the shared state, against what was computed
  const plan = [sameCase() ? t('gh.src.plan.same', { plan: planText() }) : t('gh.src.plan.other', { plan: planText() })];
  if (D.length) {
    const at = (ms) => D.find((r) => r.ms === ms);
    const line = (label, ms) => { const r = at(ms); return r ? t('gh.src.plan.in', { label, date: dateStr(ms), p: pct1(r.p), lo: p1(r.lo), hi: pct1(r.hi) }) : null; };
    if (P.site === tgt && P.delay > 0) plan.push(line(t('gh.pin.orig'), P.t0));
    if (P.plan.site === tgt) plan.push(line(t('gh.pin.plan'), P.plan.ms) || t('gh.src.plan.out', { date: dateStr(P.plan.ms), n: D.length, site: tgtS }));
    else plan.push(t('gh.src.plan.site', { site: tgtS }));
    if (P.site === tgt && !P.alt && P.entry && P.entry.delayed_date_passed === false) {
      if (P.entry.delayed_date_fail_causes) plan.push(t('gh.src.plan.fail', { date: dateStr(P.t1), site: tgtS, c: causeText(P.entry.delayed_date_fail_causes) }));
      if (P.wait !== null) plan.push(line(t('gh.pin.wait'), P.wait));
    }
  }
  row('plan', plan.filter(Boolean).join(' '));
  row('cond', t('gh.src.cond.v', { name: siteName(tgt), date: dateTime(caseMs), h: num(d.duration_h), sa: num(d.sigma_along_m), sc: num(d.sigma_cross_m), hd: num(d.heading_deg), seed: d.seed, n: num(d.n) }) +
    (d.sigma_along_m === d.sigma_cross_m ? ' ' + t('gh.src.cond.eq') : ''));
  const rMax = Math.round(Math.max(...G.east_m.map((e, i) => Math.hypot(e, G.north_m[i]))));
  row('ground', t('gh.src.ground.v', { n: num(G.east_m.length), m: ui.step, r: num(rMax), out: pct1(d.outside_grid_frac || 0),
    list: kinds.map(([key, c]) => t('gh.cellcount', { label: key === '' ? t('gh.leg.pass') : t('gh.leg.fail', { c: causeText(key) }), n: num(c) })).join(', ') }));
  const fmtL = (cr) => (/_h$/.test(cr.metric) ? `${num(cr.limit)} h` : cr.metric === 'approach' ? String(cr.limit) : pct(cr.limit));
  const crit = Object.values(d.criteria || {}).map((cr) => `${t('gh.m.' + cr.metric)} ${cr.kind === 'max' ? '≤' : '≥'} ${fmtL(cr)}`).join(' · ');
  if (crit) row('crit', t('gh.src.crit.v', { list: crit, status: d.criteria_status || '?' }));
  if (d.seed_check && typeof d.seed_check.p_std_10_seeds === 'number') row('seed', t('gh.src.seed.v', { a: (d.seed_check.p_std_10_seeds * 100).toFixed(2), b: (d.seed_check.expected_std * 100).toFixed(2) }));
  const sum = NH && NH.data.summary;
  if (sum) {
    const ge = sum[`p_precise_ge_${TH}`], lt = sum[`p_precise_lt_${TH}`];
    if (ge && lt) row('dates', t('gh.src.dates.v', { n: sum.n_dates, site: tgtS, k: num(d.n), a: ge.n, b: lt.n, th: pct(TH) }));
    row('nhf', t(sum.nhf_higher_by_over_1pp === 0 ? 'gh.src.nhf.v0' : 'gh.src.nhf.v', { w: sum.within_5pp, n: sum.n_dates, h: sum.nhf_higher_by_over_1pp }));
  }
  const M = GH.meta || {};
  row('terrain', M.terrain && M.terrain.source);
  row('eph', M.ephemeris && M.ephemeris.source);
  row('limits', t('gh.src.limits.v'));
  return rows.join('');
}

function wire() {
  $('#gh-back').addEventListener('click', () => ctx.set({ step: 'replan' }));
  $('#gh-next').addEventListener('click', () => ctx.set({ step: 'explain' }));
  $('#gh-play').addEventListener('click', play);
  root.querySelectorAll('.gh-views button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.v)));
  root.querySelectorAll('.gh-lg[data-st]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.st; ui.hidden[k] = !ui.hidden[k]; b.setAttribute('aria-pressed', String(!ui.hidden[k])); ui.hover = null; showTip(null); draw();
  }));
  $('#gh-cells').addEventListener('click', (e) => { ui.cells = !ui.cells; e.currentTarget.setAttribute('aria-pressed', String(ui.cells)); $('.gh-legend').classList.toggle('nocells', !ui.cells); ui.hover = null; showTip(null); draw(); });
  const over = (ev) => {
    const r = cv.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top, hit = pick(mx, my);
    const same = (!hit && !ui.hover) || (hit && ui.hover && hit.lander === ui.hover.lander && hit.cell === ui.hover.cell);
    ui.hover = hit; showTip(hit, mx, my); if (!same && !raf) draw();
  };
  cv.addEventListener('pointermove', over);
  cv.addEventListener('pointerdown', over);
  cv.addEventListener('pointerleave', () => { if (ui.hover) { ui.hover = null; showTip(null); if (!raf) draw(); } });
  const box = $('#gh-strip');
  if (box) {
    const near = (ev) => { const x = ev.clientX - box.getBoundingClientRect().left; let b = 0, bd = 1e9; strip.xs.forEach((u, i) => { const q = Math.abs(u * strip.u - x); if (q < bd) { bd = q; b = i; } }); return b; };
    box.addEventListener('pointermove', (ev) => showDate(near(ev)));
    box.addEventListener('pointerdown', (ev) => showDate(near(ev)));
    box.addEventListener('pointerleave', () => { if (document.activeElement !== box) showDate(-1); });
    box.addEventListener('blur', () => showDate(-1));
    box.addEventListener('focus', () => { if (hovJ < 0) showDate(mapJ >= 0 ? mapJ : 0); });
    box.addEventListener('keydown', (ev) => {
      const st = { ArrowLeft: -1, ArrowRight: 1, Home: -1e6, End: 1e6 }[ev.key]; if (!st) return;
      ev.preventDefault(); showDate(Math.max(0, Math.min(D.length - 1, (hovJ < 0 ? (mapJ >= 0 ? mapJ : 0) : hovJ) + st)));
    });
  }
  onResize = () => { buildStrip(); measure(); };
  addEventListener('resize', onResize);
  if (window.ResizeObserver) { ro = new ResizeObserver(() => measure()); ro.observe($('#gh-stage')); }
}

export default {
  id: 'ghosts',
  num: '③',
  label: '신뢰도',
  ownTitle: true,

  async render(el, c) {
    root = el; ctx = c;
    const [g, nh, pb] = await Promise.all([c.use('outputs/ghost_landers.json'), c.use('outputs/nhf_check.json'), c.use('outputs/planb_candidates.json')]);
    if (!g || !g.data || !g.data.samples || !g.data.grid) return c.missing(['outputs/ghost_landers.json']);
    GH = g; d = g.data; S = d.samples; G = d.grid; NH = nh; PB = pb && Array.isArray(pb.data) ? pb.data : null;
    // the grid step, read from the points themselves (80 m in the current file)
    const es = [...new Set(G.east_m)].sort((a, b) => a - b); let step = Infinity;
    for (let i = 1; i < es.length; i++) step = Math.min(step, es[i] - es[i - 1]);
    cellAt = new Map(G.east_m.map((e, i) => [`${e},${G.north_m[i]}`, i]));
    ui = { view: 'near', viewR: NEAR, cells: true, hidden: {}, shown: S.east_m.length, hover: null, playing: false, zoom: null, t0: 0, step: Number.isFinite(step) ? step : 80 };
    hovJ = -1;
    P = resolvePlan(c.state);
    prepDates();
    shell();
  },

  mounted() {
    if (!root || !root.querySelector('.gh')) return;   // the "no data" box is showing
    document.body.classList.add('immersive');
    alive = true;
    const css = getComputedStyle(document.documentElement);
    COL = Object.fromEntries(ORDER.map((k) => [k, css.getPropertyValue('--' + k).trim() || FALLBACK[k]]));
    cv = $('#gh-cv'); g2 = cv.getContext('2d');
    wire(); buildStrip(); measure(); setCount();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (alive) { buildStrip(); measure(); } });
    if (new URLSearchParams(location.search).get('still') === null) play();
  },

  update() { return 'rerender'; },

  unmount() {
    alive = false; cancelAnimationFrame(raf); raf = 0;
    if (onResize) removeEventListener('resize', onResize);
    if (ro) ro.disconnect();
    onResize = ro = cv = g2 = null;
    document.body.classList.remove('immersive');
  },
};
