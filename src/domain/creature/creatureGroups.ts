// spawn_group members that aggro as one (CREATURE_GROUP_AGGRO_TOGETHER). Cite: SpawnGroup.cpp:515.
// Rows: src/data/tables/creatureAggroGroups.json from out/bake.db — do not invent.

import aggroGroupsJson from '../../data/tables/creatureAggroGroups.json' with { type: 'json' };

/** CreatureGroupFlags::CREATURE_GROUP_AGGRO_TOGETHER — SpawnGroupDefines.h:76. */
export const CREATURE_GROUP_AGGRO_TOGETHER = 0x01;

type AggroGroupsFile = {
  groups: readonly (readonly number[])[];
  linkedGroups: readonly (readonly [number, number])[];
};

const file = aggroGroupsJson as AggroGroupsFile;

/** groupId → member guids (AGGRO_TOGETHER only). */
const membersByGroup = new Map<number, readonly number[]>();
/** guid → groupId */
const groupByGuid = new Map<number, number>();
/** groupId → linked group ids (spawn_group_linked_group). */
const linkedByGroup = new Map<number, number[]>();

for (const row of file.groups) {
  const id = row[0] | 0;
  const members = row.slice(1).map((g) => g | 0);
  membersByGroup.set(id, members);
  for (const g of members) groupByGuid.set(g, id);
}
for (const [id, linked] of file.linkedGroups) {
  const a = id | 0;
  const b = linked | 0;
  if (!linkedByGroup.has(a)) linkedByGroup.set(a, []);
  linkedByGroup.get(a)!.push(b);
}

/** spawn_group id for a guid, if that group has AGGRO_TOGETHER. */
export function aggroTogetherGroupId(guid: number): number | undefined {
  return groupByGuid.get(guid | 0);
}

/** Formation overlay on an existing spawn_group id — not a second membership table. */
export type SpawnGroupFormation = {
  groupId: number;
  type: number;
  spread: number;
  options: number;
  dynamic: boolean;
};

const formationByGroup = new Map<number, SpawnGroupFormation>();

export function spawnGroupFormation(groupId: number): SpawnGroupFormation | undefined {
  return formationByGroup.get(groupId | 0);
}

export function applySpawnGroupOp(op: {
  mode: 'create' | 'remove' | 'switch_shape' | 'set_spread' | 'set_options';
  groupId: number;
  formationType: number;
  spread: number;
  options: number;
  applied: boolean;
}): boolean {
  if (!op.applied) return false;
  const id = op.groupId | 0;
  if (!id) return false;
  if (op.mode === 'remove') return formationByGroup.delete(id);
  const prev = formationByGroup.get(id);
  if (op.mode === 'create' && prev) return false;
  if (op.mode !== 'create' && !prev) return false;
  formationByGroup.set(id, {
    groupId: id,
    type: op.formationType,
    spread: op.spread,
    options: op.options,
    dynamic: op.mode === 'create' ? true : (prev?.dynamic ?? false),
  });
  return true;
}

type SpawnGroupMode = 'create' | 'remove' | 'switch_shape' | 'set_spread' | 'set_options';

// Callers pass a DbScriptIntent union whose members each carry their own `mode` literals, so the
// parameter takes a plain string and this narrows it. Returns null for any mode that is not ours.
function asSpawnGroupMode(mode: string | undefined): SpawnGroupMode | null {
  switch (mode) {
    case 'create':
    case 'remove':
    case 'switch_shape':
    case 'set_spread':
    case 'set_options':
      return mode;
    default:
      return null;
  }
}

export function applySpawnGroupIntents(
  intents: ReadonlyArray<{
    kind: string;
    applied?: boolean;
    groupId?: number;
    formationType?: number;
    spread?: number;
    options?: number;
    mode?: string;
  }>,
): number {
  let n = 0;
  for (const i of intents) {
    const mode = asSpawnGroupMode(i.mode);
    if (i.kind !== 'spawn_group' || !i.applied || !mode) continue;
    if (applySpawnGroupOp({
      mode,
      groupId: i.groupId ?? 0,
      formationType: i.formationType ?? 0,
      spread: i.spread ?? 0,
      options: i.options ?? 0,
      applied: true,
    })) n++;
  }
  return n;
}

// Other guids that enter combat when `guid` does, via AGGRO_TOGETHER + linked groups. Linked groups only
// join when they themselves have the flag (TriggerLinkingEvent re-checks).
export function aggroTogetherMemberGuids(guid: number): readonly number[] {
  const gid = groupByGuid.get(guid | 0);
  if (gid == null) return [];
  const out = new Set<number>();
  const seen = new Set<number>();
  const visit = (id: number): void => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const g of membersByGroup.get(id) ?? []) {
      if (g !== (guid | 0)) out.add(g);
    }
    for (const next of linkedByGroup.get(id) ?? []) {
      if (membersByGroup.has(next)) visit(next);
    }
  };
  visit(gid);
  return [...out];
}
