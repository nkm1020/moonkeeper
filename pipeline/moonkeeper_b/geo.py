"""Spherical-Moon geometry helpers (reference sphere R = 1737.4 km)."""
import numpy as np

R_MOON_M = 1737400.0


def unit_vec(lat_deg, lon_deg):
    la, lo = np.radians(lat_deg), np.radians(lon_deg)
    return np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)], axis=-1)


def latlon_from_vec(v):
    v = np.asarray(v, dtype=float)
    v = v / np.linalg.norm(v, axis=-1, keepdims=True)
    lat = np.degrees(np.arcsin(np.clip(v[..., 2], -1, 1)))
    lon = np.degrees(np.arctan2(v[..., 1], v[..., 0]))
    return lat, lon


def enu_basis(lat_deg, lon_deg):
    """Local up, east, north unit vectors (undefined exactly at a pole)."""
    la, lo = np.radians(lat_deg), np.radians(lon_deg)
    up = np.array([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)])
    east = np.array([-np.sin(lo), np.cos(lo), 0.0])
    north = np.array([-np.sin(la) * np.cos(lo), -np.sin(la) * np.sin(lo), np.cos(la)])
    return up, east, north


def offset_points(lat0, lon0, east_m, north_m):
    """Move from (lat0, lon0) by local east/north offsets along great circles."""
    up, east, north = enu_basis(lat0, lon0)
    e = np.asarray(east_m, dtype=float)
    n = np.asarray(north_m, dtype=float)
    d = np.hypot(e, n)
    safe = np.where(d > 0, d, 1.0)
    direction = (e[..., None] * east + n[..., None] * north) / safe[..., None]
    th = (d / R_MOON_M)[..., None]
    p = np.cos(th) * up + np.sin(th) * direction
    p = np.where((d > 0)[..., None], p, up)
    return latlon_from_vec(p)


def grid_around(lat0, lon0, radius_m, spacing_m):
    """Square grid clipped to a disc around a target. Returns east, north, lat, lon (1-D)."""
    k = int(np.floor(radius_m / spacing_m))
    ax = np.arange(-k, k + 1) * spacing_m
    ee, nn = np.meshgrid(ax, ax)
    keep = np.hypot(ee, nn) <= radius_m + 1e-9
    e, n = ee[keep], nn[keep]
    lat, lon = offset_points(lat0, lon0, e, n)
    return e, n, lat, lon


def great_circle_m(lat1, lon1, lat2, lon2):
    a, b = unit_vec(lat1, lon1), unit_vec(lat2, lon2)
    c = np.clip(np.sum(a * b, axis=-1), -1, 1)
    return R_MOON_M * np.arccos(c)


def area_uniform_cap(n, lat_min=-90.0, lat_max=-85.0, seed=0, pole_exclusion_deg=0.01):
    """Random points uniform in surface area between two latitudes."""
    rng = np.random.default_rng(seed)
    lat_hi = min(lat_max, 90 - pole_exclusion_deg)
    lat_lo = max(lat_min, -90 + pole_exclusion_deg)
    z = rng.uniform(np.sin(np.radians(lat_lo)), np.sin(np.radians(lat_hi)), n)
    lat = np.degrees(np.arcsin(z))
    lon = rng.uniform(-180.0, 180.0, n)
    return lat, lon


def azel_to_enu(az_deg, el_deg):
    az, el = np.radians(az_deg), np.radians(el_deg)
    return np.stack([np.cos(el) * np.sin(az), np.cos(el) * np.cos(az), np.sin(el)], axis=-1)


def angular_separation_deg(az1, el1, az2, el2):
    a, b = azel_to_enu(az1, el1), azel_to_enu(az2, el2)
    c = np.clip(np.sum(a * b, axis=-1), -1, 1)
    return np.degrees(np.arccos(c))
