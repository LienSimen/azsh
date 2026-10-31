// Gossip menu tree: options, types and condition gating. Pure — condition evaluation is injected.
// Cite: GossipDef.h Gossip_Option ~33–61; GossipDef.cpp AddMenuItem.

/** Cite: GossipDef.h enum Gossip_Option. */
export const GOSSIP_OPTION = {
  NONE: 0,
  GOSSIP: 1,
  QUESTGIVER: 2,
  VENDOR: 3,
  TAXIVENDOR: 4,
  TRAINER: 5,
  SPIRITHEALER: 6,
  SPIRITGUIDE: 7,
  INNKEEPER: 8,
  BANKER: 9,
  PETITIONER: 10,
  TABARDDESIGNER: 11,
  BATTLEFIELD: 12,
  AUCTIONEER: 13,
  STABLEPET: 14,
  ARMORER: 15,
  UNLEARNTALENTS: 16,
  UNLEARNPETSKILLS: 17,
} as const;

export type GossipOptionType = (typeof GOSSIP_OPTION)[keyof typeof GOSSIP_OPTION];

/** Action taken when the player selects the option. */
export interface GossipAction {
  /** Next gossip menu id (0 = close / terminal service). */
  menuId?: number;
  /** POI id to show on map (optional). */
  poi?: number;
  /** Script / service payload (trainer list id, etc.). */
  action?: number;
  /** gossip_menu_option.action_script_id — dbscript run when this option is picked. */
  scriptId?: number;
  /** Box money / coded text prompt (optional). */
  boxMoney?: number;
  boxText?: string;
}

export interface GossipOption {
  /** Index within the menu (display order). */
  id: number;
  /** Gossip_Option type. */
  optionType: GossipOptionType | number;
  /** Broadcast / npc text for the option line. */
  text?: string;
  icon?: number;
  /** conditions.condition_id — 0 / absent = always show. */
  conditionId?: number;
  action?: GossipAction;
  /** Nested sub-options for authored trees (optional convenience). */
  children?: GossipOption[];
}

export interface GossipMenu {
  menuId: number;
  /** npc_text id for the body. */
  textId?: number;
  /** gossip_menu.script_id — runs when the menu opens (the DM North guard buffs live here). */
  scriptId?: number;
  options: GossipOption[];
}

// Predicate supplied by the caller — typically wraps `isConditionSatisfied(conditionId, snapshot, table)`.
// Return true when the option should be shown.
export type ConditionEval = (conditionId: number) => boolean;

// Filter gossip options by conditionId. Cite: NPC/gossip load paths call IsConditionSatisfied before
// AddMenuItem. Options with conditionId 0 / undefined always pass. Recurses into `children` when present.
export function filterGossipOptions(
  options: readonly GossipOption[],
  conditionEval: ConditionEval,
): GossipOption[] {
  const out: GossipOption[] = [];
  for (const opt of options) {
    const cid = opt.conditionId ?? 0;
    if (cid !== 0 && !conditionEval(cid)) continue;
    const filtered: GossipOption = { ...opt };
    if (opt.children && opt.children.length > 0) {
      filtered.children = filterGossipOptions(opt.children, conditionEval);
    }
    out.push(filtered);
  }
  return out;
}

/** Resolve a menu by id from a table and return condition-filtered options. */
export function getFilteredMenu(
  menus: ReadonlyMap<number, GossipMenu> | Readonly<Record<number, GossipMenu>>,
  menuId: number,
  conditionEval: ConditionEval,
): GossipMenu | undefined {
  const menu =
    menus instanceof Map
      ? menus.get(menuId)
      : (menus as Record<number, GossipMenu>)[menuId];
  if (!menu) return undefined;
  return {
    ...menu,
    options: filterGossipOptions(menu.options, conditionEval),
  };
}

// Map option type → high-level service tag for UI routing. Cite: Gossip_Option drives vendor/trainer/taxi/…
// handlers in NPCHandler.
export function gossipServiceTag(
  optionType: number,
): string {
  switch (optionType) {
    case GOSSIP_OPTION.GOSSIP:
      return 'gossip';
    case GOSSIP_OPTION.QUESTGIVER:
      return 'quest';
    case GOSSIP_OPTION.VENDOR:
      return 'vendor';
    case GOSSIP_OPTION.TAXIVENDOR:
      return 'taxi';
    case GOSSIP_OPTION.TRAINER:
      return 'trainer';
    case GOSSIP_OPTION.SPIRITHEALER:
      return 'spirit_healer';
    case GOSSIP_OPTION.SPIRITGUIDE:
      return 'spirit_guide';
    case GOSSIP_OPTION.INNKEEPER:
      return 'innkeeper';
    case GOSSIP_OPTION.BANKER:
      return 'banker';
    case GOSSIP_OPTION.AUCTIONEER:
      return 'auctioneer';
    case GOSSIP_OPTION.STABLEPET:
      return 'stable';
    case GOSSIP_OPTION.BATTLEFIELD:
      return 'battlemaster';
    case GOSSIP_OPTION.ARMORER:
      return 'armorer';
    case GOSSIP_OPTION.UNLEARNTALENTS:
      return 'unlearn_talents';
    case GOSSIP_OPTION.UNLEARNPETSKILLS:
      return 'unlearn_pet';
    default:
      return 'none';
  }
}

// ---- Baked-row adapters + NPC service fallback (P-now wiring) --------------

// Shape of one `DataBundle.gossipMenus[]` row (gossip_menu + options bake). Do not invent options — only
// map fields present in the bake.
export interface BakedGossipMenuRow {
  menuId: number;
  textId?: number;
  /** gossip_menu.script_id — dbscript run when the menu OPENS (dbScripts.gossip). */
  scriptId?: number;
  options: Array<{
    id: number;
    icon?: number;
    text?: string;
    optionType: number;
    actionMenuId?: number;
    /** gossip_menu_option.action_script_id — dbscript run when the option is PICKED. */
    actionScriptId?: number;
    conditionId?: number;
    boxMoney?: number;
  }>;
}

/** Convert a baked menu row into the pure GossipMenu shape. */
export function fromBakedGossipMenu(row: BakedGossipMenuRow): GossipMenu {
  return {
    menuId: row.menuId,
    textId: row.textId,
    scriptId: row.scriptId,
    options: row.options.map((o) => ({
      id: o.id,
      optionType: o.optionType,
      text: o.text,
      icon: o.icon,
      conditionId: o.conditionId,
      action: {
        menuId: o.actionMenuId,
        boxMoney: o.boxMoney,
        scriptId: o.actionScriptId,
      },
    })),
  };
}

/** Index baked menus by menuId for O(1) resolveNpcGossip / getFilteredMenu. */
export function indexGossipMenus(
  rows: readonly BakedGossipMenuRow[],
): Map<number, GossipMenu> {
  const m = new Map<number, GossipMenu>();
  for (const row of rows) m.set(row.menuId, fromBakedGossipMenu(row));
  return m;
}

// Service roles the game already knows without creature.gossipMenuId (zone.vendors / trainers /
// flightMasters / innkeepers + DataStore lookups). Used only when no baked menu id is available.
export interface NpcServiceHints {
  questgiver?: boolean;
  vendor?: boolean;
  trainer?: boolean;
  taxi?: boolean;
  innkeeper?: boolean;
  banker?: boolean;
  auctioneer?: boolean;
  spiritHealer?: boolean;
}

/** Default option-line text for service shortcuts (display only; not baked npc_text). */
const FALLBACK_TEXT: Readonly<Record<string, string>> = {
  quest: 'What can I do for you?',
  vendor: 'I would like to browse your goods.',
  trainer: 'I seek training.',
  taxi: 'I need a ride.',
  innkeeper: 'Make this inn my home.',
  banker: 'I would like to check my deposit box.',
  auctioneer: "I'd like to use the auction house.",
  spirit_healer: 'Return me to life.',
};

// Build gossip options from known NPC service roles (today's quest/vendor shortcuts). Only emits roles that
// are true on `hints` — never invents services.
export function buildServiceFallbackOptions(hints: NpcServiceHints): GossipOption[] {
  const out: GossipOption[] = [];
  let id = 0;
  const push = (optionType: number, service: string) => {
    out.push({
      id: id++,
      optionType,
      text: FALLBACK_TEXT[service] ?? service,
    });
  };
  if (hints.questgiver) push(GOSSIP_OPTION.QUESTGIVER, 'quest');
  if (hints.vendor) push(GOSSIP_OPTION.VENDOR, 'vendor');
  if (hints.trainer) push(GOSSIP_OPTION.TRAINER, 'trainer');
  if (hints.taxi) push(GOSSIP_OPTION.TAXIVENDOR, 'taxi');
  if (hints.innkeeper) push(GOSSIP_OPTION.INNKEEPER, 'innkeeper');
  if (hints.banker) push(GOSSIP_OPTION.BANKER, 'banker');
  if (hints.auctioneer) push(GOSSIP_OPTION.AUCTIONEER, 'auctioneer');
  if (hints.spiritHealer) push(GOSSIP_OPTION.SPIRITHEALER, 'spirit_healer');
  return out;
}

// NPC talk resolution: the baked gossip menu when menuId is present and found, else the service
// shortcuts from zone and role data. Never invent menu lines from thin air.
export function resolveNpcGossip(
  menus: ReadonlyMap<number, GossipMenu> | readonly BakedGossipMenuRow[],
  menuId: number | undefined,
  hints: NpcServiceHints,
  conditionEval: ConditionEval = () => true,
): GossipMenu {
  const table: ReadonlyMap<number, GossipMenu> =
    menus instanceof Map
      ? menus
      : indexGossipMenus(menus as readonly BakedGossipMenuRow[]);

  if (menuId != null && menuId > 0) {
    const filtered = getFilteredMenu(table, menuId, conditionEval);
    if (filtered) return filtered;
  }

  return {
    menuId: menuId && menuId > 0 ? menuId : 0,
    options: filterGossipOptions(buildServiceFallbackOptions(hints), conditionEval),
  };
}

// ---- npc_text body (the greeting above the options) -----------------------

/** One npc_text slot as baked. Matches `NpcTextDef['slots'][n]`. */
export interface NpcTextSlot {
  prob: number;
  male: string;
  female?: string;
}

// Pick the slot the greeting frame shows. The server sends all 8 with their Probability, so a roll
// in [0,1) chooses weighted; no roll, or all-zero weights, takes the first. Cite: QueryHandler.cpp.
export function pickNpcTextSlot(
  slots: readonly NpcTextSlot[] | undefined,
  roll = 0,
): NpcTextSlot | undefined {
  if (!slots || slots.length === 0) return undefined;
  const total = slots.reduce((n, s) => n + Math.max(0, s.prob || 0), 0);
  if (total <= 0) return slots[0];
  let cut = Math.min(Math.max(roll, 0), 0.999999) * total;
  for (const s of slots) {
    cut -= Math.max(0, s.prob || 0);
    if (cut < 0) return s;
  }
  return slots[slots.length - 1];
}

// The greeting line for a player of `gender`, 0 male and 1 female. A slot with no female text uses
// the male one, and the bake folded the empty-male case, so this never returns "".
export function npcTextBody(
  slots: readonly NpcTextSlot[] | undefined,
  gender: 0 | 1 | undefined,
  roll = 0,
): string {
  const slot = pickNpcTextSlot(slots, roll);
  if (!slot) return '';
  return (gender === 1 && slot.female ? slot.female : slot.male) || '';
}
