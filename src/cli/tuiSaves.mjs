// The character picker and what you can do to a save from it (phonecraft's save slots panel): play, back up,
// restore a backup, export to a file, import one, delete. Saves are files under ~/.azsh/saves; backups sit
// beside them in backups/. A delete or a restore always leaves a backup of what it replaced.
import { bold, dim, green, red, yellow, cyan } from './text.mjs';
import { className } from '../domain/core/ids.ts';

const when = (ms) => new Date(ms).toLocaleString();

/** The picker. `onPlay(save)` and `onNew()` hand the screen to the game. */
export async function savePicker(app, { onPlay, onNew }) {
  const repo = app.repo;
  const saves = await repo.list();
  const deleted = (await repo.listBackups?.()) ?? [];
  const live = new Set(saves.map((m) => m.slot));
  const orphans = [...new Map(deleted.filter((b) => !live.has(b.slot)).map((b) => [b.slot, b])).values()];
  const reopen = () => { app.stack = []; void savePicker(app, { onPlay, onNew }); };
  const options = saves.map((m) => ({
    label: `${bold(m.name)}  ${dim(`L${m.level} ${className(m.cls)}`)}`,
    detail: [bold(m.name), `Level ${m.level} ${className(m.cls)}`, dim(`last played ${when(m.updatedAt)}`), '', dim('Enter: play   m: back up, restore, export, delete')],
    value: { kind: 'play', meta: m },
  }));
  options.push({ label: green('New character'), value: { kind: 'new' } });
  if (repo.importSave) options.push({ label: dim('Import a save file'), value: { kind: 'import' } });
  for (const b of orphans) options.push({ label: dim(`Bring back ${b.name ?? b.slot} (deleted)`), value: { kind: 'restore', backup: b } });
  const view = app.pick('Choose a character', options, async (v) => {
    if (v.kind === 'new') return onNew();
    if (v.kind === 'import') return importFlow(app, reopen);
    if (v.kind === 'restore') { await repo.restoreBackup(v.backup.file); app.say(green(`${v.backup.name ?? v.backup.slot} is back.`)); return reopen(); }
    const save = await repo.load(v.meta.slot);
    if (save) onPlay(save);
  }, { hint: 'Enter: play' });
  view.keys = { m: { hint: 'manage', fn: (a, row) => { if (row?.data?.kind === 'play') manageMenu(a, row.data.meta, reopen); } } };
  app.render();
  return view;
}

function manageMenu(app, meta, reopen) {
  const repo = app.repo;
  app.pick(meta.name, [
    { label: 'Back it up now', value: async () => { const f = await repo.backup(meta.slot, 'by hand'); app.say(f ? green(`Backed up ${meta.name}.`) : red('Nothing to back up.')); app.render(); } },
    { label: 'Restore a backup', value: async () => restoreMenu(app, meta, reopen) },
    { label: 'Export to a file', value: async () => { const p = await repo.exportSave(meta.slot); app.say(p ? green(`Wrote ${p}`) : red('Could not export.')); app.render(); } },
    { label: red('Delete'), value: () => app.confirm(`Delete ${meta.name}? A backup is kept; "Bring back" on this list undoes it.`, async () => { await repo.delete(meta.slot); app.say(yellow(`${meta.name} deleted.`)); reopen(); }) },
  ], (fn) => { void fn(); });
}

async function restoreMenu(app, meta, reopen) {
  const list = await app.repo.listBackups(meta.slot);
  if (!list.length) { app.flashMsg(`No backups of ${meta.name} yet.`); app.render(); return; }
  app.pick(`${meta.name}: restore which?`, list.map((b) => ({
    label: `${when(b.at)}  ${dim(`L${b.level}${b.reason ? `, ${b.reason}` : ''}`)}`,
    value: b,
  })), (b) => app.confirm(`Restore ${meta.name} to ${when(b.at)}? What you have now is backed up first.`, async () => {
    await app.repo.restoreBackup(b.file);
    app.say(green(`${meta.name} restored to ${when(b.at)}.`));
    reopen();
  }));
  app.render();
}

function importFlow(app, reopen) {
  app.prompt('Save file to import (path): ', async (path) => {
    try {
      const save = await app.repo.importSave(path.trim().replace(/^"|"$/g, ''));
      app.say(save ? green(`Imported ${save.state.char.name}.`) : red('That file is not a save.'));
    } catch (err) { app.say(red(`Could not import: ${err.message}`)); }
    reopen();
  });
}
