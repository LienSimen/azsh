// Macro button icon: follow the first /cast or /use unless the player picked one. The question
// mark is the auto sentinel, as on a new client macro; any other basename is a deliberate pick.

import { parseMacroBody } from './parse.ts';
import { splitSpellRank } from './snapshot.ts';
import { MACRO_ICON_FALLBACK } from './types.ts';
import { sanitizeMacroIcon } from './normalize.ts';

export type MacroIconSpellHit = { icon?: string } | null;
export type MacroIconItemHit = { icon?: string } | null;

export function macroIconIsCustom(icon: string): boolean {
  return sanitizeMacroIcon(icon) !== MACRO_ICON_FALLBACK;
}

/** First icon the body names: pinned #showtooltip, else the first /cast /use /equip argument. */
export function suggestedMacroIcon(
  body: string,
  resolveSpell: (name: string, rank?: number, subtext?: string) => MacroIconSpellHit,
  resolveItem: (name: string) => MacroIconItemHit,
): string | null {
  const fromArg = (raw: string): string | null => {
    const { name, rank, subtext } = splitSpellRank(raw);
    if (!name) return null;
    const spell = resolveSpell(name, rank, subtext);
    if (spell?.icon) return sanitizeMacroIcon(spell.icon);
    const item = resolveItem(raw);
    if (item?.icon) return sanitizeMacroIcon(item.icon);
    return null;
  };
  const prog = parseMacroBody(body);
  if (prog.tooltip.kind === 'named') {
    const pinned = fromArg(prog.tooltip.name);
    if (pinned) return pinned;
  }
  for (const line of prog.lines) {
    if (line.verb !== 'cast' && line.verb !== 'use' && line.verb !== 'equip' && line.verb !== 'equipoh') {
      continue;
    }
    for (const clause of line.clauses) {
      if (!clause.arg) continue;
      const hit = fromArg(clause.arg);
      if (hit) return hit;
    }
  }
  return null;
}

// What to draw. A custom stored icon wins. Otherwise the body suggestion, then the question mark.
// `liveTipIcon` is the #showtooltip resolution for right now (combat/world bars).
export function macroDisplayIcon(
  def: { icon: string; body: string },
  resolveSpell: (name: string, rank?: number, subtext?: string) => MacroIconSpellHit,
  resolveItem: (name: string) => MacroIconItemHit,
  liveTipIcon?: string,
): string {
  if (macroIconIsCustom(def.icon)) return sanitizeMacroIcon(def.icon);
  if (liveTipIcon) return sanitizeMacroIcon(liveTipIcon);
  return suggestedMacroIcon(def.body, resolveSpell, resolveItem) ?? MACRO_ICON_FALLBACK;
}
