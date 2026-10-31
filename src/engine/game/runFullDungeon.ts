
import { UNATTRIBUTED_VICTIM } from '../combat.ts';
import { WIPE_RETRY_PER_PULL, WIPE_CAP_PER_RUN } from '../../world/dungeonPreset.ts';
import { hashSeed, mulberry32 } from '../core/rng.ts';
import { allyIndexOfSide } from '../core/events.ts';
import { ownedInventory } from '../../domain/items/keyring.ts';
import { countItem } from '../../domain/items/inventory.ts';
import {
  buildRunSummary, memberStatsFromEvents,
  type PullRecord, type AllyEndVitals,
} from '../../domain/run/dungeonRun.ts';
import { betweenPullConsumeLoop } from '../../domain/bots/betweenPullRest.ts';
import { applyCompanionKillXp } from '../../domain/bots/companionXp.ts';
import { applyCompanionKillReputation } from '../../domain/bots/companionRep.ts';
import { companionSpec, companionLevel } from '../../domain/bots/squad.ts';
import { rollLoot } from '../../domain/items/loot.ts';
import {
  isComplete, isCleared, applyLockout, hasFlag, setFlag,
  nextEncounter, routeBossProgress, routeEncounterIdList,
  encounterOf,
  autoAdvanceRouteGates, applyEncounterCleared,
  itemDropsInsideInstance,
} from '../../world/instances.ts';
import type { InstanceRun } from '../../world/instances.ts';
import type { InstanceDef } from '../../data/schema.ts';
import { objectGatesFor } from '../../world/instanceObjects.ts';
import { dungeonGameObjectsForMap } from '../../data/dungeonGameObjects.ts';
import { goPassesPoolGate } from '../../world/goPoolRoll.ts';
import { consumeOwnedCharges } from '../../domain/items/inventory.ts';
import {
  DEFAULT_PULL_FUSION,
  DEFAULT_ROUTE_DENSITY,
  countRouteTrash,
  selectRouteEncounters,
} from '../../world/dungeonRoute.ts';
import type { ActionResult } from './types.ts';
import type { DungeonRunSummary } from '../../domain/run/dungeonRun.ts';
import { isSkippableBeginFailure } from './types.ts';
import type { GameCtx } from './context.ts';
import type { SquadCombatBridge, SquadHelpers } from './squadDungeon.ts';
import {
  refuseIfDeadOrInCombat,
  ALREADY_IN_COMBAT,
  isPlayerAlive,
  computeReclaimDelayMs,
} from '../../domain/run/death.ts';
import {
  pickResurrector,
  resolvePartyResurrect,
  resolveCorpseRun,
  type RecoveryCaster,
} from '../../domain/raid/raidRecovery.ts';
import { maxHealth, maxPower, powerType } from '../../domain/character/character.ts';
import { classHasParallelMana } from '../../domain/character/forms.ts';

// Loot floor GOs whose tables drop an object gate's required item when that item drops inside this
// instance and is not owned yet. Two sites; after this the route gate can fire its consumer.
function lootInsideKeyGameObjects(
  ctx: GameCtx,
  def: InstanceDef,
  run: InstanceRun,
  hasItem: (itemEntry: number) => boolean,
): { run: InstanceRun; looted: number } {
  const { ds, state, log, takeDrop } = ctx;
  let next = run;
  let looted = 0;
  const need = new Set<number>();
  for (const gate of objectGatesFor(def)) {
    const req = gate.requiredItem;
    if (req == null || hasItem(req)) continue;
    if (!itemDropsInsideInstance(
      def,
      req,
      (id) => ds.lootTable(id),
      (goEntry) => ds.gameObject(goEntry)?.lootId,
    )) continue;
    need.add(req);
  }
  if (need.size === 0) return { run: next, looted };

  // A pool loser is a candidate position with nothing on it — same gate the pins use.
  const goWinners = next.floorPoolSpawnedGoGuids == null
    ? null
    : new Set(next.floorPoolSpawnedGoGuids);
  for (const go of dungeonGameObjectsForMap(def.mapId)) {
    if (go.lootId == null || !(go.lootId > 0)) continue;
    if (!goPassesPoolGate(go, goWinners)) continue;
    const lootedFlag = `go-looted:${go.guid}`;
    if (hasFlag(next, lootedFlag)) continue;
    const table = ds.lootTable(`go:${go.lootId}`) ?? [];
    if (!table.length) continue;
    if (!table.some((r) => need.has(r.item))) continue;
    // CHEST (type 3) with lootId — same gate lootInstanceObject uses.
    if (go.type !== 3) continue;
    const rng = mulberry32(hashSeed(state.rngSeed, state.fightCounter++));
    const rolled = rollLoot(table, rng);
    for (const drop of rolled) {
      takeDrop(drop.item, drop.count);
    }
    next = setFlag(next, lootedFlag);
    looted++;
    log(`You open the ${go.name}.`);
    // Refresh owned set so a second GO for the same key is skipped this pass.
    for (const item of need) {
      if (countItem(ownedInventory(state.inventory, state.keyring), item) > 0) need.delete(item);
    }
    if (need.size === 0) break;
  }
  return { run: next, looted };
}

export function executeRunFullDungeon(
  ctx: GameCtx,
  combat: SquadCombatBridge,
  helpers: SquadHelpers,
  opts?: { keepLogs?: boolean }
): ActionResult<{ summary: DungeonRunSummary }> {
  const { ds, state, log } = ctx;
  const { beginEncounter, resolveFight } = combat;
  const {
    doApplyPrePullBuffs,
    buildSquadBattleParty,
    syncCompanionPetAfterLevel,
  } = helpers;

  if (!state.instance) return { ok: false, reason: 'You are not in an instance' };
      // Up-front refuse — not a green partial of a run that never started (KI-942 / KI-954).
      // Combat reason matches beginEncounter ('Already in combat').
      {
        const inCombat =
          !!combat.getLiveFightSession() || !!combat.getPendingFight();
        const gate = refuseIfDeadOrInCombat(
          state.char.health, state.deathFlow, inCombat, ALREADY_IN_COMBAT,
        );
        if (gate) return gate;
      }
      const def = ds.instance(state.instance.dungeonId);
      if (!def) return { ok: false, reason: 'Unknown dungeon' };
      if (isComplete(def, state.instance)) return { ok: false, reason: 'Already cleared - reset to run it again' };
      const keepLogs = opts?.keepLogs === true;

      // D2/D4: stamp legacy companions at the player's level once at run start.
      // S5: pulls are real withSquad sessions (no Track-A mini-sims / modelSquadPull).
      for (const c of state.squad ?? []) {
        if (c.level == null) {
          c.level = Math.max(1, Math.min(60, state.char.level));
          c.xp = 0;
        }
      }
      const hasSquad = (state.squad ?? []).length > 0;
      // "Buff up" parity with the live run: raid buffs on the party + conjured provisions before pull 1.
      doApplyPrePullBuffs();
      const allyMeta = (): Array<{ name: string; role: 'tank' | 'healer' | 'dps' }> =>
        (state.squad ?? []).map((c) => ({ name: c.name, role: c.role }));

      // Rest between pulls on the headless path: a real out-of-combat consume loop plus sit regen to
      // the pacing target. Never a free vitals snap; a live run pauses at a ready gate instead.
      const restBetweenPulls = (): number => {
        const r = betweenPullConsumeLoop({
          char: state.char,
          inventory: state.inventory,
          ds,
          strategy: state.squadStrategy,
          deathFlow: state.deathFlow,
        });
        state.char = r.char;
        state.inventory = r.inventory;
        for (const m of r.messages) {
          if (/out of /i.test(m)) log(m);
        }
        return r.seconds;
      };

      const pulls: PullRecord[] = [];
      let stopReason: string | undefined;
      /** Deaths the player has taken this run — indexes the corpse reclaim delay table. */
      let playerDeaths = 0;
      let biggestHit = { amount: 0, what: '', where: '', who: '' };

      // Stand the player back up between pulls the way a raid does, with a living companion casting a
      // real resurrect. Without it ONE player death ended the run: 4 of 8 raid-sized runs stopped there.
      const resurrectPlayerBetweenPulls = (aliveAtPullEnd: AllyEndVitals[] | undefined): number => {
        if (isPlayerAlive(state.char.health, state.deathFlow)) return 0;
        const squad = state.squad ?? [];
        const casters: RecoveryCaster[] = squad.map((c, i) => ({
          name: c.name,
          level: companionLevel(c, state.char.level),
          role: c.role,
          // No vitals recorded (solo / old summary shape) = the pull was won, so they stand.
          alive: aliveAtPullEnd ? (aliveAtPullEnd[i]?.hp ?? 1) > 0 : true,
        }));
        const option = pickResurrector(casters, (caster) => {
          const comp = squad.find((c) => c.name === caster.name);
          if (!comp) return [];
          return companionSpec(comp, companionLevel(comp, state.char.level), ds).spells ?? [];
        });
        if (!option) {
          // Nobody left to cast one: the corpse run, not the end of the run.
          // Cite: MiscHandler.cpp HandleReclaimCorpseOpcode.
          playerDeaths += 1;
          const run = resolveCorpseRun({
            maxHealth: maxHealth(state.char, ds),
            maxMana: maxPower(state.char, ds),
            powerType: powerType(state.char),
            deaths: playerDeaths,
            reclaimDelayMs: computeReclaimDelayMs(playerDeaths - 1, false),
          });
          state.char.health = run.health;
          if (run.mana != null) state.char.power = run.mana;
          log(`You release, run back to your corpse and reclaim it (${run.downtimeSec}s).`);
          return run.downtimeSec;
        }
        const applied = resolvePartyResurrect(option, {
          maxHealth: maxHealth(state.char, ds),
          maxMana: maxPower(state.char, ds),
          powerType: powerType(state.char),
          hasParallelMana: classHasParallelMana(state.char.cls),
          deathFlow: state.deathFlow,
        });
        if (applied.health == null) return 0;
        state.char.health = applied.health;
        if (applied.mana != null && powerType(state.char) !== 'rage') {
          state.char.power = applied.mana;
        }
        if (applied.clearDeathFlow && state.deathFlow) {
          state.deathFlow = {
            ...state.deathFlow,
            deathState: 'ALIVE',
            corpse: null,
            position: null,
            graveyard: null,
            reclaimDelayMs: 0,
            deathAtMs: 0,
            deathExpireTimeSec: applied.clearDeathFlow.deathExpireTimeSec,
          };
        }
        log(applied.log);
        return Math.ceil(option.castTimeMs / 1000);
      };
      // A wipe is a setback, not the end of the dungeon. The caps live in the dungeon preset because
      // the live floor enforces the same two numbers and the engine cannot import from the UI.
      const WIPE_BUDGET_PER_RUN = WIPE_CAP_PER_RUN;
      const attemptsByEnc = new Map<string, number>();
      const timeoutsByEnc = new Map<string, number>();
      let wipes = 0;
      const mailBefore = (state.mailbox ?? []).length;
      // Raised with retries: blackrock-depths alone routes 162 stops, and 200 left no headroom.
      let guard = 0;
      while (guard++ < 400) {
        // Inside-key floor GOs first (Defias Gunpowder 17155, Fengus's Chest 179516), then
        // auto-fire objectGates that consume those keys (KI-1050).
        if (state.instance) {
          const hasOwned = (entry: number) =>
            countItem(ownedInventory(state.inventory, state.keyring), entry) > 0;
          const keyed = lootInsideKeyGameObjects(ctx, def, state.instance, hasOwned);
          if (keyed.looted > 0) state.instance = keyed.run;
          const auto = autoAdvanceRouteGates(
            def,
            state.instance,
            hasOwned,
            {
              keyDropsInside: (entry) => itemDropsInsideInstance(
                def,
                entry,
                (id) => ds.lootTable(id),
                (goEntry) => ds.gameObject(goEntry)?.lootId,
              ),
            },
          );
          if (auto.fired > 0) state.instance = auto.run;
          // useObjectGate reports consumeItem; auto-run must spend (KI-1028).
          // Cite: Spell.cpp TakeCastItem:4209; combatSession useInstanceObject.
          for (const entry of auto.consumedItems) {
            const spent = consumeOwnedCharges(
              state.inventory,
              state.keyring,
              entry,
              ds.item(entry),
            );
            state.inventory = spent.bags;
            state.keyring = spent.keyring;
          }
        }
        const enc = nextEncounter(def, state.instance);
        if (!enc) {
          // Soft-lock (flag/object gate) ≠ clear.
          if (state.instance && !isComplete(def, state.instance)) {
            stopReason = stopReason
              ?? 'No unlocked encounter left (door/object gate or missing key item?)';
          }
          break;
        }
        // Rez BEFORE the rest loop: rest refuses to regen a corpse (KI-948), so the order is
        // stand up, then eat.
        const rezSec = pulls.length > 0
          ? resurrectPlayerBetweenPulls(pulls.at(-1)?.allyEnd)
          : 0;
        const downtimeSec = (pulls.length > 0 ? restBetweenPulls() : 0) + rezSec;
        // S5: one shared group fight when a squad is hired; solo otherwise.
        const b = beginEncounter(def.id, enc.id, hasSquad ? { withSquad: true } : undefined);
        if (!b.ok) {
          // Session D: skip unplayable encounters (missing creature template / empty pull)
          // so auto-run can finish remaining route. No XP / kill credit — honest skip.
          const reason =
            (b.reason && b.reason.trim()) || 'missing failure reason (internal)';
          if (isSkippableBeginFailure(reason) && state.instance) {
            log(`Skipping ${enc.name}: ${reason}`);
            state.instance = applyEncounterCleared(state.instance, enc);
            continue;
          }
          stopReason = reason;
          break;
        }
        b.session.runToEnd();
        // How the enemy side ended, read off the session BEFORE resolveFight settles it: on a boss
        // pull its remaining HP is the difference between a close fight and one that cannot be won.
        const enemyEnd = (() => {
          const view = b.session.enemiesView();
          if (!view.length) return undefined;
          const primary = view[0]!;
          const maxHp = Math.max(1, primary.maxHp ?? primary.hp ?? 1);
          return {
            hpPct: Math.max(0, Math.min(1, (primary.hp ?? 0) / maxHp)),
            alive: view.filter((e) => (e.hp ?? 0) > 0).length,
            total: view.length,
            bodies: view.slice(0, 16).map((e) => ({
              name: e.name ?? '?',
              hpPct: Math.max(0, Math.min(1, (e.hp ?? 0) / Math.max(1, e.maxHp ?? e.hp ?? 1))),
            })),
          };
        })();
        // Battle party BEFORE resolveFight so pet ally maxHp survives a death sync (KI-1030).
        const battleParty = hasSquad ? buildSquadBattleParty(enc.creatureEntry) : null;
        // resolveFight always settles a finished session (FightOutcome.ok is always true).
        const o = resolveFight(b.session);
        const won = o.outcome === 'win';
        const timedOut = o.outcome === 'timeout';
        for (const e of o.result.events) {
          if ((e.kind === 'spell_hit' || e.kind === 'melee') && e.amount > biggestHit.amount) {
            const allyIdx = allyIndexOfSide(e.actor as string);
            const who = e.actor === 'player'
              ? state.char.name
              : e.actor === 'pet'
                ? (state.char.pet?.name ?? 'Pet')
                : allyIdx >= 0
                  ? (state.squad?.[allyIdx]?.name ?? e.actor)
                  : '';
            if (!who) continue; // ignore enemy hits for "biggest hit" highlight
            biggestHit = {
              amount: e.amount,
              what: e.kind === 'spell_hit' ? e.name : 'a mighty swing',
              where: enc.name,
              who,
            };
          }
        }

        const guardianOwners: Record<string, string> = {};
        if (state.char.pet) guardianOwners.pet = 'player';
        const petIdx = battleParty?.allyPetIndex ?? [];
        for (let human = 0; human < petIdx.length; human++) {
          const p = petIdx[human];
          if (p == null || p < 0) continue;
          guardianOwners[`ally_${p}`] = `ally_${human}`;
        }
        const memberStats = memberStatsFromEvents(o.result.events, {
          playerName: state.char.name,
          petName: state.char.pet?.name,
          allies: allyMeta(),
          guardianOwners,
          // Push-time tally, not an event walk: on a raid fight the ring has already dropped
          // the rows that landed the opening damage (RUNSHEET P0).
          ...(o.result.damageTakenBySide ? { damageTakenBySide: o.result.damageTakenBySide } : {}),
        });

        // The session resolved the names; only this layer knows that `ally_7` is a healer, so
        // the ROLE mapping belongs here, next to memberStats which uses the same allyMeta().
        const deaths = (() => {
          if (!o.result.deaths?.length) return undefined;
          const meta = allyMeta();
          const roleOf = (side: string): NonNullable<PullRecord['deaths']>[number]['role'] => {
            if (side === 'player') return 'player';
            if (side === 'pet') return 'pet';
            const m = /^ally_(\d+)$/.exec(side);
            // Companion pets are appended after the humans (buildSquadBattleParty), so an
            // ally index past the squad is a pet, not an unknown.
            if (m) return meta[Number(m[1])]?.role ?? 'pet';
            return 'enemy';
          };
          return o.result.deaths.map((d) => ({
            side: d.side,
            name: d.name,
            role: roleOf(d.side),
            t: d.t,
            ...(d.cause ? { cause: d.cause } : {}),
            ...(d.byName ? { by: d.byName } : {}),
          }));
        })();

        // Real ally end vitals for Watch Run party frames (optional additive).
        // Pet slots sit after humans — use pre-resolve allySpecs.maxHealth (KI-1030).
        let allyEnd: AllyEndVitals[] | undefined;
        if (hasSquad && o.result.allies && o.result.allies.length > 0) {
          allyEnd = o.result.allies.map((a, i) => {
            const comp = state.squad?.[i];
            const maxHp = comp
              ? companionSpec(comp, companionLevel(comp, state.char.level), ds).maxHealth
              : Math.max(1, battleParty?.allySpecs[i]?.maxHealth ?? a.hp);
            return { hp: a.hp, power: a.power, maxHp };
          });
        }

        pulls.push({
          encounterId: enc.id,
          name: enc.name,
          // Pull log only distinguishes trash vs boss (entrance/object/rare → trash).
          kind: enc.kind === 'boss' ? 'boss' : 'trash',
          outcome: won ? 'win' : timedOut ? 'timeout' : 'defeat',
          durationMs: o.result.durationMs,
          xpGained: o.xpGained,
          goldGained: o.goldGained,
          loot: o.loot,
          endHpPct: b.playerMax > 0 ? Math.max(0, o.result.player.hp) / b.playerMax : 0,
          downtimeSec,
          memberStats,
          ...(keepLogs ? { log: o.result.events } : {}),
          // Not gated on keepLogs: this is the only trim-proof record of the fight's scripted
          // mechanics, and it is a handful of counters (createSession push tally).
          ...(o.result.mechanics ? { mechanics: o.result.mechanics } : {}),
          // Same rule, same reason: the death roll and the drop count are the only honest
          // answers to "who died first" and "is the meter complete?" once the ring has trimmed.
          ...(deaths ? { deaths, deathsTotal: o.result.deathsTotal ?? deaths.length } : {}),
          ...(o.result.eventsDropped ? { eventsDropped: o.result.eventsDropped } : {}),
          ...(o.result.damageTakenBySide?.[UNATTRIBUTED_VICTIM]
            ? { damageTakenUnattributed: o.result.damageTakenBySide[UNATTRIBUTED_VICTIM] }
            : {}),
          ...(enemyEnd ? { enemyEnd } : {}),
          ...(allyEnd ? { allyEnd } : {}),
        });

        // D4 + ICH4: companions earn kill XP by ITS level (personal curve); xpLocked no-op;
        // soft cap ≤ player (design §4.4 / D6) via applyCompanionKillXp.
        const encDef = ds.creature(enc.creatureEntry);
        if (won && encDef) {
          for (const comp of state.squad ?? []) {
            const r = applyCompanionKillXp(comp, encDef, state.char.level, ds);
            for (const lvl of r.leveledTo) {
              log(`${comp.name} reaches level ${lvl}!`);
            }
            if (r.leveledTo.length) syncCompanionPetAfterLevel(comp, r.leveledTo);
            applyCompanionKillReputation(comp, encDef, state.char.level, ds, undefined, log);
          }
        }
        // The wipe rule in corpse-run form: a defeat ends the PULL and the party runs back and pulls
        // again. A combat-cap timeout with the party still standing is NOT a wipe.
        if (timedOut) {
          const n = (timeoutsByEnc.get(enc.id) ?? 0) + 1;
          timeoutsByEnc.set(enc.id, n);
          if (n >= WIPE_RETRY_PER_PULL) {
            stopReason = `Combat timed out on ${enc.name} (${n} attempt${n === 1 ? '' : 's'})`;
            break;
          }
          log(`Combat timed out on ${enc.name} — party still standing; not a wipe (attempt ${n + 1} of ${WIPE_RETRY_PER_PULL}).`);
          continue;
        }
        if (!won) {
          const n = (attemptsByEnc.get(enc.id) ?? 0) + 1;
          attemptsByEnc.set(enc.id, n);
          wipes++;
          if (n >= WIPE_RETRY_PER_PULL || wipes >= WIPE_BUDGET_PER_RUN) {
            stopReason = `Party wiped on ${enc.name} (${n} attempt${n === 1 ? '' : 's'})`;
            break;
          }
          log(`Wipe on ${enc.name} - the pack resets to full; the party runs back (attempt ${n + 1} of ${WIPE_RETRY_PER_PULL}).`);
          continue;
        }
      }

      // After-action extras: narrative highlights + per-member role grades from real meters.
      const keyMoments: string[] = [];
      if (biggestHit.amount > 0) {
        const whoBit = biggestHit.who && biggestHit.who !== state.char.name
          ? `${biggestHit.who}'s `
          : '';
        keyMoments.push(`Biggest hit: ${whoBit}${biggestHit.what} for ${biggestHit.amount} on ${biggestHit.where}.`);
      }
      for (const p of pulls) {
        if (p.outcome === 'win' && p.endHpPct > 0 && p.endHpPct < 0.25) {
          keyMoments.push(`${p.name}: you survived at ${Math.max(1, Math.round(p.endHpPct * 100))}% health - a close call.`);
        }
        // Boss attribution: companion who out-damaged the player (real memberStats).
        if (p.kind === 'boss' && p.memberStats && p.memberStats.length > 1) {
          const playerDmg = p.memberStats.find((m) => m.role === 'player')?.damage ?? 0;
          const topAlly = [...p.memberStats]
            .filter((m) => m.role !== 'player' && m.role !== 'pet')
            .sort((a, b) => b.damage - a.damage)[0];
          if (topAlly && topAlly.damage > playerDmg && topAlly.damage > 0) {
            const total = p.memberStats.reduce((n, m) => n + m.damage, 0);
            const pct = total > 0 ? Math.round((topAlly.damage / total) * 100) : 0;
            keyMoments.push(`${p.name}: ${topAlly.name} led the damage (${pct}%).`);
          }
        }
      }
      const roleGrades: Array<{ name: string; role: string; detail: string }> = [];
      if (hasSquad && pulls.length > 0) {
        const totals = new Map<string, { role: string; damage: number; healing: number }>();
        const order: string[] = [];
        for (const p of pulls) {
          for (const m of p.memberStats ?? []) {
            if (m.role === 'pet') continue;
            const key = `${m.role}\0${m.name}`;
            const ex = totals.get(key);
            if (ex) {
              ex.damage += m.damage;
              ex.healing += m.healing;
            } else {
              totals.set(key, { role: m.role, damage: m.damage, healing: m.healing });
              order.push(key);
            }
          }
        }
        const groupDmg = [...totals.values()].reduce((n, t) => n + t.damage, 0);
        for (const key of order) {
          const name = key.split('\0')[1]!;
          const t = totals.get(key)!;
          if (t.role === 'player') {
            roleGrades.push({
              name,
              role: state.squadRole ?? 'dps',
              detail: groupDmg > 0
                ? `${Math.round((t.damage / groupDmg) * 100)}% of group damage`
                : '0% of group damage',
            });
          } else if (t.role === 'tank') {
            roleGrades.push({
              name,
              role: 'tank',
              detail: t.damage > 0 ? `dealt ${t.damage} damage` : 'held the line',
            });
          } else if (t.role === 'healer') {
            roleGrades.push({
              name,
              role: 'healer',
              detail: t.healing > 0 ? `${t.healing} effective healing` : 'no healing needed',
            });
          } else if (t.role === 'dps') {
            roleGrades.push({
              name,
              role: 'dps',
              detail: groupDmg > 0
                ? `${Math.round((t.damage / groupDmg) * 100)}% of group damage`
                : '0% of group damage',
            });
          }
        }
      }

      const rBoss = routeBossProgress(def, state.instance);
      const routeIds = routeEncounterIdList(def, state.instance);
      // Match isComplete / nextEncounter: optional rares (e.g. Bruegal) do not gate clear.
      const requiredIds = routeIds.filter(
        (id) => encounterOf(def, id, state.instance)?.optional !== true,
      );
      const routeCleared = requiredIds.filter((id) => isCleared(state.instance!, id)).length;
      const density = state.instance.routeDensity ?? DEFAULT_ROUTE_DENSITY;
      const fusion = state.instance.pullFusion ?? DEFAULT_PULL_FUSION;
      const fullTrash = countRouteTrash(selectRouteEncounters(def, 'full'));
      const routeTrash = countRouteTrash(selectRouteEncounters(def, density));
      const routeComplete = isComplete(def, state.instance);
      const mailedStacks = Math.max(0, (state.mailbox ?? []).length - mailBefore);
      const summary = buildRunSummary({
        dungeonId: def.id,
        dungeonName: def.name,
        pulls,
        encounterTotal: requiredIds.length,
        bossTotal: rBoss.total,
        encountersCleared: routeCleared,
        bossesDown: rBoss.down,
        ...(stopReason ? { stopReason } : {}),
        roleGrades,
        keyMoments,
        routeDensity: density,
        pullFusion: fusion,
        packsAvailable: fullTrash,
        packsOnRoute: routeTrash,
        // Same completion rule as isComplete / live autopilot — skip optionals (KI-1051).
        routeComplete,
        ...(mailedStacks > 0 ? { mailedStacks } : {}),
      });
      // SAVE THE PLAYER: nothing had ever called applyLockout, so every raid's sourced reset delay was
      // inert and a raid could be re-run back to back forever. Five-mans keep 0 and are unaffected.
      if (def.lockoutMs > 0 && summary.bossesDown >= summary.bossTotal && summary.bossTotal > 0) {
        // Same session clock enterInstance/canEnter use — never Date.now() here (KI-1022).
        // Missing clock (pre-migrate save) skips the write rather than locking at epoch 0.
        const lockNow = state.instanceEnteredAtMs;
        if (lockNow != null) {
          state.lockouts = applyLockout(state.lockouts, def, lockNow);
          const days = Math.round(def.lockoutMs / 86_400_000);
          log(`You are now saved to ${def.name} for ${days} day${days === 1 ? '' : 's'}.`);
        }
      }
      const mins = Math.floor(summary.combatMs / 60000);
      const secs = Math.round((summary.combatMs % 60000) / 1000);
      log(
        `Dungeon run ${summary.outcome === 'clear' ? 'complete' : summary.outcome}: ` +
        `${summary.encountersCleared}/${summary.encounterTotal} encounters, ` +
        `bosses ${summary.bossesDown}/${summary.bossTotal}, ` +
        `${mins ? `${mins}m ` : ''}${secs}s fighting.`,
      );
      return { ok: true, summary };
}
