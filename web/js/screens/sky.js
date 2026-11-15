// ① 하늘 · 강민
// 3D 장면 파일(data/scene3d/<site>/)이 있고 WebGL2가 되면 실제 지형 위에 서는 3D 장면을,
// 아니면 2D 파노라마를 보여 줘요. 어느 쪽이든 같은 공유 상태(site, time)를 읽고 써요.
// 주소에 ?view=2d 를 붙이면 2D 파노라마로 봐요.

import sky2d from './sky2d.js';
import sky3d from './sky3d.js';

const webgl2 = (() => { try { return !!document.createElement('canvas').getContext('webgl2'); } catch (e) { return false; } })();
let active = null;
let activeSite = null;   // the site the active view was drawn for
let index = null;   // data/scene3d/index.json: the sites that have a 3D scene

export default {
  id: 'sky',
  num: '①',
  label: '하늘 파노라마',
  ownTitle: true,

  async render(el, c) {
    const st = c.state;
    const want3d = webgl2 && new URLSearchParams(location.search).get('view') !== '2d';
    if (want3d && !index) index = await c.use('scene3d/index.json');
    const sites = index ? index.data.sites : [];
    const site = st.site || sites[0] || 'cr1';
    activeSite = site;
    if (want3d && sites.includes(site)) {
      try {
        active = sky3d;
        return await sky3d.render(el, c, site);
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
    if (changed.site && s.site !== activeSite) return 'rerender';   // the new site may or may not have a 3D scene
    return active && active.update ? active.update(s, changed) : 'rerender';
  },
  unmount() { if (active && active.unmount) active.unmount(); active = null; },
};
