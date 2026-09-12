#!/bin/bash
# Ronda 3: verificación del MODAL de biblioteca vía botón del header
cd /home/z/my-project
rm -f .next/dev/lock
export DATABASE_URL=$(grep -m1 '^DATABASE_URL' .env | cut -d'"' -f2 | cut -d"'" -f2)
npx next dev -p 3113 > /tmp/jydev3.log 2>&1 &
DEVPID=$!
READY=0
for i in $(seq 1 90); do
  sleep 2
  CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3113 2>/dev/null)
  if [ "$CODE" = "200" ]; then echo "✓ server listo"; READY=1; break; fi
done
[ "$READY" != "1" ] && { tail -5 /tmp/jydev3.log; kill $DEVPID; exit 1; }

AB="agent-browser"
FT="--timeout 8000"

$AB set viewport 1728 960
$AB open http://localhost:3113
$AB wait --load networkidle
sleep 3

echo "=== A. click directo al botón 'Bloques' del HEADER (vía JS) ==="
$AB eval '(() => {
  const btn = [...document.querySelectorAll("header button")].find(b => b.textContent.trim() === "Bloques");
  if (!btn) return "ERROR-no-hay-boton-header";
  btn.click();
  return "clic-header-bloques";
})()'
sleep 2
$AB eval '(() => {
  const modal = [...document.querySelectorAll("[role=dialog]")];
  const ok = document.body.textContent.includes("Biblioteca de bloques") && document.body.textContent.includes("con vista previa");
  return JSON.stringify({ dialogos: modal.length, modalOk: ok });
})()'
$AB screenshot download/vfy3-01-modal-abierto.png

echo "=== B. cambiar a categoría Sanitarios y elegir Lavatorio ==="
$AB find role button click --name "Sanitarios" $FT
sleep 1
$AB eval '(() => {
  const dlg = document.querySelector("[role=dialog]");
  const items = dlg ? [...dlg.querySelectorAll("button")].map(b => b.textContent.slice(0,30)) : [];
  return JSON.stringify(items.filter(t => t.includes("Lavatorio") || t.includes("Inodoro") || t.includes("Ducha")));
})()'
$AB find text "Lavatorio" click $FT
sleep 1
$AB eval 'document.body.textContent.includes("Insertar: lavatorio") || document.body.textContent.includes("INSERTAR") ? "ARMADO-lavatorio-desde-modal" : "ERROR"'
$AB screenshot download/vfy3-02-armado-lavatorio.png

echo "=== C. insertar en el plano (baño) ==="
$AB mouse move 700 430
sleep 0.5
$AB mouse down left
$AB mouse up left
sleep 1
$AB eval '(() => {
  const t = [...document.querySelectorAll("div,span,p")].map(e=>e.textContent).filter(t=>t.includes("Bloque insertado"));
  return t.length ? "INSERCION-LAVATORIO-OK: " + t[t.length-1].slice(0,60) : "revisar";
})()'
$AB screenshot download/vfy3-03-lavatorio-insertado.png

echo "=== D. comando de consola BLOQUES (ruta alternativa) ==="
# primero ESC para salir de la herramienta
$AB press Escape
sleep 0.5
$AB eval '(() => {
  const inp = [...document.querySelectorAll("input")].find(i => (i.placeholder || "").toLowerCase().includes("comando"));
  if (!inp) return "no-input";
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(inp, "BLOQUES");
  inp.dispatchEvent(new Event("input", { bubbles: true }));
  inp.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  return "cmd-BLOQUES-enviado";
})()'
sleep 1.5
$AB eval 'document.querySelector("[role=dialog]") && document.body.textContent.includes("Biblioteca de bloques") ? "MODAL-VIA-CONSOLA-OK" : "revisar"'

echo "=== E. cerrar con ESC ==="
$AB press Escape
sleep 0.8
$AB eval 'document.querySelector("[role=dialog]") ? "sigue-abierto" : "modal-cerrado-OK"'

echo "=== F. errores de página ==="
$AB errors | head -4

kill $DEVPID 2>/dev/null
sleep 1
pkill -9 -f "next dev" 2>/dev/null
pkill -9 -f "next-server" 2>/dev/null
$AB close 2>/dev/null
echo "=== RONDA 3 COMPLETADA ==="
