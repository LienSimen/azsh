// Your pet (hunter, warlock): the page with command, react, food and abilities; the stable; the pet trainer.
// Ports phonecraft playChrome.ts's feed modal, render/petBar.ts, panels/stablePanel.ts and the pet trainer rows.
import { bold, dim, cyan, yellow, green, red, itemText } from './text.mjs';
import { itemLines, spellLines } from './tuiViews.mjs';
import { moneyText } from '../domain/economy/money.ts';
import { LOYALTY_NAMES, petHasHappiness, petKnownSpells, petAutocastOn } from '../domain/pet/pet.ts';
import { MAX_PET_STABLES, STABLE_SLOT_PRICES } from '../domain/pet/petStable.ts';
import { zonePetTrainers } from '../world/world.ts';
import { MAX_SOUL_SHARD_CAP } from '../autopilot/config.ts';

const H = (text) => ({ text, header: true });
const HUNTER = 3, WARLOCK = 9;
export const hasPetClass = (app) => app.ch.cls === HUNTER || app.ch.cls === WARLOCK;

function petStatus(app, pet) {
  const cdef = app.ds.creature(pet.creature);
  const bits = [`${pet.health <= 0 ? red('dead') : `${pet.health} health`}`];
  if (cdef && petHasHappiness(cdef)) bits.push(`happiness ${pet.happiness}%`, LOYALTY_NAMES[pet.loyalty ?? 1] ?? '');
  if (pet.trainingPoints != null) bits.push(`${pet.trainingPoints} training points`);
  return bits.filter(Boolean).join(', ');
}

/** Bag food this pet eats: the item's food type against the beast's diet (feedPet refuses the rest). */
function bagFood(app) {
  const seen = new Set();
  return app.g.state.inventory.stacks.map((s) => app.ds.item(s.item)).filter((it) => it && it.consumable?.effect === 'food' && !seen.has(it.entry) && seen.add(it.entry));
}

export function petDialog(app) {
  return {
    id: 'pet', title: 'Pet', hint: 'Enter: choose',
    rows(a) {
      const g = a.g, ch = a.ch, pet = ch.pet;
      const rows = [H(pet ? `${bold(pet.name)}  ${dim(a.ds.creature(pet.creature)?.name ?? '')}   ${petStatus(a, pet)}` : bold('No pet out'))];
      if (!pet) {
        rows.push(H(dim(ch.cls === HUNTER ? (ch.storedPet ? `${ch.storedPet.name} waits: Call Pet from the Spells tab.` : 'Tame a beast: t on a tameable creature on the World tab.') : 'Summon a demon from the Spells tab.')));
      } else {
        rows.push(H(''), H('Orders'));
        rows.push({ text: `Command: ${cyan(pet.command ?? 'follow')}`, detail: () => [bold('Command'), '', 'Follow: it comes with you and fights beside you. Stay: it holds where it is.', '', dim('Enter: switch')], act: () => a.result(g.setPetCommand((pet.command ?? 'follow') === 'follow' ? 'stay' : 'follow')) });
        const reacts = ['aggressive', 'defensive', 'passive'];
        rows.push({ text: `Reaction: ${cyan(pet.react ?? 'defensive')}`, detail: () => [bold('Reaction'), '', 'Aggressive attacks what comes near; defensive answers what attacks you or it; passive never starts a fight.', '', dim('Enter: next')], act: () => a.result(g.setPetReact(reacts[(reacts.indexOf(pet.react ?? 'defensive') + 1) % 3])) });
        const cdef = a.ds.creature(pet.creature);
        if (cdef && petHasHappiness(cdef)) {
          const foods = bagFood(a);
          rows.push(H(''), H(`Food ${pet.autoFeed ? dim(`auto-feeds ${a.itemLabel(pet.autoFeed)}`) : dim('no auto-feed')}`));
          rows.push({ text: 'Feed it…', detail: () => [bold('Feed'), '', 'Raises its happiness; a happy pet hits harder and grows loyal.'], act: () => { if (!foods.length) { a.flashMsg('No food in your bags.'); return; } a.pick('Feed it what?', foods.map((f) => ({ label: f.name, detail: () => itemLines(a, f), value: f })), (f) => a.result(g.feedPet(f.entry), `${pet.name} eats ${f.name}.`)); } });
          rows.push({ text: 'Auto-feed…', detail: () => [bold('Auto-feed'), '', 'Between fights it eats this whenever its happiness has room for it.'], act: () => a.pick('Auto-feed with', [{ label: dim('Nothing'), value: null }, ...foods.map((f) => ({ label: itemText(f), value: f.entry }))], (e) => a.result(g.setPetAutoFeed(e), e ? `${pet.name} eats ${a.itemLabel(e)} on its own.` : 'Auto-feed off.')) });
        }
        if (cdef && pet.health > 0) {
          rows.push(H(''), H(`Abilities ${dim('Enter: autocast on or off')}`));
          for (const s of petKnownSpells(ch, cdef, a.ds)) {
            const on = petAutocastOn(pet, s, a.ds);
            rows.push({ text: `${on ? green('✓') : dim('·')} ${s.name}${s.rank ? dim(` (Rank ${s.rank})`) : ''}`, detail: () => spellLines(a, s, ['', on ? 'Autocast on.' : 'Autocast off: it stays learned but out of the fight kit.']), act: () => a.result(g.togglePetAutocast(s.id)) });
          }
        }
        if (ch.cls === HUNTER && (ch.petSpells ?? []).length) {
          const taught = new Set(pet.taughtSpells ?? []);
          const teach = ch.petSpells.filter((id) => !taught.has(id)).map((id) => a.ds.spell(id)).filter(Boolean);
          if (teach.length) rows.push({ text: `Beast Training: teach it… ${dim(`(${teach.length})`)}`, detail: () => [bold('Beast Training'), '', 'Teach your pet a rank you bought at a pet trainer, spending its training points.'], act: () => a.pick('Teach it', teach.map((sp) => ({ label: `${sp.name}${sp.rank ? dim(` (Rank ${sp.rank})`) : ''}`, detail: () => spellLines(a, sp), value: sp })), (sp) => a.result(g.teachPetSpell(sp.id), `${pet.name} learns ${sp.name}.`)) });
        }
        rows.push(H(''), { text: red('Dismiss it'), act: () => a.result(g.dismissPet(), `${pet.name} leaves.`) });
      }
      const books = a.g.state.inventory.stacks.map((s) => a.ds.item(s.item)).filter((it) => it?.teachPetSpell);
      if (books.length) rows.push(H(''), ...books.map((b) => ({ text: `Read ${b.name}`, detail: () => itemLines(a, b), act: () => { const r = g.trainPet(b.entry); a.result(r, r.ok ? `Your pet can now learn ${r.name}.` : ''); } })));
      if (ch.cls === HUNTER) rows.push(...stableRows(a));
      if (ch.cls === WARLOCK) {
        const cfg = g.autopilotConfig();
        rows.push(H(''), { text: `Soul Shards to keep: ${cyan(String(cfg.keepSoulShards))}`, detail: () => [bold('Soul Shard cap'), '', 'Auto-play stops casting Drain Soul once you carry this many shards. 0 never farms them.', '', dim('Enter: type a number')], act: () => a.prompt(`Shards to keep (0-${MAX_SOUL_SHARD_CAP}): `, (t) => { const n = Math.max(0, Math.min(MAX_SOUL_SHARD_CAP, Math.round(Number(t)))); if (Number.isFinite(n)) g.setAutopilotConfig({ ...g.autopilotConfig(), keepSoulShards: n }); a.afterAction(); }, String(cfg.keepSoulShards)) });
      }
      return rows;
    },
  };
}

function stableRows(app) {
  const g = app.g, ch = app.ch;
  const slots = ch.stableSlots ?? 0;
  const rows = [H(''), H(`Stable ${dim(`${slots} of ${MAX_PET_STABLES} slots bought`)}`)];
  for (let i = 0; i < slots; i++) {
    const p = ch.stablePets?.[i];
    rows.push({ text: `  Slot ${i + 1}: ${p ? `${p.name} ${dim(app.ds.creature(p.creature)?.name ?? '')}` : dim('empty')}`, detail: () => [bold(`Stable slot ${i + 1}`), '', p ? `Enter: call ${p.name}${ch.pet ? `, stabling ${ch.pet.name} in its place` : ''}.` : 'Empty.'], act: () => { if (p) app.result(g.callStabledPet(i + 1), `${p.name} comes to you.`); } });
  }
  if (ch.pet || ch.storedPet) rows.push({ text: `Stable ${(ch.pet ?? ch.storedPet).name}`, act: () => { const r = g.stablePet(); app.result(r, r.ok ? `Stabled in slot ${r.slot}.` : ''); } });
  if (slots < MAX_PET_STABLES) rows.push({ text: `Buy a stable slot ${yellow(moneyText(STABLE_SLOT_PRICES[slots] ?? 0))}`, act: () => { const r = g.buyStableSlot(); app.result(r, r.ok ? `A stable slot for ${moneyText(r.spent)}.` : ''); } });
  return rows;
}

/** World tab rows: your pet, and the zone's pet trainers (hunters). */
export function petWorldRows(app) {
  if (!hasPetClass(app)) return [];
  const pet = app.ch.pet;
  const rows = [{ text: `${cyan('Pet')}: ${pet ? `${pet.name} ${dim(petStatus(app, pet))}` : dim('none out')}`, detail: () => [bold('Pet'), '', dim('Enter: the pet page')], act: () => app.push(petDialog(app)) }];
  if (app.ch.cls === HUNTER) for (const t of zonePetTrainers(app.ds, app.ch.zoneId)) rows.push({ text: `${t.name} ${dim('<Pet Trainer>')}`, detail: () => [bold(t.name), 'Pet trainer', '', dim('Enter: ranks for your Beast Training')], act: () => app.push(petTrainerDialog(app, t)) });
  return rows;
}

export function petTrainerDialog(app, trainer) {
  return {
    id: `pettrainer-${trainer.entry}`, title: trainer.name, hint: 'Enter: buy the rank',
    rows(a) {
      const known = new Set(a.ch.petSpells ?? []);
      const rows = [H(`${bold(trainer.name)} ${dim('<Pet Trainer>')}   ${yellow(moneyText(a.ch.gold) || '0c')}`), H(dim('A rank bought here is yours for good; Beast Training teaches it to whichever pet is out.')), H('')];
      const list = trainer.spells.map((ts) => ({ ts, sp: a.ds.spell(ts.spell) })).filter((x) => x.sp).sort((x, y) => x.ts.reqLevel - y.ts.reqLevel || x.sp.name.localeCompare(y.sp.name));
      for (const { ts, sp } of list) {
        const have = known.has(sp.id), low = ts.reqLevel > a.ch.level;
        rows.push({
          text: `${have ? green('✓ ') : '  '}${low || have ? dim(sp.name) : sp.name}${sp.rank ? dim(` (Rank ${sp.rank})`) : ''}  ${yellow(moneyText(ts.cost) || 'free')}${low ? red(`  level ${ts.reqLevel}`) : ''}`,
          detail: () => spellLines(a, sp, ['', `Cost: ${yellow(moneyText(ts.cost) || 'free')}`]),
          act: () => { if (!have) a.result(a.g.buyPetSpell(trainer.entry, sp.id), `You learn ${sp.name} for your pets.`); },
        });
      }
      return rows;
    },
  };
}

