"""Ghost landers for one site and landing time, from grid-point horizon masks.

Usage:
  python pipeline/run_ghost_landers.py --site im2 --landing 2027-03-15T12:00 \
      --grid data/points/grid_im2_r800_s80.csv --horizons data/inputs/grid_horizons_im2.json \
      --inputs data/inputs [--n 1000] [--sigma-along 100 --sigma-cross 100] [--heading auto]
Sun/Earth directions come from one Horizons series for the mission window (cached to data/derived).
Approach lighting uses the site value for that landing date (same for all grid points).
"""
import argparse
import csv
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
META = [ROOT / "data" / "project_meta.json", ROOT / "data" / "calc_meta.json"]
from moonkeeper_b import ephem, horizons_io, inputs, metrics, montecarlo, io_utils  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--site", required=True)
ap.add_argument("--landing", required=True, help="UTC, e.g. 2027-03-15T12:00")
ap.add_argument("--grid", required=True)
ap.add_argument("--horizons", required=True)
ap.add_argument("--inputs", default=str(ROOT / "data" / "inputs"))
ap.add_argument("--criteria", default=str(ROOT / "data" / "criteria.json"))
ap.add_argument("--n", type=int, default=1000)
ap.add_argument("--sigma-along", type=float)
ap.add_argument("--sigma-cross", type=float)
ap.add_argument("--heading", default="auto", help="deg from north the lander flies in from, or 'auto' (best approach azimuth)")
ap.add_argument("--seed", type=int, default=0)
ap.add_argument("--subpoints", help="optional cached npz from ephem.fetch_subpoints")
ap.add_argument("--out", default=str(ROOT / "data" / "outputs"))
a = ap.parse_args()

# criteria
cp = Path(a.criteria)
if cp.exists():
    raw = json.loads(cp.read_text())
    criteria = {k: (v["metric"], v["kind"], float(v["limit"])) for k, v in raw["criteria"].items()}
    status = raw.get("status", "sourced")
    D_days = float(raw.get("mission_duration_days", 14))
    le = raw.get("landing_error_m", {})
else:
    criteria = dict(metrics.EXAMPLE_CRITERIA, approach=("approach", "min", 0.5))
    status, D_days, le = "provisional: example assumptions, not mission requirements", 14.0, {}
sig_a = a.sigma_along if a.sigma_along is not None else float(le.get("sigma_along", 100))
sig_c = a.sigma_cross if a.sigma_cross is not None else float(le.get("sigma_cross", 100))

# grid + horizons
rows = list(csv.DictReader(open(a.grid)))
hz = horizons_io.load_point_horizons(a.horizons, "mast")   # observer at mast height, not ground level
pos = {pid: i for i, pid in enumerate(hz["point_id"])}
missing = [r["point_id"] for r in rows if r["point_id"] not in pos]
if missing:
    raise SystemExit(f"{len(missing)} grid points have no horizon (e.g. {missing[:3]})")
lat = np.array([float(r["lat_deg"]) for r in rows]); lon = np.array([float(r["lon_east_deg"]) for r in rows])
east = np.array([float(r["east_m"]) for r in rows]); north = np.array([float(r["north_m"]) for r in rows])
H = hz["horizon_el"][[pos[r["point_id"]] for r in rows]]

# Sun/Earth for the mission window
t0 = np.datetime64(a.landing, "s")
t1 = t0 + np.timedelta64(int(D_days * 24), "h")
if a.subpoints:
    z = np.load(a.subpoints)
    sp = {k: (z[k].astype("datetime64[s]") if k == "times" else z[k]) for k in z.files}
    keep = (sp["times"] >= t0) & (sp["times"] < t1)
    sp = {k: v[keep] for k, v in sp.items()}
else:
    cache = ROOT / "data" / "derived" / f"subpoints_{str(t0)[:13].replace(':', '')}_{int(D_days)}d.npz"
    if cache.exists():
        z = np.load(cache)
        sp = {k: (z[k].astype("datetime64[s]") if k == "times" else z[k]) for k in z.files}
    else:
        sp = ephem.fetch_subpoints(str(t0), str(t1 - np.timedelta64(1, "h")), step="1h")
        cache.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(cache, **{k: (v.astype(str) if k == "times" else v) for k, v in sp.items()})
sun, earth = ephem.body_positions(sp)
mast = float(hz["observer_height_m"])

# visibility per grid point (earth rule: any part of the disc, as in the site inputs)
SF = np.empty((len(rows), len(sp["times"]))); EV = np.empty_like(SF)
for i in range(len(rows)):
    SF[i], EV[i] = ephem.visibility(lat[i], lon[i], hz["az_deg"], H[i], sun, earth, height_m=mast, earth_rule="any_part")
met = metrics.window_metrics(SF, EV, [0], SF.shape[1])

# approach: site value on that landing date
apr = inputs.load_approach(Path(a.inputs) / "approach.json")
si = apr["site_ids"].index(a.site)
di = int(np.argmin(np.abs(apr["landing_times"] - t0)))
app_val = float(apr["approach"][si, di])
heading = float(apr["best_az_deg"][si, di]) if a.heading == "auto" else float(a.heading)
ev = metrics.evaluate(met, criteria, extra={"approach": np.full((len(rows), 1), app_val)} if "approach" in [c[0] for c in criteria.values()] else None)
causes = metrics.fail_causes(criteria, ev["fails"])[:, 0]
passed = ev["passed"][:, 0]

mc = montecarlo.run(east, north, passed, causes, n=a.n, sigma_along_m=sig_a, sigma_cross_m=sig_c,
                    heading_deg=heading, seed=a.seed)
spread = montecarlo.seed_spread(n_repeats=10, grid_east=east, grid_north=north, grid_passed=passed,
                                grid_causes=causes, n=a.n, sigma_along_m=sig_a, sigma_cross_m=sig_c, heading_deg=heading)
out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
fname = out / f"ghost_landers_{a.site}_{str(t0)[:10].replace('-', '')}.json"
io_utils.save_json(fname, {
    "target_site": a.site, "landing_time_utc": str(t0), "duration_h": D_days * 24,
    "n": mc["n"], "k": mc["k"], "p": mc["p"], "ci95": [mc["ci_low"], mc["ci_high"]], "breakdown": mc["breakdown"],
    "sigma_along_m": sig_a, "sigma_cross_m": sig_c, "heading_deg": heading, "seed": a.seed,
    "outside_grid_frac": mc["outside_grid_frac"],
    "seed_check": {"p_std_10_seeds": spread["p_std"], "expected_std": spread["expected_std"]},
    "approach_site_value": app_val, "criteria": {k: {"metric": m, "kind": kd, "limit": lim} for k, (m, kd, lim) in criteria.items()},
    "criteria_status": status,
    "samples": {"east_m": mc["sample_east"], "north_m": mc["sample_north"], "status": mc["sample_status"]},
    "grid": {"point_id": [r["point_id"] for r in rows], "east_m": east, "north_m": north,
             "passed": passed, "fail_causes": causes, "metrics": {k: v[:, 0] for k, v in met.items()}},
}, meta_path=META, decimals=4, compact=True,
   sun_earth_source=(f"cached sub-point series {Path(a.subpoints).name}" if a.subpoints else "JPL Horizons sub-points, 1 h"),
   horizons_source=hz["meta"].get("made_by", "") + " " + str(hz["meta"].get("method", "")),
   dataset="real inputs; " + status)
print(f"{a.site} {t0}: p={mc['p']:.3f} 95% CI [{mc['ci_low']:.3f}, {mc['ci_high']:.3f}] breakdown={mc['breakdown']} -> {fname}")
