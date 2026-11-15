"""South-pole "when and where" map: for every 320 m cell and every landing date, does a
14-day mission keep power and communication?

Same rules as the site pipeline (moonkeeper_b): Sun disc fraction above the terrain
horizon, Earth visible if any part of its disc is above the horizon, window metrics
(sun_mean, longest_dark_h, comm_frac, longest_comm_gap_h) and margins from
data/criteria.json. Approach lighting is NOT in this map (it is checked per site).

Terrain: NASA LOLA LDEM_80S_80M. One observer point per 320 m cell (the cell centre,
2 m mast). Horizons in 144 map directions on the 80 m DEM out to 40 km, then on its
320 m to 2.6 km means out to 250 km; exact sphere geometry, rays end at the DEM edge (80S). Sun and Earth: JPL Horizons
sub-points (data/derived/subpoints_2026_2028_1h.npz).

  python3 pipeline/make_polar_map.py horizon     # about 3 min on 8 cores -> data/raw/polar_hor_*.i16
  python3 pipeline/make_polar_map.py integrate   # about 5 min            -> data/raw/polar_margin_*.u8
  python3 pipeline/make_polar_map.py pack        # -> data/polar/ (lossless WebP atlases, height map, polar.json)
"""
import json
import sys
import time
from multiprocessing import get_context
from pathlib import Path

import numpy as np

SUN_RADIUS_KM, EARTH_RADIUS_KM = 695700.0, 6378.137   # same values as moonkeeper_b/ephem.py

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "polar"
R = 1737400.0
CELL = 320.0          # m, 4 x 4 mean of the 80 m DEM
NF = 1900             # full 320 m grid (7600 / 4), +-304 km
N = 1088              # map grid, +-174.08 km
I_OFF = (NF - N) // 2
K = 144               # horizon directions (2.5 deg)
BLOCK = 4             # shipped cell = 4 x 4 map cells (1.28 km), best cell of the block
N2 = N // BLOCK
MAST = 2.0
HOR = RAW / f"polar_hor_{int(CELL)}m_k{K}.i16"
MARG = RAW / "polar_margin.u8"
SITEM = RAW / "polar_site_metrics.npy"
NPROC = 8
ENC_LO, ENC_SPAN = -1.0, 2.5   # margin -> u8: (m - lo) / span * 255
COLS = 15                      # atlas: 15 x 15 frames


def load_dem():
    dn = np.fromfile(RAW / "LDEM_80S_80M.IMG", dtype="<i2").reshape(7600, 7600)
    return dn.astype(np.float32) * 0.5


def pyramid(h80):
    L0 = h80.reshape(NF, 4, NF, 4).mean(axis=(1, 3), dtype=np.float32)
    levels = [L0]
    for _ in range(3):
        a = levels[-1]
        if a.shape[0] % 2:
            a = np.pad(a, ((0, 1), (0, 1)), mode="edge")
        n = a.shape[0] // 2
        levels.append(a.reshape(n, 2, n, 2).mean(axis=(1, 3), dtype=np.float32))
    return levels


def steps():
    """(distance m, level). Level -2 = the 80 m DEM itself; 0..3 = 320 m .. 2560 m means."""
    out, d = [], 0.0
    while d < 4000 - 1:
        d += 80.0
        out.append((d, -2))
    while d < 16000 - 1:
        d += 160.0
        out.append((d, -2))
    while d < 40000 - 1:
        d += 320.0
        out.append((d, -2))
    while d < 250e3:
        st = d * 0.012
        d += st
        out.append((d, 0 if st < 500 else 1 if st < 1000 else 2 if st < 2000 else 3))
    return out


def sample(L, fi, fj):
    n = L.shape[0]
    ok = (fi >= 0) & (fi <= n - 1.001) & (fj >= 0) & (fj <= n - 1.001)
    np.clip(fi, 0, n - 1.001, out=fi)
    np.clip(fj, 0, n - 1.001, out=fj)
    i0 = fi.astype(np.int32)
    j0 = fj.astype(np.int32)
    fi -= i0
    fj -= j0
    idx = i0 * n + j0
    flat = L.reshape(-1)
    top = flat[idx] * (1 - fj) + flat[idx + 1] * fj
    bot = flat[idx + n] * (1 - fj) + flat[idx + n + 1] * fj
    v = top * (1 - fi) + bot * fi
    v[~ok] = -2e5      # outside the DEM: far below, never the horizon (keep R + h positive)
    return v


G = {}


def _init_horizon():
    dem = load_dem()
    G["pyr"] = {lv: a for lv, a in enumerate(pyramid(dem))}
    G["pyr"][-2] = dem
    ii, jj = np.meshgrid(np.arange(N, dtype=np.float32) + I_OFF, np.arange(N, dtype=np.float32) + I_OFF, indexing="ij")
    G["I0"], G["J0"] = ii.reshape(-1), jj.reshape(-1)
    # the observer is one point per 320 m cell (its centre), 2 m above the 80 m DEM
    G["hO"] = sample(dem, (G["I0"] + 0.5) * 4 - 0.5, (G["J0"] + 0.5) * 4 - 0.5) + MAST
    G["steps"] = steps()


def horizon_dir(k):
    phi = 2 * np.pi * k / K
    dj, di = np.sin(phi) / CELL, -np.cos(phi) / CELL     # map x -> column, map y -> -row
    I0, J0, hO = G["I0"], G["J0"], G["hO"]
    best = np.full(I0.size, -10.0, np.float32)
    for d, lv in G["steps"]:
        sc = 4.0 if lv == -2 else 1.0 / (1 << lv)
        fi = (I0 + np.float32(di * d) + 0.5) * np.float32(sc) - 0.5
        fj = (J0 + np.float32(dj * d) + 0.5) * np.float32(sc) - 0.5
        hT = sample(G["pyr"][lv], fi, fj)
        th = d / R
        one_minus_c, s = 2 * np.sin(th / 2) ** 2, np.sin(th)
        rt = hT + np.float32(R)
        ratio = ((hT - hO) - rt * np.float32(one_minus_c)) / (rt * np.float32(s))
        np.maximum(best, ratio, out=best)
    el = np.degrees(np.arctan(best))
    mm = np.memmap(HOR, dtype=np.int16, mode="r+", shape=(K, N * N))
    mm[k] = np.round(el * 100).astype(np.int16)
    mm.flush()
    return k


def run_horizon():
    t0 = time.time()
    np.memmap(HOR, dtype=np.int16, mode="w+", shape=(K, N * N)).flush()
    _init_horizon()
    with get_context("fork").Pool(NPROC) as p:
        for i, k in enumerate(p.imap_unordered(horizon_dir, range(K))):
            if i % 16 == 0:
                print(f"dir {i + 1}/{K}  {time.time() - t0:.0f}s", flush=True)
    print(f"horizon done {time.time() - t0:.0f}s", flush=True)


# ---------- time integration ----------

def cell_xy():
    c = (np.arange(N, dtype=np.float64) - N / 2 + 0.5) * CELL
    x = np.broadcast_to(c[None, :], (N, N))
    y = np.broadcast_to(-c[:, None], (N, N))
    return x, y


def up_vectors():
    x, y = cell_xy()
    rho = np.hypot(x, y)
    c = 2 * np.arctan(rho / (2 * R))
    sl, cl = x / rho, y / rho
    return ((np.sin(c) * cl).astype(np.float32).reshape(-1), (np.sin(c) * sl).astype(np.float32).reshape(-1),
            (-np.cos(c)).astype(np.float32).reshape(-1))


def site_cells():
    hm = json.load(open(ROOT / "data" / "outputs" / "heatmap.json"))["data"]
    out = []
    for (lat, lon) in hm["site_latlon"]:
        rho = 2 * R * np.tan(np.pi / 4 + np.radians(lat) / 2)
        x, y = rho * np.sin(np.radians(lon)), rho * np.cos(np.radians(lon))
        j = int(np.floor(x / CELL + N / 2))
        i = int(np.floor(-y / CELL + N / 2))
        out.append(i * N + j)
    return hm, np.array(out)


def criteria():
    c = json.load(open(ROOT / "data" / "criteria.json"))
    cr = c["criteria"]
    return (cr["power_mean"]["limit"], cr["power_dark"]["limit"], cr["comm_frac"]["limit"], cr["comm_gap"]["limit"],
            int(c["mission_duration_days"]))


def n_windows():
    sp = np.load(ROOT / "data" / "derived" / "subpoints_2026_2028_1h.npz")
    T = sp["times"].size
    days = criteria()[4]
    return (T - 12 - 24 * days) // 24 + 1, sp


def merge(blocks, key):
    best = np.zeros(blocks[0][key + "b"].size, np.uint16)
    suf = np.zeros_like(best)
    for b in blocks:
        p = b[key + "p"]
        np.maximum(best, b[key + "b"], out=best)
        np.maximum(best, suf + p, out=best)
        full = p == 24
        suf = np.where(full, suf + 24, b[key + "s"]).astype(np.uint16)
    return best


def integrate(rng):
    j0, j1 = rng
    NV, sp = n_windows()
    lim_sun, lim_dark, lim_comm, lim_gap, days = criteria()
    H = np.memmap(HOR, dtype=np.int16, mode="r", shape=(K, N * N))
    out = np.memmap(MARG, dtype=np.uint8, mode="r+", shape=(NV, N2, N2, 2))
    ux, uy, uz = up_vectors()
    _, cells = site_cells()
    site_out = np.zeros((j1 - j0, cells.size, 4), np.float32)
    sl, sb = np.radians(sp["sun_lon"]), np.radians(sp["sun_lat"])
    el_, eb = np.radians(sp["earth_lon"]), np.radians(sp["earth_lat"])
    NN = N * N
    ring = []
    t0 = time.time()

    def hor_at(lon_rad):
        f = (np.degrees(lon_rad) % 360.0) / (360.0 / K)
        k0 = int(np.floor(f)) % K
        fr = np.float32(f - np.floor(f))
        return (H[k0].astype(np.float32) * (1 - fr) + H[(k0 + 1) % K].astype(np.float32) * fr) * np.float32(0.01)

    for jb in range(j0, j1 + days - 1):
        blk = dict(sun=np.zeros(NN, np.float32), com=np.zeros(NN, np.uint8))
        for key in ("d", "g"):
            blk[key + "b"] = np.zeros(NN, np.uint8)
            blk[key + "p"] = np.zeros(NN, np.uint8)
        run = dict(d=np.zeros(NN, np.uint8), g=np.zeros(NN, np.uint8))
        allp = {}
        for hh in range(24):
            t = 12 + 24 * jb + hh
            # Sun: disc fraction above the horizon
            s = (np.cos(sb[t]) * np.cos(sl[t]), np.cos(sb[t]) * np.sin(sl[t]), np.sin(sb[t]))
            el = np.degrees(np.arcsin(ux * np.float32(s[0]) + uy * np.float32(s[1]) + uz * np.float32(s[2])))
            rs = np.degrees(np.arcsin(SUN_RADIUS_KM / sp["sun_dist_km"][t]))
            d = np.clip((el - hor_at(sl[t])) / np.float32(rs), -1.0, 1.0)
            frac = 1.0 - (np.arccos(d) - d * np.sqrt(1.0 - d * d)) / np.float32(np.pi)
            blk["sun"] += frac
            dark = frac < 0.5
            # Earth: any part of the disc above the horizon (topocentric, parallax included)
            D = sp["earth_dist_km"][t] * 1000.0
            e = (np.cos(eb[t]) * np.cos(el_[t]), np.cos(eb[t]) * np.sin(el_[t]), np.sin(eb[t]))
            dot = (ux * np.float32(e[0]) + uy * np.float32(e[1]) + uz * np.float32(e[2])) * np.float32(D)
            den = np.sqrt(np.float32(D * D + R * R) - np.float32(2 * R) * dot.astype(np.float64)).astype(np.float32)
            ee = np.degrees(np.arcsin((dot - np.float32(R)) / den))
            re = np.degrees(np.arcsin(EARTH_RADIUS_KM * 1000.0 / D))
            vis = (ee + np.float32(re)) > hor_at(el_[t])
            blk["com"] += vis
            for key, bad in (("d", dark), ("g", ~vis)):
                r = run[key]
                r += 1
                r *= bad
                np.maximum(blk[key + "b"], r, out=blk[key + "b"])
                if hh == 0:
                    allp[key] = bad.copy()
                else:
                    allp[key] &= bad
                blk[key + "p"] += allp[key]
        blk["ds"], blk["gs"] = run["d"], run["g"]
        ring.append(blk)
        if len(ring) == days:
            j = jb - (days - 1)
            hours = 24.0 * days
            sun_mean = sum(b["sun"] for b in ring) / np.float32(hours)
            comm = sum(b["com"].astype(np.float32) for b in ring) / np.float32(hours)
            ldark = merge(ring, "d").astype(np.float32)
            lgap = merge(ring, "g").astype(np.float32)
            site_out[j - j0] = np.stack([sun_mean[cells], ldark[cells], comm[cells], lgap[cells]], axis=1)
            pm = np.minimum((sun_mean - lim_sun) / lim_sun, (lim_dark - ldark) / lim_dark)
            cm = np.minimum((comm - lim_comm) / lim_comm, (lim_gap - lgap) / lim_gap)
            ov = np.minimum(pm, cm).reshape(N2, BLOCK, N2, BLOCK).transpose(0, 2, 1, 3).reshape(N2, N2, BLOCK * BLOCK)
            a = np.argmax(ov, axis=2)[..., None]
            for c, m in enumerate((pm, cm)):
                mb = m.reshape(N2, BLOCK, N2, BLOCK).transpose(0, 2, 1, 3).reshape(N2, N2, BLOCK * BLOCK)
                v = np.take_along_axis(mb, a, axis=2)[..., 0]
                out[j, :, :, c] = np.clip(np.round((v - ENC_LO) / ENC_SPAN * 255), 0, 255).astype(np.uint8)
            ring.pop(0)
            if j0 == 0 and (j - j0) % 10 == 0:
                print(f"window {j - j0 + 1}/{j1 - j0}  {time.time() - t0:.0f}s", flush=True)
    out.flush()
    return j0, site_out


def run_integrate():
    t0 = time.time()
    NV, _ = n_windows()
    np.memmap(MARG, dtype=np.uint8, mode="w+", shape=(NV, N2, N2, 2)).flush()
    edges = np.linspace(0, NV, NPROC + 1).astype(int)
    parts = [(int(a), int(b)) for a, b in zip(edges[:-1], edges[1:])]
    hm, cells = site_cells()
    site = np.zeros((NV, cells.size, 4), np.float32)
    with get_context("fork").Pool(NPROC) as p:
        for j0, so in p.imap_unordered(integrate, parts):
            site[j0:j0 + so.shape[0]] = so
    np.save(SITEM, site)
    print(f"integrate done {time.time() - t0:.0f}s, windows {NV}", flush=True)


# ---------- pack for the web ----------

def check_sites():
    hm, _ = site_cells()
    site = np.load(SITEM)                     # (NV, 8, 4)
    NV = site.shape[0]
    lim_sun, lim_dark, lim_comm, lim_gap, _ = criteria()
    rows = []
    for s, sid in enumerate(hm["site_ids"]):
        ref = {k: np.array(hm["metrics"][k][s][:NV], dtype=float) for k in ("sun_mean", "longest_dark_h", "comm_frac", "longest_comm_gap_h")}
        ours = dict(sun_mean=site[:, s, 0], longest_dark_h=site[:, s, 1], comm_frac=site[:, s, 2], longest_comm_gap_h=site[:, s, 3])
        def ok(m):
            return ((m["sun_mean"] >= lim_sun) & (m["longest_dark_h"] <= lim_dark) & (m["comm_frac"] >= lim_comm) & (m["longest_comm_gap_h"] <= lim_gap))
        a, b = ok(ref), ok(ours)
        rows.append(dict(site=sid, same_verdict=round(float((a == b).mean()), 4), pass_site_pipeline=int(a.sum()), pass_map_cell=int(b.sum()),
                         sun_mean_rmse=round(float(np.sqrt(np.mean((ref["sun_mean"] - ours["sun_mean"]) ** 2))), 4),
                         comm_frac_rmse=round(float(np.sqrt(np.mean((ref["comm_frac"] - ours["comm_frac"]) ** 2))), 4)))
    return rows


def run_pack():
    from PIL import Image
    OUT.mkdir(parents=True, exist_ok=True)
    NV, sp = n_windows()
    m = np.memmap(MARG, dtype=np.uint8, mode="r", shape=(NV, N2, N2, 2))
    per = COLS * COLS
    atlases = []
    for a in range((NV + per - 1) // per):
        img = np.zeros((COLS * N2, COLS * N2, 3), np.uint8)
        for f in range(a * per, min(NV, (a + 1) * per)):
            r, c = divmod(f - a * per, COLS)
            img[r * N2:(r + 1) * N2, c * N2:(c + 1) * N2, :2] = m[f]
        # lossless, in steps of 4 codes (0.04 margin) placed so that the pass / fail edge (margin 0) stays exact
        zero = int(round((0 - ENC_LO) / ENC_SPAN * 255))
        q = np.clip(zero + ((img[..., :2].astype(np.int16) - zero) // 4) * 4 + 2, 0, 255).astype(np.uint8)
        img[..., :2] = q
        name = f"margin_{a}.webp"
        Image.fromarray(img).save(OUT / name, lossless=True, quality=60, method=4)
        atlases.append(name)
        print(name, (OUT / name).stat().st_size // 1024, "kB", flush=True)
    # share of the map that passes, per date (for the date strip)
    lo = (0 - ENC_LO) / ENC_SPAN * 255
    share = [round(float(((m[f, :, :, 0] >= lo) & (m[f, :, :, 1] >= lo)).mean()), 4) for f in range(NV)]
    # height map: full 80 m DEM averaged to 400 m (1520 x 1520), 0.5 m steps in two bytes
    h = load_dem().reshape(1520, 5, 1520, 5).mean(axis=(1, 3))
    q = np.clip(np.round((h + 10000.0) * 2), 0, 65535).astype(np.uint16)
    rgb = np.zeros((1520, 1520, 3), np.uint8)
    rgb[..., 0], rgb[..., 1] = q >> 8, q & 255
    Image.fromarray(rgb).save(OUT / "height.png", optimize=True)
    print("height.png", (OUT / "height.png").stat().st_size // 1024, "kB", float(h.min()), float(h.max()))
    lim = criteria()
    T = sp["times"]
    idx = [12 + 24 * j for j in range((T.size - 12) // 24 + 1) if 12 + 24 * j < T.size]
    payload = dict(
        meta=dict(
            file="polar.json", made_by="강민", generated_utc=time.strftime("%Y-%m-%dT%H:%MZ", time.gmtime()),
            what="For every map cell and landing date: margin of a 14-day mission against the assumed power and comm criteria.",
            terrain="NASA LRO LOLA LDEM_80S_80M (PDS); height.png is the same DEM averaged to 400 m",
            ephemeris="NASA/JPL Horizons sub-solar and sub-Earth points, DE441, hourly",
            method=f"one point every 320 m (2 m mast); terrain horizon in {K} directions on the 80 m DEM to 40 km, coarser means to 250 km "
                   "(sphere geometry, rays end at 80S); hourly Sun disc fraction and "
                   "Earth visibility (any part of the disc); window metrics and margins as in the site pipeline; "
                   f"each shipped {int(CELL * BLOCK)} m cell holds the best of its 16 points",
            limits="One point per 320 m on 80 m terrain misses narrow ridges and small craters, so site verdicts come from the 40 m site pipeline "
                   "(data/outputs/heatmap.json), not from this map. Approach lighting is not in the map. Criteria are assumed values.",
            criteria_status="assumed",
            criteria=dict(sun_mean_min=lim[0], longest_dark_h_max=lim[1], comm_frac_min=lim[2], longest_comm_gap_h_max=lim[3], mission_days=lim[4]),
            si_use="Code written with Claude Code (SI) during the event; data are NASA LOLA + JPL Horizons.",
        ),
        data=dict(
            n=N2, cell_m=CELL * BLOCK, half_km=N * CELL / 2000.0, cols=COLS, frames_per_atlas=per, atlases=atlases, n_frames=NV,
            encode=dict(lo=ENC_LO, span=ENC_SPAN, channels=["power_margin", "comm_margin"]),
            height=dict(file="height.png", n=1520, cell_m=400.0, half_km=304.0, offset_m=-10000.0, step_m=0.5),
            landing_times_utc=[str(T[i])[:16] + "Z" for i in idx],
            sun_lon=[round(float(sp["sun_lon"][i]), 3) for i in idx], sun_lat=[round(float(sp["sun_lat"][i]), 4) for i in idx],
            earth_lon=[round(float(sp["earth_lon"][i]), 3) for i in idx], earth_lat=[round(float(sp["earth_lat"][i]), 4) for i in idx],
            pass_share=share,
            check_vs_site_pipeline=check_sites(),
        ),
    )
    json.dump(payload, open(OUT / "polar.json", "w"), ensure_ascii=False, separators=(",", ":"))
    for r in payload["data"]["check_vs_site_pipeline"]:
        print(r)
    print("pass share min/max", min(share), max(share))


if __name__ == "__main__":
    for stage in sys.argv[1:] or ["horizon", "integrate", "pack"]:
        dict(horizon=run_horizon, integrate=run_integrate, pack=run_pack)[stage]()
