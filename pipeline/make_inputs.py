"""Real input files for 현지 (v2 table rows 2, 3, 4): visibility, approach-path lighting, panorama.

Needs: data/raw/LDEM_85S_40M.IMG, LDEM_80S_80M.IMG (LOLA) and data/raw/horizons/*.csv
(run fetch_horizons.py first).
Run:  python3 pipeline/make_inputs.py
"""
import csv
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sites import SITES, N_T, T0, STEP_H, MAST_M, iso, times_utc  # noqa: E402
import terrain as tr  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "inputs"
HZ = ROOT / "data" / "raw" / "horizons"

LANDING_HOUR_UTC = 12
APPROACH_AZ = [0, 45, 90, 135, 180, 225, 270, 315]
TRACK_KM = [0.5, 1, 2, 3, 4, 5, 6, 7, 8, 10]
GROUND_OBS_M = 1.0   # "ground under the camera": horizon seen from 1 m above the surface
VERSION = "v1"


def load_hz(sid, body):
    with open(HZ / f"{sid}_{body}.csv") as fh:
        r = list(csv.reader(fh))[1:]
    a = np.array([[float(x[1]), float(x[2]), float(x[3])] for x in r])
    assert len(a) == N_T
    return a[:, 0], a[:, 1], a[:, 2] / 3600.0 / 2.0   # az, el, angular radius (deg)


def meta(file_name, extra=None):
    m = {
        "project": "Moonkeeper", "file": file_name, "version": VERSION, "dummy": False,
        "generated_utc": iso(datetime.now(timezone.utc)), "made_by": "강민",
        "time": {"t0_utc": iso(T0), "step_h": STEP_H, "n_times": N_T, "scale": "UTC"},
        "frame": "MEAN_ME", "ref_radius_km": 1737.4, "lon_convention": "east_positive",
        "mast_m": MAST_M,
        "terrain": {
            "source": "NASA LRO LOLA GDR polar DEMs (PDS, imbrium.mit.edu)",
            "files": ["LDEM_85S_40M.IMG (40 m/px, to 85S)", "LDEM_80S_80M.IMG (80 m/px, to 80S)"],
            "frame": "MEAN EARTH/POLAR AXIS OF DE421",
            "horizon_method": "max terrain elevation angle along great circles, exact 3-D sphere geometry "
                              "(curvature included); 40 m steps to 20 km, 80 m steps beyond; "
                              "rays stop where the DEMs end",
            "limits": "rays end at the DEM edge (about 80S); terrain smaller than 40-80 m is not seen",
        },
        "ephemeris": {
            "source": "NASA/JPL Horizons API, DE441",
            "observer": "site on the Moon (coord@301, geodetic, MEAN_ME), airless",
            "quantities": "apparent azimuth/elevation (az from north toward east), angular diameter",
        },
        "rules": {
            "sun_frac": "visible fraction of the solar disk above the local horizon, 0-1",
            "earth_vis": "1 if any part of Earth's disk is above the local horizon (NASA PGDA convention)",
        },
        "si_use": "Code written with Claude Code (SI) during the event; data are NASA LOLA + JPL Horizons.",
    }
    if extra:
        m.update(extra)
    return m


def write(name, obj):
    (OUT / name).write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def check_projection(ter):
    """Physical check of the DEM orientation: Malapert massif is high, Shackleton floor is deep."""
    h = {sid: float(ter.height(np.array([lat]), np.array([lon]))[0]) for sid, _, _, lat, lon in SITES}
    assert h["mp1"] > 4000 and h["lp1"] > 5000 and h["shk"] < -2000, f"DEM orientation looks wrong: {h}"
    f = ter.fine.sample(np.array([-87.0]), np.array([100.0]), tr.Terrain.LINE_SIGN)
    c = ter.coarse.sample(np.array([-87.0]), np.array([100.0]), tr.Terrain.LINE_SIGN)
    return h, float(abs(f[0] - c[0]))


def main():
    t_start = time.time()
    OUT.mkdir(parents=True, exist_ok=True)
    ter = tr.Terrain()
    h_chk, err = check_projection(ter)
    print(f"DEM orientation OK (mp1 {h_chk['mp1']:.0f} m, shk {h_chk['shk']:.0f} m; 40m vs 80m {err:.1f} m)")

    times = times_utc()
    land_idx = np.arange(N_T // 24) * 24 + LANDING_HOUR_UTC
    land_times = [times[i] for i in land_idx]

    sun_frac, earth_vis, ground = [], [], {}
    approach_best, approach_by_az, best_az = [], [], []
    summary = []
    for sid, name, en, lat, lon in SITES:
        t0 = time.time()
        h0 = float(ter.height(np.array([lat]), np.array([lon]))[0])
        ground[sid] = h0
        mask = tr.horizon_mask(ter, lat, lon, h0 + MAST_M, naz=720)

        saz, sel, srad = load_hz(sid, "sun")
        eaz, eel, erad = load_hz(sid, "earth")
        sf = tr.disk_fraction(sel, tr.interp_mask(mask, saz), srad)
        ev = (eel + erad > tr.interp_mask(mask, eaz)).astype(int)
        sun_frac.append(np.round(sf, 3).tolist())
        earth_vis.append(ev.tolist())

        write(f"panorama_{sid}.json", {
            "meta": meta(f"panorama_{sid}.json", {"index_note": "i번째 값 = visibility.json times_utc[i]"}),
            "data": {
                "site_id": sid, "name": name, "name_en": en, "lat": lat, "lon_east": lon,
                "ground_h_m": round(h0, 1),
                "horizon_az_step_deg": 1, "horizon_el": np.round(mask[::2], 3).tolist(),
                "sun_az": np.round(saz, 3).tolist(), "sun_el": np.round(sel, 3).tolist(),
                "earth_az": np.round(eaz, 3).tolist(), "earth_el": np.round(eel, 3).tolist(),
                "sun_radius_deg": round(float(srad.mean()), 4), "earth_radius_deg": round(float(erad.mean()), 4),
            },
        })

        # Approach-path lighting: ground points uprange of the pad, 8 approach azimuths.
        up, east, north = tr.enu(np.float64(lat), np.float64(lon))
        la, le = np.radians(saz[land_idx]), np.radians(sel[land_idx])
        s_vec = (np.cos(le)[:, None] * (np.cos(la)[:, None] * north + np.sin(la)[:, None] * east)
                 + np.sin(le)[:, None] * up)                                    # (D,3) Sun direction
        by_az = np.zeros((len(land_idx), len(APPROACH_AZ)))
        dists = tr.sparse_distances()
        for a_i, a in enumerate(APPROACH_AZ):
            for r_km in TRACK_KM:
                plat, plon = tr.offset_point(lat, lon, a, r_km * 1000.0)
                ph = float(ter.height(np.array([plat]), np.array([plon]))[0])
                pmask = tr.horizon_mask(ter, float(plat), float(plon), ph + GROUND_OBS_M, naz=180, dists=dists)
                pu, pe, pn = tr.enu(np.float64(plat), np.float64(plon))
                p_el = np.degrees(np.arcsin(np.clip(s_vec @ pu, -1, 1)))
                p_az = np.degrees(np.arctan2(s_vec @ pe, s_vec @ pn)) % 360.0
                by_az[:, a_i] += p_el >= tr.interp_mask(pmask, p_az)
        by_az /= len(TRACK_KM)
        best = by_az.max(axis=1)
        approach_by_az.append(np.round(by_az, 2).tolist())
        approach_best.append(np.round(best, 2).tolist())
        best_az.append([APPROACH_AZ[i] for i in by_az.argmax(axis=1)])

        tdl = sf[land_idx] >= 0.5
        summary.append((sid, h0, float(mask.min()), float(mask.max()), float(sf.mean()),
                        float((sf >= 0.5).mean()), float(ev.mean()), float(best.mean()),
                        int((tdl & (best < 0.5)).sum()), int(tdl.sum())))
        print(f"  {sid:5s} h={h0:8.1f} m  horizon {mask.min():6.2f}..{mask.max():5.2f}  "
              f"sun_mean={sf.mean():.3f} lit={100 * (sf >= 0.5).mean():5.1f}%  earth={100 * ev.mean():5.1f}%  "
              f"approach_mean={best.mean():.2f}  pad-lit-but-approach-dark={summary[-1][8]}/{summary[-1][9]}  "
              f"({time.time() - t0:.0f}s)", flush=True)

    write("visibility.json", {
        "meta": meta("visibility.json"),
        "data": {
            "site_ids": [s[0] for s in SITES], "site_names": [s[1] for s in SITES],
            "lat": [s[3] for s in SITES], "lon_east": [s[4] for s in SITES],
            "ground_h_m": [round(ground[s[0]], 1) for s in SITES],
            "times_utc": times, "sun_frac": sun_frac, "earth_vis": earth_vis,
        },
    })
    write("approach.json", {
        "meta": meta("approach.json", {
            "rules": {
                "approach_by_az": "fraction of ground points under the descent camera, "
                                  f"{TRACK_KM[0]}-{TRACK_KM[-1]} km uprange of the pad, whose Sun centre is "
                                  f"above their own horizon (seen from {GROUND_OBS_M} m above the ground), 0-1",
                "approach": "best of the 8 approach azimuths, 0-1 (pass/fail threshold comes from Keev's criteria)",
                "approach_az_deg": "direction the lander flies in FROM, measured from north toward east",
            },
            "landing_hour_utc": LANDING_HOUR_UTC, "track_km": TRACK_KM,
            "track_point_horizon": "180 azimuths (2 deg), distance step 40 m growing to r/150",
        }),
        "data": {
            "site_ids": [s[0] for s in SITES], "landing_times_utc": land_times,
            "approach_az_deg": APPROACH_AZ, "approach": approach_best,
            "approach_by_az": approach_by_az, "best_az_deg": best_az,
        },
    })
    (OUT / "summary.json").write_text(json.dumps([dict(zip(
        ["site", "ground_h_m", "horizon_min", "horizon_max", "sun_mean", "lit_frac", "earth_frac",
         "approach_mean", "pad_lit_approach_dark_days", "pad_lit_days"], s)) for s in summary], indent=1))
    print(f"done in {time.time() - t_start:.0f}s")


if __name__ == "__main__":
    main()
