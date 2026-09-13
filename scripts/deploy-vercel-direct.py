#!/usr/bin/env python3
# ============================================================
# JARUMY — Despliegue directo a Vercel vía API (sin Git)
# Sube todos los archivos rastreados por git como despliegue
# de producción inline (útil si la App de GitHub se desconectó).
# ============================================================
import base64
import json
import os
import subprocess
import sys
import time
import urllib.request

# token via entorno (no commitear secretos): export VERCEL_TOKEN=...
TOKEN = os.environ.get('VERCEL_TOKEN', '')
TEAM = os.environ.get('VERCEL_TEAM', 'rkoo131077-2735s-projects')
PROJECT = 'jarumy-arq'
ROOT = '/home/z/my-project'


def api(method: str, path: str, body: dict | None = None, expect_json: bool = True):
    url = f'https://api.vercel.com{path}'
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, method=method, data=data, headers={
        'Authorization': f'Bearer {TOKEN}',
        'Content-Type': 'application/json',
    })
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            raw = r.read()
            return r.status, json.loads(raw) if expect_json else raw
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read())
        except Exception:
            return e.code, {}


def main() -> int:
    if not TOKEN:
        print('FALLO: falta VERCEL_TOKEN en el entorno')
        return 1
    # 1) lista de archivos rastreados
    out = subprocess.run(['git', '-C', ROOT, 'ls-files', '-z'], capture_output=True, check=True)
    paths = [p.decode() for p in out.stdout.split(b'\0') if p]
    if not paths:
        print('FALLO: sin archivos rastreados')
        return 1
    print(f'Archivos a subir: {len(paths)}', flush=True)

    # 2) contenido: texto plano; binarios en base64 CON encoding="base64"
    #    (sin ese campo la API guarda el string literal y corrompe el archivo)
    files = []
    total = 0
    n_plain = n_b64 = 0
    for p in paths:
        full = f'{ROOT}/{p}'
        with open(full, 'rb') as f:
            raw = f.read()
        total += len(raw)
        try:
            files.append({'file': p, 'data': raw.decode('utf-8')})
            n_plain += 1
        except UnicodeDecodeError:
            files.append({'file': p, 'data': base64.b64encode(raw).decode(), 'encoding': 'base64'})
            n_b64 += 1
    print(f'Tamaño total: {total / 1024:.1f} KB · texto plano: {n_plain} · base64: {n_b64}', flush=True)

    # 3) crear despliegue de producción
    st, d = api('POST', f'/v13/deployments?teamSlug={TEAM}', {
        'name': PROJECT,
        'target': 'production',
        'files': files,
    })
    if st not in (200, 201, 202):
        print(f'FALLO creando despliegue ({st}):', json.dumps(d, ensure_ascii=False)[:400])
        return 1
    did = d.get('id')
    print(f'Despliegue: {did} · estado inicial: {d.get("readyState")} · url: {d.get("url")}', flush=True)

    # 4) sondear hasta READY
    for i in range(60):
        time.sleep(15)
        st, d = api('GET', f'/v13/deployments/{did}?teamSlug={TEAM}')
        state = d.get('readyState')
        err = d.get('errorCode') or ''
        print(f'  [{i + 1}] {state} {err}', flush=True)
        if state == 'READY':
            print(f'LISTO: https://{d.get("url")}')
            return 0
        if state in ('ERROR', 'CANCELED') or err:
            print('FALLO del build. Últimos eventos:')
            st2, evs = api('GET', f'/v3/deployments/{did}/events?teamSlug={TEAM}&limit=15')
            if isinstance(evs, list):
                items = evs[-15:]
            else:
                items = (evs.get('events') or [])[-15:]
            for ev in items:
                print('   ·', str(ev.get('text', ''))[:200])
            return 1
    print('TIMEOUT esperando el build')
    return 1


if __name__ == '__main__':
    sys.exit(main())
