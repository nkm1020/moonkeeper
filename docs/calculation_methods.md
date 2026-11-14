# Re-planning heatmap, ghost landers, and validation

Part of MoonKeeper (calculation: 현지). 현지 set the direction, requested each check below and reviewed every setting; the code was drafted with SI (AI) assistance (Claude). Code in `pipeline/moonkeeper_b/` and `pipeline/run_*.py`; results in `data/outputs/` (fields: `data/outputs/README.md`).

## What this part does
- **Re-planning heatmap**: for each landing site x landing date, checks whether power (sunlight), direct-to-Earth communication and approach-path lighting stay within limits for the mission duration, and how much margin is left. After a launch delay it lists "same site, later date" and "same date, other site" alternatives, ranked by the Plan B rule (Keev): eligible candidates only, then higher margin, shorter waiting time, shorter distance; candidates with missing values are flagged for review.
- **Ghost landers**: samples 1,000 landing points from the landing dispersion around a target and reports the probability that all criteria are met, with a 95% Wilson score interval and a breakdown of failure causes.
- **Validation**: compares our long-term Sun and Earth visibility with the NASA PGDA illumination maps (Mazarico et al. 2011) at 150 random points.

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
2. N landing offsets are drawn from a 2-D Gaussian (along-track and cross-track sigma, rotated by the approach heading), with a fixed random seed. With equal sigmas (the current 100 m assumption) the heading has no effect.
3. Each sample takes the nearest grid point's outcome.
4. p = k/N with a 95% Wilson score interval. With N = 1,000 the half-width is at most about 3.1 percentage points.
5. Seed-to-seed spread is checked against sqrt(p(1-p)/N).

### Validation
- **Long-term Sun/Earth directions**: one Horizons series (target Moon, geocentric observer, QUANTITIES 14,15,19,20) gives the sub-solar and sub-Earth points in MOON_ME and the distances. Sun and Earth positions are rebuilt relative to the Moon's centre and projected onto each site's local frame with parallax. In a development check at one south-polar site (not saved as an output file), the difference from Horizons topocentric values was about 0.0002 deg (Sun) and 0.004 deg (Earth).
- **PGDA**: share of time steps with any part of the solar disc (or Earth's disc) above the terrain horizon, at area-uniform random points between 85.2 and 90 deg S, compared with the 60 m maps AVGVISIB_85S_060M_201608 and _EARTH (bias, RMSE, MAE, Pearson and Spearman correlation, Bland-Altman limits of agreement). This is the definition in the PDS labels of both maps: the values "indicate the percentage of timesteps where each pixel was sunlit (by any fraction of the solar disc)", and the same with the Earth disc (https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/extras/illumination/img/). As a check, using the time-mean visible fraction of the solar disc instead gives RMSE 2.4 pp and bias -1.7 pp (vs 1.4 pp and -0.3 pp).

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
    --horizons data/inputs/horizons_validation_n150_seed42.json --nhf data/inputs/validation_horizons_nhf.json \
    --pgda data/derived/pgda_at_validation_points.csv \
    --subpoints data/derived/subpoints_2010_2028_6h.npz
```
Thresholds come from `data/criteria.json` (copy `data/criteria.template.json`); without it, outputs are marked provisional.
Colab: open `notebooks/B_quickstart.ipynb` and run all cells.

## Cross-check with the site inputs
- Sun/Earth series for ghost landers: the final results use 1-hour Horizons data for 2026-11-01 to 2028-12-31 (19,008 hours, `data/derived/subpoints_2026_2028_1h.npz`, fetched by 현지 in Colab). Early test runs used the 6-hour series filled in to 1 hour (cubic spline on direction vectors); against the 1-hour data the filled values differ by less than 0.000002 deg, and every ghost-lander result was identical. Notebook cell 4b repeats the filling check on the 6-hour series (errors below 0.0001 deg, far below the 0.27 deg solar radius).
For two sites, Sun/Earth directions rebuilt from the Horizons sub-point series agree with the site files (Horizons topocentric) within 0.0007 deg (Sun) and 0.004 deg (Earth), and the resulting visibility flags match.
For the ghost-lander grid, the centre point (G0158) reproduces the im2 window metrics in `heatmap.json`.

## NHF horizons vs precise horizons
NHF (neural horizon field, made by 용휘) predicts horizons much faster than the precise ray cast. We ran the same calculations on both.
- Validation points (150, ground level): NHF-based long-term Sun visibility vs PGDA has RMSE 1.43 pp (precise: 1.42 pp); NHF vs precise differ by RMSE 0.48 pp (Sun) and 0.91 pp (Earth).
- Ghost landers (im2, same 1,000 landers, all 97 passing dates, 1-hour Horizons data): on the 83 dates where the precise success probability is 0.9 or higher, NHF agrees within 5 percentage points on all of them. On the 14 riskier dates (precise probability below 0.9), 7 differ by more than 10 points (2028-02-05: 0.71 precise vs 0.28 NHF). NHF was never higher on any date here, because on this grid NHF horizons are on average 0.03 deg higher (0.028 deg, 용휘's check in `grid_horizons_im2_nhf.json`), which lengthens the longest dark period by about 1-2 hours; when many grid points sit near the 96-hour limit, that flips them.
- This direction is not general: at the 150 validation points NHF horizons are on average 0.02 deg lower than precise. So NHF can also be optimistic, and the final call uses precise horizons.
- Speed and agreement (용휘, same machine, `grid_horizons_im2_nhf.json` meta.check_vs_precise): 317 points in 0.21 s with NHF vs 82 s precise on 1 core (5.9 s on 32 cores); lit/not-lit calls agree on 99.5% of point-hours, Earth visible/not on 98.0%.
- Use: NHF for fast screening; precise horizons for the final decision (screen ③ uses precise). File: `data/outputs/nhf_check.json`.

## Limitations
- Ghost landers use the site's approach-lighting value for every grid point.
- Nearest-grid lookup ignores variation smaller than the grid spacing. With an 80 m grid and 100 m sigma, 31 grid points receive 95% of the landers, so the 95% interval covers sampling noise only, not the grid resolution.
- Landing dispersion is modelled as Gaussian.
- Within the solar disc width the terrain horizon is treated as a straight line (in the visibility module).
- PGDA maps are 60 m pixel averages; point comparisons include this resolution difference.
- PGDA averages hourly steps; our long-term comparison uses 6-hour steps to keep the run short.
- The PGDA map was computed from the 60 m LDEM_85S_060M; our horizons use the 40 m and 80 m LOLA DEMs, so part of any difference comes from the terrain models.
- Horizon rays in the site inputs stop at the DEM edge (about 80 deg S), so very distant terrain is not seen.

## Data products
JSON outputs carry a `meta` block read from `data/project_meta.json` plus `data/calc_meta.json` (SI-assistance disclosure and references for this part).
