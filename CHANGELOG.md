# Changelog

What changed in each release of `azeroth-shell` on npm. Update with `npm install -g azeroth-shell@latest`.

## Unreleased

- Walk the floor (W in a 5-man's run window): instead of picking stops, you walk the party through the
  dungeon. Patrols walk their routes, and whatever sees you on the way pulls. A map of the rooms around you
  sits beside the list, showing you, the foes and patrols, the bosses, your path and where you are headed. m
  opens it full screen, where + and - zoom.
- The floor lists the chests, ore veins, herbs, books, gates and quest NPCs nearest you. Enter walks you
  there and opens, mines, picks or reads it when you arrive. A vein or herb tells you the skill it needs.
  The run window now lists veins, herbs and books in each room too.
- Paladins who have learned Divine Shield (level 34) bubble with it instead of Divine Protection. Divine Protection
  used to come first in every rotation, and since both share Forbearance, Divine Shield never got cast. Below 34,
  Divine Protection stays in the rotation.
- The top right corner shows how worn your gear is, as a percentage next to your gold. It turns yellow when a
  piece is down to a quarter and red when one breaks.
- Finish instantly no longer stops at the first boss the party cannot beat. It tries each stop once: on a wipe
  or a timeout it leaves that stop (one repair bill, not three) and goes on to everything still in reach. Only stops behind a door that boss opens stay closed. The
  run report names the stops it gave up on, and the run still ends early after eight wipes in total.
- Dungeon and raid run window: the route is split into one section per boss, holding the trash on the way to
  that boss and the boss itself. When the boss dies, its section folds to one line, so a half-done run you walk
  back into opens on what is still ahead and the cursor sits on the next stop. A chest, gate or quest NPC you
  have not dealt with still shows under a folded section. Enter on a section opens or folds it, and e folds or
  opens them all.
- Lower Blackrock Spire: Gizrul the Slavener, who comes in when Halycon dies, has a picture in the fight
  instead of fighting invisible. So do a dozen other creatures a boss summons or turns into the same way.
- Blackrock Depths: Ambassador Flamelash's four Fireguard Destroyers no longer join the fight on the first pull.
  They wait outside his room, so you only meet them when you pull him again after running away or wiping.
- Opening a chest, mining a vein, picking a herb or opening a lockbox shows what you got the way a kill does:
  each drop slides in with its icon, in the bottom right corner. In a dungeon, a chest you open by hand
  follows your auto-loot setting like a corpse, so with auto-loot off it opens the loot window.
- Chests, ore veins, signs and other objects show a picture the size of an item icon beside their name, in the
  world and in dungeons (the ones with a model render, about a third of them).
- Rotation tab: adding a rule lists each spell and combat item with its icon, and under the name the cast time
  and cooldown (or the item's kind), the way the spellbook does.
- Scrolling a list is quicker: a picture the detail pane has not drawn before waits until the cursor stops for a
  moment, as the character picker already did. Pictures you have seen come back at once.
- Companions tab: Hire and the Everyone actions (gear everyone, send goods, share, storage, trips) sit above the
  bench instead of under it. Their counts fill in once the cursor stops, so a long bench scrolls without lag.
- The fight's action bar is a plain row of icons: each slot's key above its icon, with its cooldown beside the
  key. It no longer shows spell names, and casting no longer makes it blink. Before, every cast greyed the whole
  bar for the global cooldown, and the autopilot's casts flashed their slots.
- Quests the autopilot skips stay skipped: the blacklist is saved with the character, so it is still there
  after you quit, and the autopilot no longer picks an abandoned blacklisted quest back up. You can blacklist a
  quest yourself with `b` on the quest log, or from the quest's page next to Do and Abandon, and take it off
  the same way.
- The autopilot and Do Quest no longer pick a normal mob whose pull brings an elite with it. For example, every
  Twilight Marauder in Silithus brings Twilight Marauder Morna, so a quest that drops from many Twilight mobs now
  sends you after the others first.

## 0.4.0 — 2026-11-03

- Bags: `X` destroys several stacks at once, and `Q` destroys every quest item left over from quests you handed in.
- Dungeons: a 5-man you leave is held for two hours (it was 30 minutes). On the World tab, Enter on a run you
  left half done takes you straight back in. The tab also lists the zone's dungeons while you are inside one,
  and a cleared run says so. Picking another dungeon from inside one leaves the current run, which is held.
- Companions get their own copy of a quest item that comes from an object. If their copy never finished, they
  drop it when you hand the quest in, so it no longer fills their log. Their quest list offers to drop old ones.
- Art for what a fight turns into or brings in: boss morphs, totems, wards and adds were invisible before.
- The title line reads "Azeroth Shell".

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
