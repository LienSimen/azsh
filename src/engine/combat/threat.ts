// Classic 1.12 ThreatManager port: pure list machinery for who a creature hates and who it attacks
// next. Cite: Combat/ThreatManager.cpp CalcThreat / addThreat / selectNextVictim; Unit.cpp:1207.

/** Opaque combatant key (map to Side or future multi-mob ids). */
export type CombatantId = string;

/** TauntState — ThreatManager.h:50–55 */
export const TAUNT_STATE = {
  NONE: 0,
  TAUNTED: 1,
  /** UINT32_MAX in C++; use a large int for JS sort ordering. */
  FIXATED: 0xffff_ffff,
} as const;
export type TauntState = (typeof TAUNT_STATE)[keyof typeof TAUNT_STATE];

/** HostileState — ThreatManager.h:44–48 */
export const HOSTILE_STATE = {
  SUPPRESSED: 0,
  NORMAL: 1,
} as const;
export type HostileState = (typeof HOSTILE_STATE)[keyof typeof HOSTILE_STATE];

/** Sticky thresholds — ThreatManager.cpp:398–410 */
export const THREAT_STICKY_MELEE = 1.1;
export const THREAT_STICKY_RANGE = 1.3;

// Heal / energize assist coefficient. Unit.cpp:6961 and Spell.cpp:1249 — `0.5f * amount *
// GetSpellThreatMultiplier`.
export const HEAL_THREAT_FACTOR = 0.5;

export interface HostileEntry {
  id: CombatantId;
  threat: number;
  tauntState: TauntState;
  hostileState: HostileState;
  online: boolean;
}

export interface CalcThreatOpts {
  /** Crit hit — multiplies by crit-threat aura when modeled; currently identity. */
  crit?: boolean;
  /** School for ApplyTotalThreatModifier; currently identity (no MOD_THREAT auras). */
  schoolMask?: number;
  // Optional spell threat multiplier from spell_threat.multiplier. SpellMgr.h GetSpellThreatMultiplier —
  // default 1.0 when absent / white hit. Applied to raw damage before CalcThreat (Unit.cpp:1207).
  spellThreatMultiplier?: number;
  // When true, CalcThreat returns 0 (SPELL_ATTR_EX_NO_THREAT / no-threat state). Structure hook; combat may
  // pass for future attributes.
  noThreat?: boolean;
  // SPELLMOD_THREAT percent from the hated unit (player) talent ADD_PCT/FLAT. ApplySpellMod(spellId,
  // SPELLMOD_THREAT, threat). Cite: ThreatManager.cpp:49.
  spellThreatPct?: number;
  // ApplyTotalThreatModifier result: product of form MOD_THREAT + talent school mods. Default 1. Cite:
  // Unit.cpp:8626–8636.
  threatSchoolMultiplier?: number;
}

// ThreatCalcHelper::CalcThreat — ThreatManager.cpp:34–57. Order: SPELLMOD_THREAT → (crit threat aura skip)
// → ApplyTotalThreatModifier.
export function calcThreat(rawThreat: number, opts: CalcThreatOpts = {}): number {
  if (!rawThreat) return 0;
  if (opts.noThreat) return 0;
  let threat = rawThreat;
  // SPELLMOD_THREAT — ApplySpellMod pct (Util ApplyPercentModFloatVar style on the value).
  if (opts.spellThreatPct) {
    threat = (threat * (100 + opts.spellThreatPct)) / 100;
  }
  // SPELL_AURA_MOD_CRITICAL_THREAT: only Classic spell 28746 — no talent/bake data → identity.
  void opts.crit;
  void opts.schoolMask;
  // ApplyTotalThreatModifier (form + talent MOD_THREAT school mult).
  const schoolMult = opts.threatSchoolMultiplier ?? 1;
  if (schoolMult !== 1) threat *= schoolMult;
  return threat;
}

// Damage → raw threat before CalcThreat. Unit.cpp:1207 — `threat = damage *
// GetSpellThreatMultiplier(spellInfo)` (white = 1.0).
export function damageToRawThreat(damage: number, spellThreatMultiplier = 1): number {
  if (damage <= 0) return 0;
  return damage * (spellThreatMultiplier > 0 ? spellThreatMultiplier : 1);
}

// ThreatContainer::update order — ThreatManager.cpp:288-325. TauntState > HostileState > threat (desc);
// equal keys keep their current list order.
function compareHostileEntry(a: HostileEntry, b: HostileEntry): number {
  if (a.tauntState !== b.tauntState) return b.tauntState - a.tauntState;
  if (a.hostileState !== b.hostileState) return b.hostileState - a.hostileState;
  if (a.threat !== b.threat) return b.threat - a.threat;
  return 0;
}

// One creature's hate list (the owner). Wave 4A multi-enemy: each enemy has its own manager. Owner is the
// hating unit (creature that CanHaveThreatList). List entries are who it hates.
export class ThreatManager {
  readonly ownerId: CombatantId;
  private entries = new Map<CombatantId, HostileEntry>();
  /** Insertion order for stable equal-threat ties (deterministic; C++ list order). */
  private order: CombatantId[] = [];
  private currentVictimId: CombatantId | null = null;
  private dirty = false;
  /** Reused sort buffer — one array for the life of the manager, not one per sort. */
  private sortScratch: HostileEntry[] = [];

  constructor(ownerId: CombatantId) {
    this.ownerId = ownerId;
  }

  isEmpty(): boolean {
    return this.entries.size === 0;
  }

  getCurrentVictimId(): CombatantId | null {
    return this.currentVictimId;
  }

  /** Snapshot of online list, sorted (most hated first). */
  getThreatList(): HostileEntry[] {
    this.sortIfDirty();
    return this.order.map((id) => ({ ...this.entries.get(id)! }));
  }

  // Sorted ids, most hated first — the live array, so DO NOT mutate it. Safe to iterate while calling
  // `remove()`, which replaces `order` rather than splicing. Callers used to clone every row.
  getThreatIds(): readonly CombatantId[] {
    this.sortIfDirty();
    return this.order;
  }

  getThreat(id: CombatantId): number {
    return this.entries.get(id)?.threat ?? 0;
  }

  hasThreat(id: CombatantId): boolean {
    return this.entries.has(id);
  }

  /** ThreatManager.cpp:535–545 GetHighestThreat */
  getHighestThreat(): number {
    let value = 0;
    for (const e of this.entries.values()) {
      if (e.threat > value) value = e.threat;
    }
    return value;
  }

  getMostHated(): HostileEntry | null {
    this.sortIfDirty();
    if (this.order.length === 0) return null;
    const e = this.entries.get(this.order[0]);
    return e ? { ...e } : null;
  }

  // addThreat with CalcThreat — ThreatManager.cpp:446–468. `rawThreat` is already damage*multiplier (or
  // flat EffectThreat amount).
  addThreat(
    victimId: CombatantId,
    rawThreat: number,
    opts: CalcThreatOpts = {},
  ): void {
    if (victimId === this.ownerId) return;
    const calculated = calcThreat(rawThreat, opts);
    this.addThreatDirectly(victimId, calculated, false);
  }

  // Raw add (taunt / already-modified). ThreatManager.cpp:470–490. `noNew` skips creating a new reference
  // (SPELL_ATTR_EX_NO_THREAT path).
  addThreatDirectly(victimId: CombatantId, threat: number, noNew = false): void {
    if (victimId === this.ownerId) return;
    let e = this.entries.get(victimId);
    if (!e) {
      if (noNew) return;
      e = {
        id: victimId,
        threat: 0,
        tauntState: TAUNT_STATE.NONE,
        hostileState: HOSTILE_STATE.NORMAL,
        online: true,
      };
      this.entries.set(victimId, e);
      this.order.push(victimId);
      this.dirty = true;
    }
    this.modifyEntryThreat(e, threat);
  }

  // HostileReference::addThreatPercent — ThreatManager.h:68–72. -100 special-cases full wipe without
  // rounding error.
  modifyThreatPercent(victimId: CombatantId, threatPercent: number): void {
    const e = this.entries.get(victimId);
    if (!e) return;
    if (threatPercent < -100) {
      this.remove(victimId);
      return;
    }
    const delta = threatPercent === -100 ? -e.threat : (e.threat * threatPercent) / 100;
    this.modifyEntryThreat(e, delta);
  }

  // ThreatContainer::modifyAllThreatPercent — ThreatManager.cpp:267–282 / :499–502. DoResetThreat is this
  // at -100 (UnitAI.cpp:773–781, pin de8f729).
  modifyAllThreatPercent(threatPercent: number): void {
    for (const e of this.getThreatList()) {
      this.modifyThreatPercent(e.id, threatPercent);
    }
  }

  setTauntState(victimId: CombatantId, state: TauntState): void {
    const e = this.entries.get(victimId);
    if (!e) return;
    if (e.tauntState !== state) {
      e.tauntState = state;
      this.dirty = true;
    }
  }

  // EffectTaunt — SpellEffects.cpp:3413–3435. Equalize taunter to highest threat, force current victim.
  // Returns false if owner already attacking taunter (cast-fail path; engine may ignore).
  applyTaunt(taunterId: CombatantId, alreadyVictimFails = false): boolean {
    if (alreadyVictimFails && this.currentVictimId === taunterId) {
      return false;
    }
    const highest = this.getHighestThreat();
    const current = this.getThreat(taunterId);
    const added = highest - current;
    // Ensure taunter is on the list even if added is 0 and list was empty.
    this.addThreatDirectly(taunterId, Math.max(0, added), false);
    this.setCurrentVictimByTarget(taunterId);
    return true;
  }

  /** ThreatManager.cpp:596–602 */
  setCurrentVictimByTarget(targetId: CombatantId): void {
    if (this.currentVictimId === targetId) return;
    if (this.entries.has(targetId)) {
      this.currentVictimId = targetId;
    }
  }

  // selectNextVictim: stay on the current victim unless a challenger exceeds 1.1x in melee or 1.3x at
  // range. Cite: ThreatManager.cpp:331-424, 511-517.
  selectNextVictim(isInMelee: (id: CombatantId) => boolean = () => true): CombatantId | null {
    this.sortIfDirty();
    if (this.order.length === 0) {
      this.currentVictimId = null;
      return null;
    }

    const currentId = this.currentVictimId;
    const current = currentId ? this.entries.get(currentId) : undefined;
    // If current was removed / missing, fall through as no current.
    const hasCurrent = !!(current && current.online);

    for (const id of this.order) {
      const ref = this.entries.get(id);
      if (!ref || !ref.online) continue;

      if (hasCurrent && current) {
        // Still most-hated / first acceptable on sorted list that is current → keep.
        if (currentId === id) {
          this.currentVictimId = id;
          return id;
        }

        // Taunt overrides sticky.
        if (ref.tauntState > current.tauntState) {
          this.currentVictimId = id;
          return id;
        }

        // HostileState priority (suppressed < normal).
        if (ref.hostileState > current.hostileState) {
          this.currentVictimId = id;
          return id;
        }

        // Sticky: challenger not far enough ahead → keep current.
        // ThreatManager.cpp:398–411
        if (ref.threat <= THREAT_STICKY_MELEE * current.threat) {
          this.currentVictimId = currentId!;
          return currentId!;
        }

        const inMelee = isInMelee(id);
        if (
          ref.threat > THREAT_STICKY_RANGE * current.threat
          || (ref.threat > THREAT_STICKY_MELEE * current.threat && inMelee)
        ) {
          this.currentVictimId = id;
          return id;
        }
        // Challenger between 1.1 and 1.3 but not in melee → keep scanning;
        // if we never break, fall through. C++ continues the loop.
        continue;
      }

      // No current victim: pick first online (most hated after sort).
      this.currentVictimId = id;
      return id;
    }

    // No acceptable target found while current exists but loop didn't settle — keep current if live.
    if (hasCurrent && currentId) {
      this.currentVictimId = currentId;
      return currentId;
    }
    this.currentVictimId = null;
    return null;
  }

  /** Alias matching CreatureAI getHostileTarget naming. */
  getHostileTarget(isInMelee?: (id: CombatantId) => boolean): CombatantId | null {
    return this.selectNextVictim(isInMelee);
  }

  // HostileRefManager::threatAssist. Call on the HATER's manager: addThreat(healer, threat/size),
  // where `haterCount` is the number of valid haters sharing it. Cite: HostileRefManager.cpp:39-68.
  threatAssist(
    healerId: CombatantId,
    totalThreat: number,
    haterCount = 1,
    opts: CalcThreatOpts = {},
  ): void {
    if (totalThreat === 0 || haterCount <= 0) return;
    this.addThreat(healerId, totalThreat / haterCount, opts);
  }

  /** DeleteThreatList / clearReferences — Unit.cpp:8653; ThreatManager.cpp:437–442 */
  clear(): void {
    this.entries.clear();
    this.order = [];
    this.currentVictimId = null;
    this.dirty = false;
  }

  /** Remove one entry (death of pet/totem, etc.). */
  remove(id: CombatantId): void {
    if (!this.entries.has(id)) return;
    this.entries.delete(id);
    this.order = this.order.filter((x) => x !== id);
    if (this.currentVictimId === id) this.currentVictimId = null;
    this.dirty = true;
  }

  // ---- internal ----

  private modifyEntryThreat(e: HostileEntry, mod: number): void {
    if (mod + e.threat < 0) mod = -e.threat;
    if (mod === 0) return;
    e.threat += mod;
    // Threat change may reorder list — ThreatManager.cpp:616–619 dirty rules.
    this.dirty = true;
  }

  // ThreatContainer::update sort — ThreatManager.cpp:288–325. Priority: TauntState > HostileState > threat
  // (desc). Equal threat: stable by insertion order (deterministic).
  private sortIfDirty(): void {
    // The old guard also required length <= 1, so a clean 40-entry list re-sorted on every call —
    // three calls per mob per tick, 5.2% of tick self time at 40 allies.
    if (!this.dirty || this.order.length <= 1) {
      this.dirty = false;
      return;
    }
    // Sort the rows, not the ids: the id comparator did two lookups per comparison and built an
    // index Map per sort. Array#sort is stable, which IS the "equal keys keep list order" rule.
    const rows = this.sortScratch;
    rows.length = 0;
    for (const id of this.order) rows.push(this.entries.get(id)!);
    rows.sort(compareHostileEntry);
    for (let i = 0; i < rows.length; i++) this.order[i] = rows[i]!.id;
    rows.length = 0;
    this.dirty = false;
  }
}

// Lookup helper for optional spell_threat row fields on SpellDef. Defaults match GetSpellThreatMultiplier
// when no entry: multiplier 1, flat 0.
export function spellThreatFromDef(spell: {
  threatMultiplier?: number;
  threatFlat?: number;
  threatApBonus?: number;
} | null | undefined): { multiplier: number; flat: number; apBonus: number } {
  return {
    multiplier: spell?.threatMultiplier ?? 1,
    flat: spell?.threatFlat ?? 0,
    apBonus: spell?.threatApBonus ?? 0,
  };
}
