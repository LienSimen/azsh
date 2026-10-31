// SI2.5 / SI3 top-opcode handlers — barrel (registry split; pure re-exports). Implementation lives under
// ./handlers/*.ts. Public surface unchanged for index.ts / item-triggers.ts importers.

export { EFFECT_HANDLERS, AURA_HANDLERS } from './handlers/registry.ts';
export {
  finalizeResult,
  createHandlerState,
} from './handlers/shared.ts';
export type { HandlerState } from './handlers/shared.ts';
