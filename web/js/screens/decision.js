// ⑤ 결정 카드
// 고른 착륙지·날짜, passed·overall_margin, 주요 metrics, 고른 Plan B, 성공 확률 p·ci95, 데이터 출처를 한 장에.
// TODO: heatmap.json · ghost_landers.json에서 고른 칸의 값 찾아 채우기

import { h } from '../dom.js';

export default {
  id: 'decision',
  num: '⑤',
  label: '결정 카드',

  async render(el, { state }) {
    const row = (k, v) => [h('dt', {}, k), h('dd', {}, v ?? '아직 안 고름')];
    el.append(
      h(
        'dl',
        { class: 'readout' },
        row('착륙지', state.site),
        row('착륙 시각 (UTC)', state.time),
        row('지연 일수', state.delay),
        row('Plan B', state.planb),
      ),
    );
  },
};
