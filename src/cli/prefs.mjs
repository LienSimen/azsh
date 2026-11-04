// Terminal preferences that are not part of a character: auto-loot and the like. The web client keeps these in
// the browser's settings store, so they are per device here too: one JSON file next to the saves.
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const PREF_DEFAULTS = { autoLoot: true };

/** In memory only (the check script). `FilePrefs` writes through to disk. */
export class MemoryPrefs {
  constructor(values = {}) { this.values = { ...PREF_DEFAULTS, ...values }; }
  get(key) { return this.values[key] ?? PREF_DEFAULTS[key]; }
  set(key, value) { this.values[key] = value; this.flush(); }
  flush() {}
}

export class FilePrefs extends MemoryPrefs {
  constructor(path = join(process.env.AZSH_HOME ?? join(homedir(), '.azsh'), 'prefs.json')) {
    let stored = {};
    try { if (existsSync(path)) stored = JSON.parse(readFileSync(path, 'utf8')); } catch { /* a broken file falls back to defaults */ }
    super(stored);
    this.path = path;
  }
  flush() {
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      writeFileSync(`${this.path}.tmp`, JSON.stringify(this.values, null, 2));
      renameSync(`${this.path}.tmp`, this.path);
    } catch { /* preferences are a convenience; a read-only home must not stop the game */ }
  }
}
