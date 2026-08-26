# Third-party code and data

ANIA+ is [GPLv3](LICENSE), with one exception: the Wii assistant in `aw/` is
[GPLv2](aw/LICENSE). Why, and what came from where:

## PKHeX — GPLv3

<https://github.com/kwsch/PKHeX>

Every Gen 4 data file ANIA+ ships is extracted from PKHeX, and the Pokémon sprites are its box
sprites. None of it is transcribed by hand; `ania/tools/extract-pkhex-data.ts` and
`ania/tools/extract-sprites.ts` generate it, and it all lands in two folders, each with its own
README:

- `ania/src/data/pkhex/` — species, moves, items, learnsets, evolutions, the Gen 4 character
  table and the name lists for six languages.
- `ania/public/pkhex/` — the two sprite sheets.

PKHeX is GPLv3, so the work derived from it is too, and so is ANIA+ as a whole.

## libruntimeiospatch — GPLv2

`aw/source/iospatch.c` carries three of its twelve IOS patches — the byte patterns and the way they
are applied. They are copied in rather than linked because only those three are wanted, and the
signature patches are exactly what should not be enabled.

That code is licensed **GPL version 2, and only version 2**, which cannot be relicensed to GPLv3.
So the Wii assistant is distributed under GPLv2 (`aw/LICENSE`) while the web app is GPLv3. They are
two separate programs — separate binaries, no shared code, talking over HTTP — so each carries its
own licence with no conflict.

Copyright of the patch code, per its headers: Joseph Jordan, damysteryman, Christopher Bratusek,
DarkMatterCore, megazig, FIX94.

## Pokémon

Pokémon names, move names, item names, sprites and the save format belong to Nintendo, Creatures
Inc. and GAME FREAK Inc. This project is not affiliated with, endorsed by, or in any way connected
to them. No copy of the game is distributed here.
