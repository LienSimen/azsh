// The two storey numbers, and why there are two. Seven declarations of "same floor" once shipped
// across the tree; these are the only two, and one storey of Blackrock Spire is ~14 yd.

// SAME FLOOR AT ALL: vertical slack that still counts as one storey — ramps, stairs, sticky-z
// error. Above it, aggro, combat distance and the world floor gate all treat it as another floor.
export const STOREY_DZ_YD = 10;

// CAN I ACTUALLY WALK TO IT — a grading number, not a gate: inside it a height difference is real
// distance, outside it the climb is charged on top. Tighter than STOREY_DZ_YD on purpose.
export const REACH_STOREY_DZ_YD = 8;
