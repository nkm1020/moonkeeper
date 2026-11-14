"""LOLA south-polar DEMs and horizon masks.

DEMs (NASA LRO LOLA GDR, PDS): LDEM_85S_40M (40 m/px, to 85S) and LDEM_80S_80M
(80 m/px, to 80S). Polar stereographic on a 1737.4 km sphere, frame
"MEAN EARTH/POLAR AXIS OF DE421". Height = DN * 0.5 m above 1737.4 km.

Horizon = maximum elevation angle of the terrain seen from an observer, along
great circles, using exact 3-D geometry on the sphere (so lunar curvature is in).
"""
from pathlib import Path

import numpy as np

R_M = 1737400.0
RAW = Path(__file__).resolve().parent.parent / "data" / "raw"


class PolarDEM:
    def __init__(self, name, n, scale_m, offset_px):
        self.name, self.n, self.scale, self.off = name, n, scale_m, offset_px
        dn = np.fromfile(RAW / f"{name}.IMG", dtype="<i2")
        assert dn.size == n * n, f"{name}: size {dn.size} != {n * n}"
        self.h = (dn.reshape(n, n).astype(np.float32) * 0.5)

    def xy(self, lat, lon):
        rho = 2 * R_M * np.tan(np.pi / 4 + np.radians(lat) / 2)
        lo = np.radians(lon)
        return rho * np.sin(lo), rho * np.cos(lo)

    def sample(self, lat, lon, line_sign):
        """Bilinear height (m). NaN outside the grid. line_sign picks the y-axis direction."""
        x, y = self.xy(lat, lon)
        s = self.off + x / self.scale
        l = self.off + line_sign * y / self.scale
        ok = (s >= 0) & (s <= self.n - 1.001) & (l >= 0) & (l <= self.n - 1.001)
        s0 = np.floor(np.where(ok, s, 0)).astype(np.int64)
        l0 = np.floor(np.where(ok, l, 0)).astype(np.int64)
        fs, fl = np.where(ok, s, 0) - s0, np.where(ok, l, 0) - l0
        H = self.h
        v = (H[l0, s0] * (1 - fs) * (1 - fl) + H[l0, s0 + 1] * fs * (1 - fl)
             + H[l0 + 1, s0] * (1 - fs) * fl + H[l0 + 1, s0 + 1] * fs * fl)
        return np.where(ok, v, np.nan)


class Terrain:
    """Fine 40 m DEM where it exists, 80 m DEM elsewhere."""

    LINE_SIGN = -1  # set by calibrate(); -1 means line grows toward -y

    def __init__(self):
        self.fine = PolarDEM("LDEM_85S_40M", 7584, 40.0, 3791.5)
        self.coarse = PolarDEM("LDEM_80S_80M", 7600, 80.0, 3799.5)

    def height(self, lat, lon, fine_max_km=None, dist_km=None):
        hf = self.fine.sample(lat, lon, self.LINE_SIGN)
        hc = self.coarse.sample(lat, lon, self.LINE_SIGN)
        use_fine = ~np.isnan(hf)
        if fine_max_km is not None and dist_km is not None:
            use_fine &= dist_km <= fine_max_km
        return np.where(use_fine, hf, hc)


def enu(lat, lon):
    """Local up/east/north unit vectors in the body-fixed frame (same convention as JPL Horizons)."""
    la, lo = np.radians(lat), np.radians(lon)
    up = np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)], -1)
    east = np.stack([-np.sin(lo), np.cos(lo), np.zeros_like(lo)], -1)
    north = np.stack([-np.sin(la) * np.cos(lo), -np.sin(la) * np.sin(lo), np.cos(la)], -1)
    return up, east, north


def vec_to_latlon(v):
    v = v / np.linalg.norm(v, axis=-1, keepdims=True)
    return np.degrees(np.arcsin(np.clip(v[..., 2], -1, 1))), np.degrees(np.arctan2(v[..., 1], v[..., 0]))


def offset_point(lat, lon, az_deg, dist_m):
    """Point reached by going dist_m along the great circle at azimuth az from (lat, lon)."""
    up, east, north = enu(np.float64(lat), np.float64(lon))
    d = np.asarray(dist_m, dtype=np.float64) / R_M
    a = np.radians(np.asarray(az_deg, dtype=np.float64))
    t = np.cos(a)[..., None] * north + np.sin(a)[..., None] * east
    p = np.cos(d)[..., None] * up + np.sin(d)[..., None] * t
    return vec_to_latlon(p)


def default_distances(max_km=320.0):
    """40 m steps to 20 km, then 80 m steps (DEM resolution) to max_km."""
    near = np.arange(40.0, 20000.0, 40.0)
    far = np.arange(20000.0, max_km * 1000.0, 80.0)
    return np.concatenate([near, far])


def sparse_distances(max_km=320.0):
    """Cheaper steps for many points: 40 m near, then growing with distance (~r/150)."""
    r, out = 40.0, []
    while r < max_km * 1000.0:
        out.append(r)
        r += max(40.0, r / 150.0)
    return np.array(out)


def horizon_mask(ter, lat, lon, obs_h_m, naz=720, dists=None, chunk=24):
    """Horizon elevation (deg) at naz azimuths from an observer obs_h_m above the reference sphere."""
    if dists is None:
        dists = default_distances()
    up, east, north = enu(np.float64(lat), np.float64(lon))
    obs = (R_M + obs_h_m) * up
    az = np.arange(naz) * 360.0 / naz
    out = np.full(naz, -90.0)
    d = dists / R_M
    cd, sd = np.cos(d), np.sin(d)
    for i0 in range(0, naz, chunk):
        a = np.radians(az[i0:i0 + chunk])
        t = np.cos(a)[:, None] * north + np.sin(a)[:, None] * east          # (A,3)
        p = cd[None, :, None] * up + sd[None, :, None] * t[:, None, :]       # (A,N,3) unit
        plat, plon = vec_to_latlon(p)
        h = ter.height(plat, plon, fine_max_km=None)
        v = (R_M + h)[..., None] * p - obs
        el = np.degrees(np.arcsin(np.clip((v @ up) / np.linalg.norm(v, axis=-1), -1, 1)))
        out[i0:i0 + chunk] = np.nanmax(np.where(np.isnan(h), -90.0, el), axis=1)
    return out


def interp_mask(mask, az_deg):
    n = mask.size
    x = (np.asarray(az_deg) % 360.0) / 360.0 * n
    i = np.floor(x).astype(int) % n
    f = x - np.floor(x)
    return mask[i] * (1 - f) + mask[(i + 1) % n] * f


def disk_fraction(el, hor, r):
    d = np.clip((el - hor) / r, -1.0, 1.0)
    return 1.0 - (np.arccos(d) - d * np.sqrt(1 - d * d)) / np.pi
