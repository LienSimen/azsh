// Who can learn a teach item out of the player's bags — a recipe, an enchant formula, a class book or
// a pet grimoire. Pure: DataStore and party state in, candidate list out. The UI builds the picker.

import type { DataStore } from '../../data/dataStore.ts';
import type { ItemDef } from '../../data/schema.ts';
import type { Character } from '../character/character.ts';
import type { SpellBook } from '../character/spellbook.ts';
import type { Companion } from '../bots/squad.ts';
import { companionLevel, companionSkillMap, companionSpellbook } from '../bots/squad.ts';
import { className } from '../core/ids.ts';
import { knows } from '../character/spellbook.ts';
import { petRepertoireHas } from '../pet/pet.ts';
import { isSpellFitByClassAndRace, spellHasClassRestrictingAbility } from '../character/combatSkills.ts';
import { itemTeachIntent, type ItemTeach } from '../items/itemTeaches.ts';

export type LearnOnWho = 'self' | string; // companion id

// Every body the engine will actually teach, deduped by id. MUST stay the same three pools the squad
// lookup uses: reading only two hid a 39-man raid's hunters from a tome they could learn.
export function learnOnCompanionPool(
  squad: readonly Companion[] | undefined,
  botRoster: Readonly<Record<string, Companion>> | undefined,
  raidMembers: Readonly<Record<string, Companion>> | undefined,
): Companion[] {
  const byId = new Map<string, Companion>();
  for (const c of squad ?? []) byId.set(c.id, c);
  for (const c of Object.values(botRoster ?? {})) byId.set(c.id, c);
  for (const c of Object.values(raidMembers ?? {})) byId.set(c.id, c);
  return [...byId.values()];
}

/** Teach kinds a party member other than the player can study. */
export type LearnOnKind = 'recipe' | 'enchant' | 'spell' | 'petSpell';

export interface LearnOnCandidate {
  who: LearnOnWho;
  name: string;
  /** e.g. "Blacksmithing 150" for a recipe, "Druid 54" for a class book. */
  skillLabel?: string;
  /** Short reason when ineligible (shown greyed); omit when ok. */
  reason?: string;
  /** They already hold it. A book nobody can read for THIS reason is vendor stock. */
  known?: boolean;
}

export interface LearnOnProbe {
  teach: ItemTeach;
  kind: LearnOnKind;
  teachName: string;
  /** Requirement line under the title, already worded for this kind. Empty = no line. */
  reqLabel: string;
  /** What to say when nobody can take the book. */
  noneLabel: string;
  /** Eligible first, then rejected (so the UI can list "who can" prominently). */
  candidates: LearnOnCandidate[];
  eligibleCount: number;
}

// Probe everyone in the party who might study this item. A profession tier book returns null, since
// it raises the READER's own line. A body who cannot use it is greyed, not dropped.
export function probeLearnOnTargets(
  itemEntry: number,
  ds: DataStore,
  char: Character,
  companions: readonly Companion[],
  /** The player's own spellbook — needed to grey "Already known" on a class book. */
  playerBook?: SpellBook,
): LearnOnProbe | null {
  const it = ds.item(itemEntry);
  const teach = itemTeachIntent(it, ds);
  if (!it) return null;
  if (teach?.kind === 'spell' || teach?.kind === 'petSpell') {
    return probeSpellBook(it, teach, ds, char, companions, playerBook);
  }
  if (!teach || (teach.kind !== 'recipe' && teach.kind !== 'enchant')) return null;

  let teachName = '';
  let skillLine: keyof Character['skills'] | null = null;
  let reqSkill = 0;
  if (teach.kind === 'recipe') {
    const r = ds.recipe(teach.id);
    if (!r) return null;
    teachName = r.name;
    skillLine = r.skill;
    reqSkill = r.orange | 0;
  } else {
    const e = ds.enchant(teach.id);
    if (!e) return null;
    teachName = e.name;
    skillLine = 'enchanting';
    reqSkill = e.orange | 0;
  }

  const skillName = skillLine
    ? (ds.profession(skillLine as never)?.name ?? String(skillLine))
    : 'Unknown';

  const candidates: LearnOnCandidate[] = [];
  /** Does this body already hold the row? Same catalog per kind for the player and a companion. */
  const holds = (b: { knownRecipes?: number[]; knownEnchants?: number[] }): boolean => (
    teach.kind === 'recipe'
      ? (b.knownRecipes ?? []).includes(teach.id)
      : (b.knownEnchants ?? []).includes(teach.id)
  );

  // The player is ALWAYS listed. "Who already has it" is the question this picker exists to
  // answer, and an omitted row reads as "not here" rather than "untrained" or "knows it".
  {
    const skill = skillLine ? char.skills[skillLine] : undefined;
    const known = holds(char);
    const reason = known ? 'Already known'
      : !skill ? `Learn ${skillName} first`
        : undefined;
    candidates.push({
      who: 'self',
      name: char.name || 'You',
      ...(skill ? { skillLabel: `${skillName} ${skill.current}` } : {}),
      ...(reason ? { reason } : {}),
      ...(known ? { known } : {}),
    });
  }

  for (const comp of companions) {
    const lvl = companionLevel(comp, char.level);
    const skills = companionSkillMap(comp, lvl);
    const skill = skillLine ? skills[skillLine] : undefined;
    // No profession at all → the book can never reach that body, so it is not a row.
    if (!skill) continue;
    // Below the orange they cannot take it, but the row is LISTED, not dropped: a dropped row
    // cannot say "Enchanting 150", and the player reads that absence as "nobody has it".
    const known = holds(comp);
    const reason = known ? 'Already known'
      : comp.mission ? 'Away on a mission'
        : skill.current < reqSkill ? `Needs ${skillName} ${reqSkill}`
          : undefined;
    candidates.push({
      who: comp.id,
      name: comp.name,
      skillLabel: `${skillName} ${skill.current}`,
      ...(reason ? { reason } : {}),
      ...(known ? { known } : {}),
    });
  }

  const eligibleCount = candidates.filter((c) => !c.reason).length;
  // Eligible first for the list order the player wants.
  candidates.sort((a, b) => Number(!!a.reason) - Number(!!b.reason));

  return {
    teach,
    kind: teach.kind,
    teachName,
    reqLabel: `Requires ${skillName} (${reqSkill})`,
    noneLabel: `Nobody can learn that. Need ${skillName} ${reqSkill}+ and not already known`,
    candidates,
    eligibleCount,
  };
}

// Nobody can read it, and the only reason is that everyone who could already has. A skill or level
// gate can still lift later, so those stay protected; this one is vendor stock.
export function teachKnownToAll(probe: LearnOnProbe): boolean {
  return probe.eligibleCount === 0
    && probe.candidates.length > 0
    && probe.candidates.every((c) => c.known);
}

// Nobody can read it because nobody has the LINE it is written on — no blacksmith for a smithing
// plan, no mage for a mage tome. Every candidate that holds the profession or the class carries a
// skillLabel ("Blacksmithing 150", "Mage 54"), and probeSpellBook drops a body of the wrong class
// outright, so an empty list or a list with no skillLabel on it means the book has no reader here.
// A "Needs Cooking 175" or "Needs level 40" row is NOT this: that gate lifts on its own, and the
// never-sell box keeps guarding it.
export function teachUnreachable(probe: LearnOnProbe): boolean {
  return probe.eligibleCount === 0
    && probe.candidates.every((c) => !c.skillLabel);
}

// Class book and pet grimoire: both are per-BODY reads with no skill line, gated on AllowableClass,
// RequiredLevel and the taught spell's own level. A companion of the wrong class never appears.
function probeSpellBook(
  it: ItemDef,
  teach: Extract<ItemTeach, { kind: 'spell' | 'petSpell' }>,
  ds: DataStore,
  char: Character,
  companions: readonly Companion[],
  playerBook?: SpellBook,
): LearnOnProbe | null {
  const sp = ds.spell(teach.id);
  if (!sp) return null;
  const teachName = sp.rank > 0 ? `${sp.name} (Rank ${sp.rank})` : sp.name;
  const allow = it.allowClass;
  const reqLevel = Math.max(it.requiredLevel | 0, sp.reqLevel | 0);
  const classLabel = allow?.length ? allow.map(className).join(' / ') : '';
  const reqLabel = [
    classLabel ? `${classLabel} only` : '',
    reqLevel > 0 ? `requires level ${reqLevel}` : '',
  ].filter(Boolean).join(' · ');

  const fits = (cls: number): boolean => !allow?.length || allow.includes(cls);
  // Empty AllowableClass: require a nonzero classMask SLA. Measured 9 such kind=spell
  // items, 3 refuse (5657 Instant Toxin + deprecated 2404/2405). Cite: Player.cpp:18369.
  const meta = ds.combatSkillMeta?.();
  const fitsBody = (race: number, cls: number, level: number): boolean => (
    fits(cls)
    && (teach.kind === 'petSpell'
      || ((!!allow?.length || spellHasClassRestrictingAbility(teach.id, meta))
        && isSpellFitByClassAndRace(teach.id, race, cls, meta, level)))
  );
  /** Greyed reason for someone the book's class gate already accepted. */
  const rejectFor = (level: number, taught: boolean): string | undefined => (
    taught ? 'Already known' : level < reqLevel ? `Needs level ${reqLevel}` : undefined
  );
  const candidates: LearnOnCandidate[] = [];

  if (fits(char.cls)) {
    const taught = teach.kind === 'petSpell'
      ? petRepertoireHas(char.petSpells ?? [], teach.id, ds)
      : !!playerBook && knows(playerBook, teach.id);
    const reason = rejectFor(char.level, taught);
    candidates.push({
      who: 'self',
      name: char.name || 'You',
      skillLabel: `${className(char.cls)} ${char.level}`,
      ...(reason ? { reason } : {}),
      ...(taught ? { known: true } : {}),
    });
  }

  for (const comp of companions) {
    const lvl = companionLevel(comp, char.level);
    if (!fitsBody(comp.race, comp.cls, lvl)) continue;
    const taught = teach.kind === 'petSpell'
      ? petRepertoireHas(comp.petSpells ?? [], teach.id, ds)
      : knows(companionSpellbook(comp, lvl, ds), teach.id);
    const reason = comp.mission ? 'Away on a mission' : rejectFor(lvl, taught);
    candidates.push({
      who: comp.id,
      name: comp.name,
      skillLabel: `${className(comp.cls)} ${lvl}`,
      ...(reason ? { reason } : {}),
      ...(taught ? { known: true } : {}),
    });
  }

  const eligibleCount = candidates.filter((c) => !c.reason).length;
  candidates.sort((a, b) => Number(!!a.reason) - Number(!!b.reason));

  return {
    teach,
    kind: teach.kind,
    teachName,
    reqLabel,
    noneLabel: classLabel
      ? `Nobody can learn that. Need a ${classLabel} of level ${reqLevel} who does not know it yet`
      : 'Nobody in the party can learn that yet',
    candidates,
    eligibleCount,
  };
}
