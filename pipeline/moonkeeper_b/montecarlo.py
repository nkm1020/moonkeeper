"""Landing-dispersion Monte Carlo ("ghost landers").

Grid outcomes (pass/fail per grid point around a target) are computed beforehand from
horizon masks + visibility; each sampled landing point takes the nearest grid point.
"""
import numpy as np
from scipy.spatial import cKDTree

from .stats import wilson_interval

CAUSE_PRIORITY = ("power", "approach", "comm")


def sample_offsets(n, sigma_along_m, sigma_cross_m, heading_deg=0.0, seed=0):
    """2-D Gaussian landing offsets (east, north) in metres.

    heading_deg: direction of the along-track axis, clockwise from north.
    """
    rng = np.random.default_rng(seed)
    a = rng.normal(0.0, sigma_along_m, n)
    c = rng.normal(0.0, sigma_cross_m, n)
    h = np.radians(heading_deg)
    east = a * np.sin(h) + c * np.cos(h)
    north = a * np.cos(h) - c * np.sin(h)
    return east, north


def sample_status(passed, causes):
    """Per-sample label: 'ok' or the highest-priority failing cause."""
    out = np.empty(len(passed), dtype=object)
    for i, (p, c) in enumerate(zip(passed, causes)):
        if p:
            out[i] = "ok"
            continue
        cs = set(str(c).split(",")) if c else set()
        out[i] = next((k for k in CAUSE_PRIORITY if k in cs), "other")
    return out


def run(grid_east, grid_north, grid_passed, grid_causes, n=1000,
        sigma_along_m=100.0, sigma_cross_m=100.0, heading_deg=0.0, seed=0,
        grid_radius_m=None, z=1.96):
    """Success probability with a Wilson interval and a failure breakdown."""
    ge, gn = np.asarray(grid_east, float), np.asarray(grid_north, float)
    gp = np.asarray(grid_passed, bool)
    gc = np.asarray(grid_causes, dtype=object)
    e, nn = sample_offsets(n, sigma_along_m, sigma_cross_m, heading_deg, seed)
    dist, idx = cKDTree(np.c_[ge, gn]).query(np.c_[e, nn])
    passed = gp[idx]
    k = int(passed.sum())
    lo, hi = wilson_interval(k, n, z)
    status = sample_status(passed, gc[idx])
    breakdown = {s: float(np.mean(status == s)) for s in ("ok",) + CAUSE_PRIORITY + ("other",)}
    if grid_radius_m is None:
        grid_radius_m = float(np.max(np.hypot(ge, gn)))
    outside = float(np.mean(np.hypot(e, nn) > grid_radius_m))
    return dict(n=n, k=k, p=k / n, ci_low=lo, ci_high=hi, breakdown=breakdown,
                outside_grid_frac=outside, sample_east=e, sample_north=nn,
                sample_grid_idx=idx, sample_status=status, seed=seed,
                sigma_along_m=sigma_along_m, sigma_cross_m=sigma_cross_m, heading_deg=heading_deg)


def seed_spread(n_repeats=10, **kw):
    """Spread of p across seeds vs. the binomial expectation sqrt(p(1-p)/n)."""
    ps = np.array([run(seed=s, **kw)["p"] for s in range(n_repeats)])
    n = kw.get("n", 1000)
    p = ps.mean()
    return dict(p_mean=float(p), p_std=float(ps.std(ddof=1)),
                expected_std=float(np.sqrt(p * (1 - p) / n)), ps=ps)
