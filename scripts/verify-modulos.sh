#!/bin/bash
# ============================================================
# Verificación headless de los 3 nuevos módulos de Jarumy
# 1) Biblioteca de bloques (insertar + rotar con R)
# 2) Heliodón (sombras + trayectorias + panel)
# 3) Rotulado de áreas (mostrar/ocultar)
# ============================================================
cd /home/z/my-project
mkdir -p download

# --- arrancar dev server en background ---
rm -f /home/z/my-project/.next/dev/lock
export DATABASE_URL=$(grep -m1 '^DATABASE_URL' .env | cut -d'"' -f2 | cut -d"'" -f2)
npx next dev -p 3111 > /tmp/jydev.log 2>&1 &
DEVPID=$!

# esperar a que responda
READY=0
for i in $(seq 1 90); do
  sleep 2
  CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3111 2>/dev/null)
  if [ "$CODE" = "200" ]; then
    echo "✓ dev server listo (intento $i)"
    READY=1
    break
  fi
done
if [ "$READY" != "1" ]; then
  echo "✗ el servidor no arrancó:"
  tail -8 /tmp/jydev.log
  kill $DEVPID 2>/dev/null
  exit 1
fi

AB="agent-browser"
$AB set viewport 1728 960 2>/dev/null || $AB open about:blank >/dev/null 2>&1

echo "=== 1. ABRIR APP ==="
$AB open http://localhost:3111
$AB wait --load networkidle
sleep 3

# --- helpers para leer estado ---
STATE_JS='(() => {
  const svg = document.querySelector("svg");
  const polys = svg ? svg.querySelectorAll("polygon").length : 0;
  const txts = [...document.querySelectorAll("svg text")].filter(t => t.textContent.includes("m²")).length;
  const chip = [...document.querySelectorAll("button,span")].some(e => e.textContent.includes("Áreas ·"));
  const helioPanel = document.body.textContent.includes("Heliodón · Sol y sombras");
  const indicator = [...document.querySelectorAll("div")].some(d => d.className.includes && String(d.className).includes && String(d.className).includes("jy-pop-in") && d.textContent.includes("Insertar"));
  return JSON.stringify({polys, txts, chip, helioPanel, indicator});
})()'

echo "=== 2. ESTADO INICIAL (áreas visibles, sin sombras) ==="
$AB eval "$STATE_JS"
$AB screenshot download/vfy-01-inicial.png

echo "=== 3. BIBLIOTECA DE BLOQUES: abrir diálogo ==="
$AB find role button click --name "Bloques"
sleep 1
$AB eval 'document.body.textContent.includes("Biblioteca de bloques") ? "dialogo-bloques-ABIERTO" : "ERROR-no-dialogo"'
$AB screenshot download/vfy-02-biblioteca.png

echo "=== 3b. elegir bloque Árbol (categoría Exterior) ==="
$AB find text "Exterior" click
sleep 1
$AB find text "Árbol copa 2.5 m" click
sleep 1
$AB eval '(() => {
  const ind = [...document.querySelectorAll("div")].map(d => String(d.className)).filter(c => c.includes("jy-pop-in"));
  const hasInsert = document.body.textContent.includes("Insertar: arbol") || document.body.textContent.includes("INSERTAR");
  return hasInsert ? "bloque-ARMADO(arbol)" : "ERROR-no-armado";
})()'
$AB screenshot download/vfy-03-bloque-armado.png

echo "=== 3c. rotar con R ==="
$AB press r
sleep 0.5
$AB eval 'document.body.textContent.includes("90°") ? "rotacion-90-visible" : "rotacion-no-visible(revisar)"'

echo "=== 3d. mover cursor sobre el lienzo y colocar ==="
$AB mouse move 760 700
sleep 0.8
$AB screenshot download/vfy-04-fantasma-insercion.png
$AB mouse click 760 700 2>/dev/null || { $AB mouse down left; $AB mouse up left; }
sleep 1
$AB eval '(() => {
  const consola = [...document.querySelectorAll("div,span,p")].map(e=>e.textContent).filter(t => t.includes("Bloque insertado"));
  return consola.length ? "INSERCION-OK: " + consola[consola.length-1].slice(0,70) : "revisar-consola";
})()'
$AB screenshot download/vfy-05-arbol-insertado.png

echo "=== 4. HELIODÓN: activar desde botón de cabecera ==="
$AB find role button click --name "Heliodón"
sleep 1.5
$AB eval "$STATE_JS"
$AB eval '(() => {
  const svg = document.querySelector("svg");
  const polys = svg ? svg.querySelectorAll("polygon").length : 0;
  const helio = document.body.textContent.includes("HELIODÓN") || document.body.textContent.includes("Heliodón · Sol y sombras");
  return JSON.stringify({sombras: polys, panel: helio});
})()'
$AB screenshot download/vfy-06-heliodon.png

echo "=== 4b. cambiar hora (slider) y verificar sombra cambia ==="
BEFORE=$($AB eval 'document.querySelector("svg").querySelectorAll("polygon").length')
$AB eval '(() => {
  const inp = [...document.querySelectorAll("input[type=range]")][0];
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(inp, "17.5");
  inp.dispatchEvent(new Event("input", { bubbles: true }));
  inp.dispatchEvent(new Event("change", { bubbles: true }));
  return "slider-hora->17.5";
})()'
sleep 1.5
AFTER=$($AB eval 'document.querySelector("svg").querySelectorAll("polygon").length')
echo "poligonos sombra antes=$BEFORE despues=$AFTER"
$AB eval 'document.querySelector("svg").textContent.includes("17:30") ? "hora-17:30-visible" : "revisar-hora"'

echo "=== 4c. preset solsticio de invierno ==="
$AB find text "Invierno" click
sleep 1
$AB screenshot download/vfy-07-heliodon-invierno.png

echo "=== 5. ROTULADO DE ÁREAS: ocultar/mostrar ==="
AREAS_BEFORE=$($AB eval '[...document.querySelectorAll("svg text")].filter(t=>t.textContent.includes("m²")).length')
echo "etiquetas m² antes: $AREAS_BEFORE"
$AB find role button click --name "Áreas ·"
sleep 1
AREAS_AFTER=$($AB eval '[...document.querySelectorAll("svg text")].filter(t=>t.textContent.includes("m²")).length')
echo "etiquetas m² despues: $AREAS_AFTER"
$AB screenshot download/vfy-08-areas-ocultas.png
# reactivar
$AB eval '(() => {
  const btn = [...document.querySelectorAll("button")].find(b => b.textContent.includes("ROTULADO") || b.title.includes("Rotulado"));
  if (btn) { btn.click(); return "reactivado"; }
  return "no-boton";
})()'
sleep 1
AREAS_BACK=$($AB eval '[...document.querySelectorAll("svg text")].filter(t=>t.textContent.includes("m²")).length')
echo "etiquetas m² reactivadas: $AREAS_BACK"

echo "=== 6. consola: comando SOL y BLOQUES ==="
$AB eval '(() => {
  const inp = [...document.querySelectorAll("input")].find(i => i.placeholder && i.placeholder.toLowerCase().includes("comando"));
  if (!inp) return "no-input-consola";
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(inp, "AYUDA");
  inp.dispatchEvent(new Event("input", { bubbles: true }));
  inp.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  return "comando-AYUDA-enviado";
})()'
sleep 1
$AB screenshot download/vfy-09-final.png

echo "=== 7. errores de página ==="
$AB errors | head -5

# --- limpiar ---
kill $DEVPID 2>/dev/null
$AB close 2>/dev/null
echo "=== VERIFICACIÓN COMPLETADA ==="
