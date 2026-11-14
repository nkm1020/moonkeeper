"""Check an NHF checkpoint against precise horizons (pipeline/terrain.py ray casting).

  --grid        317 IM-2 grid points, 2 m, 1 deg      (data/inputs/grid_horizons_im2.json)
  --validation  150 validation points, 0 m and 2 m    (data/inputs/horizons_validation_n150_seed42.json)
  --oracle      also convert the precise grid-azimuth labels to local azimuths, to show how much error
                the 0.5 deg grid -> local resampling alone adds (needs the DEMs)
Errors are |NHF - precise| in deg over all points and azimuths: mean, p95, max, plus the worst points.
Run:  python3 pipeline/nhf_eval.py data/nhf/nhf_fourier.pt --grid --oracle
"""
import argparse
import json
import multiprocessing as mp
import sys
import time
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import nhf_model as nm  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
INP = ROOT / "data" / "inputs"


def stats(err):
    return {"mean": round(float(err.mean()), 4), "p95": round(float(np.quantile(err, 0.95)), 4),
            "max": round(float(err.max()), 4)}


def _oracle_job(latlon):
    import nhf_make_training_data as g
    return g.horizons_grid_az(g._TER, latlon[0], latlon[1], g._DISTS)[1]


def oracle(lat, lon, workers=32):
    import nhf_make_training_data as g
    g._init_worker()
    ctx = mp.get_context("fork" if sys.platform.startswith("linux") else "spawn")
    if ctx.get_start_method() == "fork":
        with ctx.Pool(workers) as pool:
            return np.stack(pool.map(_oracle_job, list(zip(lat, lon)), chunksize=2))
    return np.stack([_oracle_job(p) for p in zip(lat, lon)])


def check(model, name, ids, lat, lon, height_m, step, precise, do_oracle):
    t0 = time.perf_counter()
    pred = nm.predict_local(model, lat, lon, height_m, step)
    if torch.cuda.is_available():
        torch.cuda.synchronize()
    ms = (time.perf_counter() - t0) * 1000
    err = np.abs(pred - precise)
    point = err.mean(1)
    worst = np.argsort(point)[::-1][:5]
    res = {"set": name, "height_m": height_m, "az_step_deg": step, "points": len(ids), "abs_err_deg": stats(err),
           "point_mae_deg": stats(point), "worst_points": [[ids[i], round(float(point[i]), 3)] for i in worst],
           "nhf_ms": round(ms, 1)}
    if do_oracle:
        k = nm.HEIGHTS_M.index(float(height_m))
        res["oracle_resample_abs_err_deg"] = stats(np.abs(nm.grid_to_local(oracle(lat, lon)[:, k], lon, step) - precise))
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("checkpoint", type=Path)
    ap.add_argument("--grid", action="store_true")
    ap.add_argument("--validation", action="store_true")
    ap.add_argument("--oracle", action="store_true")
    ap.add_argument("--gpu", type=int, default=0)
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    dev = f"cuda:{args.gpu}" if torch.cuda.is_available() else "cpu"
    model, extra = nm.load_checkpoint(args.checkpoint, dev)
    nm.predict_grid(model, [-89.0], [0.0])  # warm-up

    results = []
    if args.grid:
        d = json.loads((INP / "grid_horizons_im2.json").read_text())["data"]
        results.append(check(model, "grid_im2", d["point_ids"], np.array(d["lat"]), np.array(d["lon_east"]), 2.0,
                             d["az_step_deg"], np.array(d["horizon_el"]), args.oracle))
    if args.validation:
        d = json.loads((INP / "horizons_validation_n150_seed42.json").read_text())["data"]
        for h, key in ((0.0, "horizon_el_0m"), (2.0, "horizon_el")):
            results.append(check(model, "validation_n150", d["point_ids"], np.array(d["lat"]), np.array(d["lon_east"]),
                                 h, d["az_step_deg"], np.array(d[key]), args.oracle))
    report = {"checkpoint": str(args.checkpoint), "config": model.config, "best": extra.get("best"),
              "device": dev, "results": results}
    print(json.dumps(report, indent=1, ensure_ascii=False))
    if args.out:
        args.out.write_text(json.dumps(report, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
