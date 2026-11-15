"""Read per-point horizon files (JSON or npz).

Accepted layouts
  a) point_id[P], az_deg[A], horizon_el[P][A], observer_height_m
  b) point_ids[P], az_step_deg, n_az, horizon_el[P][A] (observer at mast_m),
     optional horizon_el_0m[P][A] (observer on the ground)
"""
import json
from pathlib import Path

import numpy as np


def load_point_horizons(path, variant="auto"):
    """variant: "auto" (ground-level layer if present, else the main one), "0m", or "mast"."""
    p = Path(path)
    if p.suffix == ".npz":
        z = np.load(p, allow_pickle=False)
        d, meta = {k: z[k] for k in z.files}, {}
    else:
        raw = json.loads(p.read_text(encoding="utf-8"))
        meta, d = raw.get("meta", {}), raw.get("data", raw)
    ids = [str(x) for x in (d.get("point_id") if d.get("point_id") is not None else d["point_ids"])]
    if "az_deg" in d:
        az = np.asarray(d["az_deg"], float)
    else:
        az = np.arange(int(d["n_az"])) * float(d["az_step_deg"])
    use_0m = "horizon_el_0m" in d and variant in ("auto", "0m")
    if variant == "0m" and "horizon_el_0m" not in d:
        raise ValueError("file has no ground-level (0 m) horizon layer")
    h = np.asarray(d["horizon_el_0m"] if use_0m else d["horizon_el"], float)
    if use_0m:
        height = 0.0
    else:
        height = float(d.get("observer_height_m", meta.get("observer_height_m", meta.get("mast_m", 0.0))))
    return dict(point_id=ids, az_deg=az, horizon_el=h, observer_height_m=height, meta=meta,
                layer="0m" if use_0m else "main")
