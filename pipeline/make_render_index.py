"""data/renders/index.json: which sites have path-traced frames (the web reads this once).

    python3 pipeline/make_render_index.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
base = ROOT / "data" / "renders"
data, meta = {}, None
for f in sorted(base.glob("*/side.json")):
    j = json.loads(f.read_text())
    d = j["data"]
    d["hours"] = sorted(h for h in d["hours"] if (f.parent / d["file"].replace("{hhh}", f"{h:03d}")).exists())
    data[d["site"]] = d
    meta = meta or j["meta"]
out = dict(meta=dict(project="Moonkeeper", file="renders/index.json", dummy=False, kind=(meta or {}).get("kind"), method=(meta or {}).get("method"),
                     limits=(meta or {}).get("limits"), si_use=(meta or {}).get("si_use")), data=data)
(base / "index.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
print({k: len(v["hours"]) for k, v in data.items()})
