#!/usr/bin/env python3
# Ensambla el Manual de Usuario de Jarumy a partir de las 4 partes HTML,
# aplicando correcciones de exactitud verificadas contra el código de la app:
#   · cap. 3: son SEIS zonas (badges 1–6), no siete
#   · cap. 3: la aplicación real es la Figura 3 (la 4 es el menú radial)
#   · cap. 3: Inicio tiene 12 herramientas (desglose real suma 98)
#   · cap. 3 + cap. 12: atajos reales de la app → F3=OSNAP · F8=ORTO · F9=SNAP
#   · part3: se elimina el </div> de cierre prematuro de .main-content
#              (lo cierra part4 tras el capítulo 13, antes del cierre)
import os, re, sys

BASE = '/home/z/my-project/scripts/manual'
OUT_DIR = '/home/z/my-project/download/manual-jarumy'
OUT = os.path.join(OUT_DIR, 'manual-usuario-jarumy.html')
FONTS_DIR = os.path.join(OUT_DIR, 'fonts')

def read(name):
    with open(os.path.join(BASE, name), encoding='utf-8') as f:
        return f.read()

# ---------- 1) fuentes locales (Inter + Archivo, descargadas en fonts/) ----------
# gf.css y fonts/*.ttf se descargaron previamente con curl (red intermitente);
# este paso ya no requiere conexión.
FONTS_DIR = os.path.join(OUT_DIR, 'fonts')
GF_CSS = os.path.join(BASE, 'gf.css')
if not os.path.exists(GF_CSS):
    sys.exit('✗ falta scripts/manual/gf.css — descárgelo de Google Fonts con curl')
css = read(os.path.relpath(GF_CSS, BASE))
faces = []
for b in re.findall(r"@font-face\s*\{([^}]+)\}", css):
    fam = re.search(r"font-family:\s*'([^']+)'", b)
    wgt = re.search(r"font-weight:\s*(\d+)", b)
    url = re.search(r"url\(([^)]+)\)", b)
    if not (fam and wgt and url):
        continue
    fname = f"{fam.group(1).lower()}-{wgt.group(1)}.ttf"
    fpath = os.path.join(FONTS_DIR, fname)
    if not os.path.exists(fpath) or os.path.getsize(fpath) < 1000:
        sys.exit(f'✗ falta la fuente local {fpath}')
    faces.append(
        f"@font-face{{font-family:'{fam.group(1)}';font-style:normal;font-weight:{wgt.group(1)};"
        f"src:url('fonts/{fname}') format('truetype');font-display:swap;}}"
    )
if len(faces) != 9:
    sys.exit(f'✗ fuentes locales incompletas: {len(faces)}/9')
FONT_CSS = '<style>\n' + '\n'.join(faces) + '\n</style>'
print('✓ 9 fuentes locales listas (Inter ×4 · Archivo ×5)')

p1 = read('part1.html')
p2 = read('part2.html')
p3 = read('part3.html')
p4 = read('part4.html')

FIXES = [
    (p2, 'organizada en siete zonas', 'organizada en seis zonas'),
    (p2, 'la Figura 4 presenta la aplicación real', 'la Figura 3 presenta la aplicación real'),
    (p2, 'Inicio (13)', 'Inicio (12)'),
    (p2,
     'iguales a los de AutoCAD. Se encienden y apagan con un clic o con <span class="kbd">F9</span>,\n    <span class="kbd">F3</span> y <span class="kbd">F8</span> respectivamente.',
     'iguales a los de AutoCAD. Todos se encienden y apagan con un clic en su propio toggle;\n    SNAP, OSNAP y ORTO tienen además atajos de teclado — <span class="kbd">F9</span>,\n    <span class="kbd">F3</span> y <span class="kbd">F8</span> respectivamente.'),
    (p4,
     'OSNAP&nbsp;· ORTO&nbsp;· rejilla (también desde la barra de estado)',
     'OSNAP&nbsp;· ORTO&nbsp;· SNAP (también desde la barra de estado)'),
    # evita que el separador '·' caiga a inicio de línea en la tabla de comandos
    (p4, ' ·</span>', '&nbsp;·</span>'),
]

# aplica correcciones con verificación estricta
parts = {'p1': p1, 'p2': p2, 'p3': p3, 'p4': p4}
name_of = {id(p1): 'p1', id(p2): 'p2', id(p3): 'p3', id(p4): 'p4'}
for part, old, new in FIXES:
    key = name_of[id(part)]
    if old not in parts[key]:
        sys.exit(f'✗ no encontrado en {key}: {old[:60]!r}')
    parts[key] = parts[key].replace(old, new)
    print(f'✓ fix {key}: {old[:48]!r} → {new[:48]!r}')

# sustituye la carga remota de Google Fonts por las @font-face locales
GF_LINK = ('<link rel="preconnect" href="https://fonts.googleapis.com">\n'
           '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700'
           '&family=Archivo:wght@500;600;700;800;900&display=swap" rel="stylesheet">')
if GF_LINK not in parts['p1']:
    sys.exit('✗ no se encontró el bloque <link> de Google Fonts en part1')
parts['p1'] = parts['p1'].replace(GF_LINK, FONT_CSS)
print('✓ part1: Google Fonts remoto → @font-face locales (fonts/)')

# elimina el cierre prematuro de main-content al final de part3
p3s = parts['p3'].rstrip()
if not p3s.endswith('</div>'):
    sys.exit('✗ part3 no termina en </div> como se esperaba')
parts['p3'] = p3s[: -len('</div>')].rstrip() + '\n'
print('✓ part3: cierre prematuro de .main-content eliminado')

html = parts['p1'] + '\n' + parts['p2'] + '\n' + parts['p3'] + '\n' + parts['p4']

# verificación: todas las imágenes referenciadas existen
imgs = re.findall(r'src="(images/[^"]+)"', html)
missing = [i for i in imgs if not os.path.exists(os.path.join(OUT_DIR, i))]
if missing:
    sys.exit(f'✗ imágenes faltantes: {missing}')
print(f'✓ {len(imgs)} imágenes referenciadas y presentes')

# verificación de estructura básica
for token, desc in [('<div class="main-content">', 'apertura main-content'),
                    ('class="cover"', 'portada'), ('class="ending"', 'cierre'),
                    ('</body>', 'cierre body')]:
    if token not in html:
        sys.exit(f'✗ falta {desc} ({token!r})')
opens = html.count('<div')
closes = html.count('</div>')
print(f'✓ divs: {opens} aperturas / {closes} cierres')

os.makedirs(OUT_DIR, exist_ok=True)
with open(OUT, 'w', encoding='utf-8') as f:
    f.write(html)
print(f'✓ HTML ensamblado: {OUT} ({len(html):,} caracteres)')
