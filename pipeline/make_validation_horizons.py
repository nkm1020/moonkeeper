"""v2 table row 6: precise horizons at 현지's validation points (720 azimuths, 0.5 deg).

Input:  data/points/validation_points_n150_seed42.csv (point_id, lat_deg, lon_east_deg)
Output: data/inputs/horizons_validation_n150_seed42.json
  horizon_el     [P][720]  observer 2 m above ground (project mast height)
  horizon_el_0m  [P][720]  observer on the ground (surface maps such as PGDA use this)
Run:  python3 pipeline/make_validation_horizons.py
"""
import csv
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import terrain as tr  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
NAME = "validation_points_n150_seed42"
POINTS = ROOT / "data" / "points" / f"{NAME}.csv"
OUT = ROOT / "data" / "inputs" / "horizons_validation_n150_seed42.json"
MAST_M = 2.0
NAZ = 720


def main():
    t0 = time.time()
    with open(POINTS, newline="") as fh:
        rows = list(csv.DictReader(fh))
    ids = [r["point_id"] for r in rows]
    lat = np.array([float(r["lat_deg"]) for r in rows])
    lon = np.array([float(r["lon_east_deg"]) for r in rows])
    assert len(set(ids)) == len(ids) and np.all((lat >= -90) & (lat <= -80))

    ter = tr.Terrain()
    gh = ter.height(lat, lon)
    assert not np.isnan(gh).any(), "a point is outside the DEMs"
    h2, h0 = [], []
    for i in range(len(ids)):
        h2.append(np.round(tr.horizon_mask(ter, lat[i], lon[i], gh[i] + MAST_M, naz=NAZ), 3).tolist())
        h0.append(np.round(tr.horizon_mask(ter, lat[i], lon[i], gh[i] + 0.0, naz=NAZ), 3).tolist())
        if i % 25 == 0:
            print(f"  {i}/{len(ids)}  {time.time() - t0:.0f}s", flush=True)

    obj = {
        "meta": {
            "project": "Moonkeeper", "file": OUT.name, "version": "v1", "dummy": False,
            "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"), "made_by": "강민",
            "points_file": POINTS.name,
            "frame": "MEAN_ME", "ref_radius_km": 1737.4, "lon_convention": "east_positive",
            "az_convention": "from north toward east; index k = azimuth k*0.5 deg",
            "mast_m": MAST_M,
            "terrain": {
                "source": "NASA LRO LOLA GDR polar DEMs (PDS, imbrium.mit.edu)",
                "files": ["LDEM_85S_40M.IMG (40 m/px, to 85S)", "LDEM_80S_80M.IMG (80 m/px, to 80S)"],
                "horizon_method": "max terrain elevation angle along great circles, exact 3-D sphere geometry "
                                  "(curvature included); 40 m steps to 20 km, 80 m steps beyond; "
                                  "rays stop where the DEMs end (about 80S)",
            },
            "si_use": "Code written with Claude Code (AI) during the event; terrain is NASA LOLA.",
        },
        "data": {
            "point_ids": ids, "lat": lat.tolist(), "lon_east": lon.tolist(),
            "ground_h_m": np.round(gh, 1).tolist(),
            "az_step_deg": 0.5, "n_az": NAZ,
            "horizon_el": h2, "horizon_el_0m": h0,
        },
    }
    OUT.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT}  P={len(ids)}  {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
