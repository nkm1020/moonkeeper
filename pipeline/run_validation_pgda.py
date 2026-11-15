"""Compare our long-term Sun/Earth visibility with the NASA PGDA maps at the validation points.

Usage:
  python pipeline/run_validation_pgda.py --points data/points/validation_points_n150_seed42.csv \
      --horizons data/inputs/validation_horizons.json --pgda data/derived/pgda_at_validation_points.csv \
      --subpoints data/derived/subpoints_2010_2028_6h.npz [--nhf data/inputs/validation_horizons_nhf.json]
"""
import argparse
import csv
import sys
from pathlib import Path

import numpy as np
import matplotlib
matplotlib.use("Agg")

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
META = [ROOT / "data" / "project_meta.json", ROOT / "data" / "calc_meta.json"]
from moonkeeper_b import ephem, horizons_io, stats, validation, io_utils  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--points", required=True)
ap.add_argument("--horizons", required=True)
ap.add_argument("--pgda", required=True)
ap.add_argument("--subpoints", required=True)
ap.add_argument("--nhf", help="optional NHF horizons for the same points")
ap.add_argument("--variant", default="auto", help="auto | 0m | mast (which horizon layer to use)")
ap.add_argument("--out", default=str(ROOT / "data" / "outputs"))
a = ap.parse_args()

pts = list(csv.DictReader(open(a.points)))
pg = {r["point_id"]: r for r in csv.DictReader(open(a.pgda))}
z = np.load(a.subpoints)
sp = {k: (z[k].astype("datetime64[s]") if k == "times" else z[k]) for k in z.files}
sun, earth = ephem.body_positions(sp)


def long_term(hz):
    pos = {pid: i for i, pid in enumerate(hz["point_id"])}
    s_out, e_out = [], []
    for r in pts:
        if r["point_id"] not in pos:
            s_out.append(np.nan); e_out.append(np.nan); continue
        sf, ev = ephem.visibility(float(r["lat_deg"]), float(r["lon_east_deg"]), hz["az_deg"],
                                  hz["horizon_el"][pos[r["point_id"]]], sun, earth,
                                  height_m=hz["observer_height_m"], earth_rule="any_part")
        # PGDA label: share of time steps lit by ANY fraction of the solar disc
        s_out.append(float(np.mean(sf > 0))); e_out.append(ev.mean())
    return np.array(s_out), np.array(e_out)


hz = horizons_io.load_point_horizons(a.horizons, a.variant)
ours_s, ours_e = long_term(hz)
pg_s = np.array([float(pg[r["point_id"]]["pgda_sun_frac"]) for r in pts])
pg_e = np.array([float(pg[r["point_id"]]["pgda_earth_frac"]) for r in pts])
res = {"horizon_layer": hz["layer"], "quantity_sun": "share of time steps with any part of the solar disc above the horizon (PGDA definition)",
       "quantity_earth": "share of time steps with any part of Earth's disc above the horizon",
       "observer_height_m": hz["observer_height_m"], "n_times": int(len(sp["times"])),
       "period_utc": [str(sp["times"][0]), str(sp["times"][-1])],
       "sun": stats.agreement(pg_s, ours_s), "earth": stats.agreement(pg_e, ours_e)}
points = [{"point_id": r["point_id"], "lat_deg": float(r["lat_deg"]), "lon_east_deg": float(r["lon_east_deg"]),
           "ours_sun": s, "pgda_sun": ps, "ours_earth": e, "pgda_earth": pe}
          for r, s, ps, e, pe in zip(pts, ours_s, pg_s, ours_e, pg_e)]

if a.nhf:
    nhf = horizons_io.load_point_horizons(a.nhf)
    pos_e, pos_n = {p: i for i, p in enumerate(hz["point_id"])}, {p: i for i, p in enumerate(nhf["point_id"])}
    common = [r["point_id"] for r in pts if r["point_id"] in pos_e and r["point_id"] in pos_n]
    he = hz["horizon_el"][[pos_e[p] for p in common]]
    hn = np.array([np.interp(hz["az_deg"], np.r_[nhf["az_deg"], 360.0], np.r_[row, row[0]])
                   for row in nhf["horizon_el"][[pos_n[p] for p in common]]])
    nhf_s, nhf_e = long_term(nhf)
    res["nhf_horizon_layer"] = nhf["layer"]
    res["nhf_horizon_error_deg"] = stats.summarize(np.sqrt(np.mean((hn - he) ** 2, axis=1)))
    res["nhf_sun_vs_pgda"] = stats.agreement(pg_s, nhf_s)
    res["nhf_earth_vs_pgda"] = stats.agreement(pg_e, nhf_e)
    res["nhf_sun_vs_precise"] = stats.agreement(ours_s, nhf_s)
    res["nhf_earth_vs_precise"] = stats.agreement(ours_e, nhf_e)
    for p, s, e in zip(points, nhf_s, nhf_e):
        p["nhf_sun"], p["nhf_earth"] = s, e

out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
fig, st = validation.plot_scatter_and_bland_altman(pg_s, ours_s, label="share of time Sun visible (any part)", ref_name="PGDA", our_name="Ours")
fig.savefig(out / "validation_pgda_sun.png", dpi=120)
fig, st = validation.plot_scatter_and_bland_altman(pg_e, ours_e, label="average Earth visibility", ref_name="PGDA", our_name="Ours")
fig.savefig(out / "validation_pgda_earth.png", dpi=120)
io_utils.save_json(out / "validation.json", {"pgda": {"summary": res, "points": points}},
                   meta_path=META, decimals=5,
                   reference="Mazarico et al. (2011), LOLA polar illumination maps, NASA PGDA")
print({k: (round(v["rmse"], 4), round(v["bias"], 4), round(v["pearson_r"], 3)) for k, v in res.items() if isinstance(v, dict) and "rmse" in v})
