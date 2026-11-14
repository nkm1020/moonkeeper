import json
import numpy as np
import pytest

from moonkeeper_b import geo, stats, metrics, montecarlo, validation, dummy, io_utils


def test_wilson_known_values():
    lo, hi = stats.wilson_interval(0, 10)
    assert lo == 0.0 and abs(hi - 0.2775) < 1e-3
    lo, hi = stats.wilson_interval(50, 100)
    assert abs(lo - 0.4038) < 1e-3 and abs(hi - 0.5962) < 1e-3


def test_runs_and_first_true():
    m = np.array([[0, 1, 1, 0, 1, 1, 1, 0], [0, 0, 0, 0, 0, 0, 0, 0]], bool)
    assert stats.longest_run(m).tolist() == [3, 0]
    assert stats.first_true(m).tolist() == [1, 8]


def test_window_metrics_hand_example():
    sf = np.array([1, 1, 0.2, 0.2, 0.2, 1, 1, 1, 0.3, 1], float)
    ev = np.array([1, 0, 0, 1, 1, 1, 0, 0, 0, 1], float)
    m = metrics.window_metrics(sf, ev, [0], 10)
    assert m["longest_dark_h"][0, 0] == 3
    assert m["first_sunset_h"][0, 0] == 2
    assert np.isclose(m["sun_mean"][0, 0], sf.mean())
    assert np.isclose(m["comm_frac"][0, 0], 0.5)
    assert m["longest_comm_gap_h"][0, 0] == 3
    assert np.isnan(metrics.window_metrics(sf, ev, [5], 10)["sun_mean"][0, 0])


def test_longer_window_never_shortens_longest_dark():
    t, sf, ev = dummy.dummy_series(n_sites=3, days=60)
    a = metrics.window_metrics(sf, ev, [0, 100], 24 * 7)["longest_dark_h"]
    b = metrics.window_metrics(sf, ev, [0, 100], 24 * 14)["longest_dark_h"]
    assert np.all(b >= a)


def test_evaluate_and_plan_b():
    t, sf, ev = dummy.dummy_series(n_sites=4, days=90, seed=3)
    dates = np.arange(t[0], t[0] + np.timedelta64(60, "D"), np.timedelta64(1, "D"))
    tab = metrics.heatmap(sf, ev, t, ["a", "b", "c", "d"], dates, 24 * 14, metrics.EXAMPLE_CRITERIA)
    assert tab["passed"].shape == (4, 60)
    assert np.array_equal(tab["passed"], tab["overall_margin"] >= 0)
    pb = metrics.plan_b(tab, 0, 0, 5, site_latlon=[(-89.4, 0), (-89.5, 10), (-88.7, -68), (-85.9, -2)])
    d0 = pb["delayed_date_idx"]
    assert d0 == 5
    if pb["same_site"]:
        assert tab["passed"][0, pb["same_site"]["date_idx"]]
    assert all(tab["passed"][r["site_idx"], d0] for r in pb["same_day"])


def test_extra_metric_approach():
    met = {"sun_mean": np.array([[0.8]])}
    crit = {"p": ("sun_mean", "min", 0.5), "ap": ("approach", "min", 0.7)}
    ev = metrics.evaluate(met, crit, extra={"approach": np.array([[0.6]])})
    assert not ev["passed"][0, 0]
    assert metrics.fail_causes(crit, ev["fails"])[0, 0] == "approach"


def test_mc_zero_sigma_equals_target_and_seed_spread():
    e, n, p, c = dummy.dummy_grid_outcomes()
    r = montecarlo.run(e, n, p, c, n=500, sigma_along_m=1e-6, sigma_cross_m=1e-6)
    centre = int(np.argmin(np.hypot(e, n)))
    assert r["p"] == float(p[centre])
    sp = montecarlo.seed_spread(n_repeats=20, grid_east=e, grid_north=n, grid_passed=p,
                                grid_causes=c, n=1000, sigma_along_m=300, sigma_cross_m=150)
    assert 0.5 * sp["expected_std"] < sp["p_std"] < 2.0 * sp["expected_std"]
    r = montecarlo.run(e, n, p, c, n=1000, sigma_along_m=300, sigma_cross_m=150, seed=1)
    assert r["ci_low"] <= r["p"] <= r["ci_high"]
    assert abs(sum(r["breakdown"].values()) - 1) < 1e-9


def test_heading_rotates_along_axis():
    e, n = montecarlo.sample_offsets(20000, 300, 1e-9, heading_deg=90, seed=0)
    assert np.std(e) > 250 and np.std(n) < 1e-3


def test_geo_offsets_and_cap():
    lat, lon = geo.offset_points(-89.44, -137.35, np.array([0.0, 1000.0]), np.array([1000.0, 0.0]))
    d = geo.great_circle_m(-89.44, -137.35, lat, lon)
    assert np.allclose(d, 1000.0, atol=1e-3)
    la, lo = geo.area_uniform_cap(20000, -90, -85, seed=1)
    z = np.sin(np.radians(la))
    assert la.max() < -85 + 1e-9 and la.min() > -90
    zmid = np.sin(np.radians(-87.5))
    frac = np.mean(la > -87.5)
    expect = (np.sin(np.radians(-85)) - zmid) / (np.sin(np.radians(-85)) - np.sin(np.radians(-89.99)))
    assert abs(frac - expect) < 0.02
    assert geo.angular_separation_deg(10, 1, 10, 1) < 1e-6
    assert abs(geo.angular_separation_deg(0, 0, 90, 0) - 90) < 1e-9


SAMPLE = """Atmos refraction: NO (AIRLESS)
 Date__(UT)__HR:MN     Azi____(a-app)___Elev             delta      deldot
$$SOE
 2026-Nov-14 00:00 *   263.952615   1.497680  0.98787543040111   0.2967362
 2026-Nov-14 06:00 *   260.905802   1.468199  0.98792026784010   0.3240699
 2026-Nov-14 12:00 *i  257.859366   1.438902  0.98796893525815   0.3497799
 2026-Nov-14 18:00     254.813317  -1.409877  0.98802119485937  -0.3738199
$$EOE
"""


def test_parse_horizons():
    t, az, el, r = validation.parse_horizons_azel(SAMPLE)
    assert len(t) == 4 and str(t[1]) == "2026-11-14T06:00:00"
    assert az[0] == 263.952615 and el[3] == -1.409877 and abs(r[2] - 0.98796893525815) < 1e-12
    p = validation.horizons_params("10", -137.35, -89.44, 0, "2026-11-14", "2026-11-15", "6h")
    assert p["CENTER"] == "'coord@301'" and p["SITE_COORD"] == "'-137.35,-89.44,0'"


def test_json_export_handles_nan(tmp_path):
    meta = tmp_path / "m.json"
    meta.write_text(json.dumps({"project": "x"}))
    out = io_utils.save_json(tmp_path / "o.json", {"a": np.array([1.0, np.nan]), "b": np.int64(3)},
                             meta_path=meta)
    d = json.loads(open(out).read())
    assert d["data"]["a"] == [1.0, None] and d["meta"]["project"] == "x"


SUBPOINTS = """Target pole/equ : MOON_ME                         {East-longitude positive}
$$SOE
 2026-Nov-14 00:00     358.776460   4.403300  126.617658  -1.557279   0.987875731346   0.2966929  0.00271137476442  -0.0031111
 2026-Nov-14 06:00     358.429174   4.145254  123.570598  -1.557315   0.987920562564   0.3240269  0.00271069665059  -0.0062962
$$EOE
"""


def test_subpoints_reproduce_horizons_topocentric():
    from moonkeeper_b import ephem
    sp = ephem.parse_subpoints(SUBPOINTS)
    sun, earth = ephem.body_positions(sp)
    s_az, s_el, _ = ephem.topocentric(-89.44, -137.35, sun)
    e_az, e_el, _ = ephem.topocentric(-89.44, -137.35, earth)
    # Horizons topocentric (airless) values for the same site and times
    sep_s = geo.angular_separation_deg(s_az, s_el, [263.952615, 260.905802], [1.497680, 1.468199])
    sep_e = geo.angular_separation_deg(e_az, e_el, [136.091370, 135.745884], [-5.051678, -4.791428])
    assert np.all(sep_s < 0.001) and np.all(sep_e < 0.01)


def test_visibility_flat_horizon():
    from moonkeeper_b import ephem
    sp = ephem.parse_subpoints(SUBPOINTS)
    sun, earth = ephem.body_positions(sp)
    az = np.arange(0, 360, 0.5)
    sf, ev = ephem.visibility(-89.44, -137.35, az, np.zeros_like(az), sun, earth)
    assert np.all(sf == 1.0) and np.all(ev == 0.0)          # Sun ~+1.5 deg, Earth ~-5 deg
    sf2, _ = ephem.visibility(-89.44, -137.35, az, np.full_like(az, 1.5), sun, earth)
    assert np.all((sf2 > 0.3) & (sf2 < 0.7))                # disc centre near a 1.5 deg horizon
    assert np.isclose(ephem.disk_fraction(0.0, 0.0, 0.27), 0.5)
