# 강민 → 현지 입력 파일 (v2 표 2·3·4번) · v1

NASA LOLA 극지 지형 + JPL Horizons로 계산했어요.

## 공통

- JSON, `{"meta": {...}, "data": {...}}` 형태예요. 출처·방법·한계는 `meta`에 다 적어 뒀어요.
- 시간: UTC, 1시간 간격, `2026-11-01T00:00Z` ~ `2028-12-31T23:00Z` (19,008개).
- 착륙지 8곳: `cr1, sr1, gr1, mp1, lp1, im2, pole, shk`
- 위도·경도: 도(°), 경도는 동경 + (east-positive). 기준 반지름 1737.4 km, MEAN_ME.
- 마스트 높이 2 m.

### 계산 방법

- 지형: LOLA `LDEM_85S_40M`(40 m) + `LDEM_80S_80M`(80 m). 40 m가 있는 곳은 40 m를 써요.
- 지평선: 방위 0.5°마다 대원을 따라가면서 지형이 가장 높이 보이는 각도를 구했어요. 달 곡률까지 3차원으로 계산했고, DEM이 끝나는 곳(약 80°S)까지 봐요.
- 해·지구 위치: JPL Horizons API(DE441)에서 착륙지 기준 방위·고도·겉보기 지름을 1시간마다 받았어요. 좌표계는 MEAN_ME예요.
- 판정 규칙: 해는 원반이 보이는 비율, 지구는 원반이 조금이라도 보이면 1.

### 확인한 것

- 방위 기준이 Horizons랑 8곳 모두 0.0001° 안으로 맞아요(극점 포함).
- 지도 방향 확인: 말라페르트 봉 +4,969 m, 섀클턴 바닥 −2,789 m

## 2. 착륙지 가시성 `visibility.json`

| 필드 | 모양 | 뜻 |
| --- | --- | --- |
| `site_ids`, `site_names` | [S] | 착륙지 id, 한글 이름 |
| `lat`, `lon_east`, `ground_h_m` | [S] | 좌표 (°), 지면 높이 (m, 1737.4 km 기준) |
| `times_utc` | [T] | 시각 |
| `sun_frac` | [S][T] | 해 원반이 지평선 위로 보이는 비율, 0~1 |
| `earth_vis` | [S][T] | 지구 원반이 조금이라도 보이면 1, 아니면 0 |

암흑은 `sun_frac < 0.5`로 보면 돼요.

## 3. 접근 경로 조명 `approach.json`

착륙 시각마다, 하강 카메라 아래 지면이 얼마나 밝은지예요. 착지점에서 진입 방향으로 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 10 km 떨어진 10개 지점을 봐요. 지점마다 지면 1 m 위에서 지평선을 따로 계산해서, 해 중심이 그 지평선 위에 있으면 밝은 걸로 셌어요.

| 필드 | 모양 | 뜻 |
| --- | --- | --- |
| `site_ids` | [S] | 착륙지 id |
| `landing_times_utc` | [D] | 착륙 시각, 하루 한 번 12:00 UTC (792일) |
| `approach_az_deg` | [8] | 진입 방위 0, 45, …, 315 (북=0, 동=90, 날아오는 방향) |
| `approach_by_az` | [S][D][8] | 방위별 밝은 지점 비율, 0~1 |
| `approach` | [S][D] | 8개 방위 중 가장 밝은 값, 0~1 |
| `best_az_deg` | [S][D] | 가장 밝은 진입 방위 |

합격선은 Keev 기준값으로 정하면 돼요. 8개 방위가 다 안 되면 실패예요.

## 4. 하늘 파노라마 `panorama_<site>.json` (착륙지마다 1개)

| 필드 | 모양 | 뜻 |
| --- | --- | --- |
| `site_id`, `name`, `lat`, `lon_east`, `ground_h_m` | | 착륙지 정보 |
| `horizon_el` | [360] | 방위 0~359°의 지평선 고도 (°), 1° 간격 |
| `sun_az`, `sun_el` | [T] | 해 방위·고도 (°) |
| `earth_az`, `earth_el` | [T] | 지구 방위·고도 (°) |
| `sun_radius_deg`, `earth_radius_deg` | | 원반 반지름 (°), 기간 평균 |

`times_utc`는 파일 크기 때문에 넣지 않았어요. i번째 값은 `visibility.json`의 `times_utc[i]`와 같은 시각이에요.

## 6. 검증 지점 지평선 `horizons_validation_n150_seed42.json`

`validation_points_n150_seed42.csv`의 150개 지점이에요. 착륙지만 보면 너무 적고 골라 뽑은 것처럼 보일 수 있어서, 남극 전체(85°S 이남)에서 무작위로 뽑았어요(seed 42). NASA PGDA 일조 지도와 비교하는 검증에 써요. 지평선 계산 방법은 위와 같아요.

| 필드 | 모양 | 뜻 |
| --- | --- | --- |
| `point_ids`, `lat`, `lon_east`, `ground_h_m` | [P] | 지점 id(V000~V149), 좌표 (°), 지면 높이 (m) |
| `az_step_deg`, `n_az` | | 0.5°, 720개 (k번째 값 = 방위 k × 0.5°) |
| `horizon_el` | [P][720] | 지면 2 m 위(마스트 높이)에서 본 지평선 고도 (°) |
| `horizon_el_0m` | [P][720] | 지면에서 본 지평선 고도 (°). PGDA 같은 지표 기준 지도랑 비교할 때 쓰면 돼요 |

2 m에서 본 지평선이 150개 지점, 모든 방위에서 0 m보다 낮거나 같아요(평균 0.28° 낮음).

## 요약 (2026-11 ~ 2028-12)

| 착륙지 | 해 (sun_frac ≥ 0.5) | 지구 보임 | 착지점 밝은 날 중 접근로 어두운 날 (approach < 0.5) |
| --- | --- | --- | --- |
| cr1 | 46.6% | 51.9% | 0 / 374 |
| sr1 | 76.4% | 54.0% | 129 / 608 |
| gr1 | 56.9% | 57.5% | 15 / 453 |
| mp1 | 71.5% | 63.7% | 12 / 567 |
| lp1 | 13.0% | 52.3% | 1 / 102 |
| im2 | 45.4% | 94.4% | 1 / 358 |
| pole | 27.2% | 33.5% | 164 / 212 |
| shk | 0.0% | 0.0% | 0 / 0 |


## 다시 만들기

```bash
python3 pipeline/fetch_horizons.py   # JPL Horizons
python3 pipeline/make_inputs.py      # LOLA DEM 필요: data/raw/LDEM_85S_40M.IMG, LDEM_80S_80M.IMG
python3 pipeline/check_inputs.py
python3 pipeline/make_validation_horizons.py   # 검증 지점: data/points/validation_points_n150_seed42.csv
```
