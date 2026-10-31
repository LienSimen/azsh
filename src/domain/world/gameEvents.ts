// Date-driven game event activation — holidays, the Darkmoon Faire, invasions. Pure: no wall clock
// unless the caller injects one. Cite: GameEventMgr.cpp CheckOneGameEvent ~36–39.

/** Seconds per minute — Common.h MINUTE = 60. */
export const MINUTE_SEC = 60;

// Event definition matching game_event / GameEventData fields used by CheckOneGameEvent. Times are unix
// seconds (CMaNGOS time_t).
export interface GameEventDef {
  id: number;
  // Inclusive window open (unix sec). Cite: GameEventData.start. From game_event_time for DATE/YEARLY
  // schedules — omit when unknown (event never active).
  start?: number;
  // Exclusive window close (unix sec). Cite: GameEventData.end. From game_event_time — omit when unknown.
  end?: number;
  /** Delay in **minutes** between occurrences. Cite: GameEventData.occurence */
  occurence: number;
  /** Active length in **minutes** within each occurrence cycle. Cite: GameEventData.length */
  length: number;
  /** Optional linked parent event id (must also be active). */
  linkedTo?: number;
  /** game_event.schedule_type (GameEventScheduleType). */
  scheduleType?: number;
  // Holidays.dbc id when this event drives a holiday (0 = none). Cite: GameEventData.holiday_id;
  // SharedDefines.h HOLIDAY_*.
  holiday?: number;
}

/** Holidays.dbc id for Hallow's End. Cite: SharedDefines.h:1209 HOLIDAY_HALLOWS_END = 324. */
export const HOLIDAY_ID_HALLOWS_END = 324;

// game_event.id for the main Hallow's End window (holiday 324). Cite: game_event row id 12 description
// "Hallow's End".
export const GAME_EVENT_HALLOWS_END = 12;

// Whether a single event is active at `nowMs`: start before now, now before end, and the elapsed time
// modulo the occurrence under the length. Both are minutes; a non-positive one is never active.
export function isEventActive(event: GameEventDef, nowMs: number): boolean {
  if (event.length <= 0 || event.occurence <= 0) return false;
  // Without real start/end from game_event_time (or computed schedule), cannot activate.
  if (event.start == null || event.end == null) return false;
  const nowSec = Math.floor(nowMs / 1000);
  if (!(event.start < nowSec && nowSec < event.end)) return false;

  const cycleSec = event.occurence * MINUTE_SEC;
  const lengthSec = event.length * MINUTE_SEC;
  // C++ unsigned mod: ensure non-negative remainder
  const elapsed = nowSec - event.start;
  const intoCycle = ((elapsed % cycleSec) + cycleSec) % cycleSec;
  return intoCycle < lengthSec;
}

// Active event id set at `nowMs`, honouring optional `linkedTo` dependency. Cite: GameEventMgr::Update —
// only start if linkedTo == 0 || IsActiveEvent(linkedTo).
export function activeEventIds(
  events: readonly GameEventDef[],
  nowMs: number,
): Set<number> {
  const byId = new Map(events.map((e) => [e.id, e]));
  const memo = new Map<number, boolean>();

  const active = (id: number, stack: Set<number>): boolean => {
    if (memo.has(id)) return memo.get(id)!;
    if (stack.has(id)) return false; // cycle guard
    const ev = byId.get(id);
    if (!ev) {
      memo.set(id, false);
      return false;
    }
    stack.add(id);
    let ok = isEventActive(ev, nowMs);
    if (ok && ev.linkedTo != null && ev.linkedTo !== 0) {
      ok = active(ev.linkedTo, stack);
    }
    stack.delete(id);
    memo.set(id, ok);
    return ok;
  };

  const out = new Set<number>();
  for (const e of events) {
    if (active(e.id, new Set())) out.add(e.id);
  }
  return out;
}

/** Convenience: true if `eventId` is in the active set. */
export function isEventIdActive(
  events: readonly GameEventDef[],
  eventId: number,
  nowMs: number,
): boolean {
  return activeEventIds(events, nowMs).has(eventId);
}

// Holidays.dbc ids of currently active game_events. Cite: GameEventMgr.cpp:1136-1146 IsActiveHoliday —
// holiday_id of any m_activeEvents entry.
export function activeHolidayIds(
  events: readonly GameEventDef[],
  nowMs: number,
): Set<number> {
  const active = activeEventIds(events, nowMs);
  const out = new Set<number>();
  for (const e of events) {
    if (e.holiday && e.holiday > 0 && active.has(e.id)) out.add(e.holiday);
  }
  return out;
}

// Whether any active game_event carries the given Holidays.dbc id. Cite: GameEventMgr.cpp:1136-1146
// IsActiveHoliday; Conditions.cpp:318-321 type 26.
export function isHolidayActive(
  events: readonly GameEventDef[],
  holidayId: number,
  nowMs: number,
): boolean {
  if (holidayId <= 0) return false;
  return activeHolidayIds(events, nowMs).has(holidayId);
}
