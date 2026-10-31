// Peeled from createSession (Wave 4 createSession.md P3) — pattern (D).
// Roster/pool gens, living* pools, fightersOrder/bySide, free-fire / livingCombatEnemies.

import type { CombatContext } from './context.ts';
import { ALLY_HEAL_THRESHOLD } from './types.ts';
import type { Fighter } from './types.ts';
import type { EnemySide, Side } from '../core/events.ts';
import { isAllySide, isEnemySide, isTotemSide, type TotemSide } from '../core/events.ts';
import { CREATURE_STATIC_FLAGS2 } from '../../domain/creature/creatureAiConstants.ts';
import { navSightClear } from './navSight.ts';
import { CHARGE_INTERCEPT_MAX_YD, sameStoreyYd } from './combatGeometry.ts';

export type SessionPoolsDeps = {
  /** Same liveness rule as createSession `dead` (`!(hp > 0)`). */
  dead: (f: Fighter) => boolean;
  // The seats createSession dealt, in order, ONCE. Nothing keeps them: `bySideMap` is the storage from
  // here on, and `enemyBlock()` / `allyBlock()` are the ordered views over it.
  seedEnemies: readonly Fighter[];
  seedAllies: readonly Fighter[];
};

export function installSessionPools(ctx: CombatContext, deps: SessionPoolsDeps): void {
  const dead = deps.dead;
  const { player, enemy, pet, totems, cfg } = ctx;

  // E7: tick/roster-scoped memo for fightersOrder + faction pools (docs/raids/performance-plan §3B).
  // Composition gen (inject/totem) vs pool gen (death/charm) vs pos gen (acquire sorts).
  let rosterGen = 0;
  let poolGen = 0;
  let fightersOrderCache: Fighter[] | null = null;
  let fightersOrderCacheGen = -1;
  let fightersOrderCacheTotems: Fighter[] = [];
  let partyUnitsCache: Fighter[] | null = null;
  let partyUnitsCacheGen = -1;
  let allSeatsCache: Fighter[] | null = null;
  let allSeatsCacheGen = -1;
  let enemyBlockCache: Fighter[] | null = null;
  let enemyBlockCacheGen = -1;
  let allyBlockCache: Fighter[] | null = null;
  let allyBlockCacheGen = -1;
  const friendlyPoolCache = new Map<string, { gen: number; pool: Fighter[] }>();
  const hostilesNoAcqCache = new Map<string, { gen: number; list: Fighter[] }>();
  const hostilesAcqCache = new Map<string, { poolGen: number; posGen: number; list: Fighter[] }>();
  const freeFireCache = new Map<string, {
    poolGen: number;
    posGen: number;
    focus: string | null;
    manual: string | null;
    threatN: number;
    list: Fighter[];
  }>();
  let livingEnemiesCache: Fighter[] | null = null;
  let livingEnemiesCacheGen = -1;
  let livingFriendliesCache: Fighter[] | null = null;
  let livingFriendliesCacheGen = -1;
  let livingAlliesCache: Fighter[] | null = null;
  let livingAlliesCacheGen = -1;
  // SIDE -> UNIT, and this Map IS the roster: the seat arrays it mirrored are gone from the context. Safe
  // to maintain incrementally only because one place writes it. Gate: src/dev/smoke/rosterCoherence.mjs.
  const bySideMap = new Map<string, Fighter>();
  // GUID -> SEAT, the inverse of `spec.guid`, by the same one writer. Without it `sideOfGuid` walks the
  // roster per call, and callers ask inside loops — 40 units times 50 entities every tick.
  const guidToSide = new Map<number, Side>();
  const seatUnit = (f: Fighter, outgoing?: Fighter): void => {
    const gone = (outgoing?.spec.guid ?? 0) | 0;
    if (gone !== 0 && guidToSide.get(gone) === outgoing!.side) guidToSide.delete(gone);
    bySideMap.set(f.side, f);
    const g = (f.spec.guid ?? 0) | 0;
    if (g !== 0) guidToSide.set(g, f.side);
  };
  /** The seat a world id currently occupies. Set/cleared by stampUnitGuid / releaseUnitGuid. */
  const noteUnitGuid = (side: Side, guid: number | null): void => {
    if (guid == null) {
      for (const [g, s] of guidToSide) if (s === side) guidToSide.delete(g);
      return;
    }
    guidToSide.set(guid | 0, side);
  };
  const unitByGuid = (guid: number): Fighter | undefined => {
    const side = guidToSide.get(guid | 0);
    return side != null ? bySideMap.get(side) : undefined;
  };
  const clearPoolCaches = (): void => {
    friendlyPoolCache.clear();
    hostilesNoAcqCache.clear();
    hostilesAcqCache.clear();
    freeFireCache.clear();
    livingEnemiesCache = null;
    livingEnemiesCacheGen = -1;
    livingFriendliesCache = null;
    livingFriendliesCacheGen = -1;
    livingAlliesCache = null;
    livingAlliesCacheGen = -1;
  };
  const bumpRoster = (): void => {
    rosterGen++;
    poolGen++;
    fightersOrderCache = null;
    fightersOrderCacheGen = -1;
    partyUnitsCache = null;
    partyUnitsCacheGen = -1;
    allSeatsCache = null;
    allSeatsCacheGen = -1;
    enemyBlockCache = null;
    enemyBlockCacheGen = -1;
    allyBlockCache = null;
    allyBlockCacheGen = -1;
    clearPoolCaches();
  };
  // THE ONE WRITER for roster membership: seat and generation move together, so a caller cannot do one
  // and not the other. A SEAT IS NAMED BY ITS SIDE, and the ordinal conversion lives here alone.
  const rosterSeatEnemy = (side: EnemySide, f: Fighter): void => {
    seatUnit(f, bySideMap.get(side));
    bumpRoster();
  };
  const rosterSeatAlly = (side: Side, f: Fighter): void => {
    seatUnit(f, bySideMap.get(side));
    bumpRoster();
  };
  // One BLOCK's seats, alive or dead, in turn order — the middle answer between `allSeats()` and the
  // living views, for sweeps that act ON a corpse. Memoized on ROSTER gen, since a death keeps its seat.
  const enemyBlock = (): readonly Fighter[] => {
    if (enemyBlockCache && enemyBlockCacheGen === rosterGen) return enemyBlockCache;
    const o: Fighter[] = [];
    for (const f of bySideMap.values()) if (isEnemySide(f.side)) o.push(f);
    enemyBlockCache = o;
    enemyBlockCacheGen = rosterGen;
    return o;
  };
  const allyBlock = (): readonly Fighter[] => {
    if (allyBlockCache && allyBlockCacheGen === rosterGen) return allyBlockCache;
    const o: Fighter[] = [];
    for (const f of bySideMap.values()) if (isAllySide(f.side)) o.push(f);
    allyBlockCache = o;
    allyBlockCacheGen = rosterGen;
    return o;
  };
  // The seat an inject should take: the first DEAD seat in the block, else the next ordinal. `want` is
  // the block's recycle rule — an ally seat takes only one this session summoned. Null when full.
  const freeSeatIn = (
    isBlock: (s: Side) => boolean,
    nameAt: (i: number) => Side,
    want: (f: Fighter) => boolean,
    cap: number,
  ): Side | null => {
    let n = 0;
    let free: Side | null = null;
    for (const f of bySideMap.values()) {
      if (!isBlock(f.side)) continue;
      n++;
      if (free === null && !(f.hp > 0) && want(f)) free = f.side;
    }
    if (free !== null) return free;
    if (n >= cap) return null;
    // A forced seat (tick seam) can leave a gap below the count, so the ordinal is checked against
    // the store rather than assumed free. Same answer as before whenever there is no gap.
    let i = n;
    while (bySideMap.has(nameAt(i))) i++;
    return nameAt(i);
  };
  const rosterSetTotem = (side: TotemSide, f: Fighter): void => {
    totems.set(side, f);
    seatUnit(f);
    bumpRoster();
  };
  const rosterClearTotem = (side: TotemSide): void => {
    const gone = totems.get(side);
    totems.delete(side);
    if (gone) bySideMap.delete(gone.side);
    bumpRoster();
  };

  /** Membership of friendly/hostile pools changed without fightersOrder composition change. */
  const bumpPool = (): void => {
    poolGen++;
    clearPoolCaches();
  };

  // Turn order: player, pet, allies, totems, enemies, cached until roster mutation. Block is the seat's
  // KIND and order within it is Map insertion order, which is exactly what the seat array's order was.
  const fightersOrder = (): Fighter[] => {
    if (fightersOrderCache && fightersOrderCacheGen === rosterGen) {
      // Totem hp can hit 0 before unsummonTotem bumps roster — drop stale. Re-check only the totems the
      // cached order holds: the old form scanned all 56 fighters per hit, 3.8% of tick self time.
      let totemOk = true;
      for (const f of fightersOrderCacheTotems) {
        if (!(f.hp > 0)) { totemOk = false; break; }
      }
      if (totemOk) return fightersOrderCache;
    }
    // One pass, two blocks. A seat that somehow appeared twice in an array is here once, which
    // is what `rosterCoherence`'s no-duplicate-seat arm already requires.
    const allyBlock: Fighter[] = [];
    const enemyBlock: Fighter[] = [];
    for (const f of bySideMap.values()) {
      if (isAllySide(f.side)) allyBlock.push(f);
      else if (isEnemySide(f.side)) enemyBlock.push(f);
    }
    const o: Fighter[] = [player];
    if (pet) o.push(pet);
    for (const al of allyBlock) o.push(al);
    fightersOrderCacheTotems = [];
    // Summon order, which is deterministic — the four-slot walk this replaced could not name
    // two shamans' seats apart.
    for (const tot of totems.values()) {
      if (tot && tot.hp > 0) { o.push(tot); fightersOrderCacheTotems.push(tot); }
    }
    for (const ef of enemyBlock) o.push(ef);
    fightersOrderCache = o;
    fightersOrderCacheGen = rosterGen;
    return o;
  };

  // Player, pet, companions as one list in turn order. Four sites built it by hand for the aggro pulse,
  // two inside per-tick loops. Same memo rule as `fightersOrder`; the pet is included even when absent.
  const partyUnits = (): readonly Fighter[] => {
    if (partyUnitsCache && partyUnitsCacheGen === rosterGen) return partyUnitsCache;
    const o: Fighter[] = [player];
    if (pet) o.push(pet);
    for (const f of bySideMap.values()) if (isAllySide(f.side)) o.push(f);
    partyUnitsCache = o;
    partyUnitsCacheGen = rosterGen;
    return o;
  };

  // EVERY seat, alive or dead, totems included. NOT `fightersOrder()`: that drops a dead totem, and a
  // sweep that snaps NaN HP has to reach a unit before its liveness is judged.
  const allSeats = (): readonly Fighter[] => {
    if (allSeatsCache && allSeatsCacheGen === rosterGen) return allSeatsCache;
    const o: Fighter[] = [];
    for (const f of bySideMap.values()) o.push(f);
    allSeatsCache = o;
    allSeatsCacheGen = rosterGen;
    return o;
  };

  // Seeded once from the seats createSession dealt; every change after this comes through the
  // writers above. Nothing re-derives it, which is the point.
  bySideMap.set('player', player);
  if (pet) bySideMap.set(pet.side, pet);
  for (const a of deps.seedAllies) if (!bySideMap.has(a.side)) bySideMap.set(a.side, a);
  for (const e of deps.seedEnemies) if (!bySideMap.has(e.side)) bySideMap.set(e.side, e);
  for (const tot of totems.values()) if (tot && !bySideMap.has(tot.side)) bySideMap.set(tot.side, tot);
  for (const f of bySideMap.values()) {
    const g = (f.spec.guid ?? 0) | 0;
    if (g !== 0) guidToSide.set(g, f.side);
  }

  const sideFighter = (s: Side): Fighter | undefined => bySideMap.get(s);
  const bySide = (s: Side): Fighter => {
    const hit = sideFighter(s);
    if (hit) return hit;
    // Same miss fallbacks as the old linear scan (unknown enemy → primary, else player).
    // A floor session may hold no primary at all, and then there is nothing to miss to.
    if (isEnemySide(s) && enemy) return enemy;
    if (s === 'pet') return pet!;
    return player;
  };

  // Same liveness rule as `dead()` (`!(hp > 0)`) so NaN HP counts as dead.
  // poolGen-stamped: Cleave / Magma / Multi-Shot used to re-filter enemies[] per impact.
  const livingEnemies = (): Fighter[] => {
    if (livingEnemiesCache && livingEnemiesCacheGen === poolGen) {
      let ok = true;
      for (const e of livingEnemiesCache) {
        if (!(e.hp > 0)) { ok = false; break; }
      }
      if (ok) return livingEnemiesCache;
    }
    // Off the store. Order is what the seat array's was: within a block a Map keeps a recycled key in
    // place and appends a new one, exactly as `enemies[idx] = f` and `push` did.
    const out: Fighter[] = [];
    for (const e of bySideMap.values()) if (isEnemySide(e.side) && e.hp > 0) out.push(e);
    livingEnemiesCache = out;
    livingEnemiesCacheGen = poolGen;
    return out;
  };
  // The ALLY-seat twin of `livingEnemies`. Liveness ONLY, no charm filter: that is what separates it
  // from `livingFriendlies`, which is the TARGETING pool and drops a charmed unit.
  const livingAllies = (): Fighter[] => {
    if (livingAlliesCache && livingAlliesCacheGen === poolGen) {
      let ok = true;
      for (const a of livingAlliesCache) {
        if (!(a.hp > 0)) { ok = false; break; }
      }
      if (ok) return livingAlliesCache;
    }
    const out: Fighter[] = [];
    for (const a of bySideMap.values()) if (isAllySide(a.side) && a.hp > 0) out.push(a);
    livingAlliesCache = out;
    livingAlliesCacheGen = poolGen;
    return out;
  };
  // Floor stream injects passives with empty threat, so free AI must not treat them as "pull everything
  // in range" — only threat, or an explicit player or ally target.
  const enemyHasThreat = (ef: Fighter): boolean => {
    if (!isEnemySide(ef.side)) return true;
    const tm = ctx.threatOf(ef);
    return !tm || !tm.isEmpty();
  };
  const allEnemiesDead = (): boolean => {
    for (const e of bySideMap.values()) if (isEnemySide(e.side) && e.hp > 0) return false;
    return true;
  };
  // Full party wipe: player AND every companion down. A dead player with living allies is not a wipe;
  // solo still ends on player death, and the pet is benched rather than counted.
  const partyWiped = (): boolean => {
    if (!dead(player)) return false;
    let standing: Fighter[] | null = null;
    for (const a of bySideMap.values()) {
      if (!isAllySide(a.side) || dead(a) || a.spec.summonOwnerSide != null) continue;
      (standing ??= []).push(a);
    }
    if (!standing) return true;
    // A COMPANION'S PET IS NOT A PARTY MEMBER either. A warlock's demon outliving its owner held
    // the wipe open and the run "continued" on a pet. Cite: Player.cpp:1666-1673 RemovePet.
    for (const a of bySideMap.values()) {
      const petSide = a.spec.petSide;
      if (petSide == null || !isAllySide(a.side)) continue;
      const i = standing.findIndex((l) => l.side === petSide);
      if (i >= 0) standing.splice(i, 1);
    }
    return standing.length === 0;
  };

  // Faction bucket: party seats are 'player', enemies 'enemy'. Drives the Dispel Magic positive rule,
  // and charm temporarily flips the charmed unit. Cite: Unit.cpp TakeCharmOf SetFactionTemporary.
  const nativeFactionOf = (side: Side): 'player' | 'enemy' => (isEnemySide(side) ? 'enemy' : 'player');
  const isUnattackable = (f: Fighter, observer?: Fighter | null): boolean => {
    if (f.unattackableUntil > ctx.t) return true;
    if (f.feigningUntil > ctx.t) {
      if (observer && ((observer.spec.staticFlags2 ?? 0) & CREATURE_STATIC_FLAGS2.IGNORE_FEIGN_DEATH) !== 0) {
        return false;
      }
      return true;
    }
    return false;
  };
  const isCharmed = (f: Fighter): boolean => f.charmedUntil > ctx.t && f.charmedBy != null;
  /** Live faction after charm side-switch. Charmer side's native faction wins. */
  const factionOfFighter = (f: Fighter): 'player' | 'enemy' => {
    if (isCharmed(f) && f.charmedBy != null) return nativeFactionOf(f.charmedBy);
    return nativeFactionOf(f.side);
  };
  const factionOf = (side: Side): 'player' | 'enemy' => {
    // Prefer fighter lookup so charm flips apply to pool/dispel rules.
    // Miss stays nativeFactionOf — do not use bySide fallbacks (those hand back player/enemy).
    if (side === 'player') return factionOfFighter(player);
    if (side === 'pet' && pet) return factionOfFighter(pet);
    if (isAllySide(side) || isEnemySide(side)) {
      const f = sideFighter(side);
      if (f) return factionOfFighter(f);
    }
    return nativeFactionOf(side);
  };
  const livingHostilesFor = (f: Fighter): Fighter[] => {
    const myFac = factionOfFighter(f);
    const ignores = ((f.spec.staticFlags2 ?? 0) & CREATURE_STATIC_FLAGS2.IGNORE_FEIGN_DEATH) !== 0;
    const cacheKey = myFac + (ignores ? '_ign' : '');
    const acq = cfg.acquireRangeYd;
    // Same opposite-faction living set for every unit of a faction (self is same-faction, so
    // the old per-caller `x.side === f.side` skip was redundant). Share it on poolGen.
    const factionOpp = (): Fighter[] => {
      const hit = hostilesNoAcqCache.get(cacheKey);
      if (hit && hit.gen === poolGen) {
        if (hit.list.every((h) => !dead(h) && !isUnattackable(h, f))) return hit.list;
      }
      const out: Fighter[] = [];
      for (const x of fightersOrder()) {
        if (dead(x) || isUnattackable(x, f)) continue;
        if (factionOfFighter(x) === myFac) continue;
        out.push(x);
      }
      hostilesNoAcqCache.set(cacheKey, { gen: poolGen, list: out });
      return out;
    };
    // Local acquisition for whole-map sessions: only hostiles in range, nearest first. Without it
    // `foeOf` tunnels the first unit in fighter order, which in a 20-unit map session is 800 yd away.
    if (acq != null && ctx.unitPositionsMutable) {
      const hit = hostilesAcqCache.get(f.side);
      if (hit && hit.poolGen === poolGen && hit.posGen === ctx.posGen) {
        // Drop newly-dead without full rebuild when only liveness flipped.
        if (hit.list.every((h) => !dead(h) && !isUnattackable(h, f))) return hit.list;
      }
      const out = factionOpp();
      const near: Array<{ h: Fighter; d: number }> = [];
      const from = ctx.posOf(f.side);
      for (const h of out) {
        if (!sameStoreyYd(from, ctx.posOf(h.side))) continue;
        const d = ctx.distanceBetween(f, h);
        if (d != null && d <= acq) near.push({ h, d });
      }
      near.sort((a, b) => a.d - b.d);
      const list = near.map((e) => e.h);
      hostilesAcqCache.set(f.side, { poolGen, posGen: ctx.posGen, list });
      return list;
    }
    return factionOpp();
  };
  const friendlyPoolOf = (f: Fighter): Fighter[] => {
    const myFac = factionOfFighter(f);
    // Charmed units fight for the other side — never heal/buff them as "friendly".
    // Cite: TakeCharmOf faction flip; heal triage must use faction-after-charm.
    const buildBase = (): Fighter[] => {
      const out: Fighter[] = [];
      for (const x of fightersOrder()) {
        if (dead(x) || isCharmed(x)) continue;
        if (factionOfFighter(x) !== myFac) continue;
        out.push(x);
      }
      return out;
    };
    // Endless enemy threat filter flips often — cache only the base, re-filter threat.
    // Cite: injectEnemySpec passive; RANGE-ARCHITECTURE class B; DoSelectLowestHpFriendly.
    if (cfg.endless && myFac === 'enemy') {
      let base: Fighter[];
      const hit = friendlyPoolCache.get(myFac);
      if (hit && hit.gen === poolGen && hit.pool.every((x) => !dead(x) && !isCharmed(x))) {
        base = hit.pool;
      } else {
        base = buildBase();
        friendlyPoolCache.set(myFac, { gen: poolGen, pool: base });
      }
      return base.filter((x) => x.side === f.side || enemyHasThreat(x));
    }
    const hit = friendlyPoolCache.get(myFac);
    if (hit && hit.gen === poolGen) {
      if (hit.pool.every((x) => !dead(x) && !isCharmed(x) && factionOfFighter(x) === myFac)) {
        return hit.pool;
      }
    }
    const pool = buildBase();
    friendlyPoolCache.set(myFac, { gen: poolGen, pool });
    return pool;
  };
  // Living free friendlies, the player side's heal/buff pool; an enemy healer must use
  // `friendlyPoolOf`. NO TOTEMS — both AoE target checks refuse one. Cite: GridNotifiers.h:1157, :979.
  const livingFriendlies = (): Fighter[] => {
    if (livingFriendliesCache && livingFriendliesCacheGen === poolGen) {
      let ok = true;
      for (const fr of livingFriendliesCache) {
        if (!(fr.hp > 0) || isCharmed(fr)) { ok = false; break; }
      }
      if (ok) return livingFriendliesCache;
    }
    // `partyUnits()` is the same three blocks in the same order, already composed off the store
    // and memoized on roster gen, so this filters it instead of re-walking the seat fields (E1.1).
    const out: Fighter[] = [];
    for (const fr of partyUnits()) if (fr.hp > 0 && !isCharmed(fr)) out.push(fr);
    livingFriendliesCache = out;
    livingFriendliesCacheGen = poolGen;
    return out;
  };
  // Lowest-HP-percent living free unit in `pool`. Deterministic — fixed iteration order, first-lowest wins
  // ties. Pool must already exclude dead/charmed.
  const lowestHpInPool = (pool: readonly Fighter[]): Fighter | null => {
    let best: Fighter | null = null;
    let bestPct = Number.POSITIVE_INFINITY;
    for (const fr of pool) {
      // Never triage a totem: immune to SPELL_EFFECT_HEAL / ENERGIZE, and its 5 HP make one
      // splash the lowest-HP body on the side. Cite: Entities/Totem.cpp:261-280.
      if (isTotemSide(fr.side)) continue;
      const pct = fr.hp / Math.max(1, fr.spec.maxHealth);
      if (pct < bestPct) { best = fr; bestPct = pct; }
    }
    return best;
  };
  // Heal triage for the player party (ally AI / player groupRole healer). Enemy casters must use
  // lowestHpFriendlyOf(caster) — faction-relative.
  const lowestHpFriendly = (): Fighter | null => lowestHpInPool(livingFriendlies());
  // Faction-relative heal triage, and under local acquisition it sees only friendlies inside that
  // radius — a healer must not top someone off across the whole map. Cite: DoSelectLowestHpFriendly.
  const lowestHpFriendlyOf = (f: Fighter): Fighter | null => {
    let pool = friendlyPoolOf(f);
    // A macro aimed this cast at a named ally: honour it while it is legal. Everything else
    // (every AI cast, every unpinned player cast) falls through to triage below.
    if (f.friendlyPin) {
      const pinned = pool.find((x) => x.side === f.friendlyPin && !dead(x));
      if (pinned) return pinned;
    }
    const acq = cfg.acquireRangeYd;
    if (acq != null && ctx.unitPositionsMutable) {
      pool = pool.filter((x) => {
        if (x.side === f.side) return true;
        const d = ctx.distanceBetween(f, x);
        return d == null || d <= acq;
      });
    }
    // Prefer a WOUNDED ally this caster can see. With none sighted the pool stands, so the cast gate
    // refuses instead of this quietly topping off a healthy body. Cite: Spell.cpp:4742 CheckCast.
    if (cfg.navLos && ctx.unitPositionsMutable) {
      const seen = pool.filter(
        (x) => x.hp / Math.max(1, x.spec.maxHealth) < ALLY_HEAL_THRESHOLD
          && (x.side === f.side || navSightClear(cfg, ctx.posOf(f.side), ctx.posOf(x.side))),
      );
      if (seen.length > 0) pool = seen;
    }
    // Arena only: GetHealTarget job order, not raw lowest-HP. A healer at 55% is picked over a
    // DPS at 40% so the kill-target lives. Cite: PlayerbotClassAI.cpp:31-34 thresholds, :314-327.
    if (cfg.enemiesAreATeam === true) {
      const pctOf = (u: Fighter): number => (u.hp / Math.max(1, u.spec.maxHealth)) * 100;
      const living = pool.filter((u) => !dead(u) && !isTotemSide(u.side));
      const best = (xs: Fighter[]): Fighter | null => lowestHpInPool(xs);
      const tank = best(living.filter((u) => u.spec.groupRole === 'tank' && pctOf(u) <= 80));
      if (tank) return tank;
      const healer = best(living.filter((u) => u.spec.groupRole === 'healer' && pctOf(u) <= 60));
      if (healer) return healer;
      const dps = best(living.filter(
        (u) => u.spec.groupRole !== 'tank' && u.spec.groupRole !== 'healer' && pctOf(u) <= 30,
      ));
      if (dps) return dps;
      const hurt = best(living.filter((u) => pctOf(u) < 100));
      if (hurt) return hurt;
    }
    return lowestHpInPool(pool);
  };
  // Prefer real enemies over charmed former-allies, but never force "everyone kill the MC". Below:
  // damage can never kill an enemy under death prevention or the UNKILLABLE flag, floored at 1 HP.
  const isUnkillableEnemy = (h: Fighter): boolean => {
    if (!isEnemySide(h.side)) return false;
    if (((h.spec.staticFlags ?? 0) & 0x08) !== 0) return true;
    return ctx.enemyCastBySide.get(h.side as EnemySide)?.eventAi.deathPrevention === true;
  };
  ctx.isUnkillableEnemy = isUnkillableEnemy;

  const preferFocusHostile = (hostiles: Fighter[], from?: Fighter): Fighter | null => {
    if (hostiles.length === 0) return null;
    // A mob under break-on-damage CC is a last resort, not a first pick: AUTO-reselect handed back
    // list order, which is the sheep as often as not. A stun is not skipped, and a click still wins.
    const protectedCc = ctx.ccProtected;
    const free = protectedCc ? hostiles.filter((h) => !protectedCc(h)) : hostiles;
    let pool = free.length > 0 ? free : hostiles;
    // An enemy under death prevention can never drop below 1 HP, so time on it is wasted by
    // construction. Measured: 95,708 damage into one over 184 s, 0 of 9 dead; his adds were the fight.
    const killable = pool.filter((h) => !isUnkillableEnemy(h));
    if (killable.length > 0) pool = killable;
    // Kill healers first (Flamewaker Healers at 100% HP). Creature kit: enemyCastBySide.healer;
    // player-shaped seats: groupRole (squad.ts:766). Cite: PlayerbotClassAI.cpp:659 GetBotJob.
    // The creature's own armed kit always counts. `groupRole` counts only in an ARENA: it is a
    // player-shaped seat's role, and reading it in a raid re-aimed the whole party — Thaddius's
    // adds stopped reviving alone, the drakonid constructs found no corpses and Jin'do died with
    // no ward standing (smoke:slow, measured with and without). Cite: PlayerbotClassAI.cpp:659.
    const isHealer = (h: Fighter): boolean =>
      ctx.enemyCastBySide.get(h.side as EnemySide)?.healer === true
      || (cfg.enemiesAreATeam === true && h.spec.groupRole === 'healer');
    let healers = pool.filter(isHealer);
    // Arena: healer-first among bodies inside Charge/Intercept 25 yd, else a reachable body.
    // Cite: PlayerbotWarriorAI.cpp:175-176; plan §W11 (44 yd healer never closes).
    if (cfg.enemiesAreATeam === true && from != null && ctx.distanceBetween) {
      const inGapCloser = (h: Fighter): boolean => {
        const d = ctx.distanceBetween(from, h);
        return d != null && d <= CHARGE_INTERCEPT_MAX_YD;
      };
      const nearHealers = healers.filter(inGapCloser);
      if (nearHealers.length > 0) {
        healers = nearHealers;
      } else {
        const near = pool.filter(inGapCloser);
        if (near.length > 0) {
          pool = near;
          healers = [];
        }
      }
    }
    if (healers.length > 0 && healers.length < pool.length) pool = healers;
    const native = pool.find((h) => !isCharmed(h));
    return native ?? pool[0]!;
  };
  const foePoolOf = (f: Fighter): Fighter[] => livingHostilesFor(f);

  // Free-fire pool for the party: on a normal pull every living hostile is the fight. On the endless
  // stream only enemies with threat or an explicit click, not every passive in the 48 yd stream.
  const freeFireHostilesFor = (f: Fighter): Fighter[] => {
    const all = livingHostilesFor(f);
    if (!cfg.endless) return all;
    // Drop ally/player latches that name a dead or non-hostile side before free-fire
    // would re-arm a recycled passive on that slot (probe-controller-farpull A).
    if (isAllySide(f.side)) {
      const m = ctx.allyManualTarget.get(f.side);
      if (m != null && !all.some((h) => h.side === m && !dead(h))) {
        ctx.allyManualTarget.delete(f.side);
      }
    }
    if (ctx.explicitEnemyFocus != null) {
      const ef = bySideMap.get(ctx.explicitEnemyFocus);
      if (!ef || dead(ef)) ctx.explicitEnemyFocus = null;
    }
    let threatN = 0;
    for (const e of livingEnemies()) if (enemyHasThreat(e)) threatN++;
    const focus = ctx.explicitEnemyFocus ?? null;
    const manual = isAllySide(f.side) ? (ctx.allyManualTarget.get(f.side) ?? null) : null;
    const cached = freeFireCache.get(f.side);
    if (
      cached
      && cached.poolGen === poolGen
      && cached.posGen === ctx.posGen
      && cached.focus === focus
      && cached.manual === manual
      && cached.threatN === threatN
    ) return cached.list;
    // Sight is a PREFERENCE here, never a bar. Never acquire through a floor, but a mob already on our
    // threat list stays legal: deleting the last one empties the pool and the party refuses to swing.
    const seenOf = (h: Fighter): boolean =>
      !cfg.navLos || navSightClear(cfg, ctx.posOf(f.side), ctx.posOf(h.side));
    const pool: Fighter[] = [];
    let anySeen = false;
    // Record sight in the first pass — the filter used to call seenOf again for the same pair.
    const seen = new Set<Fighter['side']>();
    for (const h of all) {
      if (!isEnemySide(h.side)) { pool.push(h); continue; }
      // An explicit click still wins: the player may target what they can see on screen.
      if (ctx.explicitEnemyFocus != null && h.side === ctx.explicitEnemyFocus) {
        pool.push(h);
        anySeen = true;
        continue;
      }
      if (isAllySide(f.side) && ctx.allyManualTarget.get(f.side) === h.side) {
        pool.push(h);
        anySeen = true;
        continue;
      }
      if (!enemyHasThreat(h)) continue;
      pool.push(h);
      if (seenOf(h)) {
        anySeen = true;
        seen.add(h.side);
      }
    }
    // Something in sight to fight ⇒ fight that, and leave the mob behind the floor alone.
    // Nothing in sight ⇒ the unseen attacker IS the fight; standing down is not an option.
    const list = !anySeen ? pool : pool.filter((h) => {
      if (!isEnemySide(h.side)) return true;
      if (ctx.explicitEnemyFocus != null && h.side === ctx.explicitEnemyFocus) return true;
      if (isAllySide(f.side) && ctx.allyManualTarget.get(f.side) === h.side) return true;
      return seen.has(h.side);
    });
    freeFireCache.set(f.side, {
      poolGen, posGen: ctx.posGen, focus, manual, threatN, list,
    });
    return list;
  };
  // Combat-relevant enemies for multi-target AI, Sweeping Strikes, untargeted threat pulses. Endless: never
  // the whole passive stream. Cite: injectEnemySpec passive.
  const livingCombatEnemies = (): Fighter[] => {
    if (!cfg.endless) return livingEnemies();
    return livingEnemies().filter((e) => {
      if (enemyHasThreat(e)) return true;
      if (ctx.explicitEnemyFocus != null && e.side === ctx.explicitEnemyFocus) return true;
      return false;
    });
  };

  ctx.bumpRoster = bumpRoster;
  ctx.rosterSeatEnemy = rosterSeatEnemy;
  ctx.freeSeatIn = freeSeatIn;
  ctx.rosterSeatAlly = rosterSeatAlly;
  ctx.rosterSetTotem = rosterSetTotem;
  ctx.rosterClearTotem = rosterClearTotem;
  ctx.unitByGuid = unitByGuid;
  ctx.noteUnitGuid = noteUnitGuid;
  ctx.bumpPool = bumpPool;
  ctx.fightersOrder = fightersOrder;
  ctx.partyUnits = partyUnits;
  ctx.allSeats = allSeats;
  ctx.enemyBlock = enemyBlock;
  ctx.allyBlock = allyBlock;
  ctx.bySide = bySide;
  ctx.sideFighter = sideFighter;
  ctx.livingEnemies = livingEnemies;
  ctx.livingAllies = livingAllies;
  ctx.enemyHasThreat = enemyHasThreat;
  ctx.allEnemiesDead = allEnemiesDead;
  ctx.partyWiped = partyWiped;
  ctx.nativeFactionOf = nativeFactionOf;
  ctx.isUnattackable = isUnattackable;
  ctx.isCharmed = isCharmed;
  ctx.factionOfFighter = factionOfFighter;
  ctx.factionOf = factionOf;
  ctx.livingHostilesFor = livingHostilesFor;
  ctx.friendlyPoolOf = friendlyPoolOf;
  ctx.livingFriendlies = livingFriendlies;
  ctx.lowestHpFriendly = lowestHpFriendly;
  ctx.lowestHpFriendlyOf = lowestHpFriendlyOf;
  ctx.preferFocusHostile = preferFocusHostile;
  ctx.foePoolOf = foePoolOf;
  ctx.freeFireHostilesFor = freeFireHostilesFor;
  ctx.livingCombatEnemies = livingCombatEnemies;
}
