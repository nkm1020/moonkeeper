"""NHF (Neural Horizon Field): a point on the lunar south polar cap -> its horizon.

Input is the position (x, y) in km (x = R cos(lat) cos(lon), y = R cos(lat) sin(lon)) and, optionally,
cheap terrain features from nhf_features.py (elevation angles of the nearby LOLA terrain). Output is the
horizon elevation (deg) at 720 grid azimuths (0.5 deg) for observers ground + 0 m and ground + 2 m, so
1440 numbers. Grid azimuths come from nhf_make_training_data.py: local azimuth = grid azimuth - lon_east.
Use `predict_local` to get each point's own azimuths (0 = local north toward the equator, clockwise).

Two position encodings: "fourier" (sin/cos at octave frequencies) or "grid" (multi-resolution dense 2-D
feature grids, bilinear), followed by an MLP.
"""
import math

import numpy as np
import torch
import torch.nn.functional as F
from torch import nn

R_KM = 1737.4
XY_SCALE_KM = 170.0  # the cap south of 84.5 S has a radius of about 166.5 km
NAZ = 720
HEIGHTS_M = (0.0, 2.0)
FEAT_CLIP_DEG = (-30.0, 60.0)

_TER = None


def latlon_to_xy_km(lat, lon_east):
    la, lo = np.radians(np.asarray(lat, float)), np.radians(np.asarray(lon_east, float))
    return np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo)], -1) * R_KM


def terrain_features(lat, lon_east, naz=72, dist_set="v1", ter=None):
    """nhf_features.terrain_features with a lazily loaded DEM."""
    global _TER
    import nhf_features as nf
    if ter is None:
        if _TER is None:
            import terrain as tr
            _TER = tr.Terrain()
        ter = _TER
    return nf.terrain_features(ter, lat, lon_east, naz=naz, dist_km=nf.DIST_SETS_KM[dist_set])


class FourierEncoding(nn.Module):
    def __init__(self, n_freq=9):
        super().__init__()
        self.register_buffer("freqs", 2.0 ** torch.arange(n_freq) * math.pi)
        self.dim = 2 + 4 * n_freq

    def forward(self, xy):
        a = (xy[..., None] * self.freqs).flatten(-2)
        return torch.cat([xy, torch.sin(a), torch.cos(a)], -1)


class GridEncoding(nn.Module):
    def __init__(self, resolutions=(16, 32, 64, 128, 256, 512), n_feat=4):
        super().__init__()
        self.grids = nn.ParameterList(
            [nn.Parameter(torch.empty(n_feat, r + 1, r + 1).uniform_(-1e-4, 1e-4)) for r in resolutions])
        self.dim = n_feat * len(resolutions)

    def forward(self, xy):
        g = xy.reshape(1, -1, 1, 2)
        feats = [F.grid_sample(p[None], g, mode="bilinear", align_corners=True)[0, :, :, 0].T for p in self.grids]
        return torch.cat(feats, -1)


class NHF(nn.Module):
    def __init__(self, encoding="fourier", n_freq=9, resolutions=(16, 32, 64, 128, 256, 512), n_feat=4,
                 width=512, depth=5, n_terrain=0, feat_naz=72, residual=False, dist_set="v1"):
        super().__init__()
        self.config = dict(encoding=encoding, n_freq=n_freq, resolutions=list(resolutions), n_feat=n_feat,
                           width=width, depth=depth, n_terrain=n_terrain, feat_naz=feat_naz, residual=residual,
                           dist_set=dist_set)
        self.n_terrain = n_terrain
        self.feat_naz = feat_naz
        self.residual = residual and n_terrain > 0
        # coarse horizon (max over the feature distances) interpolated from feat_naz to NAZ grid azimuths
        x = torch.arange(NAZ) * (feat_naz / NAZ)
        self.register_buffer("c_i0", x.floor().long() % feat_naz)
        self.register_buffer("c_i1", (x.floor().long() + 1) % feat_naz)
        self.register_buffer("c_fr", x - x.floor())
        self.enc = FourierEncoding(n_freq) if encoding == "fourier" else GridEncoding(resolutions, n_feat)
        layers, d = [], self.enc.dim + n_terrain
        for _ in range(depth):
            layers += [nn.Linear(d, width), nn.SiLU()]
            d = width
        layers.append(nn.Linear(d, NAZ * len(HEIGHTS_M)))
        self.mlp = nn.Sequential(*layers)
        self.register_buffer("y_mean", torch.zeros(NAZ * len(HEIGHTS_M)))
        self.register_buffer("y_std", torch.ones(NAZ * len(HEIGHTS_M)))
        self.register_buffer("f_mean", torch.zeros(n_terrain))
        self.register_buffer("f_std", torch.ones(n_terrain))

    def coarse_horizon(self, feat):
        """[B, 2, NAZ]: highest feature elevation per direction for each observer height (features hold
        both heights, see nhf_features.py), linearly interpolated to the grid azimuths."""
        c = feat.view(feat.shape[0], len(HEIGHTS_M), self.feat_naz, -1).amax(-1)
        return c[..., self.c_i0] * (1 - self.c_fr) + c[..., self.c_i1] * self.c_fr

    def forward(self, xy_km, feat=None):
        """xy_km [B,2] (+ terrain features [B,n_terrain]) -> horizon (deg) [B, 2, 720] at grid azimuths.

        With residual=True the MLP predicts the difference from the coarse horizon of the features.
        """
        z = self.enc(xy_km / XY_SCALE_KM)
        if self.n_terrain:
            f = feat.clamp(*FEAT_CLIP_DEG)
            z = torch.cat([z, (f - self.f_mean) / self.f_std], -1)
        out = (self.mlp(z) * self.y_std + self.y_mean).view(-1, len(HEIGHTS_M), NAZ)
        if self.residual:
            out = out + self.coarse_horizon(feat)
        return out


def save_checkpoint(path, model, extra=None):
    torch.save({"config": model.config, "state": model.state_dict(), "extra": extra or {}}, path)


def load_checkpoint(path, device="cpu"):
    ck = torch.load(path, map_location=device, weights_only=False)
    model = NHF(**ck["config"]).to(device)
    model.load_state_dict(ck["state"])
    model.eval()
    return model, ck.get("extra", {})


def grid_to_local(hz_grid, lon_east, az_step_deg):
    """[P, 720] at grid azimuths -> [P, n] at local azimuths j*az_step_deg (linear, wraps around)."""
    hz_grid = np.asarray(hz_grid)
    n = int(round(360.0 / az_step_deg))
    beta = (np.arange(n)[None, :] * az_step_deg + np.asarray(lon_east, float)[:, None]) % 360.0
    x = beta / (360.0 / NAZ)
    i0 = np.floor(x).astype(int) % NAZ
    f = x - np.floor(x)
    rows = np.arange(hz_grid.shape[0])[:, None]
    return hz_grid[rows, i0] * (1 - f) + hz_grid[rows, (i0 + 1) % NAZ] * f


@torch.no_grad()
def predict_grid(model, lat, lon_east, feat=None, batch=8192):
    """Horizon (deg) [P, 2, 720] at grid azimuths. Terrain features are computed if the model needs them."""
    dev = next(model.parameters()).device
    xy = torch.as_tensor(latlon_to_xy_km(lat, lon_east), dtype=torch.float32, device=dev).reshape(-1, 2)
    f = None
    if model.n_terrain:
        if feat is None:
            feat = terrain_features(lat, lon_east, naz=model.feat_naz, dist_set=model.config["dist_set"])
        f = torch.as_tensor(feat, dtype=torch.float32, device=dev)
    out = [model(xy[i:i + batch], None if f is None else f[i:i + batch]) for i in range(0, len(xy), batch)]
    return torch.cat(out).cpu().numpy()


def predict_local(model, lat, lon_east, height_m, az_step_deg, feat=None):
    """Horizon (deg) [P, n] at each point's own azimuths j*az_step_deg for observer height 0 or 2 m."""
    k = HEIGHTS_M.index(float(height_m))
    return grid_to_local(predict_grid(model, lat, lon_east, feat)[:, k], lon_east, az_step_deg)
