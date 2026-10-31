// Barrel for the pure macro layer: model + caps, normalize, parse, conditions, plan.
// Hosts (UI) and the engine import from here; nothing in this folder touches DOM or RNG.

export * from './types.ts';
export * from './units.ts';
export * from './normalize.ts';
export * from './parse.ts';
export * from './snapshot.ts';
export * from './weaponTypes.ts';
export * from './slots.ts';
export * from './creatureTypes.ts';
export * from './conditions.ts';
export * from './plan.ts';
export * from './describe.ts';
export * from './compose.ts';
export * from './templates.ts';
export * from './icon.ts';
// The macro -> rotation compiler is pure and light. Its ENV builder (rotationEnv.ts) is kept out of
// the barrel on purpose: it pulls domain/rotation/build.ts, which server importers must not load.
export * from './rotation.ts';
