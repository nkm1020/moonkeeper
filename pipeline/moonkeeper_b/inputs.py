"""Readers for the input files from the horizon / visibility pipeline (FORMAT.md v1)."""
import json
from pathlib import Path

import numpy as np


def _times(strings):
    return np.array([s.rstrip("Z") for s in strings], dtype="datetime64[s]")


def load_visibility(path):
    d = json.loads(Path(path).read_text(encoding="utf-8"))
    v = d["data"]
    return dict(meta=d["meta"], site_ids=list(v["site_ids"]), site_names=v.get("site_names"),
                lat=np.array(v["lat"], float), lon_east=np.array(v["lon_east"], float),
                times=_times(v["times_utc"]),
                sun_frac=np.array(v["sun_frac"], float), earth_vis=np.array(v["earth_vis"], float))


def load_approach(path):
    d = json.loads(Path(path).read_text(encoding="utf-8"))
    v = d["data"]
    return dict(meta=d["meta"], site_ids=list(v["site_ids"]), landing_times=_times(v["landing_times_utc"]),
                approach=np.array(v["approach"], float), best_az_deg=np.array(v["best_az_deg"], float),
                approach_az_deg=np.array(v["approach_az_deg"], float))


def align_sites(order, ids, arr):
    """Reorder rows of arr (rows follow ids) to match `order`."""
    idx = [ids.index(s) for s in order]
    return np.asarray(arr)[idx]
