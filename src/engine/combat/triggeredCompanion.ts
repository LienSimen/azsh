// A TRIGGERED COMPANION IS NOT AN ACTION: the unit never SELECTS a payload, so no reader answering
// "what can this unit DO" may count one. 12 melee creatures otherwise read as ranged kits.

import { specialCasePayloadIds } from '../spells/specialCasePayloads.ts';
import { auraRemovePayloadIds } from '../spells/interpreter/handlers/aura-remove.ts';

type TriggerEffect =
  | { kind: 'trigger_spell'; spellId: number }
  | { kind: 'proc_trigger_spell'; triggerSpellId: number }
  | { kind: string };

/** The minimum a kit member must expose to take part in the walk. */
export type CompanionCandidate = {
  readonly id?: number;
  readonly effects?: readonly TriggerEffect[];
  readonly rawEffects?: readonly {
    readonly effect?: number;
    readonly auraName?: number;
    readonly triggerSpell?: number;
  }[];
};

// Ids in this kit that another member of the SAME kit triggers, keyed on array identity so a
// shapeshift misses the cache naturally. Without the memo it is kit^2 per unit per tick, 4.6%.
const cache = new WeakMap<object, Set<number>>();

export function triggeredIdsOf(spells: readonly CompanionCandidate[]): Set<number> {
  let ids = cache.get(spells as unknown as object);
  if (ids) return ids;
  ids = new Set<number>();
  for (const other of spells) {
    for (const e of other.effects ?? []) {
      const tid = e.kind === 'trigger_spell'
        ? (e as { spellId: number }).spellId
        : e.kind === 'proc_trigger_spell'
          ? (e as { triggerSpellId: number }).triggerSpellId
          : undefined;
      if (tid != null && other.id !== tid) ids.add(tid);
    }
    // The DBC row too: the bake sometimes collapses an aura-42 host into a dedicated kind, and the
    // parsed walk then cannot see the pair at all. Same fact, second spelling.
    for (const re of other.rawEffects ?? []) {
      const an = re.auraName ?? 0;
      if (an !== 23 && an !== 42 && (re.effect ?? 0) !== 64) continue;
      const tid = re.triggerSpell ?? 0;
      if (tid > 0 && other.id !== tid) ids.add(tid);
    }
    // And the payloads no DBC column names, because a C++ branch picks them from the victim's school
    // or the heal target's class. Cite: specialCasePayloads.ts; UnitAuraProcHandler.cpp:870-907.
    if (other.id != null) {
      for (const pid of specialCasePayloadIds(other.id)) {
        if (pid > 0 && other.id !== pid) ids.add(pid);
      }
      // And an aura-REMOVAL body's payload, cast when the aura ends. This walk never covered them:
      // 5 kit slots on 3 raid bosses were still selectable — Renataki, Huhuran, Grobbulus.
      for (const pid of auraRemovePayloadIds(other.id)) {
        if (pid > 0 && other.id !== pid) ids.add(pid);
      }
    }
  }
  cache.set(spells as unknown as object, ids);
  return ids;
}
