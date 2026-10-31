// Combat-log filter model. Event names and default-on list: Blizzard_CombatLog.lua
// COMBATLOG_EVENT_LIST / Filter_Defaults. Tabs: Everything, dest=party, source=party.

import type { Side } from '../engine/core/events.ts';
import { isAllySide, isEnemySide, isTotemSide } from '../engine/core/events.ts';

/** Message-type buckets the Filters panel toggles. */
export type CombatLogType =
  | 'melee'
  | 'ranged'
  | 'spell'
  | 'periodic'
  | 'heal'
  | 'miss'
  | 'dodge'
  | 'parry'
  | 'block'
  | 'resist'
  | 'absorb'
  | 'immune'
  | 'evade'
  | 'deflect'
  | 'aura'
  | 'cast'
  | 'interrupt'
  | 'dispel'
  | 'death'
  | 'power'
  | 'speech'
  | 'sys';

export type CombatLogTab = 'everything' | 'team' | 'ours';

/** Cite: Fonts.xml CHAT_FONT_HEIGHTS 12/14/16/18. Default ChatFontNormal is 14. */
export const COMBAT_LOG_FONT_PX = [12, 14, 16] as const;
export type CombatLogFontPx = (typeof COMBAT_LOG_FONT_PX)[number];

export const COMBAT_LOG_TABS: ReadonlyArray<{ id: CombatLogTab; label: string; title: string }> = [
  { id: 'everything', label: 'Everything', title: 'Everything' },
  { id: 'ours', label: 'Our actions', title: 'Damage, heals and effects your party dealt' },
  { id: 'team', label: 'Our team', title: 'What happened to our team' },
];

export const COMBAT_LOG_TYPE_ROWS: ReadonlyArray<{ id: CombatLogType; label: string }> = [
  { id: 'melee', label: 'Melee damage' },
  { id: 'ranged', label: 'Ranged damage' },
  { id: 'spell', label: 'Spell damage' },
  { id: 'periodic', label: 'Periodic damage' },
  { id: 'heal', label: 'Healing' },
  { id: 'aura', label: 'Buffs/debuffs' },
  { id: 'miss', label: 'Misses' },
  { id: 'dodge', label: 'Dodges' },
  { id: 'parry', label: 'Parries' },
  { id: 'block', label: 'Blocks' },
  { id: 'resist', label: 'Resists' },
  { id: 'absorb', label: 'Absorbs' },
  { id: 'immune', label: 'Immunes' },
  { id: 'evade', label: 'Evades' },
  { id: 'deflect', label: 'Deflects' },
  { id: 'interrupt', label: 'Interrupts' },
  { id: 'dispel', label: 'Dispels' },
  { id: 'death', label: 'Deaths' },
  { id: 'power', label: 'Power' },
  { id: 'cast', label: 'Casting' },
  { id: 'speech', label: 'Speech' },
  { id: 'sys', label: 'Other' },
];

/** COMBATLOG_EVENT_LIST: casts off; auras on here because Self's source list turns them on and the operator asked for them. */
export const DEFAULT_COMBAT_LOG_TYPES: Record<CombatLogType, boolean> = {
  melee: true,
  ranged: true,
  spell: true,
  periodic: true,
  heal: true,
  miss: true,
  dodge: true,
  parry: true,
  block: true,
  resist: true,
  absorb: true,
  immune: true,
  evade: true,
  deflect: true,
  aura: true,
  interrupt: true,
  dispel: true,
  death: true,
  power: true,
  speech: true,
  sys: true,
  cast: false,
};

export type CombatLogPrefs = {
  tab: CombatLogTab;
  fontPx: CombatLogFontPx;
  types: Record<CombatLogType, boolean>;
};

const PREF_KEY = 'twCombatLog.v1';

export function defaultCombatLogPrefs(): CombatLogPrefs {
  return { tab: 'everything', fontPx: 14, types: { ...DEFAULT_COMBAT_LOG_TYPES } };
}

export function loadCombatLogPrefs(): CombatLogPrefs {
  const d = defaultCombatLogPrefs();
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) return d;
    const p = JSON.parse(raw) as Partial<CombatLogPrefs>;
    if (p.tab === 'everything' || p.tab === 'team' || p.tab === 'ours') d.tab = p.tab;
    if (p.fontPx === 12 || p.fontPx === 14 || p.fontPx === 16) d.fontPx = p.fontPx;
    if (p.types && typeof p.types === 'object') {
      for (const row of COMBAT_LOG_TYPE_ROWS) {
        const v = p.types[row.id];
        if (typeof v === 'boolean') d.types[row.id] = v;
      }
    }
  } catch { /* headless / private */ }
  return d;
}

export function saveCombatLogPrefs(p: CombatLogPrefs): void {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

/** Party + pets + totems. The RTS stand-in for COMBATLOG_FILTER_MINE | FRIENDLY_UNITS. */
export function isLogTeam(side: Side | undefined): boolean {
  if (side == null) return false;
  return side === 'player' || side === 'pet' || isTotemSide(side) || isAllySide(side);
}

export function isLogHostile(side: Side | undefined): boolean {
  return side != null && isEnemySide(side);
}

export function impliedDest(actor: Side): Side {
  return isEnemySide(actor) ? 'player' : 'enemy';
}

export type CombatLogSides = { type: CombatLogType; source?: Side; dest?: Side };

export function passCombatLogFilter(
  row: CombatLogSides,
  prefs: CombatLogPrefs,
): boolean {
  if (!prefs.types[row.type]) return false;
  if (prefs.tab === 'everything') return true;
  if (prefs.tab === 'ours') return isLogTeam(row.source);
  return isLogTeam(row.dest);
}
