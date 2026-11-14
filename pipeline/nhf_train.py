"""Train the NHF (pipeline/nhf_model.py) on labels from nhf_make_training_data.py.

A random --val-frac of the training points is held back to pick the best step. The 150 validation points
and the IM-2 grid are not in the training file at all (2 km exclusion), so they stay unseen.
Run:  python3 pipeline/nhf_train.py --data data/nhf/train_n100000_seed7.npz --encoding fourier --gpu 0
"""
import argparse
import json
import math
import sys
import time
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import nhf_model as nm  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent


@torch.no_grad()
def holdout_error(model, xy, y, feat=None, batch=8192):
    """Per-point mean absolute error (deg) [N, 2] for heights 0 m and 2 m."""
    model.eval()
    out = [(model(xy[i:i + batch], None if feat is None else feat[i:i + batch]) - y[i:i + batch]).abs().mean(-1)
           for i in range(0, len(xy), batch)]
    model.train()
    return torch.cat(out)


def load_features(data_path, d, naz, dist_set):
    """Terrain features for the training points, cached next to the data file."""
    cache = data_path.with_suffix(f".feat{naz}{dist_set}h2.npy")
    if cache.exists():
        return np.load(cache)
    import terrain as tr
    import nhf_features as nf
    t0 = time.time()
    feat = nf.terrain_features_parallel(tr.Terrain(), d["lat"], d["lon_east"], naz=naz,
                                        dist_km=nf.DIST_SETS_KM[dist_set])
    np.save(cache, feat)
    print(f"terrain features {feat.shape} in {time.time() - t0:.0f}s -> {cache}", flush=True)
    return feat


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path, required=True)
    ap.add_argument("--out", type=Path, default=None, help="checkpoint path (.pt); a .json log goes next to it")
    ap.add_argument("--encoding", choices=["fourier", "grid"], default="fourier")
    ap.add_argument("--n-freq", type=int, default=9)
    ap.add_argument("--resolutions", type=str, default="16,32,64,128,256,512", help="grid encoding levels")
    ap.add_argument("--n-feat", type=int, default=4, help="features per grid level")
    ap.add_argument("--terrain-feat", action="store_true", help="also feed nhf_features.py terrain features")
    ap.add_argument("--feat-naz", type=int, default=72, help="azimuths of the terrain features")
    ap.add_argument("--dist-set", choices=["v1", "v2"], default="v1", help="distances of the terrain features")
    ap.add_argument("--residual", action="store_true", help="predict the difference from the coarse horizon")
    ap.add_argument("--width", type=int, default=512)
    ap.add_argument("--depth", type=int, default=5)
    ap.add_argument("--steps", type=int, default=20000)
    ap.add_argument("--batch", type=int, default=4096)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--grid-lr", type=float, default=1e-2)
    ap.add_argument("--val-frac", type=float, default=0.05)
    ap.add_argument("--eval-every", type=int, default=500)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--gpu", type=int, default=0)
    args = ap.parse_args()
    out = args.out or ROOT / "data" / "nhf" / f"nhf_{args.encoding}_{time.strftime('%Y%m%d_%H%M%S')}.pt"
    out.parent.mkdir(parents=True, exist_ok=True)

    torch.manual_seed(args.seed)
    torch.set_float32_matmul_precision("high")
    dev = torch.device(f"cuda:{args.gpu}" if torch.cuda.is_available() else "cpu")
    d = np.load(args.data)
    xy = torch.tensor(d["xy_km"], dtype=torch.float32, device=dev)
    y = torch.tensor(np.stack([d["hz0"], d["hz2"]], 1), dtype=torch.float32, device=dev)  # [N, 2, 720]
    n = len(xy)
    perm = torch.randperm(n, generator=torch.Generator().manual_seed(args.seed)).to(dev)
    n_val = int(n * args.val_frac)
    iv, it = perm[:n_val], perm[n_val:]

    feat = None
    if args.terrain_feat:
        feat = torch.tensor(load_features(args.data, d, args.feat_naz, args.dist_set), dtype=torch.float32,
                            device=dev)

    model = nm.NHF(encoding=args.encoding, n_freq=args.n_freq, n_feat=args.n_feat, width=args.width,
                   depth=args.depth, resolutions=[int(r) for r in args.resolutions.split(",")],
                   n_terrain=0 if feat is None else feat.shape[1], feat_naz=args.feat_naz,
                   residual=args.residual, dist_set=args.dist_set).to(dev)
    target = y[it]
    if model.residual:
        target = target - model.coarse_horizon(feat[it])
    model.y_mean.copy_(target.mean(0).flatten())
    model.y_std.copy_(target.std(0).flatten().clamp_min(1e-3))
    del target
    if feat is not None:
        fc = feat[it].clamp(*nm.FEAT_CLIP_DEG)
        model.f_mean.copy_(fc.mean(0))
        model.f_std.copy_(fc.std(0).clamp_min(1e-3))
    y_std = model.y_std.view(1, *y.shape[1:])
    groups = [{"params": list(model.mlp.parameters()), "lr": args.lr}]
    if list(model.enc.parameters()):
        groups.append({"params": list(model.enc.parameters()), "lr": args.grid_lr})
    opt = torch.optim.Adam(groups, betas=(0.9, 0.99), eps=1e-15)
    warm = 500
    sched = torch.optim.lr_scheduler.LambdaLR(
        opt, lambda s: min(1.0, (s + 1) / warm) * max(0.01, 0.5 * (1 + math.cos(math.pi * s / args.steps))))

    print(f"N={n} (train {len(it)}, holdout {n_val})  {model.config}  "
          f"params={sum(p.numel() for p in model.parameters()):,}  device={dev}", flush=True)
    t0, best, log = time.time(), None, []
    for step in range(1, args.steps + 1):
        idx = it[torch.randint(len(it), (args.batch,), device=dev)]
        loss = (((model(xy[idx], None if feat is None else feat[idx]) - y[idx]) / y_std) ** 2).mean()
        opt.zero_grad(set_to_none=True)
        loss.backward()
        opt.step()
        sched.step()
        if step % args.eval_every == 0 or step == args.steps:
            e = holdout_error(model, xy[iv], y[iv], None if feat is None else feat[iv])
            mae = e.mean(0).tolist()
            p95 = torch.quantile(e, 0.95, dim=0).tolist()
            row = {"step": step, "loss": loss.item(), "holdout_mae_deg": mae, "holdout_p95_point_mae_deg": p95,
                   "min": round((time.time() - t0) / 60, 2)}
            log.append(row)
            score = sum(mae) / 2
            tag = ""
            if best is None or score < best["score"]:
                best = {"score": score, "step": step, "holdout_mae_deg": mae, "holdout_p95_point_mae_deg": p95}
                nm.save_checkpoint(out, model, extra={"args": {k: str(v) for k, v in vars(args).items()},
                                                      "best": best, "data_meta": str(d["meta"])})
                tag = "  *"
            print(f"  step {step:6d}  loss {loss.item():.4f}  holdout MAE 0m {mae[0]:.3f}  2m {mae[1]:.3f} deg  "
                  f"(p95 of point MAE {p95[0]:.3f}/{p95[1]:.3f})  {row['min']} min{tag}", flush=True)
    out.with_suffix(".json").write_text(json.dumps({"best": best, "log": log, "config": model.config,
                                                    "args": {k: str(v) for k, v in vars(args).items()}}, indent=1))
    print(f"best step {best['step']}  holdout MAE {best['holdout_mae_deg']}  -> {out}")


if __name__ == "__main__":
    main()
