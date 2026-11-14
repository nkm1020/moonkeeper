"""Re-planning heatmap: window metrics, pass/fail criteria, and Plan B search.

Inputs are hourly (or any fixed step) time series per site:
  sun_frac[s, t]  fraction of the solar disc above the terrain horizon (0..1)
  earth_vis[s, t] 1 if Earth is above the terrain horizon, else 0
"""
import numpy as np

from .stats import longest_run, first_true
from .geo import great_circle_m

METRIC_KEYS = ("sun_mean", "longest_dark_h", "first_sunset_h",
               "comm_frac", "longest_comm_gap_h")

# Example assumptions only. Replace with sourced values agreed by the team.
EXAMPLE_CRITERIA = {
    "power_mean":    ("sun_mean", "min", 0.50),
    "power_dark":    ("longest_dark_h", "max", 96.0),
    "comm_frac":     ("comm_frac", "min", 0.40),
    "comm_gap":      ("longest_comm_gap_h", "max", 240.0),
}

# Which criteria count as which failure cause (used for colours / breakdowns).
CAUSE_OF = {"sun_mean": "power", "longest_dark_h": "power", "first_sunset_h": "power",
            "comm_frac": "comm", "longest_comm_gap_h": "comm", "approach": "approach"}


def _as_2d(a):
    a = np.asarray(a, dtype=float)
    return a[None, :] if a.ndim == 1 else a


def window_metrics(sun_frac, earth_vis, start_idx, duration_steps,
                   step_h=1.0, dark_threshold=0.5):
    """Metrics for every (site, start) window [start, start + duration).

    Returns a dict of arrays shaped (n_sites, n_starts). Windows that run past the
    end of the series, or contain NaN, are NaN.
    """
    sf, ev = _as_2d(sun_frac), _as_2d(earth_vis)
    S, T = sf.shape
    starts = np.atleast_1d(np.asarray(start_idx, dtype=int))
    D = int(duration_steps)
    out = {k: np.full((S, starts.size), np.nan) for k in METRIC_KEYS}

    cs_sun = np.concatenate([np.zeros((S, 1)), np.cumsum(np.nan_to_num(sf), axis=1)], axis=1)
    cs_ev = np.concatenate([np.zeros((S, 1)), np.cumsum(np.nan_to_num(ev), axis=1)], axis=1)
    cs_nan = np.concatenate([np.zeros((S, 1)),
                             np.cumsum(np.isnan(sf) | np.isnan(ev), axis=1)], axis=1)

    for j, t0 in enumerate(starts):
        t1 = t0 + D
        if t0 < 0 or t1 > T:
            continue
        bad = (cs_nan[:, t1] - cs_nan[:, t0]) > 0
        dark = sf[:, t0:t1] < dark_threshold
        nocomm = ev[:, t0:t1] < 0.5
        vals = dict(
            sun_mean=(cs_sun[:, t1] - cs_sun[:, t0]) / D,
            longest_dark_h=longest_run(dark) * step_h,
            first_sunset_h=first_true(dark) * step_h,
            comm_frac=(cs_ev[:, t1] - cs_ev[:, t0]) / D,
            longest_comm_gap_h=longest_run(nocomm) * step_h,
        )
        for k, v in vals.items():
            out[k][:, j] = np.where(bad, np.nan, v)
    return out


def evaluate(metrics, criteria, extra=None):
    """Apply pass/fail criteria.

    criteria: {name: (metric_key, "min"|"max", threshold)}
    extra:    optional {metric_key: array} merged into metrics (e.g. approach lighting)
    Returns margins per criterion, overall margin (minimum), passed flag, and fail masks.
    margin > 0 means the criterion is met with that relative headroom.
    """
    m = dict(metrics)
    if extra:
        m.update({k: np.asarray(v, dtype=float) for k, v in extra.items()})
    margins, fails = {}, {}
    for name, (key, kind, thr) in criteria.items():
        v = m[key]
        scale = abs(thr) if thr != 0 else 1.0
        mg = (v - thr) / scale if kind == "min" else (thr - v) / scale
        margins[name] = mg
        fails[name] = ~(mg >= 0)
    stack = np.stack(list(margins.values()))
    overall = np.min(stack, axis=0)
    passed = np.all(stack >= 0, axis=0)
    return dict(margins=margins, overall_margin=overall, passed=passed, fails=fails)


def fail_causes(criteria, fails):
    """Set of cause labels ('power', 'comm', 'approach') failing per cell, as strings."""
    names = list(criteria)
    shape = fails[names[0]].shape
    out = np.empty(shape, dtype=object)
    for idx in np.ndindex(shape):
        causes = sorted({CAUSE_OF.get(criteria[n][0], n) for n in names if fails[n][idx]})
        out[idx] = ",".join(causes)
    return out


def heatmap(sun_frac, earth_vis, times, site_ids, landing_times, duration_h,
            criteria, step_h=1.0, dark_threshold=0.5, extra=None):
    """Build the site x landing-date table used by the heatmap and Plan B."""
    times = np.asarray(times, dtype="datetime64[s]")
    lt = np.asarray(landing_times, dtype="datetime64[s]")
    start_idx = np.searchsorted(times, lt)
    D = int(round(duration_h / step_h))
    met = window_metrics(sun_frac, earth_vis, start_idx, D, step_h, dark_threshold)
    ev = evaluate(met, criteria, extra)
    return dict(site_ids=list(site_ids), landing_times=lt, duration_h=duration_h,
                metrics=met, criteria=criteria, causes=fail_causes(criteria, ev["fails"]), **ev)


def plan_b(table, site_idx, date_idx, delay_days, site_latlon=None, rank="margin"):
    """Alternatives after a launch delay.

    same_site: first passing landing date at the same site on/after the delayed date.
    same_day:  passing sites on the delayed date, ranked by margin (default) or distance.
    """
    lt = table["landing_times"]
    passed, margin = table["passed"], table["overall_margin"]
    target = lt[date_idx] + np.timedelta64(int(round(delay_days * 86400)), "s")
    d0 = int(np.searchsorted(lt, target))
    res = dict(delayed_date_idx=d0 if d0 < len(lt) else None, same_site=None, same_day=[])
    if d0 >= len(lt):
        return res
    ok = np.flatnonzero(passed[site_idx, d0:])
    if ok.size:
        j = d0 + int(ok[0])
        res["same_site"] = dict(date_idx=j, wait_days=float((lt[j] - lt[d0]) / np.timedelta64(1, "D")),
                                margin=float(margin[site_idx, j]))
    cands = [s for s in np.flatnonzero(passed[:, d0]) if s != site_idx]
    rows = []
    for s in cands:
        dist = None
        if site_latlon is not None:
            (la0, lo0), (la1, lo1) = site_latlon[site_idx], site_latlon[s]
            dist = float(great_circle_m(la0, lo0, la1, lo1) / 1000.0)
        rows.append(dict(site_idx=int(s), margin=float(margin[s, d0]), distance_km=dist))
    if rank == "distance" and site_latlon is not None:
        rows.sort(key=lambda r: r["distance_km"])
    else:
        rows.sort(key=lambda r: -r["margin"])
    res["same_day"] = rows
    return res


def rank_candidates(cands):
    """Plan B ranking rule (Keev): only eligible candidates, then margin (high first),
    waiting time (short first), distance (short first). Missing values are flagged for review
    and placed after the complete ones."""
    keys = ("margin", "wait_days", "distance_km")
    ok = [c for c in cands if c.get("eligible")]
    for c in ok:
        c["review_required"] = any(c.get(k) is None for k in keys)
    ok.sort(key=lambda c: (c["review_required"], -(c["margin"] or 0), c["wait_days"] or 0, c["distance_km"] or 0))
    for i, c in enumerate(ok, 1):
        c["rank"] = i
    return ok

