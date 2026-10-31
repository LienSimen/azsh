// Aura-removal bodies: the half of an aura's script that runs when the aura GOES AWAY. Every one was
// inert here — the payload resolved to an intent and combat had no expiry seam to read it at.

import type { AuraRemoveBody, RawSpellEffect, SpellDef, SpellEffect } from '../../../../data/schema.ts';
import { durMs } from '../duration.ts';

// The aura sits on the cast target, not the caster. The location-AoE clause is not optional: without it
// Huhuran's sting fires its removal body off the BOSS instead of the stung player.
function debuffOnTarget(raw: RawSpellEffect | undefined): boolean {
  const a = (raw?.targetA ?? 0) | 0;
  if (a === 6 || a === 21 || a === 25 || a === 15) return true;
  return (a === 22 || a === 53) && ((raw?.targetB ?? 0) | 0) === 15;
}

const cast = (spellId: number, mode: AuraRemoveBody['mode'], rest: Partial<AuraRemoveBody> = {}): AuraRemoveBody =>
  ({ action: 'cast', spellId, mode, ...rest });

// Quest-tame channels: the aura's removal is what awards the beast. Cite: SpellAuras.cpp:1348-1384 (parent
// → finalSpellId switch).
const TAME_FINAL: ReadonlyArray<readonly [number, number]> = [
  [19548, 19597], [19674, 19677], [19687, 19676], [19688, 19678],
  [19689, 19679], [19692, 19680], [19693, 19684], [19694, 19681],
  [19696, 19682], [19697, 19683], [19699, 19685], [19700, 19686],
];

const BODIES = new Map<number, AuraRemoveBody[]>([
  // ── SpellAuras.cpp:1386-1436 HandleAuraDummy(!apply) ──────────────────────
  // Combustion's crit stacks outlived the buff that granted them.
  [11129, [{ action: 'remove_aura', spellId: 28682, mode: 'any' }]],
  [11826, [cast(11828, 'expire')]], // Electromagnetic Gigaflux Reactivator :1391
  [17189, [{ action: 'heal_full', mode: 'any', to: 'caster' }]], // Frostwhisper's Lifeblood :1410
  [25185, [cast(25187, 'any')]], // Itch :1415
  [26077, [cast(26078, 'any')]], // Itch :1420
  [29104, [cast(29105, 'death', { from: 'holder', to: 'holder' })]], // Anub'Rekhan Aura :1425
  [30238, [{ action: 'remove_aura', spellId: 31906, mode: 'any' }]], // Lordaeron's Blessing :1431
  [24658, [{ action: 'remove_aura', spellId: 24659, mode: 'any' }]], // Unstable Power :1491
  [24661, [{ action: 'remove_aura', spellId: 24662, mode: 'any' }]], // Restless Strength :1505
  // SpellAuras.cpp:3272-3283 HandlePeriodicDummy(!apply) — Tranquilizing Poison → Sleep.
  [24002, [cast(24004, 'expire', { from: 'holder', to: 'holder' })]],
  [24003, [cast(24004, 'expire', { from: 'holder', to: 'holder' })]],
  // Vaelastrasz's Burning Adrenaline: the bomb goes off when the aura ends, not while it runs.
  // Cite: SpellAuras.cpp:3098-3107 HandlePeriodicTriggerSpell(!apply).
  [18173, [cast(23478, 'any', { from: 'holder', to: 'holder' }), cast(23644, 'any', { from: 'holder', to: 'holder' })]],
  [23620, [cast(23478, 'any', { from: 'holder', to: 'holder' }), cast(23644, 'any', { from: 'holder', to: 'holder' })]],
  // Brood Affliction: Red — dying under it heals Chromaggus 150k.
  // Cite: SpellAuras.cpp:3232-3237 HandlePeriodicDamage(!apply) AURA_REMOVE_BY_DEATH.
  [23155, [cast(23168, 'death', { from: 'holder', to: 'holder' })]],
  // Spirit of Redemption ends in death — that IS the spell. Nothing applies 27827 yet; the
  // missing half is the producer, not this. Cite: SpellAuras.cpp:4489-4492.
  [27827, [cast(27965, 'any', { from: 'holder', to: 'holder' })]],
  // Using Control Console (Thermaplugg's): console closes, operator is stunned, the unit dies.
  // Cite: SpellAuras.cpp:2241-2253 HandleModCharm case 24937.
  [24937, [
    cast(24938, 'any', { from: 'caster', to: 'caster' }),
    cast(27880, 'any', { from: 'caster', to: 'caster' }),
    cast(3617, 'any', { from: 'holder', to: 'holder' }),
  ]],

  // ── ScriptDevAI AuraScripts ───────────────────────────────────────────────
  // Mutating Injection: the whole Grobbulus fight. Cite: boss_grobbulus.cpp:119-140.
  [28169, [
    cast(28322, 'expire', { from: 'holder', to: 'holder' }),
    cast(28206, 'dispel', { from: 'holder', to: 'holder' }),
    cast(28240, 'any', { from: 'holder', to: 'holder' }),
  ]],
  // Huhuran's Wyvern Sting: 26233 bakes 1-1 (dummy base points); the damage is in the C++.
  // Cite: boss_huhuran.cpp:139-149 CastCustomSpell natureDamage 3000 on dispel else 500.
  [26180, [cast(26233, 'dispel', { amount: 3000 }), cast(26233, 'expire', { amount: 500 })]],
  [24335, [cast(24336, 'expire')]], // ZG Wyvern Sting → DoT. Cite: zulgurubScripts.cpp:179-186.
  // Hex of Jammal'an lands BOTH follow-ups. Cite: sunken_templeScripts.cpp:274-285.
  [12479, [cast(12480, 'expire'), cast(12483, 'expire')]],
  // Renataki's vanish-teleport: the holder swings back at him. Cite: boss_renataki.cpp:127-137.
  [24700, [
    cast(3391, 'any', { from: 'holder', to: 'caster' }),
    { action: 'remove_aura', spellId: 24699, mode: 'any', to: 'holder' },
  ]],
]);

for (const [parent, final] of TAME_FINAL) BODIES.set(parent, [cast(final, 'any')]);

/** Ids this spell's removal bodies CAST. A unit never selects one; triggeredCompanion.ts excludes them. */
export function auraRemovePayloadIds(spellId: number): number[] {
  const bodies = BODIES.get(spellId | 0);
  if (!bodies) return [];
  const ids: number[] = [];
  for (const b of bodies) {
    if (b.action === 'cast' && b.spellId) ids.push(b.spellId);
  }
  return ids;
}

// Deliberately NOT wired, because the payload has nothing combat can see: a camera shake, a teleport
// out of C'Thun's stomach with no position surface, and a damage amount held on a script value.

/** Append the removal holder for `spell`, if the sources give it one. */
export function materializeAuraRemoveEffects(spell: SpellDef, effects: SpellEffect[]): SpellEffect[] {
  const bodies = BODIES.get(spell.id | 0);
  if (!bodies) return effects;
  if (effects.some((e) => e.kind === 'proc_trigger_spell' && e.onRemove)) return effects;
  const castBody = bodies.find((b) => b.action === 'cast');
  const onTarget = (spell.rawEffects ?? []).some((r) => debuffOnTarget(r));
  return [
    ...effects,
    {
      kind: 'proc_trigger_spell',
      // `cast` payloads ride the kit attach through triggerSpellId; the others have none.
      triggerSpellId: castBody?.spellId ?? 0,
      durationMs: durMs(spell.durationIndex) ?? 0,
      onRemove: bodies,
      ...(onTarget ? { auraOnTarget: true } : {}),
    },
  ];
}
