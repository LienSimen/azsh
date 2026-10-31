// Load-time patches for catalog surfaces that cannot wait on a re-bake. Every number comes from
// the existing bake — vendors, zone FM lists, garment quest text. Cite: KI-147/429/478/670.

import type { CreatureDef, GameObjectDef, QuestDef, SpellDef, ZoneDef } from '../../data/schema.ts';
import { filterQuestFarm } from '../questFarmFilter.mjs';
import { syntheticClassTrainerEntry } from '../economy/syntheticClassTrainers.ts';

/** Mount/stable vendors that carry the innkeeper NpcFlag quirk in classic DB. */
const MOUNT_VENDOR_INNKEEPER_NAMES = new Set([
  'Ogunaro Wolfrunner',
  'Lelanai',
  'Katie Hunter',
  'Veron Amberstill',
  'Milli Featherwhistle',
  'Zachariah Post',
  'Zjolnir',
  'Harb Clawhoof',
]);

// Nethergarde Keep vendors already in the vendors table (item_data / npc_vendor). Cite: vendors.json
// entries 3546 Bernie Heisten, 8178 Nina Lightbrew; KI-467.
const BLASTED_LANDS_VENDOR_ENTRIES = [3546, 8178] as const;

/** Priest garment "heal + fortitude" class quests wrongly baked as kill of the patient. */
const GARMENT_HEAL_KILL_PROXY_QUESTS = new Set([5621, 5624, 5625, 5648, 5650]);

/** Blessing of Sanctuary ranks (empty effects[] + aura 14/43 raw). */
const SANCTUARY_SPELL_IDS = new Set([20911, 20912, 20913, 20914, 25899]);

// Prefer real innkeepers over mount vendors; stable sort so "Innkeeper …" leads. Cite:
// enrich-innkeepers.mjs DATA QUIRK comment; KI-429 bindHearth name.
export function patchZoneInnkeepers(zone: ZoneDef): void {
  const inns = zone.innkeepers;
  if (!inns?.length) return;
  const filtered = inns.filter((i) => !MOUNT_VENDOR_INNKEEPER_NAMES.has(i.name));
  if (filtered.length === 0) return; // never leave a zone with no innkeeper if only mount vendors
  filtered.sort((a, b) => {
    const aInn = /^innkeeper\b/i.test(a.name) ? 0 : 1;
    const bInn = /^innkeeper\b/i.test(b.name) ? 0 : 1;
    if (aInn !== bInn) return aInn - bInn;
    return a.entry - b.entry;
  });
  zone.innkeepers = filtered;
}

/** Stamp Blasted Lands Nethergarde vendors when the zone list is empty. */
export function patchBlastedLandsVendors(zone: ZoneDef): void {
  if (zone.id !== 'blastedlands') return;
  if ((zone.vendors?.length ?? 0) > 0) return;
  zone.vendors = [...BLASTED_LANDS_VENDOR_ENTRIES];
}

// Ensure every zone.flightMasters entry has a creature row so talkToNpc resolves — entry plus name
// from the FM list, faction optional. Cite: enrich-taxi.mjs zone.flightMasters; KI-670.
export function ensureFlightMasterCreatures(
  zones: Iterable<ZoneDef>,
  creatures: Map<number, CreatureDef>,
): number {
  let n = 0;
  for (const z of zones) {
    for (const fm of z.flightMasters ?? []) {
      const entry = (fm.entry ?? 0) | 0;
      if (entry <= 0 || creatures.has(entry)) continue;
      const name = (fm.name ?? `Flight Master ${entry}`).trim() || `Flight Master ${entry}`;
      // Minimal non-combat stub so talkToNpc resolves (KI-670). Not a combat target.
      creatures.set(entry, {
        entry,
        name,
        level: 55,
        hpMin: 1,
        hpMax: 1,
        dmgMin: 0,
        dmgMax: 0,
        attackTimeMs: 2000,
        armor: 0,
        lootId: 0,
        minGold: 0,
        maxGold: 0,
        xp: 0,
        experienceMultiplier: 0,
        creatureType: 7,
        factionId: 0,
      });
      n += 1;
    }
  }
  return n;
}

// Garments of Darkness family: the objective is heal and buff, not kill the patient. Clear
// killTargets so fight-credit cannot complete the quest by murdering the NPC. Cite: KI-478.
export function patchGarmentHealQuests(quests: Iterable<QuestDef>): number {
  let n = 0;
  for (const q of quests) {
    if (!GARMENT_HEAL_KILL_PROXY_QUESTS.has(q.entry | 0)) continue;
    const kills = q.killTargets ?? [];
    if (kills.length === 0) continue;
    const obj = `${q.objectivesText ?? ''} ${q.detailsText ?? ''}`;
    if (!/heal/i.test(obj)) continue;
    q.killTargets = [];
    n += 1;
  }
  return n;
}

// classic-db quest_template 484 stamps RequiredMinRepFaction=47 Value=9000 (IF Honored). Vanilla
// has no rep gate — Alliance minLevel 18 only, rewRep Stormwind. Cite: KI-784; live3310 484.
const BOGUS_MIN_REP_QUESTS = new Set([484]);

export function patchBogusQuestMinRepGates(quests: Iterable<QuestDef>): number {
  let n = 0;
  for (const q of quests) {
    if (!BOGUS_MIN_REP_QUESTS.has(q.entry | 0)) continue;
    if (q.requiredMinRepFaction == null && q.requiredMinRepValue == null) continue;
    delete (q as { requiredMinRepFaction?: number }).requiredMinRepFaction;
    delete (q as { requiredMinRepValue?: number }).requiredMinRepValue;
    n += 1;
  }
  return n;
}

// Strip absurd reverse-loot farm rows (L42 Silverback on a Tirisfal L10 candle quest). High-level
// slack only; an empty farm leaves GO and quest-reward paths. Cite: KI-800; KI-826.
export function patchAbsurdQuestFarms(
  quests: Iterable<QuestDef>,
  creatures: Map<number, CreatureDef>,
  _zones?: Iterable<ZoneDef>,
): number {
  if (creatures.size === 0) return 0;
  let n = 0;
  for (const q of quests) {
    const farm = q.farm;
    if (!farm?.length) continue;
    const next = filterQuestFarm(farm, {
      questLevel: q.questLevel,
      minLevel: q.minLevel,
      levelOf: (entry) => {
        const c = creatures.get(entry | 0);
        if (!c) return 0;
        return (c.level | 0) || ((c.scaling?.minLevel ?? 0) | 0) || 0;
      },
    });
    if (next.length === farm.length && next.every((e, i) => e === farm[i])) continue;
    if (next.length) q.farm = next;
    else delete (q as { farm?: number[] }).farm;
    n += 1;
  }
  return n;
}

// Cannibalize (20577): seed-racials stamped a flat 20/tick, but the live channel 20578 is 7% max
// HP every 2s for 10s. Stamp pctOfMax without a re-bake. Cite: SpellEffects.cpp:786; KI-806.
export function patchCannibalizeHeal(spell: SpellDef): void {
  if ((spell.id | 0) !== 20577) return;
  const effects = spell.effects;
  if (!effects?.length) return;
  let changed = false;
  const next = effects.map((e) => {
    if (e.kind !== 'restore_health') return e;
    const pct = (e as { pctOfMax?: number }).pctOfMax;
    const flat = e.amountPerTick | 0;
    // Only rewrite the known-wrong flat-20 seed surface (or missing pct).
    if (pct != null && pct > 0 && flat !== 20) return e;
    if (pct === 7 && flat === 7) return e;
    changed = true;
    return {
      ...e,
      amountPerTick: 7,
      tickMs: (e.tickMs | 0) > 0 ? e.tickMs : 2000,
      durationMs: (e.durationMs | 0) > 0 ? e.durationMs : 10_000,
      pctOfMax: 7,
    };
  });
  if (changed) spell.effects = next;
}

// Food/drink "$s1 over $d": expand Restores N to amountPerTick × ticks (KI-147). Rate templates ("per 5
// sec" / "every N sec") already show $s — leave them (KI-733).
export function patchFoodDrinkDescriptions(spell: SpellDef): void {
  const restore = (spell.effects ?? []).find(
    (e) => e.kind === 'restore_health' || e.kind === 'restore_power',
  );
  if (!restore || restore.kind !== 'restore_health' && restore.kind !== 'restore_power') return;
  if (!spell.description) return;
  // First "Restores N …" clause only — well-fed "every 5 sec" tails must not block KI-147.
  const m = spell.description.match(/Restores (\d+)([^.]*)/i);
  if (!m) return;
  if (/\b(?:per|every)\b/i.test(m[2])) return;
  const tickMs = restore.tickMs || 3000;
  const ticks = Math.max(1, Math.floor((restore.durationMs || 0) / tickMs));
  const total = Math.round((restore.amountPerTick || 0) * ticks);
  if (total <= 0) return;
  // Only rewrite when description shows the per-tick amount (or smaller).
  const shown = Number(m[1]);
  if (shown === total) return;
  if (shown !== restore.amountPerTick && shown >= total) return;
  spell.description = spell.description.replace(/Restores \d+/i, `Restores ${total}`);
}

export function isSanctuarySpellId(id: number): boolean {
  return SANCTUARY_SPELL_IDS.has(id | 0);
}

// zone.quests was baked from ZoneOrSort == areaId only, so starter subzones and class-sorted
// chains landed on no zone: 511 attach here, 95 of them warlock. Cite: ObjectMgr.cpp; KI-873.
export function patchZoneQuestsFromStarterZones(
  zones: Iterable<ZoneDef>,
  quests: Iterable<QuestDef>,
): number {
  const byId = new Map<string, ZoneDef>();
  for (const z of zones) {
    if (z?.id) byId.set(z.id, z);
  }
  if (!byId.size) return 0;

  /** zoneId → entries already listed (mutated as we add). */
  const listed = new Map<string, Set<number>>();
  for (const z of byId.values()) {
    listed.set(z.id, new Set(z.quests ?? []));
  }

  let added = 0;
  const extras = new Map<string, number[]>();
  for (const q of quests) {
    const entry = (q.entry ?? 0) | 0;
    if (!(entry > 0)) continue;
    // Area case, or a class-gated sort — reqClass keeps it off other classes' lists.
    // Cite: ObjectMgr.cpp:4320–4336 ZoneOrSort > 0 area / < 0 sort.
    const classGated = ((q.reqClass ?? 0) | 0) !== 0 || ((q.reqClassMask ?? 0) | 0) !== 0;
    if (((q.rawZoneOrSort ?? 0) | 0) <= 0 && !classGated) continue;
    for (const zid of q.starterZones ?? []) {
      const z = byId.get(zid);
      if (!z) continue;
      let have = listed.get(zid);
      if (!have) {
        have = new Set(z.quests ?? []);
        listed.set(zid, have);
      }
      if (have.has(entry)) continue;
      have.add(entry);
      let bucket = extras.get(zid);
      if (!bucket) {
        bucket = [];
        extras.set(zid, bucket);
      }
      bucket.push(entry);
      added += 1;
    }
  }
  for (const [zid, entries] of extras) {
    const z = byId.get(zid);
    if (!z || !entries.length) continue;
    entries.sort((a, b) => a - b);
    z.quests = (z.quests ?? []).concat(entries);
  }
  return added;
}

// Faction class-trainer stubs on zone.trainers (entry = 1000*1000 + cls). The bake omitted Druid
// from both unions though NE and Tauren include it. Contested follows alliance. Cite: KI-879.
const ALLIANCE_CLASS_TRAINERS = [1, 2, 3, 4, 5, 8, 9, 11] as const;
const HORDE_CLASS_TRAINERS = [1, 3, 4, 5, 7, 8, 9, 11] as const;

export function patchZoneClassTrainers(
  zone: ZoneDef,
  trainerExists: (entry: number) => boolean = () => true,
): void {
  const classes = zone.faction === 'horde' ? HORDE_CLASS_TRAINERS : ALLIANCE_CLASS_TRAINERS;
  const list = zone.trainers ? [...zone.trainers] : [];
  const have = new Set(list.map((t) => t.cls | 0));
  let added = false;
  for (const cls of classes) {
    if (have.has(cls)) continue;
    const entry = syntheticClassTrainerEntry(cls);
    if (!trainerExists(entry)) continue;
    list.push({ cls, entry });
    have.add(cls);
    added = true;
  }
  if (added) zone.trainers = list;
}

// Legends of the Earth (Horde 636 / item 4612) ends at Shards of Myzrael (GO 138492), matching
// Alliance 635. Without goEnder the empty-objective examine quest soft-locks. Cite: KI-792.
export function patchLegendsOfTheEarthQuest(
  quests: Iterable<QuestDef>,
  gameObjects?: Map<number, GameObjectDef> | Iterable<GameObjectDef>,
): void {
  for (const q of quests) {
    if ((q.entry | 0) === 636) {
      q.goEnder = 138492;
      q.goEnderEntries = [138492];
      q.enderName = 'Shards of Myzrael';
      break;
    }
  }
  if (gameObjects) {
    const list = gameObjects instanceof Map ? gameObjects.values() : gameObjects;
    for (const go of list) {
      if ((go.entry | 0) === 138492) {
        const ended = go.questsEnded ? [...go.questsEnded] : [];
        if (!ended.includes(636)) {
          ended.push(636);
          go.questsEnded = ended;
        }
        break;
      }
    }
  }
}

// Belia Thundergranite (10090) is the Thunder Bluff Horde pet trainer, faction 104. The bake
// wrongly placed her in Ironforge with Alliance faction 55. Cite: creature_template 10090; KI-730.
export function patchBeliaPetTrainer(
  zones: Iterable<ZoneDef>,
  creatures?: Map<number, CreatureDef> | Iterable<CreatureDef>,
): void {
  for (const z of zones) {
    if (z.id === 'ironforge' && z.petTrainers) {
      z.petTrainers = z.petTrainers.filter((id) => id !== 10090);
    } else if (z.id === 'thunderbluff') {
      const list = z.petTrainers ? [...z.petTrainers] : [];
      if (!list.includes(10090)) list.push(10090);
      z.petTrainers = list;
    }
  }
  if (creatures) {
    const list = creatures instanceof Map ? creatures : new Map([...creatures].map((c) => [c.entry, c]));
    const belia = list.get(10090);
    if (belia) {
      belia.factionId = 104;
    }
  }
}

// Windshear Vermin (3998) L20 trash has an overtuned minMeleeDmg 52, 1.58x its peers. Align with
// Venture Co. Engineer 3992 (min 33 / max 37). Cite: creature_template 3992; KI-916.
export function patchWindshearVerminDamage(
  creatures?: Map<number, CreatureDef> | Iterable<CreatureDef>,
): void {
  if (!creatures) return;
  const list = creatures instanceof Map ? creatures : new Map([...creatures].map((c) => [c.entry, c]));
  const vermin = list.get(3998);
  if (vermin) {
    if (vermin.scaling) {
      vermin.scaling.minMeleeDmg = 33;
      vermin.scaling.maxMeleeDmg = 37;
    }
    const at = vermin.attackTimeMs || 2000;
    const ap = ((vermin.scaling?.meleeAttackPower ?? 26) / 14) * (at / 1000);
    vermin.dmgMin = Math.max(1, Math.round(33 + ap));
    vermin.dmgMax = Math.max(2, Math.round(37 + ap));
  }
}

export { SANCTUARY_SPELL_IDS };
export { remapSyntheticClassTrainers, normalizeSyntheticTrainerEntry } from '../economy/syntheticClassTrainers.ts';
