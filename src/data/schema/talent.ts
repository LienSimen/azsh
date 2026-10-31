import type { School, Stat } from './primitives.ts';

// Talents, sourced from Talent*.csv and the Spell effect CSVs. Effects model the real DBC aura
// semantics without synthesis, and the bundle field is optional so old bakes load.

export interface TalentTreeDef {
  tabId: number;
  classId: number;
  name: string;
  bg: string;            // e.g. 'mage-fire' matching /ui/bg-*.png
  order: number;         // 0/1/2 within the class
  talents: TalentDef[];  // nodes belonging to this tree (populated at bake)
}

/** One premade playerbot spec (cmangos/playerbots premade builds; seed-bot-specs.mjs). */
export interface BotSpecDef {
  name: string;                 // e.g. "pve heal holy (sanctuary)"
  prob: number;                 // random-bot pick weight (conf default 100)
  role: 'tank' | 'healer' | 'dps'; // dungeon-role hint (name keywords, else dominant tree)
  stages: { level: number; link: string }[]; // ascending; link = Wowhead talent string
}

export interface TalentDef {
  id: number;            // Talent row ID
  tabId: number;
  tier: number;          // 0..6
  col: number;           // 0..3
  name: string;          // from the rank spell's Name
  icon?: string;         // filled later by seed-icons (name match)
  maxRank: number;
  ranks: TalentRank[];
  prereq?: { talentId: number; rank: number };
}

export interface TalentRank {
  spellId: number;       // the spell that embodies this rank (mod aura or granted ability)
  description: string;
  effects: TalentEffect[];
}

export type TalentEffect =
  | { kind: 'damage_pct'; school: School; pct: number }
  // `attr: 'radius'` is SPELLMOD_RADIUS (op 6) — Totemic Mastery, Guardian Totems, set bonuses.
  // Today's bake still emits those as `kind: 'other'` aura 107/108 with miscValue 6.
  | { kind: 'spell_mod'; attr: 'damage' | 'cost' | 'cooldown' | 'castTime' | 'duration' | 'critChance' | 'threat' | 'radius' | 'notLoseCastingTime'; value: number; pct: boolean; classMask: number[] }
  | { kind: 'crit_pct'; pct: number }
  | { kind: 'stat_mod'; stat: Stat | 'all_stats'; value: number; pct: boolean }
  | { kind: 'resist_mod'; school: School; amount: number }
  // SPELL_AURA_MOD_MANA_REGEN_INTERRUPT (134). `pct` is CalculateSimpleValue (EffectBasePoints+BaseDice).
  // Cite: StatSystem.cpp UpdateManaRegen ~558; SpellAuraDefines.h:269.
  | { kind: 'mana_regen_interrupt'; pct: number }
  // SPELL_AURA_MOD_TARGET_RESISTANCE (123). `amount` is the aura modifier, typically negative, and
  // GetResistancePenetration is −sum(amount) for the matching school mask. Cite: Unit.cpp ~3890.
  | { kind: 'target_resistance'; amount: number; schoolMask: number }
  // SPELL_AURA_MOD_THREAT (10). `pct` is CalculateSimpleValue, applied to m_threatModifier[school]
  // for the bits in schoolMask. Cite: SpellAuras.cpp ~2806; Unit.cpp ~8626.
  | { kind: 'threat_pct'; pct: number; schoolMask: number }
  // Aura 42 PROC_TRIGGER_SPELL talent. `chance` is 0..1 from spell_template.ProcChance / 100, with
  // optional filters from spell_proc_event on the talent RANK spell id.
  | {
      kind: 'proc';
      triggerSpellId: number;
      chance: number | null;
      ppm: number | null;
      procFlags?: number;
      procEx?: number;
      cooldownMs?: number;
      schoolMask?: number;
      spellFamilyName?: number;
      spellFamilyMask?: number[];
    }
  | { kind: 'grant_spell'; spellId: number }
  | { kind: 'grant_passive' }
  | { kind: 'other'; aura: number; basePoints: number; miscValue: number; triggerSpell: number };
