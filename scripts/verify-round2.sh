#!/bin/bash
# Ronda 2: modal de biblioteca, slider hora, preset invierno, toggle áreas on/off/on
cd /home/z/my-project
rm -f .next/dev/lock
export DATABASE_URL=$(grep -m1 '^DATABASE_URL' .env | cut -d'"' -f2 | cut -d"'" -f2)
npx next dev -p 3112 > /tmp/jydev2.log 2>&1 &
DEVPID=$!
READY=0
for i in $(seq 1 90); do
  sleep 2
  CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3112 2>/dev/null)
  if [ "$CODE" = "200" ]; then echo "✓ server listo"; READY=1; break; fi
done
[ "$READY" != "1" ] && { tail -5 /tmp/jydev2.log; kill $DEVPID; exit 1; }

AB="agent-browser"
FIND_T="--timeout 8000"
SVG='document.querySelector("svg[viewBox=\"0 0 1200 820\"]")'

$AB set viewport 1728 960
$AB open http://localhost:3112
$AB wait --load networkidle
sleep 3

echo "=== A. MODAL BIBLIOTECA vía ribbon (pestaña Bloques → opción) ==="
$AB find role button click --name "Bloques" $FIND_T
sleep 1
$AB find role button click --name "Abrir biblioteca de bloques" $FIND_T
sleep 1.5
$AB eval 'document.body.textContent.includes("Biblioteca de bloques") && document.body.textContent.includes("con vista previa") ? "MODAL-ABIERTO" : "ERROR-modal-no-visible"'
$AB screenshot download/vfy2-01-modal-biblioteca.png

echo "=== B. insertar desde el MODAL (mobiliario: sillón) ==="
$AB find text "Sillón individual" click $FIND_T
sleep 1
$AB eval 'document.body.textContent.includes("Insertar: sillon") || document.body.textContent.includes("INSERTAR") ? "ARMADO-sillon" : "ERROR-no-armado"'
$AB mouse move 640 640
sleep 0.6
$AB screenshot download/vfy2-02-fantasma-sillon.png
$AB mouse down left
$AB mouse up left
sleep 1
$AB eval '(() => {
  const t = [...document.querySelectorAll("div,span,p")].map(e=>e.textContent).filter(t=>t.includes("Bloque insertado"));
  return t.length ? "INSERCION-MODAL-OK" : "revisar";
})()'

echo "=== C. HELIODÓN + slider hora (selector svg correcto) ==="
$AB find role button click --name "Heliodón" $FIND_T
sleep 1.5
POLY1=$($AB eval "$SVG.querySelectorAll('polygon').length")
echo "sombras(hora 12): $POLY1 polígonos"
$AB eval "(() => {
  const inp = [...document.querySelectorAll('input[type=range]')][0];
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(inp, '17.5');
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  return 'hora->17.5';
})()"
sleep 1.2
POLY2=$($AB eval "$SVG.querySelectorAll('polygon').length")
echo "sombras(hora 17.5): $POLY2 polígonos"
$AB eval "$SVG.textContent.includes('17:30') ? 'HORA-17:30-VISIBLE' : 'revisar'"
$AB screenshot download/vfy2-03-heliodon-1730.png

echo "=== D. preset INVIERNO (role button del panel) ==="
$AB find role button click --name "Invierno" $FIND_T
sleep 1.2
$AB screenshot download/vfy2-04-invierno.png
$AB eval "$SVG.textContent.includes('21 jun') || $SVG.textContent.includes('21 dic') ? 'FECHA-INVERNIO' : 'revisar-fecha'"

echo "=== E. ÁREAS on/off/on con chip siempre visible ==="
A1=$($AB eval "[...$SVG.querySelectorAll('text')].filter(t=>t.textContent.includes('m²')).length")
$AB find role button click --name "Áreas ·" $FIND_T
sleep 0.8
A2=$($AB eval "[...$SVG.querySelectorAll('text')].filter(t=>t.textContent.includes('m²')).length")
CHIP_OFF=$($AB eval "document.body.textContent.includes('Áreas · ocultas') ? 'chip-ocultas-visible' : 'revisar-chip'")
$AB find role button click --name "Áreas ·" $FIND_T
sleep 0.8
A3=$($AB eval "[...$SVG.querySelectorAll('text')].filter(t=>t.textContent.includes('m²')).length")
echo "etiquetas: antes=$A1 → ocultas=$A2 → reactivadas=$A3 · $CHIP_OFF"

echo "=== F. animación play (2s) ==="
$AB find role button click --name "Animar día completo" $FIND_T
sleep 2.5
$AB screenshot download/vfy2-05-animacion.png

# detener animación para captura estable
$AB find role button click --name "Pausar animación" $FIND_T

echo "=== G. errores de página ==="
$AB errors | head -4

kill $DEVPID 2>/dev/null
sleep 1
pkill -9 -f "next dev" 2>/dev/null
pkill -9 -f "next-server" 2>/dev/null
$AB close 2>/dev/null
echo "=== RONDA 2 COMPLETADA ==="
