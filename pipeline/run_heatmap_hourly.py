"""The site verdicts of heatmap.json for every landing HOUR, not only the daily 12:00 UTC landing.

Same inputs and code as run_heatmap.py (visibility.json, approach.json, criteria.json, moonkeeper_b.metrics):
the 14-day window metrics and the assumed criteria, for a landing at every hour of the time grid whose window
fits in the data. Approach lighting exists once a day (the 12:00 UTC landing), so each hour uses the value of its
UTC date. At 12:00 UTC the result is the same as heatmap.json (checked below, stored in meta.check).
Output: data/outputs/heatmap_hourly.json
  margin[site][hour]  overall margin (3 decimals), hour k = t0_utc + k hours
  fail[site]          one digit per hour: 0 = passes, else 1 power + 2 comm + 4 approach
Run:  python pipeline/run_heatmap_hourly.py      (numpy + scipy)
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
from moonkeeper_b import inputs, metrics  # noqa: E402

INP, OUT = ROOT / "data" / "inputs", ROOT / "data" / "outputs"
vis = inputs.load_visibility(INP / "visibility.json")
apr = inputs.load_approach(INP / "approach.json")
raw = json.loads((ROOT / "data" / "criteria.json").read_text(encoding="utf-8"))
criteria = {k: (v["metric"], v["kind"], float(v["limit"])) for k, v in raw["criteria"].items()}
D = int(float(raw.get("mission_duration_days", 14)) * 24)
sites = vis["site_ids"]
times = np.asarray(vis["times"], dtype="datetime64[s]")
n = len(times) - D + 1                                   # landing hours whose window fits in the data
approach_daily = inputs.align_sites(sites, apr["site_ids"], apr["approach"])          # [site, date]
day_of_hour = np.searchsorted(apr["landing_times"].astype("datetime64[D]"), times[:n].astype("datetime64[D]"))
day_of_hour = np.clip(day_of_hour, 0, approach_daily.shape[1] - 1)
approach = approach_daily[:, day_of_hour]                                              # [site, hour]

met = metrics.window_metrics(vis["sun_frac"], vis["earth_vis"], np.arange(n), D)
ev = metrics.evaluate(met, criteria, extra={"approach": approach})
causes = metrics.fail_causes(criteria, ev["fails"])
BIT = {"power": 1, "comm": 2, "approach": 4}
fail = ["".join(str(sum(BIT.get(c, 0) for c in s.split(",") if c)) for s in row) for row in causes]
margin = np.round(ev["overall_margin"], 3)

# the 12:00 UTC landings against heatmap.json
hm = json.loads((OUT / "heatmap.json").read_text(encoding="utf-8"))["data"]
lt = np.array([s[:16] for s in hm["landing_times_utc"]], dtype="datetime64[s]")
k = np.searchsorted(times, lt)
same_pass, max_dm, cells = 0, 0.0, 0
for i, sid in enumerate(hm["site_ids"]):
    s = sites.index(sid)
    for j, kk in enumerate(k):
        if hm["passed"][i][j] is None or kk >= n:
            continue
        cells += 1
        same_pass += int((fail[s][kk] == "0") == bool(hm["passed"][i][j]))
        max_dm = max(max_dm, abs(float(margin[s, kk]) - float(hm["overall_margin"][i][j])))
check = dict(cells=cells, same_verdict=same_pass, max_margin_diff=round(max_dm, 4))
print("check vs heatmap.json at 12:00 UTC:", check)
assert same_pass == cells, "the hourly table disagrees with heatmap.json at 12:00 UTC"

obj = {
    "meta": {
        "project": "Moonkeeper", "file": "heatmap_hourly.json", "dummy": False,
        "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"), "made_by": "강민",
        "what": "Site verdicts for a landing at every hour: overall margin and failing criteria of the 14-day mission.",
        "method": "pipeline/run_heatmap_hourly.py: the calculation of run_heatmap.py (moonkeeper_b.metrics) with a landing at every hour "
                  "of the grid. Approach lighting is computed once a day (12:00 UTC landing); each hour uses the value of its UTC date.",
        "limits": "Criteria are assumed values. The approach value is the daily one, so it does not follow the Sun within the day.",
        "criteria_status": raw.get("status", "assumed"),
        "check": dict(check, note="12:00 UTC landings compared with heatmap.json"),
        "si_use": "Code written with Claude Code (SI) during the event; inputs are NASA LOLA + JPL Horizons.",
    },
    "data": {"site_ids": sites, "t0_utc": str(times[0])[:16] + "Z", "step_h": 1, "n": int(n), "duration_h": D,
             "margin": [[None if np.isnan(v) else float(v) for v in row] for row in margin], "fail": fail},
}
p = OUT / "heatmap_hourly.json"
p.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"-> {p}  {p.stat().st_size / 1e3:.0f} kB, {n} landing hours x {len(sites)} sites")
