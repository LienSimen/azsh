// Fight-end hide: party Skinning auto-skins (knife + skill-up, KI-735). A companion skinner is
// the group's skinner. No Skinning in the group: the corpse's skinning_loot_template does not drop.

import type { DataStore } from '../../data/dataStore.ts';
import type { GatherNodeDef } from '../../data/schema.ts';
import { bagCapacity } from '../../domain/items/equipment.ts';
import {
  addItem,
  canFit,
  emptyInventory,
} from '../../domain/items/inventory.ts';
import { equippedEntry } from '../../domain/items/itemInstance.ts';
import type { LootDrop } from '../../domain/items/loot.ts';
import {
  canGather,
  gainSkill,
  isSkinningKnife,
  professionSkillValue,
  rollGather,
} from '../../domain/professions/professions.ts';
import {
  autoGatherAllowed,
  gatherFilterSkills,
  normalizeGatherFilterConfig,
} from '../../domain/professions/gatherFilter.ts';
import { questNeededItems } from '../../domain/quests/questlog.ts';
import {
  companionCharacter,
  companionLevel,
  companionSkillMap,
} from '../../domain/bots/squad.ts';
import { announceCompanionRanks } from './companionTraining.ts';
import type { Rng } from '../core/rng.ts';
import type { ActionResult } from './types.ts';
import type { GameState } from './types.ts';

export function tryProfessionAutoSkin(args: {
  ds: DataStore;
  state: GameState;
  cdefName: string;
  skinDef: GatherNodeDef;
  rng: Rng;
  applyGather: (
    node: GatherNodeDef,
    rng?: Rng,
  ) => ActionResult<{ yielded: LootDrop[]; skillUp?: number }>;
  loot: LootDrop[];
  log: (msg: string) => void;
}): boolean {
  const { ds, state, cdefName, skinDef, rng, applyGather, loot, log } = args;
  const skills = gatherFilterSkills(state.char, ds, skinDef, state.spellbook, state.squad);
  const allowed = autoGatherAllowed(
    skinDef,
    skills,
    normalizeGatherFilterConfig(state.gatherFilter),
    questNeededItems(state.questlog, (e) => ds.quest(e)),
  );
  if (!allowed) return false;
  // applyGather already picks a party worker (skill + knife). Do not gate on the player.
  const skinned = applyGather(skinDef, rng);
  if (skinned.ok) {
    state.corpse = null;
    loot.push(...skinned.yielded);
    return true;
  }
  for (const comp of state.squad ?? []) {
    if (comp.mission) continue;
    const lvl = companionLevel(comp, state.char.level);
    const shell = companionCharacter(comp, lvl, ds);
    if (!canGather(shell, skinDef, professionSkillValue(shell, skinDef.skill, ds)).ok) continue;
    const bags = comp.bags ?? emptyInventory();
    const hasKnife =
      bags.stacks.some((s) => isSkinningKnife(ds.item(s.item)))
      || Object.values(comp.equipped).some((v) => {
        const e = equippedEntry(v);
        return e != null && isSkinningKnife(ds.item(e));
      });
    if (!hasKnife) continue;
    const rolled = rollGather(skinDef, rng);
    const cap = bagCapacity(shell, ds);
    let probe = bags;
    let fits = true;
    for (const l of rolled) {
      const stack = ds.item(l.item)?.stackable ?? 1;
      if (!canFit(probe, l.item, l.count, stack, cap)) { fits = false; break; }
      probe = addItem(probe, l.item, l.count, stack);
    }
    if (!fits && rolled.length > 0) continue;
    let nextBags = bags;
    for (const l of rolled) {
      const stack = ds.item(l.item)?.stackable ?? 1;
      nextBags = addItem(nextBags, l.item, l.count, stack);
    }
    comp.bags = nextBags;
    const gain = gainSkill(shell, 'skinning', skinDef, rng);
    if (gain.up != null && gain.char.skills.skinning) {
      const v = gain.char.skills.skinning.current;
      if (comp.professions == null || Object.keys(comp.professions).length === 0) {
        const derived = companionSkillMap(comp, lvl);
        const frozen: Record<string, number> = {};
        for (const k of Object.keys(derived)) frozen[k] = derived[k as keyof typeof derived]!.current;
        comp.professions = frozen;
      }
      comp.professions = { ...(comp.professions ?? {}), skinning: v };
      announceCompanionRanks(comp, lvl, ds, log);
    }
    state.corpse = null;
    const names = rolled.map((l) => `${l.count}x ${ds.item(l.item)?.name ?? l.item}`).join(', ');
    log(`${comp.name} skins ${cdefName}: ${names || 'nothing of use'}.${gain.up != null ? ` (skinning → ${gain.up})` : ''}`);
    return true;
  }
  return false;
}

// Anyone in the group holds Skinning — the player, or a hired companion who is not away on a
// mission. Same party rule a vein or a herb is worked under (professions.ts gatherWorkers).
export function partyHasSkinner(state: GameState): boolean {
  if (state.char.skills.skinning != null) return true;
  for (const comp of state.squad ?? []) {
    if (comp.mission) continue;
    if (companionSkillMap(comp, companionLevel(comp, state.char.level)).skinning != null) return true;
  }
  return false;
}
