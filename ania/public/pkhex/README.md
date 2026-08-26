# Sprite sheets derived from PKHeX

`pokemon.png` and `pokemon-shiny.png` were not drawn for this project: `tools/extract-sprites.ts`
assembles them from the box sprites of [PKHeX](https://github.com/kwsch/PKHeX)
(`PKHeX.Drawing.PokeSprite`), one 68×56 cell per Gen 4 species and form. The index that says which
cell is which lives in `src/data/pkhex/sprites.json`, and `src/ui/sprite.ts` is what crops them.

They go in a single sheet rather than 660 separate files because a browser fetches one image, not
six hundred. The shiny sheet is only downloaded if a shiny appears on screen.

PKHeX is published under the **GNU General Public License v3.0**. The sprites belong to Nintendo /
Creatures / GAME FREAK.
