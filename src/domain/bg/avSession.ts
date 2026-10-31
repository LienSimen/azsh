// Streams an AV creature into the one endless session when a player seat comes near, and hands the
// seat back when the fight leaves — both halves, as liveAggroStream.ts:545-612 does for the floor.

import type { BgTeam, BgUnit, BgUnitId } from './types.ts';
import type { BgWorld } from './bgWorld.ts';
import type { AvField } from './avField.ts';
import type { CombatantSpec } from '../../engine/combat.ts';
import { COMBAT_DROP_YD } from '../../engine/combat/creatureLeash.ts';
import { STOREY_DZ_YD } from '../nav/storey.ts';

/** How close an NPC gets to a player seat before it becomes a combat body. */
export const AV_SEAT_YD = 55;
/** Seat handed back at this range. Wider than AV_SEAT_YD by the floor's own margin (48 -> 64), so a
 *  body on the band edge is not streamed in and dropped on the same sync. */
export const AV_UNSEAT_YD = 73;
/** Seats an AV match hands to NPCs, live at once. The ally figure leaves room under MAX_ALLIES (78)
 *  for the 39 player seats and their pets. */
export const AV_MAX_NPC_ALLIES = 24;
export const AV_MAX_NPC_ENEMIES = 40;

/** Only the part of CombatSession this bridge touches — domain does not depend on the whole API. */
export interface AvCombatSession {
  injectEnemy(spec: CombatantSpec, position?: { x: number; y: number; z?: number }): string | null;
  injectAlly?(spec: CombatantSpec, position?: { x: number; y: number; z?: number }): string | null;
  setUnitPosYd(side: string, pos: { x: number; y: number; z?: number }): void;
  unitPosYd?(side: string): { x: number; y: number; z?: number } | null | undefined;
  viewOfSide?(side: string): { hp: number; maxHp: number; engaged?: boolean } | null;
  disengageEnemySides?(sides: readonly string[]): number;
  disengageAllySides?(sides: readonly string[]): number;
}

export interface AvSessionOpts {
  world: BgWorld;
  field: AvField;
  session: AvCombatSession;
  /** The side the PLAYER is on — an NPC of this team is injected as an ally, else as an enemy. */
  playerTeam: BgTeam;
  /** CombatantSpec for a creature entry; null leaves the body world-only. */
  specOf(entry: number): CombatantSpec | null;
  /** Called once per injected body, so the screen can keep its own side ↔ unit maps. */
  onSeated?(unit: BgUnit, side: string): void;
  /** The seat this body held is being handed back — the screen drops its own side ↔ unit maps. */
  onReleased?(unit: BgUnit, side: string): void;
  /** An injected NPC just died in the session — the caller banks the AV kill. */
  onKilled?(unit: BgUnit, entry: number, by: BgTeam): void;
  seatYd?: number;
  unseatYd?: number;
}

export interface AvSessionBridge {
  /** Seat what is in reach, mirror what is seated, release what the fight left. */
  sync(): void;
  /** side ↔ npc unit id, for the caller's chip/feed lookups. */
  sideOf(unitId: BgUnitId): string | undefined;
  seatedCount(): { allies: number; enemies: number };
}

export function createAvSessionBridge(o: AvSessionOpts): AvSessionBridge {
  const { world, field, session } = o;
  const seatYd = o.seatYd ?? AV_SEAT_YD;
  const unseatYd = Math.max(o.unseatYd ?? AV_UNSEAT_YD, seatYd + 1);
  const sideByNpc = new Map<BgUnitId, string>();
  const npcBySide = new Map<string, BgUnitId>();
  /** Seats held RIGHT NOW. Counting lifetime injects instead is what made the field go inert. */
  let allies = 0;
  let enemies = 0;

  /** Player seats — every unit that is NOT an NPC. Both teams: an enemy bot pulls guards too. */
  function seats(): BgUnit[] {
    const out: BgUnit[] = [];
    for (const u of world.units.values()) {
      if (u.npc || !world.alive(u)) continue;
      out.push(u);
    }
    return out;
  }

  /** Nearest player seat ON THE SAME STOREY. Irondeep Mine sits 28-49 yd under the Alliance start,
   *  so a planar band gave all 40 enemy seats to troggs in a cave and the match never left the gate. */
  function nearestSeatDist(u: BgUnit, near: readonly BgUnit[]): number {
    let best = Infinity;
    for (const s of near) {
      if (Math.abs((s.z ?? 0) - (u.z ?? 0)) > STOREY_DZ_YD) continue;
      const dx = s.pos.x - u.pos.x;
      const dy = s.pos.y - u.pos.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < best) best = d2;
    }
    return best === Infinity ? Infinity : Math.sqrt(best);
  }

  function seat(unit: BgUnit): void {
    const spec = o.specOf(unit.npc!.entry);
    if (!spec) return;
    const pos = { x: unit.pos.x, y: unit.pos.y, z: unit.z };
    let side: string | null = null;
    // A neutral body is hostile to everyone, so it only ever takes an ENEMY seat. Seating it as an
    // ally put half the valley's wildlife — boars, wolves, dreadmaws — inside the player's raid.
    if (unit.team === o.playerTeam && !unit.npc?.neutral) {
      if (allies >= AV_MAX_NPC_ALLIES || !session.injectAlly) return;
      side = session.injectAlly(spec, pos);
      if (side) allies++;
    } else {
      if (enemies >= AV_MAX_NPC_ENEMIES) return;
      side = session.injectEnemy(spec, pos);
      if (side) enemies++;
    }
    if (!side) return;
    // A seat the session recycled off a corpse still carries the dead body's mapping. Drop that
    // first, or two npc ids answer to one side and the corpse keeps writing over the new occupant.
    const previous = npcBySide.get(side);
    if (previous != null && previous !== unit.id) sideByNpc.delete(previous);
    sideByNpc.set(unit.id, side);
    npcBySide.set(side, unit.id);
    o.onSeated?.(unit, side);
  }

  /** Give the seat back. `dropOnly` is a body the session already took off the board (a corpse). */
  function release(id: BgUnitId, side: string, dropOnly: boolean): void {
    sideByNpc.delete(id);
    npcBySide.delete(side);
    const u = world.units.get(id);
    const wasAlly = u ? (u.team === o.playerTeam && !u.npc?.neutral) : side.startsWith('ally');
    if (wasAlly) allies = Math.max(0, allies - 1);
    else enemies = Math.max(0, enemies - 1);
    if (!dropOnly) {
      if (wasAlly) session.disengageAllySides?.([side]);
      else session.disengageEnemySides?.([side]);
      // De-streaming a LIVING body is an evade, and an evade heals: the same reset
      // releaseEnemyToPassive does, so the chip and the next inject agree. Cite: EnterEvadeMode.
      if (u) u.hp = u.maxHp;
    }
    if (u) o.onReleased?.(u, side);
  }

  return {
    sync() {
      if (world.ended || !world.gatesOpen) return;
      const near = seats();

      // 1. release what the fight left, FIRST, so the freed seats are available this same sync. An
      //    engaged body keeps its seat out to COMBAT_DROP_YD. Cite: liveAggroStream.ts:571-605.
      for (const [id, side] of [...sideByNpc]) {
        const u = world.units.get(id);
        if (!u) { release(id, side, true); continue; }
        if (!world.alive(u)) continue; // the mirror below owns the death, and it drops the seat
        const v = session.viewOfSide?.(side);
        const engaged = !!v && v.hp > 0 && v.hp < v.maxHp;
        if (nearestSeatDist(u, near) > (engaged ? COMBAT_DROP_YD : unseatYd)) release(id, side, false);
      }

      // 2. seat what the fight has reached
      for (const u of field.npcs()) {
        if (!world.alive(u) || sideByNpc.has(u.id)) continue;
        if (nearestSeatDist(u, near) <= seatYd) seat(u);
      }

      // 3. mirror the seated bodies: world position in, session health out
      for (const [id, side] of [...sideByNpc]) {
        const u = world.units.get(id);
        if (!u) { release(id, side, true); continue; }
        // Chase on top of wander: session owns while engaged; world wander owns OOC.
        // Cite: MotionMaster.cpp:615 Interrupt + :130 top()->Update.
        const v = session.viewOfSide?.(side);
        if (world.alive(u)) {
          if (v?.engaged === true) {
            const at = session.unitPosYd?.(side);
            if (at) {
              u.pos = { x: at.x, y: at.y };
              world.settleZ(u);
            }
          } else {
            session.setUnitPosYd(side, { x: u.pos.x, y: u.pos.y, z: u.z });
          }
        }
        if (!v || v.maxHp <= 0) continue;
        u.hp = Math.max(0, Math.min(u.maxHp, Math.round((v.hp / v.maxHp) * u.maxHp)));
        if (u.hp > 0 || u.deadUntilMs != null) continue;
        // The killer is whoever it was fighting: an NPC only ever dies to the other side. A
        // NEUTRAL body has no side to be opposite of — it only ever takes an enemy seat here, so
        // the kill is the player team's, not the team `neutralSideFor` parked its body on.
        const by: BgTeam = u.npc!.neutral
          ? o.playerTeam
          : (u.team === 'alliance' ? 'horde' : 'alliance');
        // A battleground creature does not respawn on the 30 s cycle - its node event does it.
        world.kill(u, Number.MAX_SAFE_INTEGER);
        o.onKilled?.(u, u.npc!.entry, by);
        // The corpse is the session's to recycle; the bridge stops holding the seat for it.
        release(id, side, true);
      }
    },

    sideOf: (unitId) => sideByNpc.get(unitId),
    seatedCount: () => ({ allies, enemies }),
  };
}
