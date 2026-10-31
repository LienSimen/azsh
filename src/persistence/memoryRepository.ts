// In-memory SaveRepository for tests and no-IndexedDB environments.

import type { SaveRepository } from './saveRepository.ts';
import type { Save, SaveMeta } from './saveShape.ts';
import { migrate, summarize } from './saveShape.ts';

export class MemorySaveRepository implements SaveRepository {
  private store = new Map<string, Save>();

  async load(slot: string): Promise<Save | null> {
    const s = this.store.get(slot);
    return s ? migrate(s) : null;
  }
  async save(save: Save): Promise<void> {
    this.store.set(save.slot, JSON.parse(JSON.stringify(save)));
  }
  async list(): Promise<SaveMeta[]> {
    return [...this.store.values()].map(summarize).sort((a, b) => b.updatedAt - a.updatedAt);
  }
  async delete(slot: string): Promise<void> {
    this.store.delete(slot);
  }
}
