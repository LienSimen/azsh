import type { DataStore } from '../../data/dataStore.ts';
import type { Inventory } from '../../domain/items/inventory.ts';
import type { ItemInstance } from '../../domain/items/itemInstance.ts';
import type { CreateGameOptions, GameState } from './types.ts';

// The bags one junk / make-room / overflow pass reads and writes, plus where a keeper goes when
// nothing frees a slot. Built by bagOverflow.ts for you or for a companion, so both share one pass.
export interface BagHandle {
  /** Subject of every line the pass logs: 'You' or the companion's name. */
  readonly name: string;
  readonly isPlayer: boolean;
  /** Companion id, absent for the player. */
  readonly companionId?: string;
  get(): Inventory;
  set(inv: Inventory): void;
  cap(): number;
  /** Park `count` of `item` in this owner's overflow queue. False when the queue refused it too. */
  overflow(item: number, count: number, instance?: ItemInstance): boolean;
  // Full bags, but auto-equip would wear this: put it on and send the piece it replaces to the
  // queue instead. Absent when the owner has no auto-equip pass wired.
  wear?(item: number, count: number, instance?: ItemInstance): boolean;
}

/** Result of applying the junk filter when a drop will not fit. */
export type FullBagsHandle = {
  /** Incoming units sold without entering bags (0 or the full count). */
  soldIncoming: number;
  earnedIncoming: number;
  /** Incoming units destroyed without entering bags (0 or the full count). */
  destroyedIncoming: number;
  /** Bag junk was sold/destroyed — caller should retry canFit. */
  madeRoom: boolean;
};

// Shared mutable closure bundle for createGame sub-modules (pattern C). Modules export `createXModule(ctx):
// Pick<Game, …>` and must not import game.ts.
export interface GameCtx {
  readonly ds: DataStore;
  readonly state: GameState;
  readonly opts: CreateGameOptions;
  /** Append an activity log line (newest first; capped). */
  log: (msg: string) => void;
  /** Backpack capacity (base pack + equipped bags). */
  cap: () => number;
  /** Recompute quest completion from inventory / standing. */
  refreshQuests: () => void;
  // Add a rolled drop to bags (quest-item cap + bag family). Returns count taken. Shared by fight loot and
  // gathering.
  takeDrop: (item: number, count: number) => number;
  // Bags cannot take `item`. Apply junk-filter sell/destroy to the incoming stack, else free a slot by
  // running the same bag junk pass. No-op when both autos are off.
  handleFullBags: (item: number, count: number, owner?: BagHandle) => FullBagsHandle;
}
