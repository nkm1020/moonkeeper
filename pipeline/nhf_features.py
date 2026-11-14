"""Cheap terrain features for the NHF: how high the surrounding terrain looks from a point.

For each point: 72 grid azimuths (every 5 deg, same grid north as the NHF outputs) x the distances of a
set ("v2": 34 distances from 50 m to 300 km), the elevation angle (deg) of the LOLA terrain seen from
ground + 0 m and ground + 2 m, curvature included. With v2 that is 2,448 DEM samples per point, against
about 3 million for the precise 720-azimuth ray casting. The highest angle per direction is already a
rough horizon; the NHF learns the correction (nhf_model.py, residual=True).
"""
import multiprocessing as mp
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import terrain as tr  # noqa: E402

FEAT_NAZ = 72
DIST_SETS_KM = {
    "v1": [0.1, 0.2, 0.35, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 11, 15, 20, 30, 45, 65, 100],
    "v2": [0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.65, 0.8, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 13, 16,
           20, 25, 30, 40, 50, 65, 80, 100, 130, 170, 220, 300],
}
FEAT_DIST_KM = np.array(DIST_SETS_KM["v1"], float)


def terrain_features(ter, lat, lon_east, naz=FEAT_NAZ, dist_km=None, heights=(0.0, 2.0), chunk=1000):
    """Elevation angles (deg) [P, len(heights) * naz * len(dist_km)] (height, azimuth, distance order),
    seen from ground + each observer height. The heights share one set of terrain samples."""
    lat = np.atleast_1d(np.asarray(lat, float))
    lon = np.atleast_1d(np.asarray(lon_east, float))
    beta = np.arange(naz) * 360.0 / naz
    d = np.asarray(FEAT_DIST_KM if dist_km is None else dist_km, float) * 1000.0 / tr.R_M
    cd, sd = np.cos(d), np.sin(d)
    out = np.empty((len(lat), len(heights), naz, len(d)), np.float32)
    for i0 in range(0, len(lat), chunk):
        la, lo = lat[i0:i0 + chunk], lon[i0:i0 + chunk]
        up, east, north = tr.enu(la, lo)                                          # (C,3)
        h0 = ter.height(la, lo)
        a = np.radians((beta[None, :] - lo[:, None]) % 360.0)                     # local azimuths (C,A)
        t = np.cos(a)[..., None] * north[:, None, :] + np.sin(a)[..., None] * east[:, None, :]
        p = cd[None, None, :, None] * up[:, None, None, :] + sd[None, None, :, None] * t[:, :, None, :]
        plat, plon = tr.vec_to_latlon(p)                                          # (C,A,D)
        h = ter.height(plat, plon)
        terrain_xyz = (tr.R_M + h)[..., None] * p
        for k, hm in enumerate(heights):
            v = terrain_xyz - ((tr.R_M + h0 + hm)[:, None, None, None] * up[:, None, None, :])
            s = np.einsum("cadk,ck->cad", v, up) / np.linalg.norm(v, axis=-1)
            el = np.degrees(np.arcsin(np.clip(s, -1, 1)))
            out[i0:i0 + chunk, k] = np.where(np.isnan(el), -90.0, el)
    return out.reshape(len(lat), -1)


_TER = None


def _job(args):
    return terrain_features(_TER, *args[:2], naz=args[2], dist_km=args[3])


def terrain_features_parallel(ter, lat, lon_east, naz=FEAT_NAZ, dist_km=None, workers=32, block=1000):
    """Same as terrain_features, split over forked workers (Linux); serial elsewhere."""
    global _TER
    if not sys.platform.startswith("linux") or len(lat) <= block:
        return terrain_features(ter, lat, lon_east, naz=naz, dist_km=dist_km)
    _TER = ter
    lat, lon = np.asarray(lat, float), np.asarray(lon_east, float)
    jobs = [(lat[i:i + block], lon[i:i + block], naz, dist_km) for i in range(0, len(lat), block)]
    with mp.get_context("fork").Pool(workers) as pool:
        return np.concatenate(pool.map(_job, jobs))
