// 화면 글자 (영어 기본 + 한국어 전환)와 시각·숫자 표기. 모든 화면이 같이 써요.
// t('key', {var}) → 지금 언어의 글자. addStrings({ en: {...}, ko: {...} })로 화면 글자를 더해요.
// fmt.utc(ms) "Nov 14, 2026, 05:00 UTC" · fmt.kst(ms) "14:00 KST" (날짜가 다르면 날짜도) · fmt.dur(h) "9 d 12 h"

const HOUR = 3600e3;
const MINUS = '−';

const dict = {
  en: {
    'app.scope': 'Lunar south pole · landing replanning',
    'nav.steps': 'Steps', 'nav.lang': 'Language', 'nav.prev': 'Previous step', 'nav.next': 'Next step',
    'step.sky': 'Where & when', 'step.replan': 'Replan', 'step.ghosts': 'Confidence', 'step.explain': 'Evidence', 'step.decision': 'Decision',
    'status.loading': 'Loading…', 'status.missing': 'No data yet. This screen needs:', 'status.error': 'Screen error: {msg}',
    'badge.dummy': 'DEMO DATA',
    'file.title': 'Open this page through a local web server',
    'file.body': 'A page opened by double-click cannot read JSON files. In the moonkeeper folder run the command below, then open',
    'dur.d': '{d} d', 'dur.h': '{h} h', 'dur.dh': '{d} d {h} h',
    'compass': 'N,NE,E,SE,S,SW,W,NW',
    'st.ok': 'OK', 'st.power': 'Power · the Sun', 'st.comm': 'Comm · Earth', 'st.approach': 'Approach lighting', 'st.other': 'Other',
  },
  ko: {
    'app.scope': '달 남극 · 착륙 재계획',
    'nav.steps': '단계', 'nav.lang': '언어', 'nav.prev': '이전 단계', 'nav.next': '다음 단계',
    'step.sky': '언제·어디', 'step.replan': '재계획', 'step.ghosts': '신뢰도', 'step.explain': '근거', 'step.decision': '결정',
    'status.loading': '불러오는 중…', 'status.missing': '데이터 없음. 이 화면에 필요한 파일:', 'status.error': '화면 오류: {msg}',
    'badge.dummy': '데모 데이터',
    'file.title': '로컬 웹 서버로 열어 주세요',
    'file.body': '파일을 더블클릭해서 열면 JSON을 못 읽어요. moonkeeper 폴더에서 아래 명령을 실행한 다음 이 주소를 여세요:',
    'dur.d': '{d}일', 'dur.h': '{h}시간', 'dur.dh': '{d}일 {h}시간',
    'compass': '북,북동,동,남동,남,남서,서,북서',
    'st.ok': '통과', 'st.power': '전력 · 해', 'st.comm': '교신 · 지구', 'st.approach': '접근로 조명', 'st.other': '기타',
  },
};

let lang = 'en';
try {
  const saved = localStorage.getItem('mk-lang');
  if (saved === 'en' || saved === 'ko') lang = saved;
} catch (e) { /* storage blocked: stay in English */ }

const langSubs = new Set();

export function getLang() { return lang; }
export function setLang(l) {
  if (l === lang || !dict[l]) return;
  lang = l;
  try { localStorage.setItem('mk-lang', l); } catch (e) { /* ignore */ }
  langSubs.forEach((f) => f(l));
}
export function onLang(f) { langSubs.add(f); return () => langSubs.delete(f); }

export function t(key, vars) {
  let s = dict[lang]?.[key] ?? dict.en[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
  return s;
}
export function addStrings(more) {
  for (const l of Object.keys(more)) dict[l] = Object.assign(dict[l] || {}, more[l]);
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const two = (n) => String(n).padStart(2, '0');
function parts(ms, zone) {
  const d = new Date(ms + (zone === 'KST' ? 9 * HOUR : 0));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), min: d.getUTCMinutes() };
}

export const fmt = {
  date(ms, zone = 'UTC', year = true) {
    const p = parts(ms, zone);
    if (lang === 'ko') return `${year ? p.y + '년 ' : ''}${p.m + 1}월 ${p.d}일`;
    return `${MON[p.m]} ${p.d}${year ? ', ' + p.y : ''}`;
  },
  clock(ms, zone = 'UTC') { const p = parts(ms, zone); return `${two(p.h)}:${two(p.min)}`; },
  utc(ms, year = true) { return `${fmt.date(ms, 'UTC', year)}, ${fmt.clock(ms)} UTC`; },
  // KST next to a UTC time; the date only when it is not the UTC date
  kst(ms) {
    const u = parts(ms, 'UTC'), k = parts(ms, 'KST');
    const same = u.y === k.y && u.m === k.m && u.d === k.d;
    return `${same ? '' : fmt.date(ms, 'KST', false) + ', '}${fmt.clock(ms, 'KST')} KST`;
  },
  month(ms) { const p = parts(ms, 'UTC'); return lang === 'ko' ? `${p.y}년 ${p.m + 1}월` : `${MON[p.m]} ${p.y}`; },
  dur(hours) {
    const d = Math.floor(hours / 24), h = hours % 24;
    if (d === 0) return t('dur.h', { h });
    if (h === 0) return t('dur.d', { d });
    return t('dur.dh', { d, h });
  },
  num(v, digits = 0) {
    return (v < 0 ? MINUS : '') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  },
  deg(v, digits = 1) { return fmt.num(v, digits) + '°'; },
  pct(frac) { return `${Math.round(frac * 100)}%`; },
  compass(az) { return t('compass').split(',')[Math.round((((az % 360) + 360) % 360) / 45) % 8]; },
  latlon(lat, lon) {
    const la = Math.abs(lat).toFixed(2), lo = Math.abs(lon).toFixed(2);
    if (lang === 'ko') return `${lat < 0 ? '남위' : '북위'} ${la}°, ${lon < 0 ? '서경' : '동경'} ${lo}°`;
    return `${la}°${lat < 0 ? 'S' : 'N'}, ${lo}°${lon < 0 ? 'W' : 'E'}`;
  },
};
