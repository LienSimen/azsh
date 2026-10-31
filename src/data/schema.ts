// The data contract between the offline ETL and the runtime engine: the ETL bakes FINAL numbers into
// JSON matching these shapes. No TS `enum`/`namespace`; family modules live under ./schema/*.ts.
// `export type *` where a module holds only types: the value form made vite fetch 12 empty modules into
// the sim Worker, which Firefox reports as "create a Worker from an empty source" (12 warnings per boot).

export type * from './schema/primitives.ts';
export * from './schema/constants.ts';
export type * from './schema/spell.ts';
export type * from './schema/creature.ts';
export type * from './schema/item.ts';
export type * from './schema/itemEnchant.ts';
export type * from './schema/quest.ts';
export type * from './schema/npc.ts';
export * from './schema/profession.ts';
export type * from './schema/world.ts';
export type * from './schema/encounter.ts';
export type * from './schema/talent.ts';
export type * from './schema/faction.ts';
export type * from './schema/bundle.ts';
