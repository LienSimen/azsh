// Macros in plain English. Pure, no DOM: Build-mode rows, the editor preview and the smoke goldens
// all read from here. Same voice as the rotation editor's rule rows.

import type { MacroCond, MacroClause, MacroLine, MacroVerb } from './parse.ts';
import { MACRO_CREATURE_TYPE_LABEL } from './creatureTypes.ts';
import { describeMacroUnit } from './units.ts';
import { describeMacroInvSlot } from './slots.ts';

/** What the verb does, as a verb phrase. */
export const MACRO_VERB_LABEL: Readonly<Record<MacroVerb, string>> = {
  cast: 'cast',
  use: 'use',
  equip: 'equip',
  equipoh: 'equip in the off hand',
  target: 'target',
  petattack: 'send your pet at',
  petfollow: 'call your pet back',
  petstay: 'make your pet stay',
  startattack: 'start attacking',
  stopattack: 'stop attacking',
  stopcasting: 'stop casting',
  unshift: 'leave your form',
  focus: 'set focus to',
  clearfocus: 'clear your focus',
  outfitter: 'change outfit',
};

/** Verbs that read as a complete sentence on their own (no argument to name). */
const NO_ARG_VERBS: ReadonlySet<MacroVerb> = new Set<MacroVerb>([
  'petfollow', 'petstay', 'startattack', 'stopattack', 'stopcasting', 'unshift', 'clearfocus',
]);

const listOf = (values: readonly string[], join = 'or'): string => {
  if (values.length <= 1) return values[0] ?? '';
  return `${values.slice(0, -1).join(', ')} ${join} ${values[values.length - 1]}`;
};

const pct = (c: MacroCond): string => `${c.cmp === '<' ? 'below' : 'above'} ${c.amount}%`;
const flat = (c: MacroCond): string => `${c.cmp === '<' ? 'below' : 'above'} ${c.amount}`;

/** The English for one condition. Unknown keys say so rather than reading as satisfied. */
export function describeMacroCond(cond: MacroCond): string {
  const v = cond.values;
  const first = v[0] ?? '';
  switch (cond.key) {
    case 'help': return 'the unit is friendly';
    case 'harm': return 'the unit can be attacked';
    case 'exists': return 'the unit is there';
    case 'noexists': return 'the unit is not there';
    case 'target': return `aimed at ${first}`;
    case 'dead': return 'the unit is dead';
    case 'nodead': return 'the unit is alive';
    case 'combat': return 'you are in combat';
    case 'nocombat': return 'you are out of combat';
    case 'stealth': return 'you are stealthed';
    case 'nostealth': return 'you are not stealthed';
    case 'stance':
      return v.length === 1 && v[0] === '0' ? 'you are not in a form' : `you are in form ${listOf(v)}`;
    case 'nostance':
      return v.length === 1 && v[0] === '0' ? 'you are in a form' : `you are not in form ${listOf(v)}`;
    case 'mod': return v.length ? `${listOf(v.map((m) => m.toUpperCase()))} is held` : 'a modifier is held';
    case 'nomod':
    case 'nomodifier': return 'no modifier is held';
    case 'modifier': return v.length ? `${listOf(v.map((m) => m.toUpperCase()))} is held` : 'a modifier is held';
    case 'equipped':
    case 'worn': return `you have ${listOf(v)} equipped`;
    case 'noequipped':
    case 'noworn': return `you have no ${listOf(v)} equipped`;
    case 'party': return 'the unit is in your party';
    case 'raid': return 'the unit is in your raid';
    case 'group': return first === 'raid' ? 'you are in a raid' : first === 'party' ? 'you are in a party' : 'you are grouped';
    case 'buff': return `the unit has ${first}`;
    case 'nobuff': return `the unit does not have ${first}`;
    case 'debuff': return `the unit is affected by ${first}`;
    case 'nodebuff': return `the unit is not affected by ${first}`;
    case 'mybuff': return `you have ${first}`;
    case 'nomybuff': return `you do not have ${first}`;
    case 'mydebuff': return `you are affected by ${first}`;
    case 'nomydebuff': return `you are not affected by ${first}`;
    case 'hp': return `the unit's health is ${pct(cond)}`;
    case 'myhp': return `your health is ${pct(cond)}`;
    case 'power': return `the unit's power is ${pct(cond)}`;
    case 'mypower': return `your power is ${pct(cond)}`;
    case 'rawpower': return `the unit's power is ${flat(cond)}`;
    case 'myrawpower': return `your power is ${flat(cond)}`;
    case 'type': {
      const known = Object.values(MACRO_CREATURE_TYPE_LABEL)
        .find((l) => l.toLowerCase() === first.toLowerCase().replace(/_/g, ' '));
      return `the unit is ${known ?? listOf(v)}`;
    }
    case 'isplayer': return 'the unit is a player';
    case 'isnpc': return 'the unit is an NPC';
    case 'cooldown': return `${first} is on cooldown`;
    case 'nocooldown': return `${first} is ready`;
    case 'channeled': return 'you are channelling';
    case 'nochanneled': return 'you are not channelling';
    case 'attacks': return `your target is attacking ${first}`;
    case 'noattacks': return `your target is not attacking ${first}`;
    case 'never': return 'never (this condition could not be read)';
    default: return `"${cond.key}" is not a condition I know`;
  }
}

/** One `;` branch, described. */
export interface MacroBranchDescription {
  /** What it acts on: a spell/item name, a unit phrase, a `{macro}` call, or ''. */
  action: string;
  /** The unit the action is aimed at, when one is named. */
  unit?: string;
  /** Every condition, in bracket order. Groups are OR-ed, so they read as "or". */
  conds: string[];
  /** True when the branch has more than one OR-group (`[a][b]`). */
  anyGroup: boolean;
}

export interface MacroLineDescription {
  n: number;
  verb: MacroVerb;
  verbLabel: string;
  branches: MacroBranchDescription[];
}

/** The action phrase for a branch: `{Macro}` call, unit, argument, or nothing. */
function branchAction(clause: MacroClause, verb: MacroVerb): string {
  if (clause.call) return `the macro ${clause.call}`;
  if (clause.arg) {
    const slot = (verb === 'use' || verb === 'equip' || verb === 'equipoh')
      ? describeMacroInvSlot(clause.arg) : null;
    const name = slot ? `your ${slot}` : clause.arg;
    return clause.noRecast ? `${name} (only if it is not already running)` : name;
  }
  if (clause.argUnit) return describeMacroUnit(clause.argUnit);
  if (NO_ARG_VERBS.has(verb)) return '';
  if (clause.unit) return describeMacroUnit(clause.unit);
  return '';
}

export function describeMacroLine(line: MacroLine): MacroLineDescription {
  return {
    n: line.n,
    verb: line.verb,
    verbLabel: MACRO_VERB_LABEL[line.verb],
    branches: line.clauses.map((clause) => {
      // `@unit` shows as the aim, not as a condition — it is the same information twice.
      const conds = clause.groups.flat().filter((c) => c.key !== 'target').map(describeMacroCond);
      const aimed = clause.argUnit && clause.arg ? undefined : clause.unit;
      return {
        action: branchAction(clause, line.verb),
        unit: aimed && (clause.arg || clause.call) ? describeMacroUnit(aimed) : undefined,
        conds,
        anyGroup: clause.groups.length > 1,
      };
    }),
  };
}

/** One-line English for a whole macro line (preview text, goldens, aria labels). */
export function describeMacroLineText(line: MacroLine): string {
  const d = describeMacroLine(line);
  const parts = d.branches.map((b) => {
    const at = b.unit ? ` at ${b.unit}` : '';
    const head = `${d.verbLabel}${b.action ? ` ${b.action}` : ''}${at}`;
    if (!b.conds.length) return head;
    const joiner = b.anyGroup ? ' or ' : ' and ';
    return `${head} when ${b.conds.join(joiner)}`;
  });
  if (!parts.length) return d.verbLabel;
  return parts.join('; otherwise ');
}
