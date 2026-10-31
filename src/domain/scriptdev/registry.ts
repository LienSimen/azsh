// ScriptDev ported-set registry — script name → IR. HARD CONTRACT: census.mjs and next-batch.mjs
// parse this file for quoted names, so every ported script must appear as a string literal key.

import type { ScriptDevIR } from './types.ts';
import { BOSS_ONYXIA, INSTANCE_ONYXIAS_LAIR } from './onyxiasLair.ts';
import {
  BOSS_BARON_GEDDON, BOSS_GARR, BOSS_GEHENNAS, BOSS_GOLEMAGG, BOSS_LUCIFRON,
  BOSS_MAGMADAR, BOSS_MAJORDOMO, BOSS_RAGNAROS, BOSS_SHAZZRAH, BOSS_SULFURON,
  GO_MOLTEN_CORE_RUNE, INSTANCE_MOLTEN_CORE, MOB_CORE_RAGER, MOB_FIRESWORN,
  MOB_FLAMEWAKER_PRIEST,
} from './moltenCore.ts';
import {
  AT_VAELASTRASZ, BOSS_BROODLORD, BOSS_CHROMAGGUS, BOSS_EBONROC, BOSS_FIREMAW,
  BOSS_FLAMEGOR, BOSS_NEFARIAN, BOSS_RAZORGORE, BOSS_VAELASTRASZ, BOSS_VICTOR_NEFARIUS,
  EVENT_RAZORGORE_POSSESS, EVENT_WEEKLY_CHROMATIC_SELECTION, GO_SUPPRESSION,
  INSTANCE_BLACKWING_LAIR, NPC_BLACKWING_ORB,
} from './blackwingLair.ts';
import {
  BOSS_AYAMISS, BOSS_BURU, BOSS_KURINNAXX, BOSS_MOAM, BOSS_OSSIRIAN,
  GO_OSSIRIAN_CRYSTAL_SCRIPT, INSTANCE_RUINS_OF_AHNQIRAJ, MOB_ANUBISATH_GUARDIAN,
  NPC_BURU_EGG, NPC_GENERAL_ANDOROV, NPC_HIVE_ZARA_LARVA, NPC_KALDOREI_ELITE,
} from './ruinsOfAhnqiraj.ts';
import {
  AT_STOMACH_CTHUN, AT_TEMPLE_AHNQIRAJ, BOSS_CTHUN, BOSS_EYE_OF_CTHUN, BOSS_FANKRISS,
  BOSS_HUHURAN, BOSS_KRI, BOSS_OURO, BOSS_SARTURA, BOSS_SKERAM, BOSS_VEKLOR,
  BOSS_VEKNILASH, BOSS_VEM, BOSS_VISCIDUS, BOSS_YAUJ, EVENT_CTHUN_RESET,
  INSTANCE_TEMPLE_OF_AHNQIRAJ, MOB_ANUBISATH_DEFENDER, MOB_ANUBISATH_SENTINEL,
  MOB_GIANT_CLAW_TENTACLE, NPC_GLOB_OF_VISCIDUS, NPC_OURO_MOUND, NPC_OURO_SCARAB,
  NPC_OURO_SPAWNER, NPC_OURO_TRIGGER,
} from './templeOfAhnqiraj.ts';
import {
  AT_ZULGURUB, BOSS_ARLOKK, BOSS_HAKKAR, BOSS_JEKLIK, BOSS_MANDOKIR, BOSS_MARLI,
  BOSS_RENATAKI, BOSS_THEKAL, BOSS_VENOXIS, GO_GONG_OF_BETHEKK, MOB_OHGAN,
  MOB_ZEALOT_LORKHAN, MOB_ZEALOT_ZATH, NPC_GURUBASHI_BAT_RIDER, NPC_SOULFLAYER,
  NPC_ZULIAN_PROWLER,
} from './zulgurub.ts';
import {
  BOSS_FEUGEN, BOSS_GLUTH, BOSS_GROBBULUS, BOSS_PATCHWERK, BOSS_STALAGG, BOSS_THADDIUS,
} from './naxxramasConstruct.ts';
import { BOSS_FOUR_HORSEMEN, BOSS_GOTHIK, BOSS_RAZUVIOUS } from './naxxramasMilitary.ts';
import {
  AT_NAXXRAMAS, BOSS_ANUBREKHAN, BOSS_FAERLINA, BOSS_HEIGAN, BOSS_LOATHEB, BOSS_MAEXXNA,
  BOSS_NOTH, EVENT_NAXXRAMAS, GO_ANUB_DOOR, NPC_DISEASED_MAGGOT, NPC_INVISIBLE_MAN,
  NPC_LIVING_POISON, NPC_STONESKIN_GARGOYLE, NPC_WEB_WRAP,
} from './naxxramas.ts';
import {
  BOSS_KELTHUZAD, BOSS_SAPPHIRON, GO_SAPPHIRON_BIRTH, NPC_ICECROWN_GUARDIAN,
} from './naxxramasFrostwyrm.ts';
import { INSTANCE_NAXXRAMAS, INSTANCE_ZULGURUB } from './instanceRaids.ts';
import {
  castPlanFromScriptDev,
  registerAuraScriptsFromIr,
  type ScriptDevCastPlan,
} from './host.ts';
import {
  BOSS_BARONESS_ANASTARI,
  BOSS_CANNON_MASTER_WILLEY,
  BOSS_DATHROHAN_BALNAZZAR,
  BOSS_MALEKI_THE_PALLID,
  INSTANCE_STRATHOLME,
} from './stratholme.ts';
import {
  GO_GAUNTLET_GATE,
  GO_SERVICE_GATE,
  GO_STRATHOLME_POSTBOX,
  MOB_RESTLESS_SOUL,
  MOBS_SPECTRAL_GHOSTLY_CITIZEN,
  NPC_AURIUS_SCRIPT,
} from './stratholmeScripts.ts';
import {
  GO_FATHOM_STONE,
  GO_FIRE_OF_AKUMAI,
  INSTANCE_BLACKFATHOM_DEEPS,
} from './blackfathomDeeps.ts';
import { ITEM_ASHBRINGER } from './itemScripts.ts';
import {
  AT_SHADE_OF_ERANIKUS,
  EVENT_ANTALARION_STATUE_ACTIVATION,
  EVENT_AVATAR_OF_HAKKAR,
  GO_ETERNAL_FLAME,
  INSTANCE_SUNKEN_TEMPLE,
  NPC_MALFURION_STORMRAGE,
} from './sunkenTemple.ts';
import {
  BOSS_ARCHAEDAS,
  EVENT_SPELL_ALTAR_BOSS_AGGRO,
  INSTANCE_ULDAMAN,
} from './uldaman.ts';
import {
  EVENT_SPELLS_WARLOCK_DREADSTEED,
  GO_DREADSTEED_QUEST_OBJECTS,
  GO_FIXED_TRAP_SCRIPT,
  INSTANCE_DIRE_MAUL,
  NPC_WARLOCK_MOUNT_RITUAL,
} from './direMaul.ts';
import {
  BOSS_AZUREGOS,
  BOSS_EMERISS,
  BOSS_KAZZAK,
  BOSS_LETHON,
  BOSS_TAERAR,
  BOSS_YSONDRE,
  NPC_SPIRIT_SHADE_SCRIPT,
} from './worldBosses.ts';
import {
  BOSS_ARUGAL, INSTANCE_SHADOWFANG_KEEP, MOB_ARUGAL_VOIDWALKER,
  NPC_DEATHSTALKER_VINCENT, NPC_SHADOWFANG_PRISONER,
} from './shadowfangKeep.ts';
import { NPC_GRARK_LORKRUB, NPC_KLINFRAN_SCRIPT } from './burningSteppes.ts';
import { NPC_ERIS_HAVENFIRE } from './easternPlaguelands.ts';
import { NPC_GALEN_GOODWARD } from './swampOfSorrows.ts';
import { NPC_SOLENOR_SCRIPT } from './silithus.ts';
import {
  BOSS_NOXXION,
  GO_LARVA_SPEWER_SCRIPT,
  INSTANCE_MARAUDON,
} from './maraudon.ts';
import {
  EVENT_GO_TUTENKASH_GONG,
  INSTANCE_RAZORFEN_DOWNS,
  NPC_BELNISTRASZ,
} from './razorfenDowns.ts';
import {
  INSTANCE_RAZORFEN_KRAUL,
  NPC_SNUFFLENOSE_GOPHER_SCRIPT,
  NPC_WILLIX_THE_IMPORTER,
} from './razorfenKraul.ts';
import {
  INSTANCE_WAILING_CAVERNS,
  NPC_DISCIPLE_OF_NARALEX,
} from './wailingCaverns.ts';
import {
  BOSS_MR_SMITE,
  GO_DEFIAS_CANNON_SCRIPT,
  INSTANCE_DEADMINES,
} from './deadmines.ts';
import {
  BOSS_THERMAPLUGG,
  GO_GNOMEFACE_BUTTON,
  INSTANCE_GNOMEREGAN,
  NPC_BLASTMASTER_EMI_SHORTFUSE,
  NPC_KERNOBEE_SCRIPT,
} from './gnomeregan.ts';
import {
  AT_ZULFARRAK,
  BOSS_ZUMRAH,
  EVENT_GO_ZULFARRAK_GONG,
  EVENT_SPELL_UNLOCKING,
  INSTANCE_ZULFARRAK,
} from './zulfarrak.ts';
import {
  AT_BLACKROCK_SPIRE,
  BOSS_GYTH,
  BOSS_OVERLORD_WYRMTHALAK,
  BOSS_PYROGUARD_EMBERSEER,
  EVENT_SPELL_ALTAR_EMBERSEER,
  GO_FATHER_FLAME_SCRIPT,
  INSTANCE_BLACKROCK_SPIRE,
  NPC_ROOKERY_HATCHER_SCRIPT,
} from './blackrockSpire.ts';
import {
  AT_CATHEDRAL_ENTRANCE,
  BOSS_ARCANIST_DOAN,
  BOSS_HEROD,
  BOSS_HIGH_INQUISITOR_WHITEMANE,
  BOSS_SCARLET_COMMANDER_MOGRAINE,
  INSTANCE_SCARLET_MONASTERY,
  MOB_SCARLET_TRAINEE,
} from './scarletMonastery.ts';
import {
  BOSS_DARKMASTER_GANDLING,
  BOSS_JANDICE_BAROV,
  EVENT_DAWN_GAMBIT,
  EVENT_SPELL_GANDLING_SHADOW_PORTAL,
  INSTANCE_SCHOLOMANCE,
  NPC_SPECTRAL_TUTOR_SCRIPT,
} from './scholomance.ts';
import {
  AT_RING_OF_LAW,
  AT_SHADOWFORGE_BRIDGE,
  BOSS_AMBASSADOR_FLAMELASH,
  BOSS_DOOMREL,
  BOSS_EMPEROR_DAGRAN_THAURISSAN,
  BOSS_GENERAL_ANGERFORGE,
  BOSS_HIGH_INTERROGATOR_GERSTAHN,
  BOSS_MOIRA_BRONZEBEARD,
  BOSS_PLUGGER_SPAZZRING,
  GO_BAR_ALE_MUG,
  GO_BAR_BEER_KEG,
  GO_RELIC_COFFER_DOOR_SCRIPT,
  GO_SHADOWFORGE_BRAZIER_SCRIPT,
  INSTANCE_BLACKROCK_DEPTHS,
  NPC_DUGHAL_STORMWING_SCRIPT,
  NPC_GRIMSTONE_SCRIPT,
  NPC_HURLEY_BLACKBREATH_SCRIPT,
  NPC_IRONHAND_GUARDIAN_SCRIPT,
  NPC_MARSHAL_WINDSOR_SCRIPT,
  NPC_MISTRESS_NAGMARA_SCRIPT,
  NPC_PHALANX_SCRIPT,
  NPC_ROCKNOT_SCRIPT,
  NPC_TOBIAS_SEECHER_SCRIPT,
} from './blackrockDepths.ts';
import {
  NPC_KINELORY_SCRIPT,
  NPC_PROFESSOR_PHIZZLETHORPE_SCRIPT,
} from './arathiHighlands.ts';
import {
  EVENT_WILDHAMMER_MESSAGE,
  NPC_00X09HL_SCRIPT,
  NPC_RINJI_SCRIPT,
} from './hinterlands.ts';
import { NPC_MIRAN_SCRIPT } from './lochModan.ts';
import { NPC_CORPORAL_KEESHAN_SCRIPT } from './redridgeMountains.ts';
import { NPC_DORIUS_STONETENDER_SCRIPT } from './searingGorge.ts';
import {
  NPC_DEATHSTALKER_ERLAND_SCRIPT,
  NPC_DEATHSTALKER_FAERLEIA_SCRIPT,
} from './silverpineForest.ts';
import {
  NPC_BARTLEBY_SCRIPT,
  NPC_DASHEL_STONEFIST_SCRIPT,
  NPC_FIELD_MARSHAL_AFRASIABI_SCRIPT,
  NPC_LADY_KATRANA_PRESTOR_SCRIPT,
  NPC_MAJOR_MATTINGLY_SCRIPT,
  NPC_REGINALD_WINDSOR_SCRIPT,
  NPC_SQUIRE_ROWE_SCRIPT,
} from './stormwindCity.ts';
import {
  MOB_COLONEL_KURZEN,
  MOB_YENNIKU,
} from './stranglethornVale.ts';
import {
  GO_MAUSOLEUM_DOOR,
  GO_MAUSOLEUM_TRIGGER,
  NPC_CALVIN_MONTAGUE_SCRIPT,
} from './tirisfalGlades.ts';
import {
  NPC_ISILLIEN_SCRIPT,
  NPC_TAELAN_FORDRING_SCRIPT,
  NPC_THE_SCOURGE_CAULDRON_SCRIPT,
  NPC_TIRION_FORDRING_SCRIPT,
} from './westernPlaguelands.ts';
import {
  NPC_DAPHNE_STILWELL_SCRIPT,
  NPC_DEFIAS_TRAITOR_SCRIPT,
  NPC_FOREMAN_KLAVEN_MORTWAKE_SCRIPT,
} from './westfall.ts';
import {
  GO_FLAGONGUT_FOSSIL_SCRIPT,
  NPC_MIKHAIL_SCRIPT,
  NPC_TAPOKE_SLIM_JAHN_SCRIPT,
} from './wetlands.ts';
import {
  GO_NAGA_BRAZIER_SCRIPT,
  NPC_FEERO_IRONHAND_SCRIPT,
  NPC_MUGLASH_SCRIPT,
  NPC_RUUL_SNOWHOOF_SCRIPT,
  NPC_TOREK_SCRIPT,
} from './ashenvale.ts';
import {
  BOSS_MAWS,
  EVENT_ARCANITE_BUOY,
  GO_LIGHTNING,
  MOBS_SPITELASHES,
  NPC_FELHOUND_TRACKER_SCRIPT,
} from './azshara.ts';
import {
  EVENT_PURIFY_FOOD,
  GO_FURBOLG_FOOD_SCRIPT,
  NPC_BLACKWOOD_TOTEMIC_SCRIPT,
  NPC_BLACKWOOD_WARRIOR_SCRIPT,
  NPC_KERLONIAN_SCRIPT,
  NPC_PROSPECTOR_REMTRAVEL_SCRIPT,
  NPC_RABID_BEAR_SCRIPT,
  NPC_THERYLUNE_SCRIPT,
  NPC_THRESHWACKONATOR_SCRIPT,
  NPC_VOLCOR_SCRIPT,
} from './darkshore.ts';
import {
  NPC_AGED_DYING_ANCIENT_KODO_SCRIPT,
  NPC_CORK_GIZELTON_SCRIPT,
  NPC_DALINDA_MALEM_SCRIPT,
  NPC_MAGRAMI_SPECTRE_SCRIPT,
  NPC_MELIZZA_BRIMBUZZLE_SCRIPT,
  NPC_RIGGER_GIZELTON_SCRIPT,
} from './desolace.ts';
import { NPC_LAZY_PEON_SCRIPT } from './durotar.ts';
import {
  AT_SENTRY_POINT,
  NPC_MOROKK_SCRIPT,
  NPC_OGRON_SCRIPT,
  NPC_PRIVATE_HENDEL_SCRIPT,
  NPC_STINKY_IGNATZ_SCRIPT,
  NPC_THERAMORE_SPAR_CONTROLLER_SCRIPT,
} from './dustwallowMarsh.ts';
import {
  NPC_AREI_SCRIPT,
  NPC_CAPTURED_ARKONARIN_SCRIPT,
  NPC_CORRUPT_SABER_SCRIPT,
  NPC_KITTEN_SCRIPT,
} from './felwood.ts';
import {
  GO_CAGE_DOOR_SCRIPT,
  NPC_CAPTURED_SPRITE_DARTER_SCRIPT,
  NPC_KINDAL_MOONWEAVER_SCRIPT,
  NPC_OOX22FE_SCRIPT,
  NPC_SHAY_LEAFRUNNER_SCRIPT,
} from './feralas.ts';
import {
  BOSS_ERANIKUS,
  GO_OMEN_CLUSTER_SCRIPT,
  NPC_KEEPER_REMULOS_SCRIPT,
} from './moonglade.ts';
import {
  NPC_HIGH_OVERLORD_SAURFANG_SCRIPT,
  NPC_OVERLORD_RUNTHALAK_SCRIPT,
} from './orgrimmar.ts';
import {
  GO_COVERT_OPS_SCRIPT,
  NPC_KAYA_SCRIPT,
} from './stonetalonMountains.ts';
import {
  MOB_AQUEMENTAS,
  NPC_OOX17TN_SCRIPT,
  NPC_TOOGA_SCRIPT,
} from './tanaris.ts';
import { NPC_MIST_SCRIPT } from './teldrassil.ts';
import {
  AT_TWIGGY_FLATHEAD,
  NPC_FOREMAN_SILIXIZ_SCRIPT,
  NPC_GALLYWIX_SCRIPT,
  NPC_GILTHARES_SCRIPT,
  NPC_REGTHAR_DEATHGATE_SCRIPT,
  NPC_TASKMASTER_FIZZULE_SCRIPT,
  NPC_TWIGGY_FLATHEAD_SCRIPT,
  NPC_VENTURE_CO_LOOKOUT_SCRIPT,
  NPC_WIZZLECRANKS_SHREDDER_SCRIPT,
} from './theBarrens.ts';
import {
  NPC_KANATI_SCRIPT,
  NPC_LAKOTA_WINDSONG_SCRIPT,
  NPC_PAOKA_SWIFTMOUNTAIN_SCRIPT,
  NPC_PLUCKY_JOHNSON_SCRIPT,
} from './thousandNeedles.ts';
import {
  NPC_AME01_SCRIPT,
  NPC_PRECIOUS_THE_DEVOURER_SCRIPT,
  NPC_RINGO_SCRIPT,
  NPC_SIMONE_SEDUCTRESS_SCRIPT,
  NPC_SIMONE_THE_INCONSPICUOUS_SCRIPT,
} from './ungoroCrater.ts';
import {
  GO_ELUNE_FIRE_SCRIPT,
  NPC_ARTORIUS_SCRIPT,
  NPC_RANSHALLA_SCRIPT,
} from './winterspring.ts';
import {
  GUARD_BLUFFWATCHER,
  GUARD_CONTESTED,
  GUARD_DARNASSUS,
  GUARD_DUNMOROGH,
  GUARD_DUROTAR,
  GUARD_ELWYNNFOREST,
  GUARD_IRONFORGE,
  GUARD_MULGORE,
  GUARD_ORGRIMMAR,
  GUARD_STORMWIND,
  GUARD_TELDRASSIL,
  GUARD_TIRISFAL,
  GUARD_UNDERCITY,
} from './guards.ts';
import {
  GO_SOOTHSAYING_FOR_DUMMIES_SCRIPT,
  NPC_PROF_BLACKSMITH,
  NPC_PROF_LEATHER,
} from './npcProfessions.ts';
import {
  NPC_ADVANCED_TARGET_DUMMY_SCRIPT,
  NPC_AOE_DAMAGE_TRIGGER,
  NPC_CHICKEN_CLUCK,
  NPC_DOCTOR,
  NPC_GARMENTS_OF_QUESTS,
  NPC_GUARDIAN,
  NPC_INJURED_PATIENT,
  NPC_INNKEEPER,
  NPC_REDEMPTION_TARGET,
  NPC_THE_CLEANER_SCRIPT,
} from './npcsSpecial.ts';
import {
  GO_SCARAB_GONG_SCRIPT,
  NPC_SILITHUS_BOSS,
  NPC_WAR_EFFORT,
} from './warEffort.ts';
// Helpers split from zone IR (file-size). Imported so assert-reachable sees a live twin.
import * as feralasHelpers from './feralasHelpers.ts';
import * as ungoroCraterHelpers from './ungoroCraterHelpers.ts';
import * as winterspringHelpers from './winterspringHelpers.ts';
import * as tanarisHelpers from './tanarisHelpers.ts';
void feralasHelpers;
void ungoroCraterHelpers;
void winterspringHelpers;
void tanarisHelpers;

/** Literal quoted script names → IR. Census truth: every key below counts as ported. */
export const SCRIPTDEV_REGISTRY: Readonly<Record<string, ScriptDevIR>> = {
  // RAIDS (docs/archive/raids/PLAN.md §5) — kalimdor/onyxias_lair
  'boss_onyxia': BOSS_ONYXIA,
  'instance_onyxias_lair': INSTANCE_ONYXIAS_LAIR,
  // eastern_kingdoms/molten_core — 10 encounters + the encounter-critical adds
  'boss_lucifron': BOSS_LUCIFRON,
  'boss_magmadar': BOSS_MAGMADAR,
  'boss_gehennas': BOSS_GEHENNAS,
  'boss_garr': BOSS_GARR,
  'mob_firesworn': MOB_FIRESWORN,
  'boss_shazzrah': BOSS_SHAZZRAH,
  'boss_baron_geddon': BOSS_BARON_GEDDON,
  'boss_golemagg': BOSS_GOLEMAGG,
  'mob_core_rager': MOB_CORE_RAGER,
  'boss_sulfuron': BOSS_SULFURON,
  'mob_flamewaker_priest': MOB_FLAMEWAKER_PRIEST,
  'boss_majordomo': BOSS_MAJORDOMO,
  'boss_ragnaros': BOSS_RAGNAROS,
  'go_molten_core_rune': GO_MOLTEN_CORE_RUNE,
  'instance_molten_core': INSTANCE_MOLTEN_CORE,
  // eastern_kingdoms/blackwing_lair
  'boss_razorgore': BOSS_RAZORGORE,
  'boss_vaelastrasz': BOSS_VAELASTRASZ,
  'boss_broodlord': BOSS_BROODLORD,
  'boss_firemaw': BOSS_FIREMAW,
  'boss_ebonroc': BOSS_EBONROC,
  'boss_flamegor': BOSS_FLAMEGOR,
  'boss_chromaggus': BOSS_CHROMAGGUS,
  'boss_nefarian': BOSS_NEFARIAN,
  'boss_victor_nefarius': BOSS_VICTOR_NEFARIUS,
  'go_suppression': GO_SUPPRESSION,
  'event_weekly_chromatic_selection': EVENT_WEEKLY_CHROMATIC_SELECTION,
  'npc_blackwing_orb': NPC_BLACKWING_ORB,
  'event_razorgore_possess': EVENT_RAZORGORE_POSSESS,
  'at_vaelastrasz': AT_VAELASTRASZ,
  'instance_blackwing_lair': INSTANCE_BLACKWING_LAIR,
  // kalimdor/ruins_of_ahnqiraj (Rajaxx is a named GAP — his fight is seven army waves)
  'boss_kurinnaxx': BOSS_KURINNAXX,
  'boss_moam': BOSS_MOAM,
  'boss_buru': BOSS_BURU,
  'boss_ayamiss': BOSS_AYAMISS,
  'boss_ossirian': BOSS_OSSIRIAN,
  'npc_hive_zara_larva': NPC_HIVE_ZARA_LARVA,
  'npc_buru_egg': NPC_BURU_EGG,
  'go_ossirian_crystal': GO_OSSIRIAN_CRYSTAL_SCRIPT,
  'npc_general_andorov': NPC_GENERAL_ANDOROV,
  'npc_kaldorei_elite': NPC_KALDOREI_ELITE,
  'mob_anubisath_guardian': MOB_ANUBISATH_GUARDIAN,
  'instance_ruins_of_ahnqiraj': INSTANCE_RUINS_OF_AHNQIRAJ,
  // kalimdor/temple_of_ahnqiraj — 4 of 9; the other five need engine verbs (module header)
  'boss_skeram': BOSS_SKERAM,
  'boss_sartura': BOSS_SARTURA,
  'boss_fankriss': BOSS_FANKRISS,
  'boss_huhuran': BOSS_HUHURAN,
  'boss_kri': BOSS_KRI,
  'boss_vem': BOSS_VEM,
  'boss_yauj': BOSS_YAUJ,
  'boss_veknilash': BOSS_VEKNILASH,
  'boss_veklor': BOSS_VEKLOR,
  'boss_viscidus': BOSS_VISCIDUS,
  'boss_eye_of_cthun': BOSS_EYE_OF_CTHUN,
  'boss_cthun': BOSS_CTHUN,
  'mob_giant_claw_tentacle': MOB_GIANT_CLAW_TENTACLE,
  'at_stomach_cthun': AT_STOMACH_CTHUN,
  'boss_ouro': BOSS_OURO,
  'npc_ouro_spawner': NPC_OURO_SPAWNER,
  'npc_ouro_mound': NPC_OURO_MOUND,
  'npc_ouro_trigger': NPC_OURO_TRIGGER,
  'npc_ouro_scarab': NPC_OURO_SCARAB,
  // Not a C++ ScriptName: the glob's behaviour is Viscidus's summon hooks plus the ViscidusShrinks
  // SpellScript, and this IR is where the 5 %-per-glob half of the shatter lives.
  'npc_glob_of_viscidus': NPC_GLOB_OF_VISCIDUS,
  'mob_anubisath_sentinel': MOB_ANUBISATH_SENTINEL,
  'mob_anubisath_defender': MOB_ANUBISATH_DEFENDER,
  'at_temple_ahnqiraj': AT_TEMPLE_AHNQIRAJ,
  'event_cthun_reset': EVENT_CTHUN_RESET,
  'instance_temple_of_ahnqiraj': INSTANCE_TEMPLE_OF_AHNQIRAJ,
  // eastern_kingdoms/zulgurub — whole kits (module header). Jin'do / Gahz'ranka not registered.
  'boss_venoxis': BOSS_VENOXIS,
  'boss_jeklik': BOSS_JEKLIK,
  'boss_arlokk': BOSS_ARLOKK,
  'boss_thekal': BOSS_THEKAL,
  'boss_marli': BOSS_MARLI,
  'boss_mandokir': BOSS_MANDOKIR,
  'boss_hakkar': BOSS_HAKKAR,
  'boss_renataki': BOSS_RENATAKI,
  'npc_soulflayer': NPC_SOULFLAYER,
  'npc_zulian_prowler': NPC_ZULIAN_PROWLER,
  'go_gong_of_bethekk': GO_GONG_OF_BETHEKK,
  'npc_gurubashi_bat_rider': NPC_GURUBASHI_BAT_RIDER,
  'mob_ohgan': MOB_OHGAN,
  'mob_zealot_lorkhan': MOB_ZEALOT_LORKHAN,
  'mob_zealot_zath': MOB_ZEALOT_ZATH,
  'at_zulgurub': AT_ZULGURUB,
  // Naxxramas Construct quarter. An IR REPLACES the baked list rather than double-arming it —
  // createSession.ts:525 skips the merge when an IR returns cast entries. Each transcribes its list.
  'boss_patchwerk': BOSS_PATCHWERK,
  'boss_grobbulus': BOSS_GROBBULUS,
  'boss_gluth': BOSS_GLUTH,
  'boss_thaddius': BOSS_THADDIUS,
  'boss_stalagg': BOSS_STALAGG,
  'boss_feugen': BOSS_FEUGEN,
  // Military quarter. The Four Horsemen are ONE encounter across four creatures, so all four keys
  // share one IR; naxxramas.cpp:527-541 only writes DONE at 4, so onDeath is deliberately unwired.
  'boss_razuvious': BOSS_RAZUVIOUS,
  'boss_gothik': BOSS_GOTHIK,
  'boss_lady_blaumeux': BOSS_FOUR_HORSEMEN,
  'boss_alexandros_mograine': BOSS_FOUR_HORSEMEN,
  'boss_thane_korthazz': BOSS_FOUR_HORSEMEN,
  'boss_sir_zeliek': BOSS_FOUR_HORSEMEN,
  // Frostwyrm Lair. Sapphiron owns all his timers because his fight IS a list swap; Kel'Thuzad is
  // the hybrid — `timers: []` so his baked list still arms while phases and summonWaves run.
  'boss_anubrekhan': BOSS_ANUBREKHAN,
  'go_anub_door': GO_ANUB_DOOR,
  'boss_faerlina': BOSS_FAERLINA,
  'boss_maexxna': BOSS_MAEXXNA,
  'npc_web_wrap': NPC_WEB_WRAP,
  'npc_invible_man': NPC_INVISIBLE_MAN,
  'boss_noth': BOSS_NOTH,
  'boss_heigan': BOSS_HEIGAN,
  'npc_diseased_maggot': NPC_DISEASED_MAGGOT,
  'boss_loatheb': BOSS_LOATHEB,
  'boss_sapphiron': BOSS_SAPPHIRON,
  'go_sapphiron_birth': GO_SAPPHIRON_BIRTH,
  'boss_kelthuzad': BOSS_KELTHUZAD,
  'npc_icecrown_guardian': NPC_ICECROWN_GUARDIAN,
  // Instance SetData tables (ZG fights are IRs above; Naxx Construct/Military/etc. too).
  'instance_zulgurub': INSTANCE_ZULGURUB,
  'instance_naxxramas': INSTANCE_NAXXRAMAS,
  'npc_stoneskin_gargoyle': NPC_STONESKIN_GARGOYLE,
  'npc_living_poison': NPC_LIVING_POISON,
  'at_naxxramas': AT_NAXXRAMAS,
  'event_naxxramas': EVENT_NAXXRAMAS,
  'boss_baroness_anastari': BOSS_BARONESS_ANASTARI,
  'boss_maleki_the_pallid': BOSS_MALEKI_THE_PALLID,
  'boss_dathrohan_balnazzar': BOSS_DATHROHAN_BALNAZZAR,
  'boss_cannon_master_willey': BOSS_CANNON_MASTER_WILLEY,
  'instance_stratholme': INSTANCE_STRATHOLME,
  // SESSION 10: eastern_kingdoms/stratholme/stratholmeScripts.cpp
  'go_service_gate': GO_SERVICE_GATE,
  'go_gauntlet_gate': GO_GAUNTLET_GATE,
  'go_stratholme_postbox': GO_STRATHOLME_POSTBOX,
  'mob_restless_soul': MOB_RESTLESS_SOUL,
  'mobs_spectral_ghostly_citizen': MOBS_SPECTRAL_GHOSTLY_CITIZEN,
  'npc_aurius': NPC_AURIUS_SCRIPT,
  // SESSION 10: kalimdor/blackfathom_deeps/instance_blackfathom_deeps.cpp
  'instance_blackfathom_deeps': INSTANCE_BLACKFATHOM_DEEPS,
  'go_fire_of_akumai': GO_FIRE_OF_AKUMAI,
  'go_fathom_stone': GO_FATHOM_STONE,
  // SESSION 10: eastern_kingdoms/sunken_temple/sunken_temple.cpp + sunken_templeScripts.cpp
  'instance_sunken_temple': INSTANCE_SUNKEN_TEMPLE,
  'at_shade_of_eranikus': AT_SHADE_OF_ERANIKUS,
  'npc_malfurion_stormrage': NPC_MALFURION_STORMRAGE,
  'event_antalarion_statue_activation': EVENT_ANTALARION_STATUE_ACTIVATION,
  'event_avatar_of_hakkar': EVENT_AVATAR_OF_HAKKAR,
  'go_eternal_flame': GO_ETERNAL_FLAME,
  // SESSION 10: eastern_kingdoms/uldaman/boss_archaedas.cpp + instance_uldaman.cpp
  'boss_archaedas': BOSS_ARCHAEDAS,
  'instance_uldaman': INSTANCE_ULDAMAN,
  'event_spell_altar_boss_aggro': EVENT_SPELL_ALTAR_BOSS_AGGRO,
  // SESSION 10: kalimdor/dire_maul/dire_maul.cpp + instance_dire_maul.cpp
  'event_spells_warlock_dreadsteed': EVENT_SPELLS_WARLOCK_DREADSTEED,
  'npc_warlock_mount_ritual': NPC_WARLOCK_MOUNT_RITUAL,
  'go_dreadsteed_quest_objects': GO_DREADSTEED_QUEST_OBJECTS,
  'instance_dire_maul': INSTANCE_DIRE_MAUL,
  'go_fixed_trap': GO_FIXED_TRAP_SCRIPT,
  // Wave T / SESSION 18: outdoor world bosses
  'item_ashbringer': ITEM_ASHBRINGER,
  'boss_kazzak': BOSS_KAZZAK,
  'boss_azuregos': BOSS_AZUREGOS,
  'boss_emeriss': BOSS_EMERISS,
  'boss_lethon': BOSS_LETHON,
  'npc_spirit_shade': NPC_SPIRIT_SHADE_SCRIPT,
  'boss_taerar': BOSS_TAERAR,
  'boss_ysondre': BOSS_YSONDRE,
  // SESSION 10: kalimdor/maraudon/boss_noxxion.cpp + instance_maraudon.cpp
  'boss_noxxion': BOSS_NOXXION,
  'instance_maraudon': INSTANCE_MARAUDON,
  'go_larva_spewer': GO_LARVA_SPEWER_SCRIPT,
  // SESSION 10: kalimdor/razorfen_downs/instance_razorfen_downs.cpp + razorfen_downs.cpp
  'instance_razorfen_downs': INSTANCE_RAZORFEN_DOWNS,
  'event_go_tutenkash_gong': EVENT_GO_TUTENKASH_GONG,
  'npc_belnistrasz': NPC_BELNISTRASZ,
  // SESSION 10: kalimdor/razorfen_kraul/instance_razorfen_kraul.cpp + razorfen_kraul.cpp
  'instance_razorfen_kraul': INSTANCE_RAZORFEN_KRAUL,
  'npc_willix_the_importer': NPC_WILLIX_THE_IMPORTER,
  'npc_snufflenose_gopher': NPC_SNUFFLENOSE_GOPHER_SCRIPT,
  // SESSION 10: kalimdor/wailing_caverns/wailing_caverns.cpp + wailing_cavernsScripts.cpp
  'instance_wailing_caverns': INSTANCE_WAILING_CAVERNS,
  'npc_disciple_of_naralex': NPC_DISCIPLE_OF_NARALEX,
  // SESSION 10: eastern_kingdoms/deadmines/boss_mr_smite.cpp + deadmines.cpp + instance_deadmines.cpp
  'boss_mr_smite': BOSS_MR_SMITE,
  'go_defias_cannon': GO_DEFIAS_CANNON_SCRIPT,
  'instance_deadmines': INSTANCE_DEADMINES,
  'instance_shadowfang_keep': INSTANCE_SHADOWFANG_KEEP,
  'npc_shadowfang_prisoner': NPC_SHADOWFANG_PRISONER,
  'mob_arugal_voidwalker': MOB_ARUGAL_VOIDWALKER,
  'boss_arugal': BOSS_ARUGAL,
  'npc_deathstalker_vincent': NPC_DEATHSTALKER_VINCENT,
  'npc_grark_lorkrub': NPC_GRARK_LORKRUB,
  'npc_klinfran': NPC_KLINFRAN_SCRIPT,
  'npc_eris_havenfire': NPC_ERIS_HAVENFIRE,
  'npc_galen_goodward': NPC_GALEN_GOODWARD,
  'npc_solenor': NPC_SOLENOR_SCRIPT,
  // SESSION 10: eastern_kingdoms/gnomeregan/boss_thermaplugg.cpp + gnomeregan.cpp + instance_gnomeregan.cpp
  'boss_thermaplugg': BOSS_THERMAPLUGG,
  'go_gnomeface_button': GO_GNOMEFACE_BUTTON,
  'npc_blastmaster_emi_shortfuse': NPC_BLASTMASTER_EMI_SHORTFUSE,
  'npc_kernobee': NPC_KERNOBEE_SCRIPT,
  'instance_gnomeregan': INSTANCE_GNOMEREGAN,
  // SESSION 10: kalimdor/zulfarrak/boss_zumrah.cpp + zulfarrak.cpp + instance_zulfarrak.cpp
  'boss_zumrah': BOSS_ZUMRAH,
  'instance_zulfarrak': INSTANCE_ZULFARRAK,
  'event_go_zulfarrak_gong': EVENT_GO_ZULFARRAK_GONG,
  'event_spell_unlocking': EVENT_SPELL_UNLOCKING,
  'at_zulfarrak': AT_ZULFARRAK,
  // SESSION 10: eastern_kingdoms/blackrock_spire/* (Gyth, Wyrmthalak, Emberseer, instance)
  'boss_gyth': BOSS_GYTH,
  'boss_overlord_wyrmthalak': BOSS_OVERLORD_WYRMTHALAK,
  'boss_pyroguard_emberseer': BOSS_PYROGUARD_EMBERSEER,
  'instance_blackrock_spire': INSTANCE_BLACKROCK_SPIRE,
  'at_blackrock_spire': AT_BLACKROCK_SPIRE,
  'event_spell_altar_emberseer': EVENT_SPELL_ALTAR_EMBERSEER,
  'go_father_flame': GO_FATHER_FLAME_SCRIPT,
  'npc_rookery_hatcher': NPC_ROOKERY_HATCHER_SCRIPT,
  // SESSION 10: eastern_kingdoms/scarlet_monastery/* (Doan, Herod, Mograine/Whitemane, instance)
  'boss_arcanist_doan': BOSS_ARCANIST_DOAN,
  'boss_herod': BOSS_HEROD,
  'mob_scarlet_trainee': MOB_SCARLET_TRAINEE,
  'boss_scarlet_commander_mograine': BOSS_SCARLET_COMMANDER_MOGRAINE,
  'boss_high_inquisitor_whitemane': BOSS_HIGH_INQUISITOR_WHITEMANE,
  'instance_scarlet_monastery': INSTANCE_SCARLET_MONASTERY,
  'at_cathedral_entrance': AT_CATHEDRAL_ENTRANCE,
  // SESSION 10: eastern_kingdoms/scholomance/* (Gandling, Jandice, Spectral Tutor, instance)
  'boss_darkmaster_gandling': BOSS_DARKMASTER_GANDLING,
  'boss_jandice_barov': BOSS_JANDICE_BAROV,
  'instance_scholomance': INSTANCE_SCHOLOMANCE,
  'event_spell_gandling_shadow_portal': EVENT_SPELL_GANDLING_SHADOW_PORTAL,
  'event_dawn_gambit': EVENT_DAWN_GAMBIT,
  'npc_spectral_tutor': NPC_SPECTRAL_TUTOR_SCRIPT,
  // SESSION 10: eastern_kingdoms/blackrock_depths/* (Gerstahn, Angerforge, Flamelash,
  // Emperor/Moira, zone bar/jail/arena, instance)
  'boss_high_interrogator_gerstahn': BOSS_HIGH_INTERROGATOR_GERSTAHN,
  'boss_general_angerforge': BOSS_GENERAL_ANGERFORGE,
  'boss_ambassador_flamelash': BOSS_AMBASSADOR_FLAMELASH,
  'boss_emperor_dagran_thaurissan': BOSS_EMPEROR_DAGRAN_THAURISSAN,
  'boss_moira_bronzebeard': BOSS_MOIRA_BRONZEBEARD,
  'instance_blackrock_depths': INSTANCE_BLACKROCK_DEPTHS,
  'go_bar_beer_keg': GO_BAR_BEER_KEG,
  'go_shadowforge_brazier': GO_SHADOWFORGE_BRAZIER_SCRIPT,
  'go_relic_coffer_door': GO_RELIC_COFFER_DOOR_SCRIPT,
  'at_shadowforge_bridge': AT_SHADOWFORGE_BRIDGE,
  'at_ring_of_law': AT_RING_OF_LAW,
  'npc_grimstone': NPC_GRIMSTONE_SCRIPT,
  'npc_phalanx': NPC_PHALANX_SCRIPT,
  'npc_mistress_nagmara': NPC_MISTRESS_NAGMARA_SCRIPT,
  'npc_rocknot': NPC_ROCKNOT_SCRIPT,
  'npc_marshal_windsor': NPC_MARSHAL_WINDSOR_SCRIPT,
  'npc_tobias_seecher': NPC_TOBIAS_SEECHER_SCRIPT,
  'npc_dughal_stormwing': NPC_DUGHAL_STORMWING_SCRIPT,
  'npc_hurley_blackbreath': NPC_HURLEY_BLACKBREATH_SCRIPT,
  'boss_doomrel': BOSS_DOOMREL,
  'boss_plugger_spazzring': BOSS_PLUGGER_SPAZZRING,
  'go_bar_ale_mug': GO_BAR_ALE_MUG,
  'npc_ironhand_guardian': NPC_IRONHAND_GUARDIAN_SCRIPT,
  // SESSION 10: eastern_kingdoms/arathi_highlands.cpp (zone escorts)
  'npc_professor_phizzlethorpe': NPC_PROFESSOR_PHIZZLETHORPE_SCRIPT,
  'npc_kinelory': NPC_KINELORY_SCRIPT,
  // SESSION 10: eastern_kingdoms/hinterlands.cpp (zone escorts + wildhammer event)
  'npc_00x09hl': NPC_00X09HL_SCRIPT,
  'npc_rinji': NPC_RINJI_SCRIPT,
  'event_wildhammer_message': EVENT_WILDHAMMER_MESSAGE,
  // SESSION 10: eastern_kingdoms/loch_modan.cpp (zone escort)
  'npc_miran': NPC_MIRAN_SCRIPT,
  // SESSION 10: eastern_kingdoms/redridge_mountains.cpp (zone escort)
  'npc_corporal_keeshan': NPC_CORPORAL_KEESHAN_SCRIPT,
  // SESSION 10: eastern_kingdoms/searing_gorge.cpp (zone escort)
  'npc_dorius_stonetender': NPC_DORIUS_STONETENDER_SCRIPT,
  // SESSION 10: eastern_kingdoms/silverpine_forest.cpp (zone escort + Pyrewood ambush)
  'npc_deathstalker_erland': NPC_DEATHSTALKER_ERLAND_SCRIPT,
  'npc_deathstalker_faerleia': NPC_DEATHSTALKER_FAERLEIA_SCRIPT,
  // SESSION 10: eastern_kingdoms/stormwind_city.cpp (quest fights + masquerade + heads)
  'npc_bartleby': NPC_BARTLEBY_SCRIPT,
  'npc_dashel_stonefist': NPC_DASHEL_STONEFIST_SCRIPT,
  'npc_lady_katrana_prestor': NPC_LADY_KATRANA_PRESTOR_SCRIPT,
  'npc_squire_rowe': NPC_SQUIRE_ROWE_SCRIPT,
  'npc_reginald_windsor': NPC_REGINALD_WINDSOR_SCRIPT,
  'npc_major_mattingly': NPC_MAJOR_MATTINGLY_SCRIPT,
  'npc_field_marshal_afrasiabi': NPC_FIELD_MARSHAL_AFRASIABI_SCRIPT,
  // SESSION 10: eastern_kingdoms/stranglethorn_vale.cpp (Yenniku quest residual + Kurzen CombatAI)
  'mob_yenniku': MOB_YENNIKU,
  'mob_colonel_kurzen': MOB_COLONEL_KURZEN,
  // SESSION 10: eastern_kingdoms/tirisfal_glades.cpp (Calvin duel + mausoleum Ulag GOs)
  'go_mausoleum_door': GO_MAUSOLEUM_DOOR,
  'go_mausoleum_trigger': GO_MAUSOLEUM_TRIGGER,
  'npc_calvin_montague': NPC_CALVIN_MONTAGUE_SCRIPT,
  // SESSION 10: eastern_kingdoms/western_plaguelands.cpp (cauldron LOS + In Dreams escort)
  'npc_the_scourge_cauldron': NPC_THE_SCOURGE_CAULDRON_SCRIPT,
  'npc_taelan_fordring': NPC_TAELAN_FORDRING_SCRIPT,
  'npc_isillien': NPC_ISILLIEN_SCRIPT,
  'npc_tirion_fordring': NPC_TIRION_FORDRING_SCRIPT,
  // SESSION 10: eastern_kingdoms/westfall.cpp (Daphne defense + Defias escort + Klaven alert)
  'npc_daphne_stilwell': NPC_DAPHNE_STILWELL_SCRIPT,
  'npc_defias_traitor': NPC_DEFIAS_TRAITOR_SCRIPT,
  'npc_foreman_klaven_mortwake': NPC_FOREMAN_KLAVEN_MORTWAKE_SCRIPT,
  // SESSION 10: eastern_kingdoms/wetlands.cpp (Missing Diplomat Slim + Mikhail + Flagongut fossil)
  'npc_tapoke_slim_jahn': NPC_TAPOKE_SLIM_JAHN_SCRIPT,
  'npc_mikhail': NPC_MIKHAIL_SCRIPT,
  'go_flagongut_fossil': GO_FLAGONGUT_FOSSIL_SCRIPT,
  // SESSION 10: kalimdor/ashenvale.cpp (Muglash Vorsha + Ruul + Torek + Feero escorts)
  'npc_muglash': NPC_MUGLASH_SCRIPT,
  'go_naga_brazier': GO_NAGA_BRAZIER_SCRIPT,
  'npc_ruul_snowhoof': NPC_RUUL_SNOWHOOF_SCRIPT,
  'npc_torek': NPC_TOREK_SCRIPT,
  'npc_feero_ironhand': NPC_FEERO_IRONHAND_SCRIPT,
  // SESSION 10: kalimdor/azshara.cpp (Spitelashes + Felhound + Arcanite Buoy + Lightning + Maws)
  'mobs_spitelashes': MOBS_SPITELASHES,
  'npc_felhound_tracker': NPC_FELHOUND_TRACKER_SCRIPT,
  'event_arcanite_buoy': EVENT_ARCANITE_BUOY,
  'go_lightning': GO_LIGHTNING,
  'boss_maws': BOSS_MAWS,
  // SESSION 10: kalimdor/darkshore.cpp (Kerlonian + escorts + Rabid Bear + Blackwood + purify food)
  'npc_kerlonian': NPC_KERLONIAN_SCRIPT,
  'npc_prospector_remtravel': NPC_PROSPECTOR_REMTRAVEL_SCRIPT,
  'npc_threshwackonator': NPC_THRESHWACKONATOR_SCRIPT,
  'npc_volcor': NPC_VOLCOR_SCRIPT,
  'npc_therylune': NPC_THERYLUNE_SCRIPT,
  'npc_rabid_bear': NPC_RABID_BEAR_SCRIPT,
  'npc_blackwood_warrior': NPC_BLACKWOOD_WARRIOR_SCRIPT,
  'npc_blackwood_totemic': NPC_BLACKWOOD_TOTEMIC_SCRIPT,
  'event_purify_food': EVENT_PURIFY_FOOD,
  'go_furbolg_food': GO_FURBOLG_FOOD_SCRIPT,
  // SESSION 10: kalimdor/desolace.cpp (Kodo Roundup + escorts + Magrami Spectre)
  'npc_aged_dying_ancient_kodo': NPC_AGED_DYING_ANCIENT_KODO_SCRIPT,
  'npc_dalinda_malem': NPC_DALINDA_MALEM_SCRIPT,
  'npc_melizza_brimbuzzle': NPC_MELIZZA_BRIMBUZZLE_SCRIPT,
  'npc_cork_gizelton': NPC_CORK_GIZELTON_SCRIPT,
  'npc_rigger_gizelton': NPC_RIGGER_GIZELTON_SCRIPT,
  'npc_magrami_spectre': NPC_MAGRAMI_SPECTRE_SCRIPT,
  // SESSION 10: kalimdor/durotar.cpp (Lazy Peon quest 5441)
  'npc_lazy_peon': NPC_LAZY_PEON_SCRIPT,
  // SESSION 10: kalimdor/dustwallow_marsh.cpp (Mok'Morokk / Ogron / Hendel /
  // Stinky escorts + Sentry Point AT + Theramore spar controller)
  'npc_morokk': NPC_MOROKK_SCRIPT,
  'npc_ogron': NPC_OGRON_SCRIPT,
  'npc_private_hendel': NPC_PRIVATE_HENDEL_SCRIPT,
  'npc_stinky_ignatz': NPC_STINKY_IGNATZ_SCRIPT,
  'at_sentry_point': AT_SENTRY_POINT,
  'npc_theramore_spar_controller': NPC_THERAMORE_SPAR_CONTROLLER_SCRIPT,
  // SESSION 10: kalimdor/felwood.cpp (Corrupted Sabers + Arko'narin + Arei escorts)
  'npc_kitten': NPC_KITTEN_SCRIPT,
  'npc_corrupt_saber': NPC_CORRUPT_SABER_SCRIPT,
  'npc_captured_arkonarin': NPC_CAPTURED_ARKONARIN_SCRIPT,
  'npc_arei': NPC_AREI_SCRIPT,
  // SESSION 10: kalimdor/feralas.cpp (OOX-22/FE + Shay + Freedom for All Creatures)
  'npc_oox22fe': NPC_OOX22FE_SCRIPT,
  'npc_shay_leafrunner': NPC_SHAY_LEAFRUNNER_SCRIPT,
  'npc_captured_sprite_darter': NPC_CAPTURED_SPRITE_DARTER_SCRIPT,
  'npc_kindal_moonweaver': NPC_KINDAL_MOONWEAVER_SCRIPT,
  'go_cage_door': GO_CAGE_DOOR_SCRIPT,
  // SESSION 10: kalimdor/moonglade.cpp (Remulos escort + Eranikus event + Omen cluster)
  'npc_keeper_remulos': NPC_KEEPER_REMULOS_SCRIPT,
  'boss_eranikus': BOSS_ERANIKUS,
  'go_omen_cluster': GO_OMEN_CLUSTER_SCRIPT,
  // SESSION 10: kalimdor/orgrimmar.cpp (head-of-dragon gossip + celebration enders)
  'npc_overlord_runthalak': NPC_OVERLORD_RUNTHALAK_SCRIPT,
  'npc_high_overlord_saurfang': NPC_HIGH_OVERLORD_SAURFANG_SCRIPT,
  // SESSION 10: kalimdor/stonetalon_mountains.cpp (Kaya escort + Covert Ops wagon trap)
  'npc_kaya': NPC_KAYA_SCRIPT,
  'go_covert_ops': GO_COVERT_OPS_SCRIPT,
  // SESSION 10: kalimdor/tanaris.cpp (Aquementas + OOX-17/TN escort + Tooga follower)
  'mob_aquementas': MOB_AQUEMENTAS,
  'npc_oox17tn': NPC_OOX17TN_SCRIPT,
  'npc_tooga': NPC_TOOGA_SCRIPT,
  // SESSION 10: kalimdor/teldrassil.cpp (Mist follower quest 938)
  'npc_mist': NPC_MIST_SCRIPT,
  // SESSION 10: kalimdor/the_barrens.cpp (Gilthares + Fizzule + Affray +
  // Wizzlecrank + Venture Co. tower + Regthar Counterattack)
  'npc_gilthares': NPC_GILTHARES_SCRIPT,
  'npc_taskmaster_fizzule': NPC_TASKMASTER_FIZZULE_SCRIPT,
  'npc_twiggy_flathead': NPC_TWIGGY_FLATHEAD_SCRIPT,
  'at_twiggy_flathead': AT_TWIGGY_FLATHEAD,
  'npc_wizzlecranks_shredder': NPC_WIZZLECRANKS_SHREDDER_SCRIPT,
  'npc_gallywix': NPC_GALLYWIX_SCRIPT,
  'npc_foreman_silixiz': NPC_FOREMAN_SILIXIZ_SCRIPT,
  'npc_venture_co_lookout': NPC_VENTURE_CO_LOOKOUT_SCRIPT,
  'npc_regthar_deathgate': NPC_REGTHAR_DEATHGATE_SCRIPT,
  // SESSION 10: kalimdor/thousand_needles.cpp (Kanati + Lakota + Pao'ka escorts + Plucky)
  'npc_kanati': NPC_KANATI_SCRIPT,
  'npc_lakota_windsong': NPC_LAKOTA_WINDSONG_SCRIPT,
  'npc_paoka_swiftmountain': NPC_PAOKA_SWIFTMOUNTAIN_SCRIPT,
  'npc_plucky_johnson': NPC_PLUCKY_JOHNSON_SCRIPT,
  // SESSION 10: kalimdor/ungoro_crater.cpp (A-Me 01 + Ringo escorts + Simone stave)
  'npc_ame01': NPC_AME01_SCRIPT,
  'npc_ringo': NPC_RINGO_SCRIPT,
  'npc_simone_seductress': NPC_SIMONE_SEDUCTRESS_SCRIPT,
  'npc_simone_the_inconspicuous': NPC_SIMONE_THE_INCONSPICUOUS_SCRIPT,
  'npc_precious_the_devourer': NPC_PRECIOUS_THE_DEVOURER_SCRIPT,
  // SESSION 10: kalimdor/winterspring.cpp (Ranshalla escort + Elune fire + Artorius stave)
  'npc_ranshalla': NPC_RANSHALLA_SCRIPT,
  'go_elune_fire': GO_ELUNE_FIRE_SCRIPT,
  'npc_artorius': NPC_ARTORIUS_SCRIPT,
  // SESSION 10: world/guards.cpp (city/zone guardAI + Stormwind Windsor salute)
  'guard_bluffwatcher': GUARD_BLUFFWATCHER,
  'guard_contested': GUARD_CONTESTED,
  'guard_darnassus': GUARD_DARNASSUS,
  'guard_dunmorogh': GUARD_DUNMOROGH,
  'guard_durotar': GUARD_DUROTAR,
  'guard_elwynnforest': GUARD_ELWYNNFOREST,
  'guard_ironforge': GUARD_IRONFORGE,
  'guard_mulgore': GUARD_MULGORE,
  'guard_orgrimmar': GUARD_ORGRIMMAR,
  'guard_stormwind': GUARD_STORMWIND,
  'guard_teldrassil': GUARD_TELDRASSIL,
  'guard_tirisfal': GUARD_TIRISFAL,
  'guard_undercity': GUARD_UNDERCITY,
  // SESSION 10: world/npc_professions.cpp (BS/LW specialization gossip + soothsaying residual)
  'npc_prof_blacksmith': NPC_PROF_BLACKSMITH,
  'npc_prof_leather': NPC_PROF_LEATHER,
  'go_soothsaying_for_dummies': GO_SOOTHSAYING_FOR_DUMMIES_SCRIPT,
  // SESSION 10: world/npcs_special.cpp (chicken/triage/garments/guardian/innkeeper/
  // redemption/cleaner/void zone/advanced target dummy)
  'npc_chicken_cluck': NPC_CHICKEN_CLUCK,
  'npc_injured_patient': NPC_INJURED_PATIENT,
  'npc_doctor': NPC_DOCTOR,
  'npc_garments_of_quests': NPC_GARMENTS_OF_QUESTS,
  'npc_guardian': NPC_GUARDIAN,
  'npc_innkeeper': NPC_INNKEEPER,
  'npc_redemption_target': NPC_REDEMPTION_TARGET,
  'npc_the_cleaner': NPC_THE_CLEANER_SCRIPT,
  'npc_aoe_damage_trigger': NPC_AOE_DAMAGE_TRIGGER,
  'npc_advanced_target_dummy': NPC_ADVANCED_TARGET_DUMMY_SCRIPT,
  // SESSION 10: world/war_effort.cpp (AQ resource collectors + Scarab Gong + Silithus colossi)
  'npc_war_effort': NPC_WAR_EFFORT,
  'go_scarab_gong': GO_SCARAB_GONG_SCRIPT,
  'npc_silithus_boss': NPC_SILITHUS_BOSS,
};

/** Reverse map: creature entry → script IR (first binding wins). */
const BY_CREATURE = new Map<number, ScriptDevIR>();
/** Reverse map: gameobject entry → script IR with goUse (first binding wins). */
const BY_GO = new Map<number, ScriptDevIR>();
/** Instance scripts (no creature binding, or map-level). */
const INSTANCE_SCRIPTS: ScriptDevIR[] = [];

function rebuildIndexes(): void {
  BY_CREATURE.clear();
  BY_GO.clear();
  INSTANCE_SCRIPTS.length = 0;
  for (const ir of Object.values(SCRIPTDEV_REGISTRY)) {
    registerAuraScriptsFromIr(ir);
    if (ir.encounters?.length || ir.name.startsWith('instance_')) {
      INSTANCE_SCRIPTS.push(ir);
    }
    for (const entry of ir.boundCreatures) {
      if (!BY_CREATURE.has(entry)) BY_CREATURE.set(entry, ir);
    }
    // GO-use bindings: goUse.goEntries preferred; fall back to boundGos when goUse present.
    // Cite: scriptdev2.sql gameobject_template.ScriptName → boundGos / goUse.goEntries.
    if (ir.goUse) {
      const goEntries = ir.goUse.goEntries?.length
        ? ir.goUse.goEntries
        : (ir.boundGos ?? []);
      for (const entry of goEntries) {
        if (!BY_GO.has(entry | 0)) BY_GO.set(entry | 0, ir);
      }
    }
  }
}

rebuildIndexes();

/** Lookup IR by ScriptDev script name. */
export function scriptDevByName(name: string): ScriptDevIR | undefined {
  return SCRIPTDEV_REGISTRY[name];
}

/** Lookup boss AI IR by creature_template.entry. */
export function scriptDevByCreature(entry: number): ScriptDevIR | undefined {
  return BY_CREATURE.get(entry | 0);
}

// Lookup GO-use IR by gameobject_template.entry. Only scripts with a goUse payload are indexed
// (areatrigger/event GOs without goUse stay inert).
export function scriptDevByGo(entry: number): ScriptDevIR | undefined {
  return BY_GO.get(entry | 0);
}

// Cast plan for a creature entry, or null when it has no ported ScriptDev AI with timers or phases.
// A multi-entry script tags timers with creatureEntry so only matching ones arm for that template.
export function scriptDevCastPlanForEntry(entry: number): ScriptDevCastPlan | null {
  const ir = scriptDevByCreature(entry);
  if (!ir) return null;
  const e = entry | 0;
  const timers = ir.timers.filter(
    (t) => t.creatureEntry == null || t.creatureEntry === e,
  );
  // A proximity-only script has no timers and no phases, and null here left it with an EMPTY KIT.
  // Cite: naxxramas.cpp:1074-1093; combatEnemySpec.ts:100-108 spellIds arrive through this plan.
  if (timers.length === 0 && !(ir.phases?.length) && !(ir.proximityTriggers?.length)) return null;
  if (timers.length === ir.timers.length) return castPlanFromScriptDev(ir);
  return castPlanFromScriptDev({ ...ir, timers });
}

// Prefer the ScriptDev schedule when present: an IR OWNS it, and createSession skips the spell-list
// merge when this returns cast entries. So a ported ZG/Naxx boss must carry ALL of its phases.
export function scriptDevScheduleForEntry(entry: number): {
  castEntries: ScriptDevCastPlan['castEntries'];
  spellIds: number[];
  /** UpdateEntry morph targets (phase actions) — spec builder resolves to scriptDevMorphs. */
  morphEntries: number[];
  ir: ScriptDevIR;
} | null {
  const plan = scriptDevCastPlanForEntry(entry);
  if (!plan) return null;
  return {
    castEntries: plan.castEntries,
    spellIds: plan.spellIds,
    morphEntries: plan.morphEntries,
    ir: plan.ir,
  };
}

/** All instance IRs (SetData / doors). */
export function scriptDevInstanceScripts(): readonly ScriptDevIR[] {
  return INSTANCE_SCRIPTS;
}

// Find instance IR that owns an encounter for creatureEntry (death → SetData). Searches instance_* first,
// then boss lifecycle.
export function scriptDevInstanceForCreature(entry: number): ScriptDevIR | undefined {
  for (const ir of INSTANCE_SCRIPTS) {
    if (ir.encounters?.some((e) => e.creatureEntry === (entry | 0))) return ir;
  }
  return undefined;
}

/** Ported script name set (tests / diagnostics). */
export function portedScriptNames(): string[] {
  return Object.keys(SCRIPTDEV_REGISTRY).sort();
}
