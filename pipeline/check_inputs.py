"""Checks on the real input files: shapes, ranges, internal consistency.

Run after make_inputs.py:  python3 pipeline/check_inputs.py
"""
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sites import SITES, N_T  # noqa: E402

IN = Path(__file__).resolve().parent.parent / "data" / "inputs"


def main():
    v = json.load(open(IN / "visibility.json"))
    a = json.load(open(IN / "approach.json"))
    d, ad = v["data"], a["data"]
    S = len(SITES)
    sf, ev = np.array(d["sun_frac"]), np.array(d["earth_vis"])
    ap, ab = np.array(ad["approach"]), np.array(ad["approach_by_az"])
    D = len(ad["landing_times_utc"])
    assert v["meta"]["dummy"] is False and a["meta"]["dummy"] is False
    assert sf.shape == (S, N_T) and ev.shape == (S, N_T) and len(d["times_utc"]) == N_T
    assert 0 <= sf.min() and sf.max() <= 1 and set(np.unique(ev)) <= {0, 1}
    assert ap.shape == (S, D) and ab.shape == (S, D, 8) and np.allclose(ap, ab.max(axis=2))
    idx = [d["times_utc"].index(t) for t in ad["landing_times_utc"]]
    for i, (sid, *_rest) in enumerate(SITES):
        p = json.load(open(IN / f"panorama_{sid}.json"))["data"]
        assert len(p["horizon_el"]) == 360 and len(p["sun_el"]) == N_T
        # sun_frac must agree with panorama Sun vs horizon (centre above horizon <=> frac >= 0.5)
        h = np.array(p["horizon_el"])
        az, el = np.array(p["sun_az"]), np.array(p["sun_el"])
        x = (az % 360.0)
        hi = h[np.floor(x).astype(int) % 360] * (1 - (x % 1)) + h[(np.floor(x).astype(int) + 1) % 360] * (x % 1)
        agree = ((el >= hi) == (sf[i] >= 0.5)).mean()
        # 720 -> 360 resampling and rounding can flip a few near-grazing hours
        print(f"  {sid:5s} sun_mean={sf[i].mean():.3f} lit={100 * (sf[i] >= 0.5).mean():5.1f}% "
              f"earth={100 * ev[i].mean():5.1f}%  approach_mean={ap[i].mean():.2f}  "
              f"pad-lit-approach-dark={int(((sf[i, idx] >= 0.5) & (ap[i] < 0.5)).sum())}  "
              f"panorama-agree={100 * agree:.2f}%")
        assert agree > 0.99
    print("ALL CHECKS OK")


if __name__ == "__main__":
    main()
