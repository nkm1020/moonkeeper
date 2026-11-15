"""3-D scene for screen 1 (sky): real terrain around one site and, for every terrain point, its own horizon,
so the browser can light the ground with the real Sun the same way the site numbers in data/inputs were made
(Sun elevation against the horizon, share of the solar disc).

Frame: the site's local east / north / up, metres, origin = the site's ground (40 m DEM). Curvature is in z.

    python3 pipeline/fetch_lola5m.py cr1      # optional: 5 m rows around the site (87.5 S and closer to the pole)
    python3 pipeline/make_scene3d.py cr1      # about 6 minutes -> data/scene3d/cr1/

Files (all little-endian):
  inner_z.f32    401 x 401   up-height every 40 m, +-8 km           (row = south -> north, column = west -> east)
  inner_hz.f16    72 x 201 x 201  horizon elevation (deg) every 80 m, 1 m above ground, azimuth k * 5 deg
  outer_z.f32    201 x 201   up-height every 600 m, +-60 km
  outer_hz.f16    36 x 201 x 201  horizon elevation (deg) every 600 m, azimuth k * 10 deg
  patch_z5.i16  1601 x 1601  up-height in 2 cm units on the LOLA 5 m grid, +-4 km (only when the 5 m rows exist)
  scene.json     grid sizes, the 5 m grid's map from east/north to its texels, the ground's Sun share per hour, sources
"""
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

import terrain as tr

ROOT = Path(__file__).resolve().parent.parent
R = tr.R_M
T_START = time.time()


def log(*a):
    print(f"[{time.time() - T_START:5.0f}s]", *a, flush=True)


def site_info(site):
    meta = json.load(open(ROOT / "data" / "project_meta.json"))
    for s in meta["sites"]:
        if s["id"] == site:
            return s
    raise SystemExit(f"unknown site {site}")


def main(site):
    out = ROOT / "data" / "scene3d" / site
    out.mkdir(parents=True, exist_ok=True)
    info = site_info(site)
    LAT, LON = info["lat"], info["lon_east"]
    ter = tr.Terrain()
    up0, e0, n0 = tr.enu(np.float64(LAT), np.float64(LON))
    h0 = float(ter.height(np.array([LAT]), np.array([LON]))[0])
    P0 = (R + h0) * up0

    def grid(half, step):
        g = np.arange(-half, half + step / 2, step)
        E, N = np.meshgrid(g, g)                                   # row = south -> north, column = west -> east
        lat, lon = tr.offset_point(LAT, LON, np.degrees(np.arctan2(E, N)), np.hypot(E, N))
        h = ter.height(lat, lon)
        up, _, _ = tr.enu(lat, lon)
        z = (((R + h)[..., None] * up - P0) @ up0).astype(np.float32)
        return lat, lon, h, up, z

    def horizon_map(h, up, naz, dists, obs_m=1.0, chunk=1500):
        """Horizon elevation (deg) per point at naz azimuths of the site frame, from obs_m above the ground."""
        ny, nx = h.shape
        upf = up.reshape(-1, 3)
        O = ((R + h + obs_m)[..., None] * up).reshape(-1, 3)
        res = np.empty((naz, ny * nx), np.float32)
        dd = dists / R
        cd, sd = np.cos(dd), np.sin(dd)
        for k in range(naz):
            a = np.radians(k * 360.0 / naz)
            dk = np.cos(a) * n0 + np.sin(a) * e0
            for c0 in range(0, upf.shape[0], chunk):
                u, o = upf[c0:c0 + chunk], O[c0:c0 + chunk]
                t = dk[None, :] - (u @ dk)[:, None] * u
                t /= np.linalg.norm(t, axis=1, keepdims=True)
                q = cd[None, :, None] * u[:, None, :] + sd[None, :, None] * t[:, None, :]
                ql, qo = tr.vec_to_latlon(q)
                hq = ter.height(ql, qo)
                v = (R + hq)[..., None] * q - o[:, None, :]
                el = np.degrees(np.arcsin(np.clip(np.einsum("pnc,pc->pn", v, u) / np.linalg.norm(v, axis=-1), -1, 1)))
                res[k, c0:c0 + chunk] = np.nanmax(np.where(np.isnan(hq), -90.0, el), axis=1)
            if k % 12 == 0:
                log(f"  azimuth {k}/{naz}")
        return res.reshape(naz, ny, nx)

    # inner: 40 m heights, 80 m horizon map (rays to 80 km)
    ilat, ilon, _, _, iz = grid(8000.0, 40.0)
    iz.tofile(out / "inner_z.f32")
    dem_m = inner_dems(ter, ilat, ilon)
    log("inner grid DEM:", dem_m)
    _, _, hh, uu, _ = grid(8000.0, 80.0)
    near = np.concatenate([np.arange(40.0, 6000.0, 40.0), 6000.0 * np.exp(np.arange(1, 400) / 150.0)])
    log("inner horizon map")
    horizon_map(hh, uu, 72, near[near <= 80000.0]).astype(np.float16).tofile(out / "inner_hz.f16")
    # outer: 600 m, +-60 km (rays to 160 km)
    _, _, hh2, uu2, oz = grid(60000.0, 600.0)
    oz.tofile(out / "outer_z.f32")
    far = np.concatenate([np.arange(300.0, 6000.0, 300.0), 6000.0 * np.exp(np.arange(1, 400) / 100.0)])
    log("outer horizon map")
    horizon_map(hh2, uu2, 36, far[far <= 160000.0]).astype(np.float16).tofile(out / "outer_hz.f16")

    # the ground under the site, 1 m up: its own horizon (720 azimuths) and the Sun's share every hour
    pan = json.load(open(ROOT / "data" / "inputs" / f"panorama_{site}.json"))["data"]
    gmask = tr.horizon_mask(ter, LAT, LON, h0 + 1.0, naz=720)
    sel, saz = np.array(pan["sun_el"]), np.array(pan["sun_az"])
    ground = tr.disk_fraction(sel, tr.interp_mask(gmask, saz), pan["sun_radius_deg"])
    log("ground series done")

    patch = make_patch(site, ter, LAT, LON, P0, e0, n0, up0, out)

    vis_meta = json.load(open(ROOT / "data" / "inputs" / "visibility.json"))["meta"]
    scene = dict(
        meta=dict(
            project="Moonkeeper", file=f"scene3d/{site}/scene.json", version="v1", dummy=False,
            generated_utc=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"), made_by="강민",
            frame="site east/north/up (m), origin at the site's ground; body frame MEAN_ME", time=vis_meta["time"],
            terrain=dict(source=vis_meta["terrain"]["source"], files=vis_meta["terrain"]["files"] + ([patch["source"]] if patch else []),
                         note_5m=patch["note"] if patch else ""),
            ephemeris=vis_meta["ephemeris"],
            method="Every terrain point gets its own horizon (great circles, curvature, rays to 80/160 km) 1 m above the ground; "
                   "the browser lights a point by the share of the solar disc above that horizon (same rule as sun_frac). "
                   "Inside the 5 m patch the browser also marches toward the Sun over the 5 m heights.",
            limits="Horizon maps are sampled every 80 m (inner) / 600 m (outer) and 5 or 10 deg of azimuth; nothing under the DEM resolution is drawn; no synthetic relief.",
            si_use="Code written with Claude Code (AI) during the event; data are NASA LOLA + JPL Horizons.",
        ),
        data=dict(
            site=site, name_en=info["name_en"], name_ko=info["name_ko"], lat=LAT, lon=LON, ground_h=round(h0, 1), mast_m=2.0, R=R,
            inner=dict(half=8000.0, mesh_step=40.0, mesh_n=401, hz_step=80.0, hz_n=201, naz=72, dem_m=dem_m),
            outer=dict(half=60000.0, step=600.0, n=201, naz=36),
            patch=patch,
            ground_sun_frac_1m=[round(float(v), 2) for v in ground],
        ),
    )
    (out / "scene.json").write_text(json.dumps(scene, ensure_ascii=False, separators=(",", ":")))
    write_index()
    log("done ->", out)


def inner_dems(ter, lat, lon):
    """Which LOLA grids the inner +-8 km heights come from: [40], [40, 80] or [80] (the 40 m map stops at 85 S)."""
    fine = ~np.isnan(ter.fine.sample(lat[::8, ::8], lon[::8, ::8], ter.LINE_SIGN))
    return [40] if fine.all() else ([80] if not fine.any() else [40, 80])


def add_dem(site):
    """Write data.inner.dem_m into an existing scene.json (for scenes made before the field existed)."""
    f = ROOT / "data" / "scene3d" / site / "scene.json"
    scene = json.loads(f.read_text())
    lat, lon = scene["data"]["lat"], scene["data"]["lon"]
    g = np.arange(-8000.0, 8000.0 + 1, 40.0)
    E, N = np.meshgrid(g, g)
    la, lo = tr.offset_point(lat, lon, np.degrees(np.arctan2(E, N)), np.hypot(E, N))
    scene["data"]["inner"]["dem_m"] = inner_dems(tr.Terrain(), la, lo)
    f.write_text(json.dumps(scene, ensure_ascii=False, separators=(",", ":")))
    print(site, scene["data"]["inner"]["dem_m"])


def make_patch(site, ter, LAT, LON, P0, e0, n0, up0, out):
    """The finest real terrain near the site, as 16-bit heights on its own 5 m grid plus the map from east/north to texels.

    First choice: the NASA PGDA shape-from-shading model (LROC NAC photographs on LOLA, 5 m), which resolves real small
    craters between the laser tracks. Otherwise the LOLA 5 m polar map (south of 87.5 S). Returns None when neither exists."""
    SC = 5.0
    sfs = ROOT / "data" / "raw" / "sfs" / site / "elev.tif"
    raws = sorted((ROOT / "data" / "raw").glob(f"lola5m_{site}_rows_*.i16"))
    rho = 2 * R * np.tan(np.pi / 4 + np.radians(LAT) / 2)
    xs, ys = rho * np.sin(np.radians(LON)), rho * np.cos(np.radians(LON))
    if sfs.exists():
        import geotiff_min
        z, info = geotiff_min.read(sfs)
        x0, y0 = float(info["tiepoint"][3]), float(info["tiepoint"][4])
        c0, r0 = int((xs - x0) / SC), int((y0 - ys) / SC)
        HALF = min(1500, c0 - 2, r0 - 2, z.shape[1] - 3 - c0, z.shape[0] - 3 - r0)
        if HALF < 400:
            raise SystemExit(f"{site}: the SfS model does not reach +-2 km around the site")
        hgt = z[r0 - HALF: r0 + HALF + 1, c0 - HALF: c0 + HALF + 1].astype(np.float64)
        bad = hgt < -1e30
        J, I = np.meshgrid(np.arange(-HALF, HALF + 1), np.arange(-HALF, HALF + 1), indexing="ij")
        x, y = x0 + (c0 + I + 0.5) * SC, y0 - (r0 + J + 0.5) * SC
        source = "NASA PGDA shape-from-shading model, 5 m/px (LROC NAC photographs on LOLA; Bertone et al. 2026, doi:10.5281/zenodo.17954508), " \
                 f"+-{HALF * SC / 1000:.1f} km around the site"
        note = "SfS model: terrain detail from LROC NAC photographs where the ground is sunlit in them; LOLA elsewhere"
    elif raws:
        N5, OFF = 30336, 15167.5
        a0, _ = (int(v) for v in raws[0].stem.split("_")[-2:])
        rows = np.fromfile(raws[0], dtype="<i2").reshape(-1, N5)
        cs, cl = int(round(OFF + xs / SC)), int(round(OFF - ys / SC))
        HALF = 800
        hgt = rows[cl - HALF - a0: cl + HALF + 1 - a0, cs - HALF: cs + HALF + 1].astype(np.float64) * 0.5
        bad = np.zeros(hgt.shape, bool)
        J, I = np.meshgrid(np.arange(-HALF, HALF + 1), np.arange(-HALF, HALF + 1), indexing="ij")
        x, y = (cs + I - OFF) * SC, -(cl + J - OFF) * SC
        source = "LDEM_875S_5M.IMG (LOLA, 5 m/px, to 87.5S), +-4 km around the site"
        note = "LDEM_875S_5M label: generated using preliminary LOLA data; between laser tracks the map is interpolated"
    else:
        return None
    la = np.degrees(2 * np.arctan(np.hypot(x, y) / (2 * R)) - np.pi / 2)
    lo = np.degrees(np.arctan2(x, y))
    if bad.any():                                            # holes in the fine model: fall back to the 40 m map there
        hgt[bad] = ter.height(la[bad], lo[bad])
    up, _, _ = tr.enu(la, lo)
    d = (R + hgt)[..., None] * up - P0
    E, N, z = d @ e0, d @ n0, d @ up0
    del d, up
    # check against the 40/80 m DEM before trusting it
    chk = hgt[::100, ::100] - ter.height(la[::100, ::100], lo[::100, ::100])
    log(f"fine patch vs 40 m DEM: mean {chk.mean():.2f} m, rms {np.sqrt((chk ** 2).mean()):.2f} m, holes {bad.mean() * 100:.2f}%")
    # 16-bit heights around a midpoint, in the finest unit the range allows (a crater 1 km below the site still fits)
    z_off = float(np.round((z.max() + z.min()) / 2, 1))
    z_unit = max(0.01, float(np.ceil((z.max() - z.min()) / 65000 * 100) / 100))
    np.round((z - z_off) / z_unit).astype("<i2").tofile(out / "patch_z5.i16")
    sub = (slice(None, None, 4), slice(None, None, 4))       # the map is affine to well under a texel; fit it on every 4th point
    A = np.c_[E[sub].ravel(), N[sub].ravel(), np.ones(E[sub].size)]
    col = np.linalg.lstsq(A, (I[sub] + HALF).ravel().astype(float), rcond=None)[0]
    row = np.linalg.lstsq(A, (J[sub] + HALF).ravel().astype(float), rcond=None)[0]
    res = max(np.abs(A @ col - (I[sub] + HALF).ravel()).max(), np.abs(A @ row - (J[sub] + HALF).ravel()).max())
    log(f"east/north -> texel map: worst error {res:.3f} texel")
    return dict(n=2 * HALF + 1, step_m=SC, half_m=HALF * SC, z_unit_m=z_unit, z_offset_m=z_off,
                col=[float(v) for v in col], row=[float(v) for v in row], source=source, note=note, map_error_texel=round(float(res), 3),
                holes_filled_frac=round(float(bad.mean()), 4),
                check_vs_40m=dict(mean_m=round(float(chk.mean()), 2), rms_m=round(float(np.sqrt((chk ** 2).mean())), 2)))


def redo_patch(site):
    """Rebuild only the fine patch of an existing scene (the horizon maps stay)."""
    out = ROOT / "data" / "scene3d" / site
    f = out / "scene.json"
    scene = json.loads(f.read_text())
    LAT, LON = scene["data"]["lat"], scene["data"]["lon"]
    ter = tr.Terrain()
    up0, e0, n0 = tr.enu(np.float64(LAT), np.float64(LON))
    h0 = float(ter.height(np.array([LAT]), np.array([LON]))[0])
    patch = make_patch(site, ter, LAT, LON, (R + h0) * up0, e0, n0, up0, out)
    scene["data"]["patch"] = patch
    t = scene["meta"]["terrain"]
    t["files"] = [x for x in t["files"] if "5 m/px" not in x] + ([patch["source"]] if patch else [])
    t["note_5m"] = patch["note"] if patch else ""
    scene["meta"]["generated_utc"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
    f.write_text(json.dumps(scene, ensure_ascii=False, separators=(",", ":")))
    log("patch redone ->", out, patch and patch["source"])


def write_index():
    """data/scene3d/index.json: which sites have a 3D scene (the web reads this first)."""
    base = ROOT / "data" / "scene3d"
    sites = sorted(p.parent.name for p in base.glob("*/scene.json"))
    (base / "index.json").write_text(json.dumps(dict(meta=dict(project="Moonkeeper", file="scene3d/index.json", dummy=False),
                                                     data=dict(sites=sites)), separators=(",", ":")))


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--index":
        write_index()
    elif len(sys.argv) > 2 and sys.argv[1] == "--patch":
        for s in sys.argv[2:]:
            redo_patch(s)
    elif len(sys.argv) > 2 and sys.argv[1] == "--dem":
        for s in sys.argv[2:]:
            add_dem(s)
    else:
        main(sys.argv[1] if len(sys.argv) > 1 else "cr1")
