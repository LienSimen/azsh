// Cast-driven creature summons: the one owner of "a spell with a summon effect puts a body on the
// floor". Before this the only injection always spawned enemy-side, so a player's Reaper was hostile.

import type { SpellDef } from '../../data/schema.ts';
import type { CombatContext } from './context.ts';
import type { Fighter } from './types.ts';
import type { EnemySide } from '../core/events.ts';
import type { SummonWorldPoint } from './combatGeometry.ts';
import { SPELL_SUMMON_IMAGES, scaleSkeramImages, closeImageSplitPhases } from './skeramImages.ts';
import { detCos, detSin } from '../core/detMath.ts';
import { durMs } from '../spells/interpreter/duration.ts';
import { SPELL_ATTR_EX, hasAttrEx } from '../spells/spellAttributes.ts';
import {
  effectUsesScriptDest,
  scriptTargetDestFor,
  type ScriptTargetDest,
} from '../spells/scriptTargetDest.ts';

/** One spawn order off a cast: N bodies of `creature`, alive for `durationMs` (0 = until killed). */
export interface CastSummonOrder {
  creature: number;
  count: number;
  durationMs: number;
  /** GUARDIAN_PET — follows the summoner at 1.5 yd instead of standing where it landed. */
  isGuardian: boolean;
  /** UNIT_CREATED_BY_SPELL, read by GuardianAI follow distance. */
  createdBySpell?: number;
  /** A creature-cast totem: self-casts its passive template spells the moment it lands. */
  isTotem?: boolean;
  /** Totem health off the summon effect's damage; 0 keeps the creature_template value. */
  totemHealth?: number;
}

/** Hard cap per cast. 17773 Summon Illusions is 15 bodies; nothing sourced exceeds that. */
const MAX_PER_CAST = 15;

// A creature body, not a player character. `summon_pet` is the warlock and hunter pet system on a
// player and a plain minion on a mob, so only mobs take it here.
function casterIsCreature(src: Fighter): boolean {
  return (src.spec.creatureEntry ?? 0) > 0;
}

// Spawn orders for one cast, read off the interpreted effects, with a rawEffects 41/42 fallback for
// hand-built fixtures whose effects never went through resolveCombatSpell.
export function planCastSummons(src: Fighter, spell: SpellDef): CastSummonOrder[] {
  const out: CastSummonOrder[] = [];
  const seen = new Set<number>();
  const add = (o: CastSummonOrder): void => {
    if (o.creature <= 0 || o.count <= 0) return;
    out.push({ ...o, count: Math.min(o.count, MAX_PER_CAST) });
    seen.add(o.creature);
  };
  for (const eff of spell.effects) {
    if (eff.kind === 'summon_wild') {
      add({ creature: eff.creature | 0, count: eff.count | 0, durationMs: eff.durationMs | 0, isGuardian: false });
    } else if (eff.kind === 'summon_guardian') {
      add({
        creature: eff.creature | 0,
        count: eff.count | 0,
        durationMs: eff.durationMs | 0,
        isGuardian: true,
        createdBySpell: spell.id,
      });
    } else if (eff.kind === 'summon_demon') {
      // EffectSummonDemon — a temporary minion for a mob caster, same shape as a guardian.
      add({
        creature: eff.creature | 0,
        count: Math.max(1, eff.count ?? 1),
        durationMs: eff.durationMs ?? 0,
        isGuardian: true,
        createdBySpell: spell.id,
      });
    } else if (eff.kind === 'summon_possessed') {
      add({
        creature: eff.creature | 0,
        count: 1,
        durationMs: eff.durationMs ?? 0,
        isGuardian: true,
        createdBySpell: spell.id,
      });
    } else if (eff.kind === 'summon_pet' && casterIsCreature(src)) {
      add({ creature: eff.creature | 0, count: 1, durationMs: 0, isGuardian: true, createdBySpell: spell.id });
    } else if (eff.kind === 'summon_totem' && casterIsCreature(src)) {
      // A CREATURE'S TOTEM IS A BODY ON ITS OWN SIDE, not one of the party's four slots: the totem
      // branch refuses a non-player caster, so Antu'sul's Healing Ward never existed at all.
      add({
        creature: eff.creature | 0,
        count: 1,
        durationMs: eff.durationMs | 0,
        isGuardian: true,
        createdBySpell: spell.id,
        isTotem: true,
        totemHealth: eff.health | 0,
      });
    }
  }
  if (out.length > 0) return out;
  // Where every scripted 41/42 summon lands (map-spell-effects.mjs:701 keeps them out of `effects`).
  // Duration is the spell's own; a 0 made all of them permanent. Cite: SpellEffects.cpp:2765, :2944.
  const rawLifeMs = durMs(spell.durationIndex) ?? 0;
  for (const r of spell.rawEffects ?? []) {
    const e = (r.effect ?? 0) | 0;
    if (e !== 41 && e !== 42) continue;
    const creature = (r.miscValue ?? 0) | 0;
    if (creature <= 0 || seen.has(creature)) continue;
    add({
      creature,
      count: Math.max(1, ((r.basePoints ?? 0) | 0) + 1),
      durationMs: rawLifeMs,
      isGuardian: e === 42,
      ...(e === 42 ? { createdBySpell: spell.id } : {}),
    });
  }
  return out;
}

// One cast resolves its summons once. `castOnTargets` runs applySpell and then the aura-on-apply
// pass and both reach this, so the first through wins and an effect-42 cast does not spawn twice.
const lastCast = new WeakMap<Fighter, { spellId: number; t: number }>();

/** True when this (caster, spell, tick) already spawned its bodies. */
function alreadyRan(src: Fighter, spell: SpellDef, t: number): boolean {
  const prev = lastCast.get(src);
  if (prev && prev.spellId === spell.id && prev.t === t) return true;
  lastCast.set(src, { spellId: spell.id, t });
  return false;
}

// The `radiusIndex` of every rawEffect that resolves its destination through script targeting, keyed
// by summoned creature: only rawEffects carry targetA/B, so the order is matched back by entry.
function scriptDestRadiusByCreature(spell: SpellDef): Map<number, number> {
  const out = new Map<number, number>();
  for (const r of spell.rawEffects ?? []) {
    const eff = (r.effect ?? 0) | 0;
    if (eff !== 41 && eff !== 42) continue;
    if (!effectUsesScriptDest(r)) continue;
    const creature = (r.miscValue ?? 0) | 0;
    if (creature > 0 && !out.has(creature)) out.set(creature, (r.radiusIndex ?? 0) | 0);
  }
  return out;
}

/** Caster's own position in world yards, or null on a pull-local session. */
function casterWorldPos(ctx: CombatContext, src: Fighter): { x: number; y: number } | null {
  const anchor = ctx.cfg.geometryAnchor;
  if (anchor?.frame !== 'world-translated' || !anchor.origin) return null;
  const local = ctx.posOf(src.side);
  if (!local) return null;
  return { x: anchor.origin.x + local.x, y: anchor.origin.y + local.y };
}

// Where body `index` of a dest-located summon lands: body 0 on the dest, every other one a
// GetRandomPoint draw around it off the session's seeded PRNG, so it replays bit-identically.
function destSummonPoint(ctx: CombatContext, dest: ScriptTargetDest, index: number): SummonWorldPoint {
  if (index === 0) return { x: dest.x, y: dest.y, mapVerified: true };
  const angle = ctx.rng.next() * 2 * Math.PI;
  const dist = ctx.rng.next() * dest.scatterYd;
  return {
    x: dest.x + dist * detCos(angle),
    y: dest.y + dist * detSin(angle),
    from: { x: dest.x, y: dest.y },
    mapVerified: true,
  };
}

// Put this cast's summons on the floor, on the caster's own side, and return the bodies that landed
// — empty when the spell summons nothing, the session cannot resolve one, or the roster is full.
export function runCastSummons(ctx: CombatContext, src: Fighter, spell: SpellDef): Fighter[] {
  const orders = planCastSummons(src, spell);
  if (orders.length === 0) return [];
  if (alreadyRan(src, spell, ctx.t)) return [];
  const inject = ctx.injectSummonForCaster;
  if (!inject) return [];
  const made: Fighter[] = [];
  // Player re-cast replaces its own guardians rather than stacking a second set (and eating
  // another ally seat). Cite: SpellEffects.cpp:2839–2851.
  const playerCaster = !casterIsCreature(src);
  if (playerCaster && hasAttrEx(spell, SPELL_ATTR_EX.DISMISS_PET_FIRST)) {
    for (const a of ctx.livingAllies()) {
      if (a.spec.summonOwnerSide === src.side && a.hp > 0 && a.spec.isGuardian) {
        a.hp = 0;
        a.summonDespawnAt = 0;
        ctx.deathEmitted.add(a.side);
        ctx.push({ t: ctx.t, kind: 'despawn', actor: a.side });
        ctx.bumpRoster?.();
      }
    }
  }
  const scriptDest = scriptDestRadiusByCreature(spell);
  const near = scriptDest.size > 0 ? casterWorldPos(ctx, src) : null;
  for (const o of orders) {
    if (playerCaster && o.isGuardian && o.createdBySpell) {
      ctx.unsummonFriendlyGuardians?.(src, o.creature, o.createdBySpell);
    }
    // TARGET_LOCATION_SCRIPT_NEAR_CASTER: the bodies belong at the room point the spell's script
    // target row names, not at the summoner's feet. Null means no row and no map anchor, so feet.
    const radiusIndex = scriptDest.get(o.creature);
    const dest = radiusIndex != null && near
      ? scriptTargetDestFor({ spellId: spell.id, radiusIndex, mapId: ctx.cfg.geometryAnchor?.mapId, near })
      : null;
    for (let i = 0; i < o.count; i++) {
      const add = inject(src, o.creature, o.durationMs, dest ? destSummonPoint(ctx, dest, i) : undefined);
      if (!add) break; // roster full / unresolvable entry — do not spin the rest of the count
      if (o.isGuardian) {
        add.spec.isGuardian = true;
        if (o.createdBySpell) add.spec.createdBySpell = o.createdBySpell;
      }
      if (o.isTotem) {
        add.spec.isTotem = true;
        // `if (damage) SetMaxHealth(damage)` — a totem is a 5 hp stick, not the 484 hp its
        // creature_template carries. Zero keeps the DB value. Cite: SpellEffects.cpp:4538-4542.
        const hp = (o.totemHealth ?? 0) | 0;
        if (hp > 0) {
          add.spec.maxHealth = hp;
          add.spec.startHealth = hp;
          add.hp = hp;
        }
      }
      made.push(add);
    }
  }
  // TOTEM_PASSIVE casts every spell on the totem's own list at itself the moment it lands, and the
  // first kit spell decides the type. That self-cast is what makes a healing ward heal.
  if (orders.some((o) => o.isTotem) && made.length > 0) {
    const applySpell = ctx.applySpell;
    if (applySpell) {
      for (const body of made) {
        const kit = body.spec.spells ?? [];
        const primary = kit[0];
        if (!primary || (primary.castTimeMs | 0) > 0) continue; // TOTEM_ACTIVE: TotemAI casts it
        for (const ability of kit) applySpell(body, body, ability);
      }
    }
  }
  // Cite: boss_skeram.cpp:342-362 — the image init is a spell script on the summon, so it runs
  // here rather than in the IR (the IR has no per-body stat verb).
  if ((spell.id | 0) === SPELL_SUMMON_IMAGES) {
    scaleSkeramImages(src, made);
    // Same lookup eventAi.ts:248 makes for a creature's own cast state.
    closeImageSplitPhases(made, (f) => ctx.enemyCastBySide.get(f.side as EnemySide)?.scriptDev);
  }
  return made;
}
