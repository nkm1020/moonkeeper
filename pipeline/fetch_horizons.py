"""Fetch topocentric Sun and Earth azimuth/elevation for each site from JPL Horizons.

Observer: site on the Moon (CENTER=coord@301, GEODETIC, MEAN_ME frame, DE441), airless.
Quantities 4 (apparent azimuth/elevation) and 13 (angular diameter).
Output: data/raw/horizons/<site>_<body>.csv with columns time_utc, az_deg, el_deg, ang_diam_arcsec.

Observer altitude is set to 0 km above the 1737.4 km sphere: it changes the
Sun/Earth direction by < 0.001 deg. Terrain height and the 2 m mast are used
in the horizon calculation instead.
"""
import csv
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sites import SITES, N_T, T0, T1  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "data" / "raw" / "horizons"
API = "https://ssd.jpl.nasa.gov/api/horizons.api"
BODIES = {"sun": "10", "earth": "399"}


def query(body_id, lat, lon):
    stop = T1.timestamp() - 3600
    from datetime import datetime, timezone
    stop_s = datetime.fromtimestamp(stop, timezone.utc).strftime("%Y-%m-%d %H:%M")
    params = {
        "format": "text", "COMMAND": f"'{body_id}'", "OBJ_DATA": "'NO'", "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'", "CENTER": "'coord@301'", "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{lon % 360:.6f},{lat:.6f},0'",
        "START_TIME": f"'{T0.strftime('%Y-%m-%d %H:%M')}'", "STOP_TIME": f"'{stop_s}'",
        "STEP_SIZE": "'1 h'", "QUANTITIES": "'4,13'", "CSV_FORMAT": "'YES'", "ANG_FORMAT": "'DEG'",
        "APPARENT": "'AIRLESS'", "TIME_DIGITS": "'MINUTES'", "EXTRA_PREC": "'YES'",
    }
    url = API + "?" + urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
    with urllib.request.urlopen(url, timeout=180) as r:
        return r.read().decode("utf-8")


def parse(text):
    if "$$SOE" not in text:
        raise RuntimeError("no ephemeris in response:\n" + text[:2000])
    body = text.split("$$SOE")[1].split("$$EOE")[0].strip().splitlines()
    rows = []
    for line in body:
        f = [x.strip() for x in line.split(",")]
        rows.append((f[0], float(f[3]), float(f[4]), float(f[5])))
    return rows


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for sid, _, _, lat, lon in SITES:
        for bname, bid in BODIES.items():
            path = OUT / f"{sid}_{bname}.csv"
            if path.exists() and sum(1 for _ in open(path)) == N_T + 1:
                print("have", path.name)
                continue
            text = query(bid, lat, lon)
            (OUT / f"{sid}_{bname}.raw.txt").write_text(text.split("$$SOE")[0])  # header only, for the record
            rows = parse(text)
            if len(rows) != N_T:
                raise RuntimeError(f"{sid} {bname}: got {len(rows)} rows, want {N_T}")
            with open(path, "w", newline="") as fh:
                w = csv.writer(fh)
                w.writerow(["time_utc", "az_deg", "el_deg", "ang_diam_arcsec"])
                w.writerows(rows)
            print("got ", path.name, len(rows))
            time.sleep(1)


if __name__ == "__main__":
    main()
