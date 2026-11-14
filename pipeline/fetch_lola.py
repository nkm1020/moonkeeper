"""Download the two LOLA polar DEMs that terrain.py reads into data/raw/ (about 230 MB).

Source: NASA PDS LRO LOLA GDR (LRO-L-LOLA-4-GDR-V1.0), mirrored at imbrium.mit.edu.
Run:  python3 pipeline/fetch_lola.py
"""
import sys
import urllib.request
from pathlib import Path

BASE = "https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/"
FILES = {  # name: expected size in bytes
    "LDEM_85S_40M.LBL": 4986,
    "LDEM_85S_40M.IMG": 115034112,
    "LDEM_80S_80M.LBL": 4986,
    "LDEM_80S_80M.IMG": 115520000,
}
RAW = Path(__file__).resolve().parent.parent / "data" / "raw"


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    for name, size in FILES.items():
        out = RAW / name
        if out.exists() and out.stat().st_size == size:
            print(f"ok   {name}")
            continue
        part = out.with_name(name + ".part")
        print(f"get  {name} ({size / 1e6:.0f} MB)", flush=True)
        urllib.request.urlretrieve(BASE + name, part)
        if part.stat().st_size != size:
            sys.exit(f"size mismatch for {name}: {part.stat().st_size} != {size}")
        part.replace(out)
    print("done")


if __name__ == "__main__":
    main()
