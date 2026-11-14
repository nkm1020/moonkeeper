"""Synthetic stand-in series for development before real visibility data exist.

Not physical data. Never use these numbers in results.
"""
import numpy as np

SYNODIC_D = 29.530589
SIDEREAL_D = 27.321661


def dummy_series(n_sites=5, start="2027-01-01T00:00", days=120, step_h=1, seed=0):
    rng = np.random.default_rng(seed)
    times = np.arange(np.datetime64(start, "s"), np.datetime64(start, "s") + np.timedelta64(days * 24, "h"),
                      np.timedelta64(step_h, "h"))
    t_d = (times - times[0]) / np.timedelta64(1, "D")
    S = n_sites
    phase = rng.uniform(0, 2 * np.pi, (S, 1))
    horizon = rng.uniform(-1.6, 0.2, (S, 1))
    sun_el = 1.5 * np.sin(2 * np.pi * t_d[None, :] / SYNODIC_D + phase) + 0.3 * np.sin(2 * np.pi * t_d[None, :] / 365.25)
    d = np.clip((sun_el - horizon) / 0.27, -1, 1)
    sun_frac = 1 - (np.arccos(d) - d * np.sqrt(1 - d * d)) / np.pi
    e_phase = rng.uniform(0, 2 * np.pi, (S, 1))
    earth_el = 6.0 * np.sin(2 * np.pi * t_d[None, :] / SIDEREAL_D + e_phase)
    earth_vis = (earth_el > horizon + rng.uniform(-1, 1, (S, 1))).astype(float)
    return times, sun_frac, earth_vis


def dummy_grid_outcomes(radius_m=800, spacing_m=40, seed=0):
    """Fake pass/fail field around a target: a lit ridge band with a dark flank."""
    rng = np.random.default_rng(seed)
    k = int(radius_m // spacing_m)
    ax = np.arange(-k, k + 1) * spacing_m
    ee, nn = np.meshgrid(ax, ax)
    keep = np.hypot(ee, nn) <= radius_m
    e, n = ee[keep], nn[keep]
    ridge = np.abs(n - 0.3 * e) < 250 + rng.normal(0, 30, e.size)
    approach_ok = e > -500
    passed = ridge & approach_ok
    causes = np.where(passed, "", np.where(~ridge, "power", "approach")).astype(object)
    return e, n, passed, causes
