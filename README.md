# azsh

Azeroth shell. A WoW Classic 1.12 text RPG that runs in the terminal, built on the same
CMaNGOS Classic data and the same headless engine as [phonecraft](../phonecraft). No graphics,
no browser, no build step.

```
npm install -g .     # or: node bin/azsh.mjs
azsh                 # pick a character or roll one
```

Needs Node 22.18 or newer (it strips TypeScript types natively). No dependencies. The tree is
about 29 MB: 15 MB of gzipped game data and 13 MB of engine source.

## Playing

In a terminal `azsh` opens the windowed game: a header with your pools and gold, eleven tabs, a
cursor-driven list with a detail pane beside it, and a scrolling log underneath. Nothing scrolls
off the top; every screen redraws in place.

| Key | Does |
| --- | --- |
| `1`-`9` `0`, `Tab`, `Left` `Right` | World, Quests, Bags, Gear, Spells, Rotation, Talents, Travel, Professions, Companions; Character is the last tab (`Tab`/`Left`) |
| `Up` `Down` `j` `k` | move the cursor; the right pane describes the row |
| `Enter` | act on the row: fight, open a quest, talk to a vendor or trainer, equip, cast, travel |
| `Esc` | close the window on top; on a tab, back to World |
| `PgUp` `PgDn`, `Home` `End` | page through a long list or a quest's text |
| `l` | open the whole log as a window (the pane below shows its tail) |
| `z` | sit and rest 30 s (health and power also tick back in real time while you stand) |
| `:` | the command line: every verb of the line game (`:rest 120`, `:auto 50 farm kobold`, `:help`) |
| `?` | the key list |

**World** lists the quests on offer (`!` when you can take one, `?` when one is ready to hand in),
the people here, the exits and every creature you can hunt, coloured by level like the client.
`Enter` on a creature starts a live fight; `f` resolves it instantly; `a` starts the autopilot.
The autopilot accepts quests, picks targets, rests and hands in on its own, one planner step every
third of a second, and every fight it picks plays out live on screen with the same frames and
combat log as a fight you started yourself. Between fights it keeps its own panel (your frame and
what it is doing) instead of flashing back to the tabs; `1`-`9` looks at a tab, `w` goes back to
watching. `Esc` stops it; `Esc` during one of its fights runs away and stops it.

**Fights** run on the engine's real-time session, ticking every 100 ms: unit frames with health,
power, a fixed cast slot and auras that hold their place. Your rotation plays by default; press a
number to fire that ability over it, `a` to take full control (the numbered ability bar shows in
manual play), `Space` to pause, `+`/`-` to run the fight faster or slower, `Esc` to run away. The 1.12 combat log streams into the log pane.

**Rotation** is what auto-play casts for you: the same rule list the web editor edits, phase by
phase, every rule as a sentence. Rules are read top to bottom each tick and the first one whose
conditions hold fires. `Enter` on a rule opens its menu (turn on or off, change when it fires,
move, delete); `Enter` on `+ Add a rule` picks a spell or combat item; the Settings rows at the
bottom pick a spec or rebuild the recommended list. `K`/`J`, `a`, `c`, `d`, `s`, `r` still work as
shortcuts.

**Vendors** open in a buy list with prices, stock and why a line is unavailable; `Tab` flips to
selling your bags, `j` sells greys, `r` repairs; a reagent your party crafts with is flagged.
**Trainers** show what you can learn now and what is coming up at which level. **Talents** spend
and refund points per tree.

**Professions** lists your trade skills and your companions', the profession trainers in the zone
and any Plans or Patterns in your bags. `Enter` on a profession opens its recipe book, coloured by
difficulty (orange always raises the skill, gray never): `Enter` makes one, `A` makes all you can,
`N` asks how many, `h` shows only what you can make, `/` searches, and `c` hands the book to a
companion who knows the craft (they craft from the whole party's bags and banks). Short vendor
reagents such as thread, vials and flux are bought from your purse as you craft, the cost shown on
the row. Enchanting opens a bench instead: formulas apply to your gear or a party member's, and
green-or-better bag items can be disenchanted. Mining, Herbalism, Skinning and Fishing list the
zone's nodes (also on the World tab) with `Enter` to gather. *Everything the party can make* is one
book across every crafter. `g` here, in Bags or in Companions opens **Send goods**: trade goods go
to the companions whose recipes use them and upgrades go on whoever gains, after you review it.

**Companions** shows your party (up to four) and bench. At an inn, *Hire a companion* lists the
adventurers for hire with their gear and price. Each companion's page sets their role, seats or
benches them, gears them (`Enter` on a slot picks from their bags and yours), gives and takes
items, teaches them a profession and opens their recipe book or sends them on a gathering trip
that pays out while you play. The *Fights* row (`m`, or `:squad solo|elites|party`) says who comes along:
Solo, companions only against elites, or the whole party on every pull. That rule covers live fights, `f`,
`:fight` and the autopilot; party frames show each companion's role, target and cast, and `t` in a fight
pauses it to give one of them an order (attack a target, cast an ability, hold ground).

**Dungeons** sit under *Dungeons* on the World tab of the zone that holds their door (and on the
Travel tab), with any held run or raid lockout on the row. `Enter` opens the card before the door: route
(Bosses or Full), party or raid, who walks in (`f` fills from every companion you own to what the
instance wants), the 10/20/40-man raid group, the paladins' Blessings, and food and water for everyone
short of it. Inside, the run window lists the rooms in route order with their stops (`B` boss, `T` trash,
`R` rare), the doors, levers and chests nearest each stop, and the NPCs with quests. `Enter` on an
open stop pulls it live with the party (`p` in the fight pulls the next trash pack in too), on a gate
uses it, on a chest opens it. Locked stops say what opens them. `z` rests and eats between pulls,
`F` runs every remaining stop without watching and ends on a run report (damage, healing, loot, wipes),
`P` opens the Blessings board, `L` leaves (a 5-man is held for 30 minutes) and `R` resets.

**Gear** shows every slot with what you wear. `Enter` on a slot lists everything in your bags
(and in the bank, in a bank town) that fits it, with the stat, armor and damage difference in
the detail pane; `Enter` there puts it on. The engine's equipment helper scores your bags
against what you wear: upgrades are listed at the top of the tab and marked `▲` in Bags, and
`u` (on either tab) puts on every upgrade at once. `x` takes a piece off.

**City services** appear under *Services* on the World tab, above the people: the **Bank**
in the six capitals and the goblin banker towns (`b` in Bags opens it too; `Tab` flips between
depositing and withdrawing, `n` moves part of a stack, `+` buys a bank bag slot, `B` slots a
bag), the **Auction House** in the capitals (`Tab` cycles browse, sell and your own auctions;
`Enter` buys out, `b` bids, `s` searches by name; selling asks quantity, bid, buyout and
duration), and the **Mailbox** by every inn, where sales, refunds and overflow loot arrive
(`Enter` takes a letter's money and items, `A` empties the box, `d` deletes). `:bank`, `:ah`
and `:mail` open them from the command line.

Piped input, or `azsh --repl`, gives the line game instead: type `help` for its commands.
`azsh --tui` forces the windowed game even without a terminal, which is how it is driven through pipes
in tests. Keys are decoded from the raw byte stream, so a lone `Esc` acts at once.

Saves live in `~/.azsh/saves/`, one JSON file per character. `AZSH_HOME` moves that folder.

## Where it comes from

| Layer | Source | In this tree |
| --- | --- | --- |
| Engine, rules, world, quests, autopilot | phonecraft `src/engine`, `src/domain`, `src/world`, `src/quests`, `src/progression`, `src/autopilot` | copied as-is |
| Data | phonecraft `src/data` (CMaNGOS world DB + DBC bake) | every table gzipped on disk (`src/cli/gzLoader.mjs` serves static imports), audio tables dropped |
| Front end | new | `src/cli/` — `tui.mjs` (frame, input, dialogs), `tuiViews.mjs` (tabs), `tuiProfessions.mjs` and `tuiCompanions.mjs` (crafting, companions), `tuiFight.mjs` (live fight, autopilot), `repl.mjs` (line game and the shared verb table) |
| Combat log wording | phonecraft `src/ui/combat/combatLogFormat.ts` | `src/cli/combatLogFormat.ts` |
| Rotation sentences | phonecraft `src/ui/rotation/rotationEditorSentence.ts` | `src/cli/rotationText.mjs` |

Everything the player reads traces to a CMaNGOS row or a 1.12 client string. Nothing here is
invented; see phonecraft's `AI.md` for the data rules this tree inherits.

## Checks

```
npm run check        # boot the store, fight ten kobolds, save and reload
npm run check:tui    # drive the windowed game headlessly: tabs, quest, vendor, trainer, gear, bank, auction house, live fight, autopilot, crafting, hiring, send goods
npm run check:pipe   # the real terminal path through pipes: raw key bytes in, ANSI frames out, Esc, paging, quit
npm run check:all    # all three; add --frames to check:tui to print every screen
npm run data:pack    # gzip the bake after a data refresh; data:unpack reverses it
```

Not yet in the terminal: dungeons and raids (the facade verbs exist, the floor walk was a
graphical surface), professions and crafting, pets, and sending mail to other characters.
