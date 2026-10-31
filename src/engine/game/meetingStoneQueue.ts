// SCRIPT_COMMAND_MEETINGSTONE adds the player to the LFG queue for an area. The gossip host applies
// the intent, and an unread one is not done. Cite: ScriptMgr.cpp:3287-3307; LFGMgr.cpp:38-90.

/** Cite: wowm MeetingStoneStatus; LFGDefines.h. SMSG_MEETINGSTONE_SETQUEUE status byte. */
export const MEETINGSTONE_STATUS_LEAVE_QUEUE = 0;
export const MEETINGSTONE_STATUS_JOINED_QUEUE = 1;

/** GlobalStrings.lua (vanilla enUS). */
export const ERR_MEETING_STONE_IN_QUEUE_S = 'You are now in the queue to join a party for %s.';
export const ERR_MEETING_STONE_LEFT_QUEUE_S = 'You have left the queue to join a party for %s.';
export const LEAVE_QUEUE_LABEL = 'Leave Queue';
export const MEETINGSTONE_TOOLTIP = 'Looking for more for %s';
export const MEETINGSTONE_LEVEL = 'Level %d-%d';

export function formatMeetingStonePlace(template: string, place: string): string {
  return template.replace('%s', place);
}

export function formatMeetingStoneLevel(minLevel: number, maxLevel: number): string {
  return MEETINGSTONE_LEVEL.replace('%d', String(minLevel | 0)).replace('%d', String(maxLevel | 0));
}

export interface MeetingStoneQueueState {
  areaId: number;
  /** Leader+group queues the party; solo queues the player. Cite: LFGMgr.cpp:47–90 */
  mode: 'group' | 'player';
  status: typeof MEETINGSTONE_STATUS_JOINED_QUEUE;
}

export interface ApplyMeetingStoneQueueOpts {
  areaId: number;
  hasGroup: boolean;
  isLeader: boolean;
}

export interface ApplyMeetingStoneQueueResult {
  queued: boolean;
  areaId: number;
  mode?: 'group' | 'player';
  /** In-group non-leader is a no-op. Cite: LFGMgr.cpp:47–90 */
  skipped?: 'not_leader';
}

/** Materialize AddToQueue: group leader → party queue; no group → player queue. */
export function applyMeetingStoneQueue(
  opts: ApplyMeetingStoneQueueOpts,
): ApplyMeetingStoneQueueResult {
  const areaId = opts.areaId | 0;
  if (opts.hasGroup && !opts.isLeader) {
    return { queued: false, areaId, skipped: 'not_leader' };
  }
  const mode: 'group' | 'player' = opts.hasGroup && opts.isLeader ? 'group' : 'player';
  return { queued: true, areaId, mode };
}

export function meetingStoneQueueStateFromApply(
  applied: ApplyMeetingStoneQueueResult,
): MeetingStoneQueueState | null {
  if (!applied.queued || !applied.mode) return null;
  return {
    areaId: applied.areaId,
    mode: applied.mode,
    status: MEETINGSTONE_STATUS_JOINED_QUEUE,
  };
}

/** CMSG_MEETINGSTONE_LEAVE 0x293. Status LEAVE_QUEUE = 0. Cite: Opcodes.h; wowm MeetingStoneStatus. */
export function leaveMeetingStoneQueue(
  state: MeetingStoneQueueState | null | undefined,
): { left: boolean; areaId: number } {
  if (!state || state.status !== MEETINGSTONE_STATUS_JOINED_QUEUE) {
    return { left: false, areaId: state?.areaId ?? 0 };
  }
  return { left: true, areaId: state.areaId };
}
