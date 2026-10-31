// Stamp EncounterDef.roomId / roomName from the committed dungeon-rooms bake, covering bosses,
// rares and hand packs that cluster trash already gets. Outside every room bbox → roomId null.
import type { EncounterDef, InstanceDef } from '../schema.ts';
import { roomAtPosition } from './pack-from-clusters.ts';

/** Attach roomId/roomName from origin when missing. Preserves explicit stamps. */
export function applyDungeonRooms(
  mapId: number,
  encounters: EncounterDef[],
): EncounterDef[] {
  return encounters.map((enc) => {
    if (enc.roomId !== undefined) return enc;
    const o = enc.origin;
    if (!o || !Number.isFinite(o.x) || !Number.isFinite(o.y)) {
      return { ...enc, roomId: null, roomName: null };
    }
    const room = roomAtPosition(mapId, o);
    if (room) return { ...enc, roomId: room.id, roomName: room.name };
    return { ...enc, roomId: null, roomName: null };
  });
}

/** Apply rooms to a full InstanceDef (shallow copy). */
export function withDungeonRooms(def: InstanceDef): InstanceDef {
  return {
    ...def,
    encounters: applyDungeonRooms(def.mapId, def.encounters),
  };
}
