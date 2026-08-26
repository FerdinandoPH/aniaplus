# ANIA+

**English** · [Español](README.es.md)

Battle pass creator for **Pokémon Battle Revolution**, for all three versions of the game — European,
American and Japanese. Build teams by hand or at random and write them into your Wii's save file,
without taking the SD card out or going through a PC.

It comes in two pieces: **the web app**, where all the work happens, and **the Wii assistant**, a
homebrew program that bridges to the console's save file.

## Getting started

### 1. Open the web app

**<https://ferdinandoph.github.io/aniaplus/>**

Nothing to install. It works on a phone and on a computer, and everything stays in your browser:
there is no server, nothing is uploaded anywhere. With just this you can already design passes,
generate them at random and export them to a file to share.

To get them onto the console you also need the second piece.

### 2. Install the assistant on the Wii

1. Download the `.zip` from the **[latest release](https://github.com/FerdinandoPH/aniaplus/releases/latest)**.
2. Extract it to the **root of the SD card**. You should end up with `apps/aniaplus/boot.dol`.
3. Put the SD card in the Wii, open the **Homebrew Channel** and launch *ANIA+ Asistente Wii*.
4. The TV will show the console's **IP address**.

### 3. Connect them

Type that IP into ANIA+'s *Wii* tab and hit connect. The first time, the browser will ask for
permission to talk to a device on your local network; say yes.

You can also just open `http://WII-IP-ADDRESS:8080/` in the browser: the package ships the web app
inside it, so the console itself serves it and it works **with no internet**.

### What you need

- **The Homebrew Channel** installed, and to launch the assistant from there. PBR's files belong to
  a different title on the console, so the system has to be persuaded to open up: the assistant
  does that on its own, patching the already-running IOS in memory. There is nothing to install and
  nothing to configure.
  - If you launch it from somewhere else — a forwarder, a game loader, an old Homebrew Channel —
    that isn't possible, and then you do need a **cIOS (249 or 250)** installed. The assistant finds
    it by itself and tells you on screen which way it got in.
- **Having played PBR at least once** on that Wii, so that the save file exists.
- The phone or computer must be on the **same local network** as the console. A public IP with port
  forwarding will not work (and isn't a good idea either: anyone who reaches that port could
  overwrite your save).

### Your data

When the save is read, an untouched copy is **always** kept, and one button downloads it. The
assistant also keeps its own copy on the Wii; button **1** on the Wii Remote restores it. When
writing, the file isn't deleted first — it's overwritten — so that a failure halfway through doesn't
leave the console with no save at all.

> **Keep a backup before writing anything.** The full cycle has been tested on a real Wii — it reads
> and writes the save in NAND — and against real saves from all three regions, and the game loads
> what ANIA+ writes. Even so, you are letting a program touch your console's internal memory:
> download the backup that's offered when reading. That's what it's for.

---

*From here on this is technical documentation: how to build it, how it works inside and why it's
built this way. You need none of it to use ANIA+.*

---

## How it's split up

| | What it is | Where |
|---|---|---|
| **Main assistant (AP)** | Client-side web app. Designs passes by hand or at random, stores them, shares them and talks to the Wii. | `ania/` |
| **Wii assistant (AW)** | Homebrew that reads and writes PBR's save file in NAND. | `aw/` |

The architectural decision that governs everything else: **the Wii assistant interprets nothing.**
It reads 3.5 MB, sends them, receives 3.5 MB and writes them. Everything delicate — encryption,
checksums, Pokémon format — lives in the web app, where it can actually be tested, on every change.

The save format is documented in the code itself, which is where it holds up: `src/core/` carries
the encryption, the checksums, the passes and BK4, with the reason for each decision next to the
line that applies it. The tests in `tests/` run against real saves from all three regions and are
the executable specification of all of it.

## Running the web app

```bash
. "$HOME/.nvm/nvm.sh"        # Node is installed via nvm and isn't on the default PATH
cd ania
npm install
npm run dev -- --host        # reachable from another device on the same network
```

```bash
npm test                     # 209 tests
npm run build                # static files in dist/
```

### Regenerating the Gen 4 data (optional)

Everything ANIA+ takes from PKHeX is gathered in **two folders, and only two**: `src/data/pkhex/`
(the JSON, 296 KB) and `public/pkhex/` (the two sprite sheets). Nothing in there is written by hand;
it is overwritten wholesale when regenerated. Each folder carries its own `README.md` with the
details and the licence.

They already ship in the repository, so **none of this is needed to build or to develop**. Only if
you want to regenerate them, or pull them from a newer version of PKHeX:

```bash
git clone --depth 1 https://github.com/kwsch/PKHeX ../PKHeX-master
npm run extract              # src/data/pkhex/*.json, from PKHeX.Core
npm run sprites              # public/pkhex/*.png, from PKHeX.Drawing.PokeSprite
```

Both scripts expect the PKHeX source in `PKHeX-master/`, next to `ania/`. It is deliberately **not**
a submodule: it's 82 MB of C# from which only a few tables are ever read, and once they're extracted
it isn't needed for anything else. `npm run sprites` assembles the box sprites — the Gen 4 ones, the
era of the game — into `public/pkhex/pokemon.png` and `pokemon-shiny.png`, 192 KB each, plus an
index of 660 cells in `src/data/pkhex/sprites.json`; it needs ImageMagick.

### The sample saves

The tests that touch the save format run against **real `PbrSaveData` files**, one per region. Those
files come from real consoles and do not travel in the repository, so `npm test` looks for them and,
if they're missing, **skips those blocks instead of failing**: a fresh clone passes 110 of the 209
tests and reports no errors at all. The ones that get skipped are exactly the ones that mean nothing
without a save in front of them.

To have them all, put the saves where `tests/fixtures.ts` expects them (paths relative to the
project root):

| Key | Path |
|---|---|
| `europa` | `Español (SPA) …/¬ Español EUROPA (EUR)/(ARCHIVO PRINCIPAL) Wii o Dolphin/0001000052504250/GeniusPbr/PbrSaveData` |
| `sudamerica` | `Español (SPA) …/¬ Español SUDAMERICA (EUR)/…/0001000052504250/GeniusPbr/PbrSaveData` |
| `usa` | `RPBE01 (NTSC-U) Save Post Game/00010000/52504245/data/GeniusPbr/PbrSaveData` |
| `japon` | `日本語版 (JAP) …/000100005250424a/GeniusPbr/PbrSaveData` |

The long names are those of the save packs that circulate in the community; the easiest thing is to
open `tests/fixtures.ts` and point the paths at your own. You can get your own save off the Wii with
any save manager, or out of Dolphin's NAND.

One block in `gen.test.ts` additionally uses the competitive team database that ships with the
Spanish pack (`PC cuadros Bases de datos de texto …/Base de datos PBR.txt`) and PKHeX's move names;
it skips itself if either one is missing.

### Publishing it on your own server (Apache, subdirectory)

`dist/` is static files: no Node needed on the server. The only thing to decide before building is
**what path it will be served from**, because that gets written into the HTML and the CSS:

```bash
npm run build -- --base=/aniaplus/                 # for example.net/aniaplus/
rsync -av --delete dist/ pi@my-server:/var/www/html/aniaplus/
```

Building without `--base` leaves the web app ready for the root, which is what the Wii assistant
needs when serving it off the SD card. They are two different builds of the same code; the
assistant's `package.sh` does its own.

Apache needs no special module — the app has no routes, so no `mod_rewrite` either — but this is
worth having in the `<VirtualHost>` (or in an `.htaccess` if you have `AllowOverride`):

```apache
# Apache doesn't know this type: without it, phones won't offer "add to home screen".
AddType application/manifest+json .webmanifest

<Directory /var/www/html/aniaplus>
    Options -Indexes
    Require all granted

    # Names under assets/ carry a hash: they can be cached forever.
    <FilesMatch "\.(js|css|png|webp|ico)$">
        Header set Cache-Control "public, max-age=31536000, immutable"
    </FilesMatch>
    # The index can't, or the browser would keep loading the old version after each deploy.
    <FilesMatch "^index\.html$">
        Header set Cache-Control "no-cache"
    </FilesMatch>
</Directory>

# Most of the weight is text JS and JSON: compression cuts it to a fraction.
AddOutputFilterByType DEFLATE text/html text/css application/javascript application/json image/svg+xml
```

The headers and the compression need two modules that aren't enabled by default on Raspberry Pi OS:
`sudo a2enmod headers deflate && sudo systemctl reload apache2`.

> **Over HTTPS the *Wii* tab still works, and the browser will ask for permission.** The assistant
> speaks plain HTTP — you can't issue a certificate for a private IP, so there's no alternative — and
> the mixed-content rule would say that a page served over HTTPS can't request anything from it. But
> that rule is relaxed precisely for local network addresses, which otherwise would leave every
> gadget in the house unreachable: instead the browser **asks** ("this page wants to connect to a
> device on your local network") and, once granted, the request goes out.
>
> Verified with the web app served over HTTPS from outside the network and the Wii on the LAN, in
> Chrome and in an incognito window — that is, with no previously saved exceptions. What has *not*
> been verified is other browsers: they haven't all been tried here, so if you're going to depend on
> it, test it first in the one you use. And don't confuse it with the padlock's manual "Insecure
> content → Allow" exception: that one only applies to you, and only in that profile.

Bear in mind that **the pass library does not travel between origins**: what you save from
`example.net/aniaplus/` is not visible from `http://WII-IP-ADDRESS:8080/` or the other way round,
because the browser isolates storage per origin and there's no way around it. To move passes from
one to the other, use *Export* and *Import* (`.aniapass`).

With `npm run dev` there's also `/showcase.html`, which lays out every screen one after another with
fake data: it's for looking at the design at a glance without clicking through tabs. It isn't part of
the build, because Vite only bundles what hangs off `index.html`.

### Saves from any region

The web app reads saves from all three versions — PAL, American and Japanese — and almost nothing was
needed for that: the encryption, the checksums and even the character table are the same. The Gen 4
one is **a single table** and already contains the Japanese syllabaries, so a nickname like `カビゴン`
is read and written back without any separate table.

What does change with the region:

- **How many personal passes there are**: 37 in the international versions, 32 in the Japanese one.
  A bit in the save says so, and that's where the trap was: it's inverted — 0 means Japanese — and in
  an unused profile that byte is zero. Reading it profile by profile, three of the four profiles in
  the American save passed for Japanese and ended up with 32 passes instead of 37. Now the **first
  written profile** is what gets read, which is the only reliable one, and it holds for the whole
  save.
- **The profile's language**: the byte that stores it doesn't distinguish Japanese from English (both
  are 0), so it's resolved with that same flag.
- **The language of what gets generated**: nicknames and the pass's language stamp follow the
  **loaded save**, not ANIA+'s menus. What's written there is what the game shows, and a Latin-script
  nickname in a Japanese game looks out of place. With no save loaded, the UI decides.

The app is available in six languages, Japanese included (Pokémon, move and item names come from
PKHeX). The Wii assistant is separate: that one has five, because of the console's font.

### Making passes

- **Selecting passes** (to export, delete or transfer them): the circle in the corner of each card,
  or a long press on the card. With something already selected, a tap on any other adds it; with
  nothing selected, a tap opens the editor.
- **New pass** (pass list) creates a blank one; each team slot offers *+ New*, which drops in a
  starting Pokémon — level 50, 31 IVs, no EVs — and opens its editor.
- **Generate** creates them at random with the options in the form. If the name contains `{n}`, that's
  where each pass's number in the batch goes: `random{n}` gives `random1`, `random2`… With no marker,
  numbering is appended only when there is more than one.
- **Fully evolved only** (generator): discards stages that still evolve, which at level 50 are simply
  a worse team. It doesn't exclude Pokémon with no evolutionary line — Tauros or Mew are still in —
  because what's checked is whether they have something ahead of them, not whether they came from
  something. That leaves 264 of 493.
- **Damaging moves** (generator): with randomised movesets — *Legal, but random* and *Anything goes* —
  you choose to guarantee one or two attacks. With two, battles resolve sooner; with one you get
  stranger teams. It doesn't appear under *Recommended*, which copies what the Pokémon would actually
  know at level 50, it isn't forced on species like Ditto, and the real ceiling is the movepool: if
  there's only one legal attack, that's what you get.
- **At least one move of its own type** (generator): only under *Anything goes*, where all four moves
  come from the entire Gen 4 pool and the normal outcome is that none belongs to the species. One
  attack of one of its two types is guaranteed — a status move only if there is no attack of that
  type — always overwriting a slot that doesn't fit, so as not to run short of attacks. Each move's
  type comes from PKHeX's `MoveInfo5.cs`, the table that holds from Gen 2 through Gen 5.
- **Name chaos** (generator): one and the same nickname for every Pokémon in the batch, across passes
  too. You type it, or leave it empty and a random Spanish word is requested from
  `random-word-api.herokuapp.com` when generating; with no connection, one comes from the fallback
  list bundled inside. Either way the nickname is stored in uppercase, to match species names.
  Careful: a word from the internet is not reproduced by the seed, because it doesn't come from the
  `Rng`.
- The Pokémon editor exposes everything: species, moves (with a ⚠ on illegal ones, which don't
  block), ability, held item, EVs, **IVs one by one**, nature, gender, PID and shininess. Gender can
  only be chosen on species that allow both — Chansey is always female, Magnemite is genderless, and
  there's nothing to decide there, so the chip stays fixed.
- **Moving Pokémon between passes**: every Pokémon on the team has a `→` that copies it into whichever
  pass you pick from the library, and empty slots offer *+ From another pass* alongside *+ New*. It
  always copies — the source pass keeps its own — and neither full passes (shown with their `6/6`
  next to them, so you can see why) nor secret ones are offered as destinations.
- The pass editor lets you choose the **trainer model** (PBR's 6 playable characters). Changing it
  resets the outfit to that character's factory default: each model's clothing is its own catalogue,
  so the same "Top" number is not the same garment on another body. Picking garment by garment isn't
  there — their names live compressed inside the game disc (`.fsys`) with no decompressor, the same
  blocker as move powers; investigated in Ghidra against the executable and confirmed with no
  shortcut. When generating at random, **the character is randomised too** (from the same `Rng` as the
  team, so a seed still reproduces the whole batch), with its outfit and its phrases set to match.
- **Nickname**: by default there is no custom nickname, but the field carries the species name **in
  uppercase**, as in the Gen 4 games, which is what the game shows in battle. Leaving it empty — which
  is what we used to do — produced six nameless Pokémon. In the editor, the *custom* checkbox opens
  the field and sets the flag, as in PKHeX.
- **Phrases**: PBR doesn't store "no phrase", it stores one flag per phrase saying whether the text
  comes from the pass or from the character's phrase block. New passes are born with the six factory
  ones; writing your own turns off that phrase's flag, and only that one. Changing character
  re-points the indices at its block, for the same reason the outfit is reset.

Two Gen 4 details the interface has to respect, and that are worth knowing:

- **Nature and gender are not fields**, they are `PID % 25` and the low byte of the PID against the
  species' ratio. Choosing either one searches for a new PID that yields it while preserving the
  rest (ability, and nature or gender depending on which was touched), so the PID changes; if the
  Pokémon was shiny, it stops being shiny.
- **Shininess is achieved by moving the SID, not the PID** (same as PKHeX). Searching for a shiny PID
  would be 1 in 8192 within a space already constrained by nature, ability and gender, and might find
  none at all; with the SID it always works and drags nothing else along.

## Running the Wii assistant

```bash
cd aw
./package.sh --web           # builds the homebrew and puts ANIA+ inside it
```

Copy `aw/dist/apps` to the root of the SD card and launch it from the Homebrew Channel. The IP of the
Wii will appear on screen.

> **How NAND is opened: AHBPROT first, cIOS as plan B.** The files under
> `/title/00010000/52504250/data` belong to PBR's title, and homebrew launched from the Homebrew
> Channel runs under a different identity. On a stock IOS, `ES_SetUID` — the call that adopts that
> identity — is refused, and the FS module additionally checks who owns each branch of NAND, so the
> open is denied. There are two ways to open that door, and the assistant tries them in this order:
>
> 1. **Patch the already-running IOS in memory** (`source/iospatch.c`). The `meta.xml` asks for
>    `<ahb_access/>`, so the Homebrew Channel starts the application without reloading IOS and with
>    AHBPROT disabled: from there the PPC can write into IOS's memory. The MEM2 lock is lifted as
>    well — there are two, and both have to be opened — and three patches are applied:
>    `isfs_permissions`, which is the indispensable one, and `es_setuid` / `es_identify`, which give
>    `ES_SetUID` back its cIOS behaviour so the rest of the code has a single path. The byte patterns
>    come from libruntimeiospatch; they're copied in rather than linking the library because only
>    three of its twelve patches are needed, and the signature ones are exactly what we don't want.
>    **This route requires nothing installed on the console.**
> 2. **Reload to a cIOS (249 or 250)**, where those checks are already disabled. This is what's needed
>    when the application is launched from a forwarder, a game loader or an old Homebrew Channel:
>    AHBPROT doesn't reach there and patching isn't possible.
>
> If neither gets in, it **carries on anyway** and warns: that IOS might allow access, and if it
> doesn't, the open error will say exactly what happened, with its precise code. Which way it got in
> is shown in the header (`(AHBPROT)` or `(cIOS)`).
>
> **AHBPROT goes before cIOS and not the other way round**, because `IOS_ReloadIOS` takes AHBPROT
> down with it: the moment it reloads, the preferred route is gone for good.
>
> The order matters outwards too: all of this is the first thing the program does, before mounting
> the SD card and before initialising the Wii Remote, because **`IOS_ReloadIOS` unmounts the card and
> tears down the Bluetooth stack**. Reloading afterwards would leave the SD unmounted and the remote
> unresponsive.
>
> Before reloading, ES is asked whether that cIOS **is actually installed**. Reloading to a title that
> doesn't exist doesn't simply return an error: it leaves the system half-booted, and in Dolphin it
> takes the whole emulation down with it.

### The three versions of the game

PBR shipped under three different titles, and each saves in its own NAND folder:

| Version | Title | Folder |
|---|---|---|
| PAL | RPBP01 | `/title/00010000/52504250/data/GeniusPbr/PbrSaveData` |
| American | RPBE01 | `/title/00010000/52504245/…` |
| Japanese | RPBJ01 | `/title/00010000/5250424a/…` |

At startup it checks which ones have a save. If only one does — the normal case on a console — it's
used without asking; if two or more do, the assistant **asks which one to edit** before bringing up
the network, with left and right to change and A to accept. It only asks there: switching version
later would mean switching file while the backup and whatever the device has open still belong to the
previous one. The chosen one is shown in the header (`PAL`, `USA`, `JAP`) and in `/api/status`
(`"region": "USA"`).

> **The order of `ES_SetUID` and `ISFS_Initialize` is not negotiable.** The identity is adopted
> **before** opening `/dev/fs`: a descriptor opened under the Homebrew Channel's identity does not
> change permissions just because `ES_SetUID` is called afterwards, and from then on ISFS denies
> access (-101 or -102) even though the identity is now the right one. That's why trying several
> versions isn't opening NAND once and switching identity on the fly, but **a full cycle per
> candidate**: adopt, open, try the file, close. With a single candidate there's no cycle at all —
> adopt, open, try — which is the usual sequence. Both calls live together in a single function
> (`adopt_identity`) precisely so they can't be put out of order again by moving code around.

What gets tried and in what order: the titles ES reports as installed, and all three if it recognises
none, which is what happens in Dolphin — there the save folder exists without any title being
installed. And a detail that costs a while if overlooked: the trailing `a` of the Japanese title is
**lowercase**, because the folders under `/title` are lowercase hexadecimal and ISFS paths are
case-sensitive.

If no save can be opened, the assistant **does not bring up the server**: it shows the reason and
waits for HOME. Announcing an address in order to serve a save that doesn't exist only gets the web
app to connect and receive an error.

### The on-screen language

The assistant starts in the console's own language (`CONF_GetLanguage`) and the **−** button on the
remote cycles through them; the choice is remembered in `sd:/apps/aniaplus/lang.txt`. There is
Spanish, English, German, French and Italian.

> **No Japanese and no accents, and not by oversight.** libogc's console draws with an 8×16 font that
> only has ASCII: Japanese text would come out as boxes, so on a Japanese Wii the assistant speaks
> English (the web app does have it in full). For the same reason, every message is written without
> accents or ñ — "Direccion", "senal" — and German uses `ae`/`oe`/`ue`/`ss`. `tests/test_text.c`
> checks that, along with what can genuinely bring the console down: that no translation changes the
> order or the type of its `%s` and `%ld`, a bug that raises no compile error and blows up at
> runtime.

### With Dolphin

The same `boot.dol` works in the emulator; there's nothing different to build. There is no cIOS there,
but none is needed either: Dolphin's NAND is a folder on the PC and its emulated IOS doesn't apply the
real console's permissions, so the save opens without adopting any identity. The assistant detects
this by opening `/dev/dolphin` — a device that only exists in the emulator — and then **doesn't touch
IOS**, nor suggest installing a cIOS when something fails; the header reads `Dolphin` instead of the
IOS number, and `/api/status` carries a `"dolphin": true`.

The emulator's NAND has to contain PBR's save
(`Wii/title/00010000/<title>/data/GeniusPbr/PbrSaveData`, 3.5 MB), i.e. you must have booted the game
at least once. `./package.sh --web --dolphin` additionally drops the package into Dolphin's synced SD
folder, and `npx tsx tools/install-dolphin-save.ts --region pal|usa|jap` installs any of the three
sample saves into that NAND (which you need to have in place: see "The sample saves"). Both tools look
for Dolphin's user folder in the three usual places (`~/.local/share/dolphin-emu` on Linux,
`~/Library/Application Support/Dolphin` on macOS, `~/Documents/Dolphin Emulator` on Windows) and take
the first that exists. From WSL none of them applies — Dolphin's folder is on the Windows side, under
whichever drive letter and user name — so pass it in front:
`DOLPHIN_USER="/mnt/c/Users/you/Documents/Dolphin Emulator" ./package.sh --web --dolphin`.

Watch out for the address: the emulated Wii's network goes out through the host machine, so the IP to
open in the browser is the PC's, not one belonging to the console.

The assistant serves two things over the same port:

- **The API** — `GET /api/status`, `GET|PUT /api/save`, `GET|POST|DELETE /api/session`,
  `POST /api/session/takeover` and `POST /api/session/release/<token>`.
- **The web app itself** — any other path is looked up under `sd:/apps/aniaplus/web`, and `/` returns
  `index.html`. It's only there if you packaged with `--web`; otherwise those paths return 404 and the
  API keeps working just the same.

### One device editing at a time

While someone has the save open in ANIA+, **no other device can edit it**. If two could, both would
read the same thing, each would change its own bits, and whichever sent second would wipe out the
first one's work without either of them noticing.

Handling requests one at a time isn't enough: editing means minutes without touching the save. So the
client **opens an explicit session** on connecting (`POST /api/session`), keeps it alive with a
heartbeat as long as the tab stays open, and releases it on *Close* or when the tab is closed.
Everyone else gets a 409. The 45 s no-heartbeat deadline exists only to recover from a device that
disappears without warning; button 2 on the remote also releases it by hand.

Since the close notice is best-effort by definition — there will always be closures that take it out:
killing the app, running out of battery, walking off the Wi-Fi — the other device can't be left
waiting blindly. `GET /api/session` reports how long it's been quiet (`idle`), and with that the web
app shows how much time is left; after 15 s with no heartbeat it offers to **take over**
(`POST /api/session/takeover`), which is the same decision as button 2 on the remote but made from
where the user is. As long as the other one keeps beating, the assistant refuses: the session is
theirs.

> **Why there are two ways to release it.** When a tab closes there's no time to wait for a response,
> and a normal `fetch` fired there usually gets cancelled. The only thing the browser guarantees will
> go out is `navigator.sendBeacon`, which only sends **simple** requests: `POST`, no custom headers.
> With `DELETE` and `X-Ania-Session` the browser would first send a preflight `OPTIONS` — two round
> trips to finish while the page is dying — and that happens precisely in the normal scenario, with the
> web app served from another machine. Hence `POST /api/session/release/<token>`, with the token in the
> path. `DELETE` remains for the *Close* button, where you can wait and report what happened.
>
> And `pagehide` **does not always mean the page is dying**: on a phone it also fires when switching
> apps, when the tab is merely frozen (bfcache). For a while that was treated as "don't release", and
> the cure turned out worse than the disease: **closing a tab on a phone also puts it in the bfcache**,
> so that case — the one that actually matters — was swallowing the notice and the Wii stayed locked
> until it expired. Telling them apart from the page is impossible, and the asymmetry of penalties
> decides it: releasing too eagerly costs a transparent `acquire()` on return (`pageshow` revalidates
> the session); releasing too rarely locks up the console. Now it always releases.
>
> Because the notice can get lost without leaving a trace anywhere — the Wii doesn't record what never
> arrives, and in the browser the log dies with the tab — every attempt is written to `localStorage`
> (`ania.lastRelease`: which event triggered it, whether there was a session, and what `sendBeacon`
> answered) and the web app shows it at startup. That's what turns "it's still locked" into "the
> browser never even tried" or "it tried and got lost on the way", which call for opposite fixes. On
> the TV, the header additionally counts **silent connections**: those that open and close without
> saying anything.

Both transfers move 3.5 MB over Wi-Fi and take several seconds, so the web app opens a **progress
window** with the same phases the assistant prints on the TV: when reading, first "the Wii is reading
its save" — the gap between the request and the first response, which is exactly the time the console
spends in NAND — and then the bar with the bytes coming in; when sending, the upload bar and, once it
finishes, "it's writing to NAND" until it answers. There is no cancel button: it only informs. The
upload percentage comes from `XMLHttpRequest`, which is the only thing that reports the progress of a
send; `fetch` can't, and that's why the PUT is the one request that doesn't use it.

Controls: **1** restores the session backup, **2** releases the session, **−** changes the on-screen
language, **HOME** quits (if an editing session is live it asks for confirmation on screen first, so as
not to cut someone off mid-edit). The console's **power button** and the remote's turn the Wii off, and
**RESET** goes back to the Homebrew Channel; in all three cases the editing device is notified first.

### No network, and no hanging

Starting the assistant with no connection used to leave the console stuck on "Connecting to the
network…", responding neither to HOME nor to the power button: you had to pull the plug. The culprit
was `if_config`, which blocks for up to twenty DHCP attempts inside IOS; meanwhile nobody reads the
remote, and although the power callback does raise its flag, **there was no loop watching it**.

The network is now configured through libogc's asynchronous path (`net_init_async` + `net_get_status`),
which returns control on every pass: a 30-second deadline, the remote attended to throughout, and if it
doesn't come up, **A to retry** without going back to the loader.

Once the assistant is running, losing signal doesn't force a quit either. The loop checks once a second
that the console still holds its IP — and counts consecutive errors on the listening socket, which is
the other face of the same problem. On losing it, it closes the listener, the header switches to
`sin red - reintentando` instead of advertising a dead address, and it retries with growing backoff (2,
4, 8… up to 30 s) so as not to hammer the network stack while the router boots. When it comes back, the
listener is rebuilt and the log says so; if the IP has changed, emphatically, because the web app on
whichever device was connected is still pointing at the old one.

> **The session clock stops while there's no network.** Otherwise a one-minute Wi-Fi drop would take
> the session away from someone who is still there with the save open, punishing them for something
> they didn't do. The symmetric thing happens in the web app: one missed heartbeat is ignored — it
> could be a momentary blip — but two in a row are reported, because otherwise a drop shows up as the
> send button failing with no explanation.

> **Two rules that cost us a lockup.** Any wait inside the assistant has to read the remote and check
> the shutdown flags: a bare `while (1)` leaves the console with no way out — no HOME, no power button —
> and forces a hard power-off. And the power and reset buttons **do nothing on their own**: you have to
> register `SYS_SetPowerCallback`, `SYS_SetResetCallback` and `WPAD_SetPowerButtonCallback`, which is
> the only thing that turns those presses into something the program can act on. The callbacks only
> raise a flag; the orderly shutdown happens in the main loop.

The screen has a **fixed header** (address, save status, counters, keys) and below it a log with one
line per request. That isn't cosmetic: they are two distinct console windows (`consoleSetWindow`), and
scrolling is confined to the log, so the Wii's address never scrolls off the top.

> **The console's geometry is not a detail.** `console_init(xfb, 24, 24, width, height, …)` with the
> height **of the whole screen** declares a text window that starts at y=24 and ends 24 pixels **below
> the framebuffer**: libogc draws at `target_y + row`. While it doesn't scroll you don't notice; the
> moment it does, the scroll's `memmove` writes ~25 KB past the end of the framebuffer, on top of the
> heap. That produced both a screen full of garbage and a DSI exception on reloading the web app,
> because what lies behind it is the memory reserved for serving files. The margin has to be subtracted
> **from the size**, not just from the origin.

The device you edit from — phone, tablet or computer, it doesn't matter — **must be on the same local
network as the Wii**. A public IP with port forwarding will not do, and isn't a good idea either: the
session is a lock so that two people don't edit at once, not a password, so anyone who reaches that
port can read and overwrite the save. To get in from outside, bring the device into the network (VPN)
rather than putting the console on the internet.

That said, you have two options:

1. **Open `http://WII-IP-ADDRESS:8080/` in the browser.** The console itself serves the web app: same
   origin, no permissions to grant, no internet, and no dependence on any browser continuing tomorrow
   to allow what it allows today.
2. Open ANIA+ wherever you like and type the IP into the *Wii* tab. It works just as well, including
   with the web app served over HTTPS: the browser will ask permission to talk to a device on the local
   network and that's all it takes (see the note under "Publishing it on your own server"). This is the
   convenient one if you already have ANIA+ published somewhere; option 1 is the one that depends on
   none of that.

Homebrew tests:

```bash
cd aw/tests
cc -I../source -o t test_httpparse.c ../source/httpparse.c && ./t
```

---

## Branding and icons

Everything comes from `aniaplus_logo.png` (1254×1254, the Pokétopia receptionist in turquoise
`#048E9F` with the "ania+" wordmark). The derivatives are generated with ImageMagick and quantised to
64 colours, because the original is flat two-tone artwork and drops from 819 KB to a handful:

| Where | File | What it is |
|---|---|---|
| Homebrew Channel | `aw/icon.png` | **Exactly 128×48**: figure on the left, wordmark on the right. If the size isn't that, the HBC doesn't scale it — it ignores it and shows the generic icon without saying why, so `package.sh` checks and aborts. |
| Browser tab | `ania/public/favicon.ico`, `icon-16/32.png` | The figure only: at 16 px the wordmark would be illegible. |
| Phone home screen | `apple-touch-icon.png`, `icon-192/512.png` + `manifest.webmanifest` | iOS ignores the manifest for the icon, which is why the `apple-touch-icon` tag is needed too. |
| App header | `icon-64.png` | Rounded-corner tile. |
| Empty state | `logo.png` | The full logo, at 400 px. |

The icons sit on a white background on purpose, not a transparent one: the *interior* whites of the
figure (the face, the headset, the collar) are part of the drawing, so with transparency they would
turn dark against a dark background and the face would disappear.

To regenerate them after changing the logo, look up the commands in `package.sh`'s history or repeat
the crops: figure `523x629+334+213`, wordmark `645x152+299+865`.

## Pokémon sprites

They come from PKHeX (`PKHeX.Drawing.PokeSprite`), which carries the box sprite of every species and
form in the Gen 4 style. `npm run sprites` assembles them into **two sheets** — normal and shiny, 660
cells of 68×56 each, 192 KB — under `public/pkhex/` and writes the index to
`src/data/pkhex/sprites.json`. `ui/sprite.ts` is the only thing that knows that index; everything else
asks for `sprite(species, {form, shiny})`.

One sheet and not 660 files because **the Wii assistant serves requests one at a time**: 660 separate
images would be 660 round trips over the network to a console from 2006. This way it's a single one,
and the browser caches it. The shiny sheet isn't downloaded unless a shiny appears on screen: a browser
doesn't request a background image no element uses.

A practical note: the sprites are Nintendo material, as are the species and move data. They're in the
repository for the same reason they're in PKHeX's, which is where they come from and has been
publishing them for years; if anything ever has to be pulled, it's the first thing to go, which is why
it's all gathered in `public/pkhex/` and `src/data/pkhex/` instead of spread around. PKHeX is GPLv3, so
what derives from it is too. The sample saves do stay out: those are files from real consoles.

## How it's laid out

```
ania/
  tools/     extraction of PKHeX data and sprites (run once)
  src/data/pkhex/  Gen 4 data derived from PKHeX (generated)  ← see its README
  public/pkhex/    sprite sheets derived from PKHeX (generated)
  src/core/  the save file: encryption, checksums, passes, BK4    ← the delicate part
  src/gen/   legality, recommended moves, random generation
  src/ui/    interface, mobile first
  src/storage/  local store and the .aniapass format
  src/transport/  file and network, behind a shared interface
  tests/     209 tests, against real saves from all three regions
aw/
  source/    homebrew: NAND (ISFS), HTTP server and text in five languages
  tests/     HTTP parsing and the translations, compiled natively
```

## Status

| Phase | | How it was verified |
|---|---|---|
| PKHeX data | ✅ | 25 checks in the extractor |
| Save file core | ✅ | Byte-for-byte round trip + **the game loads it in Dolphin** |
| Regions (PAL/USA/JAP) | ✅ | Real saves from all three: read, written and told apart |
| Legality and randomness | ✅ | 493 species + **a generated team visible in the game** |
| Storage and sharing | ✅ | 11 tests |
| Interface | ✅ | 62 tests with jsdom |
| Network | ✅ | Full cycle against a server that mimics the assistant |
| Homebrew | ✅ | Parsing tested, and **the full cycle on a real Wii**: it reads and writes NAND |

NAND access (AHBPROT or cIOS, `ES_SetUID` and ISFS) was the risk identified at planning time, and it
stayed unresolved for a long while because **Dolphin can't rule it out**: its NAND is the PC's file
system, it doesn't reproduce IOS's permissions, and there is neither AHBPROT nor cIOS there, so
`ES_SetUID` fails (-1017) and so does the open (-101), for reasons that don't occur on a real console.
Hardware was needed, and on hardware it works: tested several times, reading and writing the save.

That verification is **manual**, the only one in the project that is. There's no way to automate it: it
would take a Wii wired to CI. What the tests do cover is everything leading up to it and everything
that comes after.

## Licence

**[GPLv3](LICENSE)** — with one exception: the Wii assistant in `aw/` is **[GPLv2](aw/LICENSE)**,
because `aw/source/iospatch.c` carries three IOS patches from libruntimeiospatch, which is licensed
version 2 and only version 2. The two are separate programs — separate binaries, no shared code,
talking over HTTP — so each carries its own licence with no conflict.

The web app is GPLv3 rather than something more permissive because the Gen 4 data and the sprites
are derived from [PKHeX](https://github.com/kwsch/PKHeX), which is GPLv3. [`NOTICE.md`](NOTICE.md)
says what came from where.

Pokémon names, sprites and the save format belong to Nintendo, Creatures Inc. and GAME FREAK Inc.
This project is not affiliated with or endorsed by them, and distributes no copy of the game.

## Cutting a release

Two automatic things, both under `.github/workflows/`:

- **`pages.yml`** — every push to `main` builds the web app and publishes it to GitHub Pages, with
  whatever `--base` the repository needs. It runs `npm test` first.
- **`release.yml`** — pushing a `vX.Y.Z` tag builds the homebrew in devkitPro's official container,
  puts the freshly built web app inside it with `package.sh --web-dir`, and publishes the release with
  the `.zip` ready for the SD card.

The version lives in three files — `aw/source/main.c`, `aw/meta.xml` and `ania/package.json` — and
`tools/version.sh` compares them against each other and against the tag. CI calls it **before** building
anything, because a release that says 0.2.0 on the outside and 0.1.0 on the console's screen has to be
pulled by hand. To cut a version:

```bash
./tools/version.sh          # see what the three say right now
# change all three by hand
./tools/version.sh v0.2.0   # check before tagging
git tag v0.2.0 && git push origin v0.2.0
```
