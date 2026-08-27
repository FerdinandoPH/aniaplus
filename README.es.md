# ANIA+

[English](README.md) · **Español**

Creador de pases de batalla personalizados para **Pokémon Battle Revolution**, en las tres versiones
del juego (europea, americana y japonesa). Diseña equipos a mano o al azar desde el móvil o el PC y
pásalos directamente al guardado de tu Wii.

Compatible con Wii, Wii U (vWii) y Dolphin.

ANIA+ son dos programas: **la web**, donde se gestionan los pases, y el **asistente Wii**, un
homebrew que transfiere el guardado desde y hacia la consola.

## Empezar

### 1. Abre la web

**[https://ferdinandoph.github.io/aniaplus/](https://ferdinandoph.github.io/aniaplus/)**

No hay nada que instalar y todo corre del lado del cliente: los pases se guardan en el navegador, no
en ningún servidor. Tiene tres secciones:

- **Pases** — la biblioteca. Toca un pase para editarlo; mantén pulsado para seleccionar varios y
  exportarlos, borrarlos o transferirlos a la Wii.
- **Generar** — pases al azar, con bastantes opciones: cuántos, nivel, legalidad de los
  movimientos, solo formas finales, motes…
- **Wii** — aquí se carga un guardado de PBR, ya sea desde un fichero (Dolphin) o desde la consola
  con el asistente. Con él cargado se ven sus pases, se importan a la biblioteca, se sobrescriben
  con los que tengas seleccionados, y se pueden desbloquear todas las ranuras y los coliseos. Al
  terminar, se descarga el fichero modificado o se manda de vuelta a la Wii.

### 2. Instala el asistente en la Wii

*Solo para Wii y vWii; con Dolphin no hace falta, se carga el fichero directamente.*

1. Descarga el `.zip` de la **[última release](https://github.com/FerdinandoPH/aniaplus/releases/latest)**.
2. Descomprímelo en la **raíz de la tarjeta SD**. Tiene que quedar `apps/aniaplus/boot.dol`.
3. Mete la SD en la Wii, abre el **Homebrew Channel** y lanza *ANIA+ Asistente Wii*.
4. En la tele saldrá la **dirección IP** de la consola.

Escribe esa IP en la pestaña *Wii* de ANIA+ y dale a conectar. La primera vez el navegador pedirá
permiso para hablar con un dispositivo de tu red local. Al terminar —y después de mandar el guardado
de vuelta— conviene cerrar la conexión con el botón *Cerrar*.

Si no tienes internet pero sí red local, la propia consola sirve una copia de la web en
`http://IP-DE-LA-WII:8080/`. Funciona igual, pero como es otro origen, el navegador guarda ahí una
biblioteca de pases distinta de la de la web publicada.

### Requisitos

- **El Homebrew Channel** instalado, y lanzar el asistente desde ahí. Los ficheros de PBR son de
  otro título de la consola, así que hace falta abrirle la mano al sistema: el asistente lo hace
  solo, parcheando en memoria el IOS que ya está corriendo. No hay que instalar ni configurar nada.
  Si lo lanzas desde otro sitio —un forwarder, un cargador de juegos, un HBC antiguo— eso no se
  puede hacer y entonces sí hace falta un **cIOS (249 o 250)**.
- **Haber jugado a PBR al menos una vez** en esa consola, para que el guardado exista.
- Que el móvil u ordenador esté en la **misma red local** que la Wii.

### Tus datos

Al leer el guardado se conserva **siempre** una copia intacta, que puedes descargar con un botón. El
asistente guarda además su propia copia en la Wii, y el botón **1** del mando la restaura.

> **Guarda una copia antes de escribir nada.** El ciclo completo está probado en una Wii de verdad y
> contra guardados reales de las tres regiones, y el juego carga lo que ANIA+ escribe. Aun así estás
> dejando que un programa toque la memoria interna de tu consola.

---

*A partir de aquí es documentación para desarrollar. Para usar ANIA+ no hace falta nada de esto.*

---

## Cómo está repartido

|                                    | Qué es                                                             | Dónde    |
| ---------------------------------- | ------------------------------------------------------------------- | --------- |
| **Asistente principal (AP)** | La web. Diseña pases, los guarda, los comparte y habla con la Wii. | `ania/` |
| **Asistente Wii (AW)**       | Homebrew que lee y escribe el guardado de PBR en la NAND.           | `aw/`   |

La decisión que lo gobierna todo: **el asistente Wii no interpreta nada.** Lee 3,5 MB, los manda,
recibe 3,5 MB y los escribe. Todo lo delicado —cifrado, checksums, formato de los Pokémon— vive en
la web, donde se puede probar a cada cambio.

El formato del guardado está documentado en el propio código: `ania/src/core/` lleva el cifrado, los
checksums, los pases y el BK4, con el porqué de cada decisión al lado de la línea que la aplica. Las
pruebas de `ania/tests/` van contra guardados reales de las tres regiones.

## La web

```bash
. "$HOME/.nvm/nvm.sh"        # si tienes Node con nvm y no sale en el PATH
cd ania
npm install
npm run dev -- --host        # accesible desde otro dispositivo de la misma red
npm test                     # 214 pruebas
npm run build                # ficheros estáticos en dist/
```

Con `npm run dev` hay además `/showcase.html`, que monta todas las pantallas seguidas con datos de
mentira para mirar el diseño de un vistazo.

### Los datos de Gen 4

Todo lo que ANIA+ saca de [PKHeX](https://github.com/kwsch/PKHeX) está reunido en dos carpetas y
solo en dos: `src/data/pkhex/` (los JSON) y `public/pkhex/` (las dos hojas de sprites, normal y
variocolor). Nada de ahí está escrito a mano y cada carpeta lleva su propio `README.md`.

Vienen ya en el repositorio, así que **no hace falta hacer nada de esto** salvo que quieras
regenerarlos desde una versión más nueva de PKHeX:

```bash
git clone --depth 1 https://github.com/kwsch/PKHeX ../PKHeX-master
npm run extract              # src/data/pkhex/*.json
npm run sprites              # public/pkhex/*.png (necesita ImageMagick)
```

Los dos esperan la fuente de PKHeX en `PKHeX-master/`, al lado de `ania/`. No es un submódulo a
propósito: son 82 MB de C# del que solo se leen unas tablas.

### Los guardados de ejemplo

Las pruebas que tocan el formato del guardado van contra ficheros `PbrSaveData` de verdad, uno por
región. Son de consolas reales y no viajan en el repositorio, así que `npm test` los busca y, si no
están, **se salta esos bloques en lugar de fallar**

Para tenerlas todas, apunta las rutas de `ania/tests/fixtures.ts` a los tuyos (claves `europa`,
`sudamerica`, `usa` y `japon`). El guardado propio se saca de la Wii con cualquier gestor de
guardados, o de la NAND de Dolphin.

### Publicarla en un servidor propio

`dist/` son ficheros estáticos: no hace falta Node en el servidor. `npm run build` los deja listos
para servirse desde la raíz del dominio, que es el caso normal y también lo que necesita el
asistente Wii al servir la web desde la SD.

Si va a colgar de un subdirectorio, la ruta se escribe dentro del HTML y del CSS, así que hay que
decirlo al compilar: `npm run build -- --base=/lo-que-sea/`.

Si la sirves con Apache, añade `AddType application/manifest+json .webmanifest` (sin él, el móvil
no ofrece «añadir a pantalla de inicio») y cachea `assets/` largo pero `index.html` con `no-cache`.

Servida por HTTPS, la pestaña *Wii* sigue funcionando: el asistente habla HTTP plano, pero la regla
de contenido mixto está relajada para las direcciones de red local y el navegador se limita a pedir
permiso. Comprobado en Chrome; en otros navegadores, pruébalo antes de depender de ello.

## El asistente Wii

```bash
cd aw
./package.sh --web           # compila el homebrew y le mete la web dentro
cd tests && cc -I../source -o t test_httpparse.c ../source/httpparse.c && ./t
```

Necesita [devkitPro](https://devkitpro.org/) con devkitPPC y libogc. Copia `aw/dist/apps` a la raíz
de la SD y lánzalo desde el Homebrew Channel.

**Cómo abre la NAND.** Los ficheros de PBR pertenecen a otro título, así que hay que adoptar su
identidad con `ES_SetUID`, que un IOS de fábrica rechaza. El asistente prueba dos vías en este
orden: primero **parchear en caliente el IOS que ya está corriendo** (`source/iospatch.c`, con
AHBPROT, que el `meta.xml` pide con `<ahb_access/>`; no requiere nada instalado en la consola), y si
no puede, **recargar a un cIOS 249/250**. El orden no es negociable: `IOS_ReloadIOS` se lleva
AHBPROT por delante, y además desmonta la SD y tira el Bluetooth, así que todo esto va antes de
montar nada. Por dónde ha entrado se ve en la cabecera de la pantalla.

Igual de fijo es el orden de `ES_SetUID` e `ISFS_Initialize`: la identidad se adopta **antes** de
abrir `/dev/fs`, porque un descriptor ya abierto no cambia de permisos después. Los dos viven
juntos en `adopt_identity()` para que no se puedan desordenar.

**Las tres versiones del juego.** Cada una guarda en su propia carpeta de la NAND:

| Versión  | Título | Carpeta                                                 |
| --------- | ------- | ------------------------------------------------------- |
| PAL       | RPBP01  | `/title/00010000/52504250/data/GeniusPbr/PbrSaveData` |
| Americana | RPBE01  | `/title/00010000/52504245/…`                         |
| Japonesa  | RPBJ01  | `/title/00010000/5250424a/…`                         |

Al arrancar se mira cuáles tienen guardado: si solo hay una se usa sin preguntar, y si hay varias el
asistente pregunta cuál editar antes de levantar la red. La `a` del título japonés va en minúscula,
porque las rutas de ISFS distinguen mayúsculas. Si no puede abrir ninguno, no levanta el servidor.

**Con Dolphin** vale el mismo `boot.dol`. Allí no hay cIOS, pero tampoco hace falta: la NAND es una
carpeta del PC y su IOS emulado no aplica permisos. El asistente lo detecta abriendo `/dev/dolphin`
y entonces no toca el IOS. La IP que hay que abrir es la del PC, no la de la consola emulada.
`./package.sh --web --dolphin` deja el paquete en la carpeta de SD de Dolphin, y
`npx tsx tools/install-dolphin-save.ts --region pal|usa|jap` instala un guardado de ejemplo en su
NAND. Las dos buscan la carpeta de Dolphin en los sitios habituales de Linux, macOS y Windows; desde
WSL hay que pasarla a mano con `DOLPHIN_USER=…`.

**La API**, por el mismo puerto que la web: `GET /api/status`, `GET|PUT /api/save`,
`GET|POST|DELETE /api/session`, `POST /api/session/takeover` y `POST /api/session/release/<token>`.
Cualquier otra ruta se busca en `sd:/apps/aniaplus/web`, y solo está si empaquetaste con `--web`.

**Una sesión a la vez.** Mientras alguien tiene el guardado abierto, los demás reciben 409. El
cliente abre la sesión al conectar, la mantiene con un latido y la suelta al cerrar; si desaparece
sin avisar, caduca a los 45 s, y a los 15 s sin latido la web ya ofrece tomar el relevo. El botón 2
del mando también la libera.

**Controles:** **1** restaura la copia de seguridad, **2** libera la sesión, **−** cambia el idioma
de la pantalla, **HOME** sale (pidiendo confirmación si hay alguien editando). El botón de encendido
apaga y **RESET** vuelve al HBC; en los tres casos se avisa antes al dispositivo conectado.

**Idiomas:** castellano, inglés, alemán, francés e italiano, arrancando en el de la consola. No hay
japonés ni acentos porque la fuente de la consola es ASCII de 8×16; por eso los textos se escriben
sin tildes y el alemán usa `ae`/`oe`/`ue`/`ss`. `tests/test_text.c` lo comprueba, junto con que
ninguna traducción cambie el orden de sus `%s` y `%ld`.

Sin red, el asistente no se queda colgado: la configura con la vía asíncrona de libogc, atiende el
mando todo el rato y ofrece **A para reintentar**. Si pierde la señal ya en marcha, cierra la escucha
y reintenta con espera creciente sin obligar a salir.

## Idiomas de la web

La web está en seis idiomas —castellano, inglés, alemán, francés, italiano y japonés—, con los
nombres de Pokémon, movimientos y objetos sacados de PKHeX. En la primera visita abre en el idioma
del dispositivo si es uno de esos seis, y en inglés si no lo es; el catalán es la excepción y cae al
castellano. A partir de ahí recuerda el que elijas.

Aparte va el idioma de lo que se escribe en el guardado: los motes y el sello de idioma del pase
siguen al **guardado cargado**, no a los menús, porque un mote latino en una partida japonesa queda
fuera de sitio. Sin guardado cargado manda la interfaz.

## Estructura

```
ania/
  tools/            extracción de datos y sprites de PKHeX (se ejecuta una vez)
  src/data/pkhex/   datos de Gen 4 derivados de PKHeX (generados)  ← ver su README
  public/pkhex/     hojas de sprites derivadas de PKHeX (generadas)
  src/core/         el guardado: cifrado, checksums, pases, BK4    ← lo delicado
  src/gen/          legalidad, movimientos recomendados, generación aleatoria
  src/ui/           interfaz, primero para móvil
  src/storage/      almacén local y formato .aniapass
  src/transport/    fichero y red, tras una interfaz común
  tests/            214 pruebas, sobre guardados reales de las tres regiones
aw/
  source/           homebrew: NAND (ISFS), servidor HTTP y textos en cinco idiomas
  tests/            el parseo HTTP y las traducciones, compilados de forma nativa
```

## Publicar una versión

Dos flujos automáticos en `.github/workflows/`:

- **`pages.yml`** — cada empujón a `main` pasa las pruebas, compila la web y la publica en GitHub
  Pages con el `--base` que corresponda.
- **`release.yml`** — al empujar una etiqueta `vX.Y.Z` compila el homebrew en el contenedor oficial
  de devkitPro, le mete la web recién compilada y publica la release con el `.zip` listo para la SD.

La versión vive en tres ficheros —`aw/source/main.c`, `aw/meta.xml` y `ania/package.json`— y
`tools/version.sh` los compara entre sí y contra la etiqueta, antes de compilar nada:

```bash
./tools/version.sh          # ver qué dicen los tres ahora mismo
# cambiar los tres a mano
./tools/version.sh v0.2.0   # comprobar antes de etiquetar
git tag v0.2.0 && git push origin v0.2.0
```

## Licencia

**[GPLv3](LICENSE)**, con una excepción: el asistente Wii de `aw/` va bajo **[GPLv2](aw/LICENSE)**,
porque `aw/source/iospatch.c` lleva tres parches de IOS de libruntimeiospatch, publicada bajo la
versión 2 y solo la 2. Son dos programas distintos —binarios distintos, sin código compartido,
hablando por HTTP—, así que cada uno lleva su licencia sin conflicto.

La web es GPLv3 y no algo más permisivo porque los datos de Gen 4 y los sprites derivan de
[PKHeX](https://github.com/kwsch/PKHeX), que es GPLv3. En [`NOTICE.md`](NOTICE.md) está qué viene de
dónde.

Los nombres, los sprites y el formato del guardado de Pokémon son de Nintendo, Creatures Inc. y GAME
FREAK Inc. Este proyecto no está afiliado a ellos ni cuenta con su respaldo, y no distribuye ninguna
copia del juego.
