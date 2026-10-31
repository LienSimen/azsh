// Hunter "Taming the Beast": a Taming Rod item casts a channel, whose final spell carries
// EffectQuestComplete. Every constant below was read from the world DB or CMaNGOS, never invented.

export interface TamingRodDef {
  /** item_template.entry (Taming Rod). */
  item: number;
  /** item_template.spellid_1 — channel cast on the beast. */
  useSpell: number;
  /** Spell cast when the channel aura expires successfully (IsQuestTameSpell final). */
  finalSpell: number;
  /** Final spell EffectMiscValue for SPELL_EFFECT_QUEST_COMPLETE. */
  questId: number;
  /** Practice beast creature_template.entry (objectivesText name). */
  targetCreature: number;
}

// All classic Taming Rods (Mulgore / Durotar / Teldrassil / Dun Morogh / etc.). Order is arbitrary; lookups
// use the maps below.
export const TAMING_RODS: readonly TamingRodDef[] = [
  // Dun Morogh
  { item: 15908, useSpell: 19548, finalSpell: 19597, questId: 6085, targetCreature: 1196 }, // Ice Claw Bear
  { item: 15911, useSpell: 19674, finalSpell: 19677, questId: 6064, targetCreature: 1126 }, // Large Crag Boar
  { item: 15913, useSpell: 19687, finalSpell: 19676, questId: 6084, targetCreature: 1201 }, // Snow Leopard
  // Mulgore
  { item: 15914, useSpell: 19688, finalSpell: 19678, questId: 6061, targetCreature: 2956 }, // Adult Plainstrider
  { item: 15915, useSpell: 19689, finalSpell: 19679, questId: 6087, targetCreature: 2959 }, // Prairie Stalker
  { item: 15916, useSpell: 19692, finalSpell: 19680, questId: 6088, targetCreature: 2970 }, // Swoop
  // Durotar
  { item: 15917, useSpell: 19694, finalSpell: 19681, questId: 6062, targetCreature: 3099 }, // Dire Mottled Boar
  { item: 15919, useSpell: 19696, finalSpell: 19682, questId: 6083, targetCreature: 3107 }, // Surf Crawler
  { item: 15920, useSpell: 19697, finalSpell: 19683, questId: 6082, targetCreature: 3126 }, // Armored Scorpid
  // Teldrassil
  { item: 15921, useSpell: 19693, finalSpell: 19684, questId: 6063, targetCreature: 1998 }, // Webwood Lurker
  { item: 15922, useSpell: 19699, finalSpell: 19685, questId: 6101, targetCreature: 2043 }, // Nightsaber Stalker
  { item: 15923, useSpell: 19700, finalSpell: 19686, questId: 6102, targetCreature: 1996 }, // Strigid Screecher
];

const byItem = new Map(TAMING_RODS.map((r) => [r.item, r]));
const byUseSpell = new Map(TAMING_RODS.map((r) => [r.useSpell, r]));
const byQuestId = new Map(TAMING_RODS.map((r) => [r.questId, r]));

export function tamingRodByItem(itemEntry: number): TamingRodDef | undefined {
  return byItem.get(itemEntry);
}

export function tamingRodByUseSpell(spellId: number): TamingRodDef | undefined {
  return byUseSpell.get(spellId);
}

/** Reverse map: quest entry → rod def (Taming the Beast family only). */
export function tamingRodByQuestId(questId: number): TamingRodDef | undefined {
  return byQuestId.get(questId);
}

// True when `questId` is one of the classic "Taming the Beast" practice quests. Rod-use event
// credit is scoped to this family — it is not a blanket free-complete for every event quest.
export function isTamingQuestId(questId: number): boolean {
  return byQuestId.has(questId);
}

/** True when the item entry is a sourced Taming Rod. */
export function isTamingRodItem(itemEntry: number): boolean {
  return byItem.has(itemEntry);
}

// Stamp useSpell on baked Taming Rod items the ETL left inert, since class-12 quest items skip the
// class-0 useSpell mapping. A pure parity repair from sourced constants — no bake write.
export function applyTamingRodUseSpells(items: Iterable<{ entry: number; useSpell?: number }>): number {
  let n = 0;
  for (const it of items) {
    const rod = byItem.get(it.entry);
    if (!rod) continue;
    if (it.useSpell == null) {
      it.useSpell = rod.useSpell;
      n++;
    }
  }
  return n;
}
