"""Minimal GeoTIFF reader (numpy + zlib only): classic or BigTIFF, strips or tiles, 32-bit float or 8/16-bit,
no compression / Deflate / LZW, horizontal or floating-point predictor. Enough for the NASA PGDA SfS products."""
import struct, zlib
import numpy as np

T = {1: ('B', 1), 2: ('c', 1), 3: ('H', 2), 4: ('I', 4), 5: ('II', 8), 11: ('f', 4), 12: ('d', 8), 16: ('Q', 8), 17: ('q', 8), 18: ('Q', 8), 6: ('b', 1), 8: ('h', 2), 9: ('i', 4)}


def _lzw(data):
    """TIFF LZW (MSB first, early change)."""
    out = bytearray(); table = [bytes([i]) for i in range(256)] + [b'', b'']
    bits = 9; buf = 0; nb = 0; prev = None
    for byte in data:
        buf = (buf << 8) | byte; nb += 8
        while nb >= bits:
            code = (buf >> (nb - bits)) & ((1 << bits) - 1); nb -= bits
            if code == 256:
                table = table[:258]; bits = 9; prev = None; continue
            if code == 257: return bytes(out)
            if prev is None: entry = table[code]
            elif code < len(table): entry = table[code]; table.append(prev + entry[:1])
            else: entry = prev + prev[:1]; table.append(entry)
            out += entry; prev = entry
            if len(table) >= (1 << bits) - 1 and bits < 12: bits += 1
    return bytes(out)


def read(path, info_only=False):
    f = open(path, 'rb'); h = f.read(16)
    e = '<' if h[:2] == b'II' else '>'
    big = struct.unpack(e + 'H', h[2:4])[0] == 43
    off = struct.unpack(e + 'Q', h[8:16])[0] if big else struct.unpack(e + 'I', h[4:8])[0]
    f.seek(off)
    n = struct.unpack(e + ('Q' if big else 'H'), f.read(8 if big else 2))[0]
    tags = {}
    for _ in range(n):
        ent = f.read(20 if big else 12)
        tag, typ = struct.unpack(e + 'HH', ent[:4])
        cnt = struct.unpack(e + ('Q' if big else 'I'), ent[4:12 if big else 8])[0]
        val = ent[12:] if big else ent[8:]
        fmt, sz = T.get(typ, ('B', 1))
        if sz * cnt > len(val):
            pos = f.tell(); f.seek(struct.unpack(e + ('Q' if big else 'I'), val)[0]); raw = f.read(sz * cnt); f.seek(pos)
        else: raw = val[:sz * cnt]
        if typ == 2: tags[tag] = raw.decode('latin1').rstrip('\0')
        elif typ == 5: tags[tag] = np.frombuffer(raw, e + 'u4').reshape(-1, 2)
        else: tags[tag] = np.frombuffer(raw, e + fmt.replace('II', 'I'))
    W, H = int(tags[256][0]), int(tags[257][0])
    bps = int(tags.get(258, [1])[0]); fmt = int(tags.get(339, [1])[0]); comp = int(tags.get(259, [1])[0]); pred = int(tags.get(317, [1])[0])
    info = dict(width=W, height=H, bits=bps, sample_format=fmt, compression=comp, predictor=pred,
                scale=tags.get(33550), tiepoint=tags.get(33922), nodata=tags.get(42113), tiled=322 in tags)
    if info_only: return info
    dt = np.dtype(e + {(32, 3): 'f4', (64, 3): 'f8', (8, 1): 'u1', (16, 1): 'u2', (16, 2): 'i2', (32, 1): 'u4', (32, 2): 'i4'}[(bps, fmt)])
    out = np.zeros((H, W), dt)
    def decode(raw, h, w):
        if comp in (8, 32946): raw = zlib.decompress(raw)
        elif comp == 5: raw = _lzw(raw)
        elif comp != 1: raise ValueError(f'compression {comp}')
        if pred == 3:   # floating-point predictor: bytes are differenced and de-interleaved by significance
            b = np.frombuffer(raw, 'u1')[:h * w * dt.itemsize].reshape(h, w * dt.itemsize)
            b = np.cumsum(b, axis=1, dtype='u1').reshape(h, dt.itemsize, w)
            a = np.ascontiguousarray(b[:, ::-1, :].transpose(0, 2, 1)).view('<' + dt.str[1:]).reshape(h, w)
            return a
        a = np.frombuffer(raw, dt)[:h * w].reshape(h, w)
        if pred == 2: a = np.cumsum(a, axis=1, dtype=dt)
        return a
    if 322 in tags:
        tw, th = int(tags[322][0]), int(tags[323][0]); offs, cnts = tags[324], tags[325]; k = 0
        for y in range(0, H, th):
            for x in range(0, W, tw):
                f.seek(int(offs[k])); a = decode(f.read(int(cnts[k])), th, tw); k += 1
                out[y:y + th, x:x + tw] = a[:min(th, H - y), :min(tw, W - x)]
    else:
        rps = int(tags.get(278, [H])[0]); offs, cnts = tags[273], tags[279]
        for k, y in enumerate(range(0, H, rps)):
            f.seek(int(offs[k])); hh = min(rps, H - y); out[y:y + hh] = decode(f.read(int(cnts[k])), hh, W)
    return out, info
