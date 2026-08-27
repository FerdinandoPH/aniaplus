# ANIA+

**English** · [Español](README.es.md)

Custom battle pass creator for **Pokémon Battle Revolution**, in all three versions of the game
(European, American and Japanese). Build teams by hand or at random from your phone or PC and send
them straight to your Wii's save file.

Works with the Wii, the Wii U (vWii) and Dolphin.

ANIA+ is two programs: **the web app**, where passes are made, and the **Wii assistant**, a homebrew
app that moves the save file to and from the console.

## Getting started

### 1. Open the web app

**[https://ferdinandoph.github.io/aniaplus/](https://ferdinandoph.github.io/aniaplus/)**

Nothing to install, and everything runs client-side: passes are stored in your browser, not on a
server. There are three sections:

- **Passes** — your library. Tap a pass to edit it; long-press to select several and export, delete
  or transfer them to the Wii.
- **Generate** — random passes, with plenty of options: how many, level, move legality, fully
  evolved only, nicknames…
- **Wii** — where a PBR save file is loaded, either from a file (Dolphin) or from the console via
  the assistant. With one loaded you can browse its passes, import them into your library, overwrite
  them with the ones you selected, and unlock every pass slot and colosseum. When you're done, you
  download the modified file or send it back to the Wii.

### 2. Install the assistant on the Wii

*Wii and vWii only; with Dolphin you don't need it, you load the file directly.*

1. Download the `.zip` from the **[latest release](https://github.com/FerdinandoPH/aniaplus/releases/latest)**.
2. Extract it to the **root of your SD card**. You should end up with `apps/aniaplus/boot.dol`.
3. Put the SD card in the Wii, open the **Homebrew Channel** and launch *ANIA+ Wii Assistant*.
4. The TV will show the console's **IP address**.

Type that IP into the *Wii* tab of ANIA+ and hit connect. The first time, your browser will ask for
permission to talk to a device on your local network. When you're done — and after sending the save
back — it's best to close the connection with the *Close* button.

If you have no internet but do have a local network, the console itself serves a copy of the web app
at `http://WII-IP:8080/`. It works the same, but since that's a different origin, the browser keeps
a separate pass library there from the one on the published site.

### Requirements

- **The Homebrew Channel** installed, and launching the assistant from it. PBR's files belong to a
  different title on the console, so the system has to be talked into opening them: the assistant
  does that on its own, patching the running IOS in memory. Nothing to install or configure. If you
  launch it from somewhere else — a forwarder, a game loader, an old HBC — that isn't possible, and
  then you do need a **cIOS (249 or 250)** installed.
- **Having played PBR at least once** on that console, so the save file exists.
- Your phone or computer on the **same local network** as the Wii.

### Your data

Reading the save **always** keeps an untouched copy, which you can download with a button. The
assistant also keeps its own copy on the Wii, and button **1** on the Wiimote restores it.

> **Back up before writing anything.** The full cycle is tested on a real Wii and against real saves
> from all three regions, and the game loads what ANIA+ writes. Even so, you are letting a program
> touch your console's internal memory.

---

*Everything below is development documentation. You don't need any of it to use ANIA+.*

---

## How it's split

|                               | What it is                                                                 | Where     |
| ----------------------------- | -------------------------------------------------------------------------- | --------- |
| **Main assistant (AP)** | The web app. Builds passes, stores them, shares them and talks to the Wii. | `ania/` |
| **Wii assistant (AW)**  | Homebrew that reads and writes PBR's save file in NAND.                    | `aw/`   |

The decision that governs everything: **the Wii assistant interprets nothing.** It reads 3.5 MB,
sends them, receives 3.5 MB and writes them. Everything delicate — encryption, checksums, Pokémon
format — lives in the web app, where it can be tested on every change.

The save format is documented in the code itself: `ania/src/core/` holds the encryption, the
checksums, the passes and BK4, with the reason for each decision next to the line that applies it.
The tests in `ania/tests/` run against real saves from all three regions.

## The web app

```bash
. "$HOME/.nvm/nvm.sh"        # if your Node comes from nvm and isn't on PATH
cd ania
npm install
npm run dev -- --host        # reachable from another device on the same network
npm test                     # 214 tests
npm run build                # static files in dist/
```

`npm run dev` also serves `/showcase.html`, which lays out every screen in a row with fake data so
you can look at the design at a glance.

### The Gen 4 data

Everything ANIA+ takes from [PKHeX](https://github.com/kwsch/PKHeX) lives in two folders and only
two: `src/data/pkhex/` (the JSON) and `public/pkhex/` (the two sprite sheets, normal and shiny).
None of it is hand-written, and each folder carries its own `README.md`.

They ship in the repository, so **you don't need to do any of this** unless you want to regenerate
them from a newer PKHeX:

```bash
git clone --depth 1 https://github.com/kwsch/PKHeX ../PKHeX-master
npm run extract              # src/data/pkhex/*.json
npm run sprites              # public/pkhex/*.png (needs ImageMagick)
```

Both expect the PKHeX source in `PKHeX-master/`, next to `ania/`. It's deliberately not a submodule:
that's 82 MB of C# from which only a few tables are ever read.

### The sample saves

The tests that touch the save format run against real `PbrSaveData` files, one per region. They come
from real consoles and don't travel in the repository, so `npm test` looks for them and, if they're
missing, **skips those blocks instead of failing.**

To get all of them, point the paths in `ania/tests/fixtures.ts` at your own (keys `europa`,
`sudamerica`, `usa` and `japon`). You can pull your save off the Wii with any save manager, or out
of Dolphin's NAND.

### Hosting it yourself

`dist/` is static files: no Node on the server. `npm run build` leaves them ready to be served from
the root of a domain, which is the normal case and also what the Wii assistant needs when serving
the web app off the SD card.

If it's going to hang off a subdirectory, that path gets baked into the HTML and the CSS, so it has
to be given at build time: `npm run build -- --base=/whatever/`.

On Apache, add `AddType application/manifest+json .webmanifest` (without it, phones won't offer
"add to home screen") and cache `assets/` for a long time but `index.html` with `no-cache`.

Served over HTTPS the *Wii* tab still works: the assistant speaks plain HTTP, but the mixed-content
rule is relaxed for local network addresses and the browser simply asks for permission. Verified in
Chrome; test other browsers before relying on it.

## The Wii assistant

```bash
cd aw
./package.sh --web           # builds the homebrew with the web app inside
cd tests && cc -I../source -o t test_httpparse.c ../source/httpparse.c && ./t
```

Needs [devkitPro](https://devkitpro.org/) with devkitPPC and libogc. Copy `aw/dist/apps` to the root
of the SD card and launch it from the Homebrew Channel.

**How it opens NAND.** PBR's files belong to another title, so its identity has to be adopted with
`ES_SetUID`, which a stock IOS refuses. The assistant tries two routes in this order: first
**hot-patching the IOS that is already running** (`source/iospatch.c`, using AHBPROT, which
`meta.xml` requests with `<ahb_access/>`; this needs nothing installed on the console), and if that
fails, **reloading into a cIOS 249/250**. The order is not negotiable: `IOS_ReloadIOS` destroys
AHBPROT, and it also unmounts the SD card and drops the Bluetooth stack, so all of this happens
before anything is mounted. The header on screen shows which route got in.

Just as fixed is the order of `ES_SetUID` and `ISFS_Initialize`: the identity is adopted **before**
`/dev/fs` is opened, because an already-open descriptor doesn't change permissions afterwards. Both
live inside `adopt_identity()` so they can't be reordered.

**The three versions of the game.** Each saves in its own NAND folder:

| Version  | Title  | Folder                                                  |
| -------- | ------ | ------------------------------------------------------- |
| PAL      | RPBP01 | `/title/00010000/52504250/data/GeniusPbr/PbrSaveData` |
| American | RPBE01 | `/title/00010000/52504245/…`                         |
| Japanese | RPBJ01 | `/title/00010000/5250424a/…`                         |

At startup it checks which ones have a save: if there's only one it's used without asking, and if
there are several the assistant asks which to edit before bringing up the network. The `a` in the
Japanese title is lowercase, because ISFS paths are case-sensitive. If it can't open any of them, it
doesn't start the server.

**With Dolphin** the same `boot.dol` works. There's no cIOS there, and none is needed: the NAND is a
folder on the PC and its emulated IOS doesn't enforce permissions. The assistant detects it by
opening `/dev/dolphin` and then leaves the IOS alone. The IP to open is the PC's, not the emulated
console's. `./package.sh --web --dolphin` also drops the package in Dolphin's SD folder, and
`npx tsx tools/install-dolphin-save.ts --region pal|usa|jap` installs a sample save into its NAND.
Both look for Dolphin's user folder in the usual Linux, macOS and Windows locations; from WSL you
have to pass it yourself with `DOLPHIN_USER=…`.

**The API**, on the same port as the web app: `GET /api/status`, `GET|PUT /api/save`,
`GET|POST|DELETE /api/session`, `POST /api/session/takeover` and `POST /api/session/release/<token>`.
Any other path is looked up in `sd:/apps/aniaplus/web`, which only exists if you packaged with
`--web`.

**One session at a time.** While someone has the save open, everyone else gets a 409. The client
opens the session on connect, keeps it alive with a heartbeat and releases it on close; if it
vanishes without warning the session expires after 45 s, and after 15 s without a heartbeat the web
app already offers to take over. Button 2 on the Wiimote also releases it.

**Controls:** **1** restores the backup, **2** releases the session, **−** changes the on-screen
language, **HOME** exits (asking for confirmation if someone is editing). The power button shuts
down and **RESET** returns to the HBC; in all three cases the connected device is warned first.

**Languages:** Spanish, English, German, French and Italian, starting in the console's own. There's
no Japanese and no accents because the console font is 8×16 ASCII; that's why the strings are
written without accents and German uses `ae`/`oe`/`ue`/`ss`. `tests/test_text.c` checks that, along
with no translation changing the order of its `%s` and `%ld`.

With no network the assistant doesn't hang: it configures the connection through libogc's async
path, keeps reading the Wiimote throughout and offers **A to retry**. If the signal drops once it's
running, it closes the listener and retries with a growing backoff instead of forcing you to quit.

## The web app's languages

The web app is in six languages — Spanish, English, German, French, Italian and Japanese — with
Pokémon, move and item names taken from PKHeX. On a first visit it opens in the device's language if
it's one of those six, and in English otherwise; Catalan is the exception and falls back to Spanish.
After that it remembers whichever you pick.

Separate from that is the language of what gets written into the save: nicknames and the pass's
language marker follow the **loaded save**, not the menus, because a Latin nickname in a Japanese
game looks out of place. With no save loaded, the interface decides.

## Layout

```
ania/
  tools/            PKHeX data and sprite extraction (run once)
  src/data/pkhex/   Gen 4 data derived from PKHeX (generated)  ← see its README
  public/pkhex/     sprite sheets derived from PKHeX (generated)
  src/core/         the save: encryption, checksums, passes, BK4  ← the delicate part
  src/gen/          legality, recommended moves, random generation
  src/ui/           interface, mobile first
  src/storage/      local library and the .aniapass format
  src/transport/    file and network, behind a common interface
  tests/            214 tests, against real saves from all three regions
aw/
  source/           homebrew: NAND (ISFS), HTTP server and strings in five languages
  tests/            HTTP parsing and translations, compiled natively
```

## Cutting a release

Two automated workflows in `.github/workflows/`:

- **`pages.yml`** — every push to `main` runs the tests, builds the web app and publishes it to
  GitHub Pages with the right `--base`.
- **`release.yml`** — pushing a `vX.Y.Z` tag builds the homebrew in devkitPro's official container,
  bundles the freshly built web app into it and publishes the release with the `.zip` ready for the
  SD card.

The version lives in three files — `aw/source/main.c`, `aw/meta.xml` and `ania/package.json` — and
`tools/version.sh` compares them against each other and against the tag, before anything is built:

```bash
./tools/version.sh          # see what the three say right now
# change all three by hand
./tools/version.sh v0.2.0   # check before tagging
git tag v0.2.0 && git push origin v0.2.0
```

## Licence

**[GPLv3](LICENSE)**, with one exception: the Wii assistant in `aw/` is **[GPLv2](aw/LICENSE)**,
because `aw/source/iospatch.c` carries three IOS patches from libruntimeiospatch, which is published
under version 2 and only version 2. They are two separate programs — separate binaries, no shared
code, talking over HTTP — so each carries its own licence without conflict.

The web app is GPLv3 rather than something more permissive because the Gen 4 data and the sprites
derive from [PKHeX](https://github.com/kwsch/PKHeX), which is GPLv3. [`NOTICE.md`](NOTICE.md) records
what comes from where.

Pokémon names, sprites and save format belong to Nintendo, Creatures Inc. and GAME FREAK Inc. This
project is not affiliated with or endorsed by them, and distributes no copy of the game.
