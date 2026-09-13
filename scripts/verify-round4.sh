#!/bin/bash
# Ronda 4: inserción desde modal vía JS + comandos de consola (SOL, BLOQUES)
cd /home/z/my-project
rm -f .next/dev/lock
export DATABASE_URL=$(grep -m1 '^DATABASE_URL' .env | cut -d'"' -f2 | cut -d"'" -f2)
npx next dev -p 3114 > /tmp/jydev4.log 2>&1 &
DEVPID=$!
READY=0
for i in $(seq 1 90); do
  sleep 2
  CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3114 2>/dev/null)
  if [ "$CODE" = "200" ]; then echo "✓ server listo"; READY=1; break; fi
done
[ "$READY" != "1" ] && { tail -5 /tmp/jydev4.log; kill $DEVPID; exit 1; }

AB="agent-browser"
SVG='document.querySelector("svg[viewBox=\"0 0 1200 820\"]")'

$AB set viewport 1728 960
$AB open http://localhost:3114
$AB wait --load networkidle
sleep 3

echo "=== A. abrir modal y clic JS en bloque Ducha (Sanitarios) ==="
$AB eval '(() => {
  const btn = [...document.querySelectorAll("header button")].find(b => b.textContent.trim() === "Bloques");
  btn.click();
  return "header-bloques-clic";
})()'
sleep 2
$AB eval '(() => {
  const tab = [...document.querySelectorAll("[role=dialog] button")].find(b => b.textContent.includes("Sanitarios"));
  if (tab) { tab.click(); return "tab-sanitarios"; }
  return "no-tab";
})()'
sleep 0.8
$AB eval '(() => {
  const blk = [...document.querySelectorAll("[role=dialog] button")].find(b => b.textContent.includes("Ducha"));
  if (blk) { blk.click(); return "bloque-ducha-clic"; }
  return "no-bloque";
})()'
sleep 1
$AB eval 'document.body.textContent.includes("Insertar: ducha") || document.body.textContent.includes("INSERTAR") ? "ARMADO-ducha" : "ERROR-no-armado"'

echo "=== B. insertar ducha en el plano ==="
$AB mouse move 720 420
sleep 0.5
$AB screenshot download/vfy4-01-fantasma-ducha.png
$AB mouse down left
$AB mouse up left
sleep 1
$AB eval '(() => {
  const t = [...document.querySelectorAll("div,span,p")].map(e=>e.textContent).filter(t=>t.includes("Bloque insertado"));
  return t.length ? "INSERCION-DUCHA-OK: " + t[t.length-1].slice(0,60) : "revisar";
})()'
$AB screenshot download/vfy4-02-ducha-insertada.png

echo "=== C. comando de consola SOL (activar heliodón) ==="
$AB eval '(() => {
  const form = document.querySelector("form");
  if (!form) return "no-form";
  const inp = form.querySelector("input");
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(inp, "SOL");
  inp.dispatchEvent(new Event("input", { bubbles: true }));
  form.requestSubmit();
  return "cmd-SOL-enviado";
})()'
sleep 1.5
P=$($AB eval "$SVG.querySelectorAll('polygon').length")
echo "polígonos de sombra tras SOL: $P"
$AB eval 'document.body.textContent.includes("HELIODÓN ACTIVADO") || document.body.textContent.includes("Heliodón · Sol y sombras") ? "CONSOLA-SOL-OK" : "revisar"'

echo "=== D. comando de consola BLOQUES (abrir modal) ==="
$AB eval '(() => {
  const form = document.querySelector("form");
  const inp = form.querySelector("input");
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(inp, "BLOQUES");
  inp.dispatchEvent(new Event("input", { bubbles: true }));
  form.requestSubmit();
  return "cmd-BLOQUES-enviado";
})()'
sleep 1.5
$AB eval 'document.querySelector("[role=dialog]") && document.body.textContent.includes("Biblioteca de bloques") ? "CONSOLA-BLOQUES-OK" : "revisar"'

echo "=== E. comando AREAS (toggle) ==="
$AB press Escape
sleep 0.5
A1=$($AB eval "[...$SVG.querySelectorAll('text')].filter(t=>t.textContent.includes('m²')).length")
$AB eval '(() => {
  const form = document.querySelector("form");
  const inp = form.querySelector("input");
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(inp, "AREAS");
  inp.dispatchEvent(new Event("input", { bubbles: true }));
  form.requestSubmit();
  return "cmd-AREAS-enviado";
})()'
sleep 1
A2=$($AB eval "[...$SVG.querySelectorAll('text')].filter(t=>t.textContent.includes('m²')).length")
echo "etiquetas m²: $A1 → $A2 (esperado 7→1)"

echo "=== F. menú radial de un espacio → herramienta Etiquetas ==="
# clic en el ambiente SALA para abrir menú radial
$AB mouse move 500 300
$AB mouse down left
$AB mouse up left
sleep 1.2
$AB eval '(() => {
  const txt = document.body.textContent;
  return txt.includes("ESPACIO") ? "radial-espacio-abierto" : "revisar-radial";
})()'
$AB screenshot download/vfy4-03-radial-espacio.png
# pulsar botón Etiquetas del anillo
$AB eval '(() => {
  const btns = [...document.querySelectorAll("button")].filter(b => b.textContent.trim() === "Etiquetas");
  if (btns.length) { btns[btns.length-1].click(); return "etiquetas-clic"; }
  return "no-boton-etiquetas";
})()'
sleep 0.8
A3=$($AB eval "[...$SVG.querySelectorAll('text')].filter(t=>t.textContent.includes('m²')).length")
echo "etiquetas tras radial Etiquetas→Mostrar áreas: $A3"

echo "=== G. errores de página ==="
$AB errors | head -4

kill $DEVPID 2>/dev/null
sleep 1
pkill -9 -f "next dev" 2>/dev/null
pkill -9 -f "next-server" 2>/dev/null
$AB close 2>/dev/null
echo "=== RONDA 4 COMPLETADA ==="
