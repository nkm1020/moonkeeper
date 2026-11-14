"""Small statistics helpers."""
import numpy as np
from scipy import stats as _st


def wilson_interval(k, n, z=1.96):
    """Wilson score interval for a binomial proportion. Returns (lo, hi)."""
    if n <= 0:
        return np.nan, np.nan
    p = k / n
    den = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / den
    half = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return max(0.0, centre - half), min(1.0, centre + half)


def longest_run(mask):
    """Length of the longest run of True along the last axis."""
    m = np.asarray(mask, dtype=bool)
    shape = m.shape[:-1]
    m2 = m.reshape(-1, m.shape[-1])
    out = np.zeros(m2.shape[0], dtype=int)
    for i, row in enumerate(m2):
        if not row.any():
            continue
        padded = np.concatenate(([0], row.astype(np.int8), [0]))
        d = np.diff(padded)
        starts, ends = np.flatnonzero(d == 1), np.flatnonzero(d == -1)
        out[i] = int((ends - starts).max())
    return out.reshape(shape)


def first_true(mask):
    """Index of the first True along the last axis; length of the axis if none."""
    m = np.asarray(mask, dtype=bool)
    idx = np.argmax(m, axis=-1)
    return np.where(m.any(axis=-1), idx, m.shape[-1])


def agreement(reference, test):
    """Agreement statistics between a reference and a test measurement."""
    r = np.asarray(reference, dtype=float)
    t = np.asarray(test, dtype=float)
    ok = np.isfinite(r) & np.isfinite(t)
    r, t = r[ok], t[ok]
    d = t - r
    sd = d.std(ddof=1) if d.size > 1 else np.nan
    return dict(
        n=int(d.size),
        bias=float(d.mean()),
        sd_diff=float(sd),
        rmse=float(np.sqrt(np.mean(d ** 2))),
        mae=float(np.mean(np.abs(d))),
        pearson_r=float(_st.pearsonr(r, t)[0]) if d.size > 2 else np.nan,
        spearman_rho=float(_st.spearmanr(r, t)[0]) if d.size > 2 else np.nan,
        loa_low=float(d.mean() - 1.96 * sd),
        loa_high=float(d.mean() + 1.96 * sd),
    )


def summarize(x):
    x = np.asarray(x, dtype=float)
    x = x[np.isfinite(x)]
    return dict(n=int(x.size), median=float(np.median(x)),
                p95=float(np.percentile(x, 95)), max=float(x.max()), mean=float(x.mean()))
