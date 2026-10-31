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
    if (!existsSync(p)) return;
    // A deleted character keeps one last backup, so the delete can be undone from the backups.
    await this.backup(slot, 'deleted');
    unlinkSync(p);
  }

  // ---- backups, export, import ----------------------------------------------------------------------
  // Backups live in <saves>/backups as <slot>@<ms>[-reason].json; a restore first backs up what it replaces.

  backupDir() { return join(this.dir, 'backups'); }

  async backup(slot, reason = '') {
    const p = this.path(slot);
    if (!existsSync(p)) return null;
    mkdirSync(this.backupDir(), { recursive: true });
    const file = `${safeSlot(slot)}@${Date.now()}${reason ? `-${safeSlot(reason)}` : ''}.json`;
    writeFileSync(join(this.backupDir(), file), readFileSync(p));
    return file;
  }

  /** Backups of one slot (or every slot), newest first: `{ file, slot, at, reason, name, level }`. */
  async listBackups(slot) {
    if (!existsSync(this.backupDir())) return [];
    const out = [];
    for (const file of readdirSync(this.backupDir())) {
      const m = file.match(/^(.+)@(\d+)(?:-(.+))?\.json$/);
      if (!m || (slot != null && m[1] !== safeSlot(slot))) continue;
      let meta = {};
      try { meta = summarize(migrate(JSON.parse(readFileSync(join(this.backupDir(), file), 'utf8')))); } catch { continue; }
      out.push({ file, slot: m[1], at: Number(m[2]), reason: m[3] ?? '', name: meta.name, level: meta.level });
    }
    return out.sort((a, b) => b.at - a.at);
  }

  async restoreBackup(file) {
    const raw = JSON.parse(readFileSync(join(this.backupDir(), file), 'utf8'));
    const save = migrate(raw);
    if (!save) return null;
    await this.backup(save.slot, 'replaced');
    const restored = { ...save, updatedAt: Date.now() };
    await this.save(restored);
    return restored;
  }

  /** Write one character to a file anywhere (default: the home folder). Returns the path. */
  async exportSave(slot, path) {
    const save = await this.load(slot);
    if (!save) return null;
    const out = path ?? join(homedir(), `azsh-${safeSlot(save.state.char.name)}-${new Date().toISOString().slice(0, 10)}.json`);
    writeFileSync(out, JSON.stringify(save, null, 1));
    return out;
  }

  /** Read a save file into a new slot (never over an existing one). Returns the save. */
  async importSave(path) {
    const save = migrate(JSON.parse(readFileSync(path, 'utf8')));
    if (!save) return null;
    let slot = save.slot;
    if (existsSync(this.path(slot))) slot = `${safeSlot(save.state.char.name).toLowerCase()}-${Date.now().toString(36)}`;
    const imported = { ...save, slot, updatedAt: Date.now() };
    await this.save(imported);
    return imported;
  }
}
