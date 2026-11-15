"""JSON export with project metadata (data sources, SI disclosure) from project_meta.json."""
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np


def _default(o):
    if isinstance(o, np.ndarray):
        return o.tolist()
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        return None if not np.isfinite(o) else float(o)
    if isinstance(o, (np.bool_,)):
        return bool(o)
    if isinstance(o, np.datetime64):
        return str(o)
    raise TypeError(type(o))


def _clean(o, nd=None):
    if isinstance(o, dict):
        return {str(k): _clean(v, nd) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_clean(v, nd) for v in o]
    if isinstance(o, np.ndarray):
        return _clean(o.tolist(), nd) if o.dtype != object else [_clean(v, nd) for v in o.tolist()]
    if isinstance(o, (bool, np.bool_)):
        return bool(o)
    if isinstance(o, (float, np.floating)):
        if not np.isfinite(o):
            return None
        return round(float(o), nd) if nd is not None else float(o)
    if isinstance(o, np.integer):
        return int(o)
    return o


def load_meta(meta_path="project_meta.json"):
    """meta_path: one path or a list of paths; later files add to earlier ones."""
    meta = {}
    for p in ([meta_path] if isinstance(meta_path, (str, Path)) else meta_path):
        p = Path(p)
        if p.exists():
            meta.update(json.loads(p.read_text(encoding="utf-8")))
    return meta


def save_json(path, payload, meta_path="project_meta.json", decimals=None, compact=False, **extra_meta):
    meta = load_meta(meta_path)
    meta.update(extra_meta)
    meta["generated_utc"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(_clean({"meta": meta, "data": payload}, decimals), default=_default,
                      indent=None if compact else 1, separators=(",", ":") if compact else None,
                      ensure_ascii=False)
    Path(path).write_text(text, encoding="utf-8")
    return path
