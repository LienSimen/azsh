// Copy a unit's live combat buff chips onto the OOC sheet. The session is torn down between
// pulls; vanilla keeps the same unit, so remaining time has to ride out as expiresAt.

import type { SpellDef } from '../../data/schema.ts';
import type { ActiveAura } from '../../domain/character/character.ts';
import { pruneExpiredAuras } from '../../domain/character/character.ts';
import { isFormSpell } from '../../domain/character/forms.ts';
import { isPartyAreaAura } from '../../domain/spells/areaAuraMembership.ts';
import { isHostileTargetChannel } from '../combat/channel.ts';
import { isUntilNextCastAuraSpell } from '../combat/roles.ts';

export interface CombatBuffChip {
  spellId: number;
  remainingMs?: number;
  charges?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function isStealthSpell(sp: SpellDef | undefined): boolean {
  return !!sp?.effects.some((e) => e.kind === 'stealth');
}

/** Combat remaining → wall-clock ActiveAura list. `persistForms` keeps the live shapeshift chip. */
export function carryCombatBuffs(opts: {
  prior: readonly ActiveAura[] | undefined;
  buffs: readonly CombatBuffChip[];
  now: number;
  spell: (id: number) => SpellDef | undefined;
  stealthed?: boolean;
  form?: number;
  formSpellId?: number;
  persistForms?: boolean;
}): ActiveAura[] {
  const byId = new Map<number, ActiveAura>();
  for (const a of pruneExpiredAuras(opts.prior, opts.now)) {
    byId.set(a.spellId, { ...a });
  }
  const combatBuffIds = new Set(opts.buffs.map((b) => b.spellId));
  for (const [id, a] of [...byId.entries()]) {
    if (combatBuffIds.has(id)) continue;
    if (a.charges != null && a.charges > 0) {
      byId.delete(id);
      continue;
    }
    const sp = opts.spell(id);
    if (isUntilNextCastAuraSpell(sp)) byId.delete(id);
    // Holder left, died, or was out of radius — do not re-stamp from the pre-fight sheet.
    // Cite: SpellAuras.cpp AreaAura::Update ~592–624.
    else if (isPartyAreaAura(sp)) byId.delete(id);
  }
  for (const b of opts.buffs) {
    const rem = b.remainingMs;
    if (rem != null && Number.isFinite(rem) && rem <= 0) {
      byId.delete(b.spellId);
      continue;
    }
    const infinite = rem == null || !Number.isFinite(rem) || rem > DAY_MS;
    const prev = byId.get(b.spellId);
    const charges = (b.charges != null && b.charges > 0) ? b.charges : prev?.charges;
    byId.set(b.spellId, {
      spellId: b.spellId,
      expiresAt: infinite ? undefined : opts.now + rem!,
      ...(charges != null && charges > 0 ? { charges } : {}),
    });
  }
  if (opts.persistForms && opts.form && opts.formSpellId) {
    byId.set(opts.formSpellId, { spellId: opts.formSpellId, expiresAt: undefined });
  }
  if (opts.persistForms && opts.formSpellId) {
    for (const id of [...byId.keys()]) {
      if (id === opts.formSpellId) continue;
      const sp = opts.spell(id);
      if (sp && isFormSpell(sp)) byId.delete(id);
    }
  } else if (!opts.persistForms) {
    for (const id of [...byId.keys()]) {
      const sp = opts.spell(id);
      if (sp && isFormSpell(sp)) byId.delete(id);
    }
  }
  if (!opts.stealthed) {
    for (const id of [...byId.keys()]) {
      if (isStealthSpell(opts.spell(id))) byId.delete(id);
    }
  }
  for (const id of [...byId.keys()]) {
    if (isHostileTargetChannel(opts.spell(id))) byId.delete(id);
  }
  return [...byId.values()];
}
