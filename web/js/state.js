// 화면 ①~⑤가 함께 쓰는 상태 하나 (구조 v2 4번 "화면 공통").
// URL 해시에 저장해서 새로고침하거나 링크를 공유해도 같은 화면이 열려요.
// 예: #step=replan&site=cr1&time=2027-01-05T12:00Z&delay=3&planb=sr1
//
// step  화면 id (sky · replan · ghosts · explain · decision)
// site  선택 착륙지 id          time  착륙 시각 (UTC, 1시간 단위 ISO)
// delay 지연 일수 (숫자)        planb 고른 Plan B
//
// subscribe(f) → f(state, changed). changed는 바뀐 키 목록이에요 (예: { time: true }).

const KEYS = ['step', 'site', 'time', 'delay', 'planb'];
const subs = new Set();
let state = read();

function read() {
  const p = new URLSearchParams(location.hash.slice(1));
  const s = { step: 'sky', site: null, time: null, delay: null, planb: null };
  for (const k of KEYS) if (p.has(k)) s[k] = p.get(k);
  if (s.delay !== null) s.delay = Number(s.delay);
  return s;
}

// 끄는 동안 해시를 너무 자주 쓰면 브라우저가 막아서 (Safari: 10초에 100번), 잠깐 모았다가 써요.
let timer = 0;
function write() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const p = new URLSearchParams();
    for (const k of KEYS) if (state[k] !== null && state[k] !== undefined) p.set(k, state[k]);
    const hash = '#' + p.toString();
    if (location.hash !== hash) history.replaceState(null, '', hash);
  }, 200);
}

function diff(a, b) {
  const changed = {};
  for (const k of KEYS) if (a[k] !== b[k]) changed[k] = true;
  return changed;
}

export function get() {
  return state;
}

export function set(patch) {
  const next = { ...state, ...patch };
  const changed = diff(state, next);
  if (!Object.keys(changed).length) return;
  state = next;
  write();
  subs.forEach((f) => f(state, changed));
}

export function subscribe(f) {
  subs.add(f);
  return () => subs.delete(f);
}

window.addEventListener('hashchange', () => {
  const next = read();
  const changed = diff(state, next);
  state = next;
  if (Object.keys(changed).length) subs.forEach((f) => f(state, changed));
});
