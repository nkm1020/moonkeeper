"""NHF training data: precise horizons at random points on the lunar south polar cap.

Labels use the same ray casting as pipeline/terrain.py (강민's panoramas and validation horizons): highest
terrain elevation along great circles, LOLA 40 m + 80 m DEMs, 40 m steps to 20 km then 80 m to 320 km.
The two observer heights (ground + 0 m and + 2 m) share one set of terrain samples.

Azimuths are measured from a fixed grid north instead of each point's own north, so the field stays smooth
across the pole. Grid north is the lon 0 meridian direction at the pole (+x below), grid east is lon 90 E:
    grid azimuth = local azimuth + lon_east   (mod 360)
At the pole (lon 0) this is 강민's rule "north = lon 0". pipeline/nhf_model.py turns predictions back into
each point's local azimuths.

Held out from training: everything within --exclude-km of the 150 validation points and of the IM-2 grid
centre, so the NHF has never seen the places it is checked on.

Output (npz under data/nhf/, git-ignored):
  lat, lon_east, ground_h_m [N]; xy_km [N,2] (x = R cos(lat) cos(lon), y = R cos(lat) sin(lon))
  az_grid_deg [720]; hz0, hz2 [N,720] float32 horizon elevation (deg) at grid azimuths
Run:  python3 pipeline/nhf_make_training_data.py --n 50000 --workers 64
"""
import argparse
import csv
import json
import multiprocessing as mp
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import terrain as tr  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
VAL_POINTS = ROOT / "data" / "points" / "validation_points_n150_seed42.csv"
IM2_CENTRE = (-84.7906, 29.1957)
LAT_NORTH = -84.5
HEIGHTS_M = (0.0, 2.0)
NAZ = 720
AZ_GRID = np.arange(NAZ) * 360.0 / NAZ

_TER = None
_DISTS = None


def _init_worker():
    global _TER, _DISTS
    _TER = tr.Terrain()
    _DISTS = tr.default_distances()


def unit(lat, lon):
    la, lo = np.radians(lat), np.radians(lon)
    return np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)], -1)


def horizons_grid_az(ter, lat, lon, dists, heights=HEIGHTS_M, chunk=24):
    """Ground height (m) and horizon elevation (deg) [len(heights), NAZ] at the grid azimuths AZ_GRID.

    Same geometry as terrain.horizon_mask; only the ray azimuths (local = grid - lon) and the shared
    terrain samples for several observer heights differ.
    """
    lat, lon = float(lat), float(lon)
    gh = float(ter.height(np.array([lat]), np.array([lon]))[0])
    up, east, north = tr.enu(np.float64(lat), np.float64(lon))
    az_local = (AZ_GRID - lon) % 360.0
    d = dists / tr.R_M
    cd, sd = np.cos(d), np.sin(d)
    observers = [(tr.R_M + gh + hm) * up for hm in heights]
    out = np.full((len(heights), NAZ), -90.0)
    for i0 in range(0, NAZ, chunk):
        a = np.radians(az_local[i0:i0 + chunk])
        t = np.cos(a)[:, None] * north + np.sin(a)[:, None] * east          # (A,3)
        p = cd[None, :, None] * up + sd[None, :, None] * t[:, None, :]       # (A,N,3) unit
        plat, plon = tr.vec_to_latlon(p)
        h = ter.height(plat, plon, fine_max_km=None)
        terrain_xyz = (tr.R_M + h)[..., None] * p
        for k, obs in enumerate(observers):
            v = terrain_xyz - obs
            el = np.degrees(np.arcsin(np.clip((v @ up) / np.linalg.norm(v, axis=-1), -1, 1)))
            out[k, i0:i0 + chunk] = np.nanmax(np.where(np.isnan(h), -90.0, el), axis=1)
    return gh, out


def _job(latlon):
    return horizons_grid_az(_TER, latlon[0], latlon[1], _DISTS)


def held_out_centres():
    with open(VAL_POINTS, newline="") as fh:
        rows = list(csv.DictReader(fh))
    lat = [float(r["lat_deg"]) for r in rows] + [IM2_CENTRE[0]]
    lon = [float(r["lon_east_deg"]) for r in rows] + [IM2_CENTRE[1]]
    return unit(np.array(lat), np.array(lon))


def sample_points(n, seed, exclude_km):
    """Uniform in area between LAT_NORTH and the pole, minus discs around the held-out places."""
    rng = np.random.default_rng(seed)
    held = held_out_centres()
    cos_max = np.cos(exclude_km * 1000.0 / tr.R_M)
    s_north = np.sin(np.radians(LAT_NORTH))
    lats, lons, have = [], [], 0
    while have < n:
        lat = np.degrees(np.arcsin(rng.uniform(-1.0, s_north, size=n)))
        lon = rng.uniform(-180.0, 180.0, size=n)
        keep = (unit(lat, lon) @ held.T).max(axis=1) < cos_max
        lats.append(lat[keep])
        lons.append(lon[keep])
        have += int(keep.sum())
    return np.concatenate(lats)[:n], np.concatenate(lons)[:n]


def save(path, lat, lon, gh, hz, n_done, meta):
    la, lo = np.radians(lat[:n_done]), np.radians(lon[:n_done])
    xy_km = np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo)], -1) * tr.R_M / 1000.0
    np.savez(path, lat=lat[:n_done], lon_east=lon[:n_done], ground_h_m=gh[:n_done], xy_km=xy_km,
             az_grid_deg=AZ_GRID, hz0=hz[0, :n_done], hz2=hz[1, :n_done],
             meta=json.dumps(dict(meta, n=n_done), ensure_ascii=False))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=50000)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--exclude-km", type=float, default=2.0)
    ap.add_argument("--workers", type=int, default=os.cpu_count())
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    out = args.out or ROOT / "data" / "nhf" / f"train_n{args.n}_seed{args.seed}.npz"
    out.parent.mkdir(parents=True, exist_ok=True)
    partial = out.with_name(out.stem + ".partial.npz")

    meta = {
        "project": "Moonkeeper", "purpose": "NHF training labels", "made_by": "용휘",
        "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "seed": args.seed, "region": f"{LAT_NORTH} deg to the pole, uniform in area",
        "held_out": f"within {args.exclude_km} km of the 150 validation points and of the IM-2 grid centre",
        "heights_m": list(HEIGHTS_M), "az_step_deg": 360.0 / NAZ,
        "az_convention": "grid azimuth from +x (lon 0 meridian direction at the pole) toward +y (lon 90 E); "
                         "local azimuth = grid azimuth - lon_east",
        "elevation": "deg above the observer's local horizontal plane (normal to the sphere radius), "
                     "lunar curvature included",
        "terrain": "LOLA LDEM_85S_40M + LDEM_80S_80M, ray casting as in pipeline/terrain.py "
                   "(40 m steps to 20 km, 80 m steps to 320 km, stop at the DEM edge)",
        "xy_km": "x = R cos(lat) cos(lon), y = R cos(lat) sin(lon), R = 1737.4 km",
    }

    t0 = time.time()
    lat, lon = sample_points(args.n, args.seed, args.exclude_km)
    ctx = mp.get_context("fork" if sys.platform.startswith("linux") else "spawn")
    init = None
    if ctx.get_start_method() == "fork":
        _init_worker()  # load the DEMs once; forked workers share the pages
    else:
        init = _init_worker
    gh = np.full(args.n, np.nan)
    hz = np.empty((len(HEIGHTS_M), args.n, NAZ), np.float32)
    with ctx.Pool(args.workers, initializer=init) as pool:
        for i, (g, h) in enumerate(pool.imap(_job, zip(lat.tolist(), lon.tolist()), chunksize=4)):
            gh[i], hz[:, i] = g, h
            done = i + 1
            if done % 1000 == 0 or done == args.n:
                el = time.time() - t0
                print(f"  {done}/{args.n}  {el / 60:.1f} min  ~{el / done * (args.n - done) / 60:.1f} min left",
                      flush=True)
            if done % 10000 == 0 and done < args.n:
                save(partial, lat, lon, gh, hz, done, meta)
    assert not np.isnan(gh).any(), "a point is outside the DEMs"
    save(out, lat, lon, gh, hz, args.n, meta)
    partial.unlink(missing_ok=True)
    print(f"wrote {out}  N={args.n}  {(time.time() - t0) / 60:.1f} min")


if __name__ == "__main__":
    main()
