// The Sim Lab's target roster. Every row is a real creature_template the 1.12 world DB ships —
// Blizzard's own parse targets — so an armor or resistance number here is a row, not a knob.
// Cite: src/data/tables/creatures.json entries below; Unit.h:485 UNIT_FLAG_STUNNED.

export interface DummyTarget {
  /** creature_template.entry. */
  entry: number;
  /** What the picker shows. */
  label: string;
  /** The one fact that makes this row a different test. */
  note: string;
}

// Ordered hardest-armor first: a rotation is normally benched against the raid-boss wall.
export const DUMMY_TARGETS: readonly DummyTarget[] = [
  { entry: 14831, label: 'Raid boss dummy (63)', note: '4691 armor, the level a raid boss sits at' },
  { entry: 14830, label: 'Plate dummy (60)', note: '3791 armor' },
  { entry: 9659, label: 'Cloth dummy (60)', note: '1923 armor' },
  { entry: 12916, label: 'Warded dummy (60)', note: '1923 armor, 60 resistance in every school' },
  { entry: 12917, label: 'Immune dummy (60)', note: '1923 armor, 255 resistance in every school' },
  { entry: 12426, label: 'Masterwork Target Dummy (55)', note: '15 armor, the engineering dummy' },
  { entry: 2673, label: 'Target Dummy (20)', note: '15 armor, the low-level engineering dummy' },
];

export const DEFAULT_DUMMY_ENTRY = 14831;

export function dummyTarget(entry: number): DummyTarget | undefined {
  return DUMMY_TARGETS.find((d) => d.entry === entry);
}
