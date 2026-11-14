# data/raw (git에 안 올려요)

원본 파일이라 크기가 커서(230 MB+) `.gitignore`로 빼 뒀어요. 아래로 다시 받으면 돼요.

```bash
python3 pipeline/fetch_lola.py      # LOLA 극지 DEM 2개 (~230 MB)
python3 pipeline/fetch_horizons.py  # JPL Horizons 해·지구 방위·고도 → data/raw/horizons/
```
