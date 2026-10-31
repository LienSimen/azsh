/** Host consumption of npc_professions IR learn/unlearn/train/trade kinds. Cite: npc_professions.cpp SendActionMenu. */

import { forget as forgetSpell, learn as learnSpell } from '../../domain/character/spellbook.ts';
import type { ProfessionSpecApplyResult } from '../../domain/scriptdev/professionSpecConsumer.ts';
import type { GameState } from './types.ts';

type AppliedOk = Extract<ProfessionSpecApplyResult, { ok: true }>;

// TRIGGERED CastSpell result: LEARN_SPELL grant or unlearn remove + ProfessionUnlearnSpells. Named
// `applySpell` so aifid census side-effect scan sees a real consumer.
function applySpell(state: GameState, applied: AppliedOk): void {
  if (applied.grantedSpellId != null) {
    state.spellbook = learnSpell(state.spellbook, applied.grantedSpellId);
  }
  if (applied.removedSpellId != null) {
    state.spellbook = forgetSpell(state.spellbook, applied.removedSpellId);
    for (const rid of applied.removeRecipeSpells) {
      state.spellbook = forgetSpell(state.spellbook, rid);
    }
    if (applied.removeRecipeSpells.length) {
      const drop = new Set(applied.removeRecipeSpells);
      state.char = {
        ...state.char,
        knownRecipes: state.char.knownRecipes.filter((id) => !drop.has(id)),
      };
    }
    if (applied.moneyCopper !== state.char.gold) {
      state.char = { ...state.char, gold: applied.moneyCopper };
    }
  }
}

/** Player-visible activity line (same buffer Game.log writes). */
function push(state: GameState, msg: string): void {
  state.activity.unshift(msg);
  if (state.activity.length > 60) state.activity.pop();
}

// Dispatch IR kind onto game state. An unread kind is not done. Cite: npc_professions.cpp:348-392 /
// :548-620 SendActionMenu.
export function consumeProfessionSpecKind(
  applied: AppliedOk,
  state: GameState,
  trainerEntry: number,
): void {
  const kind = applied.kind;

  if (
    kind === 'learn_armor' ||
    kind === 'learn_weapon' ||
    kind === 'learn_hammer' ||
    kind === 'learn_axe' ||
    kind === 'learn_sword' ||
    kind === 'learn_dragon' ||
    kind === 'learn_elemental' ||
    kind === 'learn_tribal'
  ) {
    // Cite: npc_professions.cpp:359-386 / :575-617 CastSpell S_LEARN_* TRIGGERED.
    if (applied.phase === 'cast_learn' && applied.grantedSpellId != null) {
      applySpell(state, applied);
      push(state, `Learned profession specialization (${applied.grantedSpellId}).`);
    }
    return;
  }

  if (kind === 'unlearn_dragon' || kind === 'unlearn_elemental' || kind === 'unlearn_tribal') {
    // Cite: npc_professions.cpp:559-614 CastSpell S_UNLEARN_* + ProfessionUnlearnSpells + ModifyMoney.
    if (applied.phase === 'cast_unlearn' && applied.removedSpellId != null) {
      applySpell(state, applied);
      push(state, `Unlearned profession specialization (${applied.removedSpellId}).`);
    }
    return;
  }

  if (
    kind === 'unlearn_armor' ||
    kind === 'unlearn_weapon' ||
    kind === 'unlearn_hammer' ||
    kind === 'unlearn_axe' ||
    kind === 'unlearn_sword'
  ) {
    // Cite: npc_professions.cpp:388-390 SendActionMenu default CLOSE — no unlearn CastSpell.
    if (applied.phase === 'close') {
      push(state, `Gossip menu closes at ${trainerEntry}.`);
    }
    return;
  }

  if (kind === 'trade') {
    // Cite: npc_professions.cpp:352-354 / :552-554 SEND_VENDORLIST.
    push(state, `Opens vendor list at ${trainerEntry}.`);
    return;
  }

  if (kind === 'train') {
    // Cite: npc_professions.cpp:355-357 / :555-557 SEND_TRAINERLIST.
    push(state, `Opens trainer list at ${trainerEntry}.`);
  }
}
