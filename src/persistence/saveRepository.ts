// The persistence seam. The IndexedDB implementation is the default; a server-DB implementation could later
// satisfy the same interface (must be same-origin under the site CSP) without touching the engine or UI.

import type { Save, SaveMeta } from './saveShape.ts';

export interface SaveRepository {
  load(slot: string): Promise<Save | null>;
  save(save: Save): Promise<void>;
  list(): Promise<SaveMeta[]>;
  delete(slot: string): Promise<void>;
}
