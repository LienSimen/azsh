// World-bot / companion pet spawn — a port of PlayerbotFactory InitPet and InitPetSpells. Hunters
// tame a level-appropriate beast; warlocks materialize the best unlocked demon with its ranks.

import type { DataStore } from '../../data/dataStore.ts';
import { CLASS } from '../../data/schema.ts';
import type { Character, PetState } from '../character/character.ts';
import {
  HAPPINESS_MAX,
  LOYALTY_BEST_FRIEND,
  newPet,
  loyaltyXpForOwnerLevel,
  petMaxHealth,
  petInitStats,
  tpSpentOnKnown,
} from '../pet/pet.ts';
import type { Rng } from '../../engine/core/rng.ts';
import { mulberry32, hashSeed } from '../../engine/core/rng.ts';
import type { Companion } from './squad.ts';

/** Imp template — classic warlock starter demon. */
export const PET_IMP = 416;
export const PET_VOIDWALKER = 1860;
export const PET_SUCCUBUS = 1863;
export const PET_FELHUNTER = 417;

// Classic warlock summon thresholds as companion unlock levels (questless). Imp 1 / Voidwalker 10 /
// Succubus 20 / Felhunter 30.
export const WARLOCK_DEMON_UNLOCK: Readonly<Record<number, number>> = {
  [PET_IMP]: 1,
  [PET_VOIDWALKER]: 10,
  [PET_SUCCUBUS]: 20,
  [PET_FELHUNTER]: 30,
};

/** Ordered demon templates for UI (Imp → VW → Succubus → Felhunter). */
export const WARLOCK_DEMONS = [PET_IMP, PET_VOIDWALKER, PET_SUCCUBUS, PET_FELHUNTER] as const;

// Which demon a generated warlock brings, best first. The Imp was hardcoded and its whole kit is
// one FIRE bolt, so on Vaelastrasz 5 imps did 0 damage over 90 s. Succubus first: Lash is shadow.
const WARLOCK_DEMON_PREFERENCE: readonly number[] = [
  PET_SUCCUBUS, PET_FELHUNTER, PET_VOIDWALKER, PET_IMP,
];

/** Best demon this owner level has unlocked (Imp below 20). */
export function bestUnlockedWarlockDemon(level: number): number {
  for (const creature of WARLOCK_DEMON_PREFERENCE) {
    if (warlockDemonUnlocked(creature, level)) return creature;
  }
  return PET_IMP;
}

/** Hunter pets unlock at level 10 (same as factory InitPet). */
export const HUNTER_PET_MIN_LEVEL = 10;

// ---- level → spell tables (classic ranks only; TBC ids filtered by ds.spell) -

/** [minLevel, spellId] pairs; highest minLevel ≤ pet/owner level is kept per name chain later. */
type RankRow = readonly [number, number];

/** All ranks with minLevel ≤ level (not just highest) — matches factory learnSpell loop. */
function ranksUpTo(rows: readonly RankRow[], level: number): number[] {
  return rows.filter(([lvl]) => level >= lvl).map(([, id]) => id);
}

// Cite: PlayerbotFactory::InitPetSpells hunterPetSpells (MANGOSBOT_ZERO) + Growl/NA/GS/resists.
// Family map: CreatureFamily → PET_* (source GetHunterPetTypeFromEntry).

const COWER: RankRow[] = [
  [5, 1742], [15, 1753], [25, 1754], [35, 1755], [45, 1756], [55, 16697],
];
const BITE: RankRow[] = [
  [1, 17253], [8, 17255], [16, 17256], [24, 17257], [32, 17258], [40, 17259], [48, 17260], [56, 17261],
];
const CLAW: RankRow[] = [
  [1, 16827], [8, 16828], [15, 16829], [22, 16830], [29, 16831], [36, 16832], [48, 3010], [56, 3009],
];
const DASH: RankRow[] = [[30, 23099], [40, 23109], [50, 23110]];
const DIVE: RankRow[] = [[30, 23145], [40, 23146], [50, 23147]];
const SCREECH: RankRow[] = [[8, 24423], [24, 24577], [40, 24578], [56, 24579]];
const GROWL: RankRow[] = [
  [1, 2649], [10, 14916], [20, 14917], [30, 14918], [40, 14919], [50, 14920], [60, 14921],
];
const NATURAL_ARMOR: RankRow[] = [
  [1, 24545], [12, 24549], [18, 24550], [24, 24551],
];
const GREAT_STAMINA: RankRow[] = [
  [1, 4187], [12, 4188], [18, 4189], [24, 4190], [30, 4191], [36, 4192],
  [42, 4193], [48, 4194], [54, 5041], [60, 5042],
];
const RESISTS: number[] = [24493, 23992, 24446, 24492, 24488]; // @ level ≥ 20

/** Family → ability rows (factory hunterPetSpells). */
const FAMILY_SPELLS: Record<number, RankRow[]> = {
  1: [...BITE, ...COWER, ...DASH, [10, 24604], [20, 24605], [30, 24603], [40, 24597]], // Wolf + Furious Howl
  2: [...BITE, ...CLAW, ...COWER, ...DASH, [30, 24450], [40, 24452], [50, 24453]], // Cat + Prowl
  3: [...BITE, ...COWER], // Spider
  4: [...BITE, ...CLAW, ...COWER], // Bear
  5: [...BITE, [1, 7371], [12, 26177], [24, 26178], [36, 26179], [48, 26201], [60, 27685], ...COWER, ...DASH], // Boar + Charge
  6: [...BITE, ...COWER], // Crocolisk
  7: [...BITE, ...CLAW, ...COWER, ...DIVE, ...SCREECH], // Carrion Bird
  8: [...CLAW, ...COWER], // Crab
  9: [...BITE, ...COWER, [30, 26090], [40, 26187], [50, 26188]], // Gorilla + Thunderstomp
  11: [...BITE, ...CLAW, ...COWER], // Raptor
  12: [...BITE, ...COWER, ...DASH], // Tallstrider
  20: [...CLAW, ...COWER, [8, 24640], [24, 24583], [40, 24586], [56, 24587]], // Scorpid
  21: [...BITE, ...COWER, [20, 26064]], // Turtle + Shell Shield
  24: [...BITE, ...COWER, ...DIVE, ...SCREECH], // Bat
  25: [...BITE, ...COWER, ...DASH], // Hyena
  26: [...CLAW, ...COWER, ...DIVE, ...SCREECH], // Owl
  27: [...BITE, ...COWER, ...DIVE, [1, 24844], [12, 25008], [24, 25009], [36, 25010], [48, 25011], [60, 25012]], // Wind Serpent
};

/** Cower ids — factory toggles autocast OFF for these. */
export const COWER_SPELL_IDS = new Set(COWER.map(([, id]) => id));

// Hunter pet ability ranks for `family` at `level` (factory learnSpell list). Includes Growl / Natural
// Armor / Great Stamina / resists@20.
export function hunterPetSpellRanks(family: number, level: number): number[] {
  const fam = FAMILY_SPELLS[family] ?? [...BITE, ...COWER];
  const out = [
    ...ranksUpTo(fam, level),
    ...ranksUpTo(GROWL, level),
    ...ranksUpTo(NATURAL_ARMOR, level),
    ...ranksUpTo(GREAT_STAMINA, level),
  ];
  if (level >= 20) out.push(...RESISTS);
  return out;
}

// Warlock demon tables — Cite: InitPetSpells CLASS_WARLOCK block (classic ranks ≤60).

const WARLOCK_DEMON_SPELLS: Record<number, RankRow[]> = {
  [PET_IMP]: [
    // Blood Pact
    [4, 6307], [14, 7804], [26, 7805], [38, 11766], [50, 11767],
    // Fire Shield
    [14, 2947], [24, 8316], [34, 8317], [44, 11770], [54, 11771],
    // Firebolt
    [1, 3110], [8, 7799], [18, 7800], [28, 7801], [38, 7802], [48, 11762], [58, 11763],
    // Phase Shift
    [12, 4511],
  ],
  [PET_VOIDWALKER]: [
    [18, 17767], [26, 17850], [34, 17851], [42, 17852], [50, 17853], [58, 17854], // Consume Shadows
    [16, 7812], [24, 19438], [32, 19440], [40, 19441], [48, 19442], [56, 19443], // Sacrifice
    [24, 17735], [36, 17750], [48, 17751], [60, 17752], // Suffering
    [10, 3716], [20, 7809], [30, 7810], [40, 7811], [50, 11774], [60, 11775], // Torment
  ],
  [PET_SUCCUBUS]: [
    [20, 7814], [28, 7815], [36, 7816], [44, 11778], [52, 11779], [60, 11780], // Lash of Pain
    [32, 7870], // Lesser Invisibility
    [26, 6358], // Seduction
    [22, 6360], [34, 7813], [46, 11784], [58, 11785], // Soothing Kiss
  ],
  [PET_FELHUNTER]: [
    [30, 19505], [38, 19731], [46, 19734], [54, 19736], // Devour Magic
    [42, 19480], // Paranoia
    [36, 19244], [52, 19647], // Spell Lock
    [32, 19478], [40, 19655], [48, 19656], [56, 19660], // Tainted Blood
  ],
};

// Demon ability ranks for template `creature` at owner `level`. Warlock ranks are character-wide (petSpells
// / grimoires).
export function warlockDemonSpellRanks(creature: number, level: number): number[] {
  const rows = WARLOCK_DEMON_SPELLS[creature];
  if (!rows) return [];
  return ranksUpTo(rows, level);
}

/** All warlock demon ranks the bot would know at this level (union across demons). */
export function warlockPetSpellsAtLevel(level: number): number[] {
  const set = new Set<number>();
  for (const creature of Object.keys(WARLOCK_DEMON_SPELLS).map(Number)) {
    for (const id of warlockDemonSpellRanks(creature, level)) set.add(id);
  }
  return [...set].sort((a, b) => a - b);
}

// ---- InitPet materialization ------------------------------------------------

export interface BotPetResult {
  pet: PetState;
  /** Character-wide pet ability ranks (warlock) or hunter training repertoire. */
  petSpells: number[];
}

// Pick a tameable creature with MinLevel ≤ level, deterministic via rng. DataStore has no
// creatures() list, so this walks zone huntables — the same population world content uses.
export function pickTameablePet(level: number, ds: DataStore, rng: Rng): number | undefined {
  const seen = new Set<number>();
  const ids: number[] = [];
  for (const z of ds.zones()) {
    for (const entry of z.huntable ?? []) {
      if (seen.has(entry)) continue;
      seen.add(entry);
      const c = ds.creature(entry);
      if (!c?.tameable) continue;
      // Factory: MinLevel ≤ bot level. Prefer scaling.minLevel when baked.
      const floor = c.scaling?.minLevel ?? c.level ?? 1;
      if (floor > level) continue;
      ids.push(entry);
    }
  }
  if (ids.length === 0) return undefined;
  // Factory retries up to 100 times; we pick once from the pool.
  return ids[rng.int(0, ids.length - 1)]!;
}

// Hunter InitPet + InitPetSpells for a bot at char.level. Returns null when level < 10 or no tameable
// exists.
export function initHunterBotPet(char: Character, seed: number, ds: DataStore): BotPetResult | null {
  if (char.cls !== CLASS.HUNTER || char.level < 10) return null;
  const rng = mulberry32(hashSeed(seed, 0x9e7));
  const entry = pickTameablePet(char.level, ds, rng);
  if (entry == null) return null;
  const cdef = ds.creature(entry);
  if (!cdef) return null;

  let pet = newPet(entry, ds, char);
  if (!pet) return null;

  // Factory: SetLoyaltyLevel(BEST_FRIEND); happiness HAPPINESS_LEVEL_SIZE * 2 (content→happy band).
  // Phonecraft happiness scale is 0..1000; BEST_FRIEND + full happy bar.
  const xpReq = loyaltyXpForOwnerLevel(char.level, ds);
  const taught = hunterPetSpellRanks(cdef.family ?? 0, char.level).filter((id) => ds.spell(id));
  // Cower autocast off — store rank ids in autocastOff.
  const autocastOff = taught.filter((id) => COWER_SPELL_IDS.has(id));
  // Vanilla TP budget: level × (loyalty − 1) total, minus reqtrainpoints the pre-taught kit (+ innates)
  // consumed — chain max per name. Cite: Pet.cpp:976 SetTP; :1128 GivePetLevel; GetTPForSpell ~916.
  const spent = tpSpentOnKnown([...taught, ...(cdef.petDefaultSpells ?? [])], ds);
  pet = {
    ...pet,
    loyalty: LOYALTY_BEST_FRIEND,
    loyaltyPoints: 1000,
    trainingPoints: char.level * (LOYALTY_BEST_FRIEND - 1) - spent,
    loyaltyXpRequired: xpReq ?? 0,
    happiness: HAPPINESS_MAX,
    taughtSpells: taught,
    // Pre-taught ranks are already in the repertoire — only innates above them stay teachable.
    teachSpells: (pet.teachSpells ?? []).filter((id) => !taught.includes(id)),
    ...(autocastOff.length ? { autocastOff } : {}),
  };

  // Hunter repertoire on the character (Beast Training known list).
  return { pet, petSpells: taught };
}

// Warlock: best unlocked demon out + grimoire ranks up to level for all demons (character-wide petSpells).
// Factory does not spawn a demon in InitPet, but ships the rank tables — we apply them.
export function initWarlockBotPet(char: Character, ds: DataStore): BotPetResult | null {
  if (char.cls !== CLASS.WARLOCK) return null;
  if (!ds.creature(PET_IMP)) return null;

  const petSpells = warlockPetSpellsAtLevel(char.level).filter((id) => ds.spell(id));
  const shell: Character = { ...char, petSpells };
  const pet = newPet(bestUnlockedWarlockDemon(char.level), ds, shell);
  if (!pet) return null;
  return { pet, petSpells };
}

/** Class-dispatch InitPet for a world-bot character shell (gear/level already set). */
export function initBotPet(char: Character, seed: number, ds: DataStore): BotPetResult | null {
  if (char.cls === CLASS.HUNTER) return initHunterBotPet(char, seed, ds);
  if (char.cls === CLASS.WARLOCK) return initWarlockBotPet(char, ds);
  return null;
}

// ---- Companion level-sync / selection (questless unlock path) ----------------

/** Whether a warlock companion may use this demon template at `level`. */
export function warlockDemonUnlocked(creature: number, level: number): boolean {
  const need = WARLOCK_DEMON_UNLOCK[creature];
  if (need == null) return false;
  return level >= need;
}

/** Demon templates unlocked at this owner level (stable order). */
export function unlockedWarlockDemons(level: number): number[] {
  return WARLOCK_DEMONS.filter((id) => warlockDemonUnlocked(id, level));
}

// Tameable creature entries with MinLevel ≤ level (deterministic, sorted). Same pool as pickTameablePet —
// for companion beast-select UI.
export function listTameablePets(level: number, ds: DataStore): number[] {
  const seen = new Set<number>();
  const ids: number[] = [];
  for (const z of ds.zones()) {
    for (const entry of z.huntable ?? []) {
      if (seen.has(entry)) continue;
      seen.add(entry);
      const c = ds.creature(entry);
      if (!c?.tameable) continue;
      const floor = c.scaling?.minLevel ?? c.level ?? 1;
      if (floor > level) continue;
      ids.push(entry);
    }
  }
  return ids.sort((a, b) => a - b);
}

/** Owner shell for pet stats / newPet at companion level. */
function companionOwnerShell(comp: Companion, level: number, petSpells: number[] = []): Character {
  return {
    name: comp.name,
    race: comp.race,
    cls: comp.cls,
    level: Math.max(1, level),
    xp: 0,
    gold: 0,
    zoneId: '',
    health: 1,
    power: 0,
    equipped: { ...comp.equipped },
    activeBuffs: [],
    activeAuras: [],
    skills: {},
    knownRecipes: [],
    petSpells,
  };
}

/** Build a fully-trained hunter beast kit for a specific creature entry. */
function materializeHunterPet(
  creature: number,
  level: number,
  ds: DataStore,
  owner: Character,
  keep?: { autocastOff?: number[]; happiness?: number; loyalty?: number; loyaltyPoints?: number },
): BotPetResult | null {
  const cdef = ds.creature(creature);
  if (!cdef?.tameable) return null;
  const floor = cdef.scaling?.minLevel ?? cdef.level ?? 1;
  if (floor > level) return null;

  let pet = newPet(creature, ds, owner);
  if (!pet) return null;

  const xpReq = loyaltyXpForOwnerLevel(level, ds);
  const taught = hunterPetSpellRanks(cdef.family ?? 0, level).filter((id) => ds.spell(id));
  // Preserve user autocast choices that still apply; else factory Cower-off default.
  let autocastOff: number[] | undefined;
  if (keep?.autocastOff) {
    const taughtSet = new Set(taught);
    const kept = keep.autocastOff.filter((id) => taughtSet.has(id) || taught.some((t) => ds.spell(t)?.name === ds.spell(id)?.name));
    autocastOff = kept.length ? kept : undefined;
  } else {
    const off = taught.filter((id) => COWER_SPELL_IDS.has(id));
    autocastOff = off.length ? off : undefined;
  }

  // Same vanilla TP budget as initHunterBotPet: level × (loyalty − 1) minus kit spend.
  const loyalty = keep?.loyalty ?? LOYALTY_BEST_FRIEND;
  const spent = tpSpentOnKnown([...taught, ...(cdef.petDefaultSpells ?? [])], ds);
  pet = {
    ...pet,
    loyalty,
    loyaltyPoints: keep?.loyaltyPoints ?? 1000,
    trainingPoints: level * (Math.max(1, loyalty) - 1) - spent,
    loyaltyXpRequired: xpReq ?? 0,
    happiness: keep?.happiness ?? HAPPINESS_MAX,
    taughtSpells: taught,
    teachSpells: (pet.teachSpells ?? []).filter((id) => !taught.includes(id)),
    // Full health for companion between-content revive.
    health: pet.health, // newPet already full
    ...(autocastOff ? { autocastOff } : {}),
  };
  return { pet, petSpells: taught };
}

/** Build a warlock demon kit for a specific unlocked template. */
function materializeWarlockPet(
  creature: number,
  level: number,
  ds: DataStore,
  owner: Character,
  keep?: { autocastOff?: number[] },
): BotPetResult | null {
  if (!warlockDemonUnlocked(creature, level)) return null;
  if (!ds.creature(creature)) return null;
  const petSpells = warlockPetSpellsAtLevel(level).filter((id) => ds.spell(id));
  const shell: Character = { ...owner, petSpells };
  let pet = newPet(creature, ds, shell);
  if (!pet) return null;
  if (keep?.autocastOff?.length) {
    const known = new Set(petSpells);
    const kept = keep.autocastOff.filter((id) => known.has(id) || petSpells.some((t) => ds.spell(t)?.name === ds.spell(id)?.name));
    if (kept.length) pet = { ...pet, autocastOff: kept };
  }
  return { pet, petSpells };
}

// Ensure a companion's pet kit matches class and level: clear it for a non-pet class, factory-init
// a missing one, or refresh ranks and revive an existing one while keeping its autocast prefs.
export function syncCompanionPet(
  comp: Companion,
  level: number,
  ds: DataStore,
): { pet?: PetState; petSpells?: number[] } {
  const lvl = Math.max(1, Math.min(60, level));

  if (comp.cls === CLASS.HUNTER) {
    if (lvl < HUNTER_PET_MIN_LEVEL) {
      return { pet: undefined, petSpells: undefined };
    }
    const owner = companionOwnerShell(comp, lvl);
    if (comp.pet) {
      const cdef = ds.creature(comp.pet.creature);
      if (cdef?.tameable) {
        const floor = cdef.scaling?.minLevel ?? cdef.level ?? 1;
        if (floor <= lvl) {
          const kit = materializeHunterPet(comp.pet.creature, lvl, ds, owner, {
            autocastOff: comp.pet.autocastOff,
            happiness: comp.pet.happiness,
            loyalty: comp.pet.loyalty,
            loyaltyPoints: comp.pet.loyaltyPoints,
          });
          if (kit) {
            // Full HP between pulls (companions don't Revive Pet in the world).
            const maxHp = petMaxHealth({ ...owner, pet: kit.pet, petSpells: kit.petSpells }, ds);
            return {
              pet: { ...kit.pet, health: maxHp, power: petInitStats(owner, cdef, ds).maxPower },
              petSpells: kit.petSpells,
            };
          }
        }
      }
    }
    // No valid pet: factory random (seed-stable).
    const fresh = initHunterBotPet(owner, comp.seed, ds);
    if (!fresh) return { pet: undefined, petSpells: undefined };
    return { pet: fresh.pet, petSpells: fresh.petSpells };
  }

  if (comp.cls === CLASS.WARLOCK) {
    const owner = companionOwnerShell(comp, lvl);
    let creature = comp.pet?.creature ?? PET_IMP;
    if (!warlockDemonUnlocked(creature, lvl)) {
      // Fall back to highest unlocked demon (should only matter if level dropped).
      const unlocked = unlockedWarlockDemons(lvl);
      creature = unlocked[unlocked.length - 1] ?? PET_IMP;
    }
    const kit = materializeWarlockPet(creature, lvl, ds, owner, {
      autocastOff: comp.pet?.autocastOff,
    });
    if (!kit) {
      const fresh = initWarlockBotPet(owner, ds);
      if (!fresh) return { pet: undefined, petSpells: undefined };
      return { pet: fresh.pet, petSpells: fresh.petSpells };
    }
    const cdef = ds.creature(kit.pet.creature);
    const maxHp = cdef
      ? petMaxHealth({ ...owner, pet: kit.pet, petSpells: kit.petSpells }, ds)
      : kit.pet.health;
    const maxPw = cdef ? petInitStats(owner, cdef, ds).maxPower : kit.pet.power;
    return {
      pet: { ...kit.pet, health: maxHp, power: maxPw },
      petSpells: kit.petSpells,
    };
  }

  // Other classes: no pet.
  return { pet: undefined, petSpells: undefined };
}

// Apply `syncCompanionPet` onto a companion in place (mutates pet/petSpells fields). Returns whether the
// pet spell list grew (for optional level-up chat).
export function applyCompanionPetSync(comp: Companion, level: number, ds: DataStore): { ranksGrew: boolean } {
  const before = new Set(comp.petSpells ?? []);
  // A rank refresh is not a re-summon: the same beast keeps the party buffs it is carrying, or every
  // party build between pulls stripped them and the buffers paid again.
  const carried = comp.pet?.prePullAuras;
  const wasCreature = comp.pet?.creature;
  const next = syncCompanionPet(comp, level, ds);
  if (next.pet === undefined) {
    delete comp.pet;
    delete comp.petSpells;
  } else {
    comp.pet = carried?.length && next.pet.creature === wasCreature
      ? { ...next.pet, prePullAuras: carried }
      : next.pet;
    if (next.petSpells) comp.petSpells = next.petSpells;
    else delete comp.petSpells;
  }
  const after = next.petSpells ?? [];
  const ranksGrew = after.some((id) => !before.has(id));
  return { ranksGrew };
}

/** Rebuild companion pet for a chosen creature (hunter beast or unlocked demon). */
export function setCompanionPetCreature(
  comp: Companion,
  level: number,
  creature: number,
  ds: DataStore,
): { ok: true; pet: PetState; petSpells: number[] } | { ok: false; reason: string } {
  const lvl = Math.max(1, Math.min(60, level));
  const cdef = ds.creature(creature);
  if (!cdef) return { ok: false, reason: 'Unknown creature' };

  if (comp.cls === CLASS.HUNTER) {
    if (lvl < HUNTER_PET_MIN_LEVEL) {
      return { ok: false, reason: 'Hunters gain a pet at level 10' };
    }
    if (!cdef.tameable) return { ok: false, reason: 'That beast cannot be tamed' };
    const floor = cdef.scaling?.minLevel ?? cdef.level ?? 1;
    if (floor > lvl) {
      return { ok: false, reason: `${cdef.name} requires level ${floor}` };
    }
    const owner = companionOwnerShell(comp, lvl);
    const kit = materializeHunterPet(creature, lvl, ds, owner, {
      autocastOff: comp.pet?.creature === creature ? comp.pet.autocastOff : undefined,
    });
    if (!kit) return { ok: false, reason: 'Could not create pet' };
    return { ok: true, pet: kit.pet, petSpells: kit.petSpells };
  }

  if (comp.cls === CLASS.WARLOCK) {
    if (!WARLOCK_DEMON_UNLOCK[creature]) {
      return { ok: false, reason: 'Not a warlock demon' };
    }
    if (!warlockDemonUnlocked(creature, lvl)) {
      const need = WARLOCK_DEMON_UNLOCK[creature]!;
      return { ok: false, reason: `${cdef.name} unlocks at level ${need}` };
    }
    const owner = companionOwnerShell(comp, lvl);
    const kit = materializeWarlockPet(creature, lvl, ds, owner, {
      autocastOff: comp.pet?.creature === creature ? comp.pet.autocastOff : undefined,
    });
    if (!kit) return { ok: false, reason: 'Could not create demon' };
    return { ok: true, pet: kit.pet, petSpells: kit.petSpells };
  }

  return { ok: false, reason: 'This companion has no pet class' };
}
