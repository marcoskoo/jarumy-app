#!/usr/bin/env python3
# Post-procesado del Manual de Usuario Jarumy:
#   1) numeración de páginas (portada sin número · índice i · cuerpo 1..N · contraportada sin número)
#   2) metadatos completos (Title/Author/Subject/Creator)
import io
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor

SRC = '/home/z/my-project/download/manual-jarumy/manual-usuario-jarumy.pdf'
W, H = 720, 1020

reader = PdfReader(SRC)
writer = PdfWriter()
n = len(reader.pages)
print(f'páginas: {n}')

ROMAN = {1: 'i', 2: 'ii', 3: 'iii', 4: 'iv', 5: 'v'}

for idx, page in enumerate(reader.pages):
    num = idx + 1
    label = None
    if num == 2:                      # índice → romano
        label = ROMAN.get(num - 1, 'i')
    elif 3 <= num <= n - 1:           # cuerpo → arábigo desde 1
        label = str(num - 2)

    if label:
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=(W, H))
        c.setFont('Helvetica', 8.5)
        c.setFillColor(HexColor('#8a8172'))
        c.drawCentredString(W / 2, 22, label)
        c.save()
        buf.seek(0)
        overlay = PdfReader(buf).pages[0]
        page.merge_page(overlay)
    writer.add_page(page)

writer.add_metadata({
    '/Title': 'Manual de Usuario — Jarumy app · Suite de diseño arquitectónico CAD/BIM en la web',
    '/Author': 'Jarumy · J. Burga',
    '/Subject': 'Guía paso a paso de la aplicación Jarumy: acceso y 2FA, dibujo, multinivel, análisis RNE, 3D, nube, IA y administración',
    '/Creator': 'Z.ai',
    '/Producer': 'Z.ai · Playwright + Paged.js',
})

with open(SRC, 'wb') as f:
    writer.write(f)
print('numeración y metadatos aplicados')
