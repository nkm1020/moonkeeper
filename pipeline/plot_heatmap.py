"""Quick-look PNG of heatmap.json (for checking, not the web screen)."""
import json
import sys
from pathlib import Path

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

src = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("data/outputs/heatmap.json")
d = json.loads(src.read_text(encoding="utf-8"))
v = d["data"]
m = np.array([[np.nan if x is None else x for x in row] for row in v["overall_margin"]])
t = np.array([s[:10] for s in v["landing_times_utc"]])
fig, ax = plt.subplots(figsize=(14, 3.6))
im = ax.imshow(np.clip(m, -1, 1), aspect="auto", cmap="RdYlGn", vmin=-1, vmax=1, interpolation="nearest")
ax.set_yticks(range(len(v["site_ids"])), v["site_ids"])
ticks = np.arange(0, len(t), 60)
ax.set_xticks(ticks, t[ticks], rotation=45, ha="right", fontsize=8)
ax.set_xlabel(f"Landing date (UTC), mission duration {v['duration_h'] / 24:g} days")
ax.set_title("Re-planning heatmap: overall margin (> 0 = all criteria met). Criteria: " + v["criteria_status"][:60], fontsize=9)
fig.colorbar(im, ax=ax, label="margin", fraction=0.02)
fig.tight_layout()
out = src.with_suffix(".png")
fig.savefig(out, dpi=110)
print(out)
