#!/usr/bin/env python3
# ============================================================
# JARUMY — Procesa el logo subido para usarlo en el header:
#  · public/logo-jarumy.png        → logo completo (header)
#  · public/logo-jarumy-icon.png   → icono de la casa (cuadrado)
#  · src/app/icon.png              → favicon (convención Next.js)
#  · scripts/debug-logo-boxes.png  → imagen anotada para verificación
# ============================================================
from PIL import Image, ImageDraw
import os

SRC = '/home/z/my-project/upload/Post_de_Instagram_Día_del_20260912233406.jpeg'
OUT_FULL = '/home/z/my-project/public/logo-jarumy.png'
OUT_ICON = '/home/z/my-project/public/logo-jarumy-icon.png'
OUT_FAVICON = '/home/z/my-project/src/app/icon.png'
OUT_DEBUG = '/home/z/my-project/scripts/debug-logo-boxes.png'

img = Image.open(SRC).convert('RGB')
W, H = img.size
print(f'Origen: {W}x{H}')

px = img.load()

# --- 1) color de fondo: mediana de las 4 esquinas (muestreo 8x8) ---
def corner_color():
    samples = []
    for (cx, cy) in [(0,0),(W-1,0),(0,H-1),(W-1,H-1)]:
        for dx in range(0, 8):
            for dy in range(0, 8):
                x = min(W-1, cx+dx); y = min(H-1, cy+dy)
                samples.append(px[x, y])
    rs = sorted(s[0] for s in samples); gs = sorted(s[1] for s in samples); bs = sorted(s[2] for s in samples)
    n = len(samples)//2
    return (rs[n], gs[n], bs[n])

BG = corner_color()
print(f'Fondo detectado: #{BG[0]:02X}{BG[1]:02X}{BG[2]:02X}')

# --- 2) máscara de contenido (píxeles que difieren del fondo) ---
TH = 55  # suma de diferencias por canal
def is_content(x, y):
    r, g, b = px[x, y]
    return abs(r-BG[0]) + abs(g-BG[1]) + abs(b-BG[2]) > TH

col_has = []  # ¿columna con contenido?
for x in range(W):
    col_has.append(any(is_content(x, y) for y in range(0, H, 3)))
row_has = []
for y in range(H):
    row_has.append(any(is_content(x, y) for x in range(0, W, 3)))

def spans(flags):
    """devuelve [(ini, fin)] de tramos consecutivos con contenido"""
    out, start = [], None
    for i, v in enumerate(flags):
        if v and start is None: start = i
        if not v and start is not None: out.append((start, i-1)); start = None
    if start is not None: out.append((start, len(flags)-1))
    return out

cspans = [s for s in spans(col_has) if s[1]-s[0] >= 3]  # ignora ruido <4px
rspans = spans(row_has)
print('Tramos de columnas con contenido:', cspans)
print('Tramos de filas con contenido:', rspans)

# bbox global de contenido
x0 = cspans[0][0]; x1 = cspans[-1][1]
y0 = rspans[0][0]; y1 = rspans[-1][1]
print(f'BBox contenido: x[{x0},{x1}] y[{y0},{y1}]')

# --- 3) separar icono (cluster izquierdo) del bloque de texto ---
# primer gap >= 18 px entre tramos de columnas → corte icono/texto
cut = None
for i in range(len(cspans)-1):
    gap = cspans[i+1][0] - cspans[i][1]
    if gap >= 18:
        cut = (cspans[i][1] + cspans[i+1][0]) // 2
        print(f'Corte icono/texto en x={cut} (gap {gap}px)')
        break

icon_bbox = None
if cut is not None:
    # bbox del icono (contenido a la izquierda del corte)
    ix0 = cspans[0][0]; ix1 = cut - 1
    irows = [y for y in range(H) if any(is_content(x, y) for x in range(ix0, ix1+1, 2))]
    icon_bbox = (ix0, min(irows), ix1, max(irows))
    print(f'BBox icono: {icon_bbox}')

# --- 4) guardar full: contenido + margen uniforme, fondo BG ---
m = 10
fx0 = max(0, x0 - m); fy0 = max(0, y0 - m)
fx1 = min(W-1, x1 + m); fy1 = min(H-1, y1 + m)
full = img.crop((fx0, fy0, fx1+1, fy1+1))
# optimización: máx 560px de ancho (suficiente para 3x DPR en header ~71px) + paleta adaptativa
if full.size[0] > 560:
    full = full.resize((560, round(full.size[1]*560/full.size[0])), Image.LANCZOS)
full_rgb = full.copy()
full.save(OUT_FULL, optimize=True)
size_rgb = os.path.getsize(OUT_FULL)
q = full.quantize(colors=128, method=Image.MEDIANCUT, dither=Image.FLOYDSTEINBERG)
q.save(OUT_FULL, optimize=True)
size_q = os.path.getsize(OUT_FULL)
if size_q > size_rgb * 1.05:  # la paleta no ayudó → vuelve a RGB
    full_rgb.save(OUT_FULL, optimize=True)
    size_q = size_rgb
print(f'Full guardado: {full.size[0]}x{full.size[1]} · {min(size_q, size_rgb)/1024:.1f} KB')

# --- 5) icono cuadrado: bbox del icono + margen 14% rellenado con BG ---
if icon_bbox:
    bx0, by0, bx1, by1 = icon_bbox
    bw, bh = bx1-bx0+1, by1-by0+1
    side = int(max(bw, bh) * 1.30)
    sq = Image.new('RGB', (side, side), BG)
    off_x = (side - bw)//2; off_y = (side - bh)//2
    sq.paste(img.crop((bx0, by0, bx1+1, by1+1)), (off_x, off_y))
    sq512 = sq.resize((512, 512), Image.LANCZOS)
    sq512.save(OUT_ICON, optimize=True)
    sq512.save(OUT_FAVICON, optimize=True)
    print(f'Icono guardado: 512x512 · {os.path.getsize(OUT_ICON)/1024:.1f} KB (icon + favicon)')

# --- 6) imagen de depuración anotada ---
dbg = img.copy()
d = ImageDraw.Draw(dbg)
d.rectangle([fx0, fy0, fx1, fy1], outline=(255, 0, 0), width=3)
if icon_bbox:
    d.rectangle(list(icon_bbox), outline=(0, 200, 255), width=3)
    d.line([(cut, 0), (cut, H)], fill=(255, 220, 0), width=2)
dbg.save(OUT_DEBUG)
print(f'Debug anotado: {OUT_DEBUG} (rojo=full, azul=icono, amarillo=corte)')
