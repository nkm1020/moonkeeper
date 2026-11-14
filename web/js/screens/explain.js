// ④ 설명·검증
// 데이터: project_meta.json (출처), inputs/panorama_<site>.json (설명), 검증 결과 (형식 미정, 구조 v2 7번)
// TODO: 해가 지평선 아래로 내려가는 방위 짚기, 우리 계산 · NHF · PGDA 오차 표

import { h } from '../dom.js';

export default {
  id: 'explain',
  num: '④',
  label: '설명·검증',

  async render(el, { use, missing }) {
    const meta = await use('project_meta.json');
    if (!meta) return missing(['project_meta.json']);
    const m = meta.data;

    el.append(
      h('h2', {}, '데이터 출처'),
      h(
        'dl',
        { class: 'readout' },
        h('dt', {}, '지형'),
        h('dd', {}, m.terrain.source, h('br'), m.terrain.files.join(', ')),
        h('dt', {}, '천체력'),
        h('dd', {}, m.ephemeris.source),
        h('dt', {}, '좌표'),
        h('dd', {}, `${m.frame}, 반지름 ${m.ref_radius_km} km, 경도 동경 +`),
        h('dt', {}, '마스트 높이'),
        h('dd', {}, `${m.mast_m} m`),
        h('dt', {}, '시간'),
        h('dd', {}, `${m.time.scale}, ${m.time.step_h}시간 간격, ${m.time.t0_utc} 부터`),
      ),
      h('p', { class: 'todo' }, '검증 표 자리 · 결과 형식 정해지면 연결'),
    );
  },
};
