"""v2 table row 5: precise horizons at 현지's ghost-lander grid around IM-2 (360 azimuths, 1 deg).

Input:  data/points/grid_im2_r800_s80.csv (point_id, lat_deg, lon_east_deg, east_m, north_m)
Output: data/inputs/grid_horizons_im2.json
  horizon_el  [P][360]  observer 2 m above ground (lander mast), azimuth k deg from each point's own north
Same ray casting as 강민's panoramas (pipeline/terrain.py), so the IM-2 centre point matches
panorama_im2.json. The NHF version of this file keeps the same format with meta.method = "NHF".
Run:  python3 pipeline/make_grid_horizons.py [--workers 4]
"""
import argparse
import csv
import json
import multiprocessing as mp
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import terrain as tr  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
POINTS = ROOT / "data" / "points" / "grid_im2_r800_s80.csv"
OUT = ROOT / "data" / "inputs" / "grid_horizons_im2.json"
MAST_M = 2.0
NAZ = 360

_TER = None


def _init_worker():
    global _TER
    _TER = tr.Terrain()


def _horizon(latlon):
    lat, lon = latlon
    la, lo = np.array([lat]), np.array([lon])
    gh = float(_TER.height(la, lo)[0])
    on_fine = bool(~np.isnan(_TER.fine.sample(la, lo, tr.Terrain.LINE_SIGN))[0])
    mask = tr.horizon_mask(_TER, lat, lon, gh + MAST_M, naz=NAZ)
    return gh, on_fine, mask


def frame_spread_deg(lat, lon, east, north):
    """How far the local frame drifts across the grid: plane tilt and turn of local north vs the centre."""
    c = int(np.argmin(np.hypot(east, north)))
    tilt = np.degrees(np.hypot(east - east[c], north - north[c]).max() / tr.R_M)
    turn = np.abs((lon - lon[c]) * np.sin(np.radians(-lat))).max()
    return c, tilt, turn


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, default=min(4, os.cpu_count() or 1))
    ap.add_argument("--limit", type=int, default=None, help="first N points only (for quick tests)")
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args()

    t0 = time.time()
    with open(POINTS, newline="") as fh:
        rows = list(csv.DictReader(fh))[: args.limit]
    ids = [r["point_id"] for r in rows]
    lat = np.array([float(r["lat_deg"]) for r in rows])
    lon = np.array([float(r["lon_east_deg"]) for r in rows])
    east = np.array([float(r["east_m"]) for r in rows])
    north = np.array([float(r["north_m"]) for r in rows])
    assert len(set(ids)) == len(ids) and np.all((lat >= -90) & (lat <= -80))

    gh, fine, hz = [], [], []
    with mp.get_context("spawn").Pool(args.workers, initializer=_init_worker) as pool:
        for i, (g, f, m) in enumerate(pool.imap(_horizon, zip(lat.tolist(), lon.tolist()), chunksize=2)):
            assert not np.isnan(g), f"{ids[i]} is outside the DEMs"
            gh.append(g)
            fine.append(f)
            hz.append(np.round(m, 3).tolist())
            if i % 25 == 0:
                print(f"  {i}/{len(ids)}  {time.time() - t0:.0f}s", flush=True)
    gh = np.array(gh)
    c, tilt, turn = frame_spread_deg(lat, lon, east, north)
    n_fine = int(sum(fine))

    obj = {
        "meta": {
            "project": "Moonkeeper", "file": OUT.name, "version": "v1", "dummy": False,
            "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"), "made_by": "용휘",
            "method": "precise",
            "method_note": "precise = ray casting with pipeline/terrain.py (same code and settings as 강민's "
                           "panoramas); NHF = neural horizon field, same format",
            "points_file": POINTS.name,
            "frame": "MEAN_ME", "ref_radius_km": 1737.4, "lon_convention": "east_positive",
            "az_convention": "from each point's own local north (along its meridian toward the equator) "
                             "toward east; index k = azimuth k*1 deg",
            "elevation": "deg above the observer's local horizontal plane (normal to the sphere radius), "
                         "lunar curvature included",
            "mast_m": MAST_M,
            "observer": "terrain height (bilinear) + mast_m",
            "terrain": {
                "source": "NASA LRO LOLA GDR polar DEMs (PDS, imbrium.mit.edu)",
                "files": ["LDEM_85S_40M.IMG (40 m/px, to 85S)", "LDEM_80S_80M.IMG (80 m/px, to 80S)"],
                "points_on_40m_dem": f"{n_fine}/{len(ids)}",
                "horizon_method": "max terrain elevation angle along great circles, exact 3-D sphere geometry "
                                  "(curvature included); 40 m steps to 20 km, 80 m steps beyond, up to 320 km; "
                                  "40 m DEM where it exists; rays stop where the DEMs end",
            },
            "sun_earth_note": f"Sun/Earth az/el in panorama_im2.json are for the grid centre {ids[c]}. For the "
                              "other points, re-project the Sun/Earth direction vectors into each point's own "
                              "local frame (as in the approach-path code of pipeline/make_inputs.py): across "
                              f"this grid the horizontal plane tilts by up to {tilt:.3f} deg and local north "
                              f"turns by up to {turn:.2f} deg.",
            "si_use": "Code written with Claude Code (AI) during the event; terrain is NASA LOLA.",
        },
        "data": {
            "point_ids": ids, "lat": lat.tolist(), "lon_east": lon.tolist(),
            "east_m": east.tolist(), "north_m": north.tolist(),
            "ground_h_m": np.round(gh, 1).tolist(),
            "az_step_deg": 360.0 / NAZ, "n_az": NAZ,
            "horizon_el": hz,
        },
    }
    args.out.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {args.out}  P={len(ids)}  on 40 m DEM {n_fine}/{len(ids)}  {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
