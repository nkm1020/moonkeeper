"""Validation against NASA references: JPL Horizons and PGDA illumination maps."""
import re
from datetime import datetime

import numpy as np

from .geo import angular_separation_deg
from .stats import agreement, summarize

HORIZONS_API = "https://ssd.jpl.nasa.gov/api/horizons.api"
_NUM = re.compile(r"[-+]?\d+\.\d+(?:[Ee][-+]?\d+)?")
_ROW = re.compile(r"^\s*(\d{4}-[A-Za-z]{3}-\d{2} \d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(.*)$")


def horizons_params(target, lon_e_deg, lat_deg, alt_km, start, stop, step):
    """Query parameters for an airless topocentric az/el ephemeris from a lunar surface site.

    target: '10' Sun, '399' Earth. Longitude is east-positive (west longitudes negative).
    """
    q = lambda s: f"'{s}'"
    return {
        "format": "text", "COMMAND": q(target), "OBJ_DATA": q("NO"), "MAKE_EPHEM": q("YES"),
        "EPHEM_TYPE": q("OBSERVER"), "CENTER": q("coord@301"), "COORD_TYPE": q("GEODETIC"),
        "SITE_COORD": q(f"{lon_e_deg},{lat_deg},{alt_km}"),
        "START_TIME": q(start), "STOP_TIME": q(stop), "STEP_SIZE": q(step),
        "QUANTITIES": q("4,20"), "APPARENT": q("AIRLESS"),
    }


def parse_horizons_azel(text):
    """Parse a Horizons text result (QUANTITIES 4,20). Returns times, az, el, range_au."""
    if "$$SOE" not in text:
        raise ValueError("No ephemeris block in Horizons output:\n" + text[:800])
    body = text.split("$$SOE", 1)[1].split("$$EOE", 1)[0]
    times, az, el, rng = [], [], [], []
    for line in body.strip().splitlines():
        m = _ROW.match(line)
        if not m:
            continue
        stamp = m.group(1)
        fmt = "%Y-%b-%d %H:%M:%S.%f" if "." in stamp else (
            "%Y-%b-%d %H:%M:%S" if stamp.count(":") == 2 else "%Y-%b-%d %H:%M")
        nums = [float(x) for x in _NUM.findall(m.group(2))]
        if len(nums) < 4:
            continue
        a, e, r, _ = nums[-4:]
        times.append(np.datetime64(datetime.strptime(stamp, fmt)))
        az.append(a); el.append(e); rng.append(r)
    return (np.array(times, dtype="datetime64[s]"), np.array(az), np.array(el), np.array(rng))


def fetch_horizons_azel(target, lon_e_deg, lat_deg, alt_km, start, stop, step, timeout=60):
    import requests
    r = requests.get(HORIZONS_API, params=horizons_params(target, lon_e_deg, lat_deg, alt_km,
                                                          start, stop, step), timeout=timeout)
    r.raise_for_status()
    return parse_horizons_azel(r.text)


def compare_directions(az_ref, el_ref, az_test, el_test):
    """Angular separation and elevation difference (degrees), with summaries."""
    sep = angular_separation_deg(az_ref, el_ref, az_test, el_test)
    d_el = np.asarray(el_test, float) - np.asarray(el_ref, float)
    return dict(separation_deg=sep, d_el_deg=d_el,
                separation=summarize(sep), abs_d_el=summarize(np.abs(d_el)))


def sample_geotiff(path, lat_deg, lon_deg, box=1):
    """Values of a lunar polar GeoTIFF at points, scale/offset applied, nodata -> NaN.

    box=1 takes the pixel; box=3 averages a 3x3 neighbourhood, etc.
    """
    import rasterio
    from pyproj import CRS, Transformer
    lat = np.atleast_1d(np.asarray(lat_deg, float))
    lon = np.atleast_1d(np.asarray(lon_deg, float))
    with rasterio.open(path) as ds:
        geo = CRS.from_proj4("+proj=longlat +R=1737400 +no_defs")
        x, y = Transformer.from_crs(geo, ds.crs, always_xy=True).transform(lon, lat)
        scale, offset = ds.scales[0], ds.offsets[0]
        nodata = ds.nodata
        h = box // 2
        out = np.full(lat.shape, np.nan)
        for i, (xi, yi) in enumerate(zip(x, y)):
            r, c = ds.index(xi, yi)
            if r - h < 0 or c - h < 0 or r + h >= ds.height or c + h >= ds.width:
                continue
            win = ds.read(1, window=((r - h, r + h + 1), (c - h, c + h + 1))).astype(float)
            if nodata is not None:
                win[win == nodata] = np.nan
            out[i] = np.nanmean(win) * scale + offset if np.isfinite(win).any() else np.nan
    return out


def compare_to_map(ours, reference):
    """Agreement statistics, e.g. our long-term sun fraction vs PGDA AVGVISIB."""
    return agreement(reference, ours)


def plot_scatter_and_bland_altman(reference, ours, label="Average solar visibility", unit="",
                                  ref_name="PGDA", our_name="Ours"):
    import matplotlib.pyplot as plt
    r, t = np.asarray(reference, float), np.asarray(ours, float)
    ok = np.isfinite(r) & np.isfinite(t)
    r, t = r[ok], t[ok]
    st = agreement(r, t)
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(10, 4.2))
    lo, hi = min(r.min(), t.min()), max(r.max(), t.max())
    a1.plot([lo, hi], [lo, hi], lw=1, color="0.5")
    a1.scatter(r, t, s=12)
    a1.set_xlabel(f"{ref_name} {label} {unit}".strip()); a1.set_ylabel(f"{our_name} {label} {unit}".strip())
    a1.set_title(f"n={st['n']}, r={st['pearson_r']:.3f}, RMSE={st['rmse']:.3g}")
    m, d = (r + t) / 2, t - r
    a2.scatter(m, d, s=12)
    for v, ls in ((st["bias"], "-"), (st["loa_low"], "--"), (st["loa_high"], "--")):
        a2.axhline(v, ls=ls, lw=1, color="0.4")
    a2.set_xlabel("Mean of the two"); a2.set_ylabel(f"{our_name} - {ref_name}")
    a2.set_title(f"Bland-Altman: bias={st['bias']:.3g}, 95% LoA [{st['loa_low']:.3g}, {st['loa_high']:.3g}]")
    fig.tight_layout()
    return fig, st
