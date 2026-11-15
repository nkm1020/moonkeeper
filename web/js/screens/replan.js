// ② Replan — "the landing slipped: does the plan still work, and what is Plan B?"
// Layout (one look with screen 01): a black stage with the headline and the path line; on the stage either a large
// window of the all-sites × dates verdicts around the chosen date, or, only for the 17 Nov 2026 landing that has
// path-traced frames, a before / after wipe of the original and the delayed frame. On the right of the stage: the site
// and date, the verdict (original vs delayed) and the Plan B answer cards. Under the stage a dark bar: back, the launch
// delay stepper, the whole 792-day verdict strip, view toggles and the lime next step. Numbers and sources sit below.
// The screen looks values up and draws them. Verdicts, margins and the Plan B order come from the pipeline files.
//
// Data (through ctx.use):
//   outputs/heatmap.json           site_ids, site_names, landing_times_utc, overall_margin, passed, fail_causes, metrics, approach,
//                                  criteria, criteria_status, duration_h, meta.sites[].name_en, meta.terrain / ephemeris / calc_si_usage
//   outputs/planb_candidates.json  entry by from_site + from_date + delay_days: delayed_date, delayed_date_passed,
//                                  delayed_date_fail_causes, same_site_later_date, same_date_other_sites; meta.delays_days, meta.ranking
//   outputs/planb_rules.json       data.no_safe_candidate.message (optional)
//   renders/index.json             which path-traced frames exist (optional; without it no frame is shown)
//
// Shared state (URL hash) this screen reads and writes:
//   site   original landing site id            (default im2)
//   time   ORIGINAL landing time, UTC ISO      (default 2026-11-17T12:00Z; this screen works on the daily 12:00 UTC landing
//                                               of that date and writes `YYYY-MM-DDT12:00Z`)
//   delay  launch delay in days                (0 = no delay, or one of planb meta.delays_days = 1, 3, 7; default 7)
//   planb  the chosen Plan B. FORMAT (screen 05 reads exactly this):
//            "wait:YYYY-MM-DD"  stay at the original site and land on that later date  (planb same_site_later_date.date)
//            "move:<site_id>"   land on the delayed date at another site               (planb same_date_other_sites[].site)
//          null / unknown / no longer a candidate → the rank 1 candidate of the entry (shown as selected here).
//          A bare site id ("mp1") is read as "move:mp1". Changing site, time or delay here clears planb.
//          "Check confidence →" writes the shown choice (and fills site / time / delay if they were empty).

import { t, addStrings, getLang } from '../i18n.js';

const DAY = 864e5;
const DEF = { site: 'im2', time: '2026-11-17T12:00Z', delay: 7 };
const WIN = 11;                                   // days in the window on the stage
const CAUSES = ['power', 'comm', 'approach'];
const CAUSE_HEX = { power: '#8A5400', comm: '#A3315B', approach: '#7142AD', other: '#5C6777' };   // = --power-bg, --comm-bg, --approach-bg, --other-bg
const LETTER = { power: 'P', comm: 'C', approach: 'A' };
const SHORT = { im2: 'IM-2' };
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const FRAMES = new URL('../../../data/renders/', import.meta.url);

addStrings({
  en: {
    'rp.h1': 'Find the light.', 'rp.lead': 'Keep the mission moving.',
    'rp.crumb.orig': 'Original', 'rp.crumb.delay': 'Delay +{n} {unit}', 'rp.crumb.nodelay': 'No delay', 'rp.crumb.alt': 'Alternative', 'rp.crumb.none': 'none',
    'rp.day': 'day', 'rp.days': 'days',
    'rp.s.orig.ok': '{site} passes on {date}.', 'rp.s.orig.fail': '{site} fails on {date} ({causes}).', 'rp.s.orig.nc': '{date} is not computed for {site}.',
    'rp.s.del.ok': 'A {n}-day slip to {date} still passes.', 'rp.s.del.fail': 'A {n}-day slip to {date} fails on {causes}.',
    'rp.s.del.nc': 'A {n}-day slip lands on {date}, which is not computed.', 'rp.s.del.out': 'A {n}-day slip runs past the last landing date in the data.',
    'rp.s.none': 'No slip yet. Step the launch delay to test the plan.',
    'rp.back': 'Where & when', 'rp.next': 'Check confidence', 'rp.site': 'Original landing site', 'rp.date': 'Original landing date', 'rp.noon': '12:00 UTC',
    'rp.delay': 'Launch delay', 'rp.less': 'Shorter delay', 'rp.more': 'Longer delay',
    'rp.pass': 'Pass', 'rp.fail': 'Fail', 'rp.nc': 'Not computed', 'rp.margin': 'Margin', 'rp.land': 'Land',
    'rp.c.power': 'Power', 'rp.c.comm': 'Comm', 'rp.c.approach': 'Approach', 'rp.c.other': 'Other',
    'rp.v.h': 'Does the plan still work?', 'rp.v.orig': 'Original', 'rp.v.del': 'Delayed +{n} d', 'rp.v.out': 'Past the last computed date',
    'rp.pb.h': 'Plan B', 'rp.pb.assumed': 'assumed criteria',
    'rp.b.wait.k': 'Same site, later date', 'rp.b.move.k': 'Same date, other site',
    'rp.b.wait': 'Wait at {site}', 'rp.b.stay': 'Stay at {site}', 'rp.b.move': 'Move to {site}',
    'rp.b.wait.n': '{n} more {unit} after {date}', 'rp.b.stay.n': 'Still passes on the delayed date',
    'rp.b.move.n': '{km} km from {site}',
    'rp.b.rec': 'Recommended', 'rp.b.rank': 'Rank {n}', 'rp.b.review': 'Needs review',
    'rp.b.others': 'Other sites that pass on {date}', 'rp.b.nowait': 'No later date at {site} passes in the computed range.',
    'rp.b.nomove': 'No other site passes on {date}.',
    'rp.b.nosafe.n': 'No later date at {site} and no other site on {date} passes within the computed range.',
    'rp.b.noentry': 'No computed candidate', 'rp.b.noentry.n': 'The Plan B file has no entry for {site}, {date}, +{n} {unit}.',
    'rp.b.nodelay': 'No slip, no Plan B yet.', 'rp.b.nodelay.n': 'Try a launch delay:', 'rp.b.try': '+{n} d',
    'rp.win': 'All sites × dates, {a} to {b}', 'rp.win.prev': 'One day earlier', 'rp.win.next': 'One day later',
    'rp.tag.orig': 'Original', 'rp.tag.del': '+{n} d',
    'rp.cell': '{site}, {date}: {v}', 'rp.lg.pass': 'Pass', 'rp.lg.more': 'brighter = more margin', 'rp.lg.nc': 'Not computed',
    'rp.lg.num': 'Number = overall margin, 0 or more passes', 'rp.lg.orig': 'Original', 'rp.lg.del': 'Delayed', 'rp.lg.pb': 'Plan B',
    'rp.strip': 'All sites × dates', 'rp.strip.range': '{a} to {b}', 'rp.strip.aria': 'All 8 sites and {n} landing dates. Click a cell to make it the original plan; arrow keys move the date and the site.',
    'rp.view.grid': 'Dates', 'rp.view.frames': 'Frames', 'rp.view.off': 'Computed frames exist only for the {date} 12:00 UTC landing, +0 to +{max} h.',
    'rp.f.orig': 'Original · {date}', 'rp.f.del': 'Delayed · {date}', 'rp.f.h': 'computed frame +{h} h', 'rp.f.wipe': 'Compare the original and the delayed frame',
    'rp.below.win': 'All sites × dates around {date}',
    'rp.d.h': 'The numbers behind the verdict', 'rp.d.note': '14-day mission ({h} h) after a landing at 12:00 UTC. A mark shows if the value meets the assumed criterion.',
    'rp.d.metric': 'Metric', 'rp.d.crit': 'Assumed criterion', 'rp.d.orig': 'Original', 'rp.d.del': 'Delayed +{n} d', 'rp.d.pb': 'Plan B',
    'rp.d.margin': 'Overall margin', 'rp.d.nocrit': 'no criterion', 'rp.d.met': 'meets the criterion', 'rp.d.miss': 'misses the criterion',
    'rp.m.sun_mean': 'Sun visible, mission mean', 'rp.m.longest_dark_h': 'Longest dark period', 'rp.m.comm_frac': 'Earth in view, share of mission',
    'rp.m.longest_comm_gap_h': 'Longest gap without Earth', 'rp.m.approach': 'Approach lighting', 'rp.m.first_sunset_h': 'First sunset after landing',
    'rp.credit': 'Computed verdicts · NASA LRO LOLA terrain · JPL Horizons DE441 · assumed criteria',
    'rp.src': 'Sources and limits', 'rp.src.verd': 'Verdicts', 'rp.src.crit': 'Criteria (assumed)', 'rp.src.pb': 'Plan B', 'rp.src.frames': 'Frames', 'rp.src.terrain': 'Terrain', 'rp.src.eph': 'Sun and Earth', 'rp.src.si': 'SI use',
    'rp.src.verd.v': 'data/outputs/heatmap.json: {s} sites × {n} daily landings at 12:00 UTC, {a} to {b}, each with a {h} h mission. The overall margin is 0 or more when every criterion is met. The last {k} dates are not computed because the mission would run past the end of the data; they are not failures.',
    'rp.src.crit.v': 'Status in the data: "{status}". These limits are assumed values for this demonstration, not NASA requirements.',
    'rp.src.pb.v': 'data/outputs/planb_candidates.json, delays of {list} days. {ranking}',
    'rp.src.frames.v': 'Frames exist only for the {date} 12:00 UTC landing and are shown only for that date. {kind}. {method} Limits: {limits}',
  },
  ko: {
    'rp.h1': '빛을 찾아요.', 'rp.lead': '임무는 계속돼요.',
    'rp.crumb.orig': '원래 계획', 'rp.crumb.delay': '지연 +{n}일', 'rp.crumb.nodelay': '지연 없음', 'rp.crumb.alt': '대안', 'rp.crumb.none': '없음',
    'rp.day': '일', 'rp.days': '일',
    'rp.s.orig.ok': '{site}, {date}: 통과해요.', 'rp.s.orig.fail': '{site}, {date}: 실패해요 ({causes}).', 'rp.s.orig.nc': '{site}, {date}: 계산하지 않았어요.',
    'rp.s.del.ok': '{n}일 밀려 {date}에 내려도 통과해요.', 'rp.s.del.fail': '{n}일 밀려 {date}에 내리면 {causes} 기준에서 실패해요.',
    'rp.s.del.nc': '{n}일 밀리면 {date}인데, 이 날은 계산하지 않았어요.', 'rp.s.del.out': '{n}일 밀리면 데이터의 마지막 착륙 날짜를 넘어요.',
    'rp.s.none': '아직 지연이 없어요. 발사 지연을 바꿔서 계획을 확인해 보세요.',
    'rp.back': '언제·어디', 'rp.next': '신뢰도 확인', 'rp.site': '원래 착륙지', 'rp.date': '원래 착륙 날짜', 'rp.noon': '12:00 UTC',
    'rp.delay': '발사 지연', 'rp.less': '지연 줄이기', 'rp.more': '지연 늘리기',
    'rp.pass': '통과', 'rp.fail': '실패', 'rp.nc': '계산 안 됨', 'rp.margin': '여유', 'rp.land': '착륙',
    'rp.c.power': '전력', 'rp.c.comm': '교신', 'rp.c.approach': '접근로', 'rp.c.other': '기타',
    'rp.v.h': '계획이 아직 괜찮을까요?', 'rp.v.orig': '원래', 'rp.v.del': '+{n}일 밀린 날', 'rp.v.out': '계산한 마지막 날짜 뒤',
    'rp.pb.h': 'Plan B', 'rp.pb.assumed': '기준은 가정값 (assumed criteria)',
    'rp.b.wait.k': '같은 곳, 뒷날짜', 'rp.b.move.k': '같은 날, 다른 곳',
    'rp.b.wait': '{site}에서 기다리기', 'rp.b.stay': '{site}에 그대로', 'rp.b.move': '{site}(으)로 옮기기',
    'rp.b.wait.n': '{date}에서 {n}일 더 기다려요', 'rp.b.stay.n': '밀린 날짜에도 통과해요',
    'rp.b.move.n': '{site}에서 {km} km',
    'rp.b.rec': '추천', 'rp.b.rank': '{n}순위', 'rp.b.review': '검토 필요',
    'rp.b.others': '{date}에 통과하는 다른 곳', 'rp.b.nowait': '계산 범위 안에서 {site}이(가) 통과하는 뒷날짜가 없어요.',
    'rp.b.nomove': '{date}에 통과하는 다른 곳이 없어요.',
    'rp.b.nosafe.n': '계산 범위 안에서 {site}의 뒷날짜도, {date}의 다른 곳도 통과하지 못해요. (안전한 대안 없음 · 엔지니어링 검토 필요)',
    'rp.b.noentry': '계산된 후보 없음', 'rp.b.noentry.n': 'Plan B 파일에 {site}, {date}, +{n}일 항목이 없어요.',
    'rp.b.nodelay': '지연이 없으면 Plan B도 아직 없어요.', 'rp.b.nodelay.n': '발사 지연을 골라 보세요:', 'rp.b.try': '+{n}일',
    'rp.win': '모든 착륙지 × 날짜, {a} ~ {b}', 'rp.win.prev': '하루 앞으로', 'rp.win.next': '하루 뒤로',
    'rp.tag.orig': '원래', 'rp.tag.del': '+{n}일',
    'rp.cell': '{site}, {date}: {v}', 'rp.lg.pass': '통과', 'rp.lg.more': '밝을수록 여유가 커요', 'rp.lg.nc': '계산 안 됨',
    'rp.lg.num': '숫자 = 전체 여유, 0 이상이면 통과', 'rp.lg.orig': '원래', 'rp.lg.del': '밀린 날', 'rp.lg.pb': 'Plan B',
    'rp.strip': '모든 착륙지 × 날짜', 'rp.strip.range': '{a} ~ {b}', 'rp.strip.aria': '착륙지 8곳과 착륙 날짜 {n}개예요. 칸을 누르면 원래 계획이 돼요. 화살표 키로 날짜와 착륙지를 옮겨요.',
    'rp.view.grid': '날짜', 'rp.view.frames': '장면', 'rp.view.off': '계산한 장면은 {date} 12:00 UTC 착륙, +0 ~ +{max}시간만 있어요.',
    'rp.f.orig': '원래 · {date}', 'rp.f.del': '밀린 날 · {date}', 'rp.f.h': '계산한 장면 +{h}시간', 'rp.f.wipe': '원래 장면과 밀린 날 장면 비교',
    'rp.below.win': '{date} 앞뒤의 모든 착륙지 × 날짜',
    'rp.d.h': '판정에 쓴 숫자', 'rp.d.note': '12:00 UTC에 내린 뒤 14일({h}시간) 임무예요. 표시는 값이 가정 기준을 지키는지 보여 줘요.',
    'rp.d.metric': '지표', 'rp.d.crit': '가정 기준 (assumed)', 'rp.d.orig': '원래', 'rp.d.del': '+{n}일 밀린 날', 'rp.d.pb': 'Plan B',
    'rp.d.margin': '전체 여유', 'rp.d.nocrit': '기준 없음', 'rp.d.met': '기준을 지켜요', 'rp.d.miss': '기준에 못 미쳐요',
    'rp.m.sun_mean': '해가 보이는 비율 (임무 평균)', 'rp.m.longest_dark_h': '가장 긴 어둠', 'rp.m.comm_frac': '지구가 보이는 비율',
    'rp.m.longest_comm_gap_h': '지구가 안 보이는 가장 긴 시간', 'rp.m.approach': '접근로 조명', 'rp.m.first_sunset_h': '착륙 뒤 첫 일몰',
    'rp.credit': '계산한 판정 · NASA LRO LOLA 지형 · JPL Horizons DE441 · 기준은 가정값 (assumed criteria)',
    'rp.src': '출처와 한계', 'rp.src.verd': '판정', 'rp.src.crit': '기준 (가정값)', 'rp.src.pb': 'Plan B', 'rp.src.frames': '장면', 'rp.src.terrain': '지형', 'rp.src.eph': '해와 지구', 'rp.src.si': 'SI 사용',
    'rp.src.verd.v': 'data/outputs/heatmap.json: 착륙지 {s}곳 × 매일 12:00 UTC 착륙 {n}개, {a} ~ {b}, 임무 {h}시간. 모든 기준을 지키면 전체 여유가 0 이상이에요. 마지막 {k}일은 임무가 데이터 끝을 넘어서 계산하지 않았어요. 실패가 아니에요.',
    'rp.src.crit.v': '데이터의 상태: "{status}". 이 기준값은 시연용 가정값이고 NASA 요구 조건이 아니에요.',
    'rp.src.pb.v': 'data/outputs/planb_candidates.json, 지연 {list}일. {ranking}',
    'rp.src.frames.v': '장면은 {date} 12:00 UTC 착륙만 있어서 그 날짜에만 보여 줘요. {kind}. {method} 한계: {limits}',
  },
});

let root = null, ctx = null, HM = null, PB = null, RULES = null, RN = null, pbIndex = null;
let userView = null, wipeX = 50, onResize = null, rsTimer = 0, enter = false;
const indexCache = new WeakMap();

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ko = () => getLang() === 'ko';
const NV = () => HM.data.landing_times_utc.length;
const isoOf = (j) => HM.data.landing_times_utc[j].slice(0, 16) + 'Z';           // the outputs carry UTC without a Z
const msOf = (j) => Date.parse(isoOf(j));
const short = (id) => SHORT[id] || String(id).toUpperCase();
const fullName = (s) => (ko() ? HM.data.site_names[s] : (HM.meta.sites && HM.meta.sites[s] && HM.meta.sites[s].name_en) || HM.data.site_names[s]);
const fmtM = (m) => (m >= 0 ? '+' : '−') + Math.abs(m).toFixed(2);
const unit = (n) => t(n === 1 ? 'rp.day' : 'rp.days');
function dShort(ms) { const d = new Date(ms); return ko() ? `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일` : `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; }
function dLong(ms) { const d = new Date(ms); return ko() ? `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일` : `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; }
function jOf(iso) {   // the daily 12:00 UTC landing of that date, clamped to the data; null if unreadable
  const ms = Date.parse(String(iso || '').slice(0, 10) + 'T12:00Z');
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.min(NV() - 1, Math.round((ms - msOf(0)) / DAY)));
}
function cell(s, j) {
  const d = HM.data, m = d.overall_margin[s][j], p = d.passed[s][j];
  if (m === null || m === undefined || p === null || p === undefined) return { k: 'nc', m: null, causes: [] };
  return { k: p ? 'ok' : 'fail', m, causes: p ? [] : String(d.fail_causes[s][j] || '').split(',').map((c) => c.trim()).filter(Boolean) };
}
function passHex(m) {   // lime, brighter with more margin (the same reading as the map of screen 01)
  const k = Math.sqrt(Math.max(0, Math.min(1, m))), a = [0x7d, 0x94, 0x34], b = [0xd8, 0xfa, 0x5c];
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * k).toString(16).padStart(2, '0')).join('');
}
function delaySteps() { return [...new Set([0, ...((PB.meta && PB.meta.delays_days) || [])])].sort((a, b) => a - b); }
function normPlan(p) {
  if (!p) return null;
  p = String(p);
  if (/^(wait|move):/.test(p)) return p;
  return /^\d{4}-\d\d-\d\d/.test(p) ? 'wait:' + p.slice(0, 10) : 'move:' + p;
}
function buildIndex(list) {
  if (!indexCache.has(list)) {
    const m = new Map();
    for (const e of list) m.set(`${e.from_site}|${String(e.from_date).slice(0, 10)}|${e.delay_days}`, e);
    indexCache.set(list, m);
  }
  return indexCache.get(list);
}

/* ---------------- what the state means, looked up in the files ---------------- */
function model() {
  const st = ctx.state, d = HM.data, n = NV(), steps = delaySteps();
  let si = d.site_ids.indexOf(st.site); if (si < 0) si = Math.max(0, d.site_ids.indexOf(DEF.site));
  const j0 = jOf(st.time) ?? jOf(DEF.time) ?? 0;
  let delay = typeof st.delay === 'number' && Number.isFinite(st.delay) ? st.delay : DEF.delay;
  if (!steps.includes(delay)) delay = steps.reduce((a, b) => (Math.abs(b - delay) < Math.abs(a - delay) ? b : a), steps[0]);
  const jd = j0 + delay < n ? j0 + delay : null, id = d.site_ids[si];
  const entry = delay > 0 ? pbIndex.get(`${id}|${isoOf(j0).slice(0, 10)}|${delay}`) || null : null;
  // the delayed date's verdict: the Plan B entry says pass / fail and why; the margin is the heatmap's
  let cd = jd === null ? null : cell(si, jd);
  if (entry && cd && typeof entry.delayed_date_passed === 'boolean') {
    cd = { k: entry.delayed_date_passed ? 'ok' : 'fail', m: cd.m, causes: entry.delayed_date_passed ? [] : String(entry.delayed_date_fail_causes || '').split(',').map((c) => c.trim()).filter(Boolean) };
  }
  const opts = [];
  if (entry) {
    const w = entry.same_site_later_date;
    if (w) opts.push({ key: 'wait:' + String(w.date).slice(0, 10), type: 'wait', si, id, j: jOf(w.date), margin: w.margin, rank: w.rank, wait: w.wait_days, review: w.review_required === true });
    for (const o of entry.same_date_other_sites || []) {
      opts.push({ key: 'move:' + o.site, type: 'move', si: d.site_ids.indexOf(o.site), id: o.site, j: jOf(entry.delayed_date), margin: o.margin, km: o.distance_km, rank: o.rank, review: o.review_required === true });
    }
    opts.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
  }
  const best = opts[0] || null, want = normPlan(st.planb);
  const sel = opts.find((o) => o.key === want) || best;
  // frames: side_hNNN = the scene NNN hours after the frames' landing. Shown only when the original date IS that landing.
  const fr = RN && RN.data && RN.data[id], frames = { orig: null, del: null, max: null, landing: null, delH: null };
  if (fr && Array.isArray(fr.hours)) {
    const url = (h) => new URL(`${id}/${String(fr.file || 'side_h{hhh}.jpg').replace('{hhh}', String(h).padStart(3, '0'))}`, FRAMES).href;
    frames.max = Math.max(...fr.hours); frames.landing = Date.parse(String(fr.landing_utc).slice(0, 16) + 'Z');
    if (msOf(j0) === frames.landing && fr.hours.includes(0)) {
      frames.orig = { h: 0, url: url(0) };
      frames.delH = delay * 24;
      if (delay > 0 && fr.hours.includes(delay * 24)) frames.del = { h: delay * 24, url: url(delay * 24) };
    }
  } else if (RN && RN.data) {
    const any = Object.values(RN.data)[0];
    if (any) { frames.max = Math.max(...any.hours); frames.landing = Date.parse(String(any.landing_utc).slice(0, 16) + 'Z'); }
  }
  const canFrames = !!frames.orig && (delay === 0 || !!frames.del);
  const view = userView === 'grid' || !canFrames ? 'grid' : 'frames';
  return { si, id, j0, jd, delay, steps, entry, opts, best, sel, frames, canFrames, view, c0: cell(si, j0), cd };
}

/* ---------------- pieces ---------------- */
const causeNames = (cs) => cs.map((c) => t('rp.c.' + (LETTER[c] ? c : 'other'))).join(', ');
function chips(c, withMargin = true) {
  if (!c || c.k === 'nc') return `<span class="pm-chip nc">${esc(t('rp.nc'))}</span>`;
  const mg = withMargin && c.m !== null && c.m !== undefined ? ' ' + fmtM(c.m) : '';
  if (c.k === 'ok') return `<span class="pm-chip ok">${esc(t('rp.pass'))}${mg}</span>`;
  const cs = c.causes.length ? c.causes : ['other'];
  return cs.map((k, i) => `<span class="pm-chip ${LETTER[k] ? k : ''}">${esc(t('rp.c.' + (LETTER[k] ? k : 'other')))}${i === cs.length - 1 ? mg : ''}</span>`).join('');
}
function crumb(M) {
  const alt = M.sel ? `${short(M.sel.id)} · ${dShort(msOf(M.sel.j))}` : t('rp.crumb.none');
  return `<p class="s3-crumb"><span>${esc(t('rp.crumb.orig'))} <b>${esc(short(M.id))}</b></span><i>/</i><span>${esc(dLong(msOf(M.j0)))}</span><i>/</i>` +
    `<b class="rp-lime">${esc(M.delay ? t('rp.crumb.delay', { n: M.delay, unit: unit(M.delay) }) : t('rp.crumb.nodelay'))}</b>` +
    (M.delay ? `<i>/</i><span>${esc(t('rp.crumb.alt'))} <b>${esc(alt)}</b></span>` : '') + '</p>';
}
function sentence(M) {
  const site = short(M.id), a = { site, date: dShort(msOf(M.j0)), causes: causeNames(M.c0.causes) };
  const s = t('rp.s.orig.' + M.c0.k, a) + ' ';
  if (!M.delay) return s + t('rp.s.none');
  if (M.jd === null) return s + t('rp.s.del.out', { n: M.delay });
  return s + t('rp.s.del.' + M.cd.k, { n: M.delay, date: dShort(msOf(M.jd)), causes: ko() ? causeNames(M.cd.causes) : causeNames(M.cd.causes).toLowerCase() });
}

function windowHtml(M) {
  const d = HM.data, n = NV(), j1 = Math.max(0, Math.min(n - WIN, M.j0 - 2)), cols = [];
  for (let j = j1; j < Math.min(n, j1 + WIN); j++) cols.push(j);
  const isD = (j) => M.delay && j === M.jd;
  const head = cols.map((j) => {
    const dt = new Date(msOf(j)), lab = ko() ? `${dt.getUTCMonth() + 1}.${dt.getUTCDate()}` : `${dt.getUTCDate()} ${MON[dt.getUTCMonth()]}`;
    const tag = j === M.j0 ? `<em>${esc(t('rp.tag.orig'))}</em>` : isD(j) ? `<em>${esc(t('rp.tag.del', { n: M.delay }))}</em>` : '<em></em>';
    return `<div class="rp-ch${j === M.j0 ? ' o' : isD(j) ? ' d' : ''}">${tag}<span class="num">${esc(lab)}</span></div>`;
  }).join('');
  const rows = d.site_ids.map((id, s) => {
    const cells = cols.map((j) => {
      const c = cell(s, j), date = dLong(msOf(j));
      const mark = (s === M.si && j === M.j0 ? ' is-orig' : '') + (s === M.si && isD(j) ? ' is-del' : '') + (M.delay && M.sel && s === M.sel.si && j === M.sel.j ? ' is-pb' : '');
      let style = '', inner = '', say = t('rp.nc');
      if (c.k === 'ok') { style = `background:${passHex(c.m)}`; inner = `<b class="num">${fmtM(c.m)}</b>`; say = `${t('rp.pass')} ${fmtM(c.m)}`; }
      else if (c.k === 'fail') {
        const cs = c.causes.length ? c.causes : ['other'], w = 100 / cs.length;
        style = 'background:' + (cs.length === 1 ? CAUSE_HEX[cs[0]] || CAUSE_HEX.other
          : `linear-gradient(90deg, ${cs.map((k, i) => `${CAUSE_HEX[k] || CAUSE_HEX.other} ${(i * w).toFixed(2)}% ${((i + 1) * w).toFixed(2)}%`).join(', ')})`);
        inner = `<b class="num">${fmtM(c.m)}</b><span class="cz">${cs.map((k) => LETTER[k] || '?').join(' ')}</span>`;
        say = `${t('rp.fail')} ${fmtM(c.m)}, ${causeNames(cs)}`;
      } else inner = '<b>–</b>';
      const label = t('rp.cell', { site: fullName(s), date, v: say });
      return `<button type="button" class="rp-cell ${c.k}${mark}" data-act="cell" data-s="${s}" data-j="${j}" data-fid="c${s}-${j}" style="${style}" title="${esc(label)}" aria-label="${esc(label)}"${s === M.si && j === M.j0 ? ' aria-current="true"' : ''}>${inner}</button>`;
    }).join('');
    return `<button type="button" class="rp-rl" data-act="row" data-s="${s}" data-fid="r${s}" aria-pressed="${s === M.si}" title="${esc(fullName(s))}"><b>${esc(short(id))}</b><span>${esc(fullName(s))}</span></button>${cells}`;
  }).join('');
  const aria = t('rp.win', { a: dLong(msOf(cols[0])), b: dLong(msOf(cols[cols.length - 1])) });
  return `<div class="rp-win" role="group" aria-label="${esc(aria)}"><div class="rp-grid" style="--n:${cols.length}">
      <div class="rp-nav"><button type="button" data-act="shift" data-d="-1" data-fid="sh-1" aria-label="${esc(t('rp.win.prev'))}"${M.j0 <= 0 ? ' disabled' : ''}>‹</button><button type="button" data-act="shift" data-d="1" data-fid="sh1" aria-label="${esc(t('rp.win.next'))}"${M.j0 >= n - 1 ? ' disabled' : ''}>›</button></div>
      ${head}${rows}</div></div>`;
}

function legendHtml(M) {
  return `<ul class="rp-legend">
      <li><i class="sw ok"></i>${esc(t('rp.lg.pass'))} <span>${esc(t('rp.lg.more'))}</span></li>
      <li><i class="sw power">P</i>${esc(t('rp.c.power'))}</li><li><i class="sw comm">C</i>${esc(t('rp.c.comm'))}</li><li><i class="sw approach">A</i>${esc(t('rp.c.approach'))}</li>
      <li><i class="sw nc"></i>${esc(t('rp.lg.nc'))}</li>
      <li class="brk"><i class="ring o"></i>${esc(t('rp.lg.orig'))}</li>${M.delay ? `<li><i class="ring d"></i>${esc(t('rp.lg.del'))}</li><li><i class="ring b"></i>${esc(t('rp.lg.pb'))}</li>` : ''}
      <li class="note"><span>${esc(t('rp.lg.num'))}</span></li>
    </ul>`;
}

function verdictHtml(M) {
  const row = (cls, lab, date, c) => `<div class="rp-vrow ${cls}"><dt><span>${esc(lab)}</span><b class="num">${esc(date)}</b></dt><dd>${c === undefined ? '' : chips(c)}</dd></div>`;
  let rows = row('o', t('rp.v.orig'), dLong(msOf(M.j0)), M.c0);
  if (M.delay) rows += M.jd === null ? row('d', t('rp.v.del', { n: M.delay }), t('rp.v.out'), null) : row('d', t('rp.v.del', { n: M.delay }), dLong(msOf(M.jd)), M.cd);
  return `<div class="rp-verdict"><h2 class="rp-k">${esc(t('rp.v.h'))}</h2><dl>${rows}</dl></div>`;
}

function rankChip(o, M) {
  if (o.review) return `<span class="rp-rank rv">${esc(t('rp.b.review'))}</span>`;
  return o === M.best ? `<span class="rp-rank rec">${esc(t('rp.b.rec'))}</span>` : `<span class="rp-rank">${esc(t('rp.b.rank', { n: o.rank }))}</span>`;
}
const CHECK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function cardHtml(o, M) {
  const on = M.sel === o, site = short(o.id), date = dShort(msOf(o.j));
  const title = o.type === 'move' ? t('rp.b.move', { site }) : t(o.wait > 0 ? 'rp.b.wait' : 'rp.b.stay', { site });
  const sub = o.type === 'move' ? t('rp.b.move.n', { km: Math.round(o.km), site: short(M.id) })
    : o.wait > 0 ? t('rp.b.wait.n', { n: Math.round(o.wait), unit: unit(Math.round(o.wait)), date: dShort(msOf(M.jd)) }) : t('rp.b.stay.n');
  return `<button type="button" class="rp-card${o === M.best ? ' best' : ''}" data-act="plan" data-key="${esc(o.key)}" data-fid="p-${esc(o.key)}" aria-pressed="${on}">
      <span class="rp-ck"><span>${esc(t(o.type === 'move' ? 'rp.b.move.k' : 'rp.b.wait.k'))}</span>${rankChip(o, M)}</span>
      <span class="rp-ct">${on ? CHECK : ''}${esc(title)}</span>
      <span class="rp-cn"><span><small>${esc(t('rp.land'))}</small><b class="num">${esc(date)}</b></span><span><small>${esc(t('rp.margin'))}</small><b class="num">${fmtM(o.margin)}</b></span></span>
      <span class="rp-cs">${esc(sub)}</span>
    </button>`;
}
function answerHtml(M) {
  const site = short(M.id);
  let B;
  if (!M.delay) {
    B = `<div class="rp-card msg"><span class="rp-ct">${esc(t('rp.b.nodelay'))}</span><span class="rp-cs">${esc(t('rp.b.nodelay.n'))}</span>
      <span class="rp-try">${M.steps.filter(Boolean).map((n) => `<button type="button" data-act="setdelay" data-n="${n}" data-fid="try${n}">${esc(t('rp.b.try', { n }))}</button>`).join('')}</span></div>`;
  } else if (!M.entry) {
    B = `<div class="rp-card msg"><span class="rp-ct">${esc(t('rp.b.noentry'))}</span><span class="rp-cs">${esc(t('rp.b.noentry.n', { site, date: dLong(msOf(M.j0)), n: M.delay, unit: unit(M.delay) }))}</span></div>`;
  } else if (!M.opts.length) {
    const rule = RULES && RULES.data && RULES.data.no_safe_candidate && RULES.data.no_safe_candidate.message;
    B = `<div class="rp-card msg warn"><span class="rp-ct">${esc(rule || t('rp.b.noentry'))}</span><span class="rp-cs">${esc(t('rp.b.nosafe.n', { site, date: dShort(msOf(M.jd)) }))}</span></div>`;
  } else {
    const wait = M.opts.find((o) => o.type === 'wait'), moves = M.opts.filter((o) => o.type === 'move'), date = dShort(msOf(M.jd));
    const mv = M.sel && M.sel.type === 'move' ? M.sel : moves[0];
    const W = wait ? cardHtml(wait, M) : `<div class="rp-card msg"><span class="rp-ck"><span>${esc(t('rp.b.wait.k'))}</span></span><span class="rp-cs">${esc(t('rp.b.nowait', { site }))}</span></div>`;
    const Mv = mv ? cardHtml(mv, M) : `<div class="rp-card msg"><span class="rp-ck"><span>${esc(t('rp.b.move.k'))}</span></span><span class="rp-cs">${esc(t('rp.b.nomove', { date }))}</span></div>`;
    B = (wait && mv && mv.rank < wait.rank ? Mv + W : W + Mv);
  }
  return `<div class="rp-answer" aria-live="polite"><h2 class="rp-k">${esc(t('rp.pb.h'))} <span>· ${esc(t('rp.pb.assumed'))}</span></h2>${B}</div>`;
}

function framesHtml(M) {
  const f = M.frames;
  const tag = (cls, a, b) => `<p class="rp-tag ${cls}"><b>${esc(a)}</b><span>${esc(b)}</span></p>`;
  const A = `<img class="rp-img a" src="${esc(f.orig.url)}" alt="" decoding="async">`;
  if (!M.delay || !f.del) return `<div class="rp-wipe one">${A}${tag('o one', t('rp.f.orig', { date: dShort(msOf(M.j0)) }), t('rp.f.h', { h: f.orig.h }))}</div>`;
  const x = Math.round(wipeX);
  return `<div class="rp-wipe" id="rp-wipe" style="--x:${x}%">${A}<img class="rp-img b" src="${esc(f.del.url)}" alt="" decoding="async">
      <div class="rp-wl"><button type="button" class="rp-wh" id="rp-wh" role="slider" data-fid="wipe" aria-label="${esc(t('rp.f.wipe'))}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${x}"><svg viewBox="0 0 20 12" aria-hidden="true"><path d="M7 1L2 6l5 5M13 1l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
      ${tag('o', t('rp.f.orig', { date: dShort(msOf(M.j0)) }), t('rp.f.h', { h: f.orig.h }))}${tag('d', t('rp.f.del', { date: dShort(msOf(M.jd)) }), t('rp.f.h', { h: f.del.h }))}</div>`;
}

function metaLine(M) {
  const z = (j) => isoOf(j).replace('T', ' '), mm = (c) => (c && c.k !== 'nc' ? ' ' + fmtM(c.m) + (c.k === 'fail' ? ' ' + c.causes.join('+').toUpperCase() : '') : ' NOT COMPUTED');
  const parts = [`${short(M.id)} · ORIGINAL ${z(M.j0)}${mm(M.c0)}`];
  if (M.delay) parts.push(`DELAY +${M.delay} D` + (M.jd === null ? ' PAST DATA' : ` → ${z(M.jd)}${mm(M.cd)}`));
  if (M.delay) parts.push(M.sel ? `PLAN B ${M.sel.type === 'wait' ? 'WAIT' : 'MOVE'} ${short(M.sel.id)} ${isoOf(M.sel.j).slice(0, 10)} ${fmtM(M.sel.margin)}` : 'PLAN B NONE');
  parts.push(`${Math.round(HM.data.duration_h / 24)} D MISSION`, M.view === 'frames' ? 'PATH-TRACED FRAMES, NOT PHOTOGRAPHS' : 'COMPUTED', `${String(HM.data.criteria_status || 'assumed').toUpperCase()} CRITERIA`);
  return parts.join(' · ');
}

/* ---------------- below the fold: the numbers and the sources ---------------- */
function fmtVal(metric, v) {
  if (v === null || v === undefined) return '–';
  if (/_h$/.test(metric)) return `${Math.round(v * 10) / 10} h`;
  if (metric === 'approach') return Number(v).toFixed(2);
  return `${Math.round(v * 1000) / 10}%`;
}
function detailHtml(M) {
  const d = HM.data, cols = [{ k: 'orig', lab: t('rp.d.orig'), s: M.si, j: M.j0, c: M.c0 }];
  if (M.delay && M.jd !== null) cols.push({ k: 'del', lab: t('rp.d.del', { n: M.delay }), s: M.si, j: M.jd, c: M.cd });
  if (M.delay && M.sel) cols.push({ k: 'pb', lab: t('rp.d.pb'), s: M.sel.si, j: M.sel.j, c: cell(M.sel.si, M.sel.j) });
  const val = (metric, s, j) => (cell(s, j).k === 'nc' ? null : metric === 'approach' ? d.approach[s][j] : d.metrics[metric] ? d.metrics[metric][s][j] : null);
  const rows = Object.entries(d.criteria || {}).map(([key, c]) => ({ metric: c.metric, kind: c.kind, limit: c.limit, source: c.source, group: CAUSES.find((g) => key.startsWith(g)) || 'other' }));
  if (d.metrics && d.metrics.first_sunset_h) rows.push({ metric: 'first_sunset_h', kind: null });
  const head = cols.map((c) => `<th scope="col" class="${c.k}"><span class="lab">${esc(c.lab)}</span><b>${esc(short(d.site_ids[c.s]))} · ${esc(dShort(msOf(c.j)))}</b>${chips(c.c, false)}</th>`).join('');
  const body = rows.map((r) => {
    const lim = r.kind ? `${r.kind === 'min' ? '≥' : '≤'} ${fmtVal(r.metric, r.limit)}` : t('rp.d.nocrit');
    const tds = cols.map((c) => {
      const v = val(r.metric, c.s, c.j);
      let mark = '';
      if (v !== null && v !== undefined && r.kind) {
        const ok = r.kind === 'min' ? v >= r.limit : v <= r.limit;
        mark = ok ? `<i class="mk ok" title="${esc(t('rp.d.met'))}">✓<span class="sr"> ${esc(t('rp.d.met'))}</span></i>` : `<i class="mk ${r.group}" title="${esc(t('rp.d.miss'))}">✕<span class="sr"> ${esc(t('rp.d.miss'))}</span></i>`;
      }
      return `<td class="num">${esc(fmtVal(r.metric, v))}${mark}</td>`;
    }).join('');
    return `<tr><th scope="row">${esc(t('rp.m.' + r.metric))}</th><td class="lim num"${r.source ? ` title="${esc(r.source)}"` : ''}>${esc(lim)}</td>${tds}</tr>`;
  }).join('');
  const margins = cols.map((c) => { const x = cell(c.s, c.j); return `<td class="num big">${x.k === 'nc' ? esc(t('rp.nc')) : fmtM(x.m)}</td>`; }).join('');
  return `<section class="rp-detail" aria-labelledby="rp-d-h">
      <h2 id="rp-d-h">${esc(t('rp.d.h'))} <span class="rp-assumed">${esc(t('rp.pb.assumed'))}</span></h2>
      <p class="rp-d-note">${esc(t('rp.d.note', { h: Math.round(d.duration_h) }))}</p>
      <div class="rp-tablewrap"><table class="rp-table">
        <thead><tr><th scope="col">${esc(t('rp.d.metric'))}</th><th scope="col">${esc(t('rp.d.crit'))}</th>${head}</tr></thead>
        <tbody><tr class="tot"><th scope="row">${esc(t('rp.d.margin'))}</th><td class="lim num">≥ 0</td>${margins}</tr>${body}</tbody>
      </table></div>
    </section>`;
}
function othersHtml(M) {
  if (!M.delay || !M.entry || M.jd === null) return '';
  const moves = M.opts.filter((o) => o.type === 'move');
  if (moves.length < 2) return '';
  return `<section class="rp-others" aria-labelledby="rp-o-h"><h2 id="rp-o-h">${esc(t('rp.b.others', { date: dLong(msOf(M.jd)) }))}</h2><ol>${moves.map((o) =>
    `<li><button type="button" data-act="plan" data-key="${esc(o.key)}" data-fid="o-${esc(o.key)}" aria-pressed="${M.sel === o}"><span class="nm">${esc(fullName(o.si))}</span><span class="km num">${Math.round(o.km)} km</span><span class="pm-chip ok">${esc(t('rp.pass'))} ${fmtM(o.margin)}</span><span class="rk num">${o.review ? esc(t('rp.b.review')) : esc(t('rp.b.rank', { n: o.rank }))}</span></button></li>`).join('')}</ol></section>`;
}
function sourcesHtml() {
  const d = HM.data, n = NV(), nc = d.overall_margin[0].filter((m) => m === null).length, list = delaySteps().filter(Boolean).join(', ');
  const crit = Object.values(d.criteria || {}).map((c) => `<li><b>${esc(t('rp.m.' + c.metric))} ${c.kind === 'min' ? '≥' : '≤'} ${esc(fmtVal(c.metric, c.limit))}</b> ${esc(c.source || '')}</li>`).join('');
  const rm = (RN && RN.meta) || null, any = RN && RN.data ? Object.values(RN.data)[0] : null;
  const rows = [
    ['verd', esc(t('rp.src.verd.v', { s: d.site_ids.length, n, a: dLong(msOf(0)), b: dLong(msOf(n - 1)), h: Math.round(d.duration_h), k: nc }))],
    ['crit', `${esc(t('rp.src.crit.v', { status: d.criteria_status || 'assumed' }))}<ul class="rp-crit">${crit}</ul>`],
    ['pb', esc(t('rp.src.pb.v', { list, ranking: (PB.meta && PB.meta.ranking) || '' }))],
    rm && any ? ['frames', esc(t('rp.src.frames.v', { date: dLong(Date.parse(String(any.landing_utc).slice(0, 16) + 'Z')), kind: rm.kind || '', method: rm.method || '', limits: rm.limits || '' }))] : null,
    HM.meta.terrain ? ['terrain', esc([HM.meta.terrain.source, ...(HM.meta.terrain.files || [])].join(' · '))] : null,
    HM.meta.ephemeris ? ['eph', esc([HM.meta.ephemeris.source, HM.meta.ephemeris.observer].filter(Boolean).join(' · '))] : null,
    HM.meta.calc_si_usage && HM.meta.calc_si_usage.scope ? ['si', esc(HM.meta.calc_si_usage.scope)] : null,
  ].filter(Boolean);
  return `<section class="sources" aria-labelledby="rp-src-h"><h2 id="rp-src-h">${esc(t('rp.src'))}</h2><dl>${rows.map(([k, v]) => `<dt>${esc(t('rp.src.' + k))}</dt><dd>${v}</dd>`).join('')}</dl></section>`;
}

/* ---------------- the page ---------------- */
function draw() {
  if (!root) return;
  const M = model(), d = HM.data, n = NV();
  const fid = document.activeElement && root.contains(document.activeElement) ? document.activeElement.dataset.fid : null;
  const i0 = M.steps.indexOf(M.delay);
  const ticks = [];
  for (let y = new Date(msOf(0)).getUTCFullYear(); y <= new Date(msOf(n - 1)).getUTCFullYear(); y++) for (const m of [0, 3, 6, 9]) {
    const j = (Date.UTC(y, m, 1, 12) - msOf(0)) / DAY;
    if (j > 10 && j < n - 10) ticks.push(`<span class="${m ? '' : 'y'}" style="left:${(j / n * 100).toFixed(3)}%">${m ? (ko() ? `${m + 1}월` : MON[m]) : (ko() ? `${y}년` : String(y))}</span>`);
  }
  const pct = (j) => ((j + 0.5) / n * 100).toFixed(3) + '%';
  const frames = M.view === 'frames';
  const off = t('rp.view.off', { date: M.frames.landing ? dLong(M.frames.landing) : '–', max: M.frames.max ?? '–' });
  const legendStrip = `<span class="rp-mklg"><i class="o"></i>${esc(t('rp.lg.orig'))}${M.delay && M.jd !== null ? `<i class="d"></i>${esc(t('rp.tag.del', { n: M.delay }))}` : ''}${M.delay && M.sel && M.sel.type === 'wait' && M.sel.wait > 0 ? `<i class="b"></i>${esc(t('rp.lg.pb'))}` : ''}</span>`;
  root.innerHTML = `
    <section class="s3 photo rp${frames ? ' is-frames' : ''}${enter ? ' enter' : ''}" aria-label="${esc(t('rp.h1'))}">
      ${frames ? framesHtml(M) : ''}
      <div class="rp-lay">
        <div class="rp-left">
          <div class="s3-caption rp-caption">${crumb(M)}<h1>${esc(t('rp.h1'))}</h1><p class="s3-lead">${esc(t('rp.lead'))}</p><p class="s3-sub">${esc(sentence(M))}</p></div>
          ${frames ? '' : `<div class="rp-hero">${windowHtml(M)}</div>${legendHtml(M)}`}
        </div>
        <div class="rp-right">
          <div class="s3-pick rp-pick">
            <select id="rp-site" data-fid="site" aria-label="${esc(t('rp.site'))}">${d.site_ids.map((id, s) => `<option value="${esc(id)}"${s === M.si ? ' selected' : ''}>${esc(fullName(s))}</option>`).join('')}</select>
            <label class="s3-dt"><span class="sr">${esc(t('rp.date'))}</span><input type="date" id="rp-date" data-fid="date" min="${isoOf(0).slice(0, 10)}" max="${isoOf(n - 1).slice(0, 10)}" value="${isoOf(M.j0).slice(0, 10)}"><span>${esc(t('rp.noon'))}</span></label>
          </div>
          ${verdictHtml(M)}
          ${answerHtml(M)}
        </div>
      </div>
      <p class="s3-meta" id="rp-meta">${esc(metaLine(M))}</p>
    </section>
    <section class="s3-bar rp-bar">
      <button type="button" class="s3-map rp-back" data-act="back" data-fid="back">← ${esc(t('rp.back'))}</button>
      <div class="rp-step" role="group" aria-label="${esc(t('rp.delay'))}">
        <span class="rp-step-k">${esc(t('rp.delay'))}</span>
        <span class="rp-step-c"><button type="button" data-act="delay" data-d="-1" data-fid="d-1" aria-label="${esc(t('rp.less'))}"${i0 <= 0 ? ' disabled' : ''}>−</button><output class="num" aria-live="polite">${M.delay} ${esc(unit(M.delay))}</output><button type="button" data-act="delay" data-d="1" data-fid="d1" aria-label="${esc(t('rp.more'))}"${i0 >= M.steps.length - 1 ? ' disabled' : ''}>+</button></span>
      </div>
      <div class="rp-stripbox">
        <p class="rp-strip-labs"><b>${esc(t('rp.strip'))}</b><span>${esc(t('rp.strip.range', { a: dLong(msOf(0)), b: dLong(msOf(n - 1)) }))}</span>${legendStrip}</p>
        <div class="rp-strip" id="rp-strip-wrap" tabindex="0" data-fid="strip" role="group" aria-label="${esc(t('rp.strip.aria', { n }))}">
          <canvas id="rp-strip"></canvas>
          <i class="rp-rowmk" style="top:${((M.si + 0.5) / d.site_ids.length * 100).toFixed(2)}%"></i>
          <i class="rp-mk o" style="left:${pct(M.j0)}"></i>
          ${M.delay && M.jd !== null ? `<i class="rp-mk d" style="left:${pct(M.jd)}"></i>` : ''}
          ${M.delay && M.sel && M.sel.type === 'wait' && M.sel.wait > 0 ? `<i class="rp-mk b" style="left:${pct(M.sel.j)}"></i>` : ''}
          <span class="pm-ticks rp-ticks">${ticks.join('')}</span>
          <span class="rp-tip" id="rp-tip" hidden></span>
        </div>
      </div>
      <div class="s3-views rp-views" role="group">
        <button type="button" data-act="view" data-v="grid" data-fid="v-grid" aria-pressed="${!frames}">${esc(t('rp.view.grid'))}</button>
        <button type="button" data-act="view" data-v="frames" data-fid="v-frames" aria-pressed="${frames}"${M.canFrames ? '' : ` disabled title="${esc(off)}"`}>${esc(t('rp.view.frames'))}</button>
      </div>
      <button type="button" class="s3-land" data-act="next" data-fid="next">${esc(t('rp.next'))} →</button>
    </section>
    <p class="s3-credit">${esc(t('rp.credit'))}</p>
    <div class="rp-below">
      ${frames ? `<section class="rp-below-win"><h2>${esc(t('rp.below.win', { date: dLong(msOf(M.j0)) }))}</h2>${windowHtml(M)}${legendHtml(M)}</section>` : ''}
      ${detailHtml(M)}
      ${othersHtml(M)}
    </div>
    ${sourcesHtml()}`;
  enter = false;
  root._model = M;
  wireStrip(M);
  wireWipe();
  if (fid) { const el = root.querySelector(`[data-fid="${CSS.escape(fid)}"]`); if (el && !el.disabled) el.focus({ preventScroll: true }); }
  requestAnimationFrame(drawStrip);
}

function drawStrip() {
  const cv = root && root.querySelector('#rp-strip'); if (!cv) return;
  const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
  if (!W || !H) return;
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), n = NV(), rows = HM.data.site_ids.length, gap = Math.max(1, Math.round(dpr));
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  for (let s = 0; s < rows; s++) {
    const y = Math.round(s * H / rows), hh = Math.max(1, Math.round((s + 1) * H / rows) - y - gap);
    let nc0 = -1;
    for (let j = 0; j < n; j++) {
      const c = cell(s, j), x = Math.floor(j / n * W), w = Math.max(1, Math.floor((j + 1) / n * W) - x);
      if (c.k === 'nc') { if (nc0 < 0) nc0 = x; g.fillStyle = '#1b2127'; }
      else g.fillStyle = c.k === 'ok' ? passHex(c.m) : CAUSE_HEX[c.causes[0]] || CAUSE_HEX.other;
      g.fillRect(x, y, w, hh);
    }
    if (nc0 >= 0) {   // not computed: hatch, never a failure colour
      g.save(); g.beginPath(); g.rect(nc0, y, W - nc0, hh); g.clip();
      g.strokeStyle = '#6b747d'; g.lineWidth = Math.max(1, dpr * 0.75);
      for (let x = nc0 - hh; x < W + hh; x += 3 * dpr) { g.beginPath(); g.moveTo(x, y + hh); g.lineTo(x + hh, y); g.stroke(); }
      g.restore();
    }
  }
}

function wireStrip(M) {
  const strip = root.querySelector('#rp-strip-wrap'), tip = root.querySelector('#rp-tip'), d = HM.data, n = NV(), rows = d.site_ids.length;
  const hit = (ev) => { const r = strip.getBoundingClientRect(); return { s: Math.max(0, Math.min(rows - 1, Math.floor((ev.clientY - r.top) / r.height * rows))), j: Math.max(0, Math.min(n - 1, Math.floor((ev.clientX - r.left) / r.width * n))), x: ev.clientX - r.left, w: r.width }; };
  strip.addEventListener('pointermove', (ev) => {
    const p = hit(ev), c = cell(p.s, p.j);
    tip.textContent = `${short(d.site_ids[p.s])} · ${dLong(msOf(p.j))} · ${c.k === 'ok' ? `${t('rp.pass')} ${fmtM(c.m)}` : c.k === 'fail' ? `${causeNames(c.causes)} ${fmtM(c.m)}` : t('rp.nc')}`;
    tip.hidden = false; tip.style.left = Math.max(110, Math.min(p.w - 110, p.x)) + 'px';
  });
  strip.addEventListener('pointerleave', () => { tip.hidden = true; });
  strip.addEventListener('click', (ev) => { const p = hit(ev); pick(p.s, p.j); });
  strip.addEventListener('keydown', (ev) => {
    const mv = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[ev.key];
    if (!mv) return;
    ev.preventDefault();
    pick(Math.max(0, Math.min(rows - 1, M.si + mv[0])), Math.max(0, Math.min(n - 1, M.j0 + mv[1] * (ev.shiftKey ? 7 : 1))));
  });
}

function wireWipe() {   // drag anywhere on the frames (or arrow keys on the handle) to move the divider
  const w = root.querySelector('#rp-wipe'), h = root.querySelector('#rp-wh');
  if (!w || !h) return;
  const setX = (x) => { wipeX = Math.max(4, Math.min(96, x)); w.style.setProperty('--x', wipeX.toFixed(2) + '%'); h.setAttribute('aria-valuenow', String(Math.round(wipeX))); };
  const at = (ev) => { const r = w.getBoundingClientRect(); setX((ev.clientX - r.left) / r.width * 100); };
  let drag = false;
  w.addEventListener('pointerdown', (ev) => { if (ev.button !== 0) return; drag = true; w.setPointerCapture(ev.pointerId); at(ev); });
  w.addEventListener('pointermove', (ev) => { if (drag) at(ev); });
  const stop = () => { drag = false; };
  w.addEventListener('pointerup', stop); w.addEventListener('pointercancel', stop);
  h.addEventListener('keydown', (ev) => {
    const k = { ArrowLeft: -5, ArrowRight: 5, Home: -100, End: 100 }[ev.key];
    if (k === undefined) return;
    ev.preventDefault(); setX(wipeX + k);
  });
}

function pick(s, j) { ctx.set({ site: HM.data.site_ids[s], time: isoOf(j), planb: null }); }

function onClick(ev) {
  const b = ev.target.closest('[data-act]');
  if (!b || !root || !root.contains(b) || b.disabled) return;
  const M = root._model, act = b.dataset.act;
  if (act === 'delay') {
    const i = M.steps.indexOf(M.delay) + Number(b.dataset.d);
    if (i >= 0 && i < M.steps.length) ctx.set({ delay: M.steps[i], planb: null });
  } else if (act === 'setdelay') ctx.set({ delay: Number(b.dataset.n), planb: null });
  else if (act === 'cell') pick(Number(b.dataset.s), Number(b.dataset.j));
  else if (act === 'row') ctx.set({ site: HM.data.site_ids[Number(b.dataset.s)], planb: null });
  else if (act === 'shift') pick(M.si, Math.max(0, Math.min(NV() - 1, M.j0 + Number(b.dataset.d))));
  else if (act === 'plan') ctx.set({ planb: b.dataset.key });
  else if (act === 'view') { userView = b.dataset.v; draw(); }
  else if (act === 'back') ctx.set({ step: 'sky' });
  else if (act === 'next') {
    const st = ctx.state, patch = { step: 'ghosts', planb: M.delay && M.sel ? M.sel.key : null };
    if (!st.site) patch.site = M.id;
    if (!st.time) patch.time = isoOf(M.j0);
    if (st.delay === null || st.delay === undefined || !Number.isFinite(st.delay)) patch.delay = M.delay;
    ctx.set(patch);
  }
}
function onChange(ev) {
  if (ev.target.id === 'rp-site') ctx.set({ site: ev.target.value, planb: null });
  else if (ev.target.id === 'rp-date' && ev.target.value) { const j = jOf(ev.target.value); if (j !== null) ctx.set({ time: isoOf(j), planb: null }); }
}

export default {
  id: 'replan',
  num: '②',
  label: 'Replan',
  ownTitle: true,

  async render(el, c) {
    const [heat, planb, rules, renders] = await Promise.all([
      c.use('outputs/heatmap.json'), c.use('outputs/planb_candidates.json'), c.use('outputs/planb_rules.json'), c.use('renders/index.json'),
    ]);
    const lacking = [!heat && 'outputs/heatmap.json', !planb && 'outputs/planb_candidates.json'].filter(Boolean);
    if (lacking.length) { root = null; return c.missing(lacking); }
    ctx = c; HM = heat; PB = planb; RULES = rules; RN = renders;
    pbIndex = buildIndex(Array.isArray(planb.data) ? planb.data : []);
    root = el;
    el.classList.add('rp-root');
    el.addEventListener('click', onClick);
    el.addEventListener('change', onChange);
    enter = true;
    draw();
  },

  mounted() {
    document.body.classList.add('immersive');
    if (!root) return;
    onResize = () => { clearTimeout(rsTimer); rsTimer = setTimeout(drawStrip, 80); };
    window.addEventListener('resize', onResize);
    drawStrip();
  },

  update() { draw(); },

  unmount() {
    document.body.classList.remove('immersive');
    if (onResize) window.removeEventListener('resize', onResize);
    clearTimeout(rsTimer);
    onResize = null; root = null;
  },
};
