"""Heatmap + Plan B candidates from the real visibility / approach inputs.

Usage: python pipeline/run_heatmap.py INPUT_DIR [--duration-days 14] [--delays 1 3 7 14] [--out data/outputs]
Thresholds are read from criteria.json if present; otherwise the example assumptions are used
and the output is marked "provisional". The mission duration comes from --duration-days, else
mission_duration_days in criteria.json (as in run_ghost_landers.py), else 14 days.
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
META = [ROOT / "data" / "project_meta.json", ROOT / "data" / "calc_meta.json"]
from moonkeeper_b import inputs, metrics, io_utils  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("input_dir")
ap.add_argument("--duration-days", type=float, default=None,
                help="default: mission_duration_days in criteria.json, else 14")
ap.add_argument("--delays", type=float, nargs="+", default=[1, 3, 7])
ap.add_argument("--criteria", default=str(ROOT / "data" / "criteria.json"))
ap.add_argument("--out", default=str(ROOT / "data" / "outputs"))
ap.add_argument("--exclude", nargs="*", default=[], help="site ids to leave out, e.g. --exclude crx")
a = ap.parse_args()

vis = inputs.load_visibility(Path(a.input_dir) / "visibility.json")
apr = inputs.load_approach(Path(a.input_dir) / "approach.json")
keep = [i for i, sid in enumerate(vis["site_ids"]) if sid not in a.exclude]
for k in ("lat", "lon_east", "sun_frac", "earth_vis"):
    vis[k] = vis[k][keep]
vis["site_names"] = [vis["site_names"][i] for i in keep] if vis["site_names"] else None
vis["site_ids"] = [vis["site_ids"][i] for i in keep]
sites = vis["site_ids"]
approach = inputs.align_sites(sites, apr["site_ids"], apr["approach"])

crit_path = Path(a.criteria)
if crit_path.exists():
    raw = json.loads(crit_path.read_text())
    criteria = {k: (v["metric"], v["kind"], float(v["limit"])) for k, v in raw["criteria"].items()}
    criteria_status = raw.get("status", "sourced")
    criteria_sources = {k: v.get("source", "assumption") for k, v in raw["criteria"].items()}
    D_days = float(raw.get("mission_duration_days", 14))
else:
    criteria = dict(metrics.EXAMPLE_CRITERIA, approach=("approach", "min", 0.5))
    criteria_status = "provisional: example assumptions, not mission requirements"
    criteria_sources = {k: "assumption" for k in criteria}
    D_days = 14.0
if a.duration_days is not None:
    D_days = a.duration_days

D_h = D_days * 24
tab = metrics.heatmap(vis["sun_frac"], vis["earth_vis"], vis["times"], sites, apr["landing_times"],
                      D_h, criteria, extra={"approach": approach})
out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
latlon = [(float(la), float(lo)) for la, lo in zip(vis["lat"], vis["lon_east"])]
inputs_meta = {"visibility": {k: vis["meta"].get(k) for k in ("version", "generated_utc", "made_by", "mast_m", "terrain", "ephemeris", "rules")},
               "approach": {k: apr["meta"].get(k) for k in ("version", "generated_utc", "made_by", "rules", "landing_hour_utc")}}

io_utils.save_json(out / "heatmap.json", {
    "site_ids": sites, "site_names": vis["site_names"], "site_latlon": latlon,
    "landing_times_utc": tab["landing_times"].astype(str), "duration_h": D_h,
    "criteria": {k: {"metric": m, "kind": kd, "limit": lim, "source": criteria_sources[k]} for k, (m, kd, lim) in criteria.items()},
    "criteria_status": criteria_status,
    "overall_margin": tab["overall_margin"], "passed": tab["passed"], "fail_causes": tab["causes"],
    "metrics": tab["metrics"], "approach": approach,
}, meta_path=META, decimals=4, compact=True, inputs=inputs_meta,
   dataset="real inputs; " + criteria_status)

valid = ~np.isnan(tab["overall_margin"][0])
plans = []
for s in range(len(sites)):
    for d in np.flatnonzero(valid):
        for delay in a.delays:
            pb = metrics.plan_b(tab, s, int(d), delay, site_latlon=latlon)
            dd = pb["delayed_date_idx"]
            if dd is None or not valid[dd]:
                continue
            ss = pb["same_site"]
            cands = [] if ss is None else [dict(
                type="same_site", eligible=True, margin=ss["margin"], wait_days=ss["wait_days"], distance_km=0.0,
                out={"date": str(tab["landing_times"][ss["date_idx"]]), "wait_days": ss["wait_days"], "margin": ss["margin"]})]
            cands += [dict(type="other_site", eligible=True, margin=r["margin"], wait_days=0.0, distance_km=r["distance_km"],
                           out={"site": sites[r["site_idx"]], "margin": r["margin"], "distance_km": r["distance_km"]})
                      for r in pb["same_day"]]
            for c in metrics.rank_candidates(cands):   # rank across both card types
                c["out"]["rank"] = c["rank"]
                if c["review_required"]:
                    c["out"]["review_required"] = True
            plans.append({
                "from_site": sites[s], "from_date": str(tab["landing_times"][d]), "delay_days": delay,
                "delayed_date": str(tab["landing_times"][dd]),
                "delayed_date_passed": bool(tab["passed"][s, dd]),
                "delayed_date_fail_causes": tab["causes"][s, dd],
                "same_site_later_date": cands[0]["out"] if ss is not None else None,
                "same_date_other_sites": sorted((c["out"] for c in cands if c["type"] == "other_site"), key=lambda o: o["rank"]),
            })
planb_meta = dict(meta_path=META, decimals=3, compact=True, dataset="real inputs; " + criteria_status,
                  delays_days=a.delays,
                  ranking=("rank: one order across both card types (same site later date, other sites on the delayed date): "
                           "eligible only, margin high first, then waiting time, then distance (Plan B rule by Keev)"))
io_utils.save_json(out / "planb_candidates.json", plans, **planb_meta)

# console summary
print("criteria:", criteria_status)
print(f"{'site':6} pass% (of valid dates)  causes among failures")
for s, sid in enumerate(sites):
    p = tab["passed"][s, valid]
    c = tab["causes"][s, valid][~p]
    from collections import Counter
    cnt = Counter(x for cc in c for x in cc.split(",") if x)
    print(f"{sid:6} {100 * p.mean():5.1f}%   {dict(cnt)}")
print(len(plans), "Plan B entries ->", out)
