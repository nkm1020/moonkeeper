// 상태 색 규칙 (구조 v2 "색 규칙 통일"): 모든 화면이 같은 색을 써요.
// 색은 "무엇 때문에 그런 답인지"를 뜻해요. 해(전력) = 호박색, 지구(교신) = 하늘색이라서
// 화면 ①의 해·지구 색과 화면 ②·③의 실패 원인 색이 같아요.
//
// CSS: 표시 var(--ok) var(--power) var(--comm) var(--approach) var(--other)
//      알약 배경·글자 var(--power-bg) / var(--power-ink) …   클래스 .st-ok .st-power …
import { t } from './i18n.js';
import { h } from './dom.js';

export const STATUS = ['ok', 'power', 'comm', 'approach', 'other'];

export function statusLabel(id) {
  return t('st.' + id);
}

// 범례 한 줄: 색 점 + 이름
export function statusLegend(ids = STATUS) {
  return h('ul', { class: 'st-legend' }, ids.map((id) => h('li', {}, h('i', { class: `st-dot st-${id}` }), statusLabel(id))));
}
