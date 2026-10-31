// Profession specialization gossip consumer — applies the npc_professions IR learn/unlearn kinds
// to player known-spell state. Pure: no Game or DataStore; engine professions.ts moves the gold.

import {
  BS_ACTION_LEARN_ARMOR,
  BS_ACTION_LEARN_AXE,
  BS_ACTION_LEARN_HAMMER,
  BS_ACTION_LEARN_SWORD,
  BS_ACTION_LEARN_WEAPON,
  BS_ACTION_UNLEARN_ARMOR,
  BS_ACTION_UNLEARN_AXE,
  BS_ACTION_UNLEARN_HAMMER,
  BS_ACTION_UNLEARN_SWORD,
  BS_ACTION_UNLEARN_WEAPON,
  blacksmithGossipSelect,
  GOSSIP_ACTION_INFO_DEF,
  GOSSIP_ACTION_TRADE,
  GOSSIP_ACTION_TRAIN,
  LW_ACTION_LEARN_DRAGON,
  LW_ACTION_LEARN_ELEMENTAL,
  LW_ACTION_LEARN_TRIBAL,
  LW_ACTION_UNLEARN_DRAGON,
  LW_ACTION_UNLEARN_ELEMENTAL,
  LW_ACTION_UNLEARN_TRIBAL,
  leatherGossipSelect,
  S_ARMOR,
  S_AXE,
  S_DRAGON,
  S_ELEMENTAL,
  S_HAMMER,
  S_LEARN_ARMOR,
  S_LEARN_AXE,
  S_LEARN_DRAGON,
  S_LEARN_ELEMENTAL,
  S_LEARN_HAMMER,
  S_LEARN_SWORD,
  S_LEARN_TRIBAL,
  S_LEARN_WEAPON,
  S_SWORD,
  S_TRIBAL,
  S_UNLEARN_DRAGON,
  S_UNLEARN_ELEMENTAL,
  S_UNLEARN_TRIBAL,
  S_WEAPON,
  type BlacksmithGossipItem,
  type LeatherGossipItem,
} from './npcProfessions.ts';

// LEARN_SPELL (effect 36) → the specialization spell granted via EffectTriggerSpell1: 9790→9788,
// 9789→9787, 17044→17040, 17043→17041, 17042→17039, 10657→10656, 10659→10658, 10661→10660.
export const LEARN_SPELL_GRANTS: Readonly<Record<number, number>> = {
  [S_LEARN_ARMOR]: S_ARMOR,
  [S_LEARN_WEAPON]: S_WEAPON,
  [S_LEARN_HAMMER]: S_HAMMER,
  [S_LEARN_AXE]: S_AXE,
  [S_LEARN_SWORD]: S_SWORD,
  [S_LEARN_DRAGON]: S_DRAGON,
  [S_LEARN_ELEMENTAL]: S_ELEMENTAL,
  [S_LEARN_TRIBAL]: S_TRIBAL,
};

// Unlearn cast spell → the specialization spell removed. The S_UNLEARN_* ids are TBC-range and
// vanilla Spell.sql lacks them, so the removal is scripted. Cite: npc_professions.cpp:559-614.
export const UNLEARN_SPELL_REMOVES: Readonly<Record<number, number>> = {
  [S_UNLEARN_DRAGON]: S_DRAGON,
  [S_UNLEARN_ELEMENTAL]: S_ELEMENTAL,
  [S_UNLEARN_TRIBAL]: S_TRIBAL,
};

/** All specialization spell ids a player may hold (BS + LW). */
export const PROFESSION_SPEC_SPELLS: readonly number[] = [
  S_WEAPON,
  S_ARMOR,
  S_HAMMER,
  S_AXE,
  S_SWORD,
  S_DRAGON,
  S_ELEMENTAL,
  S_TRIBAL,
];

/** Specialization spells currently known from a known-spells set. */
export function knownProfessionSpecs(
  knownSpells: ReadonlySet<number> | readonly number[],
): number[] {
  const has = (id: number) => {
    for (const x of knownSpells) if (x === id) return true;
    return false;
  };
  return PROFESSION_SPEC_SPELLS.filter(has);
}

export type ProfessionSpecKind =
  | BlacksmithGossipItem['kind']
  | LeatherGossipItem['kind'];

export type ProfessionSpecApplyResult =
  | {
      ok: true;
      phase:
        | 'cast_learn'
        | 'cast_unlearn'
        | 'confirm_learn'
        | 'confirm_unlearn'
        | 'close'
        | 'trade'
        | 'train'
        | 'error_money'
        | 'error_equipped';
      /** Updated known spells after learn/unlearn. */
      knownSpells: number[];
      moneyCopper: number;
      /** Craft-ability spell ids stripped on LW unlearn (ProfessionUnlearnSpells). */
      removeRecipeSpells: readonly number[];
      grantedSpellId: number | null;
      removedSpellId: number | null;
      confirmCostCopper: number | null;
      closeMenu: boolean;
      kind: ProfessionSpecKind | null;
      cite: string;
      // True when BS unlearn reached SendActionMenu default CLOSE without a cast. Cite:
      // npc_professions.cpp:388-390 — unlearn actions are not handled in SendActionMenu.
      blacksmithUnlearnGap?: boolean;
      // Scripted GOSSIP_ACTION_TRAIN → SEND_TRAINERLIST. Host opens trainer surface. Cite:
      // npc_professions.cpp:355-357.
      openTrainer?: boolean;
      // Scripted GOSSIP_ACTION_TRADE → SEND_VENDORLIST. Host opens vendor surface. Cite:
      // npc_professions.cpp:352-354.
      openVendor?: boolean;
    }
  | { ok: false; reason: string; cite: string };

function asSpellList(known: ReadonlySet<number> | readonly number[]): number[] {
  return known instanceof Set ? [...known] : [...known];
}

function withSpell(known: readonly number[], id: number): number[] {
  return known.includes(id) ? [...known] : [...known, id];
}

function withoutSpells(known: readonly number[], ids: readonly number[]): number[] {
  if (!ids.length) return [...known];
  const drop = new Set(ids);
  return known.filter((id) => !drop.has(id));
}

// Map INFO_DEF-normalized BS action offsets → kind. Absolute TRADE=1 / TRAIN=2 collide with
// LEARN_ARMOR=1 / LEARN_WEAPON=2, so callers must resolve those before normalizing.
function bsKindForAction(act: number): ProfessionSpecKind | null {
  switch (act) {
    case BS_ACTION_LEARN_ARMOR:
      return 'learn_armor';
    case BS_ACTION_LEARN_WEAPON:
      return 'learn_weapon';
    case BS_ACTION_UNLEARN_WEAPON:
      return 'unlearn_weapon';
    case BS_ACTION_UNLEARN_ARMOR:
      return 'unlearn_armor';
    case BS_ACTION_LEARN_HAMMER:
      return 'learn_hammer';
    case BS_ACTION_LEARN_AXE:
      return 'learn_axe';
    case BS_ACTION_LEARN_SWORD:
      return 'learn_sword';
    case BS_ACTION_UNLEARN_HAMMER:
      return 'unlearn_hammer';
    case BS_ACTION_UNLEARN_AXE:
      return 'unlearn_axe';
    case BS_ACTION_UNLEARN_SWORD:
      return 'unlearn_sword';
    default:
      return null;
  }
}

// Map INFO_DEF-normalized LW action offsets → kind. Same TRADE=1/TRAIN=2 collision as BS
// (LW_ACTION_UNLEARN_DRAGON=1, LEARN_DRAGON=2).
function lwKindForAction(act: number): ProfessionSpecKind | null {
  switch (act) {
    case LW_ACTION_UNLEARN_DRAGON:
      return 'unlearn_dragon';
    case LW_ACTION_LEARN_DRAGON:
      return 'learn_dragon';
    case LW_ACTION_UNLEARN_ELEMENTAL:
      return 'unlearn_elemental';
    case LW_ACTION_LEARN_ELEMENTAL:
      return 'learn_elemental';
    case LW_ACTION_UNLEARN_TRIBAL:
      return 'unlearn_tribal';
    case LW_ACTION_LEARN_TRIBAL:
      return 'learn_tribal';
    default:
      return null;
  }
}

// Absolute sc_gossip TRADE/TRAIN (1/2) must win over INFO_DEF-normalized learn offsets that share the same
// numbers. Cite: npc_professions.cpp:352-357 / :552-557.
function kindFromGossipAction(
  action: number,
  act: number,
  mapNormalized: (act: number) => ProfessionSpecKind | null,
): ProfessionSpecKind | null {
  if (action === GOSSIP_ACTION_TRAIN) return 'train';
  if (action === GOSSIP_ACTION_TRADE) return 'trade';
  return mapNormalized(act);
}

// Apply a blacksmith specialization gossip select to pure player state, granting
// LEARN_SPELL_GRANTS[castSpellId]. BS unlearn falls through to CLOSE in source (:388-390).
export function applyBlacksmithSpecSelect(opts: {
  sender: number;
  action: number;
  level: number;
  knownSpells: ReadonlySet<number> | readonly number[];
  creatureEntry: number;
  moneyCopper?: number;
}): ProfessionSpecApplyResult {
  const select = blacksmithGossipSelect({
    sender: opts.sender,
    action: opts.action,
    level: opts.level,
    knownSpells: opts.knownSpells,
    creatureEntry: opts.creatureEntry,
  });
  if (!select.handled) {
    return { ok: false, reason: 'Unhandled gossip sender', cite: select.cite };
  }
  const act =
    opts.action >= GOSSIP_ACTION_INFO_DEF
      ? opts.action - GOSSIP_ACTION_INFO_DEF
      : opts.action;
  // Absolute TRAIN/TRADE (1/2) must not fall into BS_ACTION_LEARN_ARMOR/WEAPON (same ints).
  const kind = kindFromGossipAction(opts.action, act, bsKindForAction);
  const known = asSpellList(opts.knownSpells);
  const money = opts.moneyCopper ?? 0;

  if (select.phase === 'cast_learn' && select.castSpellId != null) {
    const grant = LEARN_SPELL_GRANTS[select.castSpellId];
    if (grant == null) {
      return {
        ok: false,
        reason: `No LEARN_SPELL grant map for ${select.castSpellId}`,
        cite: select.cite,
      };
    }
    return {
      ok: true,
      phase: 'cast_learn',
      knownSpells: withSpell(known, grant),
      moneyCopper: money,
      removeRecipeSpells: [],
      grantedSpellId: grant,
      removedSpellId: null,
      confirmCostCopper: null,
      closeMenu: select.closeMenu,
      kind,
      cite: select.cite,
    };
  }

  if (select.phase === 'confirm_learn' || select.phase === 'confirm_unlearn') {
    return {
      ok: true,
      phase: select.phase,
      knownSpells: known,
      moneyCopper: money,
      removeRecipeSpells: [],
      grantedSpellId: null,
      removedSpellId: null,
      confirmCostCopper: select.confirmCostCopper,
      closeMenu: select.closeMenu,
      kind,
      cite: select.cite,
    };
  }

  // GOSSIP_ACTION_TRAIN / TRADE — open the real trainer / vendor surface (no spell cast).
  // Cite: npc_professions.cpp:352-357 SEND_VENDORLIST / SEND_TRAINERLIST.
  if (kind === 'train') {
    return {
      ok: true,
      phase: 'train',
      knownSpells: known,
      moneyCopper: money,
      removeRecipeSpells: [],
      grantedSpellId: null,
      removedSpellId: null,
      confirmCostCopper: null,
      closeMenu: false,
      kind,
      cite: select.cite,
      openTrainer: true,
    };
  }
  if (kind === 'trade') {
    return {
      ok: true,
      phase: 'trade',
      knownSpells: known,
      moneyCopper: money,
      removeRecipeSpells: [],
      grantedSpellId: null,
      removedSpellId: null,
      confirmCostCopper: null,
      closeMenu: false,
      kind,
      cite: select.cite,
      openVendor: true,
    };
  }

  // Unlearn actions in SendActionMenu → default CLOSE (no cast). Cite: :388-390.
  const unlearnKind =
    kind === 'unlearn_armor' ||
    kind === 'unlearn_weapon' ||
    kind === 'unlearn_hammer' ||
    kind === 'unlearn_axe' ||
    kind === 'unlearn_sword';
  return {
    ok: true,
    phase: 'close',
    knownSpells: known,
    moneyCopper: money,
    removeRecipeSpells: [],
    grantedSpellId: null,
    removedSpellId: null,
    confirmCostCopper: null,
    closeMenu: select.closeMenu,
    kind,
    cite: select.cite,
    blacksmithUnlearnGap: unlearnKind && select.phase === 'close' ? true : undefined,
  };
}

// Apply a leatherworking specialization gossip select: learn grants the spell, unlearn removes it
// plus its recipes and deducts GetUnlearnCostMedium. Cite: npc_professions.cpp:548-620.
export function applyLeatherSpecSelect(opts: {
  sender: number;
  action: number;
  level: number;
  moneyCopper: number;
  knownSpells: ReadonlySet<number> | readonly number[];
  equippedOk: boolean;
}): ProfessionSpecApplyResult {
  const select = leatherGossipSelect({
    sender: opts.sender,
    action: opts.action,
    level: opts.level,
    moneyCopper: opts.moneyCopper,
    equippedOk: opts.equippedOk,
  });
  if (!select.handled) {
    return { ok: false, reason: 'Unhandled gossip sender', cite: select.cite };
  }
  const act =
    opts.action >= GOSSIP_ACTION_INFO_DEF
      ? opts.action - GOSSIP_ACTION_INFO_DEF
      : opts.action;
  // Absolute TRAIN/TRADE (1/2) must not fall into LW unlearn/learn dragon (same ints).
  const kind = kindFromGossipAction(opts.action, act, lwKindForAction);
  const known = asSpellList(opts.knownSpells);

  if (select.phase === 'cast_learn' && select.castSpellId != null) {
    const grant = LEARN_SPELL_GRANTS[select.castSpellId];
    if (grant == null) {
      return {
        ok: false,
        reason: `No LEARN_SPELL grant map for ${select.castSpellId}`,
        cite: select.cite,
      };
    }
    return {
      ok: true,
      phase: 'cast_learn',
      knownSpells: withSpell(known, grant),
      moneyCopper: opts.moneyCopper,
      removeRecipeSpells: [],
      grantedSpellId: grant,
      removedSpellId: null,
      confirmCostCopper: null,
      closeMenu: select.closeMenu,
      kind,
      cite: select.cite,
    };
  }

  if (select.phase === 'cast_unlearn' && select.castSpellId != null) {
    const removed = UNLEARN_SPELL_REMOVES[select.castSpellId];
    if (removed == null) {
      return {
        ok: false,
        reason: `No UNLEARN remove map for ${select.castSpellId}`,
        cite: select.cite,
      };
    }
    const drop = [removed, ...select.removeRecipeSpells];
    return {
      ok: true,
      phase: 'cast_unlearn',
      knownSpells: withoutSpells(known, drop),
      moneyCopper: opts.moneyCopper + select.moneyDelta,
      removeRecipeSpells: select.removeRecipeSpells,
      grantedSpellId: null,
      removedSpellId: removed,
      confirmCostCopper: null,
      closeMenu: select.closeMenu,
      kind,
      cite: select.cite,
    };
  }

  // GOSSIP_ACTION_TRAIN / TRADE — open the real trainer / vendor surface.
  // Cite: npc_professions.cpp:552-557 SEND_VENDORLIST / SEND_TRAINERLIST.
  if (kind === 'train') {
    return {
      ok: true,
      phase: 'train',
      knownSpells: known,
      moneyCopper: opts.moneyCopper,
      removeRecipeSpells: [],
      grantedSpellId: null,
      removedSpellId: null,
      confirmCostCopper: null,
      closeMenu: false,
      kind,
      cite: select.cite,
      openTrainer: true,
    };
  }
  if (kind === 'trade') {
    return {
      ok: true,
      phase: 'trade',
      knownSpells: known,
      moneyCopper: opts.moneyCopper,
      removeRecipeSpells: [],
      grantedSpellId: null,
      removedSpellId: null,
      confirmCostCopper: null,
      closeMenu: false,
      kind,
      cite: select.cite,
      openVendor: true,
    };
  }

  if (
    select.phase === 'error_money' ||
    select.phase === 'error_equipped' ||
    select.phase === 'close'
  ) {
    return {
      ok: true,
      phase: select.phase,
      knownSpells: known,
      moneyCopper: opts.moneyCopper,
      removeRecipeSpells: [],
      grantedSpellId: null,
      removedSpellId: null,
      confirmCostCopper: null,
      closeMenu: select.closeMenu,
      kind,
      cite: select.cite,
    };
  }

  return {
    ok: true,
    phase: 'close',
    knownSpells: known,
    moneyCopper: opts.moneyCopper,
    removeRecipeSpells: [],
    grantedSpellId: null,
    removedSpellId: null,
    confirmCostCopper: null,
    closeMenu: true,
    kind,
    cite: select.cite,
  };
}
