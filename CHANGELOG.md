# Changelog

What changed in each release of `azeroth-shell` on npm. Update with `npm install -g azeroth-shell@latest`.

## Unreleased

- Bags: `X` destroys several stacks at once, and `Q` destroys every quest item left over from quests you handed in.
- Dungeons: a 5-man you leave is held for two hours (it was 30 minutes). On the World tab, Enter on a run you
  left half done takes you straight back in. The tab also lists the zone's dungeons while you are inside one,
  and a cleared run says so.
- Companions get their own copy of a quest item that comes from an object. If their copy never finished, they
  drop it when you hand the quest in, so it no longer fills their log. Their quest list offers to drop old ones.
- Art for what a fight turns into or brings in: boss morphs, totems, wards and adds were invisible before.

## 0.3.0 — 2026-11-03

- HD gear art at 256 px with a palette per body. Shapeshift forms and costumes draw sharp under sixel.
- The Travel tab has a world map, in half-block and sixel.
- Tame and quest-item uses on World rows; dungeon entry locks and extra entrances; Hearthstone and ring/trinket
  picks in Bags. The Character tab gets a stats page, and buffs are cast before a pull.
- Hunter pets untrain at the trainer's prices and keep their innate abilities.
- A foe still targeting you keeps the fight going.
- `azsh --art` downloads the full-size art up front.

## 0.2.0 — 2026-11-02

- Art: creatures, icons and your geared character are drawn as half-block sprites, or as real pixels in a
  terminal that supports sixel.
- A fight stage, the Gear tab as a character sheet, talent trees, and a one-page character creation screen.
- Party fights on the stage, each body at its real distance. Casters no longer stall on immune foes.
- The autopilot on screen: pre-flight card, run strip, run panel, Run/Quests/Bags panes, end card, and the
  rotation condition editor.
- Auction house browsing by category; world search covers the zone you stand in.
- Warsong Gulch: strip map, your own seat, side calls, and matches that actually end.
- Faster start: the engine is cached under `~/.azsh/cache`, with a loading line while it imports.

## 0.1.2 — 2026-11-01

- A character open in another terminal cannot be opened a second time.
- The Travel tab stays open after you depart.
- A screen refresh setting: game loops repaint at most once per refresh.

## 0.1.1 — 2026-11-01

- Vendor window: `d` destroys a stack from your bags or a companion's.
- Terminal: Ctrl-L repaints, a full repaint on screen change, and a notice when the window is too small.

## 0.1.0 — 2026-11-01

- First release on npm.
