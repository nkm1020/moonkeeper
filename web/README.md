# Moonkeeper web

정적 페이지예요. 계산은 전부 `pipeline/`에서 미리 해 두고, 웹은 `data/`의 파일을 읽어서 그리기만 해요.

## 실행

```bash
cd moonkeeper
python3 -m http.server 8000
```

→ http://localhost:8000/web/

파일을 더블클릭해서 열면 JSON을 못 읽어요. 반드시 `moonkeeper/` 폴더에서 서버를 띄워 주세요(웹이 `../data/`를 읽어요).

## 디자인

채원님 디자인 시스템(Figma `moonkeeper_design_system`)을 따라요: 라임 `#D8FA5C` + 차콜 `#101419`, Inter 굵은 글씨, 위쪽 단계 "01 Sky — 02 Replan — 03 Confidence — 04 Evidence — 05 Decision"(지금 단계는 라임 알약), 사진 위 밝은 카드. 색·글꼴 값은 `style.css`의 `:root`에 모여 있어요. 상태 색은 "색 + 이름"으로 같이 써요(전력 `#8A5400`, 교신 `#A3315B`, 접근로 `#7142AD`, 기타 `#5C6777`).

## 화면 ① 하늘 — 첫 화면: 언제, 어디에 내릴까 (`screens/skymap.js`)

처음 열면 달 남극(80°S~90°S)의 실제 지형 위에 답이 바로 보여요.

- 연두색: 그 날짜에 그 땅에 내리면 14일 임무가 전력·교신 기준(가정값)을 지켜요. 밝을수록 여유가 커요. 어두운 올리브색은 기준에 40% 안쪽으로 못 미치는 땅이에요. "안 되는 이유 보기"를 켜면 전력(갈색)·교신(자주색) 중 무엇 때문인지 칠해요.
- 날짜: 아래 띠를 끌거나 ▶로 재생해요(2026-11-01 ~ 2028-12-17, 하루 간격 778일). 날짜가 바뀌면 지형의 그림자도 그 날짜의 실제 해 방향으로 바뀌어요. 띠 위쪽은 "지도에서 통과하는 땅의 비율", 아래쪽 8줄은 착륙지 8곳의 통과 날짜예요.
- 오른쪽 카드: 그 날짜의 착륙지 8곳 순위(통과 여유 또는 실패 원인). 이 판정은 `data/outputs/heatmap.json`(40 m 지형, 접근로 포함) 그대로예요. 착륙지를 고르고 "지평선 보기"를 누르면 그 자리의 사진으로 가요. 사진에서 "← 지도"로 돌아와요.
- 계산은 전부 `pipeline/make_polar_map.py`가 미리 해요(`data/polar/`, 38 MB). 80 m 지형(NASA LOLA LDEM_80S_80M) 위에 320 m마다 한 점, 방향 144개의 지평선, 1시간 간격의 해 원반 비율·지구 보임, 착륙지 계산과 같은 기준. 화면에 보내는 1.28 km 칸은 그 안 16점 중 가장 좋은 점이에요. 접근로 조명은 지도에 없어요.
- 확인: 착륙지 8곳의 칸에서 지도 판정(전력 + 교신)이 40 m 착륙지 계산과 같은 날짜 비율은 im2 99%, shk 100%, sr1 98%, pole 97%, cr1 89%, gr1 87%, lp1 83%, mp1 68%예요(`polar.json`의 `check_vs_site_pipeline`). 지도의 점은 착륙지에서 최대 226 m 떨어져 있고 지형이 80 m라서, 좁은 능선 위(mp1, lp1)는 차이가 커요. 그래서 착륙지 판정은 지도가 아니라 착륙지 계산을 써요.
- 그림자: 브라우저가 같은 지형(400 m)에서 해 쪽으로 지평선을 따라가며 해 원반이 보이는 비율을 구해요(그리기용). 지형 높낮이는 3배로 그려요.
- 주소 옵션: `?view=photo`(사진부터), `?play=map`(날짜 재생으로 시작).

```bash
python3 pipeline/make_polar_map.py            # 지평선 약 4분 + 날짜 적분 약 3분 + 묶기 (numpy, Pillow 필요)
```

## 화면 ① 하늘 — "아직 찍히지 않은 사진" (`screens/sky3d.js`)

착륙 뒤 어느 한 시각을, 그 자리에서 찍은 사진처럼 보여 줘요. 제목 "Read the horizon." 아래에 그 시각의 한 줄 요약이 있고, 밝은 카드에 네 가지 답(보이는 해, 지구 보임, 해 질 때까지, 지구 질 때까지)이 있어요.

- 사진: `data/scene3d/<site>/`가 있는 착륙지는 실제 지형(LOLA 5 m·40 m·80 m) 위에 실제 해·지구(JPL Horizons)를 그려요. 빛은 해 하나, 합성 지형 없음. 땅의 그늘은 `sun_frac`과 같은 규칙(지평선 위로 보이는 해 원반 비율)으로 계산해요.
- 카메라: 기본은 착륙지 2.6 km 뒤, 240 m 위의 24 mm. 첫 장면의 해와 지구가 66° 안이면 둘 다, 아니면 해를 먼저 담아요(지구가 반만 잘리지 않게). 30일 내내 해가 안 드는 곳(shk 섀클턴 바닥)은 해 쪽 벽 9 km 위에서 해가 비추는 건너편 벽을 봐요. 그 30일 동안 지구와 스카이라인이 제목에 가리지 않도록 렌즈를 아래로 밀어요(시프트 렌즈처럼, 기울이지 않음). "착륙선 마스트, 망원"은 2 m 높이 280 mm로, 지평선은 그 착륙지의 `horizon_el`이라 해가 지는 시각이 데이터와 같아요.
- 지구: NASA Blue Marble(2002) 사진에 같은 해로 빛을 줘서 위상이 맞아요. 달을 향한 면은 시각으로 대략 맞췄어요(구름은 2002년 것).
- 아래 필름 띠(30일): 시간마다 마스트에서 해 쪽으로 1픽셀 세로줄, 지구 쪽으로 지구 전체가 들어가는 좁은 사진을 찍어 한 줄로 평균해요. 줄을 나란히 놓으면 한 달짜리 노출이 돼요: 해의 실은 능선에 가려질 때 끊기고, 지구의 실은 위상에 따라 어두워지고 능선 아래로 내려가면 사라져요. 띠는 열자마자 왼쪽부터 현상돼요.
- 가까운 지형: cr1·gr1·mp1·lp1은 NASA PGDA의 사진 기반 5 m 지형(SfS, LROC NAC 사진으로 LOLA를 보강)을 써요. 레이저 궤적 사이가 보간이 아니라 실제 작은 분화구예요. sr1·pole·shk는 LOLA 5 m, im2는 40 m예요.
- 보는 방법 3가지: "옆에서 받는 빛"(기본, 1.5 km 높이에서 비스듬히, 해는 화면 밖), "해를 마주 보고"(해와 지구가 화면 안), "착륙선 마스트, 망원".
- 현상된 장면: 옆빛 보기에서 띠 아래 흰 점이 있는 시각에 멈추면, 실시간 화면이 같은 지형·같은 해 방향·같은 카메라로 Blender Cycles가 경로 추적한 장면으로 바뀌어요(`data/renders/<site>/`). 그늘의 빛이 지형에서 실제로 반사된 빛이에요. 끌거나 재생하거나 카메라를 돌리면 실시간 화면으로 돌아가요.
- 2D 파노라마: 3D 파일이 없는 착륙지, WebGL2가 안 되는 브라우저, 또는 주소에 `?view=2d`를 붙이면 2D 파노라마를 보여 줘요.
- 조작: ▶ 또는 스페이스바로 30일 재생(해가 지고 뜨는 때는 느리게), 띠를 끌거나 ←/→(1시간)·PgUp/PgDn(1일)로 시간 이동, 사진을 끌어 둘러보기, "이 장면에 착륙 →"은 ② 재계획으로.
- 주소 옵션(영상·캡처용): `?h=56`(착륙 뒤 56시간 장면), `?play=1`(바로 재생), `?cam=mast`(마스트 망원으로 시작). 예: `/web/?h=56#step=sky&site=cr1&time=2026-11-17T12:00Z`
- 출처: 지형 NASA LOLA(PDS), 해·지구 JPL Horizons, 지구 겉모습 NASA Blue Marble(퍼블릭 도메인, `assets/CREDITS.md`). 화면 아래 "출처와 한계"에도 같은 내용이 있어요.

3D 장면은 8곳 모두 있어요(`data/scene3d/`, 합계 약 103 MB).

| 착륙지 | 가까운 지형 | 5 m와 40 m 차이(평균 / RMS) |
| --- | --- | --- |
| cr1, gr1, mp1, lp1 | NASA PGDA SfS 5 m(±6.5~7.5 km) + 40 m | 0.23/1.44, 0.15/1.38, 0.28/1.54, 0.30/1.55 m |
| sr1, pole, shk | LOLA 5 m(±4 km) + 40 m (SfS 지역 밖) | 0.20/1.85, −0.15/1.71, 0.12/1.56 m |
| im2 | LOLA 40 m | — |

im2(84.79°S)는 85°S보다 북쪽이지만 40 m 지도의 네모 모서리 안이에요. 그 자리의 40 m와 80 m 높이 차이는 평균 −0.07 m, RMS 1.17 m예요. 화면 아래 출처 줄의 해상도는 `scene.json`의 `inner.dem_m`를 그대로 보여 줘요.

사진 기반 지형과 경로 추적 장면 만들기:

```bash
python3 pipeline/fetch_sfs.py cr1 gr1 mp1 lp1          # NASA PGDA SfS 5 m, 곳당 50~80 MB → data/raw/sfs/ (Zenodo 10.5281/zenodo.17954508, CC BY 4.0)
python3 pipeline/make_scene3d.py --patch cr1           # 가까운 지형만 다시 만들기 (몇 초)
blender -b -P pipeline/render_blender.py -- --site cr1 --landing 2026-11-17T12:00Z --look_h 0 --cam side --hours 0,3,6 --outdir data/renders/cr1
python3 pipeline/make_render_index.py                  # → data/renders/index.json (웹이 읽는 목록)
```

Blender 5.x가 필요해요(M1 Pro에서 한 장에 약 20초). 장면은 SI로 생성한 이미지가 아니라 NASA 지형을 경로 추적한 계산 결과예요.

다시 만들기 (착륙지 하나에 약 8분, 결과 9~14 MB, 여러 곳을 동시에 돌려도 돼요):

```bash
python3 pipeline/fetch_lola5m.py sr1     # 87.5°S보다 극에 가까운 곳만: LOLA 5 m 중 그 줄만 약 98 MB → data/raw/
python3 pipeline/make_scene3d.py sr1     # → data/scene3d/sr1/, data/scene3d/index.json
python3 pipeline/make_scene3d.py --index # 여러 곳을 동시에 만들었으면 끝나고 목록을 다시 써요
```

## 공통 틀 (`js/`)

| 파일 | 하는 일 |
| --- | --- |
| `app.js` | 단계 표시 01~05, 화면 전환, 불러오는 중 / 데이터 없음 / DEMO DATA 배지 |
| `state.js` | 공유 상태 하나: `step, site, time, delay, planb` (URL 해시에 저장) |
| `data.js` | `data/` JSON 읽기 (진짜 → `_dummy` 순서) |
| `i18n.js` | 영어 기본 + 한국어, UTC 기본 + KST 보조 시각 표기 |
| `time.js` | 시간 격자 (2026-11-01T00:00Z부터 1시간 간격) |
| `status.js` | 상태 색 규칙: ok · power(해) · comm(지구) · approach · other |

새 화면은 `js/screens/<id>.js`의 `export default { id, num, label, render(el, ctx), update?, unmount? }`만 채우면 돼요. 자세한 규칙은 `app.js` 맨 위 주석에 있어요.

화면에서는 판정·확률을 계산하지 않아요(시각 찾기, 단위 바꾸기, 그리기만).
