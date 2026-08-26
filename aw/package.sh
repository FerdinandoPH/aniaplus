#!/usr/bin/env bash
#
# Monta la carpeta que hay que copiar a la raíz de la SD.
#
#   ./package.sh                  solo el homebrew
#   ./package.sh --web            además compila ANIA+ y lo mete dentro, para servirlo desde la Wii
#   ./package.sh --web-dir RUTA   igual, pero con una web ya compilada (lo que hace el CI)
#   ./package.sh --dolphin        copia además a la SD sincronizada de Dolphin
#
# Resultado en dist/apps/aniaplus/. Copia la carpeta `apps` a la raíz de la tarjeta SD.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
out="$here/dist/apps/aniaplus"

web=""          # "build" para compilarla aquí, o la ruta de una ya compilada
dolphin=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --web)     web="build"; shift ;;
    --web-dir) web="${2:?--web-dir necesita una ruta}"; shift 2 ;;
    --dolphin) dolphin=true; shift ;;
    *) echo "ERROR: opcion desconocida: $1" >&2; exit 1 ;;
  esac
done

export DEVKITPRO="${DEVKITPRO:-/opt/devkitpro}"
export DEVKITPPC="${DEVKITPPC:-$DEVKITPRO/devkitPPC}"
export PATH="$PATH:$DEVKITPRO/tools/bin"

echo "Compilando el asistente Wii..."
make -C "$here" >/dev/null

rm -rf "$here/dist"
mkdir -p "$out"
cp "$here/boot.dol" "$out/boot.dol"
cp "$here/meta.xml" "$out/meta.xml"
# El Homebrew Channel espera icon.png de exactamente 128x48 junto al boot.dol. Si no lo es, no
# lo escala: lo ignora y muestra el icono generico, sin decir por que.
#
# Las medidas se leen de la cabecera del propio PNG —ancho y alto son dos enteros de 4 bytes
# big-endian en las posiciones 16 y 20— en vez de con `identify`, para no arrastrar ImageMagick
# como dependencia de empaquetado: el contenedor de devkitPro del CI no lo trae.
png_size() {
  local hex
  hex="$(od -An -tx1 -j16 -N8 "$1" | tr -d ' \n')"
  [[ ${#hex} -eq 16 ]] || { echo '?'; return; }
  echo "$((16#${hex:0:8}))x$((16#${hex:8:8}))"
}
icon_size="$(png_size "$here/icon.png" 2>/dev/null || echo '?')"
if [[ "$icon_size" != "128x48" ]]; then
  echo "ERROR: icon.png mide $icon_size y el Homebrew Channel exige 128x48" >&2
  exit 1
fi
cp "$here/icon.png" "$out/icon.png"

# La licencia viaja con el binario: quien reciba el .dol tiene que recibir tambien sus terminos.
# El asistente va bajo GPLv2 (ver la cabecera de source/main.c); el codigo esta en el repositorio.
cp "$here/LICENSE" "$out/LICENSE"

if [[ -n "$web" ]]; then
  if [[ "$web" == "build" ]]; then
    echo "Compilando ANIA+..."
    # Node está instalado con nvm y no aparece en el PATH de los shells no interactivos.
    if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
      # shellcheck disable=SC1091
      . "$HOME/.nvm/nvm.sh"
    fi
    ( cd "$here/../ania" && npx vite build >/dev/null )
    web="$here/../ania/dist"
  fi
  if [[ ! -f "$web/index.html" ]]; then
    echo "ERROR: $web no parece una web compilada (no hay index.html)" >&2
    exit 1
  fi
  mkdir -p "$out/web"
  cp -r "$web/." "$out/web/"
  echo "  web incluida: se podra abrir desde el navegador del dispositivo"
fi
if [[ "$dolphin" == true ]]; then
  # La carpeta de usuario de Dolphin esta en un sitio distinto en cada sistema, y desde WSL hay
  # que llegar ademas a la de Windows, que no tiene ruta estandar. Se prueban las tres habituales
  # y vale la primera que exista; si no hay ninguna, se pone a mano con DOLPHIN_USER.
  dolphin_user="${DOLPHIN_USER:-}"
  if [[ -z "$dolphin_user" ]]; then
    for candidate in \
      "$HOME/.local/share/dolphin-emu" \
      "$HOME/Library/Application Support/Dolphin" \
      "$HOME/Documents/Dolphin Emulator"
    do
      [[ -d "$candidate" ]] && { dolphin_user="$candidate"; break; }
    done
  fi
  if [[ -z "$dolphin_user" ]]; then
    echo "ERROR: no encuentro la carpeta de usuario de Dolphin" >&2
    echo "       ponla con DOLPHIN_USER=\"/ruta/a/Dolphin Emulator\"" >&2
    exit 1
  fi
  dolphin_sd="$dolphin_user/Load/WiiSDSync/apps/aniaplus"
  echo "Copiando a la SD de Dolphin..."
  if [[ ! -d "$(dirname "$dolphin_sd")" ]]; then
    echo "ERROR: no existe $(dirname "$dolphin_sd")" >&2
    echo "       ponla con DOLPHIN_USER=\"/ruta/a/Dolphin Emulator\"" >&2
    exit 1
  fi
  # El `/.` es el que importa: sin el, `cp -r origen destino` mete la carpeta DENTRO del destino y
  # deja un aniaplus/aniaplus con la copia buena escondida, mientras Dolphin sigue arrancando el
  # boot.dol viejo de fuera. Cuesta un rato darse cuenta, porque el copiado no falla.
  mkdir -p "$dolphin_sd"
  cp -r "$out/." "$dolphin_sd/"
fi
echo
echo "Listo. Copia esta carpeta a la raiz de la SD:"
echo "  $here/dist/apps"
echo
du -sh "$out"
