"""The landing-scatter test of landing_success.json for a landing at every HOUR.

Same calculation as run_landing_success.py (grid, horizons, criteria, 1,000 landers, seed 0), with the 14-day window
starting at every hour of the time grid. Approach lighting and the approach heading exist once a day (12:00 UTC
landing), so each hour uses the values of its UTC date. At 12:00 UTC the result equals landing_success.json
(checked below, stored in meta.check).
Output: data/outputs/landing_success_hourly.json
  k[site][hour]   landers out of n that still meet the criteria, hour h = t0_utc + h hours
  ci95_low_by_k, ci95_high_by_k   Wilson 95% interval for each possible k (0..n)
Run:  python pipeline/run_landing_success_hourly.py [--workers 8]      (numpy + scipy)
"""
import argparse
import csv
import json
import multiprocessing as mp
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
import run_landing_success as rls  # noqa: E402  (grid radius, spacing, mast, horizon worker)
from moonkeeper_b import ephem, geo, horizons_io, inputs, metrics, montecarlo  # noqa: E402
from moonkeeper_b.stats import wilson_interval  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "outputs" / "landing_success_hourly.json")
    a = ap.parse_args()
    t_start = time.time()

    hm = json.loads((ROOT / "data" / "outputs" / "heatmap.json").read_text(encoding="utf-8"))["data"]
    raw = json.loads((ROOT / "data" / "criteria.json").read_text(encoding="utf-8"))
    criteria = {k: (v["metric"], v["kind"], float(v["limit"])) for k, v in raw["criteria"].items()}
    D = int(float(raw.get("mission_duration_days", 14)) * 24)
    le = raw.get("landing_error_m", {})
    sig_a, sig_c = float(le.get("sigma_along", 100)), float(le.get("sigma_cross", 100))
    N = rls.N

    z = np.load(ROOT / "data" / "derived" / "subpoints_2026_2028_1h.npz")
    sp = {k: (z[k].astype("datetime64[s]") if k == "times" else z[k]) for k in z.files}
    sun, earth = ephem.body_positions(sp)
    times = sp["times"]
    n = len(times) - D + 1
    apr = inputs.load_approach(ROOT / "data" / "inputs" / "approach.json")
    day = np.clip(np.searchsorted(apr["landing_times"].astype("datetime64[D]"), times[:n].astype("datetime64[D]")), 0, len(apr["landing_times"]) - 1)

    site_ids = hm["site_ids"]
    K = {}
    for sid in site_ids:
        t0 = time.time()
        lat0, lon0 = hm["site_latlon"][hm["site_ids"].index(sid)]
        if sid == "im2":
            rows = list(csv.DictReader(open(ROOT / "data" / "points" / "grid_im2_r800_s80.csv")))
            hz = horizons_io.load_point_horizons(ROOT / "data" / "inputs" / "grid_horizons_im2.json", "mast")
            pos = {pid: i for i, pid in enumerate(hz["point_id"])}
            lat = np.array([float(r["lat_deg"]) for r in rows]); lon = np.array([float(r["lon_east_deg"]) for r in rows])
            east = np.array([float(r["east_m"]) for r in rows]); north = np.array([float(r["north_m"]) for r in rows])
            H = hz["horizon_el"][[pos[r["point_id"]] for r in rows]]; az = hz["az_deg"]
        else:
            east, north, lat, lon = geo.grid_around(lat0, lon0, rls.RADIUS_M, rls.SPACING_M)
            with mp.get_context("spawn").Pool(a.workers, initializer=rls._init) as pool:
                got = pool.map(rls._horizon, list(zip(lat.tolist(), lon.tolist())), chunksize=4)
            H = np.round(np.array([m for _, m in got]), 3); az = np.arange(rls.NAZ) * 360.0 / rls.NAZ
        P = len(lat)
        SF = np.empty((P, len(times))); EV = np.empty_like(SF)
        for i in range(P):
            SF[i], EV[i] = ephem.visibility(lat[i], lon[i], az, H[i], sun, earth, height_m=rls.MAST_M, earth_rule="any_part")
        met = metrics.window_metrics(SF, EV, np.arange(n), D)
        si = apr["site_ids"].index(sid)
        ev = metrics.evaluate(met, criteria, extra={"approach": np.broadcast_to(apr["approach"][si, day], (P, n)).copy()})
        passed = ev["passed"]
        tree = cKDTree(np.c_[east, north])
        k = np.zeros(n, dtype=int)
        for dd in np.unique(day):   # one set of 1,000 scattered landers per approach heading (per date), as montecarlo.run draws them
            e, nn = montecarlo.sample_offsets(N, sig_a, sig_c, float(apr["best_az_deg"][si, dd]), 0)
            idx = tree.query(np.c_[e, nn])[1]
            hrs = np.flatnonzero(day == dd)
            k[hrs] = passed[idx][:, hrs].sum(axis=0)
        K[sid] = k
        print(f"{sid}: {P} grid points, mean p {k.mean() / N:.3f}, {time.time() - t0:.0f}s", flush=True)

    # the 12:00 UTC landings against landing_success.json
    ls = json.loads((ROOT / "data" / "outputs" / "landing_success.json").read_text(encoding="utf-8"))["data"]
    lt = np.array([s[:16] for s in ls["landing_times_utc"]], dtype="datetime64[s]")
    kk = np.searchsorted(times, lt)
    cells = same = 0
    for s, sid in enumerate(ls["site_ids"]):
        for j, h in enumerate(kk):
            if ls["p"][s][j] is None or h >= n:
                continue
            cells += 1; same += int(abs(K[sid][h] / N - ls["p"][s][j]) < 5e-4)
    check = dict(cells=cells, same_p=same, note="12:00 UTC landings compared with landing_success.json")
    print("check", check)
    assert same == cells, "the hourly scatter test disagrees with landing_success.json at 12:00 UTC"

    ci = [wilson_interval(q, N, 1.96) for q in range(N + 1)]
    obj = {
        "meta": {
            "project": "Moonkeeper", "file": a.out.name, "dummy": False,
            "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"), "made_by": "강민",
            "what": "Share of 1,000 scattered landers whose touchdown point still passes the assumed power, comm and approach criteria "
                    "for the 14-day mission, for each candidate site and a landing at every hour. Not the probability of a safe touchdown.",
            "method": "pipeline/run_landing_success_hourly.py: the calculation of run_landing_success.py with the mission window starting at every hour. "
                      "Approach lighting and the approach heading are the daily values of the landing's UTC date.",
            "limits": "The landing error (sigma) and all criteria are assumed values. Slopes, hazards and guidance are not modelled.",
            "criteria_status": raw.get("status", "assumed"), "check": check,
            "si_use": "Code written with Claude Code (SI) during the event; data are NASA LOLA + JPL Horizons.",
        },
        "data": {"site_ids": site_ids, "t0_utc": str(times[0])[:16] + "Z", "step_h": 1, "n_hours": int(n), "n": N,
                 "sigma_along_m": sig_a, "sigma_cross_m": sig_c,
                 "k": [K[s].tolist() for s in site_ids],
                 "ci95_low_by_k": [round(float(c[0]), 4) for c in ci], "ci95_high_by_k": [round(float(c[1]), 4) for c in ci]},
    }
    a.out.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"-> {a.out}  {a.out.stat().st_size / 1e3:.0f} kB, {time.time() - t_start:.0f}s")


if __name__ == "__main__":
    main()
