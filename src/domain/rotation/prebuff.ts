// The PRE-BUFF phase: the party buffs the player asks for by hand before a pull. Separate from
// `buffs`, which runs automatically at zone-in — a HoT there would drain every healer between packs.

import type { DataStore } from '../../data/dataStore.ts';
import type { SpellDef, SpellEffect } from '../../data/schema.ts';
import type { Character } from '../character/character.ts';
import { consumableFamilyOfEntry } from '../items/consumableFamily.ts';
import type { FinalizeContext } from './classes/hooks.ts';
import { keepUpAlreadyPresent } from '../../engine/spells/auraStacking.ts';
import type { RotationRule, RuleSpellTarget } from './types.ts';

// A pre-buff is a FRIENDLY spell leaving a timed aura on whoever it lands on, read off effect shapes
// so every rank is picked up. A plain direct heal is NOT one: it leaves nothing behind.
export function isPrebuffEffect(e: SpellEffect): boolean {
  if ((e as { hostile?: boolean }).hostile === true) return false;
  const dur = (e as { durationMs?: number }).durationMs ?? 0;
  if (e.kind === 'restore_health') {
    // Periodic only — a HoT ticks. A flat restore_health with no tick is a direct heal.
    return ((e as { tickMs?: number }).tickMs ?? 0) > 0 && dur > 0;
  }
  if (e.kind === 'school_absorb' || e.kind === 'damage_shield') return dur > 0;
  return false;
}

// EffectImplicitTargetA values naming a FRIENDLY unit other than the caster — the whole point of a
// pre-buff. Without this gate the phase filled with self-only toggles that already live in `buffs`.
const FRIENDLY_OTHER_IMPLICIT: ReadonlySet<number> = new Set([3, 21, 25, 35, 37, 45, 57, 58, 61]);

// SPELL_EFFECT_APPLY_AREA_AURA_PARTY. An area aura is a toggle on the caster that radiates, not a
// cast placed on each member, and it is already a buffs-phase keep-up.
const SPELL_EFFECT_APPLY_AREA_AURA_PARTY = 35;

/** True when this spell is worth putting on the party before a pull. */
export function isPrebuffSpell(sp: SpellDef | undefined): boolean {
  if (!sp) return false;
  // A spell whose baked effects are empty still builds them from rawEffects at runtime, so the
  // caller must hand us a RESOLVED SpellDef (resolveCombatSpell / ds.spell materialize).
  if (!(sp.effects ?? []).some(isPrebuffEffect)) return false;
  // A channel occupies the caster for its whole duration and ends when they move — Tranquility
  // and Health Funnel are not things you top the party up with before a pull.
  if ((sp.channelMs ?? 0) > 0) return false;
  const raw = sp.rawEffects ?? [];
  if (raw.some((r) => (r.effect | 0) === SPELL_EFFECT_APPLY_AREA_AURA_PARTY)) return false;
  return raw.some((r) =>
    FRIENDLY_OTHER_IMPLICIT.has((r.targetA ?? 0) | 0)
    || FRIENDLY_OTHER_IMPLICIT.has((r.targetB ?? 0) | 0));
}

/** Longest aura this pre-buff leaves, ms. 0 = until cancelled. */
export function prebuffDurationMs(sp: SpellDef): number {
  let d = 0;
  for (const e of sp.effects ?? []) {
    if (!isPrebuffEffect(e)) continue;
    const dur = (e as { durationMs?: number }).durationMs ?? 0;
    if (dur > d) d = dur;
  }
  return d;
}

// Seed the pre-buff phase from what this character knows, best rank per family, and leave a phase
// the player has touched exactly as it is. One rank per family — the highest they can cast.
export function ensurePrebuffRows(ctx: FinalizeContext): void {
  if (ctx.phases.prebuff.length > 0) return;
  const bestByName = new Map<string, SpellDef>();
  for (const sp of ctx.known) {
    if (!isPrebuffSpell(sp)) continue;
    // Already an automatic keep-up — a second row here would just double-cast it.
    if (ctx.usedSpellsByPhase.buffs.has(sp.id)) continue;
    const key = sp.name.trim().toLowerCase();
    const cur = bestByName.get(key);
    if (!cur || (sp.rank ?? 0) > (cur.rank ?? 0)) bestByName.set(key, sp);
  }
  // Cheapest first: a HoT the whole party can carry beats one expensive shield on one body.
  const rows = [...bestByName.values()].sort((a, b) => (a.cost ?? 0) - (b.cost ?? 0));
  for (const sp of rows) {
    ctx.phases.prebuff.push({
      id: ctx.nextFallbackId(),
      action: { kind: 'spell', spellId: sp.id },
      // No conditions: "who already has it" is the ORDER's job (prebuffPlan skips a live aura),
      // not a per-row gate — the row would have to name a target it does not know yet.
      conditions: [],
      enabled: true,
    });
    ctx.usedSpellsByPhase.prebuff.add(sp.id);
  }

  // The armour potion as a LADDER row: Greater Stoneshield when usable, Lesser below 46, nothing
  // below 33. It resolves against the bags at use time, so it is simply inert until one is carried.
  const armour = bestArmourPrebuffItem(ctx.char, ctx.ds);
  if (armour) {
    ctx.phases.prebuff.push({
      id: ctx.nextFallbackId(),
      action: { kind: 'item', itemEntry: armour.entry, family: armour.family },
      conditions: [],
      enabled: true,
    });
    ctx.usedItemsByPhase.prebuff.add(armour.entry);
  }
}

// ITEM_SUBCLASS_POTION. Stoneshield is a potion and the armour elixirs are the same subclass and the
// same decision, so both are in scope and the highest armour number wins.
const ITEM_SUBCLASS_POTION = 3;

// Best armour-granting consumable this character can use, as a family row. Data-driven off
// useBuff.mod === 'armor', so a new rank or source is picked up for free.
export function bestArmourPrebuffItem(
  char: Character,
  ds: DataStore,
): { entry: number; family: string } | null {
  let best: { entry: number; family: string; amount: number } | null = null;
  for (const it of ds.items()) {
    if (it.notObtainable || it.slot != null) continue;
    if ((it.itemSubclass ?? -1) !== ITEM_SUBCLASS_POTION) continue;
    if (it.useBuff?.mod !== 'armor') continue;
    if ((it.requiredLevel | 0) > char.level) continue;
    const amount = it.useBuff.amount | 0;
    if (amount <= 0 || (best && amount <= best.amount)) continue;
    const family = consumableFamilyOfEntry(it.entry, ds);
    if (!family) continue;
    best = { entry: it.entry, family, amount };
  }
  return best ? { entry: best.entry, family: best.family } : null;
}

/** One unit the pre-buff order can act on. */
export interface PrebuffUnit {
  /** Session side (`player` / `ally_N`). */
  side: string;
  name: string;
  dead: boolean;
  /** Group role, for a row that names one (`{ role: 'tank' }`). */
  role?: 'tank' | 'healer' | 'damage';
  /** Aura spell ids live on this unit right now. */
  auraSpellIds: ReadonlySet<number>;
}

/** One caster and the pre-buff rows it owns, in the player's authored order. */
export interface PrebuffCaster {
  side: string;
  name: string;
  dead: boolean;
  /** Enabled prebuff rules, top to bottom. */
  rules: readonly RotationRule[];
  /** Can this caster afford / currently cast `spellId`? */
  canCast: (spellId: number) => boolean;
  // Resolve an item row to the rung this unit CARRIES, plus the buff spell it grants — the aura the
  // order watches for. Null when no rung is carried; an absent provider skips item rows.
  resolveItem?: (
    family: string | null,
    fallbackEntry: number,
  ) => { entry: number; name: string; buffSpellId: number } | null;
}

// One queued step. An itemEntry means the caster DRINKS it on itself, since an armour potion is
// self-only, and `spellId` is the buff it grants — what the order watches for to know it landed.
export interface PrebuffCast {
  casterSide: string;
  casterName: string;
  spellId: number;
  spellName: string;
  targetSide: string;
  targetName: string;
  /** Cast time this step will occupy, ms (0 for an instant — still one GCD). */
  castMs: number;
  /** Mana the caster pays. Reported so the UI can say what an order costs. */
  cost: number;
  /** Item to use instead of casting. Its ladder is resolved before the plan is built. */
  itemEntry?: number;
}

/** Why a row produced no cast — surfaced so a silent no-op is impossible. */
export interface PrebuffSkip {
  casterName: string;
  spellName: string;
  reason: string;
}

export interface PrebuffPlan {
  casts: PrebuffCast[];
  skips: PrebuffSkip[];
}

// Who a pre-buff row lands on: every living party member by default. A row naming a role narrows to
// it, and the hostile-facing selectors fall back to the whole party rather than casting nothing.
function targetsForRow(
  target: RuleSpellTarget | undefined,
  units: readonly PrebuffUnit[],
): PrebuffUnit[] {
  if (target && typeof target === 'object' && 'role' in target) {
    return units.filter((u) => u.role === target.role);
  }
  return [...units];
}

// Build the ordered cast list for one Pre-buff order, caster-major then row. A unit already carrying
// the aura is skipped, so pressing Pre-buff twice costs nothing the second time.
export function prebuffPlan(
  casters: readonly PrebuffCaster[],
  units: readonly PrebuffUnit[],
  spellOf: (id: number) => SpellDef | undefined,
  chainOf?: (id: number) => { first: number; rank: number } | undefined,
): PrebuffPlan {
  // A rank is not a different buff: rank 5 Renew already ticking must not be re-cast as rank 9,
  // and another healer's rank counts too. Cite: Unit.cpp:5013-5015; keepUpAlreadyPresent.
  const covered = (ids: ReadonlySet<number>, id: number): boolean =>
    keepUpAlreadyPresent(ids, id, { spell: spellOf, ...(chainOf ? { chainOf } : {}) });
  const casts: PrebuffCast[] = [];
  const skips: PrebuffSkip[] = [];
  const living = units.filter((u) => !u.dead);
  /** Auras this plan will already have applied — so two casters do not both cast Renew on the tank. */
  const planned = new Map<string, Set<number>>();
  const willHave = (side: string, spellId: number): boolean =>
    planned.get(side)?.has(spellId) === true;
  const mark = (side: string, spellId: number): void => {
    const s = planned.get(side) ?? new Set<number>();
    s.add(spellId);
    planned.set(side, s);
  };

  for (const c of casters) {
    if (c.dead) continue;
    const self = living.find((u) => u.side === c.side);
    for (const rule of c.rules) {
      if (rule.enabled && rule.action.kind === 'item') {
        // An armour potion is drunk by its owner, on its owner. `resolveItem` walks the ladder
        // to the rung actually in this unit's bags; no rung, no step.
        if (!self) continue;
        const picked = c.resolveItem?.(rule.action.family ?? null, rule.action.itemEntry);
        if (!picked) {
          skips.push({ casterName: c.name, spellName: 'potion', reason: 'none carried' });
          continue;
        }
        if (covered(self.auraSpellIds, picked.buffSpellId) || willHave(self.side, picked.buffSpellId)) {
          skips.push({ casterName: c.name, spellName: picked.name, reason: 'already up' });
          continue;
        }
        casts.push({
          casterSide: c.side,
          casterName: c.name,
          spellId: picked.buffSpellId,
          spellName: picked.name,
          targetSide: self.side,
          targetName: self.name,
          castMs: 0,
          cost: 0,
          itemEntry: picked.entry,
        });
        mark(self.side, picked.buffSpellId);
        continue;
      }
      if (!rule.enabled || rule.action.kind !== 'spell') continue;
      const spellId = rule.action.spellId;
      const sp = spellOf(spellId);
      if (!sp) continue;
      if (!c.canCast(spellId)) {
        skips.push({ casterName: c.name, spellName: sp.name, reason: 'cannot cast it right now' });
        continue;
      }
      const wanted = targetsForRow(rule.action.target, living);
      let landed = 0;
      for (const u of wanted) {
        if (covered(u.auraSpellIds, spellId) || willHave(u.side, spellId)) continue;
        casts.push({
          casterSide: c.side,
          casterName: c.name,
          spellId,
          spellName: sp.name,
          targetSide: u.side,
          targetName: u.name,
          castMs: sp.castTimeMs ?? 0,
          cost: sp.cost ?? 0,
        });
        mark(u.side, spellId);
        landed++;
      }
      if (landed === 0) {
        skips.push({ casterName: c.name, spellName: sp.name, reason: 'everyone has it' });
      }
    }
  }
  return { casts, skips };
}
