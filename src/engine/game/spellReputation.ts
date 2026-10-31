// SPELL_EFFECT_REPUTATION applied to the player's standings. One copy shared by the OOC cast applier
// and the bag on-use path, so the two cannot drift on Diplomacy or the log line.

import type { DataStore } from '../../data/dataStore.ts';
import type { SpellDef } from '../../data/schema.ts';
import type { Character } from '../../domain/character/character.ts';
import { getActiveBuffIds } from '../../domain/character/character.ts';
import { rewardSpellReputation, reputationAuraModFromSpells } from '../../domain/creature/reputation.ts';

/** SPELL_AURA_MOD_REPUTATION_GAIN (156) percent from the caster's own live buffs. */
function activeRepMod(char: Character, ds: DataStore, now: number): number {
  const spells = getActiveBuffIds(char, now, ds)
    .map((id) => ds.spell(id))
    .filter((s): s is SpellDef => !!s);
  return reputationAuraModFromSpells(spells);
}

/** Apply one effect-103 grant. Returns the char unchanged when the faction has no row. */
export function grantSpellReputation(
  char: Character,
  factionId: number,
  amount: number,
  ds: DataStore,
  now: number,
  log: (msg: string) => void,
): Character {
  if (!factionId || !amount) return char;
  const repMod = activeRepMod(char, ds, now);
  const res = rewardSpellReputation({
    factionId,
    repChange: amount,
    playerLevel: char.level,
    raceId: char.race,
    classId: char.cls,
    reputations: char.reputations ?? {},
    factions: ds.factions(),
    rates: ds.reputationRates(),
    spillover: ds.reputationSpillover(),
    flags: char.factionFlags ?? {},
    ...(repMod ? { repMod } : {}),
  });
  const out: Character = {
    ...char,
    reputations: res.reputations,
    factionFlags: res.flags ?? char.factionFlags,
  };
  for (const a of res.applied) {
    if (a.delta === 0) continue;
    const facName = ds.faction(a.faction)?.name ?? `faction ${a.faction}`;
    log(`${a.delta > 0 ? '+' : ''}${a.delta} reputation with ${facName}`);
  }
  return out;
}

/** Apply every effect-103 row on a resolved spell (Destroy Bijou grants and conjures). */
export function grantSpellReputationEffects(
  char: Character,
  effects: readonly SpellDef['effects'][number][] | undefined,
  ds: DataStore,
  now: number,
  log: (msg: string) => void,
): Character {
  let out = char;
  for (const e of effects ?? []) {
    if (e.kind !== 'reputation') continue;
    out = grantSpellReputation(out, e.factionId | 0, e.amount | 0, ds, now, log);
  }
  return out;
}
