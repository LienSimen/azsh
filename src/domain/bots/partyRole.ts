// One party role model for every unit in the group, the player included — before this the human
// had no `groupRole`, so every role-gated party behaviour silently skipped them.

import type { DataStore } from '../../data/dataStore.ts';
import type { Character } from '../character/character.ts';
import { roleSpecOverride } from './companionRotation.ts';
import { primarySpec } from '../rotation/spec.ts';

/** Engine-side role name. `SquadRole`'s 'dps' is spelled 'damage' on a Fighter spec. */
export type PartyRole = 'tank' | 'healer' | 'damage';

const FORM_BEAR = 5;
const FORM_DIREBEAR = 8;

// The role this character plays in a party. `explicit` is the user's own pick (`state.squadRole`) and
// always wins; otherwise it comes off their talents.
export function partyRoleOf(
  char: Character,
  ds: DataStore,
  explicit?: 'tank' | 'healer' | 'dps',
): PartyRole {
  if (explicit === 'tank' || explicit === 'healer') return explicit;
  if (explicit === 'dps') return 'damage';
  // A druid in bear is tanking by definition, whatever the tree says (Feral is one tree for
  // both cat and bear, so the spec name cannot answer this).
  const form = char.form ?? 0;
  if (char.cls === 11 && (form === FORM_BEAR || form === FORM_DIREBEAR)) return 'tank';
  let spec: string;
  try {
    spec = primarySpec(char, ds);
  } catch {
    return 'damage'; // sparse fixture datastore with no talent trees
  }
  if (spec && spec === roleSpecOverride(char.cls, 'tank')) return 'tank';
  if (spec && spec === roleSpecOverride(char.cls, 'healer')) return 'healer';
  // Discipline priest heals too; the companion band table only names Holy because that is the
  // build a hired healer is stamped with, not because Disc is a damage spec.
  if (char.cls === 5 && spec === 'Discipline') return 'healer';
  return 'damage';
}
