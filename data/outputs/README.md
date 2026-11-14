# data/outputs · 계산 결과 (현지)

구조 v2 표 3의 8번이에요. 화면 ②~⑤가 이 파일을 읽어요. 모두 `{"meta": {...}, "data": {...}}` 형태이고 `meta`는 `data/project_meta.json`에서 가져와요.

웹은 진짜 파일(`heatmap.json`)을 먼저 찾고, 없으면 가짜 파일(`heatmap_dummy.json`)을 써요. 가짜 파일을 쓰는 동안은 화면에 "가짜 데이터" 배지가 떠요.

## `heatmap.json` → 화면 ②

| 필드 | 뜻 |
| --- | --- |
| `site_ids`, `site_latlon` | 세로축 착륙지 |
| `landing_times_utc` | 가로축 착륙 시각 |
| `overall_margin` | 칸 색. 0보다 크면 모든 기준 통과 |
| `passed` | 통과 표시 |
| `fail_causes` | 실패 원인 `power`·`comm`·`approach` (여러 개면 쉼표) |
| `metrics` | `sun_mean`, `longest_dark_h`, `first_sunset_h`, `comm_frac`, `longest_comm_gap_h` |
| `criteria`, `duration_h` | 기준값 (Keev), 임무 기간 |

## `planb_candidates.json` → 화면 ②

`from_site`·`from_date`·`delay_days`로 항목을 찾고 `delayed_date`를 보여 줘요. 없으면 "계산된 후보 없음".

| 필드 | 뜻 |
| --- | --- |
| `same_site_later_date` | 같은 곳에서 기다리기: `date`, `wait_days`, `margin` |
| `same_date_other_sites` | 같은 날 다른 곳: `site`, `margin`, `distance_km` 목록 |

## `ghost_landers.json` → 화면 ③

| 필드 | 뜻 |
| --- | --- |
| `p`, `ci95[lo, hi]`, `n`, `k` | 성공 확률과 95% 구간, 시행 수 |
| `breakdown` | 원인별 비율 `ok`, `power`, `approach`, `comm`, `other` |
| `grid` | 배경 칸: `east_m`, `north_m`, `passed`, `fail_causes` |
| `samples` | 점: `east_m`, `north_m`, `status` |
| `sigma_along_m`, `sigma_cross_m`, `heading_deg`, `seed` | 조건 |
| `outside_grid_frac` | 0보다 크면 "일부 착륙선이 계산 범위 밖" 경고 |

착륙지·날짜 조합별 파일 이름 규칙은 아직 안 정했어요 (구조 v2 7번).

## 검증 결과 → 화면 ④

형식 아직 안 정했어요 (구조 v2 7번): 지점별 우리 값·NHF 값·PGDA 값·오차, 전체 요약.
