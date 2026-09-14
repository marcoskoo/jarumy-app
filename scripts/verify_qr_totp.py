"""Valida que el QR SVG del setup TOTP sea decodificable por una cámara real
(simula Google Authenticator): extrae el QR del endpoint, lo rasteriza y
decodifica con OpenCV/pyzbar; el contenido debe ser la URI otpauth://.

Uso: python3 /home/z/my-project/scripts/verify_qr_totp.py
"""
import io
import json
import urllib.request

import cairosvg  # type: ignore
import cv2
import numpy as np

BASE = "http://localhost:3000"

# 1) login como tester (creado/actualizado por e2e-security.ts, pero quedó
#    deshabilitado y sin 2FA; lo re-habilitamos vía login directo):
#    usamos el flujo del propio endpoint: primero creamos sesión con un
#    usuario temporal mediante el API de login del admin NO disponible;
#    en su lugar, este script se apoya en e2e-security.ts ya ejecutado:
#    repetimos aquí el ciclo completo con el API.

import sqlite3

DB = "/home/z/my-project/db/custom.db"
USER = "qrtester"
PASS = "Qr#Valida2026"

import hashlib
import os

def hash_password(pw: str) -> str:
    # Replica exacta de Node crypto.scryptSync(password, saltStr, 64):
    # ¡el salt hex se usa como BYTES del string, no decodificado!
    salt = os.urandom(16).hex()
    h = hashlib.scrypt(pw.encode(), salt=salt.encode(), n=16384, r=8, p=1, dklen=64)
    return f"{salt}:{h.hex()}"

con = sqlite3.connect(DB)
con.execute(
    "INSERT OR REPLACE INTO User (id, username, passwordHash, displayName, role, disabled, mustChangePassword, tokenEpoch, totpConfirmed, createdAt, updatedAt) "
    "VALUES (?, ?, ?, 'QR Tester', 'editor', 0, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
    (f"qrtester-{id(USER)}", USER, hash_password(PASS)),
)
con.commit()
con.close()

# 2) login → cookie
req = urllib.request.Request(
    f"{BASE}/api/auth/login",
    data=json.dumps({"username": USER, "password": PASS}).encode(),
    headers={"Content-Type": "application/json"},
)
resp = urllib.request.urlopen(req)
cookie = resp.headers.get("Set-Cookie", "").split(";")[0]
print("login:", resp.status)

# 3) setup TOTP → qrSvg + uri
req = urllib.request.Request(
    f"{BASE}/api/auth/totp",
    data=json.dumps({"action": "setup"}).encode(),
    headers={"Content-Type": "application/json", "Cookie": cookie},
)
resp = urllib.request.urlopen(req)
setup = json.loads(resp.read())
svg, uri = setup["qrSvg"], setup["uri"]
print("setup ok · uri:", uri[:60], "…")

# 4) rasteriza el SVG (como lo ve una cámara) y decodifica
png = cairosvg.svg2png(bytestring=svg.encode(), output_width=480, output_height=480)
img = cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_COLOR)

detector = cv2.QRCodeDetector()
decoded, _, _ = detector.detectAndDecode(img)
source = "opencv"
if not decoded:
    from pyzbar.pyzbar import decode as zdecode  # type: ignore

    found = zdecode(img)
    decoded = found[0].data.decode() if found else ""
    source = "pyzbar"

print(f"decodificado ({source}):", decoded or "(nada)")

ok = decoded == uri
print("\n✅ QR VÁLIDO — Google Authenticator puede registrarlo" if ok else "\n❌ QR NO coincide con la URI")
print("match exacto URI otpauth:", ok)

# limpieza: deshabilitar usuario de prueba
con = sqlite3.connect(DB)
con.execute("UPDATE User SET disabled=1 WHERE username=?", (USER,))
con.execute("UPDATE User SET totpSecret=NULL, totpConfirmed=0 WHERE username=?", (USER,))
con.commit()
con.close()

raise SystemExit(0 if ok else 1)
