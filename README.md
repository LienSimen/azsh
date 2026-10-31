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

The prompt shows your name, level, zone and pools. Type `help` for the command list. The loop
is the one the web client runs: `look` at the zone, `fight` a creature and read the 1.12 combat
log, `accept` and `turnin` quests, `vendor` and `buy`, `train`, `travel`. `auto 50` hands the
character to the autopilot for fifty steps: it accepts quests here, kills what they ask for,
eats when low, hands them in and moves on.

Saves live in `~/.azsh/saves/`, one JSON file per character. `AZSH_HOME` moves that folder.

## Where it comes from

| Layer | Source | In this tree |
| --- | --- | --- |
| Engine, rules, world, quests, autopilot | phonecraft `src/engine`, `src/domain`, `src/world`, `src/quests`, `src/progression`, `src/autopilot` | copied as-is |
| Data | phonecraft `src/data` (CMaNGOS world DB + DBC bake) | every table gzipped on disk (`src/cli/gzLoader.mjs` serves static imports), audio tables dropped |
| Front end | new | `src/cli/` |
| Combat log wording | phonecraft `src/ui/combat/combatLogFormat.ts` | `src/cli/combatLogFormat.ts` |

Everything the player reads traces to a CMaNGOS row or a 1.12 client string. Nothing here is
invented; see phonecraft's `AI.md` for the data rules this tree inherits.

## Checks

```
npm run check        # boot the store, fight ten kobolds, save and reload
npm run data:pack    # gzip the bake after a data refresh; data:unpack reverses it
```
