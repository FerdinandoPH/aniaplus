# ANIA+

[English](README.md) · **Español**

Creador de pases de batalla para **Pokémon Battle Revolution**, en las tres versiones del juego
—europea, americana y japonesa—. Diseña equipos a mano o al azar y los mete en el guardado de tu
Wii, sin sacar la tarjeta ni pasar por el PC.

Son dos piezas: **la web**, donde se hace todo el trabajo, y **el asistente Wii**, un homebrew que
hace de puente con el guardado de la consola.

## Empezar

### 1. Abre la web

**<https://ferdinandoph.github.io/aniaplus/>**

No hay nada que instalar. Funciona en el móvil y en el ordenador, y todo se queda en tu navegador:
no hay servidor, no se sube nada a ningún sitio. Con esto ya puedes diseñar pases, generarlos al
azar y exportarlos a un fichero para compartirlos.

Para pasarlos a la consola necesitas además la segunda pieza.

### 2. Instala el asistente en la Wii

1. Descarga el `.zip` de la **[última release](https://github.com/FerdinandoPH/aniaplus/releases/latest)**.
2. Descomprímelo en la **raíz de la tarjeta SD**. Tiene que quedar `apps/aniaplus/boot.dol`.
3. Mete la SD en la Wii, abre el **Homebrew Channel** y lanza *ANIA+ Asistente Wii*.
4. En la tele saldrá la **dirección IP** de la consola.

### 3. Conéctalos

Escribe esa IP en la pestaña *Wii* de ANIA+ y dale a conectar. La primera vez el navegador pedirá
permiso para hablar con un dispositivo de tu red local; dile que sí.

También puedes abrir directamente `http://IP-DE-LA-WII:8080/` en el navegador: el paquete lleva la
web dentro, así que la sirve la propia consola y funciona **sin internet**.

### Lo que hace falta tener

- **El Homebrew Channel** instalado, y lanzar el asistente desde ahí. Los ficheros de PBR
  pertenecen a otro título de la consola, así que hace falta abrirle la mano al sistema: el
  asistente lo hace solo, parcheando en memoria el IOS que ya está corriendo. No hay nada que
  instalar ni que configurar.
  - Si lo lanzas desde otro sitio —un forwarder, un cargador de juegos, un Homebrew Channel
    antiguo— eso no se puede hacer, y entonces sí hace falta un **cIOS (249 o 250)** instalado. El
    asistente lo busca solo y te dice por pantalla por dónde ha entrado.
- **Haber jugado a PBR al menos una vez** en esa Wii, para que el guardado exista.
- Que el móvil u ordenador esté en la **misma red local** que la consola. Una IP pública con
  redirección de puertos no vale (y tampoco es buena idea: cualquiera que llegue a ese puerto
  podría sobrescribirte el guardado).

### Tus datos

Al leer el guardado se conserva **siempre** una copia intacta, que puedes descargar con un botón.
El asistente guarda además su propia copia en la Wii; el botón **1** del mando la restaura. Al
escribir no se borra el fichero antes, se sobrescribe, para que un fallo a mitad no deje la consola
sin guardado.

> **Guarda una copia antes de escribir nada.** El ciclo completo está probado en una Wii de verdad
> —lee y escribe el guardado en la NAND— y contra guardados reales de las tres regiones, y el juego
> carga lo que ANIA+ escribe. Aun así estás dejando que un programa toque la memoria interna de tu
> consola: descarga la copia de seguridad que se ofrece al leer, que para eso está.

---

*A partir de aquí es documentación técnica: cómo compilarlo, cómo funciona por dentro y por qué
está hecho así. Para usar ANIA+ no hace falta nada de esto.*

---

## Cómo está repartido

| | Qué es | Dónde |
|---|---|---|
| **Asistente principal (AP)** | Web app client-side. Diseña pases a mano o al azar, los guarda, los comparte y habla con la Wii. | `ania/` |
| **Asistente Wii (AW)** | Homebrew que lee y escribe el guardado de PBR en la NAND. | `aw/` |

La decisión de arquitectura que lo gobierna todo: **el asistente Wii no interpreta nada.** Lee
3,5 MB, los manda, recibe 3,5 MB y los escribe. Todo lo delicado —cifrado, checksums, formato de
los Pokémon— vive en la web, donde se puede probar de verdad y a cada cambio.

El formato del guardado está documentado en el propio código, que es donde se sostiene: `src/core/`
lleva el cifrado, los checksums, los pases y el BK4, con el porqué de cada decisión al lado de la
línea que la aplica. Las pruebas de `tests/` van contra guardados reales de las tres regiones y son
la especificación ejecutable de todo eso.

## Poner en marcha la web

```bash
. "$HOME/.nvm/nvm.sh"        # Node está instalado con nvm y no sale en el PATH por defecto
cd ania
npm install
npm run dev -- --host        # accesible desde otro dispositivo de la misma red
```

```bash
npm test                     # 209 pruebas
npm run build                # ficheros estáticos en dist/
```

### Regenerar los datos de Gen 4 (opcional)

Todo lo que ANIA+ saca de PKHeX está reunido en **dos carpetas, y solo en dos**:
`src/data/pkhex/` (los JSON, 296 KB) y `public/pkhex/` (las dos hojas de sprites). Nada de lo que
hay ahí está escrito a mano; se sobrescribe entero al regenerar. Cada una lleva su propio
`README.md` con el detalle y la licencia.

Vienen ya en el repositorio, así que **no hace falta hacer nada de esto para compilar ni para
desarrollar**. Solo si quieres regenerarlos, o traerlos de una versión más nueva de PKHeX:

```bash
git clone --depth 1 https://github.com/kwsch/PKHeX ../PKHeX-master
npm run extract              # src/data/pkhex/*.json, desde PKHeX.Core
npm run sprites              # public/pkhex/*.png, desde PKHeX.Drawing.PokeSprite
```

Los dos scripts esperan la fuente de PKHeX en `PKHeX-master/`, al lado de `ania/`. No es un
submódulo a propósito: son 82 MB de código C# del que solo se leen unas tablas, y una vez extraídas
no hace falta para nada más. `npm run sprites` monta los sprites de caja —los de la generación 4,
la época del juego— en `public/pkhex/pokemon.png` y `pokemon-shiny.png`, 192 KB cada una, más un
índice de 660 celdas en `src/data/pkhex/sprites.json`; necesita ImageMagick.

### Los guardados de ejemplo

Las pruebas que tocan el formato del guardado van contra **ficheros `PbrSaveData` de verdad**, uno
por región. Esos ficheros son de consolas reales y no viajan en el repositorio, así que
`npm test` los busca y, si no están, **se salta esos bloques en lugar de fallar**: un clon recién
hecho pasa 110 de las 209 pruebas y no da ni un error. Las que se saltan son justo las que no
significan nada sin un guardado delante.

Para tenerlas todas, pon los guardados donde los espera `tests/fixtures.ts` (rutas relativas a la
raíz del proyecto):

| Clave | Ruta |
|---|---|
| `europa` | `Español (SPA) …/¬ Español EUROPA (EUR)/(ARCHIVO PRINCIPAL) Wii o Dolphin/0001000052504250/GeniusPbr/PbrSaveData` |
| `sudamerica` | `Español (SPA) …/¬ Español SUDAMERICA (EUR)/…/0001000052504250/GeniusPbr/PbrSaveData` |
| `usa` | `RPBE01 (NTSC-U) Save Post Game/00010000/52504245/data/GeniusPbr/PbrSaveData` |
| `japon` | `日本語版 (JAP) …/000100005250424a/GeniusPbr/PbrSaveData` |

Los nombres largos son los de los paquetes de guardados que circulan por la comunidad; lo más
cómodo es abrir `tests/fixtures.ts` y apuntar las rutas a los tuyos. El guardado propio se saca de
la Wii con cualquier gestor de guardados, o de la NAND de Dolphin.

Un bloque de `gen.test.ts` usa además la base de datos de equipos competitivos que viene con el
paquete español (`PC cuadros Bases de datos de texto …/Base de datos PBR.txt`) y los nombres de
movimientos de PKHeX; se salta por su cuenta si falta cualquiera de los dos.

### Publicarla en un servidor propio (Apache, subdirectorio)

`dist/` son ficheros estáticos: no hace falta Node en el servidor. Lo único que hay que decidir
antes de compilar es **desde qué ruta se va a servir**, porque va escrita dentro del HTML y del CSS:

```bash
npm run build -- --base=/aniaplus/                 # para ejemplo.net/aniaplus/
rsync -av --delete dist/ pi@mi-servidor:/var/www/html/aniaplus/
```

Compilar sin `--base` deja la web preparada para la raíz, que es lo que necesita el asistente Wii
al servirla desde la SD. Son dos compilaciones distintas del mismo código; el `package.sh` del
asistente hace la suya.

En Apache no hace falta ningún módulo especial —la aplicación no tiene rutas, así que tampoco
`mod_rewrite`— pero sí conviene esto en el `<VirtualHost>` (o en un `.htaccess` si tienes
`AllowOverride`):

```apache
# Apache no conoce este tipo: sin él, el móvil no ofrece "añadir a pantalla de inicio".
AddType application/manifest+json .webmanifest

<Directory /var/www/html/aniaplus>
    Options -Indexes
    Require all granted

    # Los nombres de assets/ llevan hash: se pueden cachear para siempre.
    <FilesMatch "\.(js|css|png|webp|ico)$">
        Header set Cache-Control "public, max-age=31536000, immutable"
    </FilesMatch>
    # El index no, o el navegador seguiría cargando la versión vieja tras cada despliegue.
    <FilesMatch "^index\.html$">
        Header set Cache-Control "no-cache"
    </FilesMatch>
</Directory>

# El grueso del peso es JS y JSON de texto: comprimir lo deja en una fracción.
AddOutputFilterByType DEFLATE text/html text/css application/javascript application/json image/svg+xml
```

Las cabeceras y la compresión piden dos módulos que en Raspberry Pi OS no vienen activados:
`sudo a2enmod headers deflate && sudo systemctl reload apache2`.

> **Con HTTPS la pestaña *Wii* sigue funcionando, y el navegador pedirá permiso.** El asistente
> habla HTTP plano —a una IP privada no se le puede dar un certificado, así que no hay otra—, y la
> regla de contenido mixto diría que una página servida por HTTPS no puede pedirle nada. Pero esa
> regla está relajada justo para las direcciones de red local, que si no dejaría incomunicado a
> cualquier cacharro de casa: en su lugar el navegador **pregunta** («esta página quiere conectarse
> a un dispositivo de tu red local») y, concedido el permiso, la petición sale.
>
> Comprobado con la web servida por HTTPS desde fuera de la red y la Wii en la LAN, en Chrome y en
> una ventana de incógnito —o sea, sin excepciones guardadas de antes—. Lo que no está comprobado
> es el resto de navegadores: aquí no todos han ido a la vez, así que si vas a depender de ello,
> pruébalo antes en el que uses. Y ojo con confundirlo con la excepción manual de «Contenido no
> seguro → Permitir» del candado: esa vale solo para ti y solo en ese perfil.

Ten en cuenta que **la biblioteca de pases no viaja entre orígenes**: lo guardado desde
`ejemplo.net/aniaplus/` no se ve desde `http://IP-DE-LA-WII:8080/` ni al revés, porque el navegador
aísla el almacenamiento por origen y no hay forma de saltárselo. Para llevarlos de uno a otro están
*Exportar* e *Importar* (`.aniapass`).

Con `npm run dev` hay además `/showcase.html`, que monta todas las pantallas seguidas con datos
de mentira: sirve para mirar el diseño de un vistazo sin ir tocando pestañas. No entra en la
compilación, porque Vite solo empaqueta lo que cuelga de `index.html`.

### Guardados de cualquier región

La web lee los guardados de las tres versiones —PAL, americana y japonesa—, y no hacía falta casi
nada para eso: el cifrado, los checksums y hasta la tabla de caracteres son los mismos. La de Gen 4
es **una sola** y ya trae el silabario japonés, así que un mote como `カビゴン` se lee y se reescribe
sin ninguna tabla aparte.

Lo que sí cambia con la región:

- **Cuántos pases personales hay**: 37 en las versiones internacionales, 32 en la japonesa. Lo dice
  un bit del guardado, y ahí estaba la trampa: está negado —a 0 significa japonés— y en un perfil
  sin estrenar ese byte está a cero. Leyéndolo perfil a perfil, tres de los cuatro perfiles del
  guardado americano pasaban por japoneses y se quedaban con 32 pases en vez de 37. Ahora se mira
  el **primer perfil escrito**, que es lo único fiable, y vale para el guardado entero.
- **El idioma del perfil**: el byte que lo guarda no distingue japonés de inglés (los dos son 0),
  así que se resuelve con esa misma bandera.
- **El idioma de lo que se genera**: los motes y el sello de idioma del pase siguen al **guardado
  cargado**, no a los menús de ANIA+. Lo que se escribe ahí lo enseña el juego, y un mote latino en
  una partida japonesa queda fuera de sitio. Sin guardado cargado manda la interfaz.

La aplicación está en seis idiomas, japonés incluido (los nombres de Pokémon, movimientos y objetos
salen de PKHeX). El asistente Wii es aparte: ese tiene cinco, por la fuente de la consola.

### Hacer pases

- **Seleccionar pases** (para exportarlos, borrarlos o transferirlos): el redondel de la esquina de
  cada tarjeta, o mantener pulsada la tarjeta. Con algo ya seleccionado, un toque en cualquier otra
  la añade; sin nada seleccionado, el toque abre el editor.
- **Pase nuevo** (lista de pases) crea uno en blanco; cada ranura del equipo ofrece *+ Nuevo*, que
  mete uno de partida —nivel 50, IV a 31, sin EV— y abre su editor.
- **Generar** los hace al azar con las opciones del enunciado. Si el nombre lleva `{n}`, ahí va
  el número de cada pase del lote: `random{n}` da `random1`, `random2`… Sin marcador, se numera
  al final solo cuando hay más de uno.
- **Solo formas finales** (generador): descarta las fases que aún evolucionan, que a nivel 50 solo
  son un equipo peor. No excluye a los Pokémon sin línea evolutiva —Tauros o Mew entran igual—,
  porque lo que se mira es si les queda algo por delante, no si vienen de algo. Quedan 264 de 493.
- **Movimientos que hagan daño** (generador): con los movimientos sorteados —*Legales, pero al
  azar* y *Todo vale*— se elige garantizar uno o dos ataques. Con dos, los combates se resuelven
  antes; con uno salen equipos más raros. No aparece con *Recomendados*, que copia lo que el
  Pokémon sabría de verdad a nivel 50, ni se fuerza en especies como Ditto, y el tope real lo pone
  el movepool: si solo hay un ataque legal, es lo que hay.
- **Al menos un movimiento de su tipo** (generador): solo con *Todo vale*, donde los cuatro
  movimientos salen del saco entero de Gen 4 y lo normal es que ninguno sea de la especie. Se
  garantiza un ataque de uno de sus dos tipos —de estado solo si no hay ningún ataque de ese
  tipo—, pisando siempre un hueco que no pegue para no quedarse corto de ataques. El tipo de cada
  movimiento sale de `MoveInfo5.cs` de PKHeX, la tabla que vale de Gen 2 a Gen 5.
- **Caos de nombre** (generador): un mismo mote para todos los Pokémon del lote, también los de
  pases distintos. Se escribe, o se deja vacío y al generar se pide una palabra española al azar a
  `random-word-api.herokuapp.com`; sin conexión sale una de la lista de reserva que lleva dentro.
  En los dos casos el mote se guarda en mayúsculas, a juego con los nombres de especie.
  Ojo: una palabra de internet no la reproduce la semilla, porque no sale del `Rng`.
- En el editor de Pokémon se toca todo: especie, movimientos (con ⚠ en los ilegales, que no
  bloquean), habilidad, objeto, EV, **IV uno a uno**, naturaleza, género, PID y variocolor.
  El género solo se puede elegir en las especies que admiten los dos —Chansey siempre es hembra,
  Magnemite no tiene género, y ahí no hay nada que decidir, así que el chip queda fijo—.
- **Pasar Pokémon de un pase a otro**: cada Pokémon del equipo tiene un `→` que lo copia al pase
  que elijas de la biblioteca, y las ranuras vacías ofrecen *+ De otro pase* además de *+ Nuevo*.
  Siempre copia —el pase de origen se queda con el suyo— y no salen como destino ni los pases
  llenos (con su `6/6` al lado, para que se vea por qué) ni los secretos.
- En el editor de pase se elige el **modelo del entrenador** (los 6 personajes jugables de PBR).
  Al cambiarlo se repone el vestuario a lo que trae de fábrica ese personaje: la ropa de cada
  modelo es su propio catálogo, así que el mismo número de "Top" no es la misma prenda en otro
  cuerpo. Elegir prenda a prenda no está — sus nombres viven comprimidos dentro del disco del
  juego (`.fsys`) sin descompresor, el mismo bloqueo que las potencias de movimiento; investigado
  en Ghidra sobre el ejecutable y confirmado sin salida corta. Al generar al azar, **el personaje
  también sale al azar** (del mismo `Rng` que el equipo, para que una semilla siga reproduciendo el
  lote entero) con su vestuario y sus frases puestos a juego.
- **Mote**: por defecto no hay mote propio, pero el campo lleva el nombre de la especie **en
  mayúsculas**, como en los juegos de la generación 4, que es lo que el juego enseña en combate.
  Dejarlo vacío —lo que hacíamos— sacaba a los seis Pokémon sin nombre. En el editor, la casilla
  *propio* abre el campo y marca la bandera, como en PKHeX.
- **Frases**: PBR no guarda "sin frase", guarda una bandera por frase que dice si el texto sale del
  pase o del bloque de frases del personaje. Los pases nuevos nacen con las seis de fábrica; al
  escribir una propia se apaga la bandera de esa, y solo de esa. Cambiar de personaje reapunta los
  índices a su bloque, por el mismo motivo que se repone el vestuario.

Dos detalles de la generación 4 que la interfaz tiene que respetar y conviene conocer:

- **La naturaleza y el género no son campos**, son `PID % 25` y el byte bajo del PID contra el
  ratio de la especie. Al elegir cualquiera de los dos se busca un PID nuevo que lo dé
  conservando lo demás (habilidad, y naturaleza o género según cuál se haya tocado), así que el
  PID cambia; si el Pokémon era variocolor, deja de serlo.
- **El variocolor se consigue moviendo el SID, no el PID** (igual que en PKHeX). Buscar un PID
  variocolor sería 1 entre 8192 dentro de un espacio ya restringido por naturaleza, habilidad y
  género, y podría no encontrarse ninguno; con el SID sale siempre y no arrastra nada más.

## Poner en marcha el asistente Wii

```bash
cd aw
./package.sh --web           # compila el homebrew y le mete ANIA+ dentro
```

Copia `aw/dist/apps` a la raíz de la tarjeta SD y lánzalo desde el Homebrew Channel. En pantalla
saldrá la IP de la Wii.

> **Cómo se abre la NAND: AHBPROT primero, cIOS como plan B.** Los ficheros de
> `/title/00010000/52504250/data` pertenecen al título de PBR, y un homebrew lanzado desde el
> Homebrew Channel corre con otra identidad. En un IOS de fábrica, `ES_SetUID` —la llamada que
> sirve para adoptar esa identidad— se rechaza, y el módulo FS comprueba además de quién es cada
> rama de la NAND, así que la apertura se deniega. Hay dos formas de abrir esa puerta, y el
> asistente las prueba en este orden:
>
> 1. **Parchear en caliente el IOS que ya está corriendo** (`source/iospatch.c`). El `meta.xml`
>    pide `<ahb_access/>`, con lo que el Homebrew Channel arranca la aplicación sin recargar IOS y
>    con AHBPROT desactivado: desde ahí el PPC puede escribir en la memoria de IOS. Se levanta
>    también el cerrojo de MEM2 —son dos, y hay que abrir los dos— y se aplican tres parches:
>    `isfs_permissions`, que es el imprescindible, y `es_setuid` / `es_identify`, que devuelven a
>    `ES_SetUID` su comportamiento de cIOS para que el resto del código tenga un único camino.
>    Los patrones vienen de libruntimeiospatch; están copiados en vez de enlazar la librería porque
>    solo hacen falta tres de sus doce parches, y los de firma son justo los que no se quieren.
>    **Esta vía no requiere nada instalado en la consola.**
> 2. **Recargar a un cIOS (249 o 250)**, donde esas comprobaciones ya vienen desactivadas. Es lo
>    que hace falta cuando la aplicación se lanza desde un forwarder, un cargador de juegos o un
>    Homebrew Channel antiguo: ahí no llega AHBPROT y el parcheo no es posible.
>
> Si no entra ninguna de las dos, **sigue de todas formas** y avisa: puede que ese IOS permita el
> acceso, y si no, el error de apertura lo dirá con su código exacto. Por dónde ha entrado se ve en
> la cabecera (`(AHBPROT)` o `(cIOS)`).
>
> **AHBPROT va antes que el cIOS, y no al revés**, porque `IOS_ReloadIOS` se lleva AHBPROT por
> delante: en cuanto se recarga, la vía preferente deja de estar disponible para siempre.
>
> El orden importa también hacia fuera: todo esto es lo primero que hace el programa, antes de
> montar la SD y de inicializar el mando, porque **`IOS_ReloadIOS` desmonta la tarjeta y tira la
> pila Bluetooth**. Recargar después dejaría la SD sin montar y el mando sin responder.
>
> Antes de recargar se comprueba con ES que ese cIOS **esté instalado de verdad**. Recargar a un
> título que no existe no devuelve un error y ya: deja el sistema a medio arrancar, y en Dolphin se
> lleva por delante la emulación entera.

### Las tres versiones del juego

PBR salió con tres títulos distintos, y cada uno guarda en su propia carpeta de la NAND:

| Versión | Título | Carpeta |
|---|---|---|
| PAL | RPBP01 | `/title/00010000/52504250/data/GeniusPbr/PbrSaveData` |
| Americana | RPBE01 | `/title/00010000/52504245/…` |
| Japonesa | RPBJ01 | `/title/00010000/5250424a/…` |

Al arrancar se mira cuáles tienen guardado. Si solo hay una —lo normal en una consola— se usa sin
preguntar; si hay dos o más, el asistente **pregunta cuál editar** antes de levantar la red, con
izquierda y derecha para cambiar y A para aceptar. Solo se pregunta ahí: cambiar de versión más
tarde sería cambiar de fichero con la copia de seguridad y lo que el dispositivo tenga abierto
pertenecientes al anterior. La elegida se ve en la cabecera (`PAL`, `USA`, `JAP`) y en
`/api/status` (`"region": "USA"`).

> **El orden de `ES_SetUID` e `ISFS_Initialize` no es negociable.** La identidad se adopta **antes**
> de abrir `/dev/fs`: un descriptor abierto con la identidad del Homebrew Channel no cambia de
> permisos porque después se llame a `ES_SetUID`, y a partir de ahí ISFS deniega el acceso (-101 o
> -102) aunque la identidad ya sea la correcta. Por eso probar varias versiones no es abrir la NAND
> una vez y cambiar de identidad sobre la marcha, sino **un ciclo completo por candidato**: adoptar,
> abrir, probar el fichero, cerrar. Con un solo candidato no hay ciclo ninguno —adoptar, abrir,
> probar— que es la secuencia de siempre. Las dos llamadas viven juntas en una única función
> (`adopt_identity`) justamente para que no se puedan volver a desordenar moviendo código.

Qué se prueba y en qué orden: los títulos que ES diga que están instalados, y los tres si no
reconoce ninguno, que es lo que pasa en Dolphin —ahí la carpeta del guardado existe sin que haya
título instalado—. Y un detalle que cuesta un rato si se pasa por alto: la `a` final del título
japonés va en **minúscula**, porque las carpetas de `/title` son hexadecimal en minúsculas y las
rutas de ISFS distinguen mayúsculas.

Si no se puede abrir ningún guardado, el asistente **no levanta el servidor**: enseña el motivo y
espera a HOME. Anunciar una dirección para servir un guardado que no existe solo sirve para que la
web se conecte y reciba un error.

### El idioma de la pantalla

El asistente arranca en el idioma de la propia consola (`CONF_GetLanguage`) y el botón **−** del
mando los recorre; la elección se recuerda en `sd:/apps/aniaplus/lang.txt`. Hay castellano, inglés,
alemán, francés e italiano.

> **Ni japonés ni acentos, y no por descuido.** La consola de libogc pinta con una fuente de 8×16
> que solo tiene ASCII: un texto japonés saldría en cuadros, así que en una Wii japonesa el
> asistente habla inglés (la web sí lo tiene completo). Por lo mismo, todos los mensajes se
> escriben sin tildes ni eñes —«Direccion», «senal»— y el alemán usa `ae`/`oe`/`ue`/`ss`.
> `tests/test_text.c` lo comprueba, junto con lo que de verdad puede tumbar la consola: que ninguna
> traducción cambie el orden ni el tipo de sus `%s` y `%ld`, que es un fallo que no da error al
> compilar y revienta al ejecutar.

### Con Dolphin

El mismo `boot.dol` vale para el emulador; no hay que compilar nada distinto. Ahí no hay cIOS
ninguno, pero tampoco hace falta: la NAND de Dolphin es una carpeta del PC y su IOS emulado no
aplica los permisos de la consola real, así que el guardado se abre sin adoptar ninguna identidad.
El asistente lo detecta abriendo `/dev/dolphin` —un dispositivo que solo existe en el emulador— y
entonces **no toca el IOS**, ni sugiere instalar cIOS cuando algo falla; la cabecera pone `Dolphin`
en lugar del número de IOS, y `/api/status` trae un `"dolphin": true`.

Hace falta que en la NAND del emulador exista el guardado de PBR
(`Wii/title/00010000/<título>/data/GeniusPbr/PbrSaveData`, 3,5 MB), es decir, haber arrancado el
juego al menos una vez. `./package.sh --web --dolphin` deja el paquete además en la carpeta de SD
sincronizada de Dolphin, y `npx tsx tools/install-dolphin-save.ts --region pal|usa|jap` instala en
esa NAND cualquiera de los tres guardados de ejemplo (que hay que tener puestos: ver «Los
guardados de ejemplo»). Las dos herramientas buscan la carpeta de usuario de Dolphin en los tres
sitios habituales (`~/.local/share/dolphin-emu` en Linux, `~/Library/Application Support/Dolphin`
en macOS, `~/Documents/Dolphin Emulator` en Windows) y se quedan con la primera que exista. Desde
WSL no vale ninguna —la carpeta está del lado de Windows, bajo la letra de unidad y el nombre de
usuario que sean—, así que hay que pasarla por delante:
`DOLPHIN_USER="/mnt/c/Users/tu-usuario/Documents/Dolphin Emulator" ./package.sh --web --dolphin`.

Ojo con la dirección: la red del Wii emulado sale por el equipo anfitrión, así que la IP que hay que
abrir en el navegador es la del PC, no una de la consola.

El asistente sirve dos cosas por el mismo puerto:

- **La API** — `GET /api/status`, `GET|PUT /api/save`, `GET|POST|DELETE /api/session`,
  `POST /api/session/takeover` y `POST /api/session/release/<token>`.
- **La propia web** — cualquier otra ruta se busca en `sd:/apps/aniaplus/web`, y `/` devuelve
  `index.html`. Solo está si empaquetaste con `--web`; si no, esas rutas dan 404 y la API sigue
  funcionando igual.

### Un dispositivo editando a la vez

Mientras alguien tiene el guardado abierto en ANIA+, **ningún otro dispositivo puede editarlo**.
Si dos pudieran, ambos leerían lo mismo, cada uno cambiaría lo suyo, y el segundo en enviar
borraría el trabajo del primero sin que ninguno se enterase.

No basta con atender las peticiones de una en una: editar son minutos sin tocar el guardado. Por
eso el cliente **abre una sesión explícita** al conectar (`POST /api/session`), la mantiene viva
con un latido mientras la pestaña siga abierta, y la suelta al pulsar *Cerrar* o al cerrar la
pestaña. Los demás reciben 409. El plazo de 45 s sin latido solo existe para recuperarse de un
móvil que desaparece sin avisar; el botón 2 del mando también la libera a mano.

Como el aviso de cierre es *best-effort* por definición —siempre habrá cierres que se lo lleven por
delante: matar la aplicación, quedarse sin batería, salirse de la wifi—, el otro dispositivo no
puede quedarse esperando a ciegas. `GET /api/session` dice desde cuándo está callada (`idle`), y con
eso la web informa de cuánto le queda; pasados 15 s sin latido ofrece **tomar el relevo**
(`POST /api/session/takeover`), que es la misma decisión que el botón 2 del mando pero desde donde
está el usuario. Mientras el otro siga latiendo, el asistente lo deniega: la sesión es suya.

> **Por qué hay dos formas de soltarla.** Al cerrar la pestaña no hay tiempo de esperar respuesta, y
> un `fetch` normal lanzado ahí suele cancelarse. Lo único que el navegador garantiza que sale es
> `navigator.sendBeacon`, que solo manda peticiones **simples**: `POST`, sin cabeceras propias. Con
> `DELETE` y `X-Ania-Session` el navegador mandaría antes un preflight `OPTIONS` —dos viajes que
> terminar mientras la página muere—, y eso pasa justo en el escenario normal, con la web servida
> desde otra máquina. Por eso existe `POST /api/session/release/<token>`, con el token en la ruta.
> El `DELETE` se queda para el botón *Cerrar*, donde sí se puede esperar y contar lo que ha pasado.
>
> Y `pagehide` **no siempre significa que la página se muera**: en el móvil salta también al cambiar
> de aplicación, cuando la pestaña solo se congela (bfcache). Durante un tiempo eso se trató como
> «no soltar», y el remedio salió peor que la enfermedad: **cerrar una pestaña en el móvil también
> la mete en la bfcache**, así que ese caso —el que de verdad importa— se estaba tragando el aviso y
> la Wii se quedaba bloqueada hasta que caducase. Distinguirlos desde la página es imposible, y la
> asimetría de castigos manda: soltar de más cuesta un `acquire()` transparente al volver
> (`pageshow` revalida la sesión); soltar de menos bloquea la consola. Ahora se suelta siempre.
>
> Como el aviso puede perderse sin dejar rastro por ningún lado —la Wii no registra lo que no llega,
> y en la web el registro muere con la pestaña—, cada intento se apunta en `localStorage`
> (`ania.lastRelease`: qué evento lo disparó, si había sesión y qué contestó `sendBeacon`) y la web
> lo enseña al arrancar. Es lo que convierte «sigue bloqueada» en «el navegador ni lo intentó» o
> «lo intentó y se perdió por el camino», que piden arreglos opuestos. En la tele, la cabecera
> cuenta además las **conexiones mudas**: las que se abren y se cierran sin decir nada.

Las dos transferencias mueven 3,5 MB por wifi y tardan varios segundos, así que la web abre una
**ventana de progreso** con las mismas fases que el asistente escribe en la tele: al leer, primero
«la Wii está leyendo su guardado» —el rato entre la petición y la primera respuesta, que es
exactamente el que la consola pasa en la NAND— y luego la barra con los bytes que van llegando; al
enviar, la barra de subida y, cuando termina, «está escribiendo en la NAND» hasta que contesta. No
tiene botón de cancelar: solo informa. El porcentaje de subida sale de `XMLHttpRequest`, que es lo
único que informa del avance de un envío; `fetch` no puede, y por eso el PUT es la única petición
que no lo usa.

Controles: **1** restaura la copia de seguridad de la sesión, **2** libera la sesión, **−** cambia
el idioma de la pantalla, **HOME** sale (si hay una sesión de edición viva, pide confirmación en pantalla antes de cerrar, para no
cortar a alguien a mitad de editar). El **botón de encendido** de la consola y el del mando apagan
la Wii, y **RESET** vuelve al Homebrew Channel; en los tres casos se avisa antes al dispositivo
que estuviera editando.

### Sin red, y sin quedarse colgado

Arrancar el asistente sin conexión dejaba la consola clavada en «Conectando a la red…» sin responder
ni a HOME ni al botón de encendido: había que apagarla a lo bruto. La culpa era de `if_config`, que
bloquea hasta veinte intentos de DHCP dentro de IOS; mientras tanto nadie lee el mando, y aunque el
callback de encendido sí levanta su bandera, **no había ningún bucle mirándola**.

Ahora la red se configura con la vía asíncrona de libogc (`net_init_async` + `net_get_status`), que
devuelve el control en cada vuelta: 30 segundos de plazo, el mando atendido todo el rato, y si no
sale, **A para reintentar** sin tener que volver al cargador.

Con el asistente ya en marcha, perder la señal tampoco obliga a salir. El bucle comprueba una vez
por segundo que la consola conserva su IP —y cuenta los errores seguidos del socket de escucha, que
es la otra cara del mismo problema—; al perderla cierra la escucha, la cabecera pasa a `sin red -
reintentando` en lugar de anunciar una dirección muerta, y reintenta con espera creciente (2, 4,
8… hasta 30 s) para no freír la pila de red mientras el router arranca. Al volver, se rehace la
escucha y se avisa en el registro; si la IP ha cambiado, con énfasis, porque la web del dispositivo
que estuviera conectado sigue apuntando a la vieja.

> **El reloj de la sesión se para mientras no hay red.** Si no, un corte de wifi de un minuto le
> quitaría la sesión a alguien que sigue ahí con el guardado abierto, castigándole por algo que no
> ha hecho. En la web pasa lo simétrico: un latido perdido se ignora —puede ser un corte
> momentáneo—, pero dos seguidos ya se avisan, porque si no, un corte se manifiesta como que el
> botón de enviar falla sin explicación.

> **Dos reglas que costaron un cuelgue.** Cualquier espera dentro del asistente tiene que leer el
> mando y mirar las banderas de apagado: un `while (1)` pelado deja la consola sin forma de salir
> —ni HOME, ni el botón de encendido— y obliga a apagarla a lo bruto. Y los botones de encendido y
> reinicio **no hacen nada por sí solos**: hay que registrar `SYS_SetPowerCallback`,
> `SYS_SetResetCallback` y `WPAD_SetPowerButtonCallback`, que es lo único que convierte esas
> pulsaciones en algo que el programa pueda atender. Los callbacks solo levantan una bandera; el
> cierre ordenado se hace en el bucle principal.

La pantalla tiene **cabecera fija** (dirección, estado del guardado, contadores, teclas) y debajo
un registro con una línea por petición. No es cosmético: son dos ventanas de consola distintas
(`consoleSetWindow`), y el desplazamiento queda confinado al registro, así que la dirección de la
Wii no se va nunca por arriba.

> **La geometría de la consola no es un detalle.** `console_init(xfb, 24, 24, ancho, alto, …)` con
> el alto **de la pantalla entera** declara una ventana de texto que empieza en y=24 y termina 24
> píxeles **por debajo del framebuffer**: libogc dibuja en `target_y + fila`. Mientras no se
> desplaza no se nota; en cuanto lo hace, el `memmove` del scroll escribe ~25 KB pasado el final
> del framebuffer, encima del montón. Eso daba a la vez la pantalla llena de basura y una excepción
> DSI al recargar la web, porque lo que hay detrás es la memoria que se reserva para servir
> ficheros. El margen hay que descontarlo **del tamaño**, no solo del origen.

El dispositivo desde el que edites —móvil, tableta u ordenador, da igual— **tiene que estar en la
misma red local que la Wii**. Una IP pública con redirección de puertos no vale, y tampoco es buena
idea: la sesión es un cerrojo para que no editen dos a la vez, no una contraseña, así que quien
llegue a ese puerto puede leer y sobrescribir el guardado. Para entrar desde fuera, mete el
dispositivo en la red (VPN) en lugar de sacar la consola a internet.

Dicho eso, tienes dos opciones:

1. **Abrir `http://IP-DE-LA-WII:8080/` en el navegador.** La web la sirve la propia consola: mismo
   origen, sin permisos que conceder, sin internet y sin depender de que ningún navegador siga
   permitiendo mañana lo que permite hoy.
2. Abrir ANIA+ donde quieras y escribir la IP en la pestaña *Wii*. Funciona igual, también con la
   web servida por HTTPS: el navegador pedirá permiso para hablar con un dispositivo de la red
   local y con eso basta (ver el aviso de «Publicarla en un servidor propio»). Es lo cómodo si ya
   tienes ANIA+ publicada en algún sitio; la opción 1 es la que no depende de nada de eso.

Pruebas del homebrew:

```bash
cd aw/tests
cc -I../source -o t test_httpparse.c ../source/httpparse.c && ./t
```

---

## Marca e iconos

Todo sale de `aniaplus_logo.png` (1254×1254, la recepcionista de Pokétopia en turquesa `#048E9F`
con el rótulo «ania+»). Los derivados están generados con ImageMagick y paletizados a 64 colores,
porque el original es plano de dos tintas y pasa de 819 KB a unos pocos:

| Dónde | Fichero | Qué es |
|---|---|---|
| Homebrew Channel | `aw/icon.png` | **128×48 exactos**: figura a la izquierda y rótulo a la derecha. Si el tamaño no es ese, el HBC no lo escala — lo ignora y pone el icono genérico sin decir por qué, así que `package.sh` lo comprueba y aborta. |
| Pestaña del navegador | `ania/public/favicon.ico`, `icon-16/32.png` | Solo la figura: a 16 px el rótulo sería ilegible. |
| Pantalla de inicio del móvil | `apple-touch-icon.png`, `icon-192/512.png` + `manifest.webmanifest` | iOS ignora el manifiesto para el icono, por eso hace falta también la etiqueta `apple-touch-icon`. |
| Cabecera de la app | `icon-64.png` | Tesela con esquinas redondeadas. |
| Estado vacío | `logo.png` | El logo completo, a 400 px. |

Los iconos van sobre fondo blanco a propósito, no transparente: los blancos *interiores* de la
figura (la cara, el auricular, el cuello) son parte del dibujo, así que con transparencia se
volverían oscuros sobre un fondo oscuro y la cara desaparecería.

Para regenerarlos tras cambiar el logo, mira los comandos en el historial de `package.sh` o repite
los recortes: figura `523x629+334+213`, rótulo `645x152+299+865`.

## Sprites de los Pokémon

Salen de PKHeX (`PKHeX.Drawing.PokeSprite`), que trae el sprite de caja de cada especie y forma
en el estilo de la generación 4. `npm run sprites` los monta en **dos hojas** —normal y
variocolor, 660 celdas de 68×56 cada una, 192 KB— en `public/pkhex/` y escribe el índice en
`src/data/pkhex/sprites.json`.
`ui/sprite.ts` es el único que conoce ese índice; el resto pide `sprite(especie, {forma, shiny})`.

Una hoja y no 660 ficheros porque **el asistente Wii atiende las peticiones de una en una**: 660
imágenes sueltas serían 660 idas y venidas por la red hacia una consola de 2006. Así es una sola,
y el navegador la cachea. La hoja de variocolor no se descarga salvo que aparezca uno en pantalla:
un navegador no pide una imagen de fondo que ningún elemento usa.

Un aviso práctico: los sprites son material de Nintendo, igual que los datos de especies y
movimientos. Van en el repositorio por lo mismo que van en el de PKHeX, que es de donde salen y
lleva años publicándolos; si alguna vez hay que sacar algo, es lo primero, y por eso está todo
junto en `public/pkhex/` y `src/data/pkhex/` en lugar de repartido. PKHeX es GPLv3, así que lo
derivado de él también. Los guardados de ejemplo sí se quedan fuera: esos son ficheros de consolas
de verdad.

## Cómo está montado

```
ania/
  tools/     extracción de datos y sprites de PKHeX (se ejecuta una vez)
  src/data/pkhex/  datos de Gen 4 derivados de PKHeX (generados)  ← ver su README
  public/pkhex/    hojas de sprites derivadas de PKHeX (generadas)
  src/core/  el guardado: cifrado, checksums, pases, BK4     ← lo delicado
  src/gen/   legalidad, movimientos recomendados, generación aleatoria
  src/ui/    interfaz, primero para móvil
  src/storage/  almacén local y formato .aniapass
  src/transport/  fichero y red, tras una interfaz común
  tests/     209 pruebas, sobre guardados reales de las tres regiones
aw/
  source/    homebrew: NAND (ISFS), servidor HTTP y textos en cinco idiomas
  tests/     el parseo HTTP y las traducciones, compilados de forma nativa
```

## Estado

| Fase | | Cómo se ha comprobado |
|---|---|---|
| Datos de PKHeX | ✅ | 25 comprobaciones en el extractor |
| Núcleo del guardado | ✅ | Round-trip byte a byte + **el juego lo carga en Dolphin** |
| Regiones (PAL/USA/JAP) | ✅ | Guardados reales de las tres: se leen, se escriben y se distinguen |
| Legalidad y azar | ✅ | 493 especies + **equipo generado visible en el juego** |
| Almacenamiento e intercambio | ✅ | 11 pruebas |
| Interfaz | ✅ | 62 pruebas con jsdom |
| Red | ✅ | Ciclo completo contra un servidor que imita al asistente |
| Homebrew | ✅ | Parseo probado, y **el ciclo completo en una Wii real**: lee y escribe la NAND |

El acceso a la NAND (AHBPROT o cIOS, `ES_SetUID` e ISFS) era el punto de riesgo que se identificó
al planificar, y estuvo mucho tiempo sin resolver porque **Dolphin no sirve para descartarlo**: su
NAND es el sistema de ficheros del PC, no reproduce los permisos de IOS, y allí no hay ni AHBPROT
ni cIOS, así que `ES_SetUID` falla (-1017) y la apertura también (-101) por motivos que no se dan
en una consola real. Hizo falta hardware, y en hardware funciona: probado varias veces, leyendo y
escribiendo el guardado.

Esa verificación es **manual**, la única del proyecto que lo es. No hay forma de automatizarla:
haría falta una Wii conectada al CI. Lo que sí cubren las pruebas es todo lo que llega
hasta ahí y todo lo que viene después.

## Licencia

**[GPLv3](LICENSE)**, con una excepción: el asistente Wii de `aw/` va bajo **[GPLv2](aw/LICENSE)**,
porque `aw/source/iospatch.c` lleva tres parches de IOS de libruntimeiospatch, que está publicada
bajo la versión 2 y solo la 2. Son dos programas distintos —binarios distintos, sin código
compartido, hablando por HTTP—, así que cada uno lleva su licencia sin que haya conflicto.

La web es GPLv3 y no algo más permisivo porque los datos de Gen 4 y los sprites derivan de
[PKHeX](https://github.com/kwsch/PKHeX), que es GPLv3. En [`NOTICE.md`](NOTICE.md) está qué viene
de dónde.

Los nombres, los sprites y el formato del guardado de Pokémon son de Nintendo, Creatures Inc. y
GAME FREAK Inc. Este proyecto no está afiliado a ellos ni cuenta con su respaldo, y no distribuye
ninguna copia del juego.

## Publicar una version

Dos cosas automaticas, las dos en `.github/workflows/`:

- **`pages.yml`** — cada empujon a `main` compila la web y la publica en GitHub Pages, con el
  `--base` que corresponda al repositorio. Antes pasa `npm test`.
- **`release.yml`** — al empujar una etiqueta `vX.Y.Z` compila el homebrew en el contenedor
  oficial de devkitPro, mete dentro la web recien compilada con `package.sh --web-dir`, y publica
  la release con el `.zip` listo para la SD.

La version vive en tres ficheros —`aw/source/main.c`, `aw/meta.xml` y `ania/package.json`— y
`tools/version.sh` los compara entre si y contra la etiqueta. El CI lo llama **antes** de compilar
nada, porque una release que dice 0.2.0 por fuera y 0.1.0 en la pantalla de la consola hay que
retirarla a mano. Para sacar una version:

```bash
./tools/version.sh          # ver que dicen los tres ahora mismo
# cambiar los tres a mano
./tools/version.sh v0.2.0   # comprobar antes de etiquetar
git tag v0.2.0 && git push origin v0.2.0
```
