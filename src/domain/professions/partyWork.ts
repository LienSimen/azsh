// Who in the group does a skill job — gather, pick a lock, pick a pocket — and who takes the point.
// Among members who MEET the requirement, prefer one who can still gain, best chance first.

/** One member who could do the job. */
export interface PartyWorker {
  /** Companion id, or undefined for the player. */
  compId?: string;
  name: string;
  /** GetSkillValue for the line (pure trained + MOD_SKILL for the player). */
  skill: number;
  /** Trained cap for the line, so an at-cap member is never offered a point. */
  max: number;
  // Skill-up chance this act would roll for this member, in tenths of a percent (domain/professions
  // skillGainTenths). 0 = no point is reachable.
  gainTenths: number;
}

/** Why nobody could do it, with the closest member named. */
export interface PartyWorkRefusal {
  /** Required skill value the group could not reach. */
  required: number;
  /** Best value anyone in the group holds for the line (0 when nobody has it at all). */
  best: number;
  /** Who holds `best`, when anyone does. */
  bestName?: string;
}

// The member who does the job, from a candidate list that ALREADY meets the requirement. Ordering
// is total and deterministic, tie-broken by arrival order, so a re-render cannot move the point.
export function pickPartyWorker(
  candidates: readonly PartyWorker[],
): PartyWorker | undefined {
  let best: PartyWorker | undefined;
  for (const c of candidates) {
    if (!best) { best = c; continue; }
    const canGain = c.gainTenths > 0;
    const bestCanGain = best.gainTenths > 0;
    // A member who can still gain always beats one who cannot.
    if (canGain !== bestCanGain) {
      if (canGain) best = c;
      continue;
    }
    if (canGain) {
      // Both can gain: the better chance is the lower skill against this act — the one who
      // needs it most. Equal chance keeps the earlier member (player, then squad order).
      if (c.gainTenths > best.gainTenths) best = c;
      else if (c.gainTenths === best.gainTenths && c.skill < best.skill) best = c;
      continue;
    }
    // Nobody gains anything: the most skilled hand does it.
    if (c.skill > best.skill) best = c;
  }
  return best;
}

// The closest the group got, for an honest refusal. Takes EVERY member who has the line at all (not just
// those who qualify), so "Kelanor has 60" can be said instead of "you lack it".
export function nearestPartyWorker(
  holders: readonly PartyWorker[],
  required: number,
): PartyWorkRefusal {
  let best: PartyWorker | undefined;
  for (const h of holders) {
    if (!best || h.skill > best.skill) best = h;
  }
  return {
    required,
    best: best?.skill ?? 0,
    ...(best ? { bestName: best.name } : {}),
  };
}

// Refusal line for a group that cannot reach `required`: names the skill and, when anyone has the
// line, who came closest — never "you lack the skill" when your herbalist is 40 short.
export function partyWorkRefusalReason(
  skillName: string,
  r: PartyWorkRefusal,
): string {
  if (r.bestName && r.best > 0) {
    return `Needs ${skillName} ${r.required} - ${r.bestName} has ${r.best}`;
  }
  return `Needs ${skillName} ${r.required} - nobody in the group has it`;
}
