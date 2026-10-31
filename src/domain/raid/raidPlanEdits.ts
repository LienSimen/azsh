// The player's edits to a fight plan, as pure transforms. Here, not in the press handler, so
// smoke runs the same code (rotationEditorRaidActions cannot be imported outside a browser).

import {
  RAID_RESPONSE_TAKES_YD,
  RAID_ROW_YD_MAX,
  RAID_ROW_YD_MIN,
  nextRaidCustomRowId,
  type RaidCustomRow,
  type RaidResponseKind,
  type RaidTriggerKind,
  type RaidTriggerOn,
} from './raidCustomRows.ts';

/** Retune one shipped row. Setting the chip back to the pack's number removes the override. */
export function setRaidRowYd(
  current: Readonly<Record<string, number>> | undefined,
  ruleId: string,
  yd: number,
  defaultYd: number | null,
): Record<string, number> {
  const next = { ...(current ?? {}) };
  if (!ruleId || !Number.isFinite(yd)) return next;
  const clamped = Math.min(Math.max(Math.round(yd), RAID_ROW_YD_MIN), RAID_ROW_YD_MAX);
  if (defaultYd != null && clamped === defaultYd) delete next[ruleId];
  else next[ruleId] = clamped;
  return next;
}

/** Flip a shipped row's on/off state. A row of the player's flips its own `enabled` instead. */
export function toggleRaidRowOff(
  current: readonly string[] | undefined,
  ruleId: string,
): string[] {
  const off = new Set(current ?? []);
  if (off.has(ruleId)) off.delete(ruleId);
  else off.add(ruleId);
  return [...off];
}

/** The fields the draft editor writes. `editId` updates in place; `editShippedId` clones. */
export interface RaidRowDraftSave {
  slug: string;
  entry: number;
  trigger: RaidTriggerKind;
  aura: number;
  on: RaidTriggerOn;
  response: RaidResponseKind;
  yd: number;
  stacks?: number;
  bossHpBelow?: number;
  /** Existing custom row id. Absent = append. */
  editId?: string;
  /** Shipped rule id to switch off when cloning into a custom row. */
  editShippedId?: string;
}

/** Write the draft: update a custom row, or append one (and switch off the shipped row it replaces). */
export function saveRaidRowDraft(
  rows: readonly RaidCustomRow[] | undefined,
  off: readonly string[] | undefined,
  draft: RaidRowDraftSave,
): { raidRows: RaidCustomRow[]; raidRowsOff: string[] } {
  const built: Omit<RaidCustomRow, 'id'> = {
    slug: draft.slug,
    entry: draft.entry,
    aura: draft.aura,
    on: draft.response === 'taunt' ? 'tank' : draft.on,
    response: draft.response,
    trigger: draft.trigger,
    enabled: true,
    ...(RAID_RESPONSE_TAKES_YD.has(draft.response) ? { yd: draft.yd } : {}),
    ...(draft.stacks != null && draft.stacks > 1 ? { stacks: draft.stacks } : {}),
    ...(draft.bossHpBelow != null ? { bossHpBelow: draft.bossHpBelow } : {}),
  };
  const raidRowsOff = [...(off ?? [])];
  if (draft.editId) {
    return {
      raidRows: (rows ?? []).map((r) => {
        if (r.id !== draft.editId) return r;
        const next: RaidCustomRow = { ...r, ...built, id: r.id };
        if (!RAID_RESPONSE_TAKES_YD.has(draft.response)) delete next.yd;
        if (draft.stacks == null || draft.stacks <= 1) delete next.stacks;
        if (draft.bossHpBelow == null) delete next.bossHpBelow;
        return next;
      }),
      raidRowsOff,
    };
  }
  if (draft.editShippedId && !raidRowsOff.includes(draft.editShippedId)) {
    raidRowsOff.push(draft.editShippedId);
  }
  const current = rows ?? [];
  return {
    raidRows: [...current, { id: nextRaidCustomRowId(current), ...built }],
    raidRowsOff,
  };
}
