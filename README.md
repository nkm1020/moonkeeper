# Moonkeeper

발사가 밀려도 달 남극 "어디에, 언제 내릴지"를 다시 골라 주고, 그 답을 얼마나 믿을 수 있는지까지 보여 주는 착륙 재계획 웹서비스예요.
NASA Space Apps Challenge 2026 · Lunar Landing Site Navigator · Seoul

구조는 [웹서비스 구조 v2 (확정용)](https://app.notion.com/p/418ac4e043e880488d65f7cdc5871450)을 따라요.

① 하늘 파노라마 → ② 재계획 (히트맵 · Plan B) → ③ 신뢰도 (유령 착륙선) → ④ 설명·검증 → ⑤ 결정 카드

## 구성

계산은 전부 미리(Python) 해서 JSON으로 저장하고, 웹은 그 파일을 읽어서 그리기만 해요. 서버 없음, GitHub Pages로 배포.

```txt
moonkeeper/
├─ data/
│  ├─ project_meta.json  공통 meta (좌표계·시간·착륙지·출처)
│  ├─ points/            계산할 지점 목록 (현지)
│  ├─ inputs/            가시성 · 접근 경로 조명 · 파노라마 (강민), 지점별 지평선 (용휘)
│  ├─ outputs/           heatmap · planb_candidates · ghost_landers · 검증 (현지)
│  └─ raw/               LOLA DEM · Horizons 원본 (git 제외, 스크립트로 받기)
├─ pipeline/             계산 코드 (Python)
└─ web/                  index.html, style.css, js/screens/①~⑤
```

## 누가 어디에

| 담당 | 폴더 |
| --- | --- |
| 현지 (계산) | `data/points/`, `data/outputs/`, `pipeline/` 안 계산 코드 |
| 강민 | `data/inputs/` 가시성·접근 경로·파노라마, `web/js/screens/sky.js` |
| 용휘 (NHF) | `data/inputs/` 그리드·검증 지점 지평선, `pipeline/` 안 NHF 코드 |
| Keev | 판정 기준값 · Plan B 규칙 (파일 형식은 현지님과 맞추기) |
| 채원 | `web/style.css` 색·글꼴, 화면 레이아웃 |
| 미정 | `web/` 화면 구현 |

자기 폴더에서 작업하고, 올리기 전에 `git pull` 먼저 해 주세요.

## 공통 규칙

- 시간 UTC, 1시간 간격 (`2026-11-01T00:00Z` ~ `2028-12-31T23:00Z`)
- 위도·경도 °, 경도는 동경 + · 기준 반지름 1737.4 km · 좌표계 MEAN_ME · 마스트 2 m
- 결과 JSON은 모두 `{"meta": {...}, "data": {...}}`, `meta`는 `data/project_meta.json` 기준
- 가짜 데이터는 `*_dummy.json`으로 저장 → 화면에 "가짜 데이터" 배지가 떠요. 진짜 파일이 생기면 웹이 자동으로 그쪽을 읽어요
- 웹은 판정·확률 계산을 하지 않아요 (시각 찾기, 단위 바꾸기만)

파일별 필드: [`data/inputs/FORMAT.md`](data/inputs/FORMAT.md), [`data/outputs/README.md`](data/outputs/README.md)

## 실행

```bash
python3 -m http.server 8000
```

→ http://localhost:8000/web/ (파일을 더블클릭해서 열면 JSON을 못 읽어요)

## 데이터 다시 만들기

```bash
pip install -r requirements.txt
python3 pipeline/fetch_lola.py          # LOLA 극지 DEM (~230 MB)
python3 pipeline/fetch_horizons.py      # JPL Horizons
python3 pipeline/make_inputs.py         # → data/inputs/
python3 pipeline/check_inputs.py
python3 pipeline/write_project_meta.py  # → data/project_meta.json
```

## 데이터 출처

- NASA LRO LOLA GDR 극지 DEM `LDEM_85S_40M`, `LDEM_80S_80M` (PDS `LRO-L-LOLA-4-GDR-V1.0`)
- NASA/JPL Horizons API (DE441)
- NASA PGDA 장기 일조 · 지구 가시 지도 `AVGVISIB_85S_060M_201608`, `AVGVISIB_85S_060M_201608_EARTH` (Mazarico et al. 2011, https://pgda.gsfc.nasa.gov/products/69)

## AI 사용 기록

Space Apps 규정상 AI 사용을 밝혀야 해요. 쓴 사람이 한 줄씩 추가해 주세요.

- 강민: `pipeline/` 입력 파일 계산 코드와 이 레포 뼈대를 Claude Code로 작성 (대회 중)
- 용휘: `pipeline/make_grid_horizons.py`와 `pipeline/nhf_*.py` (그리드 정밀 지평선, NHF 학습·추론 코드)를 Claude Code로 작성 (대회 중)
- 현지: `pipeline/moonkeeper_b/`, `pipeline/run_*.py`와 노트북 (히트맵·Plan B·유령 착륙선·검증 계산 코드)을 Claude로 작성 (대회 중)

---

**EN** · Landing replanning for the lunar south pole: when a launch slips, pick where and when to land again, and show how far to trust that answer. All computation is precomputed in Python into `data/` JSON; `web/` only renders it (static, GitHub Pages). Run `python3 -m http.server 8000` and open `/web/`. Conventions: UTC hourly, east-positive longitude, MEAN_ME, R = 1737.4 km, every file is `{meta, data}`, fake files are named `*_dummy.json`.
