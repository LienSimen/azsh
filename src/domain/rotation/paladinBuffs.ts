// PURE: which Blessing each paladin puts on each body, and which Aura each one runs.
// Ported from CMaNGOS PlayerbotPaladinAI: BuffHelper picks the blessing by the target's class
// (:643-716) and CheckAuras picks the aura by spec / "is there a tank" (:412-450). Both source
// functions carry a "TODO: take into account other paladins in the group" — the multi-paladin
// spread below is this tree's, and is marked where it starts.

import type { DataStore } from '../../data/dataStore.ts';
import type { SpellDef } from '../../data/schema.ts';
import { CLASS } from '../../data/schema/constants.ts';
import { spellExclusionGroup } from '../professions/characterEnchants.ts';

/** CMaNGOS spell_group Id 7 — every Blessing, Rule 2 (UNIQUE_PER_CASTER). */
export const PALADIN_BLESSING_GROUP = 7;
/** CMaNGOS spell_group Id 8 — every paladin Aura, Rule 2. */
export const PALADIN_AURA_GROUP = 8;

/** Blessing families, rank- and Greater-free. */
export type BlessingFamily =
  | 'might' | 'wisdom' | 'kings' | 'sanctuary' | 'salvation' | 'light';

/** Paladin auras, in the order CheckAuras prefers them. */
export type PaladinAura =
  | 'devotion' | 'concentration' | 'retribution' | 'sanctity'
  | 'fire_resistance' | 'frost_resistance' | 'shadow_resistance';

/** One cell of the PallyPower board: a family, or 'none' for "this paladin blesses it with nothing". */
export type BlessingCell = BlessingFamily | 'none';

/** PallyPower's grid: one blessing per (paladin, target class), one aura per paladin, an absent
 *  cell auto. Cite: addons/PallyPower-1.12.1/PallyPower.lua:9 PallyPower_Assignments. */
export interface PaladinAssignments {
  blessing?: Readonly<Record<string, BlessingCell>>;
  aura?: Readonly<Record<string, PaladinAura>>;
}

/** Board cell key: one paladin's column on one body's class, or on 'pet'. */
export function blessingCellKey(palKey: string, t: { cls: number; isPet?: boolean }): string {
  return `${palKey}|${t.isPet ? 'pet' : t.cls}`;
}

const BLESSING_BY_NAME: ReadonlyArray<[RegExp, BlessingFamily]> = [
  [/blessing of might$/i, 'might'],
  [/blessing of wisdom$/i, 'wisdom'],
  [/blessing of kings$/i, 'kings'],
  [/blessing of sanctuary$/i, 'sanctuary'],
  [/blessing of salvation$/i, 'salvation'],
  [/blessing of light$/i, 'light'],
];

const AURA_BY_NAME: ReadonlyArray<[RegExp, PaladinAura]> = [
  [/^devotion aura$/i, 'devotion'],
  [/^concentration aura$/i, 'concentration'],
  [/^retribution aura$/i, 'retribution'],
  [/^sanctity aura$/i, 'sanctity'],
  [/^fire resistance aura$/i, 'fire_resistance'],
  [/^frost resistance aura$/i, 'frost_resistance'],
  [/^shadow resistance aura$/i, 'shadow_resistance'],
];

/** Every blessing family, in the order the board offers them. */
export const BLESSING_FAMILIES: readonly BlessingFamily[] = BLESSING_BY_NAME.map(([, f]) => f);
/** Every aura, CheckAuras' four first and then the three resistances. */
export const AURA_FAMILIES: readonly PaladinAura[] = AURA_BY_NAME.map(([, a]) => a);

/** One board value off a control, or null when the string names no family. */
export function asBlessingCell(v: string): BlessingCell | null {
  if (v === 'none') return 'none';
  return (BLESSING_FAMILIES as readonly string[]).includes(v) ? (v as BlessingFamily) : null;
}

/** One aura off a control, or null when the string names none. */
export function asPaladinAura(v: string): PaladinAura | null {
  return (AURA_FAMILIES as readonly string[]).includes(v) ? (v as PaladinAura) : null;
}

/** The stored board, sanitised: an unknown family or aura is dropped rather than trusted. */
export function normalizePaladinAssignments(raw: unknown): PaladinAssignments {
  const out: { blessing: Record<string, BlessingCell>; aura: Record<string, PaladinAura> } =
    { blessing: {}, aura: {} };
  const src = (raw ?? {}) as { blessing?: unknown; aura?: unknown };
  for (const [k, v] of Object.entries((src.blessing ?? {}) as Record<string, unknown>)) {
    if (v === 'none' || (BLESSING_FAMILIES as readonly unknown[]).includes(v)) {
      out.blessing[k] = v as BlessingCell;
    }
  }
  for (const [k, v] of Object.entries((src.aura ?? {}) as Record<string, unknown>)) {
    if ((AURA_FAMILIES as readonly unknown[]).includes(v)) out.aura[k] = v as PaladinAura;
  }
  return out;
}

/** Blessing family of a spell, or null. Group 7 is the gate; the name only names the family. */
export function blessingFamilyOf(sp: SpellDef | undefined): BlessingFamily | null {
  if (!sp) return null;
  const name = sp.name ?? '';
  if (spellExclusionGroup(sp) !== PALADIN_BLESSING_GROUP && !/^(greater )?blessing of /i.test(name)) {
    return null;
  }
  for (const [re, fam] of BLESSING_BY_NAME) if (re.test(name)) return fam;
  return null;
}

/** Aura family of a spell, or null. Group 8 is the gate. */
export function paladinAuraOf(sp: SpellDef | undefined): PaladinAura | null {
  if (!sp) return null;
  const name = sp.name ?? '';
  if (spellExclusionGroup(sp) !== PALADIN_AURA_GROUP && !/ aura$/i.test(name)) return null;
  for (const [re, a] of AURA_BY_NAME) if (re.test(name)) return a;
  return null;
}

/** Greater Blessing — 15 min and TARGET_UNIT_RAID_AND_CLASS instead of 5 min single-target. */
export function isGreaterBlessing(sp: SpellDef | undefined): boolean {
  return /^greater blessing of /i.test(sp?.name ?? '');
}

/** Whoever can hand out a Blessing or run an Aura. */
export interface PaladinProvider {
  /** Stable key — 'player' or the companion id. Identifies the caster for per-caster stacking. */
  key: string;
  name: string;
  level: number;
  /** Every spell id this paladin knows. */
  known: readonly number[];
  /** Playerbot spec name ('holy' / 'prot' / 'retrib' / …), when one is resolved. */
  spec?: string | null;
  /** Signed squad role, the fallback when no spec name is known. */
  role?: 'tank' | 'healer' | 'dps';
  /** Talent id → spent rank, the map `char.talents` carries. Decides who hands out an improved
   *  Blessing or Aura when Auto sort spreads the board. */
  talents?: Readonly<Record<number, number>>;
  // How many of `item` this paladin carries, for the Greater Blessing reagent (Symbol of Kings
  // 21177). Absent ⇒ unlimited, which is what a build with no bags in hand must assume.
  reagentCount?: (item: number) => number;
}

/** One body a Blessing lands on. */
export interface BlessingTarget {
  key: string;
  cls: number;
  role?: 'tank' | 'healer' | 'dps';
  /** A hunter beast or warlock demon rather than a party member. */
  isPet?: boolean;
  /** A pet on mana (warlock demon) — BuffHelper:690 splits the pet's blessing on this. */
  usesMana?: boolean;
}

/** One planned cast: `from` blesses `on` with `spellId`. */
export interface PlannedBlessing {
  from: string;
  on: string;
  spellId: number;
  family: BlessingFamily;
  durationMs: number;
  /** Greater rank — 15 min, one reagent, and one cast covers the target's whole class. */
  greater: boolean;
  /** The board column this cast answers — the target's class id, or 'pet'. Same key
   *  {@link blessingCellKey} writes, so a keep-up row can scope itself to it. */
  col: string;
}

/** Reagents one plan spends, per paladin. */
export interface PlannedReagent {
  from: string;
  item: number;
  count: number;
}

// BuffHelper's per-class chain, verbatim. Cite: PlayerbotPaladinAI.cpp:645-655 (druid/shaman/
// paladin), :666-685 (hunter/rogue/warrior), :688-716 (warlock/priest/mage).
const CLASS_CHAIN: Readonly<Record<number, readonly BlessingFamily[]>> = {
  [CLASS.DRUID]: ['might', 'kings', 'wisdom', 'sanctuary'],
  [CLASS.SHAMAN]: ['might', 'kings', 'wisdom', 'sanctuary'],
  [CLASS.PALADIN]: ['might', 'kings', 'wisdom', 'sanctuary'],
  [CLASS.HUNTER]: ['might', 'kings', 'sanctuary'],
  [CLASS.ROGUE]: ['might', 'kings', 'sanctuary'],
  [CLASS.WARRIOR]: ['might', 'kings', 'sanctuary'],
  [CLASS.WARLOCK]: ['wisdom', 'kings', 'sanctuary'],
  [CLASS.PRIEST]: ['wisdom', 'kings', 'sanctuary'],
  [CLASS.MAGE]: ['wisdom', 'kings', 'sanctuary'],
};

// EXTENSION (no source): the chain above reads only the target's CLASS, so a druid healer led with
// Might. The signed role goes first, the same fact CheckAuras:414-430 already reads off the group
// to pick Devotion. Salvation drops threat, so it is never offered to a tank.
function chainFor(t: BlessingTarget): BlessingFamily[] {
  // A pet takes the pet chain, not its owner's class. Cite: PlayerbotPaladinAI.cpp:664-673 (hunter
  // beast) and :690-701 (mana demon takes Wisdom, the rest Might).
  if (t.isPet) {
    return t.usesMana
      ? ['wisdom', 'kings', 'sanctuary', 'might']
      : ['might', 'kings', 'sanctuary', 'wisdom'];
  }
  const base = CLASS_CHAIN[t.cls] ?? ['kings', 'might', 'wisdom', 'sanctuary'];
  const lead: BlessingFamily[] =
    t.role === 'tank' ? ['sanctuary', 'kings']
      : t.role === 'healer' ? ['wisdom']
        : [];
  const tail: BlessingFamily[] = t.role === 'tank' ? ['light'] : ['salvation'];
  const out: BlessingFamily[] = [];
  for (const f of [...lead, ...base, ...tail]) if (!out.includes(f)) out.push(f);
  return out;
}

/** Best normal and best Greater rank of one Blessing family this provider can cast. */
export function blessingRanks(
  p: PaladinProvider,
  family: BlessingFamily,
  ds: DataStore,
): { normal: SpellDef | null; greater: SpellDef | null } {
  let normal: SpellDef | null = null;
  let greater: SpellDef | null = null;
  for (const id of p.known) {
    const sp = ds.spell(id);
    if (!sp || blessingFamilyOf(sp) !== family) continue;
    if ((sp.reqLevel ?? 0) > p.level) continue;
    const isG = isGreaterBlessing(sp);
    const cur = isG ? greater : normal;
    if (cur && (cur.rank ?? 0) >= (sp.rank ?? 0)) continue;
    if (isG) greater = sp; else normal = sp;
  }
  return { normal, greater };
}

/** Best rank of one Blessing family, Greater preferred when `opts.preferGreater` is not false. */
export function bestBlessing(
  p: PaladinProvider,
  family: BlessingFamily,
  ds: DataStore,
  opts?: { preferGreater?: boolean },
): SpellDef | null {
  const { normal, greater } = blessingRanks(p, family, ds);
  // A self-only row opts out: a Greater burns a Symbol of Kings to buff one body it already reaches.
  if (opts?.preferGreater === false) return normal ?? greater;
  return greater ?? normal;
}

/** Reagents one cast of `sp` costs, as (item, count) rows. */
function reagentsOf(sp: SpellDef): readonly { item: number; count: number }[] {
  return (sp.reagents ?? []).filter((r) => (r.item | 0) > 0 && (r.count | 0) > 0);
}

/** Longest buff/restore aura a blessing leaves, ms. */
export function blessingDurationMs(sp: SpellDef): number {
  let d = 0;
  for (const e of sp.effects ?? []) {
    const dur = (e as { durationMs?: number }).durationMs ?? 0;
    if (dur > d) d = dur;
  }
  return d;
}

/**
 * One Blessing per paladin per body, best first.
 *
 * MULTI-PALADIN SPREAD (this tree's, the source's TODO): spell_group 7 is Rule 2, so a body holds
 * one Blessing FROM EACH paladin. Paladin i therefore takes the i-th family off that body's chain
 * that nobody ahead of it already claimed there. One paladin gives the source's single pick; four
 * give the top four of the same list, which is full coverage.
 */
export function planPaladinBlessings(
  providers: readonly PaladinProvider[],
  targets: readonly BlessingTarget[],
  ds: DataStore,
  opts?: { preferGreater?: boolean; assignments?: PaladinAssignments },
): { blessings: PlannedBlessing[]; reagents: PlannedReagent[] } {
  const out: PlannedBlessing[] = [];
  // One Greater cast covers the target's whole CLASS (TARGET_UNIT_RAID_AND_CLASS) and costs one
  // reagent, so the budget is charged per (paladin, family, class) — not per body. A pet is its own
  // key: BuffHelper casts the pet's Greater at the pet. Cite: :664-673, :733-745.
  const castKey = (p: string, f: BlessingFamily, t: BlessingTarget): string =>
    `${p}|${f}|${t.isPet ? 'pet' : t.cls}`;
  const paidCasts = new Set<string>();
  const spent = new Map<string, number>();
  const budgetLeft = (p: PaladinProvider, item: number, need: number): boolean => {
    if (!p.reagentCount) return true;
    const key = `${p.key}|${item}`;
    return (spent.get(key) ?? 0) + need <= p.reagentCount(item);
  };
  const charge = (p: PaladinProvider, item: number, need: number): void => {
    const key = `${p.key}|${item}`;
    spent.set(key, (spent.get(key) ?? 0) + need);
  };

  for (const t of targets) {
    const chain = chainFor(t);
    const taken = new Set<BlessingFamily>();
    // An assigned cell reserves its family on this body before anyone auto-picks: otherwise the
    // first paladin in the list takes Might off the chain and the one the operator put on Might
    // finds it gone.
    const forcedByPal = new Map<string, BlessingCell>();
    const reserved = new Set<BlessingFamily>();
    for (const p of providers) {
      const cell = opts?.assignments?.blessing?.[blessingCellKey(p.key, t)];
      if (!cell) continue;
      forcedByPal.set(p.key, cell);
      if (cell !== 'none') reserved.add(cell);
    }
    for (const p of providers) {
      const forced = forcedByPal.get(p.key);
      if (forced === 'none') continue;
      const order = forced ? [forced] : chain.filter((f) => !reserved.has(f));
      let pick: { sp: SpellDef; family: BlessingFamily; greater: boolean } | null = null;
      for (const family of order) {
        if (taken.has(family)) continue;
        if (opts?.preferGreater === false) {
          const sp = bestBlessing(p, family, ds, opts);
          if (!sp) continue;
          pick = { sp, family, greater: isGreaterBlessing(sp) };
          break;
        }
        const { normal, greater } = blessingRanks(p, family, ds);
        if (!normal && !greater) continue;
        // Greater when this cast is already paid for, or when a fresh reagent is still in the bag.
        // Otherwise the 5 min single-target rank — the same fall-through BuffHelper takes.
        if (greater) {
          const key = castKey(p.key, family, t);
          const cost = reagentsOf(greater);
          const free = paidCasts.has(key) || cost.every((r) => budgetLeft(p, r.item, r.count));
          if (free) {
            if (!paidCasts.has(key)) {
              paidCasts.add(key);
              for (const r of cost) charge(p, r.item, r.count);
            }
            pick = { sp: greater, family, greater: true };
            break;
          }
        }
        if (!normal) continue;
        pick = { sp: normal, family, greater: false };
        break;
      }
      if (!pick) continue;
      taken.add(pick.family);
      out.push({
        from: p.key,
        on: t.key,
        spellId: pick.sp.id,
        family: pick.family,
        durationMs: blessingDurationMs(pick.sp),
        greater: pick.greater,
        col: t.isPet ? 'pet' : String(t.cls),
      });
    }
  }
  const reagents: PlannedReagent[] = [];
  for (const [key, count] of spent) {
    const [from, item] = key.split('|');
    if (from && item) reagents.push({ from, item: Number(item), count });
  }
  return { blessings: out, reagents };
}

// CheckAuras' order. Cite: PlayerbotPaladinAI.cpp:432-450 — Protection spec or a tank in the group
// takes Devotion, Holy takes Concentration, Retribution takes Retribution.
const AURA_ORDER: readonly PaladinAura[] = ['devotion', 'concentration', 'retribution', 'sanctity'];

/** Best rank of one aura this provider knows. */
export function bestAura(p: PaladinProvider, aura: PaladinAura, ds: DataStore): SpellDef | null {
  let best: SpellDef | null = null;
  for (const id of p.known) {
    const sp = ds.spell(id);
    if (!sp || paladinAuraOf(sp) !== aura) continue;
    if ((sp.reqLevel ?? 0) > p.level) continue;
    if (!best || (sp.rank ?? 0) > (best.rank ?? 0)) best = sp;
  }
  return best;
}

/** The aura CheckAuras would pick for one paladin, ignoring who else is in the group. */
function preferredAura(p: PaladinProvider, tankInGroup: boolean): PaladinAura {
  const spec = (p.spec ?? '').toLowerCase();
  if (/prot/.test(spec) || p.role === 'tank' || tankInGroup) return 'devotion';
  if (/holy/.test(spec) || p.role === 'healer') return 'concentration';
  return 'retribution';
}

/**
 * One aura per paladin, no two the same.
 *
 * MULTI-PALADIN SPREAD (this tree's): group 8 is Rule 2, so two paladins running Devotion radiate
 * two copies of the same armour and the second buys nothing. Each paladin takes its CheckAuras
 * pick when free, else the next unclaimed aura it knows in AURA_ORDER — so three paladins cover
 * armour, mana and melee damage instead of tripling one.
 */
export function planPaladinAuras(
  providers: readonly PaladinProvider[],
  ds: DataStore,
  opts?: { tankInGroup?: boolean; assignments?: PaladinAssignments },
): { from: string; spellId: number; aura: PaladinAura }[] {
  const tankInGroup = opts?.tankInGroup === true;
  const taken = new Set<PaladinAura>();
  const out: { from: string; spellId: number; aura: PaladinAura }[] = [];
  // Assigned auras claim their slot first, so an auto paladin ahead in the list cannot take one.
  // A cell naming an aura this paladin cannot cast is stale and reserves nothing.
  const forced = new Map<string, PaladinAura>();
  for (const p of providers) {
    const want = opts?.assignments?.aura?.[p.key];
    if (!want || !bestAura(p, want, ds)) continue;
    forced.set(p.key, want);
    taken.add(want);
  }
  for (const p of providers) {
    const mine = forced.get(p.key);
    if (mine) {
      const sp = bestAura(p, mine, ds);
      if (sp) {
        out.push({ from: p.key, spellId: sp.id, aura: mine });
        continue;
      }
    }
    const want = preferredAura(p, tankInGroup);
    const order = [want, ...AURA_ORDER.filter((a) => a !== want)];
    let pick: { sp: SpellDef; aura: PaladinAura } | null = null;
    let dup: { sp: SpellDef; aura: PaladinAura } | null = null;
    for (const aura of order) {
      const sp = bestAura(p, aura, ds);
      if (!sp) continue;
      dup ??= { sp, aura };
      if (taken.has(aura)) continue;
      pick = { sp, aura };
      break;
    }
    // Every aura this paladin knows is already up on someone else: run its own pick anyway rather
    // than stand there with no aura at all.
    const chosen = pick ?? dup;
    if (!chosen) continue;
    taken.add(chosen.aura);
    out.push({ from: p.key, spellId: chosen.sp.id, aura: chosen.aura });
  }
  return out;
}

// Which talent improves which Blessing or Aura, read off the trees by NAME the way this file
// already names a family off a spell. talents.json: 1401 / 1446 / 1422 / 1626 / 1405.
const improvedByStore = new WeakMap<object, {
  blessing: Map<BlessingFamily, number[]>;
  aura: Map<PaladinAura, number[]>;
}>();

function improvingTalents(ds: DataStore): {
  blessing: Map<BlessingFamily, number[]>;
  aura: Map<PaladinAura, number[]>;
} {
  const hit = improvedByStore.get(ds as object);
  if (hit) return hit;
  const blessing = new Map<BlessingFamily, number[]>();
  const aura = new Map<PaladinAura, number[]>();
  const add = <K>(m: Map<K, number[]>, k: K, id: number): void => {
    const cur = m.get(k);
    if (cur) cur.push(id); else m.set(k, [id]);
  };
  for (const tree of ds.talentTrees(CLASS.PALADIN)) {
    for (const tal of tree.talents) {
      const what = /^improved\s+(.+)$/i.exec(tal.name ?? '')?.[1];
      if (!what) continue;
      const fam = BLESSING_BY_NAME.find(([re]) => re.test(what))?.[1];
      if (fam) { add(blessing, fam, tal.id); continue; }
      const a = AURA_BY_NAME.find(([re]) => re.test(what))?.[1];
      if (a) add(aura, a, tal.id);
    }
  }
  const out = { blessing, aura };
  improvedByStore.set(ds as object, out);
  return out;
}

/** Ranks this paladin spent in the talent that improves `family`, 0 when it took none. */
export function blessingTalentRank(
  p: PaladinProvider,
  family: BlessingFamily,
  ds: DataStore,
): number {
  let best = 0;
  for (const tid of improvingTalents(ds).blessing.get(family) ?? []) {
    const r = p.talents?.[tid] ?? 0;
    if (r > best) best = r;
  }
  return best;
}

/** Ranks this paladin spent in the talent that improves `aura`, 0 when it took none. */
export function auraTalentRank(p: PaladinProvider, aura: PaladinAura, ds: DataStore): number {
  let best = 0;
  for (const tid of improvingTalents(ds).aura.get(aura) ?? []) {
    const r = p.talents?.[tid] ?? 0;
    if (r > best) best = r;
  }
  return best;
}

/** Every column the board draws, in roster order: one per class present, then the pets. */
function columnTargets(targets: readonly BlessingTarget[]): Map<string, BlessingTarget[]> {
  const cols = new Map<string, BlessingTarget[]>();
  for (const t of targets) {
    const col = t.isPet ? 'pet' : String(t.cls);
    const cur = cols.get(col);
    if (cur) cur.push(t); else cols.set(col, [t]);
  }
  return cols;
}

/**
 * Fill the whole board: an explicit cell per (paladin, column) and an aura per paladin, so the
 * operator reads each pick off the grid and can still wheel one afterwards.
 *
 * The order INSIDE a column is the sourced chain (`chainFor`, off BuffHelper). WHO gets a family is
 * this tree's, the same TODO the spread answers: most ranks in the talent that improves it, then
 * whoever has the Greater rank, then roster order. A paladin left with none gets 'none'.
 */
export function autoSortPaladinAssignments(
  providers: readonly PaladinProvider[],
  targets: readonly BlessingTarget[],
  ds: DataStore,
): PaladinAssignments {
  const blessing: Record<string, BlessingCell> = {};
  const aura: Record<string, PaladinAura> = {};
  if (!providers.length) return { blessing, aura };

  for (const [col, inCol] of columnTargets(targets)) {
    // One column, several bodies, one answer: chains merge BY POSITION, so every body's first
    // choice outranks any body's second. First-chain-to-the-end never handed out healer Wisdom.
    const chains = inCol.map((t) => chainFor(t));
    const chain: BlessingFamily[] = [];
    for (let i = 0; i < Math.max(...chains.map((c) => c.length)); i++) {
      for (const c of chains) {
        const f = c[i];
        if (f && !chain.includes(f)) chain.push(f);
      }
    }
    const free = new Set(providers.map((p) => p.key));
    for (const family of chain) {
      if (!free.size) break;
      const cands = providers.filter(
        (p) => free.has(p.key) && bestBlessing(p, family, ds) != null,
      );
      if (!cands.length) continue;
      const rank = (p: PaladinProvider): number => blessingTalentRank(p, family, ds);
      const greater = (p: PaladinProvider): number =>
        (blessingRanks(p, family, ds).greater ? 1 : 0);
      const win = cands.reduce((a, b) =>
        (rank(b) - rank(a) || greater(b) - greater(a)) > 0 ? b : a);
      blessing[`${win.key}|${col}`] = family;
      free.delete(win.key);
    }
    for (const key of free) blessing[`${key}|${col}`] = 'none';
  }

  // CheckAuras picks WHICH aura; the talent only decides who KEEPS a contested one, the loser
  // falling through below. Talent-first gave the healer the tank's Devotion (both builds run 5/5).
  const tankInGroup = targets.some((t) => t.role === 'tank');
  const wanted = new Map<PaladinAura, PaladinProvider[]>();
  for (const p of providers) {
    const want = preferredAura(p, tankInGroup);
    if (!bestAura(p, want, ds)) continue;
    const cur = wanted.get(want);
    if (cur) cur.push(p); else wanted.set(want, [p]);
  }
  for (const [a, cands] of wanted) {
    const win = cands.reduce((x, y) =>
      auraTalentRank(y, a, ds) > auraTalentRank(x, a, ds) ? y : x);
    aura[win.key] = a;
  }
  for (const row of planPaladinAuras(providers, ds, { tankInGroup, assignments: { aura } })) {
    aura[row.from] = row.aura;
  }
  return { blessing, aura };
}
