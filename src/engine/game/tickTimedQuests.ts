// The timed-quest tick from Player::Update: fail the quest when the timer runs out, else count it down.
// One call site, the play-screen wall clock — the C++ has one Update diff, not a second combat clock.

export type TimedQuestTickRow = {
  entry: number;
  status: string;
  timerMs?: number;
};

export function tickTimedQuests(
  quests: TimedQuestTickRow[],
  dtMs: number,
  onFail: (entry: number) => void,
): void {
  if (!Number.isFinite(dtMs) || dtMs <= 0) return;
  for (const q of quests) {
    if (q.timerMs === undefined) continue;
    // m_timedquests holds incomplete AND complete-not-rewarded; RewardQuest removes the timer.
    if (q.status !== 'active' && q.status !== 'complete') continue;
    if (q.timerMs <= dtMs) {
      q.status = 'failed';
      q.timerMs = 0;
      onFail(q.entry);
    } else {
      q.timerMs -= dtMs;
    }
  }
}
