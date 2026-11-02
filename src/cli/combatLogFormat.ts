// 1.12 combat-log wording (GlobalStrings.lua) + school/unit colours from
// Blizzard_CombatLog.lua COMBATLOG_DEFAULT_COLORS. Event buckets match COMBATLOG_EVENT_LIST.

import type { School } from '../data/schema.ts';
import type { CombatEvent, HitResult, Side } from '../engine/core/events.ts';
import { isAllySide, isEnemySide, isTotemSide } from '../engine/core/events.ts';
const SCHOOL_LABEL: Record<School, string> = { physical: 'physical', holy: 'holy', fire: 'fire', nature: 'nature', frost: 'frost', shadow: 'shadow', arcane: 'arcane' };
import {
  impliedDest,
  isLogHostile,
  isLogTeam,
  type CombatLogType,
} from './combatLogFilter.ts';

export type LogSeg = { text: string; cls?: string };

export type CombatLogNames = {
  playerName: string;
  enemyName: string;
  petName?: string;
  totemName?: (a: Side) => string | undefined;
  enemyNameOf?: (a: Side) => string | undefined;
  allyName?: (a: Side) => string | undefined;
  spellName?: (id: number) => string | undefined;
  spellHarmful?: (id: number) => boolean | undefined;
};

export type FormattedCombatLog = {
  segs: LogSeg[];
  cls: string;
  type: CombatLogType;
  source?: Side;
  dest?: Side;
  /** creature_text: the host expands $N/$C via questText. */
  speech?: string;
  /** Set on a passive power gain: the host adds ticks up into one line. */
  merge?: PowerMerge;
};

/** Regen ticks are one row per unit+power per quantum; `remake` re-words it at the running total. */
export type PowerMerge = {
  key: string;
  t: number;
  amount: number;
  remake: (amount: number) => FormattedCombatLog;
};

/** powerForm.ts:487 gains 1 energy per 100 ms; 1.12 shows one 20-energy tick per REGEN_TIME_FULL_MS. */
export const POWER_MERGE_MS = 2000;

const GLANCING = ' (glancing)';
const CRUSHING = ' (crushing)';
const BLOCK_T = (n: number) => ` (${n} blocked)`;

function schoolWord(s: School): string {
  return SCHOOL_LABEL[s] ?? s;
}

function unitCls(side: Side): string {
  if (side === 'player') return 'tw-clog-u-mine';
  if (side === 'pet' || isTotemSide(side)) return 'tw-clog-u-pet';
  if (isAllySide(side)) return 'tw-clog-u-friend';
  return 'tw-clog-u-hostile';
}

function schCls(s: School | 'heal'): string {
  return `tw-clog-sch-${s}`;
}

function nm(side: Side, name: string): LogSeg {
  return { text: name, cls: unitCls(side) };
}

function amt(n: number, school: School | 'heal'): LogSeg {
  return { text: String(n), cls: `tw-clog-amt ${schCls(school)}` };
}

function sp(name: string, school?: School | 'heal'): LogSeg {
  return { text: name, cls: school ? `tw-clog-sp ${schCls(school)}` : 'tw-clog-sp' };
}

function whoOf(a: Side, n: CombatLogNames): string {
  if (a === 'player') return n.playerName;
  if (a === 'pet') return n.petName ?? 'Pet';
  if (isTotemSide(a)) return n.totemName?.(a) ?? 'Totem';
  if (isAllySide(a)) return n.allyName?.(a) ?? a;
  if (isEnemySide(a)) return n.enemyNameOf?.(a) ?? n.enemyName;
  return n.enemyName;
}

function self(a: Side | undefined): boolean {
  return a === 'player';
}

function missType(result: HitResult, amount: number): CombatLogType | null {
  if (result === 'block' && amount > 0) return null;
  if (result === 'miss') return 'miss';
  if (result === 'dodge') return 'dodge';
  if (result === 'parry') return 'parry';
  if (result === 'block') return 'block';
  if (result === 'immune') return 'immune';
  if (result === 'deflect') return 'deflect';
  return null;
}

function lineCls(type: CombatLogType, source: Side | undefined, crit: boolean): string {
  const side = source == null ? 'tw-ev-sys'
    : source === 'player' ? 'tw-ev-p'
      : isLogTeam(source) ? 'tw-ev-pet'
        : 'tw-ev-e';
  return `tw-clog-${type} ${side}${crit ? ' tw-ev-crit' : ''}`;
}

function trailer(result: HitResult, blocked?: number): string {
  if (result === 'glancing') return GLANCING;
  if (result === 'crushing') return CRUSHING;
  if (blocked && blocked > 0) return BLOCK_T(blocked);
  return '';
}

function swingType(ev: { spellId?: number; name?: string }): 'melee' | 'ranged' {
  return ev.spellId || ev.name ? 'ranged' : 'melee';
}

function auraHarmful(actor: Side): boolean {
  return isEnemySide(actor);
}

/** Filter source for auras: dest = unit with the aura. Synthetic caster so Self vs Mine tabs split. */
function auraFilterSides(dest: Side, harmful: boolean): { source?: Side; dest: Side } {
  if (!harmful) return { source: dest, dest };
  if (isLogTeam(dest)) return { source: isLogHostile(dest) ? dest : 'enemy', dest };
  return { source: 'player', dest };
}

function missSwing(
  result: HitResult,
  srcSelf: boolean,
  destSelf: boolean,
  src: string,
  dest: string,
  srcSide: Side,
  destSide: Side,
): LogSeg[] | null {
  if (result === 'miss') {
    if (srcSelf) return [{ text: 'You miss ' }, nm(destSide, dest), { text: '.' }];
    if (destSelf) return [nm(srcSide, src), { text: ' misses you.' }];
    return [nm(srcSide, src), { text: ' misses ' }, nm(destSide, dest), { text: '.' }];
  }
  const verb = result === 'dodge' ? 'dodges'
    : result === 'parry' ? 'parries'
      : result === 'block' ? 'blocks'
        : result === 'deflect' ? 'deflects'
          : result === 'immune' ? null
            : null;
  if (result === 'immune') {
    if (srcSelf) return [{ text: 'You attack but ' }, nm(destSide, dest), { text: ' is immune.' }];
    if (destSelf) return [nm(srcSide, src), { text: ' attacks but you are immune.' }];
    return [nm(srcSide, src), { text: ' attacks but ' }, nm(destSide, dest), { text: ' is immune.' }];
  }
  if (!verb) return null;
  const youVerb = result === 'dodge' ? 'dodge'
    : result === 'parry' ? 'parry'
      : result === 'block' ? 'block'
        : result === 'deflect' ? 'deflect'
          : verb;
  if (srcSelf) return [{ text: 'You attack. ' }, nm(destSide, dest), { text: ` ${verb}.` }];
  if (destSelf) return [nm(srcSide, src), { text: ` attacks. You ${youVerb}.` }];
  return [nm(srcSide, src), { text: ' attacks. ' }, nm(destSide, dest), { text: ` ${verb}.` }];
}

function missSpell(
  result: HitResult,
  srcSelf: boolean,
  destSelf: boolean,
  src: string,
  dest: string,
  srcSide: Side,
  destSide: Side,
  spell: string,
  school: School,
): LogSeg[] | null {
  const S = sp(spell, school);
  if (result === 'miss') {
    if (srcSelf) return [{ text: 'Your ' }, S, { text: ' missed ' }, nm(destSide, dest), { text: '.' }];
    if (destSelf) return [nm(srcSide, src), { text: "'s " }, S, { text: ' misses you.' }];
    return [nm(srcSide, src), { text: "'s " }, S, { text: ' missed ' }, nm(destSide, dest), { text: '.' }];
  }
  if (result === 'immune') {
    if (srcSelf) return [{ text: 'Your ' }, S, { text: ' failed. ' }, nm(destSide, dest), { text: ' is immune.' }];
    if (destSelf) return [nm(srcSide, src), { text: "'s " }, S, { text: ' failed. You are immune.' }];
    return [nm(srcSide, src), { text: "'s " }, S, { text: ' fails. ' }, nm(destSide, dest), { text: ' is immune.' }];
  }
  const verb = result === 'dodge' ? 'was dodged'
    : result === 'parry' ? (srcSelf ? 'is parried' : 'was parried')
      : result === 'block' ? 'was blocked'
        : result === 'deflect' ? 'was deflected'
          : null;
  if (!verb) return null;
  if (srcSelf) return [{ text: 'Your ' }, S, { text: ` ${verb} by ` }, nm(destSide, dest), { text: '.' }];
  if (destSelf) return [nm(srcSide, src), { text: "'s " }, S, { text: ` ${verb}.` }];
  return [nm(srcSide, src), { text: "'s " }, S, { text: ` ${verb} by ` }, nm(destSide, dest), { text: '.' }];
}

function swingHit(
  srcSelf: boolean,
  destSelf: boolean,
  src: string,
  dest: string,
  srcSide: Side,
  destSide: Side,
  amount: number,
  crit: boolean,
  trail: string,
): LogSeg[] {
  const hit = crit ? 'crits' : 'hits';
  const a = amt(amount, 'physical');
  if (srcSelf) {
    return [{ text: `You ${crit ? 'crit' : 'hit'} ` }, nm(destSide, dest), { text: ' for ' }, a, { text: `${trail}.` }];
  }
  if (destSelf) {
    return [nm(srcSide, src), { text: ` ${hit} you for ` }, a, { text: `${trail}.` }];
  }
  return [nm(srcSide, src), { text: ` ${hit} ` }, nm(destSide, dest), { text: ' for ' }, a, { text: `${trail}.` }];
}

function spellHitLine(
  srcSelf: boolean,
  destSelf: boolean,
  src: string,
  dest: string,
  srcSide: Side,
  destSide: Side,
  spell: string,
  school: School,
  amount: number,
  crit: boolean,
  trail: string,
): LogSeg[] {
  const S = sp(spell, school);
  const a = amt(amount, school);
  const sch = schoolWord(school);
  const hit = crit ? 'crits' : 'hits';
  const schoolBit: LogSeg[] = school === 'physical'
    ? [{ text: `${trail}.` }]
    : [{ text: ` ${sch} damage${trail}.` }];
  if (srcSelf) {
    return [{ text: 'Your ' }, S, { text: ` ${hit} ` }, nm(destSide, dest), { text: ' for ' }, a, ...schoolBit];
  }
  if (destSelf) {
    return [nm(srcSide, src), { text: "'s " }, S, { text: ` ${hit} you for ` }, a, ...schoolBit];
  }
  return [nm(srcSide, src), { text: "'s " }, S, { text: ` ${hit} ` }, nm(destSide, dest), { text: ' for ' }, a, ...schoolBit];
}

function dotLine(
  srcSelf: boolean,
  destSelf: boolean,
  src: string,
  dest: string,
  srcSide: Side,
  destSide: Side,
  spell: string,
  school: School,
  amount: number,
): LogSeg[] {
  const S = sp(spell, school);
  const a = amt(amount, school);
  const sch = schoolWord(school);
  if (srcSelf && destSelf) {
    return [{ text: 'You suffer ' }, a, { text: ` ${sch} damage from your ` }, S, { text: '.' }];
  }
  if (srcSelf) {
    return [nm(destSide, dest), { text: ' suffers ' }, a, { text: ` ${sch} damage from your ` }, S, { text: '.' }];
  }
  if (destSelf) {
    return [{ text: 'You suffer ' }, a, { text: ` ${sch} damage from ` }, nm(srcSide, src), { text: "'s " }, S, { text: '.' }];
  }
  return [nm(destSide, dest), { text: ' suffers ' }, a, { text: ` ${sch} damage from ` }, nm(srcSide, src), { text: "'s " }, S, { text: '.' }];
}

function healLine(
  srcSelf: boolean,
  destSelf: boolean,
  src: string,
  dest: string,
  srcSide: Side,
  destSide: Side,
  spell: string | undefined,
  amount: number,
  crit: boolean,
): LogSeg[] {
  const a = amt(amount, 'heal');
  const critW = crit ? 'critically heals' : 'heals';
  if (spell) {
    const S = sp(spell, 'heal');
    if (srcSelf && destSelf) return [{ text: 'Your ' }, S, { text: ` ${critW} you for ` }, a, { text: '.' }];
    if (srcSelf) return [{ text: 'Your ' }, S, { text: ` ${critW} ` }, nm(destSide, dest), { text: ' for ' }, a, { text: '.' }];
    if (destSelf) return [nm(srcSide, src), { text: "'s " }, S, { text: ` ${critW} you for ` }, a, { text: '.' }];
    return [nm(srcSide, src), { text: "'s " }, S, { text: ` ${critW} ` }, nm(destSide, dest), { text: ' for ' }, a, { text: '.' }];
  }
  if (srcSelf && destSelf) return [{ text: 'You heal for ' }, a, { text: '.' }];
  if (srcSelf) return [{ text: 'You heal ' }, nm(destSide, dest), { text: ' for ' }, a, { text: '.' }];
  if (destSelf) return [nm(srcSide, src), { text: ' heals you for ' }, a, { text: '.' }];
  return [nm(srcSide, src), { text: ' heals ' }, nm(destSide, dest), { text: ' for ' }, a, { text: '.' }];
}

function periodicHealLine(
  srcSelf: boolean,
  destSelf: boolean,
  src: string,
  dest: string,
  srcSide: Side,
  destSide: Side,
  spell: string,
  amount: number,
): LogSeg[] {
  const S = sp(spell, 'heal');
  const a = amt(amount, 'heal');
  if (srcSelf && destSelf) return [{ text: 'You gain ' }, a, { text: ' health from ' }, S, { text: '.' }];
  if (srcSelf) return [nm(destSide, dest), { text: ' gains ' }, a, { text: ' health from your ' }, S, { text: '.' }];
  if (destSelf) return [{ text: 'You gain ' }, a, { text: ' health from ' }, nm(srcSide, src), { text: "'s " }, S, { text: '.' }];
  return [nm(destSide, dest), { text: ' gains ' }, a, { text: ' health from ' }, nm(srcSide, src), { text: "'s " }, S, { text: '.' }];
}

function wrap(
  segs: LogSeg[],
  type: CombatLogType,
  source: Side | undefined,
  dest: Side | undefined,
  crit = false,
): FormattedCombatLog {
  return { segs, cls: lineCls(type, source, crit), type, source, dest };
}

/**
 * One thing happening reads as one line. The engine reports a stance as a form change plus its aura,
 * a multi-effect aura once per effect, and a buff or damageless debuff as its aura plus a 0 spell_hit
 * the meters count as the cast. The log keeps the first aura line and drops the rest.
 */
export function dropLogRepeats(events: readonly CombatEvent[]): CombatEvent[] {
  const key = (t: number, unit: Side, name: string, on: boolean) => `${t}|${unit}|${name}|${on}`;
  const auras = new Set<string>();
  for (const ev of events) if (ev.kind === 'aura' && ev.applied) auras.add(key(ev.t, ev.actor, ev.name, true));
  const seen = new Set<string>();
  return events.filter((ev) => {
    if (ev.kind === 'spell_hit') {
      return !(ev.amount === 0 && (ev.result === 'hit' || ev.result === 'crit') && ev.target != null && auras.has(key(ev.t, ev.target, ev.name, true)));
    }
    if (ev.kind !== 'aura' && ev.kind !== 'form') return true;
    const k = key(ev.t, ev.actor, ev.name, ev.kind === 'aura' ? ev.applied : !!ev.form);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Format one combat event into 1.12 combat-log wording. Null = drop the row. */
export function formatCombatLog(ev: CombatEvent, names: CombatLogNames): FormattedCombatLog | null {
  const who = (a: Side) => whoOf(a, names);

  switch (ev.kind) {
    case 'start':
      if (ev.enemyName === undefined) return null;
      return wrap(
        [nm('player', names.playerName), { text: ' faces ' }, nm('enemy', names.enemyName), { text: '.' }],
        'sys', undefined, undefined,
      );
    case 'cast_start': {
      const src = ev.actor;
      const S = sp(ev.name);
      const segs = self(src)
        ? [{ text: 'You begin to cast ' }, S, { text: '.' }]
        : [nm(src, who(src)), { text: ' begins to cast ' }, S, { text: '.' }];
      return wrap(segs, 'cast', src, undefined);
    }
    case 'cast_finish': {
      const src = ev.actor;
      const S = sp(ev.name);
      const segs = self(src)
        ? [{ text: 'You cast ' }, S, { text: '.' }]
        : [nm(src, who(src)), { text: ' casts ' }, S, { text: '.' }];
      return wrap(segs, 'cast', src, undefined);
    }
    case 'melee': {
      const src = ev.actor;
      const dest = ev.target ?? impliedDest(src);
      const swing = swingType(ev);
      const type = missType(ev.result, ev.amount) ?? swing;
      const srcN = who(src);
      const destN = who(dest);
      const miss = missSwing(ev.result, self(src), self(dest), srcN, destN, src, dest);
      if (miss) return wrap(miss, type, src, dest);
      const crit = ev.result === 'crit' || ev.result === 'crushing';
      if (swing === 'ranged' && ev.name) {
        return wrap(
          spellHitLine(self(src), self(dest), srcN, destN, src, dest, ev.name, 'physical', ev.amount, ev.result === 'crit', trailer(ev.result, ev.blocked)),
          'ranged', src, dest, crit,
        );
      }
      return wrap(
        swingHit(self(src), self(dest), srcN, destN, src, dest, ev.amount, ev.result === 'crit', trailer(ev.result, ev.blocked)),
        type, src, dest, crit,
      );
    }
    case 'spell_hit': {
      const src = ev.actor;
      const dest = ev.target ?? impliedDest(src);
      const type = missType(ev.result, ev.amount) ?? 'spell';
      const srcN = who(src);
      const destN = who(dest);
      const miss = missSpell(ev.result, self(src), self(dest), srcN, destN, src, dest, ev.name, ev.school);
      if (miss) return wrap(miss, type, src, dest);
      return wrap(
        spellHitLine(self(src), self(dest), srcN, destN, src, dest, ev.name, ev.school, ev.amount, ev.result === 'crit', trailer(ev.result, ev.blocked)),
        'spell', src, dest, ev.result === 'crit',
      );
    }
    case 'dot_tick': {
      const src = ev.actor;
      const dest = ev.target ?? impliedDest(src);
      return wrap(
        dotLine(self(src), self(dest), who(src), who(dest), src, dest, ev.name, ev.school, ev.amount),
        'periodic', src, dest,
      );
    }
    case 'heal': {
      const shown = ev.amount > 0 ? ev.amount : (ev.overheal ?? 0);
      if (shown <= 0) return null;
      const dest = ev.actor;
      const src = (ev.source ?? ev.actor) as Side;
      if (ev.periodic && ev.name) {
        return wrap(
          periodicHealLine(self(src), self(dest), who(src), who(dest), src, dest, ev.name, shown),
          'heal', src, dest, ev.crit === true,
        );
      }
      return wrap(
        healLine(self(src), self(dest), who(src), who(dest), src, dest, ev.name, shown, ev.crit === true),
        'heal', src, dest, ev.crit === true,
      );
    }
    case 'item_use': {
      const src = ev.actor;
      const dest = ev.target && ev.target !== src ? ev.target : src;
      const S = sp(ev.name);
      let segs: LogSeg[];
      if (self(src) && dest === src) segs = [{ text: 'You perform ' }, S, { text: '.' }];
      else if (self(src)) segs = [{ text: 'You perform ' }, S, { text: ' on ' }, nm(dest, who(dest)), { text: '.' }];
      else if (self(dest)) segs = [nm(src, who(src)), { text: ' performs ' }, S, { text: ' on you.' }];
      else segs = [nm(src, who(src)), { text: ' performs ' }, S, { text: ' on ' }, nm(dest, who(dest)), { text: '.' }];
      return wrap(segs, 'sys', src, dest);
    }
    case 'aura': {
      const dest = ev.actor;
      const looked = ev.spellId != null ? names.spellHarmful?.(ev.spellId) : undefined;
      const harmful = looked ?? auraHarmful(dest);
      const S = sp(ev.name);
      let segs: LogSeg[];
      if (ev.applied) {
        if (self(dest) && harmful) segs = [{ text: 'You are afflicted by ' }, S, { text: '.' }];
        else if (self(dest)) segs = [{ text: 'You gain ' }, S, { text: '.' }];
        else if (harmful) segs = [nm(dest, who(dest)), { text: ' is afflicted by ' }, S, { text: '.' }];
        else segs = [nm(dest, who(dest)), { text: ' gains ' }, S, { text: '.' }];
      } else {
        if (self(dest)) segs = [S, { text: ' fades from you.' }];
        else segs = [S, { text: ' fades from ' }, nm(dest, who(dest)), { text: '.' }];
      }
      const sides = auraFilterSides(dest, harmful);
      return wrap(segs, 'aura', sides.source, sides.dest);
    }
    case 'form': {
      const dest = ev.actor;
      const S = sp(ev.name);
      const segs = ev.form
        ? (self(dest)
          ? [{ text: 'You gain ' }, S, { text: '.' }]
          : [nm(dest, who(dest)), { text: ' gains ' }, S, { text: '.' }])
        : (self(dest)
          ? [S, { text: ' fades from you.' }]
          : [S, { text: ' fades from ' }, nm(dest, who(dest)), { text: '.' }]);
      return wrap(segs, 'aura', dest, dest);
    }
    case 'root':
    case 'control': {
      const dest = ev.target;
      const applied = ev.applied;
      const name = ev.kind === 'control' ? ev.name : undefined;
      let segs: LogSeg[];
      if (ev.kind === 'root') {
        segs = self(dest)
          ? [{ text: applied ? 'You are frozen in place!' : 'You break free.' }]
          : [nm(dest, who(dest)), { text: applied ? ' is frozen in place!' : ' breaks free.' }];
      } else if (!applied) {
        segs = self(dest)
          ? [{ text: 'You are free.' }]
          : [nm(dest, who(dest)), { text: ' is free.' }];
      } else if (self(dest)) {
        segs = name
          ? [{ text: 'You are afflicted by ' }, sp(name), { text: '.' }]
          : [{ text: 'You are afflicted.' }];
      } else {
        const verb = ev.control === 'stun' ? 'is stunned'
          : ev.control === 'fear' ? 'flees in fear'
            : ev.control === 'incapacitate' ? 'is incapacitated'
              : ev.control === 'silence' ? 'is silenced'
                : ev.control === 'disarm' ? 'is disarmed'
                  : ev.control === 'root' ? 'is rooted'
                    : ev.control === 'charm' ? 'is possessed'
                      : 'is controlled';
        segs = [nm(dest, who(dest)), { text: ` ${verb}` }, ...(name ? [{ text: ' (' }, sp(name), { text: ')' }] : []), { text: '!' }];
      }
      const sides = auraFilterSides(dest, true);
      return wrap(segs, 'aura', sides.source, sides.dest);
    }
    case 'cc_resist': {
      const dest = ev.target;
      const S = sp(ev.name);
      // A melee-class control reads like the strike it is: dodged, parried, blocked or missed.
      const verb = ev.result === 'dodge' ? 'dodged' : ev.result === 'parry' ? 'parried'
        : ev.result === 'block' ? 'blocked' : ev.result === 'deflect' ? 'deflected' : null;
      const segs = ev.result === 'miss'
        ? (self(dest) ? [S, { text: ' missed you.' }] : [S, { text: ' missed ' }, nm(dest, who(dest)), { text: '.' }])
        : verb
          ? (self(dest) ? [{ text: `You ${verb} ` }, S, { text: '.' }] : [S, { text: ` was ${verb} by ` }, nm(dest, who(dest)), { text: '.' }])
          : (self(dest) ? [{ text: 'You resisted ' }, S, { text: '.' }] : [S, { text: ' was resisted by ' }, nm(dest, who(dest)), { text: '.' }]);
      return wrap(segs, 'resist', undefined, dest);
    }
    case 'cc_immune': {
      const dest = ev.target;
      const S = sp(ev.name);
      const segs = self(dest)
        ? [{ text: 'You are immune to ' }, S, { text: '.' }]
        : [nm(dest, who(dest)), { text: ' is immune to ' }, S, { text: '.' }];
      return wrap(segs, 'immune', undefined, dest);
    }
    case 'interrupt': {
      const dest = ev.target;
      const src = ev.actor;
      const kicked = ev.interruptedName ?? ev.name;
      const S = sp(kicked);
      let segs: LogSeg[];
      if (src != null) {
        if (self(src)) segs = [{ text: 'You interrupt ' }, nm(dest, who(dest)), { text: "'s " }, S, { text: '.' }];
        else if (self(dest)) segs = [nm(src, who(src)), { text: ' interrupts your ' }, S, { text: '.' }];
        else segs = [nm(src, who(src)), { text: ' interrupts ' }, nm(dest, who(dest)), { text: "'s " }, S, { text: '.' }];
      } else {
        segs = self(dest)
          ? [{ text: 'Your ' }, S, { text: ' is interrupted.' }]
          : [nm(dest, who(dest)), { text: "'s " }, S, { text: ' is interrupted.' }];
      }
      return wrap(segs, 'interrupt', src, dest);
    }
    case 'death': {
      const dest = ev.actor;
      const segs = self(dest)
        ? [{ text: 'You die.' }]
        : [nm(dest, who(dest)), { text: ' dies.' }];
      return wrap(segs, 'death', dest, dest);
    }
    case 'resource': {
      // Cast cost is not a 1.12 combat-log line (GlobalStrings has POWERGAIN / SPELLPOWERDRAIN only).
      if (!(ev.delta > 0)) return null;
      const dest = ev.actor;
      const power = ev.power === 'health' ? 'health' : ev.power;
      const n = Math.round(ev.delta);
      const a = amt(n, 'heal');
      const spell = ev.spellId != null ? names.spellName?.(ev.spellId) : undefined;
      if (spell) {
        const S = sp(spell);
        const segs = self(dest)
          ? [{ text: 'You gain ' }, a, { text: ` ${power} from ` }, S, { text: '.' }]
          : [nm(dest, who(dest)), { text: ' gains ' }, a, { text: ` ${power} from ` }, S, { text: '.' }];
        return wrap(segs, 'power', dest, dest);
      }
      const key = `power:${dest}:${power}`;
      const remake = (sum: number): FormattedCombatLog => {
        const sum_ = amt(sum, 'heal');
        const segs = self(dest)
          ? [{ text: 'You gain ' }, sum_, { text: ` ${power}.` }]
          : [nm(dest, who(dest)), { text: ' gains ' }, sum_, { text: ` ${power}.` }];
        const row = wrap(segs, 'power', dest, dest);
        row.merge = { key, t: ev.t, amount: sum, remake };
        return row;
      };
      return remake(n);
    }
    case 'creature_text':
      return { segs: [{ text: ev.text }], cls: lineCls('speech', undefined, false), type: 'speech', speech: ev.text };
    case 'emote': {
      const src = ev.actor;
      return wrap([nm(src, who(src)), { text: ` emotes (${ev.emoteId}).` }], 'speech', src, undefined);
    }
    case 'flavor':
      return wrap([{ text: ev.text }], 'sys', undefined, undefined);
    case 'evade': {
      const src = ev.actor;
      const segs = self(src)
        ? [{ text: 'You evade.' }]
        : [nm(src, who(src)), { text: ' evades.' }];
      return wrap(segs, 'evade', src, src);
    }
    case 'summon': {
      const src = ev.actor;
      const S = sp(ev.name);
      const segs = self(src)
        ? [{ text: 'You cast ' }, S, { text: '.' }]
        : [nm(src, who(src)), { text: ' casts ' }, S, { text: '.' }];
      return wrap(segs, 'cast', src, ev.side);
    }
    case 'remove_auras': {
      const src = ev.actor;
      const dest = ev.target;
      const auraName = names.spellName?.(ev.spellId);
      let segs: LogSeg[];
      if (auraName) {
        const S = sp(auraName);
        segs = self(dest)
          ? [{ text: 'Your ' }, S, { text: ' is removed.' }]
          : [nm(dest, who(dest)), { text: "'s " }, S, { text: ' is removed.' }];
      } else {
        segs = self(dest)
          ? [{ text: 'Your aura is removed.' }]
          : [nm(dest, who(dest)), { text: "'s aura is removed." }];
      }
      return wrap(segs, 'dispel', src, dest);
    }
    default:
      return null;
  }
}

export function combatLogPlainText(row: FormattedCombatLog): string {
  return row.segs.map((s) => s.text).join('');
}
