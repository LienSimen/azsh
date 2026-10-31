// Track-A squad model — RETIRED from production runs. Kept as a pure formula module for tests and
// reference; squad pulls are real withSquad sessions now. Pure: no DOM, DataStore or rng.

import { armorMitigation } from '../../engine/combat/mitigation.ts';

export interface SquadMemberContribution {
  name: string;
  role: 'tank' | 'healer' | 'dps';
  /** Damage per second measured from the member's own mini-sim (dps role). */
  dps?: number;
}

export interface SquadPullInputs {
  enemyMaxHp: number;
  /** Average unmitigated melee DPS of the enemy from its real creature def. */
  enemyDps: number;
  enemyLevel: number;
  /** The player's real sim: duration and total damage they dealt. */
  playerDurationMs: number;
  playerDamageDealt: number;
  tank?: { name: string; maxHealth: number; armor: number };
  healer?: { name: string; hps: number; healingBudget: number };
  dpsMembers: Array<{ name: string; dps: number }>;
}

export interface SquadPullModel {
  /** Modeled kill time with the whole group's damage on the target. */
  groupDurationMs: number;
  /** Who soaked the enemy: the tank when present, else the player's own sim already did. */
  tankIntake: number;
  healingUsed: number;
  healingBudget: number;
  /** Group-layer wipe: the tank died with the healer dry. */
  wiped: boolean;
  wipeReason?: string;
  /** Damage share per contributor (player + dps companions), summing to ~1. */
  dpsShare: Array<{ name: string; pct: number }>;
}

// Model one pull: group kill time is enemy HP over the summed damage rates. With a tank the
// enemy's DPS lands on them through the real armor curve, and intake past HP plus healing wipes.
export function modelSquadPull(inp: SquadPullInputs): SquadPullModel {
  const playerDps = inp.playerDurationMs > 0 ? inp.playerDamageDealt / (inp.playerDurationMs / 1000) : 0;
  const groupDps = playerDps + inp.dpsMembers.reduce((n, m) => n + Math.max(0, m.dps), 0);
  const groupDurationMs = groupDps > 0 ? Math.round((inp.enemyMaxHp / groupDps) * 1000) : inp.playerDurationMs;

  const shares: Array<{ name: string; pct: number }> = [];
  if (groupDps > 0) {
    shares.push({ name: 'you', pct: playerDps / groupDps });
    for (const m of inp.dpsMembers) shares.push({ name: m.name, pct: Math.max(0, m.dps) / groupDps });
  }

  let tankIntake = 0;
  let healingUsed = 0;
  let wiped = false;
  let wipeReason: string | undefined;
  const healingBudget = inp.healer?.healingBudget ?? 0;

  if (inp.tank) {
    // Real armor curve: Unit.cpp CalcArmorReducedDamage via engine/mitigation.
    const mit = armorMitigation(inp.tank.armor, inp.enemyLevel);
    tankIntake = Math.round(inp.enemyDps * (1 - mit) * (groupDurationMs / 1000));
    const deficit = tankIntake - inp.tank.maxHealth;
    if (deficit > 0) {
      healingUsed = Math.min(deficit, healingBudget);
      // The healer also has to land it in time: cap by hps × duration.
      const hpsCap = (inp.healer?.hps ?? 0) * (groupDurationMs / 1000);
      healingUsed = Math.min(healingUsed, hpsCap);
      if (deficit > healingUsed) {
        wiped = true;
        wipeReason = inp.healer
          ? healingBudget <= hpsCap
            ? `${inp.tank.name} died - ${inp.healer.name} ran out of mana`
            : `${inp.tank.name} died - the damage came in faster than ${inp.healer.name} could heal`
          : `${inp.tank.name} died with no healer`;
      }
    }
  }

  return { groupDurationMs, tankIntake, healingUsed, healingBudget, wiped, wipeReason, dpsShare: shares };
}
