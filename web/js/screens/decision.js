// ⑤ Decision — one card a mission planner can act on: "this is the plan, and this is the evidence".
// The screen computes nothing. It looks the chosen plan up in the output files, formats it and draws it.
// Layout (the look of screen 01 with the team's design tokens): a true-black stage with the words on the black, ONE light
// card for the answer, a burned-in data line, a dark bar under it (candidates as the wide middle strip, lime Print on the
// right), and the reasons, the compared candidates, the evidence and the sources below the fold in the quiet .sources style.
//
// Which plan is shown (shared state: site + time = ORIGINAL landing, delay = days, planb):
//   delay 0 or missing      → the original plan itself (the heatmap cell of site / time)
//   delay 1, 3 or 7         → the entry of planb_candidates.json (from_site, from_date, delay_days), then
//     state.planb = `wait:<YYYY-MM-DD>`  wait at the same site until that date (the entry's same_site_later_date;
//                                        when the delayed date itself still passes this is "original plan holds")
//     state.planb = `move:<siteId>`      move to that site on the delayed date (one of same_date_other_sites)
//     planb empty or not in the entry   → the entry's rank-1 candidate (the same default as 02 Replan)
//     (a bare site id such as `mp1` is read as `move:mp1`)
//   other delays            → no Plan B entry exists; the card shows the original site on the delayed date as it is in the heatmap
//   empty hash              → site im2, time 2026-11-17T12:00Z, delay 7
//
// Files: outputs/heatmap.json (verdict, margin, metrics, criteria) · outputs/planb_candidates.json · outputs/planb_rules.json
//        outputs/nhf_check.json + outputs/ghost_landers.json (success probability, im2 only) · outputs/validation.json
//        project_meta.json (terrain, ephemeris) · renders/index.json (which computed frames exist)

import { h } from '../dom.js';
import { t, addStrings, getLang } from '../i18n.js';

const DEF = { site: 'im2', time: '2026-11-17T12:00Z', delay: 7 };
const DAY = 864e5, HOUR = 36e5;
const NHF_SITE = 'im2';   // nhf_check.json has no site field: its note and the README say every row is im2
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const Z = (s) => Date.parse(String(s).slice(0, 16) + 'Z');   // output times are UTC without the trailing Z

addStrings({
  en: {
    'dc.h1': 'A clear plan. With the evidence.',
    'dc.orig': 'Original', 'dc.alt': 'Alternative', 'dc.holds': 'Holds',
    'dc.delay': 'Delay +{n} days', 'dc.delay1': 'Delay +1 day', 'dc.nodelay': 'No delay', 'dc.noalt': 'No safe alternative',
    'dc.lead.wait': 'Wait at {site} until {date}.', 'dc.lead.move': 'Move to {site} on {date}.', 'dc.lead.hold': '{site} still passes on {date}.',
    'dc.lead.ok': '{site} passes on {date}.', 'dc.lead.fail': '{site} does not pass on {date}.', 'dc.lead.nc': '{site} on {date} is not computed.',
    'dc.lead.none': 'No safe alternative for {site} after a {n}-day delay.',
    'dc.sub': '{name} · {pos} · landing 12:00 UTC. The criteria are assumed values.',
    'dc.tag.selected': 'Selected alternative', 'dc.tag.recommended': 'Recommended alternative', 'dc.tag.holds': 'Original plan holds',
    'dc.tag.none': 'No safe alternative', 'dc.tag.original': 'Original plan', 'dc.tag.origfail': 'Original plan does not pass',
    'dc.tag.delayfail': 'Delayed date does not pass', 'dc.tag.nc': 'Not computed',
    'dc.when.move': 'Move on the delayed date', 'dc.when.wait': 'Wait {n} more days at the original site', 'dc.when.wait1': 'Wait 1 more day at the original site',
    'dc.when.hold': 'Land at the original site on the delayed date', 'dc.when.original': 'Original plan, no delay',
    'dc.when.none': 'The delayed date fails here and no candidate passes', 'dc.when.noentry': 'Original site on the delayed date',
    'dc.chip.met': 'Criteria met', 'dc.chip.nc': 'Not computed', 'dc.chip.fails': 'Fails: {cause}',
    'dc.chip.conf': 'Confidence evaluated', 'dc.chip.noconf': 'Confidence not evaluated',
    'dc.chip.valid': 'Validated against NASA PGDA', 'dc.chip.novalid': 'Validation file not found',
    'dc.c.power': 'Power', 'dc.c.comm': 'Comm', 'dc.c.approach': 'Approach', 'dc.c.other': 'Other',
    'dc.distance': 'Distance:', 'dc.waitlab': 'Wait:', 'dc.days': '{n} days', 'dc.day1': '1 day', 'dc.km': '{n} km',
    'dc.cond': 'Mission conditions', 'dc.margin': 'Margin', 'dc.duration': 'Duration', 'dc.assumed': 'Assumed criteria',
    'dc.margin.tip': 'Overall margin from heatmap.json. 0 or more means every criterion passes.',
    'dc.col.metric': 'Metric', 'dc.col.crit': 'Assumed criterion', 'dc.col.value': 'Value', 'dc.col.mark': 'Result',
    'dc.m.sun_mean': 'Sun mean', 'dc.m.longest_dark_h': 'Longest dark', 'dc.m.first_sunset_h': 'First sunset',
    'dc.m.comm_frac': 'Comm fraction', 'dc.m.longest_comm_gap_h': 'Longest comm gap', 'dc.m.approach': 'Approach lighting',
    'dc.nocrit': 'no criterion', 'dc.nosunset': 'None', 'dc.h': '{n} h', 'dc.pass': 'Pass', 'dc.fail': 'Fail', 'dc.info': 'For information',
    'dc.cond.nc': 'Not computed: the mission would run past the end of the data (31 Dec 2028). This is not a failure.',
    'dc.succ': 'Estimated success', 'dc.ci': '95% interval', 'dc.trials': '{k} / {n} trials', 'dc.trials.n': '{n} trials',
    'dc.outside': '{p} outside computed grid',
    'dc.succ.none': 'Confidence not evaluated for this site and date',
    'dc.succ.none2': 'The landing-scatter test was run for IM-2 only, on the {n} dates where it passes.',
    'dc.strip': 'Verdict by landing date', 'dc.strip.more': 'brighter = more margin',
    'dc.mk.orig': 'Original', 'dc.mk.delayed': 'Delayed', 'dc.mk.plan': 'Plan',
    'dc.bar': 'Candidates and actions', 'dc.cands': 'Compared candidates, by rank', 'dc.cands.pick': 'pick one to see its card',
    'dc.cands.original': 'No delay is set, so there is nothing to compare. Set a delay on 02 Replan.',
    'dc.cands.none': 'No candidate passes the assumed criteria.',
    'dc.cands.noentry': 'Plan B candidates exist for delays of {list} days only.',
    'dc.cand.wait': 'Wait {n} d', 'dc.cand.move': 'Move {n} km', 'dc.cand.hold': 'Original site',
    'dc.back': '← Evidence', 'dc.change': 'Change Plan B', 'dc.print': 'Print / save as PDF',
    'dc.credit.frame': 'Behind the card: {site} at {date} 12:00 UTC, a computed frame (path traced on NASA LOLA terrain), not a photograph.',
    'dc.credit.none': 'No computed frame exists for this site and date, so the stage stays black. Nothing here is a photograph.',
    'dc.src': 'Reasons, evidence and sources',
    'dc.why': 'Why this plan', 'dc.rank': 'Rank {r} of {n}.', 'dc.rule': 'Ranking rule',
    'dc.why.best': 'This candidate was selected because it passed the required safety checks and ranked best according to safety margin, waiting time, and distance.',
    'dc.why.other': 'This candidate passed the required checks and ranks {r} of {n}. Rank 1 is: {best}.',
    'dc.why.hold': 'The original site still passes on the delayed date, so no Plan B is needed. Among the compared options it ranks {r} of {n} by margin.',
    'dc.why.default': 'No Plan B was picked on 02 Replan, so the card shows the rank-1 candidate.',
    'dc.why.original': 'No delay is set. This is the original plan, read from the heatmap cell for this site and date.',
    'dc.why.none': 'No later date at this site and no other site on the delayed date passes the assumed criteria.',
    'dc.why.noentry': 'Plan B candidates were computed for delays of {list} days. For +{n} days the card shows the original site on the delayed date.',
    'dc.p.safety': 'Safety', 'dc.p.safety_margin': 'Margin', 'dc.p.waiting_time': 'Waiting time', 'dc.p.distance': 'Distance',
    'dc.d.must_pass': 'must pass', 'dc.d.higher_is_better': 'higher first', 'dc.d.lower_is_better': 'shorter first',
    'dc.compared': 'Compared',
    'dc.o.hold': 'Stay at {site} on {date}', 'dc.o.wait': 'Wait at {site} until {date}', 'dc.o.move': 'Move to {site} on {date}',
    'dc.o.hold.sub': 'original site, delayed date', 'dc.o.wait.sub': '{n} more days', 'dc.o.wait.sub1': '1 more day', 'dc.o.move.sub': '{n} km away',
    'dc.o.margin': 'margin {m}', 'dc.o.review': 'needs engineering review', 'dc.o.shown': 'shown on the card',
    'dc.conf': 'Success estimate',
    'dc.conf.v': 'Share of {n} simulated landers that still meet the assumed criteria when the landing point scatters around the target. Source: {f}.',
    'dc.conf.sigma': 'Landing scatter {s} m (1σ).',
    'dc.evid.sun': 'Validation, Sun', 'dc.evid.earth': 'Validation, Earth',
    'dc.evid.line': 'RMSE {rmse} percentage points · Pearson r = {r} · n = {n} points, against {ref}.',
    'dc.evid.none': 'validation.json was not found.',
    'dc.evid.terrain': 'Terrain', 'dc.evid.eph': 'Sun and Earth', 'dc.evid.crit': 'Criteria',
    'dc.evid.crit.v': 'Status: {s}. Demo thresholds, not NASA requirements. A {d} mission from the landing time.',
    'dc.evid.frame': 'Imagery', 'dc.evid.si': 'SI use',
    'dc.frame.lab': 'Behind the card: a computed frame of {site}, {date} 12:00 UTC. Not a photograph.',
  },
  ko: {
    'dc.h1': '분명한 계획. 근거와 함께.',
    'dc.orig': '원래 계획', 'dc.alt': '대안', 'dc.holds': '유지',
    'dc.delay': '지연 +{n}일', 'dc.delay1': '지연 +1일', 'dc.nodelay': '지연 없음', 'dc.noalt': '안전한 대안 없음',
    'dc.lead.wait': '{date}까지 {site}에서 기다려요.', 'dc.lead.move': '밀린 날짜 {date}에 {site}에 내려요.', 'dc.lead.hold': '{date}에도 {site}에서 기준을 통과해요.',
    'dc.lead.ok': '{date}, {site}에서 기준을 통과해요.', 'dc.lead.fail': '{date}, {site}에서 기준을 못 지켜요.', 'dc.lead.nc': '{date}, {site}: 계산하지 않았어요.',
    'dc.lead.none': '{n}일 밀리면 {site}에서 안전한 대안이 없어요.',
    'dc.sub': '{name} · {pos} · 착륙 12:00 UTC. 기준은 가정값이에요.',
    'dc.tag.selected': '고른 대안', 'dc.tag.recommended': '추천 대안', 'dc.tag.holds': '원래 계획 유지',
    'dc.tag.none': '안전한 대안 없음', 'dc.tag.original': '원래 계획', 'dc.tag.origfail': '원래 계획이 기준을 못 지켜요',
    'dc.tag.delayfail': '밀린 날짜가 기준을 못 지켜요', 'dc.tag.nc': '계산 안 됨',
    'dc.when.move': '밀린 날짜에 다른 곳으로 옮겨요', 'dc.when.wait': '원래 착륙지에서 {n}일 더 기다려요', 'dc.when.wait1': '원래 착륙지에서 1일 더 기다려요',
    'dc.when.hold': '밀린 날짜에 원래 착륙지에 내려요', 'dc.when.original': '원래 계획, 지연 없음',
    'dc.when.none': '밀린 날짜에 여기는 실패하고, 통과하는 후보가 없어요', 'dc.when.noentry': '밀린 날짜의 원래 착륙지',
    'dc.chip.met': '기준 통과', 'dc.chip.nc': '계산 안 됨', 'dc.chip.fails': '실패: {cause}',
    'dc.chip.conf': '신뢰도 평가함', 'dc.chip.noconf': '신뢰도 평가 안 함',
    'dc.chip.valid': 'NASA PGDA로 검증', 'dc.chip.novalid': '검증 파일 없음',
    'dc.c.power': '전력', 'dc.c.comm': '교신', 'dc.c.approach': '접근로', 'dc.c.other': '기타',
    'dc.distance': '거리:', 'dc.waitlab': '대기:', 'dc.days': '{n}일', 'dc.day1': '1일', 'dc.km': '{n} km',
    'dc.cond': '임무 조건', 'dc.margin': '여유', 'dc.duration': '기간', 'dc.assumed': '가정한 기준',
    'dc.margin.tip': 'heatmap.json의 전체 여유예요. 0 이상이면 모든 기준을 통과해요.',
    'dc.col.metric': '항목', 'dc.col.crit': '가정한 기준', 'dc.col.value': '값', 'dc.col.mark': '결과',
    'dc.m.sun_mean': '평균 햇빛', 'dc.m.longest_dark_h': '가장 긴 어둠', 'dc.m.first_sunset_h': '첫 일몰',
    'dc.m.comm_frac': '교신 비율', 'dc.m.longest_comm_gap_h': '가장 긴 교신 공백', 'dc.m.approach': '접근로 조명',
    'dc.nocrit': '기준 없음', 'dc.nosunset': '없음', 'dc.h': '{n}시간', 'dc.pass': '통과', 'dc.fail': '실패', 'dc.info': '참고용',
    'dc.cond.nc': '계산하지 않았어요. 임무가 데이터 끝(2028년 12월 31일)을 넘어요. 실패가 아니에요.',
    'dc.succ': '예상 성공 확률', 'dc.ci': '95% 구간', 'dc.trials': '{n}번 중 {k}번', 'dc.trials.n': '{n}번 시행',
    'dc.outside': '계산 범위 밖 {p}',
    'dc.succ.none': '이 착륙지와 날짜는 신뢰도를 평가하지 않았어요',
    'dc.succ.none2': '착륙 오차 시험은 IM-2만, 통과하는 {n}개 날짜에 돌렸어요.',
    'dc.strip': '착륙 날짜별 판정', 'dc.strip.more': '밝을수록 여유가 커요',
    'dc.mk.orig': '원래', 'dc.mk.delayed': '지연', 'dc.mk.plan': '계획',
    'dc.bar': '후보와 버튼', 'dc.cands': '비교한 후보, 순위 순', 'dc.cands.pick': '누르면 그 카드로 바뀌어요',
    'dc.cands.original': '지연이 없어서 비교할 후보가 없어요. 02 재계획에서 지연을 넣어 보세요.',
    'dc.cands.none': '가정한 기준을 통과하는 후보가 없어요.',
    'dc.cands.noentry': 'Plan B 후보는 {list}일 지연에만 있어요.',
    'dc.cand.wait': '대기 {n}일', 'dc.cand.move': '이동 {n} km', 'dc.cand.hold': '원래 착륙지',
    'dc.back': '← 근거', 'dc.change': 'Plan B 바꾸기', 'dc.print': '인쇄 / PDF로 저장',
    'dc.credit.frame': '카드 뒤: {date} 12:00 UTC의 {site}. NASA LOLA 지형으로 계산한 장면이고 사진이 아니에요.',
    'dc.credit.none': '이 착륙지와 날짜는 계산한 장면이 없어서 배경을 검게 뒀어요. 이 화면에 사진은 없어요.',
    'dc.src': '이유, 근거, 출처',
    'dc.why': '이 계획인 이유', 'dc.rank': '{n}개 중 {r}순위.', 'dc.rule': '순위 규칙',
    'dc.why.best': '필수 안전 기준을 통과했고, 여유·대기 시간·거리 순으로 가장 높게 평가돼서 골랐어요.',
    'dc.why.other': '이 후보는 필수 기준을 통과했고 {n}개 중 {r}순위예요. 1순위: {best}.',
    'dc.why.hold': '밀린 날짜에도 원래 착륙지가 통과해서 Plan B가 필요 없어요. 비교한 선택지 중 여유 순으로 {n}개 중 {r}순위예요.',
    'dc.why.default': '02 재계획에서 Plan B를 고르지 않아서 1순위 후보를 보여 줘요.',
    'dc.why.original': '지연이 없어요. 이 착륙지와 날짜의 히트맵 칸을 그대로 읽은 원래 계획이에요.',
    'dc.why.none': '이 착륙지의 뒤 날짜도, 밀린 날짜의 다른 착륙지도 가정한 기준을 통과하지 못해요.',
    'dc.why.noentry': 'Plan B 후보는 {list}일 지연에 대해서만 계산했어요. +{n}일은 밀린 날짜의 원래 착륙지를 보여 줘요.',
    'dc.p.safety': '안전', 'dc.p.safety_margin': '여유', 'dc.p.waiting_time': '대기 시간', 'dc.p.distance': '거리',
    'dc.d.must_pass': '반드시 통과', 'dc.d.higher_is_better': '클수록 먼저', 'dc.d.lower_is_better': '짧을수록 먼저',
    'dc.compared': '비교한 후보',
    'dc.o.hold': '그대로: {site} · {date}', 'dc.o.wait': '대기: {site} · {date}까지', 'dc.o.move': '이동: {site} · {date}',
    'dc.o.hold.sub': '원래 착륙지, 밀린 날짜', 'dc.o.wait.sub': '{n}일 더', 'dc.o.wait.sub1': '1일 더', 'dc.o.move.sub': '{n} km 떨어짐',
    'dc.o.margin': '여유 {m}', 'dc.o.review': '엔지니어링 검토 필요', 'dc.o.shown': '카드에 표시',
    'dc.conf': '성공 확률 추정',
    'dc.conf.v': '착륙 지점이 목표 주변으로 흩어져도 가정한 기준을 지키는 모의 착륙선 {n}대의 비율이에요. 출처: {f}.',
    'dc.conf.sigma': '착륙 오차 {s} m (1σ).',
    'dc.evid.sun': '검증, 해', 'dc.evid.earth': '검증, 지구',
    'dc.evid.line': 'RMSE {rmse}%p · 피어슨 r = {r} · n = {n}개 지점. 비교 기준: {ref}.',
    'dc.evid.none': 'validation.json을 찾지 못했어요.',
    'dc.evid.terrain': '지형', 'dc.evid.eph': '해와 지구', 'dc.evid.crit': '기준',
    'dc.evid.crit.v': '상태: {s}. 데모용 기준값이고 NASA 요구 조건이 아니에요. 착륙 시각부터 {d} 임무 기준이에요.',
    'dc.evid.frame': '이미지', 'dc.evid.si': 'SI 사용',
    'dc.frame.lab': '카드 뒤: {date} 12:00 UTC의 {site}를 계산한 장면이에요. 사진이 아니에요.',
  },
});

let root = null, ctx = null, D = null, T = [], entered = false;
const entryIndex = new WeakMap();   // planb_candidates data array → Map("site|YYYY-MM-DD|delay" → entry)

/* ---------------- small formatters (format only, no judgement) ---------------- */
const ko = () => getLang() === 'ko';
function dateBig(ms) { const d = new Date(ms); return ko() ? `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일` : `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; }
function dateShort(ms) { const d = new Date(ms); return ko() ? `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일` : `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; }
const isoMin = (ms) => new Date(ms).toISOString().slice(0, 16) + 'Z';
const num = (v, dg = 0) => Number(v).toLocaleString('en-US', { minimumFractionDigits: dg, maximumFractionDigits: dg });
function fmtMargin(m) { const a = Math.abs(m), dg = a > 0 && a < 0.005 ? 3 : 2; return (m >= 0 ? '+' : '−') + a.toFixed(dg); }
function pct1(f) { const x = Math.round(f * 1000) / 10; return (Number.isInteger(x) ? String(x) : x.toFixed(1)) + '%'; }
// a share next to its limit: one decimal only when rounding would hide which side of the limit it is on
function pctNear(v, limit) { return (limit !== null && v !== limit && Math.abs(v - limit) < 0.005) ? (v * 100).toFixed(1) + '%' : Math.round(v * 100) + '%'; }
const days = (n) => (n === 1 ? t('dc.day1') : t('dc.days', { n: num(n) }));
const durText = () => days(Math.round(D.hm.data.duration_h / 24));
const ciText = (ci) => (Array.isArray(ci) ? `${pct1(ci[0]).replace('%', '')}–${pct1(ci[1])}` : '—');

function siteName(s) { const d = D.hm; return ko() ? d.data.site_names[s] : ((d.meta.sites && d.meta.sites[s] && d.meta.sites[s].name_en) || d.data.site_names[s]); }
// short label for the big title: the site code at the end of its English name (CR1, MP1 …), "IM-2", or the name itself
function siteShort(s) {
  const en = (D.hm.meta.sites && D.hm.meta.sites[s] && D.hm.meta.sites[s].name_en) || '';
  const code = en.match(/\b([A-Z]{2}\d)$/) || en.match(/^([A-Z]{2}-\d)\b/);
  return code ? code[1] : siteName(s);
}
function latlon(s) {
  const [lat, lon] = D.hm.data.site_latlon[s], la = Math.abs(lat).toFixed(2), lo = Math.abs(lon).toFixed(2);
  return ko() ? `${lat < 0 ? '남위' : '북위'} ${la}°, ${lon < 0 ? '서경' : '동경'} ${lo}°` : `${la}°${lat < 0 ? 'S' : 'N'}, ${lo}°${lon < 0 ? 'W' : 'E'}`;
}

const ICON = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  moon: '<path d="M20 14.6A8.2 8.2 0 1 1 9.4 4a6.6 6.6 0 0 0 10.6 10.6Z"/>',
  sunset: '<path d="M2.5 19h19M7 19a5 5 0 0 1 10 0M12 6v3.5M4.8 11.3l2.2 2.2M19.2 11.3 17 13.5"/>',
  comm: '<circle cx="12" cy="9.5" r="1.8"/><path d="M12 11.5V21M8.5 21h7M7.6 13.6a6 6 0 0 1 0-8.2M16.4 5.4a6 6 0 0 1 0 8.2"/>',
  gap: '<path d="M10.2 6.8l1.2-1.2a4.3 4.3 0 0 1 6.1 6.1l-1.2 1.2M13.8 17.2l-1.2 1.2a4.3 4.3 0 0 1-6.1-6.1l1.2-1.2M9.5 14.5l5-5"/>',
  approach: '<path d="M3 21h18M5 4l11 11M16.5 8.5V15H10"/>',
  check: '<path d="M5 12.6l4.6 4.6L19 7.6"/>',
  cross: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  arrow: '<path d="M4 12h15M13.5 6.5 19 12l-5.5 5.5"/>',
  warn: '<path d="M12 4 2.8 20h18.4L12 4ZM12 10v4.5M12 17.3v.2"/>',
};
function icon(name, cls = '') {
  const s = document.createElement('span');
  s.className = 'dc-ic ' + cls; s.setAttribute('aria-hidden', 'true');
  s.innerHTML = `<svg viewBox="0 0 24 24">${ICON[name]}</svg>`;
  return s;
}
function sv(tag, attrs = {}, ...kids) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v);
  el.append(...kids.flat().filter((k) => k !== null && k !== undefined && k !== false));
  return el;
}

/* ---------------- reading the shared state and the files ---------------- */
function norm(st) {
  const empty = st.site === null && st.time === null && st.delay === null;
  const dl = Number(st.delay);
  return {
    site: st.site || DEF.site,
    time: st.time || DEF.time,
    delay: empty ? DEF.delay : (Number.isFinite(dl) && dl > 0 ? Math.round(dl) : 0),
    planb: st.planb,
  };
}
function verdict(s, j) {
  const d = D.hm.data, nc = { k: 'nc', m: null, causes: [] };
  if (j < 0 || j >= T.length) return nc;
  const m = d.overall_margin[s][j], p = d.passed[s][j];
  if (m === null || m === undefined || p === null || p === undefined) return nc;
  return { k: p ? 'ok' : 'fail', m, causes: p ? [] : String(d.fail_causes[s][j] || '').split(',').filter(Boolean) };
}
function entryOf(siteId, ms, delay) {
  const list = D.planb && D.planb.data;
  if (!Array.isArray(list)) return null;
  let ix = entryIndex.get(list);
  if (!ix) { ix = new Map(); for (const e of list) ix.set(`${e.from_site}|${String(e.from_date).slice(0, 10)}|${e.delay_days}`, e); entryIndex.set(list, ix); }
  return ix.get(`${siteId}|${new Date(ms).toISOString().slice(0, 10)}|${delay}`) || null;
}
const jOfMs = (ms) => { const j = Math.round((ms - T[0]) / DAY); return j >= 0 && j < T.length && T[j] === ms ? j : -1; };

function resolve(st) {
  const d = D.hm.data, ids = d.site_ids;
  let s = ids.indexOf(st.site); if (s < 0) s = Math.max(0, ids.indexOf(DEF.site));
  let ms0 = Date.parse(st.time); if (!Number.isFinite(ms0)) ms0 = Date.parse(DEF.time);
  const j0 = Math.max(0, Math.min(T.length - 1, Math.round((ms0 - T[0]) / DAY)));   // the daily 12:00 UTC landing nearest to state.time
  const r = { s, j0, ms0: T[j0], delay: st.delay, cands: [], chosen: null, picked: false, entry: null };
  if (!st.delay) return Object.assign(r, { kind: 'original', cs: s, cj: j0, cms: T[j0] });

  r.msd = T[j0] + st.delay * DAY;
  const e = entryOf(ids[s], T[j0], st.delay);
  if (!e) return Object.assign(r, { kind: 'noentry', cs: s, cj: jOfMs(r.msd), cms: r.msd });
  r.entry = e; r.msd = Z(e.delayed_date);
  const w = e.same_site_later_date;
  if (w) {
    const ms = Z(w.date), hold = e.delayed_date_passed === true && ms === r.msd;
    r.cands.push({ kind: hold ? 'hold' : 'wait', key: 'wait:' + String(w.date).slice(0, 10), s, ms, j: jOfMs(ms), margin: w.margin, rank: w.rank, waitDays: w.wait_days, review: w.review_required === true });
  }
  for (const o of e.same_date_other_sites || []) {
    const os = ids.indexOf(o.site); if (os < 0) continue;
    r.cands.push({ kind: 'move', key: 'move:' + o.site, s: os, ms: r.msd, j: jOfMs(r.msd), margin: o.margin, rank: o.rank, distKm: o.distance_km, review: o.review_required === true });
  }
  r.cands.sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  if (!r.cands.length) return Object.assign(r, { kind: 'none', cs: s, cj: jOfMs(r.msd), cms: r.msd });

  const v = String(st.planb || '').trim().toLowerCase();
  let c = v ? (r.cands.find((x) => x.key === v) || r.cands.find((x) => x.kind === 'move' && ids[x.s] === v) || null) : null;
  r.picked = !!c;
  if (!c) c = r.cands[0];   // nothing picked on 02 Replan (or unreadable): the entry's rank-1 candidate
  r.chosen = c;
  return Object.assign(r, { kind: c.kind, cs: c.s, cj: c.j, cms: c.ms });
}

// success probability: only where a run exists for exactly this site and landing time
function confidence(siteId, ms) {
  const g = D.ghost && D.ghost.data;
  if (g && g.target_site === siteId && Z(g.landing_time_utc) === ms && typeof g.p === 'number') {
    return { p: g.p, ci: g.ci95, k: g.k, n: g.n, outside: g.outside_grid_frac, sigma: g.sigma_along_m === g.sigma_cross_m ? g.sigma_along_m : null, file: 'data/outputs/ghost_landers.json' };
  }
  const rows = D.nhf && D.nhf.data && D.nhf.data.ghost_landers_precise_vs_nhf;
  if (siteId === NHF_SITE && Array.isArray(rows)) {
    const row = rows.find((x) => Z(x.landing_time_utc) === ms);
    if (row && typeof row.p_precise === 'number') {
      const m = String(D.nhf.meta.note || '').match(/([\d,]+)\s+landers/);
      return { p: row.p_precise, ci: row.ci95_precise, k: null, n: m ? Number(m[1].replace(/,/g, '')) : null, outside: null, sigma: null, file: 'data/outputs/nhf_check.json (p_precise)' };
    }
  }
  return null;
}
// the computed frame of this site at exactly this time, if one was rendered (frames exist for the hours after one landing only)
function frameFor(siteId, ms) {
  const e = D.renders && D.renders.data && D.renders.data[siteId];
  if (!e || !Array.isArray(e.hours)) return null;
  const hr = (ms - Date.parse(e.landing_utc)) / HOUR;
  if (!Number.isFinite(hr) || !e.hours.includes(hr)) return null;
  const file = String(e.file || 'side_h{hhh}.jpg').replace('{hhh}', String(hr).padStart(3, '0'));
  return { url: new URL(`../../../data/renders/${siteId}/${file}`, import.meta.url).href, ms };
}

/* ---------------- the words on the black ---------------- */
function crumbLine(r) {
  const sep = () => h('i', {}, '/');
  const out = [h('span', {}, t('dc.orig') + ' ' + siteShort(r.s)), sep(), h('span', {}, dateBig(r.ms0)), sep()];
  if (r.kind === 'original') { out.push(h('b', { class: 'dc-lime' }, t('dc.nodelay'))); return out; }
  out.push(h('b', { class: 'dc-lime' }, r.delay === 1 ? t('dc.delay1') : t('dc.delay', { n: r.delay })), sep());
  if (r.kind === 'none') out.push(h('span', {}, t('dc.noalt')));
  else if (r.kind === 'noentry') out.push(h('span', {}, `${siteShort(r.cs)} · ${dateShort(r.cms)}`));
  else out.push(h('span', {}, `${t(r.kind === 'hold' ? 'dc.holds' : 'dc.alt')} ${siteShort(r.cs)} · ${dateShort(r.cms)}`));
  return out;
}
function leadOf(r, v) {
  const a = { site: siteShort(r.cs), date: dateBig(r.cms), n: r.delay };
  if (r.kind === 'none') return t('dc.lead.none', { site: siteShort(r.s), n: r.delay });
  if (r.kind === 'wait' || r.kind === 'move' || r.kind === 'hold') return t('dc.lead.' + r.kind, a);
  return t('dc.lead.' + v.k, a);
}
function metaLine(r, v, conf, fr) {
  const id = D.hm.data.site_ids[r.cs].toUpperCase(), c = r.chosen;
  const kind = r.kind === 'original' ? 'ORIGINAL PLAN' : r.kind === 'hold' ? `HOLDS AFTER +${r.delay} D` : r.kind === 'wait' ? `DELAY +${r.delay} D, WAIT +${Math.round(c.waitDays)} D`
    : r.kind === 'move' ? `DELAY +${r.delay} D, MOVE ${num(c.distKm, 1)} KM` : r.kind === 'none' ? `DELAY +${r.delay} D, NO SAFE ALTERNATIVE` : `DELAY +${r.delay} D`;
  return [`${r.kind === 'none' || r.kind === 'noentry' ? 'SITE' : 'PLAN'} ${id} ${isoMin(r.cms)}`, kind,
    v.m === null ? 'NOT COMPUTED' : `MARGIN ${fmtMargin(v.m)}`,
    conf ? `SUCCESS ${pct1(conf.p)} (95% ${ciText(conf.ci)})` : 'CONFIDENCE NOT EVALUATED',
    'NASA LRO LOLA', 'JPL HORIZONS DE441', fr ? 'FRAME SIMULATED' : null, 'ASSUMED CRITERIA', 'COMPUTED'].filter(Boolean).join(' · ');
}

// the verdicts around the decision, straight from the heatmap: one row for the original site, one for the plan site if it differs
function strip(r) {
  const d = D.hm.data, N = T.length, ids = d.site_ids;
  const jd = r.msd === undefined ? null : Math.round((r.msd - T[0]) / DAY);
  const isPlan = r.kind === 'wait' || r.kind === 'move' || r.kind === 'hold';
  const hi = Math.max(r.j0, jd ?? 0, isPlan ? r.cj : 0);
  let a = r.j0 - 8, b = Math.max(hi + 10, a + 47);
  if (b > N - 1) { a -= b - (N - 1); b = N - 1; }
  a = Math.max(0, a);
  const n = b - a + 1, W = 560, LAB = 44, cw = (W - LAB) / n, gap = cw >= 5 ? 1 : 0, RH = 18, RG = 5, TOP = 34;
  const rows = r.cs !== r.s ? [r.s, r.cs] : [r.s];
  const H = TOP + rows.length * RH + (rows.length - 1) * RG + 20;
  const x = (j) => LAB + (j - a) * cw, y = (i) => TOP + i * (RH + RG);
  const svg = sv('svg', { class: 'dc-strip-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': t('dc.strip') });
  const seen = new Set();
  rows.forEach((s, i) => {
    svg.append(sv('text', { class: 'dc-st-lab', x: 0, y: y(i) + RH / 2 + 4 }, ids[s].toUpperCase()));
    for (let j = a; j <= b; j++) {
      const v = verdict(s, j), k = v.k === 'ok' ? 'ok' : v.k === 'nc' ? 'nc' : (v.causes[0] || 'other');
      seen.add(k);
      const cell = sv('rect', { class: 'dc-st-c ' + k, x: (x(j) + gap / 2).toFixed(2), y: y(i), width: Math.max(0.6, cw - gap).toFixed(2), height: RH, rx: cw >= 8 ? 2 : 0,
        opacity: k === 'ok' ? (0.4 + 0.6 * Math.max(0, Math.min(1, v.m / 0.6))).toFixed(2) : null });
      cell.append(sv('title', {}, `${ids[s].toUpperCase()} · ${dateBig(T[j])} · ${k === 'ok' ? t('dc.pass') : k === 'nc' ? t('dc.chip.nc') : t('dc.c.' + k)}${v.m === null ? '' : ' ' + fmtMargin(v.m)}`));
      svg.append(cell);
    }
  });
  // markers: original and delayed above the rows (each on its own line), the plan below
  const mark = (j, row, label, line, cls) => {
    if (j === null || j < a || j > b) return;
    const cx = x(j) + cw / 2, end = cx > W - 130;
    const ty = line === 'below' ? H - 4 : line === 0 ? 10 : 24;
    const y1 = line === 'below' ? y(row) + RH + 1 : ty + 3, y2 = line === 'below' ? ty - 11 : y(row) - 1;
    svg.append(sv('line', { class: 'dc-st-tick ' + cls, x1: cx, x2: cx, y1, y2 }),
      sv('rect', { class: 'dc-st-box ' + cls, x: (x(j) + gap / 2).toFixed(2), y: y(row), width: Math.max(1.5, cw - gap).toFixed(2), height: RH, rx: cw >= 8 ? 2 : 0 }),
      sv('text', { class: 'dc-st-mk ' + cls, x: end ? cx + 3 : cx - 3, y: ty, 'text-anchor': end ? 'end' : 'start' }, label));
  };
  mark(r.j0, 0, `${t('dc.mk.orig')} ${dateShort(r.ms0)}`, 0, 'orig');
  if (jd !== null) mark(jd, 0, `${t('dc.mk.delayed')} ${dateShort(r.msd)}`, 1, 'delayed');
  if (isPlan) mark(r.cj, rows.length - 1, `${t('dc.mk.plan')} ${dateShort(r.cms)}`, 'below', 'plan');

  const sw = (k, label) => h('li', {}, h('i', { class: 'dc-sw ' + k }), label);
  return h('figure', { class: 'dc-strip' },
    h('figcaption', {}, h('b', {}, t('dc.strip')), h('span', {}, `${dateShort(T[a])} – ${dateBig(T[b])}`)),
    svg,
    h('ul', { class: 'dc-legend' },
      seen.has('ok') ? sw('ok', `${t('dc.pass')} (${t('dc.strip.more')})`) : null,
      ['power', 'comm', 'approach', 'other'].filter((k) => seen.has(k)).map((k) => sw(k, t('dc.c.' + k))),
      seen.has('nc') ? sw('nc', t('dc.chip.nc')) : null));
}

/* ---------------- the card: the answer ---------------- */
function tagOf(r, v) {
  const cause = (r.entry && String(r.entry.delayed_date_fail_causes || '').split(',')[0]) || v.causes[0] || 'other';
  if (r.kind === 'none') return { cls: cause, text: t('dc.tag.none') };
  if (v.k === 'nc') return { cls: 'nc', text: t('dc.tag.nc') };
  if (r.kind === 'original') return v.k === 'ok' ? { cls: 'lime', text: t('dc.tag.holds') } : { cls: cause, text: t('dc.tag.origfail') };
  if (r.kind === 'noentry') return v.k === 'ok' ? { cls: 'lime', text: t('dc.tag.holds') } : { cls: cause, text: t('dc.tag.delayfail') };
  if (r.kind === 'hold') return { cls: 'lime', text: t('dc.tag.holds') };
  return { cls: 'lime', text: t('dc.tag.selected') };
}
function whenOf(r) {
  if (r.kind === 'wait') { const n = Math.round(r.chosen.waitDays); return n === 1 ? t('dc.when.wait1') : t('dc.when.wait', { n }); }
  return t('dc.when.' + r.kind);
}
function routeLine(r) {
  const arrow = () => icon('arrow', 'dc-arrow');
  const step = (a, b) => h('span', { class: 'dc-step' }, h('b', {}, a), b ? ' ' + b : null);
  const kids = [step(`${t('dc.orig')} ${siteShort(r.s)}`, `· ${dateShort(r.ms0)}`), arrow()];
  let side = null;
  if (r.kind === 'original') kids.push(step(t('dc.nodelay')));
  else {
    kids.push(step(r.delay === 1 ? t('dc.delay1') : t('dc.delay', { n: r.delay })), arrow());
    if (r.kind === 'none') kids.push(step(t('dc.noalt')));
    else if (r.kind === 'noentry') kids.push(step(siteShort(r.cs), `· ${dateShort(r.cms)}`));
    else kids.push(step(`${t(r.kind === 'hold' ? 'dc.holds' : 'dc.alt')} ${siteShort(r.cs)}`, `· ${dateShort(r.cms)}`));
    if (r.kind === 'move') side = [t('dc.distance'), ' ', h('b', {}, t('dc.km', { n: num(r.chosen.distKm, 1) }))];
    if (r.kind === 'wait') side = [t('dc.waitlab'), ' ', h('b', {}, days(Math.round(r.chosen.waitDays)))];
  }
  return h('div', { class: 'dc-route' }, h('div', { class: 'dc-route-steps' }, kids), side ? h('p', { class: 'dc-route-side' }, side) : null);
}

function conditions(r, v) {
  const d = D.hm.data, crit = d.criteria || {}, s = r.cs, j = r.cj;
  const defs = [['sun_mean', 'sun', 'pct'], ['longest_dark_h', 'moon', 'h'], ['first_sunset_h', 'sunset', 'sunset'], ['comm_frac', 'comm', 'pct'], ['longest_comm_gap_h', 'gap', 'h'], ['approach', 'approach', 'pct']];
  const rows = defs.map(([key, ic, kind]) => {
    const ck = Object.keys(crit).find((k) => crit[k] && crit[k].metric === key), c = ck ? crit[ck] : null;
    const src = key === 'approach' ? d.approach : (d.metrics && d.metrics[key]);
    const val = v.k === 'nc' || !src || j < 0 ? null : src[s][j];
    return { key, ic, kind, c, group: ck ? ck.split('_')[0] : null, val, mark: null };
  });
  // The verdict per cause comes from the pipeline (fail_causes). Inside a failed cause the row that misses its own limit carries the mark.
  for (const row of rows) {
    if (!row.c) row.mark = 'info';
    else if (row.val === null || row.val === undefined) row.mark = 'nc';
    else if (!v.causes.includes(row.group)) row.mark = 'ok';
    else row.mark = (row.c.kind === 'min' ? row.val < row.c.limit : row.val > row.c.limit) ? 'fail' : 'ok';
  }
  for (const g of v.causes) { const mine = rows.filter((x) => x.group === g && x.mark !== 'nc'); if (mine.length && !mine.some((x) => x.mark === 'fail')) mine.forEach((x) => { x.mark = 'fail'; }); }

  const limText = (row) => (row.c ? `${row.c.kind === 'min' ? '≥' : '≤'} ${row.kind === 'pct' ? Math.round(row.c.limit * 100) + '%' : t('dc.h', { n: num(row.c.limit) })}` : t('dc.nocrit'));
  const valText = (row) => {
    if (row.val === null || row.val === undefined) return '—';
    if (row.kind === 'pct') return pctNear(row.val, row.c ? row.c.limit : null);
    if (row.kind === 'sunset' && row.val >= d.duration_h) return t('dc.nosunset');
    return t('dc.h', { n: num(row.val) });
  };
  const mark = (row) => {
    if (row.mark === 'ok') return h('span', { class: 'dc-mark ok', title: t('dc.pass') }, icon('check'), h('span', { class: 'sr' }, t('dc.pass')));
    if (row.mark === 'fail') return h('span', { class: 'dc-mark fail ' + row.group }, t('dc.fail'));
    return h('span', { class: 'dc-mark none', title: row.mark === 'info' ? t('dc.info') : t('dc.chip.nc') }, '—');
  };
  return h('section', { class: 'dc-cond', 'aria-labelledby': 'dc-cond-h' },
    h('h3', { id: 'dc-cond-h' }, t('dc.cond')),
    h('p', { class: 'dc-kv' },
      h('span', { title: t('dc.margin.tip') }, t('dc.margin') + ': ', h('b', {}, v.m === null ? t('dc.chip.nc') : fmtMargin(v.m))),
      h('span', {}, t('dc.duration') + ': ', h('b', {}, durText())),
      h('span', { class: 'dc-assumed' }, t('dc.assumed'))),
    h('table', { class: 'dc-table' },
      h('thead', { class: 'sr' }, h('tr', {}, h('th', { scope: 'col' }, t('dc.col.metric')), h('th', { scope: 'col' }, t('dc.col.crit')), h('th', { scope: 'col' }, t('dc.col.value')), h('th', { scope: 'col' }, t('dc.col.mark')))),
      h('tbody', {}, rows.map((row) => h('tr', { class: row.mark === 'fail' ? 'is-fail' : null },
        h('th', { scope: 'row' }, icon(row.ic), h('span', {}, t('dc.m.' + row.key))),
        h('td', { class: 'dc-crit' }, limText(row)),
        h('td', { class: 'dc-val' }, valText(row)),
        h('td', { class: 'dc-res' }, mark(row)))))),
    v.k === 'nc' ? h('p', { class: 'dc-note' }, t('dc.cond.nc')) : null);
}

function success(conf) {
  const head = h('h3', { id: 'dc-succ-h' }, t('dc.succ'));
  if (!conf) {
    const n = D.nhf && D.nhf.data && D.nhf.data.summary && D.nhf.data.summary.n_dates;
    return h('section', { class: 'dc-succ', 'aria-labelledby': 'dc-succ-h' }, head,
      h('div', { class: 'dc-none' }, h('p', { class: 'dc-none-t' }, t('dc.succ.none')), h('p', {}, t('dc.succ.none2', { n: n ?? '—' }))));
  }
  return h('section', { class: 'dc-succ', 'aria-labelledby': 'dc-succ-h' }, head,
    h('p', { class: 'dc-p-num' }, pct1(conf.p)),
    h('p', { class: 'dc-p-ci' }, h('span', {}, t('dc.ci')), h('b', {}, ciText(conf.ci))),
    conf.n ? h('p', { class: 'dc-p-n' }, conf.k !== null && conf.k !== undefined ? t('dc.trials', { k: num(conf.k), n: num(conf.n) }) : t('dc.trials.n', { n: num(conf.n) })) : null,
    conf.outside > 0 ? h('p', { class: 'dc-warn' }, icon('warn'), t('dc.outside', { p: pct1(conf.outside) })) : null);
}

/* ---------------- the bar: candidates as the wide strip ---------------- */
const pickState = (r, st, cand) => ({ site: D.hm.data.site_ids[r.s], time: isoMin(r.ms0), delay: st.delay, planb: cand.key });
function candidates(r, st) {
  if (!r.cands.length) {
    const msg = r.kind === 'original' ? t('dc.cands.original') : r.kind === 'none' ? t('dc.cands.none') : t('dc.cands.noentry', { list: ((D.planb && D.planb.meta.delays_days) || [1, 3, 7]).join(', ') });
    return h('div', { class: 'dc-cands' }, h('p', { class: 'dc-cands-empty' }, msg));
  }
  return h('div', { class: 'dc-cands' },
    h('p', { class: 'dc-cands-lab' }, h('b', {}, t('dc.cands')), h('span', {}, t('dc.cands.pick'))),
    h('div', { class: 'dc-cands-row', role: 'radiogroup', 'aria-label': t('dc.cands') }, r.cands.map((c) => {
      const sub = c.kind === 'move' ? t('dc.cand.move', { n: num(c.distKm, 0) }) : c.kind === 'wait' ? t('dc.cand.wait', { n: Math.round(c.waitDays) }) : t('dc.cand.hold');
      return h('button', { type: 'button', class: 'dc-cand', role: 'radio', 'aria-checked': String(c === r.chosen), title: candTitle(c), onclick: () => ctx.set(pickState(r, st, c)) },
        h('span', { class: 'dc-cand-t' }, h('i', {}, String(c.rank ?? '–')), h('b', {}, siteShort(c.s)), h('span', {}, dateShort(c.ms))),
        h('span', { class: 'dc-cand-s' }, h('span', {}, sub), h('span', { class: 'pm-chip ok' }, fmtMargin(c.margin))));
    })));
}

/* ---------------- below the fold: reasons, compared candidates, evidence, sources ---------------- */
function candTitle(c) { return t('dc.o.' + c.kind, { site: siteShort(c.s), date: dateBig(c.ms) }); }
function candSub(c) {
  if (c.kind === 'move') return t('dc.o.move.sub', { n: num(c.distKm, 1) });
  if (c.kind === 'wait') { const n = Math.round(c.waitDays); return n === 1 ? t('dc.o.wait.sub1') : t('dc.o.wait.sub', { n }); }
  return t('dc.o.hold.sub');
}
function details(r, st, conf, fr) {
  const rules = D.rules && D.rules.data, n = r.cands.length, c = r.chosen, hm = D.hm, val = D.val;
  let text;
  if (r.kind === 'original') text = t('dc.why.original');
  else if (r.kind === 'none') text = ((!ko() && rules && rules.no_safe_candidate && rules.no_safe_candidate.message) ? rules.no_safe_candidate.message + ' ' : '') + t('dc.why.none');
  else if (r.kind === 'noentry') text = t('dc.why.noentry', { list: ((D.planb && D.planb.meta.delays_days) || [1, 3, 7]).join(', '), n: r.delay });
  else if (r.kind === 'hold') text = t('dc.why.hold', { r: c.rank, n });
  else if (c.rank === 1) text = ((!ko() && rules && rules.explanation_template) || t('dc.why.best')) + ' ' + t('dc.rank', { r: 1, n }) + (r.picked ? '' : ' ' + t('dc.why.default'));
  else text = t('dc.why.other', { r: c.rank, n, best: candTitle(r.cands[0]) });

  const prio = rules && Array.isArray(rules.ranking_priorities) ? [...rules.ranking_priorities].sort((a, b) => a.priority - b.priority) : [];
  const lab = (k, pre) => { const key = pre + k, s = t(key); return s === key ? String(k).replace(/_/g, ' ') : s; };
  const sum = val && val.data && val.data.pgda && val.data.pgda.summary;
  const vline = (k) => (sum && sum[k] ? t('dc.evid.line', { rmse: (sum[k].rmse * 100).toFixed(1), r: Number(sum[k].pearson_r).toFixed(3), n: sum[k].n, ref: val.meta.reference || 'NASA PGDA' }) : t('dc.evid.none'));
  const pm = D.pm && D.pm.data, terrain = (pm && pm.terrain) || hm.meta.terrain, eph = (pm && pm.ephemeris) || hm.meta.ephemeris;
  const si = hm.meta.calc_si_usage || (val && val.meta.calc_si_usage);
  const row = (k, ...v) => [h('dt', {}, k), h('dd', {}, v)];

  return h('section', { class: 'sources dc-src', 'aria-labelledby': 'dc-src-h' },
    h('h2', { id: 'dc-src-h' }, t('dc.src')),
    h('dl', {},
      row(t('dc.why'), text),
      prio.length ? row(t('dc.rule'), h('ol', { class: 'dc-prio' }, prio.map((p) => h('li', { title: p.rule || null }, h('b', {}, `${p.priority} ${lab(p.criterion, 'dc.p.')}`), ` (${lab(p.direction, 'dc.d.')})`)))) : null,
      n ? row(t('dc.compared'), h('ol', { class: 'dc-list' }, r.cands.map((x) => h('li', { class: x === c ? 'on' : null },
        h('b', {}, `${x.rank ?? '–'}. ${candTitle(x)}`), ` · ${candSub(x)} · ${t('dc.o.margin', { m: fmtMargin(x.margin) })}`, x.review ? ` · ${t('dc.o.review')}` : '', x === c ? h('em', {}, ` · ${t('dc.o.shown')}`) : null)))) : null,
      conf ? row(t('dc.conf'), `${pct1(conf.p)} (${t('dc.ci')} ${ciText(conf.ci)}). `, t('dc.conf.v', { n: conf.n ? num(conf.n) : '', f: conf.file }), conf.sigma ? ' ' + t('dc.conf.sigma', { s: num(conf.sigma) }) : '')
        : row(t('dc.conf'), `${t('dc.succ.none')}. ${t('dc.succ.none2', { n: (D.nhf && D.nhf.data && D.nhf.data.summary && D.nhf.data.summary.n_dates) ?? '—' })}`),
      row(t('dc.evid.sun'), vline('sun')),
      row(t('dc.evid.earth'), vline('earth')),
      terrain ? row(t('dc.evid.terrain'), terrain.source, Array.isArray(terrain.files) && terrain.files.length ? ' · ' + terrain.files.join(' · ') : '') : null,
      eph ? row(t('dc.evid.eph'), eph.source) : null,
      row(t('dc.evid.crit'), t('dc.evid.crit.v', { s: hm.data.criteria_status || '—', d: durText() })),
      row(t('dc.evid.frame'), fr ? t('dc.credit.frame', { site: siteShort(r.cs), date: dateBig(fr.ms) }) : t('dc.credit.none')),
      si ? row(t('dc.evid.si'), h('span', { lang: 'en' }, `${(si.si_tools || []).join(', ')}. ${si.scope || ''}`)) : null));
}

function draw() {
  const st = norm(ctx.state), r = resolve(st), v = verdict(r.cs, r.cj), ids = D.hm.data.site_ids;
  const conf = v.k === 'nc' ? null : confidence(ids[r.cs], r.cms);
  const tag = tagOf(r, v), fr = frameFor(ids[r.cs], r.cms);

  const chips = [];
  if (v.k === 'ok') chips.push(h('li', { class: 'dc-chip lime' }, t('dc.chip.met'), icon('check')));
  else if (v.k === 'nc') chips.push(h('li', { class: 'dc-chip line' }, t('dc.chip.nc')));
  else for (const c of (v.causes.length ? v.causes : ['other'])) chips.push(h('li', { class: 'dc-chip st ' + c }, t('dc.chip.fails', { cause: t('dc.c.' + c) })));
  chips.push(h('li', { class: 'dc-chip ' + (conf ? 'grey' : 'line') }, t(conf ? 'dc.chip.conf' : 'dc.chip.noconf')));
  chips.push(h('li', { class: 'dc-chip line' }, t(D.val ? 'dc.chip.valid' : 'dc.chip.novalid'), D.val ? icon('check') : null));

  const frameCap = fr ? t('dc.credit.frame', { site: siteShort(r.cs), date: dateBig(fr.ms) }) : '';
  // the headline in two lines on wide screens: "A clear plan." / "With the evidence."
  const head = t('dc.h1').split(/(?<=\.)\s+/);
  root.replaceChildren(h('div', { class: 'dc' },
    h('section', { class: 's3 photo dc-stage' + (fr ? ' has-frame' : '') + (entered ? '' : ' enter') },
      h('div', { class: 's3-stage' }, fr ? h('img', { class: 'dc-frame', src: fr.url, alt: frameCap }) : null),
      h('div', { class: 'dc-grid' },
        h('div', { class: 'dc-left' },
          h('div', { class: 's3-caption dc-cap' },
            h('p', { class: 's3-crumb dc-crumb' }, crumbLine(r)),
            h('h1', {}, head.flatMap((x, i) => (i ? [' ', h('span', {}, x)] : [h('span', {}, x)]))),
            h('p', { class: 's3-lead' }, leadOf(r, v)),
            h('p', { class: 's3-sub' }, t('dc.sub', { name: siteName(r.cs), pos: latlon(r.cs) }))),
          strip(r),
          fr ? h('p', { class: 'dc-frame-lab' }, t('dc.frame.lab', { site: siteShort(r.cs), date: dateBig(fr.ms) })) : null),
        h('article', { class: 'dc-card', 'aria-labelledby': 'dc-title' },
          h('p', { class: 'dc-tag ' + tag.cls }, tag.text),
          h('h2', { class: 'dc-title', id: 'dc-title' }, h('span', {}, siteShort(r.cs)), h('span', { class: 'dc-dot', 'aria-hidden': 'true' }, ' · '), h('span', { class: 'dc-nowrap' }, dateBig(r.cms))),
          h('p', { class: 'dc-when' }, '12:00 UTC', h('i', {}, ' / '), whenOf(r)),
          h('ul', { class: 'dc-chips' }, chips),
          routeLine(r),
          h('div', { class: 'dc-two' }, conditions(r, v), success(conf)))),
      h('p', { class: 's3-meta' }, metaLine(r, v, conf, fr))),
    h('section', { class: 's3-bar dc-bar', 'aria-label': t('dc.bar') },
      h('div', { class: 'dc-nav' },
        h('button', { type: 'button', class: 's3-map', onclick: () => ctx.set({ step: 'explain' }) }, t('dc.back')),
        h('button', { type: 'button', class: 's3-map', onclick: () => ctx.set({ step: 'replan' }) }, t('dc.change'))),
      candidates(r, st),
      h('button', { type: 'button', class: 's3-land', onclick: () => window.print() }, t('dc.print'))),
    h('p', { class: 's3-credit' }, fr ? frameCap : t('dc.credit.none')),
    details(r, st, conf, fr)));
  entered = true;   // the rise-in plays once, not on every candidate pick
}

export default {
  id: 'decision',
  num: '⑤',
  label: '결정 카드',
  ownTitle: true,

  async render(el, c) {
    root = el; ctx = c; D = null; entered = false;
    const st = norm(c.state);
    const [hm, rules, nhf, ghost, val, pm, renders] = await Promise.all([
      c.use('outputs/heatmap.json'), c.use('outputs/planb_rules.json'), c.use('outputs/nhf_check.json'), c.use('outputs/ghost_landers.json'),
      c.use('outputs/validation.json'), c.use('project_meta.json'), c.use('renders/index.json'),
    ]);
    if (!hm) return c.missing(['outputs/heatmap.json']);
    let planb = null;
    if (st.delay > 0) {
      planb = await c.use('outputs/planb_candidates.json');
      if (!planb) return c.missing(['outputs/planb_candidates.json']);
    }
    T = hm.data.landing_times_utc.map(Z);
    D = { hm, rules, nhf, ghost, val, pm, renders, planb };
    draw();
  },

  mounted() { document.body.classList.add('immersive'); },

  // a new Plan B, delay, site or time: redraw in place (the files are already read)
  update(state) {
    if (!D || !root || !root.isConnected) return 'rerender';
    if (norm(state).delay > 0 && !D.planb) return 'rerender';   // the candidates file is read only when a delay is set
    draw();
  },

  unmount() { document.body.classList.remove('immersive'); root = null; D = null; },
};
