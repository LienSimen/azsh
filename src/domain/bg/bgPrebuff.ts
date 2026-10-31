// Gate-time buff-up for one BG team — the dungeon pre-pull pass applied to a seat list, so mercs,
// roster picks and the ENEMY team all walk in buffed. Bag elixirs with a useSpell are drunk.

import type { DataStore } from '../../data/dataStore.ts';
import type { ActiveAura, Character } from '../character/character.ts';
import { applyAura } from '../character/character.ts';
import { companionCharacter, companionLevel, companionSpellbook } from '../bots/squad.ts';
import {
  companionRotationOf, isCompanionKeepUpSpell, keepUpAuraDurationMs, syncCompanionBagItemRules,
} from '../bots/companionRotation.ts';
import { planPrePull, type PartyCaster } from '../bots/prePullBuffs.ts';
import {
  mergePaladinChips,
  planPartyPaladinBuffs,
  restampPaladinRotation,
  type PaladinPartyMember,
} from '../bots/paladinPrePull.ts';
import type { PaladinAssignments } from '../rotation/paladinBuffs.ts';
import { applyCompanionItemPrep, type CompanionPrepDeps } from '../bots/companionPrep.ts';
import { countItem, emptyInventory, removeItem, type Inventory } from '../items/inventory.ts';
import type { SpellBook } from '../character/spellbook.ts';
import type { BgTeamSeat } from './bgRoster.ts';

export interface BgPrebuffOpts {
  ds: DataStore;
  now: number;
  playerLevel: number;
  seats: readonly BgTeamSeat[];
  /** Present on the friendly team only: the player receives the merged buffs as real auras. */
  player?: { char: Character; spellbook: SpellBook };
  /** The player's bags, for the Greater Blessing reagent count. Absent ⇒ not gated on reagents. */
  playerBags?: Inventory;
  /** Debit a reagent the player's own Greater Blessing spent. Absent ⇒ the cast is free. */
  spendPlayerReagent?: (item: number, count: number) => void;
  /** The player's PallyPower board. Friendly team only — the enemy's paladins are not yours. */
  assignments?: PaladinAssignments;
  /** Injected weapon-imbue applier (engine router). Absent ⇒ imbue prep is skipped. */
  applyImbue?: CompanionPrepDeps['applyImbue'];
  log?: (msg: string) => void;
}

/** Returns the buffed player character (friendly team), or undefined. Mutates seat comps. */
export function applyBgTeamPrebuffs(o: BgPrebuffOpts): Character | undefined {
  const { ds, now } = o;
  const seated = o.seats.filter((s) => s.comp);
  const comps = seated.map((s) => s.comp!);
  // The variant the seat will FIGHT with, so prep reads that list rather than the class default —
  // an authored band carries its own buffs phase and its own weapon-coat rules (arenaComps.ts:20).
  const variantOf = new Map(seated.map((s) => [s.comp!, s.compSeat?.rotation]));
  const casters: PartyCaster[] = [
    ...(o.player ? [{ name: o.player.char.name, spellbook: o.player.spellbook }] : []),
    ...comps.map((c) => ({
      name: c.name,
      spellbook: companionSpellbook(c, companionLevel(c, o.playerLevel), ds),
    })),
  ];
  const plan = planPrePull(casters, ds);

  let outChar = o.player?.char;
  if (outChar) {
    for (const b of plan.buffs) outChar = applyAura(outChar, b.spellId, b.durationMs, now, ds);
  }

  // Paladin Blessings and Auras are per-target and per-paladin, so they come from their own plan
  // rather than the flat one above. Cite: PlayerbotPaladinAI.cpp:412-450, :643-716.
  const playerBags = o.playerBags;
  const pal = planPartyPaladinBuffs(
    [
      ...(o.player
        ? [{
          key: 'player',
          name: o.player.char.name,
          cls: o.player.char.cls,
          level: o.player.char.level,
          known: o.player.spellbook.known,
          // Absent bags means "not supplied", never "carries none" — a caller that cannot hand its
          // inventory over must not have its paladin downgraded to the 5 min ranks.
          ...(playerBags ? { reagentCount: (item: number) => countItem(playerBags, item) } : {}),
        } satisfies PaladinPartyMember]
        : []),
      ...comps.map((c) => ({
        key: c.id,
        name: c.name,
        cls: c.cls,
        level: companionLevel(c, o.playerLevel),
        known: companionSpellbook(c, companionLevel(c, o.playerLevel), ds).known,
        role: (c.role === 'dps' ? 'dps' : c.role) as 'tank' | 'healer' | 'dps',
        reagentCount: (item: number) => countItem(c.bags ?? emptyInventory(), item),
      })),
    ],
    ds,
    now,
    o.assignments,
  );
  // Greater Blessings eat their Symbols of Kings here too. Cite: Spell.cpp TakeReagents.
  for (const r of pal.reagents) {
    if (r.from === 'player') {
      // Only the caller owns the player's bags; `spendPlayerReagent` is how it debits them.
      o.spendPlayerReagent?.(r.item, r.count);
      continue;
    }
    const c = comps.find((x) => x.id === r.from);
    if (c) c.bags = removeItem(c.bags ?? emptyInventory(), r.item, r.count)[0];
  }
  if (outChar) {
    for (const chip of pal.byKey.get('player') ?? []) {
      outChar = applyAura(
        outChar, chip.spellId, chip.expiresAt != null ? chip.expiresAt - now : 0, now, ds,
        chip.fromCaster != null ? { fromCaster: chip.fromCaster } : undefined,
      );
    }
  }

  const teamAuras: ActiveAura[] = plan.buffs.map((b) => ({
    spellId: b.spellId,
    ...(b.durationMs > 0 ? { expiresAt: now + b.durationMs } : {}),
  }));
  for (const c of comps) {
    c.prePullAuras = mergePaladinChips(teamAuras.map((a) => ({ ...a })), pal.byKey.get(c.id), ds);
    const lvl = companionLevel(c, o.playerLevel);
    // Own rotation buffs-phase keep-ups — planPrePull only plans party-wide buffs. The same
    // `mode: 'pvp'` request bgScreen's provider makes, so prebuff reads the list that will fight.
    const variant = variantOf.get(c);
    // Synced FIRST: an oil or a stone is a buffs-phase item rule that only `syncCompanionBagItemRules`
    // writes, so prep read a rotation without them and 0 of 170 gauntlet rungs ever got a coat.
    const rot = syncCompanionBagItemRules(
      companionRotationOf(c, o.playerLevel, ds, undefined, {
        mode: 'pvp', ...(variant ? { variant } : {}),
      }),
      companionCharacter(c, lvl, ds),
      c.bags,
      ds,
    );
    const paced = restampPaladinRotation(rot, pal, c.id, ds);
    for (const r of paced.phases.buffs) {
      if (!r.enabled || r.action.kind !== 'spell') continue;
      const sp = ds.spell(r.action.spellId);
      if (!sp || !isCompanionKeepUpSpell(sp)) continue;
      if (c.prePullAuras.some((a) => a.spellId === sp.id)) continue;
      const durMs = keepUpAuraDurationMs(sp);
      c.prePullAuras.push({ spellId: sp.id, ...(durMs > 0 ? { expiresAt: now + durMs } : {}) });
    }
    // Buffs-phase item rules (weapon imbues, scrolls) then the bag-elixir sweep.
    applyCompanionItemPrep(c, rot, {
      ds,
      now,
      char: companionCharacter(c, lvl, ds),
      ...(o.applyImbue ? { applyImbue: o.applyImbue } : {}),
      ...(o.log ? { log: o.log } : {}),
    });
  }
  return outChar;
}
