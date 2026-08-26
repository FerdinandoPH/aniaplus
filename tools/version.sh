#!/usr/bin/env bash
#
# La version del proyecto vive en tres ficheros que nadie mantiene sincronizados solos:
#
#   aw/source/main.c    AW_VERSION   -> lo que el asistente pinta en la tele y sirve en /api/status
#   aw/meta.xml         <version>    -> lo que enseña el Homebrew Channel
#   ania/package.json   version      -> la web
#
#   ./tools/version.sh            imprime las tres
#   ./tools/version.sh v0.2.0     falla si alguna no coincide con esa etiqueta
#
# El CI lo llama con la etiqueta antes de compilar nada: una release que dice 0.2.0 por fuera y
# 0.1.0 en la pantalla de la consola es de las que hay que retirar a mano.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

aw_version="$(sed -n 's/^#define AW_VERSION "\(.*\)"$/\1/p' "$root/aw/source/main.c")"
meta_version="$(sed -n 's:.*<version>\(.*\)</version>.*:\1:p' "$root/aw/meta.xml")"
web_version="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$root/ania/package.json" | head -1)"

printf 'aw/source/main.c   AW_VERSION  %s\n' "${aw_version:-(no encontrada)}"
printf 'aw/meta.xml        <version>   %s\n' "${meta_version:-(no encontrada)}"
printf 'ania/package.json  version     %s\n' "${web_version:-(no encontrada)}"

for v in "$aw_version" "$meta_version" "$web_version"; do
  [[ -n "$v" ]] || { echo "ERROR: no he sabido leer alguna de las versiones" >&2; exit 1; }
done

fail=0
if [[ "$aw_version" != "$meta_version" || "$aw_version" != "$web_version" ]]; then
  echo "ERROR: las tres versiones no coinciden entre si" >&2
  fail=1
fi

if [[ $# -gt 0 ]]; then
  esperada="${1#v}"      # la etiqueta es vX.Y.Z; los ficheros llevan X.Y.Z
  echo "etiqueta                       $esperada"
  if [[ "$aw_version" != "$esperada" ]]; then
    echo "ERROR: la etiqueta dice $esperada y los ficheros dicen $aw_version" >&2
    fail=1
  fi
fi

[[ $fail -eq 0 ]] || exit 1
echo "OK: todo dice $aw_version"
