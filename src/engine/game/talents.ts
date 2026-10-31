// Talent spend / refund / respec / premade. Pattern C: createTalentsModule(ctx, extras). nextRespecCost is
// pure and re-exported from game.ts for barrel importers. No import of game.ts.

import { applyAura, lowerRanksFor } from '../../domain/character/character.ts';
import {
  replaceSpell as replaceBarSpell,
} from '../../domain/character/actionbar.ts';
import {
  ensureLivePlayerRotation,
  upgradeSpellInRotation,
} from '../../domain/rotation/rotation.ts';
import { knows, learn } from '../../domain/character/spellbook.ts';
import { hasAttrEx, SPELL_ATTR_EX } from '../spells/spellAttributes.ts';
import {
  spentPoints,
  canSpend as canSpendTalent, canRefund as canRefundTalent,
  spendTalent as doSpendTalent, refundTalent as doRefundTalent, respec as doRespec,
  talentGrantedSpellIds,
} from '../../domain/character/talents.ts';
import { talentsForSpec, talentsFromLink } from '../../domain/character/talentLink.ts';
import {
  MAX_TALENT_BUILDS, nextTalentBuildId, normalizeTalentBuilds,
  sanitizeTalentBuildName, uniqueTalentBuildName,
} from '../../domain/character/talentBuilds.ts';
import { moneyMarked } from '../../domain/economy/money.ts';
import type { Game, GameState } from './types.ts';
import type { GameCtx } from './context.ts';
import type { DataStore } from '../../data/dataStore.ts';
import { autofillPlayerBars } from './barAutofill.ts';

/** Copper per gold (CMaNGOS `GOLD = SILVER * 100`). SharedDefines.h MoneyConstants. */
const GOLD_COPPER = 10_000;
/** One "month" for respec decay: CMaNGOS `MONTH = DAY * 30` (seconds) → ms. Common.h TimeConstants. */
const RESPEC_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

// Next talent-respec cost in copper, matching Player::resetTalentsCost: 1g, then 5g, then 10g, then
// either decaying by 5g a month down to 10g or rising by 5g up to a 50g cap. Cite: Player.cpp:3715.
export function nextRespecCost(prevCostCopper: number, monthsSinceLast: number): number {
  // The first time reset costs 1 gold
  if (prevCostCopper < 1 * GOLD_COPPER) return 1 * GOLD_COPPER;
  // then 5 gold
  if (prevCostCopper < 5 * GOLD_COPPER) return 5 * GOLD_COPPER;
  // After that it increases in increments of 5 gold
  if (prevCostCopper < 10 * GOLD_COPPER) return 10 * GOLD_COPPER;
  if (monthsSinceLast > 0) {
    // This cost will be reduced by a rate of 5 gold per month
    // to a minimum of 10 gold.
    const newCost = prevCostCopper - 5 * GOLD_COPPER * monthsSinceLast;
    return newCost < 10 * GOLD_COPPER ? 10 * GOLD_COPPER : newCost;
  }
  // After that it increases in increments of 5 gold until it hits a cap of 50 gold.
  let newCost = prevCostCopper + 5 * GOLD_COPPER;
  if (newCost > 50 * GOLD_COPPER) newCost = 50 * GOLD_COPPER;
  return newCost;
}

/** True when both talent maps spend the same ranks (missing key ≡ 0). */
export function talentMapsEqual(a: Record<number, number>, b: Record<number, number>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const id = Number(k) | 0;
    if (((a[id] as number) || 0) !== ((b[id] as number) || 0)) return false;
  }
  return true;
}

export type TalentsExtras = {
  unlearnTalentGrantedSpells: (ids: Set<number>) => void;
  eligibleSpellIds: () => number[];
  playerRotationBand: () => string | undefined;
};

export function createTalentsModule(
  ctx: GameCtx,
  extras: TalentsExtras,
): Pick<
  Game,
  | 'spendTalent'
  | 'refundTalent'
  | 'respec'
  | 'respecCost'
  | 'applyPremadeSpec'
  | 'saveTalentBuild'
  | 'deleteTalentBuild'
  | 'applyTalentBuild'
  | 'applyTalentLink'
> {
  const { ds, state, log } = ctx;
  const { unlearnTalentGrantedSpells, eligibleSpellIds, playerRotationBand } = extras;

  function respecCost(nowMs?: number): number {
    if (spentPoints(state.char) === 0) return 0;
    const now = nowMs ?? Date.now();
    const prevCost = state.resetTalentsCost ?? 0;
    const lastTime = state.resetTalentsTime ?? 0;
    const months = Math.max(0, Math.floor((now - lastTime) / RESPEC_MONTH_MS));
    return nextRespecCost(prevCost, months);
  }

  /** Shared player apply: paid respec when the tree is spent, grant/unlearn, rotation rebuild. */
  function applyLearnSpell(state: GameState, sid: number, ds: DataStore, nowMs?: number) {
    const ts = nowMs ?? Date.now();
    state.spellbook = learn(state.spellbook, sid);
    if (hasAttrEx(ds.spell(sid), SPELL_ATTR_EX.CAST_WHEN_LEARNED)) {
      state.char = applyAura(state.char, sid, undefined, ts, ds);
    }
  }

  function applyNamedTalents(
    want: Record<number, number>,
    name: string,
    nowMs?: number,
  ): { ok: true; name: string; cost: number } | { ok: false; reason: string } {
    const have = state.char.talents ?? {};
    if (talentMapsEqual(have, want)) return { ok: true, name, cost: 0 };

    const spent = spentPoints(state.char);
    const now = nowMs ?? Date.now();
    let cost = 0;
    if (spent > 0) {
      cost = respecCost(now);
      if (state.char.gold < cost) return { ok: false, reason: 'Not enough gold' };
    }

    const oldGranted = talentGrantedSpellIds(state.char, ds);
    state.char = {
      ...state.char,
      talents: { ...want },
      gold: state.char.gold - cost,
    };
    if (spent > 0) {
      state.resetTalentsCost = cost;
      state.resetTalentsTime = now;
      if (state.char.pet) {
        const petName = state.char.pet.name;
        state.char = { ...state.char, pet: undefined };
        log(`You dismissed ${petName}.`);
      }
    }

    const newGranted = talentGrantedSpellIds(state.char, ds);
    const lost = new Set<number>();
    for (const id of oldGranted) if (!newGranted.has(id)) lost.add(id);
    unlearnTalentGrantedSpells(lost);

    let grantedNew = false;
    for (const [tidStr, rnkRaw] of Object.entries(want)) {
      const tid = Number(tidStr) | 0;
      const rnk = rnkRaw || 0;
      if (rnk < 1) continue;
      const tal = ds.talent(tid);
      if (!tal) continue;
      const maxR = Math.min(rnk, tal.ranks.length);
      for (let r = 1; r <= maxR; r++) {
        const rank = tal.ranks[r - 1];
        if (!rank) continue;
        for (const eff of rank.effects ?? []) {
          if (eff.kind === 'grant_spell' && typeof (eff as { spellId?: number }).spellId === 'number') {
            const sid = (eff as { spellId: number }).spellId;
            if (ds.spell(sid) && !knows(state.spellbook, sid)) {
              applyLearnSpell(state, sid, ds, nowMs);
              const lowers = lowerRanksFor(state.spellbook, sid, ds);
              if (lowers.length) {
                for (const oldId of lowers) state.actionBars = replaceBarSpell(state.actionBars, oldId, sid);
                if (state.rotation?.custom) {
                  state.rotation = upgradeSpellInRotation(state.rotation, lowers, sid);
                }
              }
              grantedNew = true;
            }
          }
          if (eff.kind === 'grant_passive' && rank.spellId) {
            const sid = rank.spellId;
            if (ds.spell(sid) && !knows(state.spellbook, sid)) {
              applyLearnSpell(state, sid, ds, nowMs);
              grantedNew = true;
            }
          }
        }
      }
    }
    if (grantedNew) {
      autofillPlayerBars(state, eligibleSpellIds());
    }
    state.rotation = ensureLivePlayerRotation(
      state.rotation,
      state.char,
      state.spellbook,
      ds,
      state.inventory,
      { band: playerRotationBand() ?? null, role: state.squadRole },
    );
    log(cost > 0
      ? `Respecced to ${name} for ${moneyMarked(cost)}.`
      : `Applied talent build ${name}.`);
    return { ok: true, name, cost };
  }

  return {
    spendTalent(talentId) {
      const check = canSpendTalent(state.char, talentId, ds);
      if (!check.ok) return { ok: false, reason: check.reason ?? 'Cannot spend talent point' };
      state.char = doSpendTalent(state.char, talentId, ds);
      // Materialize any grant_spell (or grant_passive) unlocked by this rank immediately,
      // mirroring quest-reward and trainer learning. Also used on load for pre-existing points.
      let grantedNew = false;
      const tal = ds.talent(talentId);
      if (tal) {
        const newRank = ((state.char.talents ?? {})[talentId] as number) || 0;
        if (newRank >= 1) {
          const rankIdx = Math.min(newRank - 1, tal.ranks.length - 1);
          const rank = tal.ranks[rankIdx];
          for (const eff of (rank?.effects ?? [])) {
            if (eff.kind === 'grant_spell' && typeof (eff as any).spellId === 'number') {
              const sid = (eff as any).spellId as number;
              if (ds.spell(sid) && !knows(state.spellbook, sid)) {
                applyLearnSpell(state, sid, ds, Date.now());
                const lowers = lowerRanksFor(state.spellbook, sid, ds);
                if (lowers.length) {
                  for (const oldId of lowers) state.actionBars = replaceBarSpell(state.actionBars, oldId, sid);
                  if (state.rotation?.custom) {
                    state.rotation = upgradeSpellInRotation(state.rotation, lowers, sid);
                  }
                }
                grantedNew = true;
                log(`Talent granted ${ds.spell(sid)?.name ?? sid}.`);
              }
            }
            if (eff.kind === 'grant_passive' && rank) {
              const sid = rank.spellId;
              if (ds.spell(sid) && !knows(state.spellbook, sid)) {
                applyLearnSpell(state, sid, ds, Date.now());
                grantedNew = true;
              }
            }
          }
        }
      }
      if (grantedNew) {
        autofillPlayerBars(state, eligibleSpellIds());
        state.rotation = ensureLivePlayerRotation(
          state.rotation,
          state.char,
          state.spellbook,
          ds,
          state.inventory,
          { band: playerRotationBand() ?? null, role: state.squadRole },
        );
      }
      log('Talent point spent.');
      return { ok: true };
    },

    refundTalent(talentId) {
      const check = canRefundTalent(state.char, talentId, ds);
      if (!check.ok) return { ok: false, reason: check.reason ?? 'Cannot refund talent' };
      // Unlearn spells only this rank still uniquely granted (mirror spendTalent in reverse).
      const beforeGrants = talentGrantedSpellIds(state.char, ds);
      state.char = doRefundTalent(state.char, talentId, ds);
      const afterGrants = talentGrantedSpellIds(state.char, ds);
      const lost = new Set<number>();
      for (const id of beforeGrants) if (!afterGrants.has(id)) lost.add(id);
      unlearnTalentGrantedSpells(lost);
      log('Talent point refunded.');
      return { ok: true };
    },

    respec(nowMs) {
      const spent = spentPoints(state.char);
      if (spent === 0) return { ok: false, reason: 'No talents spent' };
      // Escalating trainer cost + 5g/month decay. Cite: Player.cpp:3715 resetTalentsCost.
      const now = nowMs ?? Date.now();
      const prevCost = state.resetTalentsCost ?? 0;
      const lastTime = state.resetTalentsTime ?? 0;
      // CMaNGOS: time_t months = (sWorld.GetGameTime() - m_resetTalentsTime) / MONTH;
      const months = Math.max(0, Math.floor((now - lastTime) / RESPEC_MONTH_MS));
      const cost = nextRespecCost(prevCost, months);
      if (state.char.gold < cost) return { ok: false, reason: 'Not enough gold' };
      // Snapshot talent grants before clearing points so we can unlearn them immediately.
      // Cite: Player.cpp:3742 resetTalents - removeSpell on every rank, then RemovePet.
      const granted = talentGrantedSpellIds(state.char, ds);
      state.char = { ...doRespec(state.char), gold: state.char.gold - cost };
      // Cite: Player.cpp:3793–3794 - m_resetTalentsCost = cost; m_resetTalentsTime = now.
      state.resetTalentsCost = cost;
      state.resetTalentsTime = now;
      unlearnTalentGrantedSpells(granted);
      // Cite: Player.cpp:3798 RemovePet(PET_SAVE_REAGENTS) after talent unlearn.
      if (state.char.pet) {
        const petName = state.char.pet.name;
        state.char = { ...state.char, pet: undefined };
        log(`You dismissed ${petName}.`);
      }
      log(`Talents reset for ${moneyMarked(cost)}.`);
      return { ok: true, cost };
    },

    respecCost,

    applyPremadeSpec(specIdx, nowMs) {
      const specs = ds.botSpecs(state.char.cls);
      if (specs.length === 0) return { ok: false, reason: 'No premade talent builds for this class' };
      if (!Number.isInteger(specIdx) || specIdx < 0 || specIdx >= specs.length) {
        return { ok: false, reason: 'Unknown talent build' };
      }
      const next = specs[specIdx]!;
      const want = talentsForSpec(next, state.char.cls, state.char.level, ds);
      return applyNamedTalents(want, next.name, nowMs);
    },

    saveTalentBuild(name, cls, link) {
      const cleanLink = typeof link === 'string' ? link.trim() : '';
      if (!cleanLink) return { ok: false, reason: 'Nothing to save' };
      if (!Number.isInteger(cls) || cls < 1) return { ok: false, reason: 'Unknown class' };
      const trees = ds.talentTrees(cls);
      if (!trees.length) return { ok: false, reason: 'No talent tree for that class' };
      const have = normalizeTalentBuilds(state.talentBuilds);
      if (have.length >= MAX_TALENT_BUILDS) {
        return { ok: false, reason: `At most ${MAX_TALENT_BUILDS} saved builds` };
      }
      const id = nextTalentBuildId(have);
      const savedName = uniqueTalentBuildName(have, sanitizeTalentBuildName(name));
      state.talentBuilds = [...have, { id, name: savedName, cls, link: cleanLink }];
      log(`Saved talent build ${savedName}.`);
      return { ok: true, id, name: savedName };
    },

    deleteTalentBuild(id) {
      const have = normalizeTalentBuilds(state.talentBuilds);
      const next = have.filter((b) => b.id !== id);
      if (next.length === have.length) return { ok: false, reason: 'No such talent build' };
      state.talentBuilds = next.length ? next : undefined;
      return { ok: true };
    },

    applyTalentBuild(id, nowMs) {
      const b = (state.talentBuilds ?? []).find((row) => row.id === id);
      if (!b) return { ok: false, reason: 'No such talent build' };
      if (b.cls !== state.char.cls) return { ok: false, reason: 'That build is for another class' };
      const want = talentsFromLink(b.link, state.char.cls, state.char.level, ds);
      if (!Object.values(want).some((n) => n > 0)) {
        return { ok: false, reason: `Nothing in that string fits a level ${state.char.level}` };
      }
      return applyNamedTalents(want, b.name, nowMs);
    },

    applyTalentLink(link, nowMs) {
      const clean = typeof link === 'string' ? link.trim() : '';
      if (!clean) return { ok: false, reason: 'Nothing to apply' };
      const want = talentsFromLink(clean, state.char.cls, state.char.level, ds);
      if (!Object.values(want).some((n) => n > 0)) {
        return { ok: false, reason: `Nothing in that string fits a level ${state.char.level}` };
      }
      return applyNamedTalents(want, 'this tree', nowMs);
    },
  };
}
