// Peeled from createSession (Wave 4 createSession.md P1) — pattern (D).
// armEnemyCastState + inject/summon/despawn + ScriptDev onAggro-once.

import type { CombatContext, EnemyCastState } from './context.ts';
import type { CombatantSpec, Fighter } from './types.ts';
import type { ScriptDevAction } from '../../domain/scriptdev/types.ts';
import type { Rng } from '../core/rng.ts';
import type { Side, EnemySide } from '../core/events.ts';
import {
  allySideAt, enemyIndexOfSide, enemySideAt, isAllySide, isEnemySide, MAX_ALLIES,
} from '../core/events.ts';
import { castableKitIds } from './castableKit.ts';
import { CREATURE_STATIC_FLAGS } from '../../domain/creature/creatureAiConstants.ts';
import { UNIT_FLAG } from '../../domain/creature/unitFlags.ts';
import { allowStoneskinGargoyleStoneForm } from '../../domain/scriptdev/naxxramas.ts';
import type { SpellDef, CreatureCastEntry } from '../../data/schema.ts';
import {
  armCreatureCastSlots,
  armEventAiState,
  spawnOocSelfAuras,
  castEntriesFromAiScripts,
  enrichCastEntriesFromScripts,
  hasCreatureCastSchedule,
  mergeCastEntriesWithSpellList,
  warnScheduleLessCreatureSpecial,
} from '../../domain/creature/creatureAi.ts';
import {
  armScriptDevRuntime,
  lifecycleActions,
  scriptDevByCreature,
  scriptDevScheduleForEntry,
} from '../../domain/scriptdev/index.ts';
import { ThreatManager, type CombatantId } from './threat.ts';
import {
  injectEnemySlotPosition,
  isEnemyCasterKit,
  summonSpawnPosition,
  type CombatPosYd,
  type SummonWorldPoint,
} from './combatGeometry.ts';
import { applyForceDespawn, combatMovementFlavor } from './forceDespawnAction.ts';
import { makeFighter } from './fighterFactory.ts';
import { clampDisplacementToFloor, displaceFloorFromCfg } from './displaceFloor.ts';

export type SessionInjectDeps = {
  dead: (f: Fighter) => boolean;
  /** Resolve nearest living party side inside acquire for AttackStart seed. */
  nearestPartyInAcquire: (enemySide: string) => CombatantId | null;
  hostileTargetOf: (enemyF: Fighter) => Fighter;
  /** Materialize kit for combat (createSession local or barrel). */
  materializeSpecForCombat: (raw: CombatantSpec) => CombatantSpec;
};

/** Arm per-enemy cast / EventAI / ScriptDev state. Pure of session bag (rng + t). */
export function armEnemyCastState(
  ef: Fighter,
  rng: Rng,
  outResetActions?: ScriptDevAction[],
  t = 0,
): EnemyCastState {
  const spellById = new Map<number, SpellDef>(ef.spec.spells.map((s) => [s.id, s]));
  const scripts = ef.spec.ai?.scripts;
  // A PLAYER-CLASS BODY on an enemy seat - a duelist, an arena seat, a BG playerbot - is driven by
  // its Rotation and carries no creature schedule, so its class kit is not a D4 defect. Same reason
  // castableKit refuses to filter one. Cite: castableKit.ts:46-48; pickAction.ts:2915.
  const playerBody = ef.spec.classId != null;
  // S7: prefer top-level spellList; fall back to FE1 nest when only extract path ran.
  const spellList =
    ef.spec.spellList ??
    ef.spec.ai?.spellLists ??
    null;
  // S9: ScriptDev IR schedule when creature is bound (and cast list not already ScriptDev-shaped).
  const sdPlan =
    ef.spec.creatureEntry != null
      ? scriptDevScheduleForEntry(ef.spec.creatureEntry)
      : null;
  const sdIr =
    ef.spec.creatureEntry != null
      ? scriptDevByCreature(ef.spec.creatureEntry) ?? null
      : null;
  let entries: CreatureCastEntry[];
  if (ef.spec.creatureCasts && ef.spec.creatureCasts.length > 0) {
    // Rehydrate FRIENDLY_* / FACING / etc. params from full ai.scripts rows.
    // Drop schedule-less bare `{spellId}` rows (D4) — keep EventAI / MAIN_SPELL / ScriptDev.
    const enriched = enrichCastEntriesFromScripts(ef.spec.creatureCasts, scripts);
    const scheduled = enriched.filter(hasCreatureCastSchedule);
    if (scheduled.length < enriched.length) {
      const dropped = enriched.filter((e) => !hasCreatureCastSchedule(e)).map((e) => e.spellId);
      if (!playerBody) warnScheduleLessCreatureSpecial(ef.spec.name, dropped);
    }
    entries = scheduled;
  } else if (sdPlan && sdPlan.castEntries.length > 0) {
    // Bare kit + ScriptDev binding — arm IR timers (GAPS C.4).
    entries = [...sdPlan.castEntries];
    for (const sid of sdPlan.spellIds) {
      if (spellById.has(sid)) continue;
      const sp = ef.spec.spells.find((s) => s.id === sid);
      if (sp) spellById.set(sid, sp);
    }
  } else if (scripts && scripts.length > 0) {
    // CAST rows only — do not fall back to bare tpl spells (D4).
    entries = castEntriesFromAiScripts(scripts);
  } else if (spellList && spellList.length > 0) {
    // Spell-list-only kit — arm via mergeCastEntriesWithSpellList below.
    // Cite: UnitAI.cpp UpdateSpellLists; arm via castEntriesFromSpellList.
    entries = [];
  } else {
    // Bare tpl kit, no schedule from any source → melee auto only (D4).
    if (ef.spec.spells.length > 0 && !playerBody) {
      warnScheduleLessCreatureSpecial(
        ef.spec.name,
        ef.spec.spells.map((s) => s.id),
      );
    }
    entries = [];
  }
  // Append the spell-list timer slots, the same path the cast entries take. NOT when a ScriptDev IR owns
  // the schedule: the IR IS the port of those rows, so merging the bake arms each ability twice.
  if (!sdPlan?.castEntries.length) {
    // ChanceRangedAttack is the base chance in ranged mode and chance - 50 in melee, so the
    // creature's own auto-attack mode decides it. Cite: UnitAI.cpp:1227-1230.
    entries = mergeCastEntriesWithSpellList(entries, spellList, rng, ef.mode === 'ranged');
  }
  const eventAi = armEventAiState(scripts, rng);
  // Melee is disabled in the constructor for a no-melee critter, so 71 templates never have it to begin
  // with. The 30 s flee itself is armed on combat entry, not here.
  if (((ef.spec.staticFlags ?? 0) & CREATURE_STATIC_FLAGS.NO_MELEE_FLEE) !== 0) {
    eventAi.meleeEnabled = false;
  }
  // Reset and constructor verbs that must land before the first swing. The action applier is not
  // installed at arm time, so death prevention, health percentage and set_unattackable mirror here.
  if (sdIr) {
    for (const act of lifecycleActions(sdIr, 'onReset')) {
      if (act.kind === 'set_death_prevention') {
        eventAi.deathPrevention = act.enabled;
        if (act.enabled) eventAi.deathPreventionFired = false;
      } else if (act.kind === 'set_health_pct') {
        const pct = Math.max(0, Math.min(100, act.pct));
        ef.hp = Math.floor(ef.spec.maxHealth * (pct / 100));
      } else if (act.kind === 'set_unattackable') {
        // Same as applyScriptDevCombatActions. Cite: naxxramas.cpp:998-1000; boss_thaddius.cpp:112.
        const entry = (ef.spec.creatureEntry ?? 0) | 0;
        if (!allowStoneskinGargoyleStoneForm(entry, ef.spec.movementType)) continue;
        ef.unattackableUntil = Math.max(ef.unattackableUntil, t + 3_600_000);
        eventAi.unitFlags |= UNIT_FLAG.UNINTERACTIBLE;
      } else if (
        act.kind === 'cast_self'
        && (act.spellId | 0) === 29154
        && !allowStoneskinGargoyleStoneForm((ef.spec.creatureEntry ?? 0) | 0, ef.spec.movementType)
      ) {
        continue;
      } else if (outResetActions) {
        outResetActions.push(act);
      }
    }
  }
  return {
    fighter: ef,
    slots: armCreatureCastSlots(entries, spellById, rng),
    // Drawn here so the OOC rows keep their arm-order place in the rng stream, applied by the
    // caller once ctx.applySpell exists (createSession / injectEnemySpec).
    spawnAuras: spawnOocSelfAuras(entries, spellById, rng),
    pendingSlot: null,
    // Open on the first in-combat evaluation: m_spellListCooldown is cleared by SetSpellList.
    // Cite: UnitAI.cpp:1180-1181.
    spellListPollAt: 0,
    eventAi,
    scriptDev: sdIr ? armScriptDevRuntime(sdIr) : null,
    healer: entriesCarryHeal(entries, spellById),
  };
}

// Does this creature's SCHEDULED kit heal? Read off the armed entries and their baked spells — a heal
// effect or a periodic heal aura — so the answer is the creature's own data and never its name.
function entriesCarryHeal(
  entries: readonly CreatureCastEntry[],
  spellById: Map<number, SpellDef>,
): boolean {
  for (const e of entries) {
    const s = spellById.get(e.spellId);
    if (!s) continue;
    if (s.effects?.some((fx) => fx.kind === 'heal')) return true;
    if (s.rawEffects?.some((r) => {
      const eff = r.effect | 0;
      // 67 HEAL_MAX_HEALTH, but not one aimed only at the caster: Thekal Transform 24169 tops HIM up
      // at the phase change and that is a survival beat, not a healer's kit. 62 sat here in its place
      // by a miscount and read all 46 Mana Burn casters as healers (Feugen 28135 Static Field).
      // Cite: SpellEffectDefines.h:36,88,93; SpellTargetDefines.h:25 TARGET_UNIT_CASTER.
      if (eff === 67) return (r.targetA | 0) !== 1 || (r.targetB | 0) !== 0;
      if (eff === 10) return true;
      return eff === 6 && (r.auraName | 0) === 8;
    })) return true;
  }
  return false;
}

export function installSessionInject(ctx: CombatContext, deps: SessionInjectDeps): void {
  const { dead, nearestPartyInAcquire, hostileTargetOf, materializeSpecForCombat } = deps;

  // Two branches: the summon-table row when the action carries one, else the summoner's own feet at
  // contact distance. Nothing without geometry, and the inject then keeps its slot-ring fallback.
  const summonPositionFor = (
    summoner: Fighter,
    worldPos?: SummonWorldPoint,
  ): { position: CombatPosYd } | null => {
    if (!ctx.unitPositionsMutable) return null;
    const at = ctx.posOf(summoner.side);
    const feet = (): { position: CombatPosYd } | null => {
      if (!at) return null;
      // Fan repeats: guardians already out is a stable, RNG-free slot index.
      const slot = ctx.guardianSidesBySummoner.get(summoner.side)?.size ?? 0;
      return { position: summonSpawnPosition(at, slot) };
    };
    if (worldPos) {
      const o = ctx.cfg.geometryAnchor?.frame === 'world-translated'
        ? ctx.cfg.geometryAnchor.origin
        : undefined;
      // pull-local offsets carry no world bearing, so a world point cannot be translated
      // into them — fall through to the summoner rather than draw a convincing lie.
      if (o) {
        const pos = { x: worldPos.x - o.x, y: worldPos.y - o.y };
        // Summon rows are map-absolute, so a wrong map yields multi-kilometre offsets. The cap is the
        // largest baked call-for-help radius. A script-target dest skips it — it was read off this map.
        if (at && !worldPos.mapVerified) {
          const dx = pos.x - at.x;
          const dy = pos.y - at.y;
          if (dx * dx + dy * dy > 100 * 100) return feet();
        }
        // Scatter points are a raw GetRandomPoint ring, so clamp them out from the walkable
        // centre they were drawn around — §5 displacement rule, not a raster fallback.
        if (worldPos.from) {
          const from = { x: worldPos.from.x - o.x, y: worldPos.from.y - o.y };
          return {
            position: clampDisplacementToFloor(from, pos, displaceFloorFromCfg(ctx.cfg)),
          };
        }
        return { position: pos };
      }
    }
    return feet();
  };

  // A seat the other side of the tick seam already named. Free or dead here is the allocation the helper
  // would have made; a living unit in it is a diverged roster, and an error rather than a second body.
  const forcedSeat = (side: string, isBlock: (s: Side) => boolean): Side => {
    if (!isBlock(side as Side)) throw new Error(`forced seat ${side} is outside its block`);
    const cur = ctx.sideFighter?.(side as Side);
    if (cur && cur.hp > 0) throw new Error(`forced seat ${side} holds a living ${cur.spec.name}`);
    return side as Side;
  };

  // The mid-fight inject core, arming the cast scheduler and the threat manager and seeding threat on
  // the player. Positioned by the geometry slot helper when the map is live, or by an explicit point.
  const injectEnemySpec = (
    raw: CombatantSpec,
    opts?: {
      summonerSide?: Side;
      creatureId?: number;
      position?: CombatPosYd;
      /** When true, skip AttackStart threat seed (CALL_FOR_HELP may re-engage). */
      passive?: boolean;
      side?: string;
    },
  ): Fighter | null => {
    if (ctx.ended) return null;
    const effects = ctx.effects;
    // Endless floor: recycle a dead enemy seat so a multi-pull does not grow the array forever. Off the
    // STORE — the seat is named, not indexed, and the helper answers "first dead seat, else the next".
    const seat = opts?.side != null
      ? forcedSeat(opts.side, isEnemySide)
      : ctx.freeSeatIn!(isEnemySide, enemySideAt, () => true, Number.POSITIVE_INFINITY);
    if (seat == null) return null;
    const side = seat as EnemySide;
    const recycling = ctx.sideFighter?.(side) != null;
    const add: Fighter = makeFighter(side, materializeSpecForCombat(raw));
    ctx.rosterSeatEnemy!(side, add);
    if (recycling) {
      // Recycled slot: prior despawn/death must not suppress this unit's death event.
      ctx.deathEmitted.delete(side);
      // A recycled slot is a NEW creature on an old side string: the corpse's onAggro
      // stamp would otherwise suppress this one's Aggro() for the rest of the run.
      aggroLifecycleEmitted.delete(side);
      aggroLifecyclePending.delete(side);
      // Strip side-keyed auras/DoTs so a recycled passive does not inherit the corpse's
      // Rend / SW:P and re-open combat (probe-controller-farpull E).
      for (let i = effects.length - 1; i >= 0; i--) {
        const ae = effects[i]!;
        if (ae.target === side || ae.source === side) effects.splice(i, 1);
      }
      // Drop player/ally commitments that named the corpse slot.
      if (ctx.explicitEnemyFocus === side) ctx.explicitEnemyFocus = null;
      for (const [as, tgt] of [...ctx.allyManualTarget.entries()]) {
        if (tgt === side) ctx.allyManualTarget.delete(as);
      }
      // playerFocus stays typed Fighter — leave it; ensurePlayerFocus reselects if dead.
    }
    const tm = new ThreatManager(side);
    ctx.threatByOwner.set(side, tm);
    const pendingResetActs: ScriptDevAction[] = [];
    const armed = armEnemyCastState(add, ctx.rng, pendingResetActs, ctx.t);
    ctx.enemyCastBySide.set(side, armed);
    // A floor spawn walks in wearing what its OOC rows put on it at spawn, same as the pull did.
    // Cite: CreatureEventAI.cpp:1404-1410 JustRespawned; :216-218 TIMER_OOC CheckEvent.
    for (const sp of armed.spawnAuras) ctx.applySpell?.(add, add, sp);
    if (pendingResetActs.length) ctx.applyScriptDevCombatActions?.(add, pendingResetActs);
    // Watch for this unit's Aggro(). A floor spawn never exists at the session's first tick,
    // so without this its onAggro row can never run. Only bosses carry one.
    {
      const e = (add.spec.creatureEntry ?? 0) | 0;
      const ir = e ? scriptDevByCreature(e) : null;
      if (ir && (lifecycleActions(ir, 'onAggro').length > 0 || ir.damageHealMirror)) {
        aggroLifecyclePending.add(side);
      }
    }
    // Geometry: place first so AttackStart can refuse out-of-range seeds.
    if (opts?.position) {
      if (!ctx.unitPositionsMutable) {
        ctx.unitPositionsMutable = {};
      }
      ctx.unitPositionsMutable[side] = ctx.placeEnemyAt!(opts.position);
    } else if (ctx.unitPositionsMutable) {
      // Per-INJECT, not per-tick: the same split the initial seed makes, so a mid-fight spawn
      // and an opening pack cannot disagree about the same body.
      const caster = isEnemyCasterKit(add.spec.spells, {
        maxPower: add.spec.maxPower,
        castable: castableKitIds(add, ctx.spellOf),
      });
      // A spawn-ring SLOT, so the ordinal is the answer and not a lookup in disguise - the same
      // category as combatGeometry.meleeOrbitSlot. Cite: ENGINE-REBUILD E1.1.
      ctx.unitPositionsMutable[side] = injectEnemySlotPosition({
        enemyIndex: enemyIndexOfSide(side), isCaster: caster,
      });
    }
    // Spawn coord = the evade home until combat opens. A recycled slot must overwrite the
    // corpse's home, never inherit it. Cite: HomeMovementGenerator.cpp:51 GetRespawnCoord.
    const placed = ctx.unitPositionsMutable?.[side];
    if (placed) ctx.enemyHomeYd?.set(side, { ...placed });
    else ctx.enemyHomeYd?.delete(side);
    // AttackStart only when a living party body is inside local acquisition, gated on the NEAREST member
    // rather than the player: multi-sensor detection can pull a mob the player is 46 yd from.
    if (!opts?.passive) {
      const seedOn = nearestPartyInAcquire(side);
      if (seedOn) tm.addThreatDirectly(seedOn, 1, false);
    }
    if (opts?.summonerSide) {
      let set = ctx.guardianSidesBySummoner.get(opts.summonerSide);
      if (!set) {
        set = new Set();
        ctx.guardianSidesBySummoner.set(opts.summonerSide, set);
      }
      set.add(side);
      // The summoned-unit event on the SUMMONER, carrying the summoned entry so a row that names one can
      // filter. Cite: CreatureEventAI.cpp SummonedCreature, the sibling of the just-died hook.
      const summoner = ctx.sideFighter?.(opts.summonerSide);
      if (summoner) {
        ctx.notifyEventAiSummoned?.(summoner, (opts.creatureId ?? add.spec.creatureEntry ?? 0) | 0, false);
      }
    }
    ctx.push({
      t: ctx.t,
      kind: 'summon',
      actor: opts?.summonerSide ?? 'enemy',
      side,
      creatureId: opts?.creatureId ?? add.spec.creatureEntry ?? 0,
      name: add.spec.name,
    });
    return add;
  };

  // VE mid-fight inject: resolve creatureId → spec, then injectEnemySpec. Cite: CreatureEventAI.cpp
  // ACTION_T_SPAWN ~810–826 AttackStart(target).
  const injectEnemySummon = (
    summoner: Fighter,
    creatureId: number,
    durationMs: number,
    /** Explicit spawn point in WORLD yards (ACTION_T_SUMMON_ID param3, or a script-target dest). */
    worldPos?: SummonWorldPoint,
    /** False for a TARGET_T_SELF row: the body spawns and does not open. Cite: CreatureEventAI.cpp:1023. */
    opts?: { attackStart?: boolean },
  ): Fighter | null => {
    const resolve = ctx.cfg.resolveSummon;
    if (!resolve) return null;
    const raw = resolve(creatureId);
    if (!raw) return null;
    const attackStart = opts?.attackStart !== false;
    const add = injectEnemySpec(raw, {
      summonerSide: summoner.side,
      creatureId,
      ...(attackStart ? {} : { passive: true }),
      ...(summonPositionFor(summoner, worldPos) ?? {}),
    });
    if (!add) return null;
    // A timed despawn, where zero means it lives until killed. Voiding this piled Antu'sul's totems up
    // one per cast forever — measured ten-plus live sides in 47 s.
    if (durationMs > 0) add.summonDespawnAt = ctx.t + durationMs;
    // A summon opens on its summoner's victim even when placed outside acquire range: the table points
    // sit 75 yd out, and the gated seed left Antu'sul's broodlings idle for the whole fight.
    const tm = attackStart ? ctx.threatByOwner.get(add.side) : undefined;
    if (tm && tm.isEmpty()) {
      const victim = hostileTargetOf(summoner);
      if (victim && !dead(victim)) tm.addThreatDirectly(victim.side, 1, false);
    }
    // JustSummoned — summoned casts on self (Spread 17772). Cite: boss_jandice_barov.cpp:52-55.
    const summonerEntry = (summoner.spec.creatureEntry ?? 0) | 0;
    const summonerIr = summonerEntry > 0 ? scriptDevByCreature(summonerEntry) : undefined;
    const summonedEntry = creatureId | 0;
    for (const act of summonerIr?.lifecycle?.justSummoned ?? []) {
      if ('creatureEntry' in act && act.creatureEntry != null && act.creatureEntry !== summonedEntry) continue;
      if (act.kind === 'attack_summoner') {
        const tm = ctx.threatByOwner.get(add.side);
        if (tm) tm.addThreatDirectly(summoner.side, 1_000_000, false);
        continue;
      }
      if (act.kind === 'attack_random') {
        // Cite: boss_jeklik.cpp:155-156 SelectAttackingTarget(RANDOM) + AttackStart.
        const tm = ctx.threatByOwner.get(add.side);
        if (!tm) continue;
        const pool: Fighter[] = [];
        // Pet LAST, and the order is load-bearing: `rng.int` picks an INDEX into this pool, so
        // `partyUnits()` (pet second) would draw a different unit. Cite: ENGINE-REBUILD E1.1.
        if (!dead(ctx.player)) pool.push(ctx.player);
        for (const a of ctx.livingAllies()) pool.push(a);
        if (ctx.pet && !dead(ctx.pet)) pool.push(ctx.pet);
        if (pool.length === 0) continue;
        const tgt = pool[ctx.rng.int(0, pool.length - 1)]!;
        tm.modifyAllThreatPercent(-100);
        tm.addThreatDirectly(tgt.side, 1, false);
        tm.setCurrentVictimByTarget(tgt.side);
        ctx.push({ t: ctx.t, kind: 'attack_start', actor: add.side, target: tgt.side });
        continue;
      }
      if (act.kind === 'mirror_summoner_health') {
        // The image's max is a fraction of the SUMMONER's max, chosen by the summoner's own percent,
        // and its current health is that same percent. Cite: boss_skeram.cpp:342-364.
        const max = Math.max(1, summoner.spec.maxHealth);
        const pct = Math.max(0, Math.min(100, (summoner.hp / max) * 100));
        let frac = 0;
        for (const band of act.bands) {
          if (pct < band.belowPct) {
            frac = band.fracOfMax;
            break;
          }
        }
        if (frac > 0) {
          add.spec.maxHealth = Math.max(1, Math.floor(max * frac));
          add.hp = Math.max(1, Math.floor(add.spec.maxHealth * (pct / 100)));
          ctx.push({
            t: ctx.t,
            kind: 'flavor',
            text: `${add.spec.name} splits off at ${Math.round(pct)}% of ${summoner.spec.name}.`,
          });
        }
        continue;
      }
      if (act.kind !== 'cast_self') continue;
      const sp =
        add.spec.spells.find((s) => s.id === act.spellId)
        ?? summoner.spec.spells.find((s) => s.id === act.spellId);
      if (!sp) continue;
      const applySpell = ctx.applySpell as
        | ((src: Fighter, tgt: Fighter, spell: SpellDef) => void)
        | undefined;
      if (applySpell) applySpell(add, add, sp);
      else {
        ctx.push({
          t: ctx.t,
          kind: 'aura',
          actor: add.side, // the 'aura' event's actor IS the holder; it has no target field
          name: sp.name,
          spellId: sp.id,
          applied: true,
        });
      }
    }
    return add;
  };

  const forceDespawnEnemy = (ef: Fighter): void => {
    if (dead(ef)) return;
    ef.hp = 0;
    // Despawn ≠ kill: suppress checkDeaths so stream GC / ForcedDespawn do not fire
    // death events (and death SFX) for units that simply left the pool.
    ctx.deathEmitted.add(ef.side);
    ctx.push({ t: ctx.t, kind: 'despawn', actor: ef.side });
  };

  /** Once-per-side ScriptDev lifecycle.onAggro (createSession is always engaged). */
  const aggroLifecycleEmitted = new Set<string>();
  // Sides that carry an on-aggro script and have not opened combat yet. The continuous floor opens on a
  // DEAD shell and streams spawns in after, so a first-tick sweep matched nothing and 114 were dead code.
  const aggroLifecyclePending = new Set<EnemySide>();
  const runScriptDevAggroLifecycle = (ef: Fighter): void => {
    if (aggroLifecycleEmitted.has(ef.side)) return;
    aggroLifecycleEmitted.add(ef.side);
    const entry = (ef.spec.creatureEntry ?? 0) | 0;
    if (!entry) return;
    const bossIr = scriptDevByCreature(entry);
    // Twin damage/heal mirror — wrap onDamaged/onHealed at pull (after crowdControl install).
    if (bossIr?.damageHealMirror) ctx.ensureDamageHealMirrorHooks?.();
    const t = ctx.t;
    for (const act of bossIr ? lifecycleActions(bossIr, 'onAggro') : []) {
      if (act.kind === 'set_combat_movement') {
        // Cite: UnitAI.cpp:301-318 SetCombatMovement; westfall.cpp:229-232 Daphne Aggro.
        // combatMovement= must stay near this kind check (census WIRING_SIDE_EFFECT_RE).
        const ocs = ctx.enemyCastBySide.get(ef.side as EnemySide);
        if (ocs) ocs.eventAi.combatMovement = act.enabled;
        ctx.push({ t, kind: 'flavor', text: combatMovementFlavor(ef.spec.name, act.enabled) });
      } else if (act.kind === 'flavor') {
        void act; // internal port note, not player copy
      } else if (act.kind === 'force_despawn') {
        // Cite: Creature::ForcedDespawn; npcs_special.cpp:987-991 EnterEvade ForcedDespawn.
        // forceDespawnEnemy passed by name keeps the census WIRING_SIDE_EFFECT_RE token here.
        applyForceDespawn(act, ef, t, {
          forceDespawnEnemy,
          enemyCastBySide: ctx.enemyCastBySide,
          push: ctx.push,
        });
      } else {
        // cast_self / cast_on_group / set_instance_data / set_death_prevention / yell / …
        // Cite: boss_vaelastrasz.cpp:152-153 Aggro Essence of the Red via shared apply.
        ctx.applyScriptDevCombatActions?.(ef, [act]);
      }
    }
  };

  // Release a side from its summoner's guardian set. Without this the set only grows: the spawn slot is
  // its size, so every re-summon landed a ring further out and a recycled seat kept its OLD owner.
  const releaseGuardianSide = (side: Side): void => {
    for (const [owner, owned] of ctx.guardianSidesBySummoner) {
      if (!owned.delete(side)) continue;
      if (owned.size === 0) ctx.guardianSidesBySummoner.delete(owner);
      return;
    }
  };

  // The seat half of a friendly inject, taking a spec rather than a summon id. Both the summon path
  // below and `injectAllySpec` (a battleground guard walking into the player's fight) land here, so
  // seat recycling, the guardian set and the side-keyed aura strip have exactly one implementation.
  const seatFriendly = (
    ownerSide: Side,
    raw: import('./types.ts').CombatantSpec,
    creatureId?: number,
    forced?: string,
  ): Fighter | null => {
    if (ctx.ended) return null;
    // Recycle a dead seat we created ourselves, never a party member's: theirs holds a corpse the party
    // can still resurrect, and the UI indexes party frames by seat.
    const seat = forced != null
      ? forcedSeat(forced, isAllySide)
      : ctx.freeSeatIn!(
        isAllySide,
        allySideAt,
        (a) => a.spec.summonOwnerSide != null,
        MAX_ALLIES,
      );
    if (seat == null) return null;
    const side = seat;
    const recycling = ctx.sideFighter?.(side) != null;
    const add = makeFighter(side, materializeSpecForCombat(raw));
    add.spec.summonOwnerSide = ownerSide;
    if (creatureId != null) add.spec.creatureEntry ??= creatureId;
    ctx.rosterSeatAlly!(side, add);
    if (recycling) {
      releaseGuardianSide(side);
      ctx.deathEmitted.delete(side);
      for (let i = ctx.effects.length - 1; i >= 0; i--) {
        const ae = ctx.effects[i]!;
        if (ae.target === side || ae.source === side) ctx.effects.splice(i, 1);
      }
      ctx.allyManualTarget.delete(side);
    }
    ctx.unitItems.set(side, []);
    ctx.unitItemCd.set(side, new Map());
    ctx.unitItemsSpent.set(side, new Map());
    let owned = ctx.guardianSidesBySummoner.get(ownerSide);
    if (!owned) {
      owned = new Set();
      ctx.guardianSidesBySummoner.set(ownerSide, owned);
    }
    owned.add(side);
    return add;
  };

  // Add an ally body from a spec, at a world point. The battleground counterpart of injectEnemySpec:
  // AV's own guards, marshals and general fight on the player's side and have to be real seats to do it.
  const injectAllySpec = (
    raw: import('./types.ts').CombatantSpec,
    opts?: { ownerSide?: Side; position?: CombatPosYd; side?: string },
  ): Fighter | null => {
    const add = seatFriendly(opts?.ownerSide ?? 'player', raw, raw.creatureEntry, opts?.side);
    if (!add) return null;
    if (opts?.position && ctx.unitPositionsMutable) {
      ctx.unitPositionsMutable[add.side] = opts.position;
    }
    ctx.push({
      t: ctx.t,
      kind: 'summon',
      actor: opts?.ownerSide ?? 'player',
      side: add.side,
      creatureId: raw.creatureEntry ?? 0,
      name: add.spec.name,
    });
    return add;
  };

  const injectFriendlySummon = (
    summoner: Fighter,
    creatureId: number,
    durationMs: number,
    worldPos?: SummonWorldPoint,
  ): Fighter | null => {
    if (ctx.ended) return null;
    const raw = ctx.cfg.resolveSummon?.(creatureId);
    if (!raw) return null;
    const add = seatFriendly(summoner.side, raw, creatureId);
    if (!add) return null;
    const side = add.side;
    const placed = summonPositionFor(summoner, worldPos);
    if (placed && ctx.unitPositionsMutable) {
      ctx.unitPositionsMutable[side] = placed.position;
    }
    if (durationMs > 0) add.summonDespawnAt = ctx.t + durationMs;
    ctx.push({
      t: ctx.t,
      kind: 'summon',
      actor: summoner.side,
      side,
      creatureId,
      name: add.spec.name,
    });
    return add;
  };

  // Route a cast's summon to the summoner's OWN side. Faction, not side string, so a charmed body summons
  // for whoever holds it. Cite: Unit.cpp TakeCharmOf SetFactionTemporary.
  const injectSummonForCaster = (
    summoner: Fighter,
    creatureId: number,
    durationMs: number,
    worldPos?: SummonWorldPoint,
  ): Fighter | null => (
    ctx.factionOfFighter(summoner) === 'enemy'
      ? injectEnemySummon(summoner, creatureId, durationMs, worldPos)
      : injectFriendlySummon(summoner, creatureId, durationMs, worldPos)
  );

  // TEMPSPAWN timed despawn for friendly summons — runEnemyEventAi owns the enemy copy and never runs for
  // an ally seat. Cite: SpellEffects.cpp:2765.
  const expireFriendlySummons = (): void => {
    const t = ctx.t;
    for (const a of ctx.livingAllies()) {
      if (a.spec.summonOwnerSide == null) continue;
      if (a.summonDespawnAt == null || a.summonDespawnAt <= 0 || t < a.summonDespawnAt) continue;
      a.summonDespawnAt = 0;
      a.hp = 0;
      releaseGuardianSide(a.side);
      ctx.deathEmitted.add(a.side);
      ctx.push({ t, kind: 'despawn', actor: a.side });
      ctx.bumpRoster!();
    }
    // A summon that was KILLED never runs the branch above, so free its slot here or the
    // spawn ring keeps widening for the rest of an endless floor.
    for (const a of ctx.allyBlock()) {
      if (a.spec.summonOwnerSide != null && !(a.hp > 0)) releaseGuardianSide(a.side);
    }
  };

  // A second direct cast unsummons this caster's guardians of the same entry, which is also what keeps a
  // re-cast from eating a fresh ally seat. The C++ also skips triggered casts; that half is not modelled.
  const unsummonFriendlyGuardians = (
    owner: Fighter,
    creatureId: number,
    createdBySpell: number,
  ): number => {
    let n = 0;
    for (const a of ctx.livingAllies()) {
      if (a.spec.summonOwnerSide !== owner.side) continue;
      if (((a.spec.creatureEntry ?? 0) | 0) !== (creatureId | 0)) continue;
      if (((a.spec.createdBySpell ?? 0) | 0) !== (createdBySpell | 0)) continue;
      a.hp = 0;
      a.summonDespawnAt = 0;
      releaseGuardianSide(a.side);
      ctx.deathEmitted.add(a.side);
      ctx.push({ t: ctx.t, kind: 'despawn', actor: a.side });
      n++;
    }
    if (n > 0) ctx.bumpRoster!();
    return n;
  };

  ctx.injectEnemySpec = injectEnemySpec;
  ctx.injectEnemySummon = injectEnemySummon;
  ctx.injectFriendlySummon = injectFriendlySummon;
  ctx.injectAllySpec = injectAllySpec;
  ctx.unsummonFriendlyGuardians = unsummonFriendlyGuardians;
  ctx.injectSummonForCaster = injectSummonForCaster;
  ctx.expireFriendlySummons = expireFriendlySummons;
  ctx.forceDespawnEnemy = forceDespawnEnemy;
  // Fire onAggro for any watched side that has since entered combat. Cheap: the set only ever holds units
  // whose creature entry has an onAggro IR, which is bosses.
  const pumpScriptDevAggroLifecycle = (): void => {
    if (aggroLifecyclePending.size === 0) return;
    for (const side of [...aggroLifecyclePending]) {
      const ef = ctx.sideFighter?.(side) ?? null;
      if (!ef) {
        aggroLifecyclePending.delete(side);
        continue;
      }
      if (dead(ef)) continue; // a corpse can still be recycled into a live slot
      const tm = ctx.threatByOwner.get(side);
      if (!tm || tm.isEmpty()) continue;
      aggroLifecyclePending.delete(side);
      runScriptDevAggroLifecycle(ef);
    }
  };

  ctx.runScriptDevAggroLifecycle = runScriptDevAggroLifecycle;
  ctx.pumpScriptDevAggroLifecycle = pumpScriptDevAggroLifecycle;
}
