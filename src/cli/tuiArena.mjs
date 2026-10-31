// Arena from the Honor window: the 1v1 against a duelist at your rating, and the 2v2, 3v3 and 5v5 with your
// companions (merc backfill for empty seats). Each is one fight in the live view; Esc forfeits. Settlement is
// phonecraft app.ts:1861: the rating moves on a win, a loss or a draw, and a win pays per-opponent duel honor
// plus the match bonus, banked into the week.
import { bold, dim, yellow, green, red, cyan } from './text.mjs';
import { startFight } from './tuiFight.mjs';
import { BATTLEGROUNDS } from '../domain/run/battlegroundRun.ts';
import { arenaRatingOf, ratingTier } from '../domain/bg/arenaRating.ts';
import { BG_TIERS } from '../domain/bg/bgTier.ts';
import { gauntletLength } from '../domain/bg/arenaComps.ts';

const H = (text) => ({ text, header: true });

/** A finished arena session as a FightOutcome: no xp, gold or loot. */
function arenaOutcome(r) {
  const won = r.winner === 'player';
  return { ok: true, outcome: r.winner === 'timeout' ? 'timeout' : won ? 'win' : 'defeat', result: r, xpGained: 0, goldGained: 0, loot: [], leveledTo: [], killCount: 0 };
}

function ratingSay(app, rated) {
  app.say(cyan(`Arena rating ${rated.rating}`) + dim(` (${rated.delta >= 0 ? '+' : ''}${rated.delta})`));
}

export function startArenaDuel(app) {
  const g = app.g;
  const res = g.arenaDuel();
  if (!app.result(res)) return;
  app.say(yellow(`Arena: ${res.targetName}, rating ${res.oppRating}. You are ${res.rating}.`));
  startFight(app, 0, {
    label: 'arena',
    begin: () => ({ ok: true, session: res.session, enemyName: res.targetName, enemyEntry: 0 }),
    resolve: (s) => {
      const r = s.result();
      const won = r.winner === 'player';
      g.settleArenaDuel(res.compId, won);
      ratingSay(app, g.settleArenaRating(1, res.oppRating, r.winner === 'timeout' ? 'draw' : won ? 'win' : 'loss'));
      if (won) {
        const { cp } = g.awardDuelHonor({ name: res.targetName, level: res.targetLevel });
        const bonus = g.awardArenaWinHonor().cp;
        app.say(yellow(cp > 0 ? `${cp + bonus} honor.` : `${bonus} honor. You already beat ${res.targetName} today.`));
      }
      return arenaOutcome(r);
    },
  });
}

export function startArenaMatch(app, bracket) {
  const g = app.g;
  const res = g.arenaMatch({ bracket });
  if (!app.result(res)) return;
  app.say(yellow(`Arena ${bracket}v${bracket}: ${res.name}, rating ${res.oppRating}. You are ${res.rating}.`) + dim(`  With you: ${res.allies.map((x) => x.name).join(', ') || 'nobody'}.`));
  startFight(app, 0, {
    label: 'arena',
    begin: () => ({ ok: true, session: res.session, enemyName: res.name, enemyEntry: 0 }),
    resolve: (s) => {
      const r = s.result();
      const won = r.winner === 'player';
      ratingSay(app, g.settleArenaRating(res.bracket, res.oppRating, r.winner === 'timeout' ? 'draw' : won ? 'win' : 'loss'));
      if (won) {
        let honor = 0;
        for (const o of res.opponents) honor += g.awardDuelHonor({ name: o.name, level: o.level }).cp;
        honor += g.awardArenaWinHonor().cp;
        app.say(yellow(`${honor} honor for the match.`));
      }
      return arenaOutcome(r);
    },
  });
}

/** The Arena section of the Honor window. */
export function arenaRows(app) {
  const st = app.g.state;
  const rows = [H(''), H(`${cyan('Arena')}  ${dim('last team standing; nobody respawns. Esc in the fight forfeits.')}`)];
  for (const b of Object.values(BATTLEGROUNDS).filter((x) => x.mode === 'arena')) {
    const bracket = b.teamSize;
    const rating = arenaRatingOf(st.arenaRating, bracket);
    const band = BG_TIERS[ratingTier(rating)]?.name ?? '';
    const extra = bracket === 1 ? `, gauntlet ${st.gauntletRung ?? 0}/${gauntletLength()}` : `, you and ${bracket - 1} companion${bracket === 2 ? '' : 's'}`;
    const open = app.ch.level >= b.minLevel;
    rows.push(open
      ? { text: `  ${b.name}  ${dim(`rating ${rating}, ${band}${extra}`)}`, act: (a) => (bracket === 1 ? startArenaDuel(a) : startArenaMatch(a, bracket)) }
      : H(dim(`  ${b.name}  level ${b.minLevel}`)));
  }
  return rows;
}
