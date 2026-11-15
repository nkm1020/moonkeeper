// 화면 ①~⑤를 이어 주는 뼈대: 단계 표시, 공유 상태, 언어 전환, 불러오는 중 / 데이터 없음 / 가짜 데이터 배지.
// 화면을 새로 만들 땐 screens/ 안의 파일만 고치면 돼요.
//
// 화면 파일 규칙 (screens/*.js의 export default):
//   id, num, label            단계 표시 (글자는 i18n.js의 'step.<id>'가 있으면 그걸 써요)
//   render(el, ctx)           처음 그릴 때. ctx = { state, set, use, missing, rerender }
//   update(state, changed)    (선택) 같은 화면에서 상태만 바뀔 때. 없으면 render를 다시 불러요. 'rerender'를 돌려주면 다시 그려요.
//   unmount()                 (선택) 다른 화면으로 갈 때 정리 (렌더 루프 멈추기 등)
//   ownTitle: true            (선택) 화면이 h1을 직접 그려요. 없으면 뼈대가 "① 하늘 파노라마"를 h1로 달아요.

import * as store from './state.js';
import { loadPreferReal } from './data.js';
import { h, statusBox } from './dom.js';
import { t, getLang, setLang, onLang } from './i18n.js';
import sky from './screens/sky.js';
import replan from './screens/replan.js';
import ghosts from './screens/ghosts.js';
import explain from './screens/explain.js';
import decision from './screens/decision.js';

const SCREENS = [sky, replan, ghosts, explain, decision];

const nav = document.getElementById('steps');
const main = document.getElementById('screen');
const badge = document.getElementById('dummy-badge');
const prev = document.getElementById('prev');
const next = document.getElementById('next');

let renderId = 0;
let mounted = null; // { sc } once a screen has finished render()

const label = (sc) => {
  const k = 'step.' + sc.id, s = t(k);
  return s === k ? sc.label : s;
};

function current(s) {
  const i = SCREENS.findIndex((x) => x.id === s.step);
  return i < 0 ? 0 : i;
}

function renderNav(i) {
  nav.setAttribute('aria-label', t('nav.steps'));
  nav.replaceChildren(
    h('ol', {}, SCREENS.map((sc, j) =>
      h('li', {}, h(
        'a',
        {
          href: '#step=' + sc.id,
          'aria-current': j === i ? 'step' : null,
          onclick: (e) => {
            e.preventDefault();
            store.set({ step: sc.id });
          },
        },
        h('span', { class: 'n' }, String(j + 1).padStart(2, '0')),
        h('span', { class: 'lb' }, label(sc)),
      )),
    )),
  );
  const p = SCREENS[i - 1], n = SCREENS[i + 1];
  prev.disabled = !p;
  next.disabled = !n;
  const two = (k) => String(k + 1).padStart(2, '0');
  prev.textContent = p ? `← ${two(i - 1)} ${label(p)}` : '';
  next.textContent = n ? `${two(i + 1)} ${label(n)} →` : '';
  prev.setAttribute('aria-label', t('nav.prev'));
  next.setAttribute('aria-label', t('nav.next'));
  prev.hidden = !p;
  next.hidden = !n;
}

function renderChrome() {
  document.documentElement.lang = getLang();
  document.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === getLang())));
  const g = document.getElementById('lang');
  if (g) g.setAttribute('aria-label', t('nav.lang'));
  const sc = document.getElementById('scope');
  if (sc) sc.textContent = t('app.scope');
  badge.textContent = t('badge.dummy');
}

async function render(s) {
  const id = ++renderId;
  const i = current(s);
  const sc = SCREENS[i];
  if (mounted && mounted.sc.unmount) mounted.sc.unmount();   // stop the old screen (a 3D scene keeps a render loop)
  mounted = null;
  renderNav(i);
  document.title = `Moonkeeper · ${label(sc)}`;

  const used = [];
  const body = h('div', { class: 'body' });
  const ctx = {
    get state() { return store.get(); },
    set: store.set,
    // 진짜 → _dummy 순서로 읽고, 가짜 데이터 배지에 쓸 수 있게 기록해요.
    use: async (path) => {
      const f = await loadPreferReal(path);
      if (f) used.push(f);
      return f;
    },
    missing: (paths) => body.replaceChildren(statusBox(t('status.missing'), paths)),
    rerender: () => render(store.get()),   // a screen switching between its own views (the sky: map / photograph)
  };

  main.replaceChildren(statusBox(t('status.loading')));
  main.dataset.screen = sc.id;
  try {
    await sc.render(body, ctx);
  } catch (err) {
    console.error(err);
    body.replaceChildren(statusBox(t('status.error', { msg: err.message })));
  }
  if (id !== renderId) return; // 그새 다른 화면으로 넘어갔으면 버려요

  main.replaceChildren(sc.ownTitle ? body : h('section', {}, h('h1', {}, `${String(i + 1).padStart(2, '0')} ${label(sc)}`), body));
  mounted = { sc };
  const dummies = used.filter((f) => f.dummy).map((f) => 'data/' + f.path);
  badge.hidden = dummies.length === 0;
  badge.title = dummies.join('\n');
  if (sc.mounted) sc.mounted(store.get());
  hourNote(store.get());
}

// 02 Replan and 05 Decision are computed for the daily 12:00 UTC landing (Plan B exists once a day). If the reader chose another hour on 01, say so.
function hourNote(s) {
  const old = document.getElementById('hour-note'); if (old) old.remove();
  const d = new Date(Date.parse(String(s.time || '').slice(0, 16) + 'Z')), hr = Number.isFinite(d.getTime()) ? d.getUTCHours() : 12;
  if ((s.step === 'replan' || s.step === 'decision') && hr !== 12) main.prepend(h('p', { id: 'hour-note', class: 'hour-note' }, t('note.hour', { hh: String(hr).padStart(2, '0') + ':00' })));
}

function onState(s, changed) {
  hourNote(s);
  if (changed && !changed.step && mounted && mounted.sc.update) {
    renderNav(current(s));
    // a screen can ask for a fresh render, e.g. the sky switching between its 3D scene and the 2D panorama
    if (mounted.sc.update(s, changed) !== 'rerender') return;
  }
  if (changed && changed.step) window.scrollTo(0, 0);
  render(s);
}

function fileNotice() {
  main.replaceChildren(
    h('section', { class: 'title-row' }, h('div', {},
      h('h1', {}, t('file.title')),
      h('p', { class: 'lede' }, t('file.body'), ' ', h('b', {}, 'http://localhost:8000/web/')))),
    h('section', { class: 'panel' }, h('pre', {}, h('code', {}, 'cd moonkeeper\npython3 -m http.server 8000'))),
  );
}

prev.addEventListener('click', () => store.set({ step: SCREENS[Math.max(0, current(store.get()) - 1)].id }));
next.addEventListener('click', () =>
  store.set({ step: SCREENS[Math.min(SCREENS.length - 1, current(store.get()) + 1)].id }),
);
document.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang)));
onLang(() => { renderChrome(); render(store.get()); });

const bar = document.querySelector('.topbar');
const onScroll = () => bar && bar.classList.toggle('scrolled', window.scrollY > 4);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

renderChrome();
if (location.protocol === 'file:') {
  renderNav(current(store.get()));
  fileNotice();
} else {
  store.subscribe(onState);
  render(store.get());
}
