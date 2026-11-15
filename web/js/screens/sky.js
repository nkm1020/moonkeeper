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
        active = skymap;
        activeSite = st.site;
        return await skymap.render(el, c, {
          open: (site, iso) => {
            mode = 'photo';
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
    const toMap = () => {
      if (!webgl2) return;
      const pick = el.querySelector('.s3-pick');
      if (pick) pick.prepend(h('button', { class: 's3-map', type: 'button', onclick: () => { mode = 'map'; c.rerender(); } }, '← ' + t('pm.map')));
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
  mounted(s) { if (active && active.mounted) active.mounted(s); },
  update(s, changed) {
    if (mode !== activeMode) return 'rerender';
    if (mode === 'map') return skymap.update(s, changed);
    if (changed.site && s.site !== activeSite) return 'rerender';   // the new site may or may not have a 3D scene
    return active && active.update ? active.update(s, changed) : 'rerender';
  },
  unmount() { if (active && active.unmount) active.unmount(); active = null; },
};
