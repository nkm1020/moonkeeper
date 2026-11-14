"""Coordinate lists to send to the horizon/visibility owner.

  validation: area-uniform random points between lat_min and lat_max (south)
  grid:       points within radius of a target, for the ghost-lander Monte Carlo

Usage:
  python pipeline/make_point_lists.py validation --n 150 --lat-min -90 --lat-max -85.2 --seed 42
  python pipeline/make_point_lists.py grid --lat -89.47 --lon -137.41 --radius 800 --spacing 40 --name SITE_A
"""
import argparse
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "pipeline"))
META = [ROOT / "data" / "project_meta.json", ROOT / "data" / "calc_meta.json"]
from moonkeeper_b import geo  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]


def write(path, header, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)
    print(f"{len(rows)} points -> {path}")


ap = argparse.ArgumentParser()
sub = ap.add_subparsers(dest="kind", required=True)
v = sub.add_parser("validation")
v.add_argument("--n", type=int, default=150)
v.add_argument("--lat-min", type=float, default=-90.0)
v.add_argument("--lat-max", type=float, default=-85.2)
v.add_argument("--seed", type=int, default=42)
g = sub.add_parser("grid")
g.add_argument("--lat", type=float, required=True)
g.add_argument("--lon", type=float, required=True, help="east-positive degrees")
g.add_argument("--radius", type=float, default=800.0)
g.add_argument("--spacing", type=float, default=40.0)
g.add_argument("--name", default="TARGET")
a = ap.parse_args()

if a.kind == "validation":
    lat, lon = geo.area_uniform_cap(a.n, a.lat_min, a.lat_max, seed=a.seed)
    rows = [(f"V{i:03d}", f"{la:.6f}", f"{lo:.6f}") for i, (la, lo) in enumerate(zip(lat, lon))]
    write(ROOT / "data" / "points" / f"validation_points_n{a.n}_seed{a.seed}.csv",
          ["point_id", "lat_deg", "lon_east_deg"], rows)
else:
    e, n, lat, lon = geo.grid_around(a.lat, a.lon, a.radius, a.spacing)
    rows = [(f"G{i:04d}", f"{la:.6f}", f"{lo:.6f}", f"{ee:.1f}", f"{nn:.1f}")
            for i, (la, lo, ee, nn) in enumerate(zip(lat, lon, e, n))]
    write(ROOT / "data" / "points" / f"grid_{a.name}_r{int(a.radius)}_s{int(a.spacing)}.csv",
          ["point_id", "lat_deg", "lon_east_deg", "east_m", "north_m"], rows)
