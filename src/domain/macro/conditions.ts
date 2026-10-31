// The condition table, one entry per Roid-Macros keyword, evaluated against a MacroSnapshot.
// Groups OR and conditions inside a group AND. An unknown key FAILS and is reported.

import { macroGroupUnit, type MacroCond, type MacroParseIssue, type MacroProgram } from './parse.ts';
import {
  hasAuraNamed, hpPct, powerPct, type MacroSnapshot, type MacroUnitSnap,
} from './snapshot.ts';
import { macroCreatureTypeMatches } from './creatureTypes.ts';
import {
  MACRO_UNIT_PLAYER, MACRO_UNIT_TARGETTARGET, parseMacroUnit, type MacroUnitRef,
} from './units.ts';

interface CondCtx {
  /** The clause's unit (explicit `@unit`, else target, else player when autoSelfCast). */
  unit: MacroUnitSnap | null;
  snap: MacroSnapshot;
}

type CondFn = (c: MacroCond, ctx: CondCtx) => boolean;

/** Compare a measured value against `key>N` / `key<N`. Roid uses strict < / > (Conditionals.lua:224). */
function cmpPasses(c: MacroCond, value: number): boolean {
  if (c.cmp == null || c.amount == null) return false;
  return c.cmp === '>' ? value > c.amount : value < c.amount;
}

/** The unit a `foo:<unit>` value names, defaulting to the clause unit. */
function namedUnit(c: MacroCond, ctx: CondCtx): MacroUnitSnap | null {
  const ref = c.values[0] ? parseMacroUnit(c.values[0]) : null;
  return ref ? ctx.snap.unit(ref) : ctx.unit;
}

/** The unit REFERENCE a `foo:<unit>` value names, defaulting to the clause unit's own. */
function namedUnitRef(c: MacroCond, ctx: CondCtx): MacroUnitRef | null {
  const ref = c.values[0] ? parseMacroUnit(c.values[0]) : null;
  return ref ?? ctx.unit?.ref ?? null;
}

/** `my*` reads the PLAYER's aura bar; the bare forms read the clause unit's. */
const auraCond = (
  which: 'buffs' | 'debuffs',
  onSelf: boolean,
  want: boolean,
): CondFn => (c, ctx) => {
  const u = onSelf ? ctx.snap.unit(MACRO_UNIT_PLAYER) : ctx.unit;
  const query = c.values[0] ?? '';
  if (!u || !query) return false;
  return hasAuraNamed(u[which], query) === want;
};

const meterCond = (
  self: boolean,
  read: (u: MacroUnitSnap) => number,
): CondFn => (c, ctx) => {
  const u = self ? ctx.snap.unit(MACRO_UNIT_PLAYER) : ctx.unit;
  if (!u) return false;
  return cmpPasses(c, read(u));
};

export const MACRO_COND_KEYS: Record<string, CondFn> = {
  // A unit named but not understood by the parser lands here: never true.
  never: () => false,

  // ---- target validity (Conditionals.lua:13-40, :383) --------------------------------
  // help / harm are UnitCanAssist / UnitCanAttack on the clause unit, and the unit must exist.
  help: (_c, ctx) => !!ctx.unit && ctx.unit.canAssist,
  harm: (_c, ctx) => !!ctx.unit && ctx.unit.canAttack,
  target: (_c, ctx) => !!ctx.unit,
  exists: (_c, ctx) => !!ctx.unit,
  noexists: (_c, ctx) => !ctx.unit,

  // ---- state (Conditionals.lua:387-421) ---------------------------------------------
  dead: (c, ctx) => { const u = namedUnit(c, ctx); return !!u && u.dead; },
  nodead: (c, ctx) => { const u = namedUnit(c, ctx); return !!u && !u.dead; },
  combat: (_c, ctx) => ctx.snap.combat,
  nocombat: (_c, ctx) => !ctx.snap.combat,
  stealth: (_c, ctx) => ctx.snap.stealthed,
  nostealth: (_c, ctx) => !ctx.snap.stealthed,

  // ---- form / modifiers (Conditionals.lua:349-381) ----------------------------------
  stance: (c, ctx) => c.values.some((v) => Number(v) === ctx.snap.stanceIndex),
  nostance: (c, ctx) => !c.values.some((v) => Number(v) === ctx.snap.stanceIndex),
  mod: (c, ctx) => {
    const { shift, ctrl, alt } = ctx.snap.mods;
    if (!c.values.length) return shift || ctrl || alt;
    // Roid ANDs the listed modifiers: any one not held fails the condition.
    return c.values.every((v) => {
      const low = v.toLowerCase();
      if (low === 'shift') return shift;
      if (low === 'ctrl' || low === 'control') return ctrl;
      if (low === 'alt') return alt;
      return false;
    });
  },

  // ---- gear (Conditionals.lua:131-168, :403-412) ------------------------------------
  // Roid binds worn/noworn to nil locals so they never fire there; ours implement the intent.
  equipped: (c, ctx) => c.values.some((v) => ctx.snap.hasWeaponType(v)),
  noequipped: (c, ctx) => !c.values.some((v) => ctx.snap.hasWeaponType(v)),
  worn: (c, ctx) => c.values.some((v) => ctx.snap.hasWeaponType(v)),
  noworn: (c, ctx) => !c.values.some((v) => ctx.snap.hasWeaponType(v)),

  // ---- group (Conditionals.lua:171-186, :422-437) -----------------------------------
  party: (c, ctx) => { const u = namedUnit(c, ctx); return !!u && u.inParty; },
  raid: (c, ctx) => { const u = namedUnit(c, ctx); return !!u && u.inRaid; },
  group: (c, ctx) => {
    const want = (c.values[0] ?? '').toLowerCase();
    if (want === 'party') return ctx.snap.group.party > 0;
    if (want === 'raid') return ctx.snap.group.raid > 0;
    // Roid returns false without a value; a bare [group] reading "I am grouped" is friendlier.
    return ctx.snap.group.party > 0 || ctx.snap.group.raid > 0;
  },

  // ---- auras (Conditionals.lua:443-473) ---------------------------------------------
  buff: auraCond('buffs', false, true),
  nobuff: auraCond('buffs', false, false),
  debuff: auraCond('debuffs', false, true),
  nodebuff: auraCond('debuffs', false, false),
  mybuff: auraCond('buffs', true, true),
  nomybuff: auraCond('buffs', true, false),
  mydebuff: auraCond('debuffs', true, true),
  nomydebuff: auraCond('debuffs', true, false),

  // ---- meters (Conditionals.lua:218-256, :475-497) ---------------------------------
  hp: meterCond(false, hpPct),
  myhp: meterCond(true, hpPct),
  power: meterCond(false, powerPct),
  mypower: meterCond(true, powerPct),
  rawpower: meterCond(false, (u) => u.power),
  myrawpower: meterCond(true, (u) => u.power),

  // ---- identity (Conditionals.lua:258-268, :499-543) --------------------------------
  type: (c, ctx) => {
    const u = ctx.unit;
    if (!u || !c.values.length) return false;
    // The host may hand us the label, the id, or both; either answers the doc's eleven names.
    const label = (u.creatureTypeName ?? '').toLowerCase();
    return c.values.some((v) => {
      const low = v.trim().toLowerCase().replace(/_/g, ' ');
      if (label && low === label) return true;
      return macroCreatureTypeMatches(v, u.creatureType);
    });
  },
  isplayer: (c, ctx) => { const u = namedUnit(c, ctx); return !!u && u.isPlayer; },
  isnpc: (c, ctx) => { const u = namedUnit(c, ctx); return !!u && !u.isPlayer; },

  // ---- cooldowns / channels (Conditionals.lua:271-333, :503-525) -------------------
  // An unknown name asserts nothing: both forms are false, rather than claiming "ready".
  cooldown: (c, ctx) => {
    const rem = ctx.snap.cooldownRemainingMs(c.values[0] ?? '');
    return rem != null && rem > 0;
  },
  nocooldown: (c, ctx) => {
    const rem = ctx.snap.cooldownRemainingMs(c.values[0] ?? '');
    return rem != null && rem === 0;
  },
  channeled: (_c, ctx) => ctx.snap.channel.spellName !== '',
  nochanneled: (_c, ctx) => ctx.snap.channel.spellName === '',

  // ---- who is hitting whom (Conditionals.lua:527-533) ------------------------------
  attacks: (c, ctx) => {
    const ref = namedUnitRef(c, ctx);
    return !!ref && ctx.snap.unitIs(MACRO_UNIT_TARGETTARGET, ref);
  },
  noattacks: (c, ctx) => {
    const ref = namedUnitRef(c, ctx);
    return !!ref && !ctx.snap.unitIs(MACRO_UNIT_TARGETTARGET, ref);
  },
};

/** Aliases the client / other addons use for the same check. */
MACRO_COND_KEYS.modifier = MACRO_COND_KEYS.mod;
MACRO_COND_KEYS.nomod = (c, ctx) => !MACRO_COND_KEYS.mod!(c, ctx);
MACRO_COND_KEYS.nomodifier = MACRO_COND_KEYS.nomod;

export function isMacroCondKey(key: string): boolean {
  return Object.hasOwn(MACRO_COND_KEYS, key);
}

/** First matching `[…]` group, with that group's own `@unit` (not a sibling's). */
export function firstPassingGroup(
  groups: readonly MacroCond[][],
  defaultUnit: MacroUnitSnap | null,
  snap: MacroSnapshot,
): { unitRef?: MacroUnitRef } | null {
  if (!groups.length) return {};
  for (const group of groups) {
    const unitRef = macroGroupUnit(group);
    const ctx: CondCtx = { unit: unitRef ? snap.unit(unitRef) : defaultUnit, snap };
    let all = true;
    for (const cond of group) {
      const fn = MACRO_COND_KEYS[cond.key];
      if (!fn || !fn(cond, ctx)) { all = false; break; }
    }
    if (all) return { unitRef };
  }
  return null;
}

/** Every condition in a group must pass; any passing group passes the clause. */
export function condsPass(
  groups: readonly MacroCond[][],
  defaultUnit: MacroUnitSnap | null,
  snap: MacroSnapshot,
): boolean {
  return firstPassingGroup(groups, defaultUnit, snap) != null;
}

/** Parse issues plus unknown-condition-name issues — what the editor lists under the body box. */
export function validateMacroProgram(program: MacroProgram): MacroParseIssue[] {
  const out: MacroParseIssue[] = [...program.issues];
  for (const line of program.lines) {
    for (const clause of line.clauses) {
      for (const group of clause.groups) {
        for (const cond of group) {
          if (cond.key === 'never') continue; // already reported by the parser
          if (!isMacroCondKey(cond.key)) {
            out.push({ line: line.n, message: `unknown condition "${cond.key}"` });
          } else if (cond.cmp != null && !CMP_KEYS.has(cond.key)) {
            out.push({ line: line.n, message: `"${cond.key}" does not take ${cond.cmp}N` });
          }
        }
      }
    }
  }
  return out;
}

/** Keys that accept `>N` / `<N`. */
const CMP_KEYS: ReadonlySet<string> = new Set([
  'hp', 'myhp', 'power', 'mypower', 'rawpower', 'myrawpower',
]);

/** Player-facing help rows (the editor's "Conditions" table). Text stays plain and literal. */
export const MACRO_COND_HELP: ReadonlyArray<{ key: string; text: string }> = [
  { key: '@unit', text: 'act on that unit: player, target, pet, focus, mouseover, npc, party1-4, partypet1-4, raid1-40, raidpet1-40' },
  { key: '@unittarget', text: "that unit's target; chain up to three deep, e.g. @party1target" },
  { key: 'help / harm', text: 'the unit must be friendly / attackable' },
  { key: 'exists / noexists', text: 'the unit is there / is not' },
  { key: 'dead / nodead', text: 'the unit is dead / alive' },
  { key: 'combat / nocombat', text: 'you are fighting / not fighting' },
  { key: 'stealth / nostealth', text: 'you are stealthed / not' },
  { key: 'stance:1/3', text: 'your stance or form bar slot is one of these' },
  { key: 'nostance:2', text: 'you are not in that stance or form bar slot (0 = you are in a form)' },
  { key: 'mod / mod:shift', text: 'a modifier is held (shift, ctrl, alt)' },
  { key: 'equipped:Shields', text: 'that weapon type is equipped (worn: is the same check). /equip Shields pulls the first shield in your bags' },
  { key: '/use 13', text: 'use the item in that paperdoll slot: 13/14 trinkets, 16 main hand, 17 off hand' },
  { key: 'party / raid', text: 'the unit is in your party / raid' },
  { key: 'group:party', text: 'you are in a party (or raid)' },
  { key: 'buff:Name', text: 'the unit has that aura; nobuff, debuff, nodebuff too' },
  { key: 'mybuff:Name', text: 'YOU have that aura; nomybuff, mydebuff, nomydebuff too' },
  { key: 'hp<35', text: 'the unit is below 35% health; myhp is yours' },
  { key: 'power>40', text: 'the unit is above 40% power; mypower is yours' },
  { key: 'rawpower>30', text: 'flat power instead of percent; myrawpower is yours' },
  { key: 'type:Undead', text: 'the unit is that creature type' },
  { key: 'isplayer / isnpc', text: 'the unit is a player / an NPC' },
  { key: 'cooldown:Name', text: 'that spell or item is on cooldown; nocooldown is ready' },
  { key: 'channeled / nochanneled', text: 'you are channelling / are not' },
  { key: 'attacks:player', text: 'your target is attacking that unit; noattacks is the reverse' },
];
