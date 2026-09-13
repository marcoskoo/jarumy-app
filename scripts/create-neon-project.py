#!/usr/bin/env python3
"""Crea el proyecto Neon 'jarumy-app' vía la API v2 (proxy console.neon.tech)
y escribe las URLs de conexión (directa y pooler) en .env"""
import json
import os
import socket
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

# api.neon.tech no tiene registro DNS público; la consola proxifica la API v2
API = "https://console.neon.tech/api/v2"
ENV_PATH = Path("/home/z/my-project/.env")


def load_env():
    env = {}
    for line in ENV_PATH.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def call(method, path, key, body=None):
    req = urllib.request.Request(
        API + path,
        method=method,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body is not None else None,
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:
            return e.code, {}


def main():
    env = load_env()
    key = env.get("NEON_API_KEY") or os.environ.get("NEON_API_KEY")
    if not key:
        sys.exit("NEON_API_KEY no encontrado")

    st, data = call("POST", "/projects", key, {"project": {"name": "jarumy-app"}})
    project = data.get("project") or {}

    if st >= 400 or not project.get("id"):
        # fallback: reusar un proyecto existente con ese nombre
        st2, lst = call("GET", "/projects", key)
        projects = lst.get("projects") or []
        project = next((p for p in projects if p.get("name") == "jarumy-app"), None)
        if project is None:
            sys.exit(f"error creando proyecto: HTTP {st} {json.dumps(data)[:300]}")
        print(f"reusando proyecto existente {project['id']}")
        pid, bid = project["id"], project.get("default_branch")
        st3, ep = call("GET", f"/projects/{pid}/endpoints", key)
        host = ((ep.get("endpoints") or [{}])[0]).get("host")
        st4, rl = call("GET", f"/projects/{pid}/branches/{bid}/roles", key)
        role_name = ((rl.get("roles") or [{}])[0]).get("name", "neondb_owner")
        st5, rp = call("POST", f"/projects/{pid}/branches/{bid}/roles/{role_name}/reset_password", key, {})
        password = ((rp.get("role") or {})).get("password")
        st6, dbs = call("GET", f"/projects/{pid}/branches/{bid}/databases", key)
        dbname = ((dbs.get("databases") or [{}])[0]).get("name") or "neondb"
    else:
        pid = project["id"]
        bid = project.get("default_branch")
        host = ((data.get("endpoints") or [{}])[0]).get("host")
        role = (data.get("roles") or [{}])[0]
        role_name = role.get("name", "neondb_owner")
        password = role.get("password")
        dbname = ((data.get("databases") or [{}])[0]).get("name") or "neondb"
        if not password:
            st6, rp = call("POST", f"/projects/{pid}/branches/{bid}/roles/{role_name}/reset_password", key, {})
            password = ((rp.get("role") or {})).get("password")

    if not all([host, password, bid, role_name, dbname]):
        sys.exit(f"datos incompletos: host={host} pwd={'sí' if password else 'no'} branch={bid}")

    # prueba TCP al endpoint de BD
    try:
        s = socket.create_connection((host, 5432), timeout=8)
        s.close()
        tcp_ok = "✓"
    except Exception as e:
        tcp_ok = f"✗ ({e})"

    pwd_q = urllib.parse.quote(password, safe="")
    direct = f"postgresql://{role_name}:{pwd_q}@{host}/{dbname}?sslmode=require"
    pooler_host = host.split(".", 1)[0] + "-pooler." + host.split(".", 1)[1]
    pooler = f"postgresql://{role_name}:{pwd_q}@{pooler_host}/{dbname}?sslmode=require&pgbouncer=true&connection_limit=1"

    # reescribir .env: DATABASE_URL (directa) + DATABASE_URL_POOLER, conservando el resto
    lines = [l for l in ENV_PATH.read_text().splitlines() if not l.startswith("DATABASE_URL=")]
    ENV_PATH.write_text(f"DATABASE_URL={direct}\nDATABASE_URL_POOLER={pooler}\n" + "\n".join(lines) + "\n")
    os.chmod(ENV_PATH, 0o600)

    print(f"proyecto:  {pid}")
    print(f"branch:    {bid}")
    print(f"host:      {host}  (TCP 5432 {tcp_ok})")
    print(f"pooler:    {pooler_host}")
    print(f"rol/bd:    {role_name} / {dbname}  (password: ****{password[-4:]})")
    print("✅ .env actualizado con URLs directa y pooler")


if __name__ == "__main__":
    main()
