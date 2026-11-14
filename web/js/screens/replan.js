// ② 재계획 — 히트맵 + Plan B
// 데이터: outputs/heatmap.json, outputs/planb_candidates.json (표 3의 8) · 필드는 data/outputs/README.md
// TODO: 히트맵(칸 색 = overall_margin, fail_causes 아이콘), 칸 누르면 metrics·criteria,
//       Plan B 카드 2장(같은 곳에서 기다리기 / 같은 날 다른 곳), 없으면 "계산된 후보 없음"

import { h } from '../dom.js';

export default {
  id: 'replan',
  num: '②',
  label: '재계획',

  async render(el, { use, missing }) {
    const heat = await use('outputs/heatmap.json');
    const planb = await use('outputs/planb_candidates.json');
    const lacking = [!heat && 'outputs/heatmap.json', !planb && 'outputs/planb_candidates.json'].filter(Boolean);
    if (lacking.length) return missing(lacking);

    const d = heat.data;
    el.append(
      h(
        'p',
        { class: 'todo' },
        `히트맵 자리 · 착륙지 ${d.site_ids?.length ?? '?'}곳 × 착륙 시각 ${d.landing_times_utc?.length ?? '?'}개`,
      ),
    );
  },
};
