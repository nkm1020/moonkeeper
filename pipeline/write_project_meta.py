"""Write data/project_meta.json from sites.py, so every result file can copy the same `meta`.

Run:  python3 pipeline/write_project_meta.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sites import SITES, N_T, T0, T1, STEP_H, MAST_M, R_MOON_KM, iso  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "data" / "project_meta.json"

META = {
    "project": "Moonkeeper",
    "event": "NASA Space Apps Challenge 2026 · Lunar Landing Site Navigator",
    "time": {
        "scale": "UTC",
        "t0_utc": iso(T0),
        "t_end_utc_exclusive": iso(T1),
        "step_h": STEP_H,
        "n_times": N_T,
    },
    "frame": "MEAN_ME",
    "ref_radius_km": R_MOON_KM,
    "lat_unit": "deg",
    "lon_convention": "east_positive",
    "mast_m": MAST_M,
    "sites": [
        {"id": sid, "name_ko": ko, "name_en": en, "lat": lat, "lon_east": lon}
        for sid, ko, en, lat, lon in SITES
    ],
    "terrain": {
        "source": "NASA LRO LOLA GDR polar DEMs (PDS LRO-L-LOLA-4-GDR-V1.0, imbrium.mit.edu)",
        "files": ["LDEM_85S_40M.IMG (40 m/px, to 85S)", "LDEM_80S_80M.IMG (80 m/px, to 80S)"],
    },
    "ephemeris": {
        "source": "NASA/JPL Horizons API, DE441",
        "observer": "site on the Moon (coord@301, MEAN_ME), airless",
    },
}


def main():
    OUT.write_text(json.dumps(META, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(OUT.parent.parent)}")


if __name__ == "__main__":
    main()
