// Out-of-combat regen, rest accrual and auto-consumables. Owns the already-booked rest guard and the
// NaN guards, plus the game binding that lets auto-consumables reach consumeItem.

import { mulberry32, hashSeed } from '../core/rng.ts';
import {
  maxHealth, clampResourcePools, resistances,
} from '../../domain/character/character.ts';
import {
  pickAutoConsume,
} from '../../domain/bots/autoConsumables.ts';
import { restTypeForZone, isCityOrInnRest, capitalZoneIds } from '../../domain/world/restArea.ts';
import {
  createHazardState,
  setEnvironment,
  setBreathingMultiplier,
  tick as tickHazards,
} from '../../domain/world/hazards.ts';
import {
  effectiveMagicResistancePercent,
  rollMagicResistanceMultiplier,
} from '../combat/mitigation.ts';
import { hazardsForZone } from '../../world/zoneHazards.ts';
import { regen, computeRestGain, clampRestBonus } from '../../progression/rest.ts';
import { isPlayerAlive } from '../../domain/run/death.ts';
import type { Game } from './types.ts';
import type { GameCtx } from './context.ts';
import { reconcileGamePartyAuras } from './partyAuras.ts';
import { tickTimedQuests } from './tickTimedQuests.ts';
import { HEALTHSTONE_UPKEEP_MS, runHealthstoneUpkeep } from './healthstoneUpkeep.ts';

export type RegenRestGameRef = { current: Game | null };

export type RegenRestExtras = {
  /** Late-bound after Game object is built so tryAutoConsumables can call consumeItem. */
  gameRef: RegenRestGameRef;
  applyOocRegen: (seconds: number, sitting: boolean, regenFn: typeof regen) => void;
};

export function createRegenRestModule(
  ctx: GameCtx,
  extras: RegenRestExtras,
): Pick<Game, 'regenTick' | 'accrueOfflineRest'> {
  const { ds, state, log } = ctx;
  const { gameRef, applyOocRegen } = extras;

  const tickQuestTimers = (dtMs: number): void => {
    tickTimedQuests(state.questlog.quests, dtMs, (entry) => {
      const title = ds.quest(entry)?.title ?? `Quest ${entry}`;
      log(`Quest failed: ${title}.`);
    });
  };

  // Rest areas: a capital zone is CITY, else any zone with a tavern trigger is TAVERN, and CITY wins
  // when both apply. Leaving the inn's zone is this port's proxy for leaving the inn.
  const inRestArea = (): boolean =>
    isCityOrInnRest(restTypeForZone(state.char.zoneId, ds.tavernTriggers(), capitalZoneIds(ds.zones())));

  // Accrue rested XP into the character, clamped at 0.75 of the next level. In-game accrual only
  // inside a rest area; offline accrual everywhere, with the wilderness quarter rate in the helper.
  const accrueRest = (seconds: number, offline: boolean): void => {
    // NaN <= 0 is false — must isFinite or restedXp becomes NaN (KI-783).
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    const nextLevelXp = ds.xpToNext(state.char.level);
    if (!Number.isFinite(nextLevelXp) || nextLevelXp <= 0) return;
    const city = inRestArea();
    if (!offline && !city) return; // in-game rest only accrues in a rest area
    const gain = computeRestGain(seconds, city, 1, nextLevelXp, { offline });
    if (!Number.isFinite(gain) || gain <= 0) return;
    state.char = {
      ...state.char,
      restedXp: clampRestBonus((state.char.restedXp ?? 0) + gain, nextLevelXp),
    };
  };

  // OOC auto-consumables (regenTick): one food/drink/buff per tick from player prefs. Mirrors tryAutoFeed —
  // silent no-op when out of stock or still topped up / buffed.
  const tryAutoConsumables = (): void => {
    // Dead: no auto food/drink (KI-906). Cite: Player.cpp:1515 regen only if IsAlive.
    if (!gameRef.current || !isPlayerAlive(state.char.health, state.deathFlow)) return;
    const act = pickAutoConsume(
      state.char,
      state.inventory,
      ds,
      state.char.autoConsumables,
    );
    if (!act) return;
    const prefer =
      act.kind === 'food' ? 'food' as const
      : act.kind === 'drink' ? 'drink' as const
      : undefined;
    gameRef.current.consumeItem(act.entry, prefer);
  };

  // Party healthstone upkeep, on the same out-of-combat clock as the auto-consumables: a stone that
  // got eaten is replaced without a dungeon zone-in. squadDungeon.ts:741 is the run it repeats.
  let stoneAccS = 0;
  const tryHealthstoneUpkeep = (seconds: number): void => {
    if (!isPlayerAlive(state.char.health, state.deathFlow)) return;
    stoneAccS += seconds;
    if (stoneAccS < HEALTHSTONE_UPKEEP_MS / 1000) return;
    stoneAccS = 0;
    runHealthstoneUpkeep(state, ds, log);
  };

  return {
    regenTick(seconds, sitting, opts) {
      // Invalid dt must not touch vitals/restedXp (KI-783). regen() / accrueRest also guard.
      if (!Number.isFinite(seconds) || seconds < 0) return;
      // A single Player::Update clock, which the C++ advances by one diff. This is the play-screen
      // wall clock, combat included — do not also bind the session step, or timers fail twice.
      tickQuestTimers(Math.round(seconds * 1000));
      // Dead / ghost: no spirit regen, food auto-consume, or rest accrual (KI-906).
      // Cite: Player.cpp:1515–1519 RegenerateAll only when IsAlive(); Unit.h IsAlive.
      if (!isPlayerAlive(state.char.health, state.deathFlow)) return;
      // Buffs expire on the WALL CLOCK while the player idles, and max health drops the instant a
      // stamina buff lapses — but stored health was never clamped, so the HUD showed above max.
      reconcileGamePartyAuras(state, ds);
      state.char = clampResourcePools(state.char, ds);
      // Hunter auto-feed runs after each OOC quantum (bulk auto-feed steps in pets.ts).
      applyOocRegen(seconds, sitting, regen);
      // Player auto-consumables (food/drink when low, buffs when missing aura).
      tryAutoConsumables();
      // A party warlock keeps one healthstone on every member, this tick's share of the 30 s clock.
      tryHealthstoneUpkeep(seconds);

      // In-game rested accrual inside a rest area, skipped when the caller is replaying a background
      // gap it already booked: inside an inn both paths run at the same rate and doubled the pool.
      if (!opts?.restAlreadyBooked) accrueRest(seconds, false);

      // Environmental hazards on the out-of-combat tick. Zones are unflagged by design, so there is
      // no damage until zone hazards are authored. Cite: domain/world/hazards.ts.
      if (seconds > 0 && state.char.health > 0) {
        const flags = hazardsForZone(state.char.zoneId);
        let hz = state.hazards ?? createHazardState();
        hz = setEnvironment(hz, flags);
        // Water-breathing suppress is latent until those auras are wired OOC (honest inert).
        hz = setBreathingMultiplier(hz, hz.breathingMultiplier);
        const rng = mulberry32(hashSeed(state.rngSeed, state.fightCounter++));
        const res = resistances(state.char, ds);
        const fireRes = res.fire ?? 0;
        const mitigateFire = (raw: number): number => {
          // EnvironmentalDamage DAMAGE_LAVA → fire-school resist table.
          // Cite: Player.cpp EnvironmentalDamage ~1004; mitigation.ts.
          const percent = effectiveMagicResistancePercent({
            school: 'fire',
            resistance: fireRes,
            penetration: 0,
            attackerLevel: state.char.level,
            victimLevel: state.char.level,
            binary: false,
            victimIsNpc: false,
          });
          const resisted = rollMagicResistanceMultiplier({
            percent,
            binary: false,
            damageType: 'spell',
            attackerPlayerControlled: false,
            rng,
          });
          return Math.max(0, Math.round(raw * (1 - resisted)));
        };
        const tickRes = tickHazards(hz, Math.round(seconds * 1000), {
          maxHp: maxHealth(state.char, ds),
          level: state.char.level,
          rng,
          mitigateFire,
        });
        state.hazards = tickRes.state;
        for (const ev of tickRes.damageEvents) {
          state.char.health = Math.max(0, state.char.health - ev.amount);
          if (ev.kind === 'lava') {
            log(`The lava burns you for ${ev.amount} fire damage.`);
          } else if (ev.kind === 'drowning') {
            log(`You are drowning! (${ev.amount} damage)`);
          } else if (ev.kind === 'exhausted') {
            log(`You are exhausted! (${ev.amount} damage)`);
          }
        }
      }
    },

    accrueOfflineRest(seconds) {
      accrueRest(seconds, true);
    },
  };
}
