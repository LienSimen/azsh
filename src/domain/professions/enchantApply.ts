// Pure apply and clear helpers for enchant identity on ItemInstance, so perm and temp enchants
// survive unequip and trade. Callers inject expiresAt and now; no I/O, no DataStore.

import type { ItemInstance, InstanceTempEnchant } from '../items/itemInstance.ts';
import { copyInstance, equippedInstance, hasIdentity } from '../items/itemInstance.ts';
import type { EquippedMap } from '../character/character.ts';
import type { EquipSlot } from '../../data/schema.ts';

// Set or clear PERM_ENCHANTMENT_SLOT on an instance (profession enchant id). `undefined` clears the field
// (absent = no perm enchant).
export function withPermEnchant(
  inst: ItemInstance,
  enchantId: number | undefined,
): ItemInstance {
  const out = copyInstance(inst, inst.count);
  if (enchantId == null) {
    delete out.permEnchantId;
  } else {
    out.permEnchantId = enchantId;
  }
  return out;
}

/** Clear PERM_ENCHANTMENT_SLOT identity. */
export function clearPermEnchant(inst: ItemInstance): ItemInstance {
  return withPermEnchant(inst, undefined);
}

// Set or clear TEMP_ENCHANTMENT_SLOT on an instance (oil / poison / imbue). `undefined` clears the field.
// `expiresAt` is caller-supplied epoch ms (injected clock).
export function withTempEnchant(
  inst: ItemInstance,
  te: InstanceTempEnchant | undefined,
): ItemInstance {
  const out = copyInstance(inst, inst.count);
  if (te == null) {
    delete out.tempEnchant;
  } else {
    const next: InstanceTempEnchant = { id: te.id };
    if (te.expiresAt != null) next.expiresAt = te.expiresAt;
    out.tempEnchant = next;
  }
  return out;
}

/** Clear TEMP_ENCHANTMENT_SLOT identity. */
export function clearTempEnchant(inst: ItemInstance): ItemInstance {
  return withTempEnchant(inst, undefined);
}

// Write a permanent enchant onto `slot` of an EquippedMap, returning a NEW map. Promotes a bare
// entry to a real ItemInstance first — an enchant has nowhere to live on a number.
export function applyPermEnchantToSlot(
  equipped: EquippedMap,
  slot: EquipSlot,
  enchantId: number,
): EquippedMap {
  const cur = equippedInstance(equipped[slot]);
  if (cur == null) return equipped;
  const next = withPermEnchant(cur, enchantId);
  return { ...equipped, [slot]: hasIdentity(next) ? next : next.item };
}
