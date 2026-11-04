// Companions in world fights, shared by the line game and the windowed one. The three squad modes write
// the autopilot knobs the web client's squadModePicker.ts writes; squadJoinsPull is autopilotController.ts:1039;
// prePull is its prepPartyBuffs pacing (:864) plus the weapon-coat refresh liveFloorRecovery.ts:226 makes.
import { creatureRank } from '../autopilot/questPolicy.ts';
import { allyIndexOfSide } from '../engine/core/events.ts';

export const SQUAD_MODES = ['solo', 'elite', 'party'];
export const SQUAD_MODE_LABEL = {
  solo: { title: 'Solo', detail: 'You fight alone. Companions wait at the inn and skip your quests.' },
  elite: { title: 'Solo with elite support', detail: 'Companions join only when the target is an elite.' },
  party: { title: 'Party', detail: 'Companions fight every pull and do the same quests as you.' },
};
// `:squad` words for each mode, the plan's names first.
export const SQUAD_MODE_WORDS = { solo: 'solo', elite: 'elite', elites: 'elite', party: 'party' };

export function applySquadMode(cfg, mode) {
  if (mode === 'solo') return { ...cfg, questEliteMode: 'solo', questSquadAlways: false, questSquadShare: false };
  if (mode === 'party') return { ...cfg, questEliteMode: 'squad', questSquadAlways: true, questSquadShare: true };
  return { ...cfg, questEliteMode: 'squad', questSquadAlways: false };
}

/** The mode the saved knobs spell, or null when they match none of the three. */
export function squadModeOf(cfg) {
  if (cfg.questSquadAlways) return cfg.questEliteMode === 'squad' ? 'party' : null;
  if (cfg.questEliteMode === 'squad') return 'elite';
  if (cfg.questEliteMode === 'solo') return 'solo';
  return null;
}

export function setSquadMode(g, mode) { g.setAutopilotConfig(applySquadMode(g.autopilotConfig(), mode)); }

/** Do the companions come on this pull? Elites (rank > 0) in elite mode, everything in party mode. */
export function squadJoinsPull(g, ds, creatureEntry) {
  if ((g.state.squad ?? []).length === 0) return false;
  const cfg = g.autopilotConfig();
  if (cfg.questSquadAlways) return true;
  if (cfg.questEliteMode !== 'squad') return false;
  return creatureRank(ds, creatureEntry) > 0;
}

const PARTY_BUFF_LEAD_MS = 20_000;
const PARTY_BUFF_MIN_GAP_MS = 60_000;

/** Before a squad pull: party buffs (paced by the shortest aura, since they drink elixirs) and fresh weapon
 *  coats. Returns the lines worth printing. `pace` is a per-game `{ nextAt }` the caller keeps. */
export function prePull(g, ds, pace, now = Date.now()) {
  const out = [];
  if ((g.state.squad ?? []).length === 0) return out;
  if (now >= (pace.nextAt ?? 0)) {
    const prep = g.applyPrePullBuffs();
    let shortest = Infinity;
    for (const b of prep.buffs) if (b.durationMs > 0 && b.durationMs < shortest) shortest = b.durationMs;
    pace.nextAt = now + Math.max(PARTY_BUFF_MIN_GAP_MS, (Number.isFinite(shortest) ? shortest : PARTY_BUFF_MIN_GAP_MS) - PARTY_BUFF_LEAD_MS);
    if (prep.buffs.length) out.push(`Buffed up: ${[...new Set(prep.buffs.map((b) => b.name))].join(', ')}`);
    for (const h of prep.handouts) out.push(`${h.from} hands you ${h.count}x ${ds.item(h.item)?.name ?? `item ${h.item}`}`);
  }
  const coats = g.refreshPartyWeaponCoats();
  if (coats > 0) out.push(`Weapon coatings renewed (${coats}).`);
  return out;
}

/** beginFight / fight opts for this creature, after the pre-pull when the squad comes. */
export function pullOpts(g, ds, pace, creatureEntry, say) {
  if (!squadJoinsPull(g, ds, creatureEntry)) return undefined;
  for (const line of prePull(g, ds, pace)) say(line);
  return { withSquad: true };
}

/** Combat log names for a session: companions and their pets by name, pack members by theirs. */
export function sessionLogNames(session, base) {
  const nameOf = (list, side) => list.find((v) => v.side === side)?.name;
  return {
    ...base,
    petName: session.petView()?.name ?? base.petName,
    allyName: (side) => nameOf(session.alliesView(), side),
    enemyNameOf: (side) => nameOf(session.enemiesView(), side),
  };
}

/** The same names from the squad alone, for a fight that only left events (game.fight): ally_N is squad[N],
 *  and companion pets sit after the humans (squadBattleParty().allyPetIndex, runFullDungeon.ts:358). */
export function squadLogNames(g, creatureEntry, base) {
  const squad = g.state.squad ?? [];
  const petOwner = new Map();
  if (squad.length) {
    (g.squadBattleParty(creatureEntry).allyPetIndex ?? []).forEach((p, human) => { if (p != null) petOwner.set(p, human); });
  }
  return {
    ...base,
    petName: g.state.char.pet?.name ?? base.petName,
    allyName: (side) => {
      const i = allyIndexOfSide(side);
      if (i < 0) return undefined;
      if (i < squad.length) return squad[i].name;
      const owner = squad[petOwner.get(i)];
      return owner ? (owner.pet?.name ?? `${owner.name}'s pet`) : undefined;
    },
  };
}

// The web client's companionHint.ts: the one-shot prompt when the run refuses an elite quest for an empty party.
export const COMPANION_HINT_LINES = [
  'Auto Quest leaves elite quests alone while your party is empty. Elites are what companions are for.',
  'Hire them at an inn in a settlement, up to four, for a 5-man. A Naked one is free, and it still fights and gains levels off your kills.',
];
