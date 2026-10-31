// Aggregator for the per-zone scriptdev2 quest-script registries, so registry.ts stays under the
// 1500-line cap. Add a family here and mark it in registry.ts — never a new import line there.
import type { QuestScriptEntry } from './registry.ts';
import { AREATRIGGER_SCRIPTS_REGISTRY } from './registryAreatriggerScripts.ts';
import { ASHENVALE_REGISTRY } from './registryAshenvale.ts';
import { AZSHARA_REGISTRY } from './registryAzshara.ts';
import { DARKSHORE_REGISTRY } from './registryDarkshore.ts';
import { DESOLACE_REGISTRY } from './registryDesolace.ts';
import { DUSTWALLOW_MARSH_REGISTRY } from './registryDustwallowMarsh.ts';
import { FELWOOD_REGISTRY } from './registryFelwood.ts';
import { FERALAS_REGISTRY } from './registryFeralas.ts';
import { GO_SCRIPTS_REGISTRY } from './registryGoScripts.ts';
import { MOONGLADE_REGISTRY } from './registryMoonglade.ts';
import { NPC_PROFESSIONS_REGISTRY } from './registryNpcProfessions.ts';
import { NPCS_SPECIAL_REGISTRY } from './registryNpcsSpecial.ts';
import { RAZORFEN_DOWNS_REGISTRY } from './registryRazorfenDowns.ts';
import { RAZORFEN_KRAUL_REGISTRY } from './registryRazorfenKraul.ts';
import { STONETALON_MOUNTAINS_REGISTRY } from './registryStonetalonMountains.ts';
import { TANARIS_REGISTRY } from './registryTanaris.ts';
import { TELDRASSIL_REGISTRY } from './registryTeldrassil.ts';
import { THE_BARRENS_REGISTRY } from './registryTheBarrens.ts';
import { THOUSAND_NEEDLES_REGISTRY } from './registryThousandNeedles.ts';
import { UNGORO_CRATER_REGISTRY } from './registryUngoroCrater.ts';
import { WAR_EFFORT_REGISTRY } from './registryWarEffort.ts';
import { WINTERSPRING_REGISTRY } from './registryWinterspring.ts';

/** Merged per-zone registries, spread into QUEST_SCRIPT_REGISTRY as one unit. */
export const SIBLING_REGISTRIES: Record<string | number, QuestScriptEntry> = {
  ...AREATRIGGER_SCRIPTS_REGISTRY,
  ...ASHENVALE_REGISTRY,
  ...AZSHARA_REGISTRY,
  ...DARKSHORE_REGISTRY,
  ...DESOLACE_REGISTRY,
  ...DUSTWALLOW_MARSH_REGISTRY,
  ...FELWOOD_REGISTRY,
  ...FERALAS_REGISTRY,
  ...GO_SCRIPTS_REGISTRY,
  ...MOONGLADE_REGISTRY,
  ...NPC_PROFESSIONS_REGISTRY,
  ...NPCS_SPECIAL_REGISTRY,
  ...RAZORFEN_DOWNS_REGISTRY,
  ...RAZORFEN_KRAUL_REGISTRY,
  ...STONETALON_MOUNTAINS_REGISTRY,
  ...TANARIS_REGISTRY,
  ...TELDRASSIL_REGISTRY,
  ...THE_BARRENS_REGISTRY,
  ...THOUSAND_NEEDLES_REGISTRY,
  ...UNGORO_CRATER_REGISTRY,
  ...WAR_EFFORT_REGISTRY,
  ...WINTERSPRING_REGISTRY,
};
