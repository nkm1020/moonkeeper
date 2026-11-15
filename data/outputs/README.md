# data/outputs · 계산 결과 (현지)

구조 v2 표 3의 8번이에요. 화면 ②~⑤가 이 파일을 읽어요. 모두 `{"meta": {...}, "data": {...}}` 형태이고 `meta`는 `data/project_meta.json`과 `data/calc_meta.json`(SI 사용 표기·참고문헌)에서 가져와요.

웹은 진짜 파일(`heatmap.json`)을 먼저 찾고, 없으면 가짜 파일(`heatmap_dummy.json`)을 써요. 가짜 파일을 쓰는 동안은 화면에 "가짜 데이터" 배지가 떠요.

## `heatmap.json` → 화면 ②

| 필드 | 뜻 |
| --- | --- |
| `site_ids`, `site_latlon` | 세로축 착륙지 |
| `landing_times_utc` | 가로축 착륙 시각 |
| `overall_margin` | 칸 색. **0 이상**이면 모든 기준 통과 (`passed`와 같음). 기준값에 딱 맞은 칸은 0이에요 (예: 접근 경로 값이 0.1 단위라 0.5에 딱 걸리는 날) |
| `passed` | 통과 표시 |
| `fail_causes` | 실패 원인 `power`·`comm`·`approach` (여러 개면 쉼표) |
| `metrics` | `sun_mean`, `longest_dark_h`, `first_sunset_h`, `comm_frac`, `longest_comm_gap_h` |
| `criteria`, `duration_h` | 기준값 (Keev), 임무 기간 |

마지막 14일(2028-12-18 ~ 12-31)은 임무 기간이 데이터 끝(2028-12-31)을 넘어서 계산하지 않았어요. 이 칸은 `overall_margin`·`passed`·`metrics`가 `null`, `fail_causes`가 `""`예요 → 화면에 "계산 안 됨"으로 보여 주세요 (실패가 아니에요).

시각 문자열(`landing_times_utc`, `from_date`, `delayed_date`, `date`, `landing_time_utc`)은 UTC인데 끝에 `Z`가 없어요 (예: `2026-11-01T12:00:00`). JS `Date.parse`는 `Z`가 없으면 브라우저 현지 시각으로 읽으니, `s.slice(0, 16) + 'Z'`처럼 `Z`를 붙여서 읽어 주세요 (공유 상태 `time` 형식 `2026-11-01T12:00Z`와도 같아져요).

## `planb_candidates.json` → 화면 ②

`from_site`·`from_date`·`delay_days`로 항목을 찾고 `delayed_date`를 보여 줘요. 없으면 "계산된 후보 없음".

| 필드 | 뜻 |
| --- | --- |
| `delayed_date_passed` | 밀린 날짜에 원래 착륙지가 통과하는지 (`false`면 Plan B가 필요한 이유) |
| `delayed_date_fail_causes` | 밀린 날짜의 실패 원인 `power`·`comm`·`approach` |
| `same_site_later_date` | 카드 1 "같은 곳에서 기다리기": `date`, `wait_days`, `margin`, `rank` (없으면 `null`) |
| `same_date_other_sites` | 카드 2 "같은 날 다른 곳": `site`, `margin`, `distance_km`, `rank` 목록 (그날 통과하는 곳 전부, `rank` 순) |
| `rank` | 두 카드를 합친 추천 순서 (1이 1순위) |
| `review_required` | 값이 빠진 후보에만 `true` (추가 검토 필요) |

추천 순서 규칙 (Keev, `planb_rules.json`): 기준을 통과한 후보만 → 여유가 큰 순 → 여유가 같으면 기다리는 기간이 짧은 순 → 거리가 가까운 순. 여유는 소수 6자리에서 반올림해 비교해요. 두 카드 모두 후보가 없으면 Keev 규칙 문구 "No safe alternative found. Engineering review required."를 띄워요.

## `ghost_landers.json` → 화면 ③

| 필드 | 뜻 |
| --- | --- |
| `p`, `ci95[lo, hi]`, `n`, `k` | 성공 확률과 95% 구간, 시행 수 |
| `breakdown` | 원인별 비율 `ok`, `power`, `approach`, `comm`, `other` |
| `grid` | 배경 칸: `east_m`, `north_m`, `passed`, `fail_causes` |
| `samples` | 점: `east_m`, `north_m`, `status` |
| `sigma_along_m`, `sigma_cross_m`, `heading_deg`, `seed` | 조건. 지금은 두 sigma가 같아서(100 m) `heading_deg`를 바꿔도 결과가 같아요 |
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
| `summary.nhf_sun_vs_pgda`, `nhf_earth_vs_pgda` | NHF 지평선(용휘님)으로 계산한 값 vs PGDA (필드는 위와 같음) |
| `summary.nhf_sun_vs_precise`, `nhf_earth_vs_precise` | NHF로 계산한 값 vs 정밀 지평선으로 계산한 값 |
| `summary.nhf_horizon_error_deg` | 지점별 지평선 각도 차이(RMS, 도)의 요약: `median`, `p95`, `max`, `mean` |
| `points[].nhf_sun`, `nhf_earth` | 지점별 NHF 계산 값 |

그림: `validation_pgda_sun.png`, `validation_pgda_earth.png` (산점도 + Bland-Altman).

## `nhf_check.json` → 화면 ③·④ 참고

`data.ghost_landers_precise_vs_nhf`: 같은 착륙선 1,000대(같은 시드)를 정밀 지평선과 NHF 지평선에 각각 떨어뜨린 결과예요. im2가 통과하는 날짜 전부 (날짜별 한 줄).

`data.summary`: `n_dates`, `within_5pp`(두 확률 차이가 5%p 이내인 날 수), `nhf_higher_by_over_1pp`(NHF가 1%p 넘게 높은 날 수), 정밀 확률 0.9 이상/미만으로 나눈 같은 집계.

| 필드 | 뜻 |
| --- | --- |
| `landing_time_utc` | 착륙 시각 |
| `site_margin` | 그날 im2 중심의 가장 작은 여유 (전력·교신) |
| `p_precise`, `ci95_precise` | 정밀 지평선 성공 확률과 95% 범위 |
| `p_nhf`, `ci95_nhf` | NHF 지평선 성공 확률과 95% 범위 |
| `grid_points_same_result` | 격자 317곳 중 통과/실패가 같은 비율 |
| `landers_same_result` | 1,000대 중 결과가 같은 비율 |

## 기타

- `heatmap.png`, `ghost_landers_im2.png`: 확인용 그림
- `ghost_landers.json`은 정밀 지평선(`grid_horizons_im2.json`) 결과예요
- `criteria_status`는 `data/criteria.json`의 `status`예요. 지금은 `assumed`(Keev 조사로도 출처 있는 숫자가 없어 가정값)라서 화면에 "assumed"를 띄워요. 파일이 없으면 `provisional`이에요.

## `landing_success.json` → 화면 ①·③·⑤ (강민)

착륙지 8곳 × 착륙 날짜 778일에 대해, 착륙 지점이 흩어져도 가정한 기준(전력·교신·접근로)을 지키는 비율이에요. 안전하게 내려앉을 확률이 아니에요. `ghost_landers.json`과 같은 계산(`pipeline/moonkeeper_b`의 몬테카를로)을 모든 착륙지·날짜에 돌렸어요: `pipeline/run_landing_success.py`.

| 필드 | 뜻 |
| --- | --- |
| `site_ids`, `landing_times_utc` | 행(착륙지)과 열(착륙 시각, `heatmap.json`과 같은 순서) |
| `p` | 흩어진 모의 착륙선 `n`대(1,000대) 중 가정한 기준을 지키는 비율. 계산 안 한 날짜(마지막 14일)는 `null` |
| `ci95_low`, `ci95_high` | Wilson 95% 구간 |
| `grid_pass_share` | 착륙지 둘레 800 m 안 80 m 격자점 중 통과하는 점의 비율 |
| `sigma_along_m`, `sigma_cross_m` | 가정한 착륙 오차(1σ, `criteria.json`의 `landing_error_m`) |

확인: IM-2 2028-02-05의 값이 `ghost_landers.json`의 0.714와 같고(`meta.check`), IM-2의 97개 날짜가 `nhf_check.json`의 `p_precise`와 모두 같아요. 착륙 오차와 기준은 가정값이에요. 경사·장애물·유도 오차는 넣지 않았어요.

## `heatmap_hourly.json` → 화면 ① (강민)

`heatmap.json`과 같은 계산을 매시간 착륙(18,673개 시각)에 대해 한 표예요: `pipeline/run_heatmap_hourly.py`. 화면 ①에서 12:00 UTC가 아닌 착륙 시각을 고르면 이 파일을 읽어요.

| 필드 | 뜻 |
| --- | --- |
| `t0_utc`, `step_h`, `n` | k번째 값 = `t0_utc` + k시간에 착륙 |
| `margin[site][k]` | 종합 여유(소수 3자리) |
| `fail[site]` | 시각마다 한 글자: `0` 통과, 아니면 1 전력 + 2 교신 + 4 접근로 |

접근로 값은 하루에 한 번(12:00 착륙)만 있어서 그 날짜의 값을 써요. 12:00 UTC의 판정은 `heatmap.json`과 6,224칸 모두 같아요(`meta.check`).
