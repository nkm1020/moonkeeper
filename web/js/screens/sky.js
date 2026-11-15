// ① 하늘 · 강민
// 처음 열면 "언제, 어디에 내릴까" 지도(skymap.js)를 보여 줘요. 착륙지를 고르면 그 자리의 사진(sky3d.js)으로 가요.
// 사진: 3D 장면 파일(data/scene3d/<site>/)이 있고 WebGL2가 되면 실제 지형 위의 3D 장면, 아니면 2D 파노라마.
// 어느 쪽이든 같은 공유 상태(site, time)를 읽고 써요.
// 주소 옵션: ?view=photo (사진부터), ?view=2d (2D 파노라마), ?h= ?cam= ?play=1 (사진 캡처용, 사진부터 열어요)

import sky2d from './sky2d.js';
import sky3d from './sky3d.js';
import skymap from './skymap.js';
import { t } from '../i18n.js';
import { h } from '../dom.js';

const webgl2 = (() => { try { return !!document.createElement('canvas').getContext('webgl2'); } catch (e) { return false; } })();
const q0 = new URLSearchParams(location.search);
let mode = !webgl2 || q0.has('h') || q0.has('cam') || q0.get('play') === '1' || ['2d', 'photo'].includes(q0.get('view')) ? 'photo' : 'map';
let active = null;
let activeMode = null;   // the view that is drawn now
let activeSite = null;   // the site the active view was drawn for
let index = null;        // data/scene3d/index.json: the sites that have a 3D scene
let transit = null;      // 'in' = flying from the map into a site, 'out' = coming back
let cameFrom = null;     // the site the reader left for the map

// The map and the photograph are one screen at two distances. Between them the view goes through black:
// the map flies into the site, the photograph settles out of the dark (and the other way round).
let warpEl = null;
function warp(k, label) {
  if (!warpEl) { warpEl = h('div', { id: 'mk-warp', 'aria-hidden': 'true' }, h('p', {}, '')); document.body.appendChild(warpEl); }
  if (label !== undefined) warpEl.firstChild.textContent = label;
  warpEl.style.transition = 'none'; warpEl.style.opacity = String(k);
}
function warpTo(k, ms) { if (!warpEl) return; warpEl.style.transition = `opacity ${ms}ms ease`; warpEl.style.opacity = String(k); }
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
function crumbDate(iso) { const d = new Date(Date.parse(iso)); return Number.isFinite(d.getTime()) ? `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()} · ${String(d.getUTCHours()).padStart(2, '0')}:00 UTC` : ''; }

export default {
  id: 'sky',
  num: '①',
  label: '하늘',
  ownTitle: true,

  async render(el, c) {
    const st = c.state;
    activeMode = mode;
    if (mode === 'map') {
      try {
        const from = cameFrom; cameFrom = null;
        active = skymap;
        activeSite = st.site;
        return await skymap.render(el, c, {
          warp,
          from,
          open: (site, iso) => {
            mode = 'photo'; transit = 'in'; warp(1);
            c.set({ site, time: iso });               // a change re-renders through update()
            if (activeMode !== 'photo') c.rerender();   // nothing changed: draw the photograph anyway
          },
        });
      } catch (e) {
        console.warn('Map unavailable, showing the photograph:', e.message);
        skymap.unmount();
        el.replaceChildren();
        mode = activeMode = 'photo';
      }
    }
    const want3d = webgl2 && new URLSearchParams(location.search).get('view') !== '2d';
    if (want3d && !index) index = await c.use('scene3d/index.json');
    const sites = index ? index.data.sites : [];
    const site = st.site || sites[0] || 'cr1';
    activeSite = site;
    const toMap = () => {   // the path line over the headline: South Pole / site / landing time
      const cap = el.querySelector('.s3-caption'), sel = el.querySelector('#s3-site');
      if (!cap || !webgl2) return;
      const back = () => { warp(0, ''); warpTo(1, 320); setTimeout(() => { mode = 'map'; transit = 'out'; cameFrom = activeSite; c.rerender(); }, 340); };
      cap.prepend(h('p', { class: 's3-crumb' },
        h('button', { type: 'button', class: 's3-crumb-back', onclick: back }, '← ' + t('pm.crumb.map')), h('i', {}, '/'),
        h('b', {}, sel ? sel.options[sel.selectedIndex].textContent : site.toUpperCase()), h('i', {}, '/'),
        h('span', { id: 's3-crumb-date' }, t('pm.crumb.date', { date: crumbDate(c.state.time || '2026-11-17T12:00Z') }))));
    };
    if (want3d && sites.includes(site)) {
      try {
        active = sky3d;
        await sky3d.render(el, c, site);
        return toMap();
      } catch (e) {
        console.warn('3D scene unavailable, showing the 2D panorama:', e.message);
        sky3d.unmount();
        el.replaceChildren();
      }
    }
    active = sky2d;
    return sky2d.render(el, c);
  },
  mounted(s) {
    if (active && active.mounted) active.mounted(s);
    if (transit === 'in') { const st = document.querySelector('.s3-stage'); if (st) st.classList.add('arrive'); setTimeout(() => warpTo(0, 1100), 500); }
    else if (warpEl) setTimeout(() => warpTo(0, 800), 120);
    transit = null;
  },
  update(s, changed) {
    if (mode !== activeMode) return 'rerender';
    if (mode === 'map') return skymap.update(s, changed);
    if (changed.site && s.site !== activeSite) return 'rerender';   // the new site may or may not have a 3D scene
    if (changed.time) { const cd = document.querySelector('#s3-crumb-date'); if (cd) cd.textContent = t('pm.crumb.date', { date: crumbDate(s.time) }); }
    return active && active.update ? active.update(s, changed) : 'rerender';
  },
  unmount() { if (active && active.unmount) active.unmount(); active = null; },
};
