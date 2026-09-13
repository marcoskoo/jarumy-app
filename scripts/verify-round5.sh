#!/bin/bash
# Ronda 5 (PAQUETE 2): curvas (ARCO/ELIPSE/SPLINE), HATCH, NUBE, PUNTO,
# directriz, cotas ang/rad, fases, LUX, ACUSTICA, QSELECT vía consola + clics SVG.
cd /home/z/my-project
rm -f .next/dev/lock
export DATABASE_URL=$(grep -m1 '^DATABASE_URL' .env | cut -d'"' -f2 | cut -d"'" -f2)
npx next dev -p 3115 > /tmp/jydev5.log 2>&1 &
DEVPID=$!
READY=0
for i in $(seq 1 90); do
  sleep 2
  CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3115 2>/dev/null)
  if [ "$CODE" = "200" ]; then echo "✓ server listo"; READY=1; break; fi
done
[ "$READY" != "1" ] && { tail -5 /tmp/jydev5.log; kill $DEVPID; exit 1; }

AB="agent-browser"
SVG='document.querySelector("svg[viewBox=\"0 0 1200 820\"]")'

$AB set viewport 1728 960
$AB open http://localhost:3115
$AB wait --load networkidle
sleep 3

# helper: leer la última línea de la consola de la app
CONSOLE_TXT='(() => { const cs = [...document.querySelectorAll("div")].filter(d => d.className && String(d.className).includes("font-mono") && d.textContent.includes("Comando")); return document.body.innerText })()'

# 1) anular window.prompt para los diálogos de texto
$AB eval 'window.prompt = (msg, def) => def || "2"; "prompt-ok"'
$AB eval "window.__fire = null; 'init'"

echo "=== A. ARCO por 3 puntos ==="
$AB eval '(() => { const i = [...document.querySelectorAll("input")].find(x => x.placeholder && x.placeholder.toUpperCase().includes("COMANDO")); if (!i) return "no-input"; i.focus(); return "ok" })()'
$AB eval '(() => { const i = [...document.querySelectorAll("input")].find(x => x.placeholder && x.placeholder.toUpperCase().includes("COMANDO")); if (!i) return "no-input"; const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; s.call(i, "ARCO"); i.dispatchEvent(new Event("input", { bubbles: true })); const f = i.closest("form"); f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); return "cmd-arco" })()'
sleep 0.6
$AB eval '(() => { const svg = document.querySelector("svg[viewBox=\"0 0 1200 820\"]"); const r = svg.getBoundingClientRect(); const z = r.width / 1200; window.__fire = (x, y) => { const cx = r.left + x * z, cy = r.top + y * z; const t = document.elementFromPoint(cx, cy) || svg; t.dispatchEvent(new MouseEvent("click", { clientX: cx, clientY: cy, bubbles: true, cancelable: true })); }; window.__key = (k) => window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })); return "helpers-listos" })()'
$AB eval 'window.__fire(280, 260); "p1"'
sleep 0.25
$AB eval 'window.__fire(360, 200); "p2"'
sleep 0.25
$AB eval 'window.__fire(440, 260); "p3"'
sleep 0.6
$AB eval 'document.body.innerText.includes("ARCO creado") ? "ARCO-OK" : "ARCO-FALTA"'
$AB screenshot download/v5-01-arco.png

echo "=== B. ELIPSE + PUNTO ==="
$AB eval '(() => { const i = [...document.querySelectorAll("input")].find(x => x.placeholder && x.placeholder.toUpperCase().includes("COMANDO")); if (!i) return "no-input"; const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; s.call(i, "ELIPSE"); i.dispatchEvent(new Event("input", { bubbles: true })); const f = i.closest("form"); f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); return "cmd-elipse" })()'
sleep 0.4
$AB eval 'window.__fire(700, 480); "centro"'
sleep 0.25
$AB eval 'window.__fire(790, 520); "vertice"'
sleep 0.6
$AB eval '(() => { const i = [...document.querySelectorAll("input")].find(x => x.placeholder && x.placeholder.toUpperCase().includes("COMANDO")); if (!i) return "no-input"; const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; s.call(i, "PUNTO"); i.dispatchEvent(new Event("input", { bubbles: true })); const f = i.closest("form"); f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); return "cmd-punto" })()'
sleep 0.4
$AB eval 'window.__fire(500, 150); "pto"'
sleep 0.5
$AB eval 'document.body.innerText.includes("ELIPSE creada") && document.body.innerText.includes("PUNTO colocado") ? "ELIPSE-PUNTO-OK" : "FALTA"'

echo "=== C. SPLINE por 4 puntos + ENTER ==="
$AB eval '(() => { const i = [...document.querySelectorAll("input")].find(x => x.placeholder && x.placeholder.toUpperCase().includes("COMANDO")); if (!i) return "no-input"; const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; s.call(i, "SPLINE"); i.dispatchEvent(new Event("input", { bubbles: true })); const f = i.closest("form"); f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); return "cmd-spline" })()'
sleep 0.4
$AB eval 'window.__fire(150, 560); "s1"'
sleep 0.2
$AB eval 'window.__fire(240, 500); "s2"'
sleep 0.2
$AB eval 'window.__fire(330, 610); "s3"'
sleep 0.2
$AB eval 'window.__fire(430, 540); "s4"'
sleep 0.3
$AB eval 'window.__key("Enter"); "enter"'
sleep 0.6
$AB eval 'document.body.innerText.includes("SPLINE creada") ? "SPLINE-OK" : "SPLINE-FALTA"'

echo "=== D. HATCH con 4 clics (patrón 2 = ladrillo) ==="
$AB eval '(() => { const i = [...document.querySelectorAll("input")].find(x => x.placeholder && x.placeholder.toUpperCase().includes("COMANDO")); if (!i) return "no-input"; const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; s.call(i, "HATCH"); i.dispatchEvent(new Event("input", { bubbles: true })); const f = i.closest("form"); f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); return "cmd-hatch" })()'
sleep 0.4
$AB eval 'window.__fire(160, 640); "h1"'
sleep 0.2
$AB eval 'window.__fire(320, 640); "h2"'
sleep 0.2
$AB eval 'window.__fire(320, 720); "h3"'
sleep 0.2
$AB eval 'window.__fire(160, 720); "h4"'
sleep 0.3
$AB eval 'window.__key("Enter"); "enter"'
sleep 0.8
$AB eval 'document.body.innerText.includes("HATCH aplicado") ? "HATCH-OK" : "HATCH-FALTA"'
$AB screenshot download/v5-02-hatch.png

echo "=== E. NUBE de revisión ==="
$AB eval '(() => { const i = [...document.querySelectorAll("input")].find(x => x.placeholder && x.placeholder.toUpperCase().includes("COMANDO")); if (!i) return "no-input"; const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; s.call(i, "NUBE"); i.dispatchEvent(new Event("input", { bubbles: true })); const f = i.closest("form"); f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); return "cmd-nube" })()'
sleep 0.4
$AB eval 'window.__fire(680, 180); "n1"'
sleep 0.2
$AB eval 'window.__fire(820, 180); "n2"'
sleep 0.2
$AB eval 'window.__fire(820, 280); "n3"'
sleep 0.2
$AB eval 'window.__fire(680, 280); "n4"'
sleep 0.3
$AB eval 'window.__key("Enter"); "enter"'
sleep 0.6
$AB eval 'document.body.innerText.includes("NUBE DE CONTROL") ? "NUBE-OK" : "NUBE-FALTA"'

echo "=== F. COTA RADIAL y ANGULAR ==="
$AB eval '(() => { const i = [...document.querySelectorAll("input")].find(x => x.placeholder && x.placeholder.toUpperCase().includes("COMANDO")); if (!i) return "no-input"; const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; s.call(i, "ACOTRAD"); i.dispatchEvent(new Event("input", { bubbles: true })); const f = i.closest("form"); f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); return "cmd-acotrad" })()'
sleep 0.4
$AB eval 'window.__fire(950, 300); "centro"'
sleep 0.25
$AB eval 'window.__fire(1010, 300); "borde"'
sleep 0.5
$AB eval '(() => { const i = [...document.querySelectorAll("input")].find(x => x.placeholder && x.placeholder.toUpperCase().includes("COMANDO")); if (!i) return "no-input"; const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; s.call(i, "ACOTANG"); i.dispatchEvent(new Event("input", { bubbles: true })); const f = i.closest("form"); f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); return "cmd-acotang" })()'
sleep 0.4
$AB eval 'window.__fire(950, 620); "vertice"'
sleep 0.2
$AB eval 'window.__fire(1010, 620); "lado1"'
sleep 0.2
$AB eval 'window.__fire(950, 680); "lado2"'
sleep 0.6
$AB eval 'document.body.innerText.includes("ACOTRAD") ? "COTAS-OK" : "COTAS-FALTA"'

echo "=== G. FASES: marcar muro como demolición + panel ==="
$AB eval 'window.__key("Escape"); "esc-desarma"'
sleep 0.5
$AB eval '(() => { const svg = document.querySelector("svg[viewBox=\"0 0 1200 820\"]"); const r = svg.getBoundingClientRect(); const z = r.width / 1200; const probes = [[600, 100], [400, 100], [1000, 100], [150, 400], [630, 300]]; for (const [x, y] of probes) { const t = document.elementFromPoint(r.left + x * z, r.top + y * z); if (t && t.closest(".jy-el")) { window.__fire(x, y); return "clic-muro@" + x + "," + y } } return "sin-muro" })()'
sleep 0.8
$AB eval '(() => { const i = [...document.querySelectorAll("input")].find(x => x.placeholder && x.placeholder.toUpperCase().includes("COMANDO")); if (!i) return "no-input"; const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; s.call(i, "FASE"); i.dispatchEvent(new Event("input", { bubbles: true })); const f = i.closest("form"); f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); return "cmd-fase" })()'
sleep 0.6
$AB eval 'document.body.innerText.includes("→ Demolición") ? "FASE-DEMOLICION-OK" : "FASE-FALTA"'
$AB screenshot download/v5-03-fase-demolicion.png

echo "=== H. Panel de FASES (filtro) ==="
$AB eval '(() => { const i = [...document.querySelectorAll("input")].find(x => x.placeholder && x.placeholder.toUpperCase().includes("COMANDO")); if (!i) return "no-input"; const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; s.call(i, "FASES"); i.dispatchEvent(new Event("input", { bubbles: true })); const f = i.closest("form"); f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); return "cmd-fases" })()'
sleep 0.8
$AB eval '(() => { const dlg = document.querySelector("[role=dialog]"); return dlg && dlg.textContent.includes("Fases de obra") ? "dialog-fases-ok" : "no-dialog" })()'
$AB screenshot download/v5-04-panel-fases.png
$AB eval '(() => { const b = [...document.querySelectorAll("[role=dialog] button")].find(x => x.textContent.trim() === "Solo demolición"); if (b) { b.click(); return "filtro-demolicion" } return "no-boton" })()'
sleep 0.6
$AB eval '(() => { const esc = new KeyboardEvent("keydown", { key: "Escape", bubbles: true }); document.body.dispatchEvent(esc); return "cerrar-dialog" })()'
sleep 0.4

echo "=== I. LUX (iluminación real) ==="
$AB eval '(() => { const i = [...document.querySelectorAll("input")].find(x => x.placeholder && x.placeholder.toUpperCase().includes("COMANDO")); if (!i) return "no-input"; const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; s.call(i, "LUX"); i.dispatchEvent(new Event("input", { bubbles: true })); const f = i.closest("form"); f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); return "cmd-lux" })()'
sleep 0.8
$AB eval '(() => { const dlg = document.querySelector("[role=dialog]"); return dlg && dlg.textContent.includes("luminarias") && dlg.textContent.includes("CUMPLE") ? "dialog-lux-ok" : "no-lux" })()'
$AB screenshot download/v5-05-lux.png
$AB eval '(() => { const esc = new KeyboardEvent("keydown", { key: "Escape", bubbles: true }); document.body.dispatchEvent(esc); return "cerrar" })()'
sleep 0.4

echo "=== J. ACUSTICA (Rw) ==="
$AB eval '(() => { const i = [...document.querySelectorAll("input")].find(x => x.placeholder && x.placeholder.toUpperCase().includes("COMANDO")); if (!i) return "no-input"; const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; s.call(i, "ACUSTICA"); i.dispatchEvent(new Event("input", { bubbles: true })); const f = i.closest("form"); f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); return "cmd-acustica" })()'
sleep 0.8
$AB eval '(() => { const dlg = document.querySelector("[role=dialog]"); return dlg && dlg.textContent.includes("Rw") ? "dialog-acustica-ok" : "no-acustica" })()'
$AB screenshot download/v5-06-acustica.png
$AB eval '(() => { const esc = new KeyboardEvent("keydown", { key: "Escape", bubbles: true }); document.body.dispatchEvent(esc); return "cerrar" })()'
sleep 0.4

echo "=== K. QSELECT ==="
$AB eval '(() => { const i = [...document.querySelectorAll("input")].find(x => x.placeholder && x.placeholder.toUpperCase().includes("COMANDO")); if (!i) return "no-input"; const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; s.call(i, "QSELECT"); i.dispatchEvent(new Event("input", { bubbles: true })); const f = i.closest("form"); f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); return "cmd-qselect" })()'
sleep 0.8
$AB eval '(() => { const dlg = document.querySelector("[role=dialog]"); return dlg && dlg.textContent.includes("Quick Select") ? "dialog-qselect-ok" : "no-qselect" })()'
$AB screenshot download/v5-07-qselect.png
$AB eval '(() => { const esc = new KeyboardEvent("keydown", { key: "Escape", bubbles: true }); document.body.dispatchEvent(esc); return "cerrar" })()'
sleep 0.4

echo "=== L. captura final del plano con todo trazado ==="
$AB screenshot download/v5-08-plano-final.png

echo "=== M. errores de página ==="
$AB errors | head -6

kill $DEVPID 2>/dev/null
sleep 1
pkill -9 -f "next dev" 2>/dev/null
pkill -9 -f "next-server" 2>/dev/null
$AB close 2>/dev/null
echo "=== RONDA 5 COMPLETADA ==="
