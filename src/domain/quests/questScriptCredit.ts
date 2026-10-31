// A kill objective the player can never pull: friendly to every race AND noXp, the exact pair
// beginFight refuses. Cite: combatSession.ts:578-586 `scriptOnlyCredit = !!cdef.noXp`.

import type { DataStore } from '../../data/dataStore.ts';
import { isFriendlyPlayerFactionTemplate } from '../creature/outdoorHuntable.ts';
import { unitCannotBeAttacked } from '../creature/unitFlags.ts';
import { questFightEventQuestId } from './questFight.ts';
import type { QuestLog } from './questlog.ts';

export type ScriptCreditCreature =
  { factionId?: number; noXp?: boolean; unitFlags?: number } | null | undefined;

export function isScriptCreditOnlyCreature(c: ScriptCreditCreature): boolean {
  // Unit::CanAttack refuses the whole mask, so the credit marker behind "Capture Crown Guard Tower"
  // or "Lunar Fireworks Fired" is never a pull whatever its faction. Cite: Relations.cpp:365.
  if (c && unitCannotBeAttacked(c)) return true;
  if (!c?.noXp) return false;
  return isFriendlyPlayerFactionTemplate(c.factionId);
}

/** Tamed Kodo 11627 (desolace.cpp:163-172 gossip credit) is the shape; Binding's Voidwalker is not. */
export function isScriptCreditOnlyTarget(ds: DataStore, entry: number, log?: QuestLog): boolean {
  if (!isScriptCreditOnlyCreature(ds.creature(entry))) return false;
  // The one escape beginFight keeps: a quest script that opens the fight itself.
  return log ? questFightEventQuestId(ds, log, entry) == null : true;
}
