// The P7 lab track: run authored comps headlessly and table the win rates. Not a player mode; it
// drives createDuelSession (duel.ts:182).

import type { DataStore } from '../../data/dataStore.ts';
import { createSession, type CombatantSpec, type CombatSession } from '../../engine/combat.ts';
import type { Character } from '../character/character.ts';
import {
  companionCharacter, companionLevel, companionPetSpec, companionSpec, companionSpellbook,
  type Companion,
} from '../bots/squad.ts';
import { runPrePullHealthstones, type StoneHolder } from '../../engine/game/prePullHealthstones.ts';
import { emptyInventory } from '../items/inventory.ts';
import { routeWeaponImbueItem } from '../../engine/game/weaponImbueItem.ts';
import type { ItemRuleHand } from '../rotation/types.ts';
import { applyBgTeamPrebuffs } from './bgPrebuff.ts';
import { openerFormOf } from '../rotation/openerForm.ts';
import {
  companionActionProvider, companionRotationOf, isCompanionKeepUpSpell, syncCompanionBagItemRules,
} from '../bots/companionRotation.ts';
import { vsClassVariant } from '../rotation/rotationSuggestions.ts';
import { createDuelSession, resolveDuelOutcome } from '../run/duel.ts';
import { seedDuelGeometry } from '../../engine/game/combatSeed.ts';
import { hashSeed, mulberry32 } from '../../engine/core/rng.ts';
import { buildEnemySeats, type BgTeamSeat } from './bgRoster.ts';
import { bgTier, DEFAULT_BG_TIER, type BgTierId } from './bgTier.ts';
import { compsForBracket, type ArenaBracket, type ArenaComp } from './arenaComps.ts';

// Seeds per pair. CLAUDE.md §5: one run is a rate, not a verdict — never quote a win rate off fewer than
// five.
export const LAB_DEFAULT_SEEDS = 5;

export interface LabPairResult {
  aId: string;
  aName: string;
  bId: string;
  bName: string;
  /** Duels actually run for this pair (a pair whose seats cannot be built runs 0). */
  duels: number;
  aWins: number;
  bWins: number;
  /** Timed out with no winner. A draw is a real result, not a failure. */
  draws: number;
  /** aWins as a percentage of duels run, 0 when none ran. */
  aWinPct: number;
  avgDurationMs: number;
  /** Comp seats actually seated on each side. A duel seats the lead alone; a team match seats the comp. */
  bodiesA: number;
  bodiesB: number;
}

// A comp's seats as fightable specs PLUS their combat brains. The brain is not optional: with no
// action provider a player-shaped spec has no event-AI slots, so the target only auto-attacks.
export function arenaSeats(
  ds: DataStore,
  char: Character,
  comp: ArenaComp,
  seed: number,
  opts?: {
    teamSize?: number;
    tier?: BgTierId;
    team?: 'alliance' | 'horde';
    // Take the other faction when `team` cannot field this comp — for the gauntlet and the arena,
    // where the opponent is a DUELIST rather than the other side of a war. A battleground never does.
    otherFactionIfUnseatable?: boolean;
    /**
     * G7's axis, and INDEPENDENT of tier on purpose: `kit` gives every seat the consume kit the
     * tier machinery gives a raid-profile body, `none` gives it none, so a Freemade cell can
     * fight kitted and an Apes cell dry. Absent = the tier's own policy
     * (`profileWantsConsumes`), which is what every live caller means.
     *
     * The PvP Insignia is NOT part of this: `applyPvpKit` equips it either way
     * (`bgConsumes.ts:137-152`), because the hard-CC self-rescue reads it off
     * `session.unitItems` and a dry Freemade still wears a trinket. The axis is the
     * consumables.
     */
    loadout?: 'none' | 'kit';
    /**
     * G16: the class this side is fighting. A seat that names no rotation of its own then asks for
     * `vs-<class>`, and `selectBand` falls that back to the variant-less pvp pool when nobody has
     * authored it - so every one of the 81 matchups works before any of them is written.
     *
     * A seat's OWN `rotation` still wins: a promoted duelist names the list it was promoted on.
     */
    vsClass?: number;
  },
) {
  const build = (team: 'alliance' | 'horde'): BgTeamSeat[] => buildEnemySeats({
    ds, char, team, teamSize: opts?.teamSize ?? 1, seed,
    tier: bgTier(opts?.tier ?? comp.tier ?? DEFAULT_BG_TIER), comp,
    ...(opts?.loadout ? { consumes: opts.loadout === 'kit' } : {}),
  });
  // A comp the faction pool cannot field is DROPPED and replaced with random bots, silently.
  // Paladin is Alliance-only and shaman Horde-only, so a fixed side leaves one class unseatable.
  const asked = opts?.team ?? 'horde';
  let seats = build(asked);
  if ((!opts?.team || opts.otherFactionIfUnseatable) && !seatsAreTheComp(comp, seats)) {
    const other = asked === 'horde' ? 'alliance' : 'horde';
    const alt = build(other);
    if (seatsAreTheComp(comp, alt)) seats = alt;
  }
  // Gate-time prep, the pass a BG gives both teams (bgScreen.ts:234-238). Without it 69 of 69 duel
  // and gauntlet seats walked in with zero pre-pull auras and an uncoated weapon.
  applyBgTeamPrebuffs({
    ds, now: Date.now(), playerLevel: char.level, seats, applyImbue: seatImbue(ds, char, seats),
  });
  // The conjure step: prebuff never spends a Soul Shard, so a warlock rung carried a Healthstone
  // recovery row and no stone. A lone warlock supplies itself (prePullHealthstones.ts:97).
  seatHealthstones(ds, char, seats);
  for (const seat of seats) if (seat.comp) freshenPrepClock(seat.comp);
  const out = [];
  for (const seat of seats) {
    const body = seat.comp;
    if (!body) continue;
    // The seat's authored variant when the comp named one; else G16's matchup list; else the class
    // default pvp band, which is every shipped duelist (arenaComps ArenaCompSeat.rotation).
    const variant = seat.compSeat?.rotation ?? vsClassVariant(opts?.vsClass);
    // Bagged combat items become rules, the sync a BG runs per unit (bgScreen.ts:492). An authored
    // variant band carries none of the default band's 11 gadget rows, so without this it throws nothing.
    const rot = syncCompanionBagItemRules(
      companionRotationOf(body, char.level, ds, undefined, {
        mode: 'pvp', ...(variant ? { variant } : {}),
      }),
      companionCharacter(body, char.level, ds),
      body.bags,
      ds,
    );
    const openerForm = openerFormOf(rot, ds);
    out.push({
      body,
      // Seated in the state its list opens with: a duel starts unflagged (fighterFactory.ts:908),
      // so a rogue holds Stealth and a feral Bear at t=0 instead of spending the opening GCDs on it.
      spec: companionSpec(body, char.level, ds, {
        stealthForPull: true,
        ...(openerForm ? { openerForm } : {}),
      }),
      /** Hunter beast / warlock demon. `buildEnemySeats` already tamed one (bgRoster.ts:113). */
      pet: companionPetSpec(body, char.level, ds),
      // The list this seat actually fights with, so a caller can NAME it - which band, which
      // variant - instead of assuming the comp got what it asked for (duel plan §2).
      rot,
      provider: companionActionProvider(rot, undefined, {
        companion: body,
        isOocKeepUp: (id) => isCompanionKeepUpSpell(ds.spell(id)),
      }),
    });
  }
  return out;
}

// Drop the wall-clock expiry prep just stamped: buildCombatant.ts:909 reads it as `expiresAt - now`,
// so two lab runs ms apart got different buff lengths. Absent = the spell's own full duration.
function freshenPrepClock(body: Companion): void {
  if (body.prePullAuras) {
    body.prePullAuras = body.prePullAuras.map(({ expiresAt: _drop, ...rest }) => rest);
  }
  const te = body.tempEnchants;
  if (!te) return;
  const drop = <T extends { expiresAt?: number }>(h: T) => {
    const { expiresAt: _drop, ...rest } = h;
    return rest as T;
  };
  body.tempEnchants = {
    ...(te.mainhand ? { mainhand: drop(te.mainhand) } : {}),
    ...(te.offhand ? { offhand: drop(te.offhand) } : {}),
  };
}

/** One healthstone run over a comp's own seats, the dungeon prep's call (squadDungeon.ts:745). */
function seatHealthstones(ds: DataStore, char: Character, seats: readonly BgTeamSeat[]): void {
  const holders: StoneHolder[] = [];
  for (const seat of seats) {
    const body = seat.comp;
    if (!body) continue;
    const lvl = companionLevel(body, char.level);
    const wearer = companionCharacter(body, lvl, ds);
    holders.push({
      name: body.name,
      char: wearer,
      role: body.role === 'tank' ? 'tank' : body.role === 'healer' ? 'healer' : 'dps',
      ...(body.rotation?.autoSig?.spec ? { specName: body.rotation.autoSig.spec } : {}),
      knownSpellIds: companionSpellbook(body, lvl, ds).known,
      auraSpellIds: (body.prePullAuras ?? []).map((a) => a.spellId),
      bag: () => body.bags ?? emptyInventory(),
      setBag: (inv) => { body.bags = inv; },
    });
  }
  if (!holders.length) return;
  // Arena is not a raid wipe: keep no shard reserve. A 2-shard bag plus the default reserve of 2
  // meant a dest warlock walked in with a Healthstone recovery row and no stone (seed 8402).
  runPrePullHealthstones(holders, ds, '', { shardReserve: 0 });
}

// Coat a seat's weapon out of ITS OWN bags: the router debits whoever `inventory` names, so it runs
// unbound per body with a setter that writes back (squadDungeon.ts:534-561).
function seatImbue(ds: DataStore, char: Character, seats: readonly BgTeamSeat[]) {
  const bodies = seats.map((s) => s.comp).filter((c): c is Companion => c != null);
  return (compId: string, itemEntry: number, hand?: ItemRuleHand): boolean => {
    const comp = bodies.find((c) => c.id === compId);
    if (!comp) return false;
    const res = routeWeaponImbueItem(
      itemEntry,
      { target: { kind: 'companion', id: compId }, ...(hand != null ? { slot: hand } : {}) },
      {
        ds,
        char,
        inventory: comp.bags ?? emptyInventory(),
        squad: bodies,
        setPlayer: () => {},
        setCompanion: (id, patch, inventory) => {
          const c = bodies.find((x) => x.id === id);
          if (!c) return;
          c.equipped = patch.equipped;
          c.tempEnchants = patch.tempEnchants;
          c.bags = inventory;
        },
        log: () => {},
      },
    );
    return !!res?.ok;
  };
}

/** Every body came back as the class its comp seat asked for - i.e. the comp seated whole. */
function seatsAreTheComp(comp: ArenaComp, seats: readonly BgTeamSeat[]): boolean {
  if (seats.length !== comp.seats.length) return false;
  return comp.seats.every((seat, i) => seats[i]?.comp?.cls === seat.cls);
}

/** The 1v1 case of `arenaSeats`, kept because most callers seat exactly one duelist. */
export function arenaSeat(ds: DataStore, char: Character, comp: ArenaComp, seed: number) {
  return arenaSeats(ds, char, comp, seed)[0] ?? null;
}

// The seed for one row's nth duel. Public because P7.2 replays a fight from (challenger, target,
// index) and must land on the same one, so there is no second copy of the arithmetic to drift.
export function labSeedFor(aId: string, bId: string, index: number): number {
  return hashSeed(hashSeed(index + 1, aId.length * 31 + bId.length), 0x1ab);
}

export interface LabDuel {
  /** LIVE, not run: the caller either ticks it on the combat surface or calls runToEnd. */
  session: CombatSession;
  challengerName: string;
  targetName: string;
  // The two specs and the rng seed, so a caller can rebuild the SAME fight with something changed
  // — the only way to price what a change is worth.
  specs: { challenger: CombatantSpec; target: CombatantSpec; seed: number };
  /** The target's body, for the combat surface's player-shaped foe portrait. */
  opponent: { race: number; cls: number; gender?: 0 | 1; equipped: Companion['equipped'] };
}

// ONE duel, built the one way, so a watched fight is the same fight the table scored. Null when
// either comp's premade cannot be seated.
export function buildLabDuel(args: {
  ds: DataStore;
  char: Character;
  a: ArenaComp;
  b: ArenaComp;
  index?: number;
  // Override the seed `index` would derive. Only a caller comparing the SAME seed across two
  // seatings needs it, or a rate difference would be seed variance rather than about the seat.
  seed?: number;
  /** G7's axis. Applied to BOTH seats: an honorable cell owns it, so a win is about the list. */
  loadout?: 'none' | 'kit';
  /**
   * G10: PER-SIDE loadout, which only a DIRTY round may ask for. `loadout` above is the honorable
   * case and stays the default for both seats; these override it one side at a time, and the
   * caller that asks is `duel-bench.mjs` on a cell whose `kind` is `dirty` - where every asymmetry
   * is declared per contender and stamped, so a reader can see what was uneven.
   */
  loadoutA?: 'none' | 'kit';
  loadoutB?: 'none' | 'kit';
}): LabDuel | null {
  const { ds, char, a, b } = args;
  const seed = args.seed ?? labSeedFor(a.id, b.id, Math.max(0, Math.trunc(args.index ?? 0)));
  const kitOf = (side?: 'none' | 'kit') => {
    const l = side ?? args.loadout;
    return l ? { loadout: l } : {};
  };
  // G16: each side is told the class across from it, off the comp's own seat 0, so the matchup
  // list is chosen before either body is built. A comp with no seats leaves it absent.
  const vsA = b.seats[0]?.cls;
  const vsB = a.seats[0]?.cls;
  const sa = arenaSeats(ds, char, a, seed,
    { ...kitOf(args.loadoutA), ...(vsA != null ? { vsClass: vsA } : {}) })[0] ?? null;
  const sb = arenaSeats(ds, char, b, hashSeed(seed, 0x2b),
    { ...kitOf(args.loadoutB), ...(vsB != null ? { vsClass: vsB } : {}) })[0] ?? null;
  if (!sa || !sb) return null;
  // Yards at t=0, the same call all three LIVE sites make: `battleground.ts:97` (the gauntlet
  // rung a player fights), `:157` (arena 2v2) and `squadDungeon.ts:2519` (the tavern trial). Without
  // positions `createSession` takes its no-geometry path (createSession.ts:222), and
  // `combatSeed.ts:22` says only test fixtures do that — which is what this bench had been.
  // What the fixture shape costs: `inMeleeBand` returns TRUE for self, target and pet with no
  // geometry (rotationSubject.ts:52-55, pickAction.ts:1494-1500), so every `inMelee == 0` gate
  // is unsatisfiable and every `inMelee == 1` gate is free; distances read null
  // (pickAction.ts:1313-1315); nobody moves; and the fight opens inside white-swing range, so
  // no snare, no Charge (rangeMin ~8) and no ranged dead zone can fire.

  // A hunter or warlock seat fights WITH its pet: the challenger's rides side `pet`, the target's is
  // one more enemy body. Both were already tamed by the seat build and were being dropped here.
  const foeBodies = sb.pet ? [sb.spec, sb.pet] : [sb.spec];
  const geo = seedDuelGeometry({
    player: sa.spec, enemySpecs: foeBodies, includePet: sa.pet != null, spellOf: (id) => ds.spell(id),
  });
  return {
    session: createDuelSession(sa.spec, foeBodies, mulberry32(seed), {
      playerActionProvider: sa.provider,
      // null for a pet: it has no rotation section, so the factory's pet heuristics drive it.
      enemyActionProviders: sb.pet ? [sb.provider, null] : [sb.provider],
      unitPositionsYd: geo.positions,
      geometryAnchor: geo.anchor,
    }, sa.pet),
    challengerName: sa.spec.name,
    targetName: sb.spec.name,
    specs: { challenger: sa.spec, target: sb.spec, seed },
    opponent: {
      race: sb.body.race,
      cls: sb.body.cls,
      ...(sb.body.gender != null ? { gender: sb.body.gender } : {}),
      equipped: sb.body.equipped,
    },
  };
}

// Every ORDERED pair of `comps`, `seeds` duels each. Ordered because the two seats are not
// symmetric — the opener, stealth seed and geometry all favour one — so collapsing would hide it.
export function runDuelLab(args: {
  ds: DataStore;
  char: Character;
  /** Default: every authored bracket-1 comp. Pass a tier's slice to keep a run small. */
  comps?: readonly ArenaComp[];
  seeds?: number;
  /** G7's axis. The CELL owns it, so every fighter in a round is measured kitted or dry alike. */
  loadout?: 'none' | 'kit';
  /**
   * G10: one comp's loadout, when a DIRTY round declared it. Absent, or returning null, leaves
   * that comp on the cell's `loadout` - so an honorable round never calls this and every fighter
   * shares one kit rule.
   */
  loadoutOf?: (compId: string) => 'none' | 'kit' | null | undefined;
}): LabPairResult[] {
  const { ds, char } = args;
  const comps = args.comps ?? compsForBracket(1);
  const seeds = Math.max(1, Math.trunc(args.seeds ?? LAB_DEFAULT_SEEDS));
  const out: LabPairResult[] = [];
  for (const a of comps) {
    for (const b of comps) {
      // A comp never fights itself in a TABLE — a mirror row scores 100% for whichever seat won.
      // `buildLabDuel` still builds one, which is how repro-duel-seat-gap.mjs isolates the seat.
      if (a.id === b.id) continue;
      let aWins = 0;
      let bWins = 0;
      let draws = 0;
      let duels = 0;
      let totalMs = 0;
      let bodiesA = 0;
      let bodiesB = 0;
      for (let s = 0; s < seeds; s++) {
        // Built through `buildLabDuel`, the same call P7.2's replay makes, so a row is
        // reproducible from (aId, bId, s) alone and a watched fight is THIS fight.
        const la = args.loadoutOf?.(a.id) ?? null;
        const lb = args.loadoutOf?.(b.id) ?? null;
        const d = buildLabDuel({
          ds, char, a, b, index: s,
          ...(args.loadout ? { loadout: args.loadout } : {}),
          ...(la ? { loadoutA: la } : {}),
          ...(lb ? { loadoutB: lb } : {}),
        });
        if (!d) continue;
        bodiesA = 1;
        bodiesB = 1;
        const r = resolveDuelOutcome(d.session.runToEnd(), d.challengerName, d.targetName);
        duels++;
        totalMs += r.durationMs;
        if (r.winner == null) draws++;
        else if (r.winner === d.challengerName) aWins++;
        else bWins++;
      }
      out.push({
        aId: a.id,
        aName: a.name,
        bId: b.id,
        bName: b.name,
        duels,
        aWins,
        bWins,
        draws,
        aWinPct: duels > 0 ? Math.round((aWins / duels) * 100) : 0,
        avgDurationMs: duels > 0 ? Math.round(totalMs / duels) : 0,
        bodiesA,
        bodiesB,
      });
    }
  }
  return out;
}

// The rows as a fixed-width table, strongest challenger first. `chal win%` is ONE SEAT and the
// header says so — the player seat wins about 78% of a mirror. `labQueueTable` is the balanced view.
export function labTable(rows: readonly LabPairResult[]): string {
  const sorted = [...rows].sort((x, y) => y.aWinPct - x.aWinPct);
  const head = 'challenger                     vs target                       W-L-D  chal win%   avg s';
  const lines = sorted.map((r) => {
    const a = r.aName.slice(0, 30).padEnd(30);
    const b = r.bName.slice(0, 30).padEnd(30);
    const wld = `${r.aWins}-${r.bWins}-${r.draws}`.padEnd(8);
    const pct = `${r.aWinPct}%`.padStart(5);
    const secs = (r.avgDurationMs / 1000).toFixed(1).padStart(7);
    return `${a} ${b} ${wld} ${pct} ${secs}`;
  });
  return [head, ...lines].join('\n');
}

// ---- P7.3: the table as an authoring queue ---------------------------------------------

export interface LabStanding {
  compId: string;
  name: string;
  tier: string;
  /** Duels as the challenger (`player` seat) and as the target (`enemy` seat). */
  asChallenger: { duels: number; wins: number; pct: number };
  asTarget: { duels: number; wins: number; pct: number };
  duels: number;
  wins: number;
  draws: number;
  /** Wins over duels across BOTH seats, 0 when none ran. */
  pct: number;
  /** `asChallenger.pct - asTarget.pct`. A large gap is a seat artefact, not a comp result. */
  seatGap: number;
}

// Per-comp record across every row it appears in, BOTH seats — the lab's first run proved the seat
// can decide a fight outright, so a one-seat standing would report that artefact as skill.
export function labStandings(
  rows: readonly LabPairResult[],
  tierOf: (compId: string) => string = () => '',
): LabStanding[] {
  const by = new Map<string, LabStanding>();
  const get = (id: string, name: string): LabStanding => {
    let s = by.get(id);
    if (!s) {
      s = {
        compId: id,
        name,
        tier: tierOf(id),
        asChallenger: { duels: 0, wins: 0, pct: 0 },
        asTarget: { duels: 0, wins: 0, pct: 0 },
        duels: 0,
        wins: 0,
        draws: 0,
        pct: 0,
        seatGap: 0,
      };
      by.set(id, s);
    }
    return s;
  };
  for (const r of rows) {
    if (r.duels <= 0) continue;
    const a = get(r.aId, r.aName);
    a.asChallenger.duels += r.duels;
    a.asChallenger.wins += r.aWins;
    a.duels += r.duels;
    a.wins += r.aWins;
    a.draws += r.draws;
    const b = get(r.bId, r.bName);
    b.asTarget.duels += r.duels;
    b.asTarget.wins += r.bWins;
    b.duels += r.duels;
    b.wins += r.bWins;
    b.draws += r.draws;
  }
  const pct = (w: number, d: number): number => (d > 0 ? Math.round((w / d) * 100) : 0);
  const out = [...by.values()];
  for (const s of out) {
    s.asChallenger.pct = pct(s.asChallenger.wins, s.asChallenger.duels);
    s.asTarget.pct = pct(s.asTarget.wins, s.asTarget.duels);
    s.pct = pct(s.wins, s.duels);
    s.seatGap = s.asChallenger.pct - s.asTarget.pct;
  }
  // Worst first: this list IS the authoring queue, so the comp that needs work is at the top.
  return out.sort((x, y) => x.pct - y.pct || y.seatGap - x.seatGap);
}

/** Comps under `pct`, worst first — the P4/P5 authoring queue. */
export function labQueue(standings: readonly LabStanding[], pct = 40): LabStanding[] {
  return standings.filter((s) => s.duels > 0 && s.pct < pct);
}

/** The queue as a fixed-width table. For the dev console. */
export function labQueueTable(standings: readonly LabStanding[]): string {
  const head = 'comp                           tier      W-D-L      win%  chal%  targ%   seat gap';
  const lines = standings.map((s) => {
    const losses = s.duels - s.wins - s.draws;
    return [
      s.name.slice(0, 30).padEnd(30),
      (s.tier || '-').padEnd(9),
      `${s.wins}-${s.draws}-${losses}`.padEnd(10),
      `${s.pct}%`.padStart(5),
      `${s.asChallenger.pct}%`.padStart(6),
      `${s.asTarget.pct}%`.padStart(6),
      `${s.seatGap >= 0 ? '+' : ''}${s.seatGap}`.padStart(10),
    ].join(' ');
  });
  return [head, ...lines].join('\n');
}

// ---- G6: the team bench (2v2 / 3v3 / 5v5) ---------------------------------------------

export interface TeamMatch {
  /** LIVE, not run: the caller ticks it or calls runToEnd. */
  session: CombatSession;
  aName: string;
  bName: string;
  /** Every body on each side, in comp-seat order, so a caller can name who actually fought. */
  seats: { a: CombatantSpec[]; b: CombatantSpec[] };
  seed: number;
}

/**
 * ONE team match, built the one way, and it is `game.arenaMatch`'s construction with comp bodies
 * on both sides instead of the character and its squad (`battleground.ts:157-174`, pvp plan P6.5).
 *
 * Deliberately NOT a new path: §8.7 is what a novel construction costs - the lab's first version
 * seated no brain on the `enemy` side and read the resulting sweep as a comp result. So the lead
 * seat goes where the player goes and gets a `playerActionProvider` the way `buildLabDuel` gives
 * one, the rest of its comp are allies with `allyActionProviders`, and the other comp fills the
 * enemies with `enemyActionProviders`.
 *
 * NO `duel: true`. An arena is decided by ELIMINATION and a duel is not - the duel flag floors the
 * loser at 1 HP (`duel.ts:126`) - which is the one thing that must differ from `buildLabDuel`
 * (`repro-arena-elimination.mjs`: "ELIMINATION DECIDES IT, at every bracket").
 *
 * Null when either comp cannot be seated whole, which `seatsAreTheComp` already decides: a comp
 * the faction pool cannot field comes back as random pvp bots wearing its name, and a standing
 * built on that is fiction.
 */
export function buildTeamMatch(args: {
  ds: DataStore;
  char: Character;
  a: ArenaComp;
  b: ArenaComp;
  index?: number;
  /** Hold the fight fixed and vary only the seating - the paired test §8.7 needs. */
  seed?: number;
  /** G7's axis, applied to every seat on both sides. */
  loadout?: 'none' | 'kit';
  /** G10's per-side override, a DIRTY round only - the same two fields `buildLabDuel` takes. */
  loadoutA?: 'none' | 'kit';
  loadoutB?: 'none' | 'kit';
  /** DEV: a Map to receive each seat's last rotation snapshot (types.ts `snapshotCapture`). */
  snapshotCapture?: Map<string, unknown>;
}): TeamMatch | null {
  const { ds, char, a, b } = args;
  const seed = args.seed ?? labSeedFor(a.id, b.id, Math.max(0, Math.trunc(args.index ?? 0)));
  const opts = (comp: ArenaComp, side?: 'none' | 'kit') => {
    const l = side ?? args.loadout;
    return {
      teamSize: comp.seats.length,
      tier: comp.tier,
      otherFactionIfUnseatable: true,
      ...(l ? { loadout: l } : {}),
    };
  };
  const sa = arenaSeats(ds, char, a, seed, opts(a, args.loadoutA));
  const sb = arenaSeats(ds, char, b, hashSeed(seed, 0x2b), opts(b, args.loadoutB));
  if (sa.length !== a.seats.length || sb.length !== b.seats.length) return null;
  const [lead, ...mates] = sa;
  if (!lead) return null;
  // Pets ride AFTER the humans on their own side, so ally_0..n-1 and enemy_0..n-1 stay 1:1 with the
  // seats a caller named (bgScreen.ts:366-419). The lead's own pet takes side `pet`.
  const petsOf = (rows: readonly { pet: CombatantSpec | null }[]): CombatantSpec[] =>
    rows.map((s) => s.pet).filter((p): p is CombatantSpec => p != null);
  const mateSpecs = [...mates.map((s) => s.spec), ...petsOf(mates)];
  const foeSpecs = [...sb.map((s) => s.spec), ...petsOf(sb)];
  const geo = seedDuelGeometry({
    player: lead.spec,
    enemySpecs: foeSpecs,
    allySpecs: mateSpecs,
    includePet: lead.pet != null,
    // Both sides are TEAMS here, so side B is seeded by the party's own formation mirrored rather
    // than as a mob pack. Without it side A won 20/20 mirrors (repro-arena-seat-gap.mjs).
    enemyIsATeam: true,
    spellOf: (id) => ds.spell(id),
  });
  return {
    session: createSession(lead.spec, foeSpecs, mulberry32(seed), {
      playerActionProvider: lead.provider,
      // null per pet body: pets have no rotation section, so the pet heuristics drive them.
      allyActionProviders: [
        ...mates.map((s) => s.provider),
        ...mateSpecs.slice(mates.length).map(() => null),
      ],
      enemyActionProviders: [
        ...sb.map((s) => s.provider),
        ...foeSpecs.slice(sb.length).map(() => null),
      ],
      unitPositionsYd: geo.positions,
      geometryAnchor: geo.anchor,
      // Side B is a TEAM of player seats, so it picks targets like a player faction rather than
      // off a creature threat list (sessionFocus hostileTargetOf).
      enemiesAreATeam: true,
      ...(args.snapshotCapture ? { snapshotCapture: args.snapshotCapture } : {}),
    }, lead.pet, mateSpecs.length ? mateSpecs : null),
    aName: a.name,
    bName: b.name,
    seats: { a: sa.map((s) => s.spec), b: sb.map((s) => s.spec) },
    seed,
  };
}

/**
 * Every ORDERED pair of team comps, `seeds` matches each. Rows are `LabPairResult`, so
 * `labStandings` and `labQueue` score a team bracket with no second copy of that arithmetic
 * (duel plan §G6: "Standings reuse `labStandings` as-is - it keys on comp ids").
 *
 * Ordered for the same reason `runDuelLab` is: the lead seat is the `player` side and the two
 * sides are not symmetric, so collapsing a pair would hide the seat. And `seatGap` off these rows
 * carries the same caveat as a duel round's - the two directions are different fights (plan §2).
 */
export function runTeamLab(args: {
  ds: DataStore;
  char: Character;
  /** Default: every authored comp of `bracket`. */
  comps?: readonly ArenaComp[];
  bracket?: ArenaBracket;
  seeds?: number;
  /** G7's axis. The CELL owns it. */
  loadout?: 'none' | 'kit';
  /** G10: one comp's declared loadout in a DIRTY round, the same hook `runDuelLab` takes. */
  loadoutOf?: (compId: string) => 'none' | 'kit' | null | undefined;
}): LabPairResult[] {
  const { ds, char } = args;
  // Default is ONE tier's worth: the bracket is derived at all five (arenaComps.ts perTier), so the
  // whole bracket is 35 comps and an all-pairs bench of it is 1,190 matches per seed.
  const comps = args.comps
    ?? compsForBracket(args.bracket ?? 2).filter((c) => c.tier === DEFAULT_BG_TIER);
  const seeds = Math.max(1, Math.trunc(args.seeds ?? LAB_DEFAULT_SEEDS));
  const out: LabPairResult[] = [];
  for (const a of comps) {
    for (const b of comps) {
      if (a.id === b.id) continue;
      let aWins = 0;
      let bWins = 0;
      let draws = 0;
      let duels = 0;
      let totalMs = 0;
      let bodiesA = 0;
      let bodiesB = 0;
      for (let s = 0; s < seeds; s++) {
        const la = args.loadoutOf?.(a.id) ?? null;
        const lb = args.loadoutOf?.(b.id) ?? null;
        const m = buildTeamMatch({
          ds, char, a, b, index: s,
          ...(args.loadout ? { loadout: args.loadout } : {}),
          ...(la ? { loadoutA: la } : {}),
          ...(lb ? { loadoutB: lb } : {}),
        });
        if (!m) continue;
        bodiesA = m.seats.a.length;
        bodiesB = m.seats.b.length;
        const r = m.session.runToEnd();
        duels++;
        totalMs += r.durationMs;
        if (r.winner === 'player') aWins++;
        else if (r.winner === 'enemy') bWins++;
        else draws++;
      }
      out.push({
        aId: a.id,
        aName: a.name,
        bId: b.id,
        bName: b.name,
        duels,
        aWins,
        bWins,
        draws,
        aWinPct: duels > 0 ? Math.round((aWins / duels) * 100) : 0,
        avgDurationMs: duels > 0 ? Math.round(totalMs / duels) : 0,
        bodiesA,
        bodiesB,
      });
    }
  }
  return out;
}

// The bench's bracket fork, in ONE place: 1 is a DUEL, 2/3/5 an ELIMINATION team match (plan §W1).
// Routed back through `runDuelLab` a team bracket seats `arenaSeats(...)[0]` alone — `bodiesA` says so.
export function runLabForBracket(
  bracket: ArenaBracket,
  args: Parameters<typeof runTeamLab>[0],
): LabPairResult[] {
  return bracket === 1 ? runDuelLab(args) : runTeamLab({ ...args, bracket });
}
