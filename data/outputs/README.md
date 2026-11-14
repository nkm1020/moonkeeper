# data/outputs · 계산 결과 (현지)

구조 v2 표 3의 8번이에요. 화면 ②~⑤가 이 파일을 읽어요. 모두 `{"meta": {...}, "data": {...}}` 형태이고 `meta`는 `data/project_meta.json`과 `data/calc_meta.json`(AI 사용 표기·참고문헌)에서 가져와요.

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

그 밖에 `target_site`, `landing_time_utc`, `duration_h`, `criteria`, `criteria_status`, `approach_site_value`, `seed_check`(시드 10개 표준편차 vs 이론값)도 있어요. `grid`에는 `point_id`, 칸별 `metrics`도 들어 있어요.

지금 파일은 im2, 2028-02-05 12:00 UTC 착륙 1건이에요. 이 날은 착륙지 중심은 통과하지만 전력 여유가 2%뿐이라, 착륙 오차가 결과를 바꾸는 예시예요. 계산 스크립트는 `ghost_landers_<site>_<YYYYMMDD>.json`으로 저장하고, 화면에 띄울 1건을 `ghost_landers.json`으로 복사해요.

## `validation.json` → 화면 ④

`data.pgda` 아래에 있어요. NASA PGDA 장기 가시성 지도(60 m)와 우리 계산을 무작위 150개 지점에서 비교한 결과예요.

| 필드 | 뜻 |
| --- | --- |
| `summary.sun`, `summary.earth` | `n`, `bias`, `sd_diff`, `rmse`, `mae`, `pearson_r`, `spearman_rho`, `loa_low`·`loa_high` (Bland-Altman 95% 일치 한계) |
| `summary.horizon_layer`, `observer_height_m` | 비교에 쓴 지평선 (지면 0 m) |
| `summary.period_utc`, `n_times` | 비교 기간 (18.6년), 시각 수 |
| `points` | 지점별 `point_id`, `lat_deg`, `lon_east_deg`, `ours_sun`, `pgda_sun`, `ours_earth`, `pgda_earth` |

그림: `validation_pgda_sun.png`, `validation_pgda_earth.png` (산점도 + Bland-Altman). NHF 비교는 용휘님 검증 지평선이 오면 `data.nhf`로 추가할 예정이에요.

## 기타

- `heatmap.png`, `ghost_landers_im2.png`: 확인용 그림
- 기준값이 Keev 확정값이 아니면 `criteria_status`가 `provisional`이에요. `data/criteria.json`이 생기면 다시 계산해요.
