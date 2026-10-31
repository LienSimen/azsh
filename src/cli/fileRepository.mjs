// SaveRepository on disk: one JSON file per slot under the saves dir (default ~/.azsh/saves).
// Same seam as phonecraft's MemorySaveRepository: migrate() on load, summarize() for list().
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { migrate, summarize } from '../persistence/saveShape.ts';

export const DEFAULT_SAVES_DIR = join(process.env.AZSH_HOME ?? join(homedir(), '.azsh'), 'saves');

const safeSlot = (slot) => String(slot).replace(/[^\w.-]/g, '_');

export class FileSaveRepository {
  constructor(dir = DEFAULT_SAVES_DIR) {
    this.dir = dir;
    mkdirSync(dir, { recursive: true });
  }
  path(slot) { return join(this.dir, `${safeSlot(slot)}.json`); }
  async load(slot) {
    const p = this.path(slot);
    if (!existsSync(p)) return null;
    return migrate(JSON.parse(readFileSync(p, 'utf8')));
  }
  async save(save) {
    const p = this.path(save.slot);
    const tmp = `${p}.tmp`;
    writeFileSync(tmp, JSON.stringify(save));
    renameSync(tmp, p);
  }
  async list() {
    const out = [];
    for (const f of readdirSync(this.dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const s = migrate(JSON.parse(readFileSync(join(this.dir, f), 'utf8')));
        if (s) out.push(summarize(s));
      } catch { /* a corrupt slot is skipped, not fatal */ }
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  async delete(slot) {
    const p = this.path(slot);
    if (existsSync(p)) unlinkSync(p);
  }
}
