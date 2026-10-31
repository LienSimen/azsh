// Session-side TARGET_T and spell-list target resolution, as pure helpers — createSession supplies
// the living unit snapshots and the RNG. Cite: CreatureEventAI.cpp GetTargetByType ~1710–1817.
import {
  selectTarget,
  type SelectTargetCtx,
  type SelectTargetFriendly,
  type SelectTargetHostile,
  type SelectTargetRng,
  type SelectTargetSource,
} from '../../domain/creature/aiTargeting.ts';
import type { Fighter } from './types.ts';

export type BuildSelectTargetCtxArgs = {
  caster: Fighter;
  victimId: string | null;
  threatList: readonly string[];
  hostiles: readonly SelectTargetHostile[];
  friendlies: readonly SelectTargetFriendly[];
  playerSide: string;
  spellId?: number;
  /** Required Unit::getClass(). Cite: SharedDefines.h:65-79; boss_nefarian.cpp:270. */
  selectClass?: number;
  /** Friendly-searcher range gate. Cite: UnitAI.cpp:764-771; boss_bug_trio.cpp:371 50.0f. */
  friendlyMaxRangeYd?: number;
  /** SELECT_FLAG_IN_MELEE_RANGE. Cite: boss_twinemperors.cpp:256. */
  requireInMelee?: boolean;
  rng?: SelectTargetRng;
};

/** Build SelectTargetCtx for EventAI / spell-list / ScriptDev cast + non-cast actions. */
export function buildSelectTargetCtx(args: BuildSelectTargetCtxArgs): SelectTargetCtx {
  return {
    selfId: args.caster.side,
    victimId: args.victimId,
    threatList: args.threatList,
    hostiles: args.hostiles,
    friendlies: args.friendlies,
    actionInvokerId: args.playerSide,
    playerInvokerId: args.playerSide,
    playerTappedId: args.playerSide,
    spellId: args.spellId ?? 0,
    ...(args.selectClass != null && args.selectClass > 0 ? { selectClass: args.selectClass | 0 } : {}),
    ...(args.friendlyMaxRangeYd != null && args.friendlyMaxRangeYd > 0
      ? { friendlyMaxRangeYd: args.friendlyMaxRangeYd }
      : {}),
    ...(args.requireInMelee === true ? { requireInMelee: true } : {}),
    rng: args.rng,
  };
}

// Resolve a TARGET_T_* / spell-list TargetId to a live Fighter via shared selectTarget. Returns null on
// selection failure / existence-only AOE.
export function resolveSelectTargetFighter(
  mode: number,
  ctx: SelectTargetCtx,
  source: SelectTargetSource,
  lookup: (id: string) => Fighter | null,
  self: Fighter,
): Fighter | null {
  const res = selectTarget(mode, ctx, source);
  if (!res.ok || res.id == null || res.existenceOnly) return null;
  if (res.id === self.side) return self;
  return lookup(res.id);
}
