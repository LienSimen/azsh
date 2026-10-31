// The on-use "read this and learn it" route, and the dispatch that sends every other teach item to its
// own method. A surface that tested the use spell first fed the book to the consumable path.

import { countItem, removeItem } from '../../domain/items/inventory.ts';
import { itemTeachIntent, unavailableTeachReason } from '../../domain/items/itemTeaches.ts';
import { knows, learn } from '../../domain/character/spellbook.ts';
import { applySpellTrainedSkills, spellLearnDependents } from '../../domain/character/combatSkills.ts';
import { lowerRanksFor } from '../../domain/character/character.ts';
import { replaceSpell as replaceBarSpell } from '../../domain/character/actionbar.ts';
import { ensureLivePlayerRotation, upgradeSpellInRotation } from '../../domain/rotation/rotation.ts';
import { roleSpecOverride } from '../../domain/bots/companionRotation.ts';
import type { Game } from './types.ts';
import type { GameCtx } from './context.ts';
import { autofillPlayerBars } from './barAutofill.ts';

/** What consumeItem reports back for a teach item it routed. */
export type TeachKind = 'recipe' | 'enchant' | 'petSpell' | 'spell' | 'profRank';

export function createLearnFromItemModule(
  ctx: GameCtx,
  extras: {
    /** Spell ids the character may actually use — drives action-bar autofill after a learn. */
    eligibleSpellIds: () => number[];
  },
): Pick<Game, 'learnSpellFromItem'> {
  const { ds, state, log } = ctx;
  return {
    learnSpellFromItem(itemEntry) {
      const it = ds.item(itemEntry);
      const teach = itemTeachIntent(it, ds);
      if (!it || teach?.kind !== 'spell') return { ok: false, reason: 'That book teaches no ability' };
      if (it.allowClass && !it.allowClass.includes(state.char.cls)) return { ok: false, reason: 'Your class cannot study this' };
      if (it.requiredLevel > state.char.level) return { ok: false, reason: `Requires level ${it.requiredLevel}` };
      if (countItem(state.inventory, itemEntry) <= 0) return { ok: false, reason: "You don't have that book" };
      const sp = ds.spell(teach.id);
      if (!sp) return { ok: false, reason: 'That book teaches an unknown ability' };
      if ((sp.reqLevel ?? 0) > state.char.level) return { ok: false, reason: `Requires level ${sp.reqLevel}` };
      if (knows(state.spellbook, teach.id)) return { ok: false, reason: `${sp.name} is already known` };
      // Mirrors the quest reward-spell grant: learn the ability and whatever it trains, then swap the
      // superseded rank on the bars and in the rotation. Cite: SpellEffects.cpp:2445 EffectLearnSpell.
      const skillMeta = ds.combatSkillMeta?.();
      const toLearn = [teach.id, ...spellLearnDependents(teach.id, skillMeta)].filter(
        (id, i, arr) => arr.indexOf(id) === i && !!ds.spell(id),
      );
      for (const sid of toLearn) {
        if (knows(state.spellbook, sid)) continue;
        state.spellbook = learn(state.spellbook, sid);
        if (state.char.combatSkills) {
          state.char = {
            ...state.char,
            combatSkills: applySpellTrainedSkills(
              state.char.combatSkills, sid, state.char.level, skillMeta, state.char.race, state.char.cls,
            ),
          };
        }
        for (const oldId of lowerRanksFor(state.spellbook, sid, ds)) {
          state.actionBars = replaceBarSpell(state.actionBars, oldId, sid);
          if (state.rotation?.custom) {
            state.rotation = upgradeSpellInRotation(state.rotation, [oldId], sid);
          }
        }
      }
      // Same as learnFromTrainer: non-custom defaults pick up the new kit for autofight.
      {
        const role = state.squadRole;
        const band = state.rotationSpec
          ?? ((role === 'healer' || role === 'tank')
            ? (roleSpecOverride(state.char.cls, role) ?? undefined)
            : undefined);
        state.rotation = ensureLivePlayerRotation(
          state.rotation,
          state.char,
          state.spellbook,
          ds,
          state.inventory,
          { band: band ?? null, role },
        );
      }
      autofillPlayerBars(state, extras.eligibleSpellIds());
      state.inventory = removeItem(state.inventory, itemEntry, 1)[0];
      log(`You study ${it.name} and learn ${sp.name}.`);
      return { ok: true, spell: teach.id, name: sp.name };
    },
  };
}

// Route an on-use teach item to the method that owns its catalog, shaped for consumeItem's result. Returns
// undefined when the item teaches nothing, so the caller falls through to its generic consumable dispatch.
export function routeTeachItem(
  itemEntry: number,
  ds: GameCtx['ds'],
  api: Pick<
    Game,
    'trainPet' | 'learnRecipeFromItem' | 'learnEnchantFromItem' | 'learnSpellFromItem'
    | 'learnProfessionRankFromItem'
  >,
): { ok: true; restored: number; learned: { kind: TeachKind; name: string } } | { ok: false; reason: string } | undefined {
  const teach = itemTeachIntent(ds.item(itemEntry), ds);
  if (!teach) return undefined;
  const wrap = (
    kind: TeachKind,
    r: { ok: boolean; reason?: string; name?: string },
  ) => (
    r.ok
      ? { ok: true as const, restored: 0, learned: { kind, name: r.name ?? '' } }
      : { ok: false as const, reason: r.reason ?? 'Cannot learn' }
  );
  switch (teach.kind) {
    case 'petSpell': return wrap('petSpell', api.trainPet(itemEntry));
    case 'recipe': return wrap('recipe', api.learnRecipeFromItem(itemEntry));
    case 'enchant': return wrap('enchant', api.learnEnchantFromItem(itemEntry));
    case 'spell': return wrap('spell', api.learnSpellFromItem(itemEntry));
    case 'profRank': return wrap('profRank', api.learnProfessionRankFromItem(itemEntry));
    // The item really does teach, but this bake has no row for the target — refuse and KEEP it.
    // Falling through would hand it to the generic path, which destroys it.
    case 'unavailable': return { ok: false, reason: unavailableTeachReason(teach.what) };
  }
}
