"""Download the NASA PGDA shape-from-shading terrain (5 m/px) for one site: only the two files we use, read out of
the region's zip with HTTP range requests (the zips are 1-2 GB each).

    python3 pipeline/fetch_sfs.py cr1      # -> data/raw/sfs/cr1/elev.tif (about 20 MB), omos.tif (about 40 MB), README.txt

Source: Bertone, S. et al., "Enhanced Topography Models for selected Lunar South Pole regions with Shape-from-Shading",
NASA PGDA product 104, Zenodo doi:10.5281/zenodo.17954508 (CC BY 4.0). 13 Artemis III candidate regions; our sites
cr1, gr1, mp1 and lp1 are inside four of them. sr1, im2, pole and shk are not covered.
"""
import io
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REC = "https://zenodo.org/api/records/17954508/files/{}/content"
REGION = dict(cr1="A3CLR22_6_Connecting_Ridge.zip", gr1="A3CLR22_9_deGerlache_Rim.zip",
              mp1="A3CLR22_11_Malapert_Massif.zip", lp1="A3CLR22_10_Leibnitz_Beta_Plateau.zip")


class HttpFile(io.RawIOBase):
    def __init__(self, url):
        self.url, self.pos = url, 0
        with urllib.request.urlopen(urllib.request.Request(url, method="HEAD"), timeout=60) as r:
            self.size = int(r.headers["Content-Length"])

    def seekable(self): return True
    def readable(self): return True
    def tell(self): return self.pos

    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else self.pos + off if whence == 1 else self.size + off
        return self.pos

    def readinto(self, b):
        n = min(len(b), self.size - self.pos)
        if n <= 0:
            return 0
        req = urllib.request.Request(self.url, headers={"Range": f"bytes={self.pos}-{self.pos + n - 1}"})
        with urllib.request.urlopen(req, timeout=900) as r:
            d = r.read()
        b[:len(d)] = d
        self.pos += len(d)
        return len(d)


def main(site):
    if site not in REGION:
        raise SystemExit(f"{site}: no SfS region covers this site")
    out = ROOT / "data" / "raw" / "sfs" / site
    out.mkdir(parents=True, exist_ok=True)
    if (out / "elev.tif").exists() and (out / "omos.tif").exists():
        print("already here:", out); return
    z = zipfile.ZipFile(io.BufferedReader(HttpFile(REC.format(REGION[site])), buffer_size=1 << 20))
    for m in z.infolist():
        name = m.filename.split("/")[-1]
        if m.filename.count("/") != 1:
            continue
        dest = "elev.tif" if name.endswith("GLDELEV_005.tif") else "omos.tif" if name.endswith("GLDOMOS_005.tif") else "README.txt" if name == "README.txt" else None
        if dest:
            (out / dest).write_bytes(z.read(m)); print(f"{site}: {name} -> {dest} ({m.file_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    for s in sys.argv[1:] or ["cr1"]:
        main(s)
