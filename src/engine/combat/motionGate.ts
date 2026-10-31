// WHY a unit did not move, named at the gate that stopped it. More than twenty early returns stop a
// unit dead and from outside they are indistinguishable. Diagnosis only — nothing reads it back.

// The gate that resolved a unit's motion this tick, in `advanceGapClose` order. `stepped` is the only one
// that means the unit actually walked.
export type MotionGateName =
  /** No geometry on this session — motion never runs. */
  | 'noPositions'
  | 'dead'
  | 'casting'
  | 'charging'
  | 'channeling'
  /** Root / stun / incapacitate / SESSILE. */
  | 'immobile'
  /** Fear, DoFlee, NO_MELEE_FLEE — forced flight, not a stop. */
  | 'fleeing'
  | 'totem'
  /** A rotation `move` row owns the unit. */
  | 'mechanicMove'
  /** Held key / stick. */
  | 'moveIntent'
  /** After-cast authored retreat. */
  | 'stepBack'
  /** Click-to-move / RTS order is walking it. */
  | 'moveOrder'
  /** The player holds motion (kiting latch) — gap-close may not take over. */
  | 'manualMotion'
  | 'petCommand'
  | 'guardianFollow'
  | 'spiritFollow'
  /** RTS stance hold / passive. */
  | 'stance'
  /** Enemy with an empty threat list: no pull yet. */
  | 'notEngaged'
  /** cfg.friendlyHoldYd bubble — walking home, not toward a foe. */
  | 'holdGround'
  /** cfg.partyFollowYd bubble — no target in acquire range, walking back to the leader. */
  | 'partyFollow'
  /** EventAI / ScriptDev combat movement off: stands and fights, never gap-closes. */
  | 'noCombatMovement'
  | 'noTarget'
  /** `foeOf`'s "no living hostiles" sentinel handed back the unit itself. */
  | 'targetIsSelf'
  /** One of the two units has no position this tick. */
  | 'noPose'
  /** Different floor: dz past STOREY_DZ_YD, which folds combat distance out of range. */
  | 'storeyMismatch'
  | 'pastAcquire'
  /** Past COMBAT_DROP_YD: the leash dropped the fight. Cite: CombatManager.cpp:41. */
  | 'combatDrop'
  /** 100% snare / immobilised by aura stack. */
  | 'speedZero'
  /** The unreachable watchdog fired and the unit evaded. */
  | 'unreachable'
  /** A higher-priority arm owns motion this tick (motionClaim.ts). */
  | 'claimHeldBy'
  /** Already inside its stand band with range, storey and LOS. */
  | 'inRange'
  /** `movement: 'hold'` never closes voluntarily. */
  | 'policyHold'
  /** The step would walk inside an unpulled passive's GetAttackDistance — chain pull. */
  | 'wouldPull'
  /** No melee weapon and no fireable range: nothing to close for. */
  | 'noWeapon'
  /** The claim was taken but no corridor reached the slot — stand and fight. */
  | 'noRoute'
  | 'stepped';

/** Inputs the gate read, when it read any. Absent means the gate did not measure it. */
export interface MotionGateInfo {
  dist?: number;
  acquire?: number;
  dz?: number;
  threat?: number;
  ms?: number;
  owner?: string;
}

/** What `session.motionExplain(side)` hands back: the gate plus whatever it measured. */
export interface MotionGateReport extends MotionGateInfo {
  gate: MotionGateName;
  /** `ctx.t` of the tick that wrote this row. */
  at: number;
}

export type MotionGates = {
  /** Record the gate that resolved this side's motion. Last write in a tick wins. */
  mark: (side: string, gate: MotionGateName, at: number, info?: MotionGateInfo) => void;
  /** This side's last gate, or null when motion has never resolved it. */
  read: (side: string) => MotionGateReport | null;
  /** Every side that has a row — the shape `navDiag()` returns. */
  all: () => Record<string, MotionGateReport>;
};

/** Live row: fixed shape, mutated in place, so a 40-man raid allocates once per side. */
interface LiveGate {
  gate: MotionGateName;
  at: number;
  dist: number;
  acquire: number;
  dz: number;
  threat: number;
  ms: number;
  owner: string;
}

/** NaN / '' is "the gate did not measure this", which `report` drops rather than pass on. */
function report(r: LiveGate): MotionGateReport {
  const out: MotionGateReport = { gate: r.gate, at: r.at };
  if (Number.isFinite(r.dist)) out.dist = r.dist;
  if (Number.isFinite(r.acquire)) out.acquire = r.acquire;
  if (Number.isFinite(r.dz)) out.dz = r.dz;
  if (Number.isFinite(r.threat)) out.threat = r.threat;
  if (Number.isFinite(r.ms)) out.ms = r.ms;
  if (r.owner !== '') out.owner = r.owner;
  return out;
}

export function createMotionGates(): MotionGates {
  const live = new Map<string, LiveGate>();
  return {
    mark: (side, gate, at, info) => {
      let r = live.get(side);
      if (!r) {
        r = {
          gate, at, dist: Number.NaN, acquire: Number.NaN, dz: Number.NaN,
          threat: Number.NaN, ms: Number.NaN, owner: '',
        };
        live.set(side, r);
      }
      r.gate = gate;
      r.at = at;
      r.dist = info?.dist ?? Number.NaN;
      r.acquire = info?.acquire ?? Number.NaN;
      r.dz = info?.dz ?? Number.NaN;
      r.threat = info?.threat ?? Number.NaN;
      r.ms = info?.ms ?? Number.NaN;
      r.owner = info?.owner ?? '';
    },
    read: (side) => {
      const r = live.get(side);
      return r ? report(r) : null;
    },
    all: () => {
      const out: Record<string, MotionGateReport> = {};
      for (const [side, r] of live) out[side] = report(r);
      return out;
    },
  };
}
