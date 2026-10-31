// The PallyPower board: who blesses which class with what, and which aura each paladin runs.
// Pattern C. Cite: addons/PallyPower-1.12.1/PallyPower.lua:243 PallyPowerGrid_Update.

import type { DataStore } from '../../data/dataStore.ts';
import type { ActiveAura } from '../../domain/character/character.ts';
import { CLASS } from '../../data/schema/constants.ts';
import { className } from '../../domain/core/ids.ts';
import { companionLevel, companionSpellbook, companionTalents } from '../../domain/bots/squad.ts';
import {
  characterPlayerbotSpecId,
  companionPlayerbotSpecId,
  playerbotWeightScale,
} from '../../domain/bots/playerbotStatWeight.ts';
import { countItem, emptyInventory } from '../../domain/items/inventory.ts';
import { petPowerSpec } from '../../domain/pet/pet.ts';
import { partyRaidSubgroups } from '../../domain/raid/raidComp.ts';
import {
  paladinPartySeating,
  planPartyPaladinBuffs,
  type PaladinPartyBuffs,
  type PaladinPartyMember,
} from '../../domain/bots/paladinPrePull.ts';
import {
  AURA_FAMILIES,
  BLESSING_FAMILIES,
  autoSortPaladinAssignments,
  bestAura,
  blessingFamilyOf,
  blessingRanks,
  paladinAuraOf,
  isGreaterBlessing,
  normalizePaladinAssignments,
  type BlessingCell,
  type BlessingFamily,
  type PaladinAssignments,
  type PaladinAura,
} from '../../domain/rotation/paladinBuffs.ts';
import type { Game, GameState } from './types.ts';
import type { GameCtx } from './context.ts';

/** Symbol of Kings — the Greater Blessing reagent. Cite: botInventory.ts:180. */
export const SYMBOL_OF_KINGS = 21177;

/** A board column: one class present in the party, or the pets. */
export interface PaladinBoardColumn {
  /** Class id as a string, or 'pet'. Half of every cell key. */
  col: string;
  label: string;
  /** How many bodies sit in this column. */
  bodies: number;
}

/** One paladin's cell on one column. */
export interface PaladinBoardCell {
  /** The stored override, or null when the cell is on auto. */
  assigned: BlessingCell | null;
  /** What the CMaNGOS chain picks here with no overrides at all. */
  auto: BlessingFamily | null;
  /** The family this paladin ALREADY has on that column's bodies, from the last buff-up. */
  current: BlessingFamily | null;
  /** What the plan casts here now. Null = this paladin blesses nobody in this column. */
  effective: BlessingFamily | null;
  spellId: number | null;
  greater: boolean;
  /** The cast's own icon and name, so the grid draws the spell rather than a word. */
  icon: string | null;
  name: string | null;
}

/** One paladin row. */
export interface PaladinBoardRow {
  key: string;
  name: string;
  level: number;
  /** Best rank of each family this paladin can cast, in family order. */
  families: { family: BlessingFamily; spellId: number; greater: boolean; icon: string; name: string }[];
  auras: { aura: PaladinAura; spellId: number; icon: string; name: string }[];
  assignedAura: PaladinAura | null;
  aura: PaladinAura | null;
  /** The aura this paladin is ALREADY running, off the chips the party carries. */
  currentAura: PaladinAura | null;
  /** Symbols of Kings carried, and how many this plan spends. */
  symbols: number;
  symbolsSpent: number;
}

export interface PaladinBoard {
  rows: PaladinBoardRow[];
  columns: PaladinBoardColumn[];
  /** Cell by `${paladinKey}|${col}`. */
  cells: Record<string, PaladinBoardCell>;
}

const EMPTY_BOARD: PaladinBoard = { rows: [], columns: [], cells: {} };

/** The party as the Blessing plan sees it — the one copy squadDungeon's pull reads too, so the
 *  board cannot disagree with it about levels, spellbooks or reagents. */
export function paladinPartyMembers(state: GameState, ds: DataStore): PaladinPartyMember[] {
  const squad = state.squad ?? [];
  const subgroups = partyRaidSubgroups(
    { cls: state.char.cls, role: state.squadRole ?? 'dps' },
    squad.map((c) => ({ cls: c.cls, role: c.role, key: c.id })),
    state.autopilot?.raidSeating ?? null,
  );
  // A warlock demon spends mana and a hunter beast focus, which is the whole of BuffHelper's pet
  // split (:690-697). Absent when there is no living pet.
  const petRow = (
    key: string,
    pet: { creature: number; health: number } | undefined,
  ): { pet: { key: string; usesMana: boolean } } | Record<string, never> => {
    if (!pet || pet.health <= 0) return {};
    const cdef = ds.creature(pet.creature);
    return {
      pet: { key: `${key}:pet`, usesMana: !!cdef && petPowerSpec(cdef).powerType === 'mana' },
    };
  };
  return [
    {
      key: 'player',
      name: state.char.name,
      cls: state.char.cls,
      level: state.char.level,
      known: state.spellbook.known,
      role: state.squadRole ?? 'dps',
      spec: playerbotWeightScale(characterPlayerbotSpecId(state.char, ds))?.name ?? null,
      ...(state.char.talents ? { talents: state.char.talents } : {}),
      subgroup: subgroups[0] ?? 0,
      reagentCount: (item: number) => countItem(state.inventory, item),
      ...petRow('player', state.char.pet),
    },
    ...squad.map((c, i) => {
      const lvl = companionLevel(c, state.char.level);
      // The spec's own premade build, or a stamped talent link — the same map the companion's
      // spellbook is swept with. Cite: squad.ts:424 companionTalents.
      const talents = companionTalents(c, lvl, ds);
      return {
        key: c.id,
        name: c.name,
        cls: c.cls,
        level: lvl,
        known: companionSpellbook(c, lvl, ds).known,
        role: c.role,
        spec: playerbotWeightScale(
          companionPlayerbotSpecId(c.cls, c.specIdx, c.role, ds),
        )?.name ?? null,
        ...(talents ? { talents } : {}),
        subgroup: subgroups[i + 1] ?? 0,
        reagentCount: (item: number) => countItem(c.bags ?? emptyInventory(), item),
        ...petRow(c.id, c.pet),
      };
    }),
  ];
}

/** Every aura chip the party is carrying, with the paladin that put it there. A body's own cast
 *  carries no `fromCaster`, so the holder is the caster. */
function carriedChips(state: GameState): { from: string; col: string; spellId: number }[] {
  const out: { from: string; col: string; spellId: number }[] = [];
  const push = (bodyKey: string, col: string, rows: readonly ActiveAura[] | undefined): void => {
    for (const a of rows ?? []) out.push({ from: a.fromCaster ?? bodyKey, col, spellId: a.spellId });
  };
  push('player', String(state.char.cls), state.char.activeAuras);
  if (state.char.pet && state.char.pet.health > 0) {
    push('player:pet', 'pet', state.char.pet.prePullAuras);
  }
  for (const c of state.squad ?? []) {
    push(c.id, String(c.cls), c.prePullAuras);
    if (c.pet && c.pet.health > 0) push(`${c.id}:pet`, 'pet', c.pet.prePullAuras);
  }
  return out;
}

/** Board columns: every class in the party in roster order, then 'pet' when a pet is out. */
function columnsOf(members: readonly PaladinPartyMember[]): PaladinBoardColumn[] {
  const cols: PaladinBoardColumn[] = [];
  const seen = new Map<string, PaladinBoardColumn>();
  const bump = (col: string, label: string): void => {
    const cur = seen.get(col);
    if (cur) { cur.bodies++; return; }
    const row = { col, label, bodies: 1 };
    seen.set(col, row);
    cols.push(row);
  };
  for (const m of members) bump(String(m.cls), className(m.cls));
  for (const m of members) if (m.pet) bump('pet', 'Pet');
  return cols;
}

export function createPaladinBoardModule(ctx: GameCtx): Pick<
  Game,
  | 'paladinAssignments'
  | 'paladinBoard'
  | 'setPaladinBlessing'
  | 'setPaladinAura'
  | 'stepPaladinBlessing'
  | 'stepPaladinAura'
  | 'autoSortPaladinAssignments'
  | 'clearPaladinAssignments'
> {
  const { ds, state } = ctx;

  const assignments = (): PaladinAssignments =>
    normalizePaladinAssignments(state.paladinAssignments);

  /** Write the board back; an empty board drops the key so a save carries nothing extra. */
  const write = (
    mutate: (b: {
      blessing: Record<string, BlessingCell>;
      aura: Record<string, PaladinAura>;
    }) => void,
  ): void => {
    const cur = assignments();
    const next = { blessing: { ...(cur.blessing ?? {}) }, aura: { ...(cur.aura ?? {}) } };
    mutate(next);
    const empty = !Object.keys(next.blessing).length && !Object.keys(next.aura).length;
    state.paladinAssignments = empty ? undefined : next;
  };

  const board = (): PaladinBoard => {
    const members = paladinPartyMembers(state, ds);
    const paladins = members.filter((m) => m.cls === CLASS.PALADIN);
    if (!paladins.length) return EMPTY_BOARD;
    const stored = assignments();
    const now = Date.now();
    // Two plans off the same roster: what runs now, and what the chain alone would do. The second
    // is what "Auto" in a cell means, so the grid names the pick instead of showing a blank.
    const live = planPartyPaladinBuffs(members, ds, now, stored);
    const auto = planPartyPaladinBuffs(members, ds, now);
    const colOf = (bodyKey: string): string | null => {
      const owner = members.find((m) => m.key === bodyKey);
      if (owner) return String(owner.cls);
      return members.some((m) => m.pet?.key === bodyKey) ? 'pet' : null;
    };
    // A column holds several bodies and one paladin gives them the same family unless a body's
    // role bends the chain. The first planned cast in the column is the cell's answer.
    const familyIn = (
      plan: PaladinPartyBuffs,
      palKey: string,
      col: string,
    ): { family: BlessingFamily; spellId: number; greater: boolean } | null => {
      for (const b of plan.blessings) {
        if (b.from !== palKey || colOf(b.on) !== col) continue;
        return { family: b.family, spellId: b.spellId, greater: b.greater };
      }
      return null;
    };

    // What each paladin ALREADY has out, off the chips the party carries. This is what "Auto"
    // shows: the operator asked what they have, not what the next plan intends.
    const chips = carriedChips(state);
    const carriedFamily = (palKey: string, col: string): BlessingFamily | null => {
      for (const c of chips) {
        if (c.from !== palKey || c.col !== col) continue;
        const fam = blessingFamilyOf(ds.spell(c.spellId));
        if (fam) return fam;
      }
      return null;
    };
    const carriedAura = (palKey: string): PaladinAura | null => {
      for (const c of chips) {
        if (c.from !== palKey) continue;
        const a = paladinAuraOf(ds.spell(c.spellId));
        if (a) return a;
      }
      return null;
    };

    const columns = columnsOf(members);
    const cells: Record<string, PaladinBoardCell> = {};
    const rows: PaladinBoardRow[] = paladins.map((p) => {
      const provider = {
        key: p.key,
        name: p.name,
        level: p.level,
        known: p.known,
        ...(p.spec != null ? { spec: p.spec } : {}),
        ...(p.role ? { role: p.role } : {}),
      };
      const families: PaladinBoardRow['families'] = [];
      for (const family of BLESSING_FAMILIES) {
        const { normal, greater } = blessingRanks(provider, family, ds);
        const sp = greater ?? normal;
        if (sp) {
          families.push({
            family, spellId: sp.id, greater: isGreaterBlessing(sp),
            icon: sp.icon ?? '', name: sp.name ?? '',
          });
        }
      }
      const auras: PaladinBoardRow['auras'] = [];
      for (const aura of AURA_FAMILIES) {
        const sp = bestAura(provider, aura, ds);
        if (sp) auras.push({ aura, spellId: sp.id, icon: sp.icon ?? '', name: sp.name ?? '' });
      }
      for (const c of columns) {
        const key = `${p.key}|${c.col}`;
        const hit = familyIn(live, p.key, c.col);
        const sp = hit ? ds.spell(hit.spellId) : undefined;
        cells[key] = {
          assigned: stored.blessing?.[key] ?? null,
          auto: familyIn(auto, p.key, c.col)?.family ?? null,
          current: carriedFamily(p.key, c.col),
          effective: hit?.family ?? null,
          spellId: hit?.spellId ?? null,
          greater: hit?.greater ?? false,
          icon: sp?.icon ?? null,
          name: sp?.name ?? null,
        };
      }
      return {
        key: p.key,
        name: p.name,
        level: p.level,
        families,
        auras,
        assignedAura: stored.aura?.[p.key] ?? null,
        aura: live.auras.find((a) => a.from === p.key)?.aura ?? null,
        currentAura: carriedAura(p.key),
        symbols: p.reagentCount?.(SYMBOL_OF_KINGS) ?? 0,
        symbolsSpent: live.reagents
          .filter((r) => r.from === p.key && r.item === SYMBOL_OF_KINGS)
          .reduce((n, r) => n + r.count, 0),
      };
    });
    return { rows, columns, cells };
  };

  return {
    paladinAssignments: assignments,
    paladinBoard: board,

    setPaladinBlessing(paladinKey, col, cell) {
      const key = `${paladinKey}|${col}`;
      write((b) => {
        if (cell == null) delete b.blessing[key];
        else b.blessing[key] = cell;
      });
      return { ok: true, board: board() };
    },

    // A wheel notch or a swipe steps the cell one place along its own cycle: auto, then every
    // family this paladin can actually cast, then nothing. Wrapping, so one gesture reaches all.
    stepPaladinBlessing(paladinKey, col, dir) {
      const row = board().rows.find((r) => r.key === paladinKey);
      if (!row) return { ok: false, reason: 'No such paladin in the party' };
      const cycle: (BlessingCell | null)[] = [null, ...row.families.map((f) => f.family), 'none'];
      const key = `${paladinKey}|${col}`;
      const at = cycle.indexOf(assignments().blessing?.[key] ?? null);
      const next = cycle[(((at < 0 ? 0 : at) + dir) % cycle.length + cycle.length) % cycle.length] ?? null;
      write((b) => {
        if (next == null) delete b.blessing[key];
        else b.blessing[key] = next;
      });
      return { ok: true, board: board() };
    },

    stepPaladinAura(paladinKey, dir) {
      const row = board().rows.find((r) => r.key === paladinKey);
      if (!row) return { ok: false, reason: 'No such paladin in the party' };
      const cycle: (PaladinAura | null)[] = [null, ...row.auras.map((a) => a.aura)];
      const at = cycle.indexOf(assignments().aura?.[paladinKey] ?? null);
      const next = cycle[(((at < 0 ? 0 : at) + dir) % cycle.length + cycle.length) % cycle.length] ?? null;
      write((b) => {
        if (next == null) delete b.aura[paladinKey];
        else b.aura[paladinKey] = next;
      });
      return { ok: true, board: board() };
    },

    setPaladinAura(paladinKey, aura) {
      write((b) => {
        if (aura == null) delete b.aura[paladinKey];
        else b.aura[paladinKey] = aura;
      });
      return { ok: true, board: board() };
    },

    // Write every cell the spread would pick, so the picks are on the grid and still wheelable.
    // An improved family goes to the paladin that took the talent (autoSortPaladinAssignments).
    autoSortPaladinAssignments() {
      const members = paladinPartyMembers(state, ds);
      const { providers, targets } = paladinPartySeating(members);
      if (!providers.length) return { ok: false, reason: 'No paladin in the party' };
      state.paladinAssignments = autoSortPaladinAssignments(providers, targets, ds);
      return { ok: true, board: board() };
    },

    clearPaladinAssignments() {
      state.paladinAssignments = undefined;
      return { ok: true, board: board() };
    },
  };
}
