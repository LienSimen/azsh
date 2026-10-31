// ---- Trainers -------------------------------------------------------------

export interface TrainerSpellDef {
  spell: number;
  cost: number;              // copper
  reqLevel: number;
  reqSkill: number;
  reqSkillValue: number;
}
export interface TrainerDef {
  entry: number;
  name: string;
  /** creature_template.SubName — e.g. "Weapon Master" for TrainerType=2 masters. */
  subname?: string;
  spells: TrainerSpellDef[];
}

// ---- Vendors --------------------------------------------------------------

// An NPC merchant. `items` lists every offered item id, and rows with a non-zero npc_vendor
// condition_id are ALSO recorded in `itemConditions` so the conditions engine can gate them.
export interface VendorDef {
  entry: number;
  name: string;
  subname?: string;          // the NPC's trade title ("Reagent Vendor", "General Goods") — creature_template.SubName; UI label + icon
  items: number[];           // item entries offered for sale (includes conditional stock item ids)
  // Conditional stock only (npc_vendor / npc_vendor_template condition_id ≠ 0). Each `item` also appears in
  // `items`. Absent / empty ⇒ all stock is unconditional.
  itemConditions?: Array<{ item: number; conditionId: number }>;
  /** Limited stock rows (npc_vendor maxcount/incrtime). Absent ⇒ unlimited. */
  stock?: Array<{ item: number; maxcount: number; incrtime: number }>;
  /** Offers the repair service (creature_template.NpcFlags & UNIT_NPC_FLAG_REPAIR). */
  canRepair?: boolean;
  // Visual PvP rank (1..14) needed to REACH this vendor, for the NPCs behind a rank-gated door.
  // Those maps have no WorldMapArea rect, so the door check travels on the vendor row.
  requiredVisualRank?: number;
}

// One npc_text row: the body an NPC says above its gossip options, up to 8 weighted slots.
// `female` appears only when it differs from `male`. Cite: ObjectMgr.cpp:5555-5673 LoadGossipText.
export interface NpcTextDef {
  id: number;
  slots: Array<{ prob: number; male: string; female?: string }>;
}
