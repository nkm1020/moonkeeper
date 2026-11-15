"""Download only the rows of NASA LOLA LDEM_875S_5M (south pole, 5 m/px, to 87.5 S) around one site.

The full file is 1.84 GB; the server takes byte ranges, so we fetch the rows that cover +-HALF_KM around the site
(about 98 MB for +-4 km) into data/raw/ (ignored by git). Sites north of 87.5 S are not covered by this map.

    python3 pipeline/fetch_lola5m.py cr1
"""
import json
import math
import sys
import urllib.request
from pathlib import Path

URL = "https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/LDEM_875S_5M.IMG"
N, OFF, SCALE, RECORD = 30336, 15167.5, 5.0, 60672      # from LDEM_875S_5M.LBL
R = 1737400.0
HALF_KM = 4.0
ROOT = Path(__file__).resolve().parent.parent


def site_lat_lon(site):
    meta = json.load(open(ROOT / "data" / "project_meta.json"))
    for s in meta["sites"]:
        if s["id"] == site:
            return s["lat"], s["lon_east"]
    raise SystemExit(f"unknown site {site}")


def to_sample_line(lat, lon):
    rho = 2 * R * math.tan(math.pi / 4 + math.radians(lat) / 2)
    x, y = rho * math.sin(math.radians(lon)), rho * math.cos(math.radians(lon))
    return OFF + x / SCALE, OFF - y / SCALE          # line grows toward -y (pipeline/terrain.py LINE_SIGN = -1)


def main(site):
    lat, lon = site_lat_lon(site)
    if lat > -87.5:
        raise SystemExit(f"{site} is at {lat} deg, outside the 5 m map (87.5 S to the pole)")
    s, l = to_sample_line(lat, lon)
    half = int(HALF_KM * 1000 / SCALE)
    l0, l1 = int(round(l)) - half - 4, int(round(l)) + half + 4
    for old in (ROOT / "data" / "raw").glob(f"lola5m_{site}_rows_*.i16"):
        a0, a1 = (int(x) for x in old.stem.split("_")[-2:])
        if a0 <= int(round(l)) - half and a1 >= int(round(l)) + half and old.stat().st_size == (a1 - a0 + 1) * RECORD:
            print("already here:", old.name)
            return
    out = ROOT / "data" / "raw" / f"lola5m_{site}_rows_{l0}_{l1}.i16"
    req = urllib.request.Request(URL, headers={"Range": f"bytes={l0 * RECORD}-{(l1 + 1) * RECORD - 1}"})
    print(f"{site}: rows {l0}-{l1}, {(l1 - l0 + 1) * RECORD / 1e6:.1f} MB")
    with urllib.request.urlopen(req, timeout=900) as r, open(out, "wb") as f:
        while True:
            b = r.read(1 << 20)
            if not b:
                break
            f.write(b)
    print("saved", out)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "cr1")
