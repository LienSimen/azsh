// One pack file per class per spec per mode, merged pve-then-pvp in slug order (layout.mjs:
// listPackFiles, pinned by smoke rotationPacks). Nothing under pvp/ carries a `mode` field.

import type { RawSuggestionBand } from '../../domain/rotation/rotationSuggestions.ts';

import warriorArmsPve from './pve/warrior/arms.json' with { type: 'json' };
import warriorFuryPve from './pve/warrior/fury.json' with { type: 'json' };
import warriorProtectionPve from './pve/warrior/protection.json' with { type: 'json' };
import warriorArmsPvp from './pvp/warrior/arms.json' with { type: 'json' };
import warriorFuryPvp from './pvp/warrior/fury.json' with { type: 'json' };
import warriorProtectionPvp from './pvp/warrior/protection.json' with { type: 'json' };
import paladinHolyPve from './pve/paladin/holy.json' with { type: 'json' };
import paladinProtectionPve from './pve/paladin/protection.json' with { type: 'json' };
import paladinRetributionPve from './pve/paladin/retribution.json' with { type: 'json' };
import paladinHolyPvp from './pvp/paladin/holy.json' with { type: 'json' };
import paladinRetributionPvp from './pvp/paladin/retribution.json' with { type: 'json' };
import paladinProtectionPvp from './pvp/paladin/protection.json' with { type: 'json' };
import hunterBeastMasteryPve from './pve/hunter/beast-mastery.json' with { type: 'json' };
import hunterMarksmanshipPve from './pve/hunter/marksmanship.json' with { type: 'json' };
import hunterSurvivalPve from './pve/hunter/survival.json' with { type: 'json' };
import hunterMarksmanshipPvp from './pvp/hunter/marksmanship.json' with { type: 'json' };
import hunterBeastMasteryPvp from './pvp/hunter/beast-mastery.json' with { type: 'json' };
import hunterSurvivalPvp from './pvp/hunter/survival.json' with { type: 'json' };
import rogueAssassinationPve from './pve/rogue/assassination.json' with { type: 'json' };
import rogueCombatPve from './pve/rogue/combat.json' with { type: 'json' };
import rogueSubtletyPve from './pve/rogue/subtlety.json' with { type: 'json' };
import rogueAssassinationPvp from './pvp/rogue/assassination.json' with { type: 'json' };
import rogueCombatPvp from './pvp/rogue/combat.json' with { type: 'json' };
import rogueSubtletyPvp from './pvp/rogue/subtlety.json' with { type: 'json' };
import priestDisciplinePve from './pve/priest/discipline.json' with { type: 'json' };
import priestHolyPve from './pve/priest/holy.json' with { type: 'json' };
import priestShadowPve from './pve/priest/shadow.json' with { type: 'json' };
import priestDisciplinePvp from './pvp/priest/discipline.json' with { type: 'json' };
import priestShadowPvp from './pvp/priest/shadow.json' with { type: 'json' };
import priestHolyPvp from './pvp/priest/holy.json' with { type: 'json' };
import shamanElementalPve from './pve/shaman/elemental.json' with { type: 'json' };
import shamanEnhancementPve from './pve/shaman/enhancement.json' with { type: 'json' };
import shamanRestorationPve from './pve/shaman/restoration.json' with { type: 'json' };
import shamanElementalPvp from './pvp/shaman/elemental.json' with { type: 'json' };
import shamanEnhancementPvp from './pvp/shaman/enhancement.json' with { type: 'json' };
import shamanRestorationPvp from './pvp/shaman/restoration.json' with { type: 'json' };
import mageArcaneLevelingPve from './pve/mage/arcane-leveling.json' with { type: 'json' };
import mageFireLevelingPve from './pve/mage/fire-leveling.json' with { type: 'json' };
import mageFrostLevelingPve from './pve/mage/frost-leveling.json' with { type: 'json' };
import mageFrostPvp from './pvp/mage/frost.json' with { type: 'json' };
import mageArcanePvp from './pvp/mage/arcane.json' with { type: 'json' };
import mageFirePvp from './pvp/mage/fire.json' with { type: 'json' };
import warlockAfflictionPve from './pve/warlock/affliction.json' with { type: 'json' };
import warlockDemonologyPve from './pve/warlock/demonology.json' with { type: 'json' };
import warlockDestructionPve from './pve/warlock/destruction.json' with { type: 'json' };
import warlockAfflictionPvp from './pvp/warlock/affliction.json' with { type: 'json' };
import warlockDemonologyPvp from './pvp/warlock/demonology.json' with { type: 'json' };
import warlockDestructionPvp from './pvp/warlock/destruction.json' with { type: 'json' };
import druidBalancePve from './pve/druid/balance.json' with { type: 'json' };
import druidFeralTankPve from './pve/druid/feral-tank.json' with { type: 'json' };
import druidFeralPve from './pve/druid/feral.json' with { type: 'json' };
import druidRestorationPve from './pve/druid/restoration.json' with { type: 'json' };
import druidFeralPvp from './pvp/druid/feral.json' with { type: 'json' };
import druidBalancePvp from './pvp/druid/balance.json' with { type: 'json' };
import druidRestorationPvp from './pvp/druid/restoration.json' with { type: 'json' };

/** JSON modules are ambient `unknown` (src/json.d.ts), so a pack is checked before it narrows. */
function bands(value: unknown, label: string): RawSuggestionBand[] {
  if (!Array.isArray(value)) throw new Error(`rotations/${label}: not an array`);
  for (const row of value) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`rotations/${label}: band is not an object`);
    }
  }
  return value as RawSuggestionBand[];
}

/** Same, plus the mode the directory already states. */
function pvpBands(value: unknown, label: string): RawSuggestionBand[] {
  return bands(value, label).map((band) => ({ ...band, mode: 'pvp' }));
}

export const ROTATION_PACKS: Record<string, readonly RawSuggestionBand[]> = {
  warrior: [
    ...bands(warriorArmsPve, 'pve/warrior/arms.json'),
    ...bands(warriorFuryPve, 'pve/warrior/fury.json'),
    ...bands(warriorProtectionPve, 'pve/warrior/protection.json'),
    ...pvpBands(warriorArmsPvp, 'pvp/warrior/arms.json'),
    ...pvpBands(warriorFuryPvp, 'pvp/warrior/fury.json'),
    ...pvpBands(warriorProtectionPvp, 'pvp/warrior/protection.json'),
  ],
  paladin: [
    ...bands(paladinHolyPve, 'pve/paladin/holy.json'),
    ...bands(paladinProtectionPve, 'pve/paladin/protection.json'),
    ...bands(paladinRetributionPve, 'pve/paladin/retribution.json'),
    ...pvpBands(paladinHolyPvp, 'pvp/paladin/holy.json'),
    ...pvpBands(paladinRetributionPvp, 'pvp/paladin/retribution.json'),
    ...pvpBands(paladinProtectionPvp, 'pvp/paladin/protection.json'),
  ],
  hunter: [
    ...bands(hunterBeastMasteryPve, 'pve/hunter/beast-mastery.json'),
    ...bands(hunterMarksmanshipPve, 'pve/hunter/marksmanship.json'),
    ...bands(hunterSurvivalPve, 'pve/hunter/survival.json'),
    ...pvpBands(hunterMarksmanshipPvp, 'pvp/hunter/marksmanship.json'),
    ...pvpBands(hunterBeastMasteryPvp, 'pvp/hunter/beast-mastery.json'),
    ...pvpBands(hunterSurvivalPvp, 'pvp/hunter/survival.json'),
  ],
  rogue: [
    ...bands(rogueAssassinationPve, 'pve/rogue/assassination.json'),
    ...bands(rogueCombatPve, 'pve/rogue/combat.json'),
    ...bands(rogueSubtletyPve, 'pve/rogue/subtlety.json'),
    ...pvpBands(rogueAssassinationPvp, 'pvp/rogue/assassination.json'),
    ...pvpBands(rogueCombatPvp, 'pvp/rogue/combat.json'),
    ...pvpBands(rogueSubtletyPvp, 'pvp/rogue/subtlety.json'),
  ],
  priest: [
    ...bands(priestDisciplinePve, 'pve/priest/discipline.json'),
    ...bands(priestHolyPve, 'pve/priest/holy.json'),
    ...bands(priestShadowPve, 'pve/priest/shadow.json'),
    ...pvpBands(priestDisciplinePvp, 'pvp/priest/discipline.json'),
    ...pvpBands(priestShadowPvp, 'pvp/priest/shadow.json'),
    ...pvpBands(priestHolyPvp, 'pvp/priest/holy.json'),
  ],
  shaman: [
    ...bands(shamanElementalPve, 'pve/shaman/elemental.json'),
    ...bands(shamanEnhancementPve, 'pve/shaman/enhancement.json'),
    ...bands(shamanRestorationPve, 'pve/shaman/restoration.json'),
    ...pvpBands(shamanElementalPvp, 'pvp/shaman/elemental.json'),
    ...pvpBands(shamanEnhancementPvp, 'pvp/shaman/enhancement.json'),
    ...pvpBands(shamanRestorationPvp, 'pvp/shaman/restoration.json'),
  ],
  mage: [
    ...bands(mageArcaneLevelingPve, 'pve/mage/arcane-leveling.json'),
    ...bands(mageFireLevelingPve, 'pve/mage/fire-leveling.json'),
    ...bands(mageFrostLevelingPve, 'pve/mage/frost-leveling.json'),
    ...pvpBands(mageFrostPvp, 'pvp/mage/frost.json'),
    ...pvpBands(mageArcanePvp, 'pvp/mage/arcane.json'),
    ...pvpBands(mageFirePvp, 'pvp/mage/fire.json'),
  ],
  warlock: [
    ...bands(warlockAfflictionPve, 'pve/warlock/affliction.json'),
    ...bands(warlockDemonologyPve, 'pve/warlock/demonology.json'),
    ...bands(warlockDestructionPve, 'pve/warlock/destruction.json'),
    ...pvpBands(warlockAfflictionPvp, 'pvp/warlock/affliction.json'),
    ...pvpBands(warlockDemonologyPvp, 'pvp/warlock/demonology.json'),
    ...pvpBands(warlockDestructionPvp, 'pvp/warlock/destruction.json'),
  ],
  druid: [
    ...bands(druidBalancePve, 'pve/druid/balance.json'),
    ...bands(druidFeralTankPve, 'pve/druid/feral-tank.json'),
    ...bands(druidFeralPve, 'pve/druid/feral.json'),
    ...bands(druidRestorationPve, 'pve/druid/restoration.json'),
    ...pvpBands(druidFeralPvp, 'pvp/druid/feral.json'),
    ...pvpBands(druidBalancePvp, 'pvp/druid/balance.json'),
    ...pvpBands(druidRestorationPvp, 'pvp/druid/restoration.json'),
  ],
};
