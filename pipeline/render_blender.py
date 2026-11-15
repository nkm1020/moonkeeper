"""Path-traced photograph of one site at one hour, from the same real data as the web scene.

    blender -b -P pipeline/render_blender.py -- --site cr1 --landing 2026-11-17T12:00Z --h 56 --cam side --out out.png

Terrain: data/scene3d/<site>/ (NASA PGDA SfS 5 m or LOLA 5 m patch, LOLA 40 m to 8 km, 600 m to 60 km; local east/north/up
metres, curvature included). Sun and Earth: data/inputs/panorama_<site>.json (JPL Horizons). One light, the Sun, with its
true angular size; everything else in the picture is light reflected by the terrain itself (Cycles path tracing).
Limits: terrain beyond 60 km is not in the render; the regolith is a rough diffuse surface (Oren-Nayar), not a Hapke model.
SI use: code written with Claude Code (AI) during the event.
"""
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parent.parent
D2R = math.pi / 180


def args():
    a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    o = dict(site="cr1", landing="2026-11-17T12:00Z", h="0", cam="sun", out="render.png", w="1440", hgt="657", spp="96",
             exposure="2.6", fine_half="3000", shift="0", look_h="", earth="1", hours="", outdir="", overwrite="0")
    for k, v in zip(a[::2], a[1::2]):
        o[k.lstrip("-")] = v
    return o


def grid_mesh(name, E, N, Z, drop=None):
    """A quad grid from 2-D arrays of east, north, up; `drop` removes quads whose four corners are all True."""
    nr, nc = Z.shape
    co = np.stack([E, N, Z], -1).reshape(-1, 3).astype(np.float32)
    j, i = np.meshgrid(np.arange(nr - 1), np.arange(nc - 1), indexing="ij")
    a = (j * nc + i).ravel()
    quads = np.stack([a, a + 1, a + nc + 1, a + nc], 1)
    if drop is not None:
        d = drop.ravel()
        quads = quads[~(d[quads[:, 0]] & d[quads[:, 1]] & d[quads[:, 2]] & d[quads[:, 3]])]
    # make the faces look up (so smooth normals point out of the ground)
    p = co[quads[0]]
    if np.cross(p[1] - p[0], p[3] - p[0])[2] < 0:
        quads = quads[:, ::-1]
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(co)); me.vertices.foreach_set("co", co.ravel())
    me.loops.add(quads.size); me.loops.foreach_set("vertex_index", quads.ravel().astype(np.int32))
    me.polygons.add(len(quads))
    me.polygons.foreach_set("loop_start", np.arange(0, quads.size, 4, dtype=np.int32))
    me.polygons.foreach_set("loop_total", np.full(len(quads), 4, dtype=np.int32))
    me.update(calc_edges=True)
    me.polygons.foreach_set("use_smooth", np.ones(len(quads), dtype=bool))
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def dir_az_el(az, el):
    return Vector((math.cos(el * D2R) * math.sin(az * D2R), math.cos(el * D2R) * math.cos(az * D2R), math.sin(el * D2R)))


def main():
    o = args()
    site, h = o["site"], float(o["h"])
    S = json.load(open(ROOT / "data" / "scene3d" / site / "scene.json"))
    D = S["data"]
    P = json.load(open(ROOT / "data" / "inputs" / f"panorama_{site}.json"))["data"]
    t0 = datetime(2026, 11, 1, tzinfo=timezone.utc)
    L = int((datetime.fromisoformat(o["landing"].replace("Z", "+00:00")) - t0).total_seconds() // 3600)
    i = L + int(round(h))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene

    # ---- terrain: four nested grids, all aligned to east/north, joined without steps ----
    # (at a Sun 1 deg high a 1 m step in the ground casts a 60 m shadow, so the grids must meet exactly)
    sys.path.insert(0, str(ROOT / "pipeline"))
    import terrain as tr
    base = ROOT / "data" / "scene3d" / site
    I = D["inner"]
    IZ = np.fromfile(base / "inner_z.f32", "<f4").reshape(I["mesh_n"], I["mesh_n"]).astype(np.float64)
    ground = float(IZ[(I["mesh_n"] - 1) // 2, (I["mesh_n"] - 1) // 2])
    mat = bpy.data.materials.new("regolith"); mat.use_nodes = True
    nt = mat.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial"); bs = nt.nodes.new("ShaderNodeBsdfDiffuse")
    bs.inputs["Color"].default_value = (0.135, 0.132, 0.128, 1); bs.inputs["Roughness"].default_value = 1.0
    nt.links.new(bs.outputs["BSDF"], out.inputs["Surface"])

    def bil(Z, half, step, E, N):
        """Bilinear height of a regular east/north grid (row = south -> north, column = west -> east)."""
        x = np.clip((E + half) / step, 0, Z.shape[1] - 1.001); y = np.clip((N + half) / step, 0, Z.shape[0] - 1.001)
        i0, j0 = np.floor(x).astype(int), np.floor(y).astype(int); fx, fy = x - i0, y - j0
        return (Z[j0, i0] * (1 - fx) + Z[j0, i0 + 1] * fx) * (1 - fy) + (Z[j0 + 1, i0] * (1 - fx) + Z[j0 + 1, i0 + 1] * fx) * fy

    def ramp(E, N, half, width):
        return np.clip((half - np.maximum(np.abs(E), np.abs(N))) / width, 0, 1)

    # D: the far terrain straight from LOLA (40 m / 80 m maps), every 160 m out to 60 km
    ter = tr.Terrain()
    LAT, LON = D["lat"], D["lon"]
    up0, e0, n0 = tr.enu(np.float64(LAT), np.float64(LON))
    h0 = float(ter.height(np.array([LAT]), np.array([LON]))[0]); P0 = (tr.R_M + h0) * up0
    FAR_HALF, FAR_STEP = 60000.0, 160.0
    g = np.arange(-FAR_HALF, FAR_HALF + 1, FAR_STEP)
    FE, FN = np.meshgrid(g, g)
    la, lo = tr.offset_point(LAT, LON, np.degrees(np.arctan2(FE, FN)), np.hypot(FE, FN))
    hh = ter.height(la, lo); hh = np.where(np.isnan(hh), h0, hh)
    upv, _, _ = tr.enu(la, lo)
    FZ = (((tr.R_M + hh)[..., None] * upv - P0) @ up0)
    del la, lo, upv, hh
    obs = [grid_mesh("far160m", FE, FN, FZ, drop=(np.abs(FE) <= I["half"]) & (np.abs(FN) <= I["half"]))]
    # C: 40 m to 8 km; its last 480 m lean into the far grid so the two meet exactly
    g = np.arange(I["mesh_n"]) * I["mesh_step"] - I["half"]
    CE, CN = np.meshgrid(g, g)
    w = ramp(CE, CN, I["half"], 480.0)
    zD = bil(FZ, FAR_HALF, FAR_STEP, CE, CN)
    CZ = zD + w * (IZ - zD)
    half_b = 0.0
    if D.get("patch"):
        p = D["patch"]; n = p["n"]
        zt = np.fromfile(base / "patch_z5.i16", "<i2").reshape(n, n).astype(np.float64) * p["z_unit_m"] + p["z_offset_m"]

        def patch_z(E, N):
            c = p["col"][0] * E + p["col"][1] * N + p["col"][2]; r = p["row"][0] * E + p["row"][1] * N + p["row"][2]
            c = np.clip(c, 0, n - 1.001); r = np.clip(r, 0, n - 1.001)
            i0, j0 = np.floor(c).astype(int), np.floor(r).astype(int); fx, fy = c - i0, r - j0
            return (zt[j0, i0] * (1 - fx) + zt[j0, i0 + 1] * fx) * (1 - fy) + (zt[j0 + 1, i0] * (1 - fx) + zt[j0 + 1, i0 + 1] * fx) * fy
        # the largest east/north square (on the 40 m lines) that lies inside the patch (the patch is turned by the site's longitude)
        half_b = 0.0
        for hb in np.arange(40.0, p["half_m"] + 1, 40.0):
            cs = [(sx * hb, sy * hb) for sx in (-1, 1) for sy in (-1, 1)]
            ok = all(2 <= p["col"][0] * e + p["col"][1] * nn + p["col"][2] <= n - 3 and 2 <= p["row"][0] * e + p["row"][1] * nn + p["row"][2] <= n - 3 for e, nn in cs)
            if not ok:
                break
            half_b = hb
        fh = min(float(o["fine_half"]), half_b - 400.0)
        fh = math.floor(fh / 40.0) * 40.0
        # B: the fine terrain every 10 m; its last 300 m lean into the 40 m grid
        g = np.arange(-half_b, half_b + 1, 10.0)
        BE, BN = np.meshgrid(g, g)
        zC = bil(CZ, I["half"], I["mesh_step"], BE, BN)
        BZ = zC + ramp(BE, BN, half_b, 300.0) * (patch_z(BE, BN) - zC)
        obs.append(grid_mesh("fine10m", BE, BN, BZ, drop=(np.abs(BE) <= fh) & (np.abs(BN) <= fh)))
        # A: every 5 m around the site; on its rim the odd points sit on the 10 m grid's edges
        g = np.arange(-fh, fh + 1, 5.0)
        AE, AN = np.meshgrid(g, g)
        AZ = patch_z(AE, AN)
        for sl in (np.s_[0, :], np.s_[-1, :], np.s_[:, 0], np.s_[:, -1]):
            line = AZ[sl].copy(); line[1:-1:2] = (line[0:-2:2] + line[2::2]) / 2; AZ[sl] = line
        obs.append(grid_mesh("fine5m", AE, AN, AZ))
        del zt
    obs.append(grid_mesh("near40m", CE, CN, CZ, drop=((np.abs(CE) <= half_b) & (np.abs(CN) <= half_b)) if half_b else None))
    for ob in obs:
        ob.data.materials.append(mat)
    print(f"TERRAIN far 160 m to 60 km, 40 m to 8 km, fine to {half_b:.0f} m", flush=True)

    def z_at(e, nn):
        k = (np.array([nn, e]) + I["half"]) / I["mesh_step"]
        j0, i0 = int(np.clip(k[0], 0, I["mesh_n"] - 2)), int(np.clip(k[1], 0, I["mesh_n"] - 2))
        return float(IZ[j0, i0])

    # ---- Sun (JPL Horizons direction, true angular size) ----
    sun = bpy.data.lights.new("Sun", "SUN"); sun.angle = 2 * P["sun_radius_deg"] * D2R; sun.energy = 6.0
    so = bpy.data.objects.new("Sun", sun); sc.collection.objects.link(so)
    # the solar disc as the camera sees it (the lamp itself is not visible): far, camera rays only
    DS = 300000.0
    bpy.ops.mesh.primitive_circle_add(vertices=64, radius=DS * math.tan(P["sun_radius_deg"] * D2R), fill_type="NGON")
    disc = bpy.context.object; disc.name = "SunDisc"
    em = bpy.data.materials.new("sun"); em.use_nodes = True; ent = em.node_tree; ent.nodes.clear()
    eo = ent.nodes.new("ShaderNodeOutputMaterial"); ee = ent.nodes.new("ShaderNodeEmission")
    ee.inputs["Color"].default_value = (1, 0.97, 0.92, 1); ee.inputs["Strength"].default_value = 4000.0
    ent.links.new(ee.outputs["Emission"], eo.inputs["Surface"]); disc.data.materials.append(em)
    for attr in ("visible_diffuse", "visible_glossy", "visible_transmission", "visible_volume_scatter", "visible_shadow"):
        setattr(disc, attr, False)

    # ---- camera: the same rules as the web's cameras, fixed at the first hour (look_h) ----
    lh = L + int(round(float(o["look_h"]))) if o["look_h"] != "" else i
    sa, ea = P["sun_az"][lh] * D2R, P["earth_az"][lh] * D2R
    dse = math.atan2(math.sin(ea - sa), math.cos(ea - sa))
    if o["cam"] == "side":
        sl = sa + (-1 if dse >= 0 else 1) * 105 * D2R
        ce, cn = -math.sin(sl) * 4200, -math.cos(sl) * 4200
        up = max(ground + 700, z_at(ce, cn) + 300)
        pos = Vector((ce, cn, up))
        tgt = Vector((math.sin(sl) * 600, math.cos(sl) * 600, up - 4800 * math.tan(3.5 * D2R)))
    else:
        look = sa + dse / 2 if abs(dse) <= 66 * D2R else sa + math.copysign(26 * D2R, dse)
        ce, cn = -math.sin(look) * 2600, -math.cos(look) * 2600
        pos = Vector((ce, cn, max(ground + 240, z_at(ce, cn) + 60)))
        tgt = Vector((math.sin(look) * 2200, math.cos(look) * 2200, ground + 60))
    cam = bpy.data.cameras.new("cam"); cam.lens = 24; cam.sensor_width = 36; cam.sensor_fit = "HORIZONTAL"
    cam.clip_start = 2; cam.clip_end = 2e6; cam.shift_y = float(o["shift"])
    co = bpy.data.objects.new("cam", cam); sc.collection.objects.link(co); sc.camera = co
    co.location = pos; co.rotation_euler = (tgt - pos).to_track_quat("-Z", "Y").to_euler()

    # ---- Earth: NASA Blue Marble on a sphere of the right apparent size, lit by the same Sun (so its phase is right) ----
    earth = None
    DE = 250000.0
    if o["earth"] == "1":
        bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=48, radius=DE * math.tan(P["earth_radius_deg"] * D2R))
        earth = bpy.context.object; earth.name = "Earth"; bpy.ops.object.shade_smooth()
        emat = bpy.data.materials.new("earth"); emat.use_nodes = True; et = emat.node_tree; et.nodes.clear()
        eout = et.nodes.new("ShaderNodeOutputMaterial"); eb = et.nodes.new("ShaderNodeBsdfDiffuse"); tex = et.nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(str(ROOT / "web" / "assets" / "earth_bluemarble_2048.jpg"))
        et.links.new(tex.outputs["Color"], eb.inputs["Color"]); et.links.new(eb.outputs["BSDF"], eout.inputs["Surface"])
        earth.data.materials.append(emat)
        earth.visible_diffuse = False; earth.visible_shadow = False
        lat = D["lat"] * D2R                                 # Earth's north along the Moon's axis (within about 25 deg), as on the web
        earth.rotation_euler = Vector((0, math.cos(lat), math.sin(lat))).to_track_quat("Z", "Y").to_euler()

    def place(k):
        sd = dir_az_el(P["sun_az"][k], P["sun_el"][k]); ed = dir_az_el(P["earth_az"][k], P["earth_el"][k])
        so.rotation_euler = sd.to_track_quat("Z", "Y").to_euler()
        disc.location = pos + sd * DS; disc.rotation_euler = (-sd).to_track_quat("Z", "Y").to_euler()
        if earth:
            earth.location = pos + ed * DE

    # ---- render settings ----
    sc.render.engine = "CYCLES"
    try:
        pr = bpy.context.preferences.addons["cycles"].preferences
        pr.compute_device_type = "METAL"; pr.get_devices()
        for d in pr.devices:
            d.use = True
        sc.cycles.device = "GPU"
    except Exception as e:                                   # no GPU: the CPU gives the same picture, slower
        print("GPU not set:", e)
    sc.cycles.samples = int(o["spp"]); sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 6; sc.cycles.diffuse_bounces = 5; sc.cycles.sample_clamp_indirect = 8.0
    sc.render.use_persistent_data = True                     # keep the terrain in memory between hours
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = int(o["w"]), int(o["hgt"]), 100
    w = bpy.data.worlds.new("space"); w.use_nodes = True; w.node_tree.nodes["Background"].inputs["Color"].default_value = (0, 0, 0, 1)
    sc.world = w
    sc.view_settings.view_transform = "AgX"; sc.view_settings.exposure = float(o["exposure"])
    try:
        sc.view_settings.look = "AgX - Medium High Contrast"
    except Exception:
        pass
    meta = dict(project="Moonkeeper", kind="path-traced simulated photograph (Blender Cycles)", dummy=False,
                generated_utc=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"), made_by="강민",
                terrain=S["meta"]["terrain"], ephemeris=S["meta"]["ephemeris"], samples=int(o["spp"]),
                method="One light: the Sun at its JPL Horizons direction and true angular size. All other light is reflected by the terrain (path tracing, 5 diffuse bounces).",
                limits="terrain within 60 km only (LOLA every 160 m beyond 8 km); rough diffuse regolith (Oren-Nayar), not a Hapke model; Earth image NASA Blue Marble 2002, orientation approximate; SIMULATED",
                si_use="Code written with Claude Code (AI) during the event; no generative image model.")
    if o.get("hours"):
        hours = [int(v) for v in o["hours"].split(",")]
        outdir = Path(o["outdir"]).resolve(); outdir.mkdir(parents=True, exist_ok=True)
        sc.render.image_settings.file_format = "JPEG"; sc.render.image_settings.quality = 90
        done = []
        for hh in hours:
            f = outdir / f"{o['cam']}_h{hh:03d}.jpg"
            if not f.exists() or o.get("overwrite") == "1":
                place(L + hh); sc.render.filepath = str(f); bpy.ops.render.render(write_still=True)
            done.append(hh)
            (outdir / f"{o['cam']}.json").write_text(json.dumps(dict(meta=meta, data=dict(
                site=site, landing_utc=o["landing"], camera=o["cam"], hours=done, file="%s_h{hhh}.jpg" % o["cam"],
                width=int(o["w"]), height=int(o["hgt"]), lens_mm=24, frame_mm=36,
                cam_pos_enu=[round(v, 2) for v in pos], cam_target_enu=[round(v, 2) for v in tgt])), ensure_ascii=False))
            print("FRAME_OK", hh, flush=True)
    else:
        place(i)
        sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_depth = "8"
        sc.render.filepath = str(Path(o["out"]).resolve())
        bpy.ops.render.render(write_still=True)
        Path(o["out"]).with_suffix(".json").write_text(json.dumps(dict(meta=meta, data=dict(site=site, landing_utc=o["landing"], hours_after_landing=h, camera=o["cam"])), ensure_ascii=False))
        print("RENDER_OK", o["out"])

main()
