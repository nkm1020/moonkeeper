"""Write NHF horizons in the same formats as the precise files.

  --grid        data/inputs/grid_horizons_im2_nhf.json: the 317 IM-2 grid points, 2 m, 1 deg, meta.method = "NHF",
                same layout as the precise grid_horizons_im2.json (make_grid_horizons.py), which is only read here.
  --validation  data/inputs/validation_horizons_nhf.json: the 150 validation points, 0 m and 2 m, 0.5 deg,
                same layout as 강민's horizons_validation_n150_seed42.json (horizon_el = 2 m, horizon_el_0m = 0 m),
                plus the error against that file: totals in meta.check_vs_precise, per point in data.err_vs_precise.
Each file's meta records the model, its training data and its error against the precise horizons.
Run:  python3 pipeline/nhf_predict.py data/nhf/nhf_b.pt --grid --validation
"""
import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import nhf_model as nm  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
INP = ROOT / "data" / "inputs"
GRID_PRECISE = INP / "grid_horizons_im2.json"
GRID_NHF = INP / "grid_horizons_im2_nhf.json"
VAL_PRECISE = INP / "horizons_validation_n150_seed42.json"
VAL_NHF = INP / "validation_horizons_nhf.json"
METHOD_NOTE = ("NHF = neural horizon field (pipeline/nhf_model.py): a coarse ray cast from 2,448 LOLA samples per "
               "point (72 azimuths x 34 distances, 50 m - 300 km) corrected by a neural network trained on "
               "100,000 precise horizons; precise = ray casting with pipeline/terrain.py (about 3 million samples "
               "per point)")


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")


def r4(x):
    return round(float(x), 4)


def err_stats(pred, ref):
    e = np.abs(np.asarray(pred) - np.asarray(ref))
    return {"mean": r4(e.mean()), "p95": r4(np.quantile(e, 0.95)), "max": r4(e.max())}


def err_report(pred, ref, ids, step, n_worst=5):
    """NHF - precise (deg) at the same point and azimuth: totals over all points x azimuths, and per point."""
    e = np.asarray(pred, float) - np.asarray(ref, float)
    a = np.abs(e)
    rms = np.sqrt((e ** 2).mean(1))
    worst = np.argsort(-a.max(1), kind="stable")[:n_worst]
    total = {
        "mean_abs": r4(a.mean()), "median_abs": r4(np.median(a)), "p95_abs": r4(np.quantile(a, 0.95)),
        "max_abs": r4(a.max()), "bias": r4(e.mean()), "rmse": r4(np.sqrt((e ** 2).mean())),
        "share_abs_over_0.5deg": r4((a > 0.5).mean()), "share_abs_over_1deg": r4((a > 1.0).mean()),
        "per_point_rms": {"n": int(rms.size), "median": r4(np.median(rms)), "p95": r4(np.quantile(rms, 0.95)),
                          "max": r4(rms.max()), "mean": r4(rms.mean())},
        "worst_points": [{"point_id": ids[i], "max_abs": r4(a[i].max()), "at_az_deg": float(a[i].argmax() * step),
                          "rms": r4(rms[i])} for i in worst],
    }
    per_point = {"mean_abs": np.round(a.mean(1), 4).tolist(), "rms": np.round(rms, 4).tolist(),
                 "max_abs": np.round(a.max(1), 4).tolist()}
    return total, per_point


def write_json(path, obj):
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def predict(model, lat, lon, step):
    """{height_m: [P, n] at local azimuths} and the wall time (ms), terrain features included."""
    t0 = time.perf_counter()
    g = nm.predict_grid(model, lat, lon)
    if torch.cuda.is_available():
        torch.cuda.synchronize()
    ms = (time.perf_counter() - t0) * 1000
    return {h: np.round(nm.grid_to_local(g[:, k], lon, step), 3) for k, h in enumerate(nm.HEIGHTS_M)}, ms


def model_meta(ckpt, model, extra):
    data = json.loads(extra.get("data_meta", "{}") or "{}")
    return {
        "checkpoint": ckpt.name, "config": model.config,
        "inputs": "position (x, y) + elevation angles of the LOLA terrain at 72 grid azimuths x 34 distances "
                  "(50 m - 300 km) seen from ground + 0 m and + 2 m",
        "outputs": "horizon at 720 grid azimuths for 0 m and 2 m, as a correction to the coarse horizon "
                   "(highest feature angle per direction)",
        "training_data": {k: data.get(k) for k in ("n", "seed", "region", "held_out", "generated_utc")},
        "holdout_mae_deg_0m_2m": [round(v, 4) for v in extra.get("best", {}).get("holdout_mae_deg", [])],
    }


def write_grid(model, mm, dev):
    pre = json.loads(GRID_PRECISE.read_text())
    assert pre["meta"]["method"] == "precise", f"{GRID_PRECISE.name} is not the precise version"
    d = pre["data"]
    out, ms = predict(model, d["lat"], d["lon_east"], d["az_step_deg"])
    hz = out[2.0]
    meta = dict(pre["meta"], file=GRID_NHF.name, generated_utc=now(), method="NHF", method_note=METHOD_NOTE)
    meta["nhf"] = mm
    meta["check_vs_precise"] = {"file": GRID_PRECISE.name, "abs_err_deg": err_stats(hz, d["horizon_el"]),
                                "nhf_ms_for_all_points": round(ms, 1), "device": dev}
    write_json(GRID_NHF, {"meta": meta, "data": dict(d, horizon_el=hz.tolist())})
    return meta["check_vs_precise"]


def write_validation(model, mm, dev):
    pre = json.loads(VAL_PRECISE.read_text())
    d, pm = pre["data"], pre["meta"]
    out, ms = predict(model, d["lat"], d["lon_east"], d["az_step_deg"])
    t0m, p0m = err_report(out[0.0], d["horizon_el_0m"], d["point_ids"], d["az_step_deg"])
    t2m, p2m = err_report(out[2.0], d["horizon_el"], d["point_ids"], d["az_step_deg"])
    check = {"file": VAL_PRECISE.name,
             "error": "NHF - precise (deg) at the same point and azimuth, over 150 points x 720 azimuths; "
                      "per_point_rms = RMS over the azimuths of each point, summarised over the points; "
                      "per-point values in data.err_vs_precise",
             "horizon_el_0m": t0m, "horizon_el": t2m,
             "nhf_ms_for_all_points": round(ms, 1), "device": dev}
    meta = {
        "project": "Moonkeeper", "file": VAL_NHF.name, "version": "v1", "dummy": False, "generated_utc": now(),
        "made_by": "용휘", "method": "NHF", "method_note": METHOD_NOTE, "points_file": pm["points_file"],
        "frame": "MEAN_ME", "ref_radius_km": 1737.4, "lon_convention": "east_positive",
        "az_convention": "from each point's own local north (along its meridian toward the equator) toward east; "
                         "index k = azimuth k*0.5 deg",
        "elevation": "deg above the observer's local horizontal plane (normal to the sphere radius), "
                     "lunar curvature included",
        "mast_m": 2.0, "heights": "horizon_el = ground + 2 m (mast), horizon_el_0m = ground + 0 m",
        "terrain": pm["terrain"], "nhf": mm, "check_vs_precise": check,
        "si_use": "Code written with Claude Code (AI) during the event; terrain is NASA LOLA.",
    }
    data = {"point_ids": d["point_ids"], "lat": d["lat"], "lon_east": d["lon_east"], "ground_h_m": d["ground_h_m"],
            "az_step_deg": d["az_step_deg"], "n_az": d["n_az"],
            "horizon_el": out[2.0].tolist(), "horizon_el_0m": out[0.0].tolist(),
            "err_vs_precise": {"horizon_el_0m": p0m, "horizon_el": p2m}}
    write_json(VAL_NHF, {"meta": meta, "data": data})
    return {k: (v if not isinstance(v, dict) else {kk: vv for kk, vv in v.items() if kk != "worst_points"})
            for k, v in check.items()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("checkpoint", type=Path)
    ap.add_argument("--grid", action="store_true")
    ap.add_argument("--validation", action="store_true")
    ap.add_argument("--gpu", type=int, default=0)
    args = ap.parse_args()
    dev = f"cuda:{args.gpu}" if torch.cuda.is_available() else "cpu"
    model, extra = nm.load_checkpoint(args.checkpoint, dev)
    nm.predict_grid(model, [-89.0], [0.0])  # load the DEM and warm up the GPU before timing
    mm = model_meta(args.checkpoint, model, extra)
    report = {}
    if args.grid:
        report["grid"] = write_grid(model, mm, dev)
    if args.validation:
        report["validation"] = write_validation(model, mm, dev)
    print(json.dumps(report, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
