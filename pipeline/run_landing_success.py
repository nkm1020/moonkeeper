"""Landing-scatter success probability for every candidate site and every landing date.

The same calculation as run_ghost_landers.py (현지's Monte Carlo, pipeline/moonkeeper_b), run for all sites and dates:
  1. an 80 m ground grid within 800 m of the site (geo.grid_around, as data/points/grid_im2_r800_s80.csv)
  2. the terrain horizon at each grid point, 360 azimuths, 2 m mast (terrain.horizon_mask, as make_grid_horizons.py);
     IM-2 reuses data/inputs/grid_horizons_im2.json
  3. hourly Sun disc fraction and Earth visibility at each point (ephem.visibility, cached Horizons sub-points)
  4. the 14-day window metrics and the assumed criteria per point and landing date (metrics.window_metrics / evaluate);
     approach lighting is the site value for that date, the same for all grid points
  5. 1,000 landers scattered with the assumed landing error (montecarlo.run, seed 0, heading = best approach azimuth)
Output: data/outputs/landing_success.json  p[site][date], Wilson 95% interval, share of grid points that pass.
Run:  python pipeline/run_landing_success.py [--sites cr1 sr1 ...] [--workers 8]      (numpy + scipy)
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

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
import terrain as tr  # noqa: E402
from moonkeeper_b import ephem, geo, horizons_io, inputs, metrics, montecarlo  # noqa: E402

RADIUS_M, SPACING_M, MAST_M, NAZ, N = 800.0, 80.0, 2.0, 360, 1000
_TER = None


def _init():
    global _TER
    _TER = tr.Terrain()


def _horizon(latlon):
    lat, lon = latlon
    gh = float(_TER.height(np.array([lat]), np.array([lon]))[0])
    return gh, tr.horizon_mask(_TER, lat, lon, gh + MAST_M, naz=NAZ)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sites", nargs="*")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "outputs" / "landing_success.json")
    a = ap.parse_args()
    t_start = time.time()

    hm = json.loads((ROOT / "data" / "outputs" / "heatmap.json").read_text(encoding="utf-8"))["data"]
    raw = json.loads((ROOT / "data" / "criteria.json").read_text(encoding="utf-8"))
    criteria = {k: (v["metric"], v["kind"], float(v["limit"])) for k, v in raw["criteria"].items()}
    D = int(float(raw.get("mission_duration_days", 14)) * 24)
    le = raw.get("landing_error_m", {})
    sig_a, sig_c = float(le.get("sigma_along", 100)), float(le.get("sigma_cross", 100))

    z = np.load(ROOT / "data" / "derived" / "subpoints_2026_2028_1h.npz")
    sp = {k: (z[k].astype("datetime64[s]") if k == "times" else z[k]) for k in z.files}
    sun, earth = ephem.body_positions(sp)
    land = np.array([s[:16] for s in hm["landing_times_utc"]], dtype="datetime64[s]")
    start = np.searchsorted(sp["times"], land)
    ok_date = (start + D <= len(sp["times"])) & (sp["times"][np.minimum(start, len(sp["times"]) - 1)] == land)
    apr = inputs.load_approach(ROOT / "data" / "inputs" / "approach.json")
    adi = np.array([int(np.argmin(np.abs(apr["landing_times"] - t))) for t in land])

    site_ids = a.sites or hm["site_ids"]
    res = {}
    for sid in site_ids:
        t0 = time.time()
        lat0, lon0 = hm["site_latlon"][hm["site_ids"].index(sid)]
        if sid == "im2":   # the grid and horizons the scatter map already uses
            rows = list(csv.DictReader(open(ROOT / "data" / "points" / "grid_im2_r800_s80.csv")))
            hz = horizons_io.load_point_horizons(ROOT / "data" / "inputs" / "grid_horizons_im2.json", "mast")
            pos = {pid: i for i, pid in enumerate(hz["point_id"])}
            lat = np.array([float(r["lat_deg"]) for r in rows]); lon = np.array([float(r["lon_east_deg"]) for r in rows])
            east = np.array([float(r["east_m"]) for r in rows]); north = np.array([float(r["north_m"]) for r in rows])
            H = hz["horizon_el"][[pos[r["point_id"]] for r in rows]]; az = hz["az_deg"]
        else:
            east, north, lat, lon = geo.grid_around(lat0, lon0, RADIUS_M, SPACING_M)
            with mp.get_context("spawn").Pool(a.workers, initializer=_init) as pool:
                got = pool.map(_horizon, list(zip(lat.tolist(), lon.tolist())), chunksize=4)
            assert not any(np.isnan(g) for g, _ in got), f"{sid}: a grid point is outside the DEMs"
            H = np.round(np.array([m for _, m in got]), 3); az = np.arange(NAZ) * 360.0 / NAZ
        P = len(lat)
        SF = np.empty((P, len(sp["times"]))); EV = np.empty_like(SF)
        for i in range(P):
            SF[i], EV[i] = ephem.visibility(lat[i], lon[i], az, H[i], sun, earth, height_m=MAST_M, earth_rule="any_part")
        met = metrics.window_metrics(SF, EV, np.where(ok_date, start, -1), D)
        si = apr["site_ids"].index(sid)
        app = apr["approach"][si, adi]
        ev = metrics.evaluate(met, criteria, extra={"approach": np.broadcast_to(app, (P, len(land))).copy()})
        passed = ev["passed"] & ok_date[None, :]
        causes = metrics.fail_causes(criteria, ev["fails"])
        p = np.full(len(land), np.nan); lo = p.copy(); hi = p.copy(); share = p.copy()
        for d in np.where(ok_date)[0]:
            mc = montecarlo.run(east, north, passed[:, d], causes[:, d], n=N, sigma_along_m=sig_a, sigma_cross_m=sig_c,
                                heading_deg=float(apr["best_az_deg"][si, adi[d]]), seed=0)
            p[d], lo[d], hi[d], share[d] = mc["p"], mc["ci_low"], mc["ci_high"], passed[:, d].mean()
        res[sid] = dict(p=p, lo=lo, hi=hi, share=share, points=P)
        print(f"{sid}: {P} grid points, mean p {np.nanmean(p):.3f}, dates with p >= 0.9: {int(np.nansum(p >= 0.9))}, {time.time() - t0:.0f}s", flush=True)

    def arr(k, nd=3):
        return [[None if np.isnan(v) else round(float(v), nd) for v in res[s][k]] for s in site_ids]

    check = None
    if "im2" in res:   # the same case as data/outputs/ghost_landers.json
        g = json.loads((ROOT / "data" / "outputs" / "ghost_landers.json").read_text(encoding="utf-8"))["data"]
        d = int(np.where(land == np.datetime64(g["landing_time_utc"][:16], "s"))[0][0])
        check = dict(site="im2", landing_time_utc=g["landing_time_utc"][:16], p_ghost_landers_json=g["p"], p_this_file=round(float(res["im2"]["p"][d]), 3))
        print("check", check)
    obj = {
        "meta": {
            "project": "Moonkeeper", "file": a.out.name, "dummy": False,
            "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"), "made_by": "강민",
            "what": "Share of 1,000 scattered landers whose touchdown point still passes the assumed power, comm and approach criteria "
                    "for the 14-day mission, for each candidate site and landing date. Not the probability of a safe touchdown.",
            "method": "pipeline/run_landing_success.py: the calculation of run_ghost_landers.py (pipeline/moonkeeper_b) for all sites and dates. "
                      f"Ground grid {SPACING_M:.0f} m within {RADIUS_M:.0f} m of the site; horizon per grid point from NASA LOLA (terrain.py, 360 azimuths, "
                      f"{MAST_M:.0f} m mast); hourly Sun disc fraction and Earth visibility (any part of the disc); approach lighting = the site value for that date; "
                      f"Gaussian landing error {sig_a:.0f} m along x {sig_c:.0f} m cross track, heading = best approach azimuth, seed 0; Wilson 95% interval.",
            "limits": "The landing error (sigma) and all criteria are assumed values, not mission requirements. One seed; the 80 m grid does not see smaller craters or boulders. "
                      "Slopes, hazards and guidance are not modelled: this is the lighting and Earth-contact risk of missing the target, not a full landing-success estimate.",
            "terrain": "NASA LRO LOLA GDR LDEM_85S_40M, LDEM_80S_80M (PDS)",
            "ephemeris": "NASA/JPL Horizons sub-solar and sub-Earth points, DE441, hourly (data/derived/subpoints_2026_2028_1h.npz)",
            "criteria_status": raw.get("status", "assumed"),
            "check": check,
            "si_use": "Code written with Claude Code (SI) during the event; data are NASA LOLA + JPL Horizons.",
        },
        "data": {
            "site_ids": site_ids, "landing_times_utc": hm["landing_times_utc"], "n": N,
            "sigma_along_m": sig_a, "sigma_cross_m": sig_c, "grid_radius_m": RADIUS_M, "grid_spacing_m": SPACING_M,
            "grid_points": [res[s]["points"] for s in site_ids],
            "p": arr("p"), "ci95_low": arr("lo"), "ci95_high": arr("hi"), "grid_pass_share": arr("share"),
        },
    }
    a.out.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"-> {a.out}  {a.out.stat().st_size / 1e3:.0f} kB, {time.time() - t_start:.0f}s")


if __name__ == "__main__":
    main()
