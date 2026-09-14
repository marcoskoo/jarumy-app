#!/usr/bin/env python3
# ============================================================
# JARUMY — Despliegue directo a Vercel vía API (sin Git)
# Sube todos los archivos rastreados por git como despliegue
# de producción. Método de dos fases (el del CLI de Vercel):
#   1) cada archivo → POST /v2/files (bytes + digest SHA-1)
#   2) despliegue con referencias {file, sha1} (payload mínimo)
# Así se evita el límite de 10 MB del despliegue inline.
# ============================================================
import hashlib
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

    # 2) subir cada archivo a /v2/files (bytes crudos + digest SHA-1 en
    #    cabecera x-vercel-digest; el servidor deduplica por digest)
    files = []
    total = 0
    for i, p in enumerate(paths, 1):
        full = f'{ROOT}/{p}'
        with open(full, 'rb') as f:
            raw = f.read()
        total += len(raw)
        digest = hashlib.sha1(raw).hexdigest()
        ok = False
        for attempt in (1, 2, 3):
            req = urllib.request.Request(
                f'https://api.vercel.com/v2/files?teamSlug={TEAM}',
                method='POST', data=raw, headers={
                    'Authorization': f'Bearer {TOKEN}',
                    'Content-Type': 'application/octet-stream',
                    'x-vercel-digest': digest,
                })
            try:
                with urllib.request.urlopen(req, timeout=180) as r:
                    r.read()
                ok = True
                break
            except urllib.error.HTTPError as e:
                body = e.read()[:200]
                # 409 = contenido ya subido (dedup) → también válido
                if e.code == 409:
                    ok = True
                    break
                print(f'  aviso {p}: HTTP {e.code} {body}', flush=True)
                time.sleep(2 * attempt)
            except Exception as e:
                print(f'  aviso {p}: {e}', flush=True)
                time.sleep(2 * attempt)
        if not ok:
            print(f'FALLO subiendo {p} tras 3 intentos', flush=True)
            return 1
        files.append({'file': p, 'sha': digest})
        if i % 25 == 0 or i == len(paths):
            print(f'  subidos {i}/{len(paths)} · {total / 1024:.0f} KB', flush=True)

    # 3) crear despliegue de producción (solo referencias — payload mínimo)
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
