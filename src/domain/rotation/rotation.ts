// A DB-driven combat ROTATION: an ordered, guarded priority list per phase, shared by auto-combat and
// the editor. Structured conditions, DB ids only, pure. Implementation lives under ./rotation/.

export * from './types.ts';
export * from './evaluate.ts';
export * from './classify.ts';
export * from './spec.ts';
export * from './build.ts';
export * from './stand.ts';
export * from './ruleAfterChain.ts';
// Class hooks / finalizers also re-exported via spec.ts for stable public API.
