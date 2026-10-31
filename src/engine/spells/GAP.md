# System 5 — Spell & Aura Engine: gap note

**Status**: Framework modules implemented and wired into combat (2026-07-15).  
**ETL activation (Wave 1A)**: `enrich-spell-aura.mjs` maps `spell_template` + `spell_proc_event` onto baked spells (2026-07-15).

**Canonical write-up** (summary + full residual gap table + ETL activation):

→ [`docs/cmangos_mapping_implementations/05-spell-aura-engine.md`](../../../docs/cmangos_mapping_implementations/05-spell-aura-engine.md)  
  § **Implementation status (2026-07-15)**

## Quick residual gaps

| Gap | Note |
|-----|------|
| SpellGroups | Not invented — need sourced group data (FS3 `spell_group`) |
| Full aura/effect matrix | Census-owned: FS1 maps unmodeled effect/aura TYPES; FS0 tracks the bucket |
| ScriptDev / SCRIPT_EFFECT | **FS2 (done):** 17 scripted talent-actives ported (`enrich-talent-actives.mjs` `SCRIPTED` map → `combat.ts` handlers: Holy Shock, Sweeping Strikes, Vampiric Embrace, Lightwell, Demonic Sacrifice, Soul Link, Power Infusion, …) + dispel/spell-reflect (FS4). Remaining player-facing scripted residuals are dead spell families under **Wave M** (Life Tap / Feign Death / hunter traps / charm); never invented. |
| SpellArea product | Helper only (`spell_area` has 5 Classic rows) |
| Level penalty on coeffs | Defaults 1.0 |
| SpellDamageBonusTaken per tick | Done-side + snapshot only |
| Conditions table ETL | Schema/gate ready; no bulk conditions bake yet |

## Modules

| File | Cite |
|------|------|
| `recovery.ts` | SpellMgr.h GetSpellRecoveryTime ~61 |
| `auraStacking.ts` | SpellMgr.h refresh ~222; StackAmount / procCharges |
| `procs.ts` | ProcFlags/Ex; school/family mask; Unit.cpp GetPPMProcChance ~7717; SpellMgr.cpp IsSpellProcEventCanTriggeredBy ~843 |
| `spellBonus.ts` | Unit.cpp SpellBonusWithCoeffs ~6974 |
| `conditions.ts` | Conditions.h ~27–83 |
| `absorbs.ts` | Unit.cpp CalculateDamageAbsorbAndResist ~2349 (69/97/81); SelectMagnetTarget ~6894 (96). **Wired into combat.ts (J-wiring 2026-07-18).** |

### G1 wiring (combat.ts — ✅ J-wiring)

1. Spell retarget: `selectMagnetTarget` before resolve (harmful single-target only) — Grounding Totem name match.
2. After resist roll on original damage, pass **remaining** into absorbs (not pre-resist).
3. `applySchoolAbsorb(victim.schoolAbsorbs, schoolMask, remaining)`.
4. Then `applyManaShield(victim.manaShields, schoolMask, leftover, mana)`.
5. Then `applySplitDamagePct(splitAura, schoolMask, leftover, victimId)` → deal split to linked.
6. Apply leftover to HP; keep `applyShieldBlockAbsorb` (melee block) separate.

## ETL

| Script | Role |
|--------|------|
| `src/dev/etl/enrich-spell-aura.mjs` | Idempotent: categoryRecoveryMs, stackAmount, procCharges, coeffs, dmgClass, spellFamily*, spellProcEvent; item.procs ppm/flags/ex/cd/school/family |
| `src/dev/etl/enrich-binary-resist.mjs` | binary + dmgClass (IsBinarySpell full port) |

## Mission G2 — aura immunities wiring (✅ J-wiring)

1. `Fighter.immunity: ImmunityState` — ✅
2. On damage land: `isImmuneToDamage` compose (template + aura) — ✅ replaces bare `isSchoolImmune`
3. On CC / spell land: `isImmuneToMechanic` / `isImmuneToHarmfulAura` — ✅
4. On immunity aura apply (Divine Shield ids / Banish ids): `applyImmunityAura` + purge — ✅
5. On aura expire: `removeImmunityAura`; Banish cast gate: `isValidBanishTarget` — ✅
6. **CheckTargetCreatureType generalized (2026-07-18)**: `spell_template.TargetCreatureType`
   baked as `SpellDef.targetCreatureTypeMask` (enrich-spell-aura.mjs; 61 spells — Scare Beast,
   Polymorph, Shackle/Turn Undead, Sap, Exorcism/Holy Wrath, Banish, …). Gated whole-spell via
   `passesTargetCreatureType` at cast validation (`canCastSpell` / `chosenPlayerSpell` /
   enemy EventAI `canCast`) + `applySpell` backstop; `BANISH_IDS` mask fallback kept for
   pre-bake fixtures. Skips 2641/23356 per Spell.cpp. — ✅

## J-wiring effect-pack (G4) — ✅

`heal_max_health`, `power_drain`, `power_burn`, `health_leech`, `energize`, `extra_attacks`,
`modify_threat_pct`, `weapon_percent_damage` dispatch in `applySpell` via `effects.ts` resolvers.
