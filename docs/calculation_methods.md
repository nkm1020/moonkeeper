# Re-planning heatmap, ghost landers, and validation

Part of MoonKeeper (calculation: 현지). Code in `pipeline/moonkeeper_b/` and `pipeline/run_*.py`; results in `data/outputs/` (fields: `data/outputs/README.md`).

## What this part does
- **Re-planning heatmap**: for each landing site x landing date, checks whether power (sunlight), direct-to-Earth communication and approach-path lighting stay within limits for the mission duration, and how much margin is left. After a launch delay it lists "same site, later date" and "same date, other site" alternatives.
- **Ghost landers**: samples 1,000 landing points from the landing dispersion around a target and reports the probability that all criteria are met, with a 95% Wilson score interval and a breakdown of failure causes.
- **Validation**: compares our geometry with JPL Horizons and our long-term solar visibility with the NASA PGDA illumination maps (Mazarico et al. 2011).

## Methods
### Window metrics (per site, per landing time t0, mission duration D)
| Metric | Definition |
|---|---|
| `sun_mean` | mean visible fraction of the solar disc over [t0, t0+D) |
| `longest_dark_h` | longest continuous run with less than half of the solar disc visible |
| `first_sunset_h` | time from t0 to the first such dark step |
| `comm_frac` | fraction of time Earth is above the terrain horizon |
| `longest_comm_gap_h` | longest continuous run without Earth visibility |
| `approach` | approach-path lighting value supplied by the approach-lighting module |

Window means use cumulative sums, so any (t0, D) is evaluated in constant time.
Each criterion has a threshold; margin = (value - limit)/|limit| for minimum limits and (limit - value)/|limit| for maximum limits. The cell value is the smallest margin; a cell passes when every margin is >= 0.
Thresholds in `EXAMPLE_CRITERIA` are placeholders, not mission requirements. Values used in results are listed with their sources in the References section, or marked as assumptions.

### Ghost landers
1. Pass/fail is precomputed on a grid around the target (horizon mask -> visibility -> window metrics).
2. N landing offsets are drawn from a 2-D Gaussian (along-track and cross-track sigma, rotated by the approach heading), with a fixed random seed.
3. Each sample takes the nearest grid point's outcome.
4. p = k/N with a 95% Wilson score interval. With N = 1,000 the half-width is at most about 3.1 percentage points.
5. Seed-to-seed spread is checked against sqrt(p(1-p)/N).

### Validation
- **Horizons**: airless topocentric azimuth/elevation of the Sun and Earth from lunar surface sites (`CENTER='coord@301'`, east-positive longitude, DE441, MEAN_ME). Error is the angular separation between directions (median, 95th percentile, max), compared with the 0.27 deg solar radius.
- **Long-term Sun/Earth directions**: one Horizons series (target Moon, geocentric observer, QUANTITIES 14,15,19,20) gives the sub-solar and sub-Earth points in MOON_ME and the distances. Sun and Earth positions are rebuilt relative to the Moon's centre and projected onto each site's local frame with parallax. Against Horizons topocentric values at a south-polar site, the difference is about 0.0002 deg (Sun) and 0.004 deg (Earth).
- **PGDA**: share of time the Sun is visible (any part of the disc, as defined in the PDS label of AVGVISIB_85S_060M_201608) at area-uniform random points between 85 and 90 deg S, compared with the 60 m map (bias, RMSE, MAE, Pearson and Spearman correlation, Bland-Altman limits of agreement).

### Validation sample design (why these 150 points)
- **Purpose**: the PGDA maps give a long-term average visibility for every 60 m pixel. Comparing at random points tests the whole chain (terrain horizon, Sun/Earth directions, visibility rule) everywhere, not only at favourable landing sites.
- **Region**: 85.2-90 deg S, inside the 85-90 deg S PGDA map with a margin from its edge. Points within 0.01 deg of the pole are excluded because azimuth is undefined there.
- **Area-uniform sampling**: sin(latitude) and longitude are drawn uniformly, so every unit of surface area is equally likely. Drawing latitude uniformly would over-sample the area near the pole.
- **Size n = 150**: the standard error of the mean difference is about sd/sqrt(150), roughly 0.08 sd, which is precise enough to report bias and RMSE, while keeping the horizon computation short.
- **Fixed seed (42)** and the list was made **before** any comparison, so the sample cannot be tuned to the results. Points without data are reported, not replaced.
- File: `data/points/validation_points_n150_seed42.csv`, created by `pipeline/make_point_lists.py validation --n 150 --lat-min -90 --lat-max -85.2 --seed 42`.

## How to run
```
pip install -r requirements.txt
python -m pytest -q tests
python pipeline/run_heatmap.py data/inputs                # heatmap.json, planb_candidates.json
python pipeline/run_ghost_landers.py --site im2 --landing 2028-02-05T12:00 \
    --grid data/points/grid_im2_r800_s80.csv --horizons data/inputs/grid_horizons_im2.json
python pipeline/run_validation_pgda.py --points data/points/validation_points_n150_seed42.csv \
    --horizons data/inputs/horizons_validation_n150_seed42.json --pgda data/derived/pgda_at_validation_points.csv \
    --subpoints data/derived/subpoints_2010_2028_6h.npz
```
Thresholds come from `data/criteria.json` (copy `data/criteria.template.json`); without it, outputs are marked provisional.
Colab: open `notebooks/B_quickstart.ipynb` and run all cells.

## Cross-check with the site inputs
For two sites, Sun/Earth directions rebuilt from the Horizons sub-point series agree with the site files (Horizons topocentric) within 0.0007 deg (Sun) and 0.004 deg (Earth), and the resulting visibility flags match.
For the ghost-lander grid, the centre point (G0158) reproduces the im2 window metrics in `heatmap.json`.

## Limitations
- Ghost landers use the site's approach-lighting value for every grid point.
- Nearest-grid lookup ignores variation smaller than the grid spacing.
- Landing dispersion is modelled as Gaussian.
- Within the solar disc width the terrain horizon is treated as a straight line (in the visibility module).
- PGDA maps are 60 m pixel averages; point comparisons include this resolution difference.
- The PGDA map was computed from the 60 m LDEM_85S_060M; our horizons use the 40 m and 80 m LOLA DEMs, so part of any difference comes from the terrain models.
- Horizon rays in the site inputs stop at the DEM edge (about 80 deg S), so very distant terrain is not seen.

## Data products
JSON outputs carry a `meta` block read from `data/project_meta.json` plus `data/calc_meta.json` (SI-assistance disclosure and references for this part).
