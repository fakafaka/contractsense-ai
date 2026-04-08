#!/usr/bin/env python3
"""
Generates assets/images/icon.png for ContractSense AI.
1024x1024, dark navy bg, white document, yellow lightning bolt.
Uses bytearray for speed — no external dependencies.
"""
import struct, zlib, math, os

S = 1024
buf = bytearray(S * S * 3)

def idx(x, y): return (y * S + x) * 3

def setp(x, y, r, g, b):
    if 0 <= x < S and 0 <= y < S:
        i = idx(x, y)
        buf[i], buf[i+1], buf[i+2] = r, g, b

def getp(x, y):
    i = idx(x, y)
    return buf[i], buf[i+1], buf[i+2]

def blendp(x, y, r, g, b, a):
    if 0 <= x < S and 0 <= y < S:
        i = idx(x, y)
        buf[i]   = int(buf[i]   * (1-a) + r * a)
        buf[i+1] = int(buf[i+1] * (1-a) + g * a)
        buf[i+2] = int(buf[i+2] * (1-a) + b * a)

# ── background ────────────────────────────────────────────────────────────────
for y in range(S):
    t = y / S
    r = int(15  + t * 8)
    g = int(23  + t * 10)
    b = int(42  + t * 16)
    row_start = y * S * 3
    for x in range(S):
        i = row_start + x * 3
        buf[i], buf[i+1], buf[i+2] = r, g, b

# ── filled rounded rect (solid, fast) ────────────────────────────────────────
def fill_rrect(x0, y0, x1, y1, rad, r, g, b):
    # interior strip (no corners)
    for y in range(y0 + rad, y1 - rad + 1):
        row = y * S * 3
        for x in range(x0, x1 + 1):
            i = row + x * 3
            buf[i], buf[i+1], buf[i+2] = r, g, b
    # top/bottom bands (with corner cutouts)
    for dy in range(rad):
        # compute x extent for this row using circle
        xoff = int(math.sqrt(rad*rad - (rad-dy)*(rad-dy)))
        for y, row_y in [(y0 + dy, y0 + dy), (y1 - dy, y1 - dy)]:
            row = y * S * 3
            for x in range(x0 + rad - xoff, x1 - rad + xoff + 1):
                if 0 <= x < S and 0 <= y < S:
                    i = row + x * 3
                    buf[i], buf[i+1], buf[i+2] = r, g, b

# ── scanline polygon fill ─────────────────────────────────────────────────────
def fill_poly(poly, r, g, b, alpha=1.0):
    min_y = max(0, int(min(p[1] for p in poly)))
    max_y = min(S-1, int(max(p[1] for p in poly)))
    n = len(poly)
    solid = alpha >= 1.0
    for y in range(min_y, max_y + 1):
        xs = []
        for i in range(n):
            ax, ay = poly[i]
            bx, by = poly[(i+1) % n]
            if (ay <= y < by) or (by <= y < ay):
                t = (y - ay) / (by - ay)
                xs.append(ax + t * (bx - ax))
        xs.sort()
        for k in range(0, len(xs)-1, 2):
            xa = max(0, int(math.ceil(xs[k])))
            xb = min(S-1, int(math.floor(xs[k+1])))
            row = y * S * 3
            if solid:
                for x in range(xa, xb+1):
                    i = row + x * 3
                    buf[i], buf[i+1], buf[i+2] = r, g, b
            else:
                for x in range(xa, xb+1):
                    i = row + x * 3
                    buf[i]   = int(buf[i]   * (1-alpha) + r * alpha)
                    buf[i+1] = int(buf[i+1] * (1-alpha) + g * alpha)
                    buf[i+2] = int(buf[i+2] * (1-alpha) + b * alpha)

# ── document shadow ───────────────────────────────────────────────────────────
for sh in range(18, 0, -1):
    a = 0.06 * (1 - sh / 18)
    fill_rrect(248+sh, 190+sh, 776+sh, 834+sh, 52, 5, 10, 20)

# ── document body ─────────────────────────────────────────────────────────────
fill_rrect(248, 190, 776, 834, 52, 255, 255, 255)

# ── folded corner (top-right) ─────────────────────────────────────────────────
FOLD = 88
# triangle that forms the fold flap
fold_flap = [(776-FOLD, 190), (776, 190+FOLD), (776-FOLD, 190+FOLD)]
fill_poly(fold_flap, 185, 200, 220)
# notch out the top-right corner of the document (white would cover it)
notch = [(776-FOLD, 190), (776, 190), (776, 190+FOLD)]
fill_poly(notch, 18, 28, 50)   # match background colour approx

# ── text lines ────────────────────────────────────────────────────────────────
LX0 = 308
LY0 = 310
LH  = 16
LG  = 40
widths = [370, 330, 355, 295, 340, 190]
for i, w in enumerate(widths):
    y0 = LY0 + i * (LH + LG)
    y1 = y0 + LH
    x1 = min(LX0 + w, 776 - 75)
    fill_rrect(LX0, y0, x1, y1, 8, 200, 210, 225)

# ── lightning bolt ────────────────────────────────────────────────────────────
BX, BY = 512, 510
bolt = [
    (BX+34,  BY-200),   # top tip
    (BX-8,   BY-8),     # mid-left upper
    (BX+42,  BY-8),     # mid-right upper
    (BX-34,  BY+200),   # bottom tip
    (BX+7,   BY+16),    # mid-right lower
    (BX-46,  BY+16),    # mid-left lower
]

# glow / shadow
glow = [(x+0, y+5) for x,y in bolt]
fill_poly(glow, 130, 90, 0, 0.3)

# main bolt
fill_poly(bolt, 255, 215, 0)

# inner highlight
hi = [(x-10, y) for x,y in bolt]
fill_poly(hi, 255, 242, 120, 0.5)

# ── PNG encode ────────────────────────────────────────────────────────────────
def encode_png():
    def chunk(tag, data):
        raw = tag + data
        return struct.pack('>I', len(data)) + raw + struct.pack('>I', zlib.crc32(raw) & 0xFFFFFFFF)

    ihdr = struct.pack('>IIBBBBB', S, S, 8, 2, 0, 0, 0)
    # build raw image data (filter byte 0 per row)
    rows = bytearray()
    for y in range(S):
        rows.append(0)
        rows += buf[y*S*3 : y*S*3 + S*3]

    return (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', ihdr)
            + chunk(b'IDAT', zlib.compress(bytes(rows), 6))
            + chunk(b'IEND', b''))

out = os.path.normpath(os.path.join(os.path.dirname(__file__),
      '..', 'assets', 'images', 'icon.png'))
data = encode_png()
with open(out, 'wb') as f:
    f.write(data)
print(f"Written: {out}  ({len(data):,} bytes)")
