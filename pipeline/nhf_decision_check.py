"""Do the NHF horizons change the Sun and Earth calls at the IM-2 grid?

For the 317 grid points and all 19,008 hours, computes sun_frac (visible fraction of the solar disc) and
earth_vis (any part of Earth's disc above the horizon) with the precise horizons
(grid_horizons_im2.json) and with the NHF horizons (grid_horizons_im2_nhf.json), then reports how often
they agree. Sun/Earth directions come from panorama_im2.json (IM-2 centre) and are re-projected into each
point's own frame, as in the approach-path code of make_inputs.py. Disc radii are that file's period means.
Run:  python3 pipeline/nhf_decision_check.py [--save data/nhf/grid_sun_earth.npz]
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import terrain as tr  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
INP = ROOT / "data" / "inputs"


def direction_vectors(p, body):
    """Unit vectors (T,3) in the body-fixed frame from the IM-2 centre's az/el."""
    up, east, north = tr.enu(np.float64(p["lat"]), np.float64(p["lon_east"]))
    a, e = np.radians(np.asarray(p[f"{body}_az"])), np.radians(np.asarray(p[f"{body}_el"]))
    return (np.cos(e)[:, None] * (np.cos(a)[:, None] * north + np.sin(a)[:, None] * east)
            + np.sin(e)[:, None] * up)


def local_az_el(v, lat, lon):
    pu, pe, pn = tr.enu(np.float64(lat), np.float64(lon))
    return np.degrees(np.arctan2(v @ pe, v @ pn)) % 360.0, np.degrees(np.arcsin(np.clip(v @ pu, -1, 1)))


def calls(horizons, lat, lon, sun, earth, r_sun, r_earth):
    sun_frac = np.empty((len(lat), len(sun)), np.float32)
    earth_vis = np.empty((len(lat), len(sun)), np.int8)
    for i in range(len(lat)):
        mask = np.asarray(horizons[i], float)
        saz, sel = local_az_el(sun, lat[i], lon[i])
        eaz, eel = local_az_el(earth, lat[i], lon[i])
        sun_frac[i] = tr.disk_fraction(sel, tr.interp_mask(mask, saz), r_sun)
        earth_vis[i] = eel + r_earth > tr.interp_mask(mask, eaz)
    return sun_frac, earth_vis


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--save", type=Path, default=None, help="npz with sun_frac / earth_vis for both versions")
    args = ap.parse_args()
    p = json.loads((INP / "panorama_im2.json").read_text())["data"]
    pre = json.loads((INP / "grid_horizons_im2.json").read_text())
    nhf = json.loads((INP / "grid_horizons_im2_nhf.json").read_text())
    assert pre["meta"]["method"] == "precise" and nhf["meta"]["method"] == "NHF"
    assert pre["data"]["point_ids"] == nhf["data"]["point_ids"]
    d = pre["data"]
    lat, lon = np.array(d["lat"]), np.array(d["lon_east"])
    sun, earth = direction_vectors(p, "sun"), direction_vectors(p, "earth")
    r_sun, r_earth = p["sun_radius_deg"], p["earth_radius_deg"]
    sf_p, ev_p = calls(d["horizon_el"], lat, lon, sun, earth, r_sun, r_earth)
    sf_n, ev_n = calls(nhf["data"]["horizon_el"], lat, lon, sun, earth, r_sun, r_earth)

    # sanity check of the re-projection: the centre point with the precise horizon vs visibility.json
    v = json.loads((INP / "visibility.json").read_text())["data"]
    k, c = v["site_ids"].index("im2"), d["point_ids"].index("G0158")
    centre_lit = float(((sf_p[c] >= 0.5) == (np.array(v["sun_frac"][k]) >= 0.5)).mean())
    centre_earth = float((ev_p[c] == np.array(v["earth_vis"][k])).mean())

    lit_agree = (sf_p >= 0.5) == (sf_n >= 0.5)
    report = {
        "points": len(lat), "hours": int(sf_p.shape[1]),
        "lit_call_agreement": round(float(lit_agree.mean()), 5),
        "earth_call_agreement": round(float((ev_p == ev_n).mean()), 5),
        "sun_frac_mean_abs_diff": round(float(np.abs(sf_p - sf_n).mean()), 5),
        "lit_hours_share_precise_vs_nhf": [round(float((sf_p >= 0.5).mean()), 5), round(float((sf_n >= 0.5).mean()), 5)],
        "earth_hours_share_precise_vs_nhf": [round(float(ev_p.mean()), 5), round(float(ev_n.mean()), 5)],
        "worst_points_lit_agreement": sorted(
            [[d["point_ids"][i], round(float(lit_agree[i].mean()), 4)] for i in range(len(lat))], key=lambda x: x[1])[:5],
        "sanity_centre_vs_visibility_json": {"lit_call_agreement": round(centre_lit, 5),
                                             "earth_call_agreement": round(centre_earth, 5)},
    }
    print(json.dumps(report, indent=1, ensure_ascii=False))
    if args.save:
        np.savez_compressed(args.save, point_ids=np.array(d["point_ids"]), sun_frac_precise=sf_p,
                            earth_vis_precise=ev_p, sun_frac_nhf=sf_n, earth_vis_nhf=ev_n)


if __name__ == "__main__":
    main()
