// ③ 신뢰도 — 유령 착륙선
// 데이터: outputs/ghost_landers.json (표 3의 8) · 필드는 data/outputs/README.md
// 파일 이름 규칙(착륙지·날짜 조합별)은 아직 안 정했어요 (구조 v2 7번).
// TODO: p·ci95 요약, breakdown, grid 배경 칸 + samples 점 지도 (east_m, north_m)

import { h } from '../dom.js';

export default {
  id: 'ghosts',
  num: '③',
  label: '신뢰도',

  async render(el, { use, missing }) {
    const g = await use('outputs/ghost_landers.json');
    if (!g) return missing(['outputs/ghost_landers.json']);

    const d = g.data;
    el.append(
      d.outside_grid_frac > 0 ? h('p', { class: 'warn' }, '일부 착륙선이 계산 범위 밖') : null,
      h('p', { class: 'todo' }, `유령 착륙선 지도 자리 · n = ${d.n ?? '?'}, k = ${d.k ?? '?'}`),
    );
  },
};
