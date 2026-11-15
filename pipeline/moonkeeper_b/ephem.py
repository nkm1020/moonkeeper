"""Sun and Earth directions for many lunar surface points from one Horizons series.

Horizons (target Moon 301, observer geocentre, QUANTITIES 14,15,19,20) gives the sub-Earth
and sub-solar points in the MOON_ME frame plus the Sun-Moon and Earth-Moon distances.
From these, the Sun and Earth positions relative to the Moon's centre are rebuilt once and
projected onto any site's local east/north/up frame (with parallax), so long periods for
hundreds of points need only a few API calls.
"""
import re
from datetime import datetime

import numpy as np

from .geo import unit_vec, enu_basis, R_MOON_M
from .validation import HORIZONS_API

AU_KM = 149597870.700
SUN_RADIUS_KM = 695700.0
EARTH_RADIUS_KM = 6378.137
_NUM = re.compile(r"[-+]?\d+\.\d+(?:[Ee][-+]?\d+)?")
_ROW = re.compile(r"^\s*(\d{4}-[A-Za-z]{3}-\d{2} \d{2}:\d{2})(.*)$")


def subpoint_params(start, stop, step):
    q = lambda s: f"'{s}'"
    return {"format": "text", "COMMAND": q("301"), "OBJ_DATA": q("NO"), "MAKE_EPHEM": q("YES"),
            "EPHEM_TYPE": q("OBSERVER"), "CENTER": q("500@399"), "START_TIME": q(start),
            "STOP_TIME": q(stop), "STEP_SIZE": q(step), "QUANTITIES": q("14,15,19,20")}


def parse_subpoints(text):
    """Returns dict of arrays: times, earth_lon, earth_lat, sun_lon, sun_lat, sun_dist_km, earth_dist_km."""
    if "$$SOE" not in text:
        raise ValueError("No ephemeris block in Horizons output:\n" + text[:800])
    if "MOON_ME" not in text.split("$$SOE")[0]:
        raise ValueError("Expected the Moon body frame MOON_ME in the header")
    body = text.split("$$SOE", 1)[1].split("$$EOE", 1)[0]
    cols = {k: [] for k in ("times", "earth_lon", "earth_lat", "sun_lon", "sun_lat",
                            "sun_dist_km", "earth_dist_km")}
    for line in body.strip().splitlines():
        m = _ROW.match(line)
        if not m:
            continue
        nums = [float(x) for x in _NUM.findall(m.group(2))]
        if len(nums) < 8:
            continue
        olon, olat, slon, slat, r_au, _, d_au, _ = nums[-8:]
        cols["times"].append(np.datetime64(datetime.strptime(m.group(1), "%Y-%b-%d %H:%M")))
        cols["earth_lon"].append(olon); cols["earth_lat"].append(olat)
        cols["sun_lon"].append(slon); cols["sun_lat"].append(slat)
        cols["sun_dist_km"].append(r_au * AU_KM); cols["earth_dist_km"].append(d_au * AU_KM)
    out = {k: np.array(v) for k, v in cols.items()}
    out["times"] = out["times"].astype("datetime64[s]")
    return out


def fetch_subpoints(start, stop, step="6h", chunk_days=730, timeout=120):
    """Fetch in chunks (Horizons limits rows per request) and concatenate."""
    import requests
    t0, t1 = np.datetime64(start, "s"), np.datetime64(stop, "s")
    parts, a = [], t0
    while a < t1:
        b = min(a + np.timedelta64(chunk_days, "D"), t1)
        r = requests.get(HORIZONS_API, params=subpoint_params(str(a).replace("T", " "),
                                                            str(b).replace("T", " "), step), timeout=timeout)
        r.raise_for_status()
        p = parse_subpoints(r.text)
        if parts:
            keep = p["times"] > parts[-1]["times"][-1]
            p = {k: v[keep] for k, v in p.items()}
        parts.append(p)
        a = b
    return {k: np.concatenate([p[k] for p in parts]) for k in parts[0]}


def body_positions(sp):
    """Sun and Earth positions (km) relative to the Moon's centre, MOON_ME frame, shape (T, 3)."""
    sun = unit_vec(sp["sun_lat"], sp["sun_lon"]) * sp["sun_dist_km"][:, None]
    earth = unit_vec(sp["earth_lat"], sp["earth_lon"]) * sp["earth_dist_km"][:, None]
    return sun, earth


def topocentric(lat_deg, lon_deg, pos_km, height_m=0.0):
    """Azimuth (deg, clockwise from north), elevation (deg) and distance (km) of a body from a site."""
    up, east, north = enu_basis(lat_deg, lon_deg)
    site = up * (R_MOON_M + height_m) / 1000.0
    v = np.asarray(pos_km, float) - site
    d = np.linalg.norm(v, axis=-1)
    u = v / d[:, None]
    el = np.degrees(np.arcsin(np.clip(u @ up, -1, 1)))
    az = np.degrees(np.arctan2(u @ east, u @ north)) % 360.0
    return az, el, d


def horizon_at(az_grid_deg, horizon_el_deg, az_deg):
    """Interpolate a horizon mask (az grid starting at 0, uniform step) at given azimuths."""
    az_grid = np.asarray(az_grid_deg, float)
    h = np.asarray(horizon_el_deg, float)
    return np.interp(np.asarray(az_deg) % 360.0, np.r_[az_grid, 360.0], np.r_[h, h[0]])


def disk_fraction(center_el, horizon_el, radius_deg):
    """Fraction of a disc above a locally straight horizon."""
    d = np.clip((np.asarray(center_el) - horizon_el) / radius_deg, -1.0, 1.0)
    return 1.0 - (np.arccos(d) - d * np.sqrt(1.0 - d * d)) / np.pi


def visibility(lat_deg, lon_deg, az_grid_deg, horizon_el_deg, sun_pos_km, earth_pos_km,
               height_m=0.0, earth_rule="center"):
    """Sun disc fraction and Earth visibility time series for one site and its horizon mask.

    earth_rule: "center" (Earth centre above horizon) or "any_part" (any part of the disc,
    as used in the PGDA Earth-visibility maps).
    """
    s_az, s_el, s_d = topocentric(lat_deg, lon_deg, sun_pos_km, height_m)
    e_az, e_el, e_d = topocentric(lat_deg, lon_deg, earth_pos_km, height_m)
    s_r = np.degrees(np.arcsin(SUN_RADIUS_KM / s_d))
    sun_frac = disk_fraction(s_el, horizon_at(az_grid_deg, horizon_el_deg, s_az), s_r)
    e_h = horizon_at(az_grid_deg, horizon_el_deg, e_az)
    if earth_rule == "any_part":
        e_r = np.degrees(np.arcsin(EARTH_RADIUS_KM / e_d))
        earth_vis = (e_el + e_r > e_h).astype(float)
    else:
        earth_vis = (e_el > e_h).astype(float)
    return sun_frac, earth_vis
