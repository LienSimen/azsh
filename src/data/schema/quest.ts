// ---- Quests ---------------------------------------------------------------

export interface QuestDef {
  entry: number;
  title: string;
  detailsText: string;       // shown when offered
  objectivesText: string;    // shown while active
  // The other two halves of the quest dialog. The ender speaks requestItemsText until the hand-in
  // is payable and offerRewardText at it. Cite: GossipDef.cpp:516/:531 SendQuestGiverRequestItems;
  // GossipDef.cpp:435 SendQuestGiverOfferReward.
  requestItemsText?: string;
  offerRewardText?: string;
  /** quest_template.EndText — the log's own completion line. Cite: QuestHandler.cpp:232, :318. */
  endText?: string;
  questLevel: number;
  minLevel: number;
  killTargets: { creatureEntry: number; count: number; text?: string }[];
  itemTargets: { item: number; count: number; text?: string }[]; // "gather N of item" objectives
  objectTargets: { objectEntry: number; count: number; text?: string }[]; // GameObject / chest / interact objective (from negative ReqCreatureOrGOId)
  // Reverse-loot droppers for itemTargets: creature entries whose loot table can drop a required
  // item, level- and zone-scrubbed. Populated on 1,277 of 3,384 baked quests.
  farm?: number[];
  // ReqSourceId / ReqSourceCount — drop eligibility and intermediate source items. Not a
  // CanCompleteQuest bag check, but FO4 pure-source use-credit still requires presence.
  sourceItemTargets?: { item: number; count: number }[];
  spellCastTargets?: { spell: number; count: number }[]; // ReqSpellCast* — data-only for now
  repObjective?: { faction: number; value: number }; // RepObjectiveFaction + RepObjectiveValue (do not auto-complete; expose only)
  limitTime?: number; // seconds (quest_template.LimitTime). FailQuest when m_timer expires. Cite: Player.cpp:12426–12433 LimitTime * IN_MILLISECONDS; Player.cpp:1432–1450.
  rewMoney: number;          // copper (>0 = reward)
  rewXP: number;             // baked
  rewItems: { item: number; count: number }[];
  // Pick-one reward choices (RewChoiceItemId1..6). Guaranteed rewards stay in rewItems; these are
  // mutually exclusive at turn-in, and absent when no choice slot is non-zero.
  rewChoiceItems?: { item: number; count: number }[];
  rewSpells?: number[];      // spell ids taught on turn-in (class/pet quests — e.g. Tame Beast, Summon Imp)
  // RewSpellCast || RewSpell when that spell teaches nothing: cast AT the player on turn-in, so a
  // buff quest lands its aura. Cite: Player.cpp:12652-12678 RewardQuest caster->CastSpell(this).
  rewSpellCast?: number;
  rewRep?: Array<{ faction: number; value: number }>; // RewRepFaction*/RewRepValue* — reputation granted on turn-in (enrich-reputation.mjs)
  // quest_template.RewMailTemplateId — mail draft sent on RewardQuest. Cite: QuestDef.h RewMailTemplateId;
  // Player.cpp RewardQuest ~12604–12606. Absent until bake; runtime no-ops when missing (QI6).
  rewMailTemplateId?: number;
  /** quest_template.RewMailDelaySecs — delay before mail delivery. */
  rewMailDelaySecs?: number;
  // quest_template.ReputationSpilloverMask — per rewRep index, bit set ⇒ no spillover. Cite: QuestDef.cpp
  // ReputationSpilloverMask; Player.cpp RewardReputation(Quest).
  reputationSpilloverMask?: number;
  // Single-class gate (quest_template.RequiredClasses with exactly one playable bit). Absent ⇒ any class
  // unless `reqClassMask` is set. Cite: Player.cpp SatisfyQuestClass.
  reqClass?: number;
  // Multi-class RequiredClasses mask, for a quest open to several classes but not all (Vile
  // Familiars 792 = 1247 = every non-warlock). A multi-bit mask never collapses to the first bit.
  reqClassMask?: number;
  starterName: string;       // quest giver (creature name)
  enderName: string;         // turn-in (creature name)
  prevQuest?: number;        // prerequisite quest that must be turned in first (chain gate)
  nextQuest?: number;        // chain follow-up
  // Wave D / E2 enrich-quest-xp-fidelity.mjs (optional for pre-E2 bakes)
  /** quest_template.RewMoneyMaxLevel — Quest::XPValue input. */
  rewMoneyMaxLevel?: number;
  maxLevel?: number;
  specialFlags?: number;
  exclusiveGroup?: number;
  exclusiveGroupMembers?: number[];
  requiredSkill?: number;
  requiredSkillValue?: number;
  requiredMinRepFaction?: number;
  requiredMinRepValue?: number;
  requiredMaxRepFaction?: number;
  requiredMaxRepValue?: number;
  srcItem?: { item: number; count: number };
  // Item that starts this quest (item_template.startquest). Accept requires the player already
  // hold it, and the quest giver IS the item — there is no creature_questrelation.
  startedByItem?: number;
  reqRaceMask?: number;
  inactive?: boolean;
  /** GO entry that offers this quest (gameobject_questrelation — P0.3). starterName is the GO name. */
  goStarter?: number;
  /** GO entry that takes the turn-in (gameobject_involvedrelation — P0.3). */
  goEnder?: number;
  // AreaExplored completion links (areatrigger_involvedrelation): entering the trigger's zone
  // completes the objective. A quest with these is exploration-completable whatever specialFlags say.
  exploreTriggers?: Array<{ id: number; zone?: string }>;
  // QI1 raw bake — verbatim quest_template objective arrays, the interpreter's source of truth.
  // The slim killTargets / itemTargets / objectTargets stay until the QI5 cutover.
  rawObjectives?: {
    reqItemId: number[];
    reqItemCount: number[];
    /** Signed: >0 creature entry, <0 = -GO entry. */
    reqCreatureOrGoId: number[];
    reqCreatureOrGoCount: number[];
    reqSourceId: number[];
    reqSourceCount: number[];
    reqSpell: number[];
    /** quest_template.ObjectiveText1-4. Cite: QuestDef.cpp:61-62. */
    objectiveText?: string[];
    repFaction: number;
    repValue: number;
  };
  /** Raw SrcItemId (also mirrored as srcItem when >0). */
  srcItemId?: number;
  srcItemCount?: number;
  srcSpell?: number;
  questFlags?: number;
  method?: number;
  /** Numeric ZoneOrSort from quest_template (extract may keep a canon zone id separately). */
  rawZoneOrSort?: number;
  reqCondition?: number;
  startScript?: number;
  completeScript?: number;
  // All creature_questrelation entries that offer this quest (Run B). First entry also drives starterName
  // when present.
  starterCreatureEntries?: number[];
  /** All creature_involvedrelation turn-in entries (Run B). */
  enderCreatureEntries?: number[];
  /** All gameobject_questrelation entries when multi-GO (goStarter is first). */
  goStarterEntries?: number[];
  goEnderEntries?: number[];
  // ZoneDef.id values where a starter NPC/GO spawns (Run C — same-zone talk/deliver). Cite:
  // docs/archive/QUEST-INTERPRETER.md §3 Run C / §5 same-zone rule.
  starterZones?: string[];
  enderZones?: string[];
  // Raw dbscripts_on_quest_start/end rows for this quest (Run H). Keyed streams also live on
  // DataBundle.dbScripts for the full QI4 work-list.
  rawScripts?: {
    start?: DbScriptRow[];
    end?: DbScriptRow[];
  };
}

/** One dbscripts_on_* row (QI1 Run H) — verbatim command stream for QI4 VM. */
export interface DbScriptRow {
  id: number;
  delay: number;
  command: number;
  datalong: number;
  datalong2: number;
  datalong3?: number;
  buddyEntry?: number;
  searchRadius?: number;
  dataFlags?: number;
  dataint?: number;
  dataint2?: number;
  dataint3?: number;
  dataint4?: number;
  datafloat?: number;
  x?: number;
  y?: number;
  z?: number;
  o?: number;
  conditionId?: number;
  priority?: number;
  comments?: string;
}
