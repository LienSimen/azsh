// Peeled from createSession (Wave 4 createSession.md P4) — pattern (D).
// ensurePlayerFocus / foeOf / hostileTargetOf / selectTarget* / nearestPartyInAcquire.

import type { CombatContext } from './context.ts';
import type { Fighter } from './types.ts';
import type { EnemySide, Side, TotemSide } from '../core/events.ts';
import { isAllySide, isEnemySide, isTotemSide } from '../core/events.ts';
import type { CombatantId } from './threat.ts';
import type { SpellDef } from '../../data/schema.ts';
import {
  TARGET_T,
  selectHighestHpAmongTopThreat,
  type SelectTargetFriendly,
  type SelectTargetHostile,
} from '../../domain/creature/aiTargeting.ts';
import { killOrderEntryMatches, killOrderTakesCharmed } from '../../domain/rotation/killOrder.ts';
import { buildSelectTargetCtx, resolveSelectTargetFighter } from './aiTargetResolve.ts';
import { isPlayerCharacterTarget } from './castTargetGates.ts';
import { MIN_AGGRO_DISTANCE } from '../../domain/creature/creatureAi.ts';
import { CHARGE_INTERCEPT_MAX_YD, combatDistanceYd, MELEE_REACH_YD, sameStoreyYd } from './combatGeometry.ts';
import { AURA_DECREASE_SPEED } from '../../domain/nav/speed.ts';

export type SessionFocusDeps = {
  dead: (f: Fighter) => boolean;
};

export function installSessionFocus(ctx: CombatContext, deps: SessionFocusDeps): void {
  const dead = deps.dead;
  const {
    player, enemies, pet, allies, totems, cfg, rng,
  } = ctx;

  let displacedFocus: Fighter | null = null;

  // Resolve the player's focus to a living legal hostile, keeping a sticky one while it is valid and
  // otherwise preferring native enemies over charmed bodies. On the endless floor, never stick a passive.
  const ensurePlayerFocus = (): Fighter => {
    // Free-player viewer for sticky/hostile checks (charmed player is enemy-faction).
    const freeViewer =
      !ctx.isCharmed(player) ? player
      : ctx.livingAllies().find((a) => !ctx.isCharmed(a))
        ?? (pet && !dead(pet) && !ctx.isCharmed(pet) ? pet : null)
        ?? player;
    let playerFocus = ctx.playerFocusFighter;
    // A focus pushed off by an untargetable hide comes back once it can be hit again. Jandice's 8 s
    // Spread left the player on her illusions for the rest of the fight. A click elsewhere forgets it.
    if (displacedFocus) {
      const clickedAway = ctx.explicitEnemyFocus != null && playerFocus.side === ctx.explicitEnemyFocus
        && playerFocus !== displacedFocus;
      if (dead(displacedFocus) || clickedAway) {
        displacedFocus = null;
      } else if (
        !ctx.isUnattackable(displacedFocus)
        && ctx.factionOfFighter(displacedFocus) !== ctx.factionOfFighter(freeViewer)
      ) {
        playerFocus = displacedFocus;
        ctx.playerFocusFighter = displacedFocus;
        displacedFocus = null;
      }
    }
    // A focus that CANNOT be killed loses its stickiness the moment something killable is in the pull.
    // On Majordomo the sticky branch returned the boss all fight and the reselect never ran.
    const stickyIsWasted = ctx.isUnkillableEnemy?.(playerFocus) === true
      && ctx.livingHostilesFor(freeViewer).some(
        (h) => h !== playerFocus && !ctx.isUnkillableEnemy!(h),
      );
    // Same gap for healers: init locks onto enemies[0], so preferFocusHostile never ran. Cite:
    // PlayerbotClassAI.cpp:659 GetBotJob; sessionPools preferFocusHostile.
    // `groupRole` is an ARENA seat's role; a raid add carrying it re-aimed the party (see
    // sessionPools preferFocusHostile). The creature's own armed kit still counts everywhere.
    const isHealerSeat = (h: Fighter): boolean =>
      (cfg.enemiesAreATeam === true && h.spec.groupRole === 'healer')
      || ctx.enemyCastBySide.get(h.side as EnemySide)?.healer === true;
    // A CLICK WINS. GetBotJob picks a BOT's target; it never re-aims the one the player asked for.
    // Cite: PlayerbotClassAI.cpp:659; the endless branch below already reads explicitEnemyFocus.
    const stickyIsClicked = ctx.explicitEnemyFocus != null && playerFocus.side === ctx.explicitEnemyFocus;
    const stickyMissesHealer = !stickyIsClicked
      && !isHealerSeat(playerFocus)
      && ctx.livingHostilesFor(freeViewer).some((h) => h !== playerFocus && isHealerSeat(h));
    // Arena: do not stick a healer past Charge/Intercept 25 yd when a closer body exists.
    // Cite: PlayerbotWarriorAI.cpp:175-176; sessionPools preferFocusHostile.
    const stickyDist = ctx.distanceBetween(freeViewer, playerFocus);
    const stickyHealerOutOfReach = cfg.enemiesAreATeam === true
      && isHealerSeat(playerFocus)
      && stickyDist != null
      && stickyDist > CHARGE_INTERCEPT_MAX_YD
      && ctx.livingHostilesFor(freeViewer).some((h) => {
        if (h === playerFocus) return false;
        const d = ctx.distanceBetween(freeViewer, h);
        return d != null && d <= CHARGE_INTERCEPT_MAX_YD;
      });
    // Sticky: current focus still a living legal hostile for free friendlies.
    if (
      !stickyIsWasted
      && !stickyMissesHealer
      && !stickyHealerOutOfReach
      && !dead(playerFocus)
      && !ctx.isUnattackable(playerFocus)
      && ctx.factionOfFighter(playerFocus) !== ctx.factionOfFighter(freeViewer)
    ) {
      // Endless floor: don't keep sticky on a random passive unless player clicked it.
      if (
        !cfg.endless
        || !isEnemySide(playerFocus.side)
        || ctx.enemyHasThreat!(playerFocus)
        || (ctx.explicitEnemyFocus != null && playerFocus.side === ctx.explicitEnemyFocus)
      ) {
        return playerFocus;
      }
    }
    // Free reselect: endless = only threat-bearing; normal pulls = any living hostile.
    const pool = ctx.livingHostilesFor(freeViewer).filter(
      (h) => !cfg.endless || !isEnemySide(h.side) || ctx.enemyHasThreat!(h),
    );
    let next = ctx.preferFocusHostile!(pool, freeViewer);
    // Possessed body can miss the acquire pool (storey / cache) while the boss is
    // unattackable — still the only legal burn target (Anastari 17250 vanish).
    if (!next) {
      const charmed = ctx.partyUnits().find(
        (u) => !dead(u) && ctx.isCharmed(u) && !ctx.isUnattackable(u),
      );
      if (charmed) next = charmed;
    }
    if (next) {
      if (!displacedFocus && !dead(playerFocus) && ctx.isUnattackable(playerFocus) && isEnemySide(playerFocus.side)) {
        displacedFocus = playerFocus;
      }
      playerFocus = next;
      ctx.playerFocusFighter = next;
      if (ctx.explicitEnemyFocus != null && next.side !== ctx.explicitEnemyFocus) {
        ctx.explicitEnemyFocus = null;
      }
    } else if (cfg.endless) {
      // No free-fire hostiles: stand down. Leaving playerFocus on a corpse side re-armed
      // keep-set / free-fire when that slot was recycled as a passive (controller-farpull A).
      ctx.explicitEnemyFocus = null;
      playerFocus = player;
      ctx.playerFocusFighter = player;
    }
    return playerFocus;
  };

  let foeTick = -1;
  const foeCache = new Map<string, Fighter>();
  const foeOf = (f: Fighter): Fighter => {
    if (ctx.t !== foeTick) {
      foeCache.clear();
      foeTick = ctx.t;
    }
    const cached = foeCache.get(f.side);
    if (cached && (cached === f || (!dead(cached) && !ctx.isUnattackable(cached)))) return cached;
    const resolved = foeOfResolve(f);
    foeCache.set(f.side, resolved);
    return resolved;
  };
  const foeOfResolve = (f: Fighter): Fighter => {
    // Charmed / side-switched: attack former friends (dumb hostile), first legal hostile.
    // Cite: TakeCharmOf PetAI vs friends; not smart tank AI.
    if (ctx.isCharmed(f) || ctx.factionOfFighter(f) !== ctx.nativeFactionOf!(f.side)) {
      const hostiles = ctx.livingHostilesFor(f);
      return hostiles[0] ?? f;
    }
    if (isEnemySide(f.side)) return hostileTargetOf(f);
    // The pet bar's react and command state decides what the pet may swing at, before any party rule.
    // Passive never picks a victim, aggressive takes anything it sees, and defensive assists the owner.
    if (f.side === 'pet') {
      // Recalled: no victim at all until it is home, not even the one attacking it.
      // Cite: PetAI.cpp:188-197 (UpdateAI returns before any attack logic), :480 AttackedBy.
      if (ctx.petRetreating) return f;
      const manual = ctx.petManualTarget;
      if (manual != null) {
        const mf = ctx.sideFighter?.(manual) ?? null;
        if (mf && !dead(mf) && !ctx.isUnattackable(mf)) return mf;
        ctx.petManualTarget = null;
      }
      if (ctx.petReact === 'passive') return f;
      // COMMAND_STAY suppresses the owner assist (PetAI.cpp:380 `!staying &&`), so a staying
      // defensive pet swings only at what is already swinging at IT.
      if (ctx.petCommand === 'stay' && ctx.petReact !== 'aggressive') {
        for (const h of ctx.freeFireHostilesFor!(f)) {
          if (!dead(h) && hostileTargetOf(h) === f) return h;
        }
        return f;
      }
      if (ctx.petReact === 'aggressive') {
        const seen = ctx.livingHostilesFor(f);
        const free = ctx.freeFireHostilesFor!(f);
        // In-combat hostiles first (the pull we are in), then anything else in range.
        if (free.length > 0) return ctx.preferFocusHostile!(free, f) ?? free[0]!;
        if (seen.length > 0) return ctx.preferFocusHostile!(seen, f) ?? seen[0]!;
        return f;
      }
    }
    // Free player-faction: only free-fire hostiles (combat + explicit target).
    // Cite: endless floor passive stream — livingHostilesFor alone pulls every near spawn.
    const facHostiles = ctx.freeFireHostilesFor!(f);
    if (facHostiles.length > 0) {
      // A companion tank picks up loose mobs: a hostile whose victim is a non-tank friendly outranks
      // the player's focus. Hard-CC'd mobs are skipped. A manual takeover target outranks both.
      if (isAllySide(f.side)) {
        const manualSide = ctx.allyManualTarget.get(f.side);
        if (manualSide != null) {
          const mf = facHostiles.find((h) => h.side === manualSide);
          if (mf) return mf;
          ctx.allyManualTarget.delete(f.side);
        }
      }
      // Present only on a unit that FOLLOWS the order — one place decides, and the main tank is excluded
      // by never being handed a list. Re-testing the role here refused every off-tank told to peel.
      const order = f.killOrderEntries;
      if (order?.length) {
        // Same walk pickAction runs, including the charmed-ally term - two answers to one order
        // is what section 0c rule 4 forbids.
        const mine = isEnemySide(f.side);
        for (const entry of order) {
          const hit = facHostiles.find((h) => !dead(h) && (
            killOrderTakesCharmed(entry | 0, ctx.isCharmed(h), isEnemySide(h.side) === mine)
            || killOrderEntryMatches(entry | 0, h.spec.creatureEntry ?? 0)
          ));
          if (hit) return hit;
        }
      }
      // Tank peel, the PLAYER included: the human tanking a pull picks up the mob eating the healer just
      // as a companion tank does. Their own click still wins, the same precedence a companion has.
      if (f.spec.groupRole === 'tank'
        && (isAllySide(f.side) || (f.side === 'player' && ctx.explicitEnemyFocus == null))) {
        // Peel priority: a mob eating the HEALER outranks one on a DPS. BOUNDED BY WHAT THIS UNIT MAY
        // CROSS — with no distance term the tank left for a mob 40 yd away, and a leashed one just stood.
        const peelYd = cfg.partyFollowYd ?? cfg.friendlyHoldYd ?? cfg.acquireRangeYd ?? Infinity;
        let loose: Fighter | null = null;
        for (const h of facHostiles) {
          if (!isEnemySide(h.side)) continue;
          if ((ctx.isControlledHard as ((u: Fighter) => boolean) | undefined)?.(h)) continue;
          if (ctx.enemyHasThreat && !ctx.enemyHasThreat(h)) continue;
          if (Number.isFinite(peelYd)) {
            const d = ctx.distanceBetween(f, h);
            if (d != null && d > peelYd) continue;
          }
          const victimRole = hostileTargetOf(h).spec.groupRole;
          if (victimRole === 'tank') continue;
          if (victimRole === 'healer') { loose = h; break; }
          loose ??= h;
        }
        if (loose) return loose;
      }
      // The player's focus drives the free party, so white swings and casts follow click-to-target.
      // Without it the pack's FIRST member absorbed every hit while the frame moved.
      const focus = ensurePlayerFocus();
      if (facHostiles.includes(focus)) return focus;
      return ctx.preferFocusHostile!(facHostiles, f) ?? facHostiles[0]!;
    }
    // No free-fire hostiles means stand down. Returning a corpse focus made the party swing at air after
    // every pull, and a latched ally target has to be released here too or an empty floor keeps it.
    if (isAllySide(f.side) && ctx.allyManualTarget.has(f.side)) {
      ctx.allyManualTarget.delete(f.side);
    }
    return f;
  };

  // The nearest living party body inside acquire range of this enemy, or null. Multi-sensor floor aggro
  // must seed on THAT body — a player-only acquire refused the seed while detection cancelled the walk.
  const nearestPartyInAcquire = (enemySide: string): CombatantId | null => {
    const acq = cfg.acquireRangeYd;
    const unitPositionsMutable = ctx.unitPositionsMutable;
    if (acq == null || !unitPositionsMutable) return 'player';
    const at = unitPositionsMutable[enemySide];
    if (!at) return 'player';
    let best: CombatantId | null = null;
    let bestD = Infinity;
    const consider = (id: CombatantId, u: Fighter): void => {
      if (dead(u) || ctx.isCharmed(u)) return;
      const from = unitPositionsMutable![id];
      if (!from) return;
      if (!sameStoreyYd(at, from)) return;
      const d = combatDistanceYd(at, from);
      if (d != null && d <= acq && d < bestD) {
        bestD = d;
        best = id;
      }
    };
    consider('player', player);
    if (pet) consider('pet', pet);
    for (const al of ctx.allyBlock()) consider(al.side as CombatantId, al);
    return best;
  };

  // Resolve a threat-list id to a living Fighter, or null. One cached map hit where the branches used to
  // scan: this runs per threat entry per mob per tick, 3.8% of tick self time at 40 allies.
  const fighterByThreatId = (id: CombatantId | null): Fighter | null => {
    if (!id) return null;
    if (id === 'player') return dead(player) ? null : player;
    if (id === 'pet') return pet && !dead(pet) ? pet : null;
    // The pools install unconditionally at session build, so the store is always there by the time
    // anything calls this. The array-scan branches below it were a SECOND, unreachable answer.
    const roster = ctx.sideFighter;
    if (roster && (isAllySide(id) || isEnemySide(id) || isTotemSide(id as Side))) {
      const hit = roster(id as Side);
      return hit && !dead(hit) ? hit : null;
    }
    if (isTotemSide(id as Side)) {
      const tot = totems.get(id as TotemSide);
      return tot && !dead(tot) ? tot : null;
    }
    return null;
  };

  // One enemy's victim from its threat manager, sticky. An empty list on a fresh pull prefers a living
  // party tank, else the player. Always the true top threat — gap-close closes the distance.
  const hostileTargetOf = (enemyF: Fighter): Fighter => {
    // An ARENA seat is a player, not a mob: it picks its target the way the player faction does
    // (`preferFocusHostile`, healers first) rather than off a creature threat list. Only an arena
    // passes the flag, so every dungeon and raid pull still reads threat. Cite: sessionPools
    // preferFocusHostile; PlayerbotClassAI.cpp:659 GetBotJob.
    if (cfg.enemiesAreATeam && enemyF.spec.classId != null) {
      const pool = ctx.livingHostilesFor(enemyF).filter((h) => !ctx.isUnattackable(h, enemyF));
      const pick = pool.length > 0 ? ctx.preferFocusHostile!(pool, enemyF) : null;
      if (pick) return pick;
    }
    const tm = ctx.threatOf(enemyF);
    // Missing TM (player/ally/pet/totem or lookup miss): empty-list fallback, never throw.
    if (tm) {
      // Drop dead and unattackable entries so nothing sticks on a corpse or a phase-shifted pet. Ids,
      // not cloned rows: the clone spread every hate list once a tick just to read an id.
      const ids = tm.getThreatIds();
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i]!;
        const unit = fighterByThreatId(id);
        if (!unit || ctx.isUnattackable(unit, enemyF)) tm.remove(id);
      }
      // Real melee-reach predicate: a ranged/healer challenger must exceed 1.3× (not 1.1×)
      // before ripping aggro (ThreatManager.cpp:398–411). Geometry absent → melee (legacy).
      const id = tm.getHostileTarget((challengerId) => {
        const cf = fighterByThreatId(challengerId);
        if (!cf || ctx.isUnattackable(cf, enemyF)) return true;
        const d = ctx.distanceBetween(enemyF, cf);
        return d == null || d <= MELEE_REACH_YD + 1e-6;
      });
      const f = fighterByThreatId(id);
      // A threat victim is kept at ANY distance: the C++ has no distance term, and only feign death
      // takes a reference offline. Distance ends a chase through evade, never through re-targeting.
      if (f && !ctx.isUnattackable(f, enemyF)) return f;
    }
    if (cfg.acquireRangeYd != null) {
      const near = ctx.livingHostilesFor(enemyF)[0];
      if (near) return near;
    }
    // Empty threat — open on the party's tank, player first when that is their role.
    // Skip unattackable (phased Imp) so MOD_UNATTACKABLE is not a free tank.
    if (player.hp > 0 && !ctx.isUnattackable(player, enemyF) && player.spec.groupRole === 'tank') return player;
    for (const al of ctx.livingAllies()) {
      if (!ctx.isUnattackable(al, enemyF) && al.spec.groupRole === 'tank') return al;
    }
    if (player.hp > 0 && !ctx.isUnattackable(player, enemyF)) return player;
    for (const al of ctx.livingAllies()) {
      if (!ctx.isUnattackable(al, enemyF)) return al;
    }
    // Last resort: original player seat (may be dead) — better than a phased pet.
    return player;
  };

  /** Snapshot + selectTarget resolve for EventAI / spell-list / ScriptDev (S2 D5). */
  const selectTargetLookup = (caster: Fighter) => (id: string): Fighter | null => {
    if (id === player.side) return player;
    const fromThreat = fighterByThreatId(id);
    if (fromThreat) return fromThreat;
    const fromHostiles = ctx.livingHostilesFor(caster).find((h) => h.side === id);
    if (fromHostiles) return fromHostiles;
    const fromPack = ctx.livingEnemies().find((e) => e.side === id);
    if (fromPack) return fromPack;
    const al = isAllySide(id) ? ctx.sideFighter?.(id) ?? null : null;
    return al && al.hp > 0 ? al : null;
  };
  // FriendlyEligibleDispelInRangeCheck with empty masks: in combat AND immobilized, snared, frozen or
  // crowd-controlled, never "carries a debuff". Cite: GridNotifiers.h:923; UnitAI.cpp:764-771.
  const isEligibleDispelFriendly = (f: Fighter): boolean => {
    const t = ctx.t;
    // IsInCombat(): an add that has not engaged is no dispel target in the C++ either.
    if (ctx.threatOf(f)?.isEmpty() !== false) return false;
    if (f.rootedUntil > t || f.stunnedUntil > t || f.fearedUntil > t || f.incapUntil > t) return true;
    for (const e of ctx.effectsOn(f.side)) {
      if (e.kind !== 'speed') continue;
      if ((e.aura ?? 0) !== AURA_DECREASE_SPEED) continue;
      if ((e.pct ?? 0) < 0) return true;
    }
    return false;
  };

  const selectTargetCtxFor = (
    caster: Fighter, spellId = 0, selectClass = 0, friendlyMaxRangeYd = 0,
    requireInMelee = false,
  ) => {
    const victim = hostileTargetOf(caster);
    const hostiles: SelectTargetHostile[] = ctx.livingHostilesFor(caster).map((h) => ({
      id: h.side,
      // SELECT_FLAG_PLAYER is TYPEID_PLAYER. A companion pet and a summoned guardian both hold
      // an `ally_N` seat, so `isAllySide` alone read both as players. Cite: Unit.cpp:12069.
      isPlayer: isPlayerCharacterTarget(h),
      classId: h.spec.classId,
      powerType: h.spec.powerType,
      casting: h.castingSpell != null,
      inMelee: (() => {
        const d = ctx.distanceBetween(caster, h);
        return d != null && d <= MIN_AGGRO_DISTANCE;
      })(),
      hpPct: h.hp / Math.max(1, h.spec.maxHealth),
      distanceYd: ctx.distanceBetween(caster, h) ?? undefined,
      hasAura: (id: number) => h.buffActive.has(id),
    }));
    // Faction-relative support pool (not "always the pack"): charmed former-allies
    // drop out of friendlyPoolOf; player casters see livingFriendlies-equivalent.
    const friendlies: SelectTargetFriendly[] = ctx.friendlyPoolOf(caster).map((ally) => ({
      id: ally.side,
      isSelf: ally.side === caster.side,
      hpPct: ally.hp / Math.max(1, ally.spec.maxHealth),
      hasAura: (id: number) => ally.buffActive.has(id),
      hasDispellable: isEligibleDispelFriendly(ally),
      distanceYd: ctx.distanceBetween(caster, ally) ?? undefined,
    }));
    return buildSelectTargetCtx({
      caster,
      victimId: victim.side,
      threatList: ctx.threatOf(caster)?.getThreatIds().slice() ?? [],
      hostiles,
      friendlies,
      playerSide: player.side,
      spellId,
      ...(selectClass > 0 ? { selectClass } : {}),
      ...(friendlyMaxRangeYd > 0 ? { friendlyMaxRangeYd } : {}),
      ...(requireInMelee ? { requireInMelee: true } : {}),
      rng,
    });
  };
  // Non-cast EventAI (REMOVEAURAS, ATTACK_START, …): full TARGET_T via selectTarget.
  // Cite: CreatureEventAI.cpp ProcessAction GetTargetByType. Fail → SELF/self else victim.
  const resolveEventAiTargetFighter = (summoner: Fighter, targetSel: number): Fighter => {
    const mode = targetSel | 0;
    const got = resolveSelectTargetFighter(
      mode,
      selectTargetCtxFor(summoner),
      'eventai',
      selectTargetLookup(summoner),
      summoner,
    );
    if (got) return got;
    if (mode === TARGET_T.SELF) return summoner;
    return hostileTargetOf(summoner);
  };
  // Cast path: null on failure → caller keeps current victim.
  const resolveEventAiCastTarget = (
    caster: Fighter,
    spell: SpellDef,
    mode: number,
    source: 'eventai' | 'spell_list' = 'eventai',
    selectClass = 0,
    friendlyMaxRangeYd = 0,
    requireInMelee = false,
  ): Fighter | null =>
    resolveSelectTargetFighter(
      mode,
      selectTargetCtxFor(caster, spell.id, selectClass, friendlyMaxRangeYd, requireInMelee),
      source,
      selectTargetLookup(caster),
      caster,
    );
  const resolveHighestHpTopThreat = (caster: Fighter, topN: number): Fighter | null => {
    const res = selectHighestHpAmongTopThreat(selectTargetCtxFor(caster), topN, true);
    if (!res.ok || res.id == null) return null;
    return selectTargetLookup(caster)(res.id);
  };

  /**
   * A team match does not stop because a seat fell. `seedAttackStart` opens every enemy on ONE body
   * (createSession.ts:213-226), and when that body dies the list empties, `enemyEngaged` reads
   * not-engaged and the unit stands still for the rest of the match — measured 17,600 idle ticks to
   * the 30 min cap in a 2v2. So a player-shaped enemy with an empty list re-opens on the nearest
   * living hostile, the same `addThreatDirectly(id, 1)` the seed uses. Off by default: a CREATURE
   * with nobody on its list is supposed to stand down and walk home (HomeMovementGenerator).
   */
  const reacquireEmptyThreat = (): number => {
    let reopened = 0;
    for (const ef of ctx.livingEnemies()) {
      const tm = ctx.threatOf(ef);
      if (!tm || !tm.isEmpty()) continue;
      const pool = ctx.livingHostilesFor(ef).filter((h) => !ctx.isUnattackable(h, ef));
      const next = ctx.preferFocusHostile!(pool, ef) ?? pool[0];
      if (!next) continue;
      tm.addThreatDirectly(next.side, 1, false);
      reopened++;
    }
    return reopened;
  };

  ctx.ensurePlayerFocus = ensurePlayerFocus;
  ctx.foeOf = foeOf;
  ctx.hostileTargetOf = hostileTargetOf;
  ctx.reacquireEmptyThreat = reacquireEmptyThreat;
  ctx.nearestPartyInAcquire = nearestPartyInAcquire;
  ctx.fighterByThreatId = fighterByThreatId;
  ctx.resolveEventAiTargetFighter = resolveEventAiTargetFighter;
  ctx.resolveEventAiCastTarget = resolveEventAiCastTarget;
  // DoSelectLowestHpFriendly: the lowest-hp friendly within radiusYd missing at least minDeficit hp,
  // self included. Cite: UnitAI.cpp DoSelectLowestHpFriendly; boss_sulfuron_harbinger.cpp:162.
  const resolveLowestHpFriendly = (
    caster: Fighter, radiusYd: number, minDeficit: number,
  ): Fighter | null => {
    let best: Fighter | null = null;
    let bestPct = Infinity;
    for (const ally of ctx.friendlyPoolOf(caster)) {
      if (dead(ally)) continue;
      const max = Math.max(1, ally.spec.maxHealth);
      if (max - ally.hp < Math.max(1, minDeficit)) continue;
      if (ally.side !== caster.side) {
        const d = ctx.distanceBetween(caster, ally);
        if (d != null && d > radiusYd) continue;
      }
      const pct = ally.hp / max;
      if (pct < bestPct) {
        bestPct = pct;
        best = ally;
      }
    }
    return best;
  };

  ctx.resolveHighestHpTopThreat = resolveHighestHpTopThreat;
  ctx.resolveLowestHpFriendly = resolveLowestHpFriendly;
}
