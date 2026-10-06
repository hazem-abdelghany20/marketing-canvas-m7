import type { Annotation, CanvasNode, Edge, NodeType } from "../types";

/**
 * The demo board as the API seeds it (api/seed.js), for tests that need a board with a shape: two goals, a chain under
 * each, assets and notes joined by relates-to, and one note joined to nothing. Same ids as the API, so a unit test and
 * an end-to-end spec talk about the same nodes.
 */
const T = "2026-09-02T00:00:00.000Z";

function node(id: string, type: NodeType, title: string, body = "", x = 0, y = 0): CanvasNode {
  return { id, type, title, body, fileIds: [], x, y, createdAt: T, updatedAt: T };
}

export const SEED_NODES: CanvasNode[] = [
  node("nd_goal_vayn", "goal", "Vayn: 500 orders/month by Q4", "Baseline is 180/month. The number that matters is repeat rate, not reach.", 240, 40),
  node("nd_goal_md", "goal", "Mental Diet: 1,000 course completions by December", "Completions, not enrolments. Enrolments are already fine.", 880, 40),
  node("nd_str_icp", "strategy", "Vayn ICP: 25-34 urban women", "Buys for herself, not for an occasion. Price-aware but not price-led.", 80, 260),
  node("nd_str_pos", "strategy", "Vayn positioning: quiet luxury, not fast fashion", "Never compete on discount. Compete on fabric and fit.", 420, 260),
  node("nd_str_voice", "strategy", "Mental Diet voice: clinician, not coach", "Dr Walaa speaks as a doctor. No hype verbs, no transformation language.", 880, 260),
  node("nd_cmp_ramadan", "campaign", "Vayn Ramadan push", "Three weeks. Lookbook-led, one email, two reels.", 60, 480),
  node("nd_cmp_linen", "campaign", "Vayn linen drop - September", "New SKU launch. Carousel + reel, no paid until organic proves the hook.", 400, 480),
  node("nd_cmp_ee", "campaign", "Mental Diet - Emotional Eating launch", "Webinar to course. The webinar is the offer, not the ad.", 880, 480),
  node("nd_con_linenstyle", "content", "Reel: 3 ways to style linen", "Hook lands at 0:02. Best performer of the drop so far.", 300, 700),
  node("nd_con_quiet", "content", "Carousel: what quiet luxury actually means", "Educational. Slower burn, higher saves.", 560, 700),
  node("nd_con_2am", "content", "Reel: the 2am hunger loop", "Dr Walaa on camera. Zero edit tricks, straight to the mechanism.", 880, 700),
  node("nd_con_email", "content", "Email: Ramadan lookbook drop", "Single CTA. No countdown timer.", 40, 700),
  node("nd_ast_lookbook", "asset", "vayn-lookbook.pdf", "", 40, 900),
  node("nd_ast_hero", "asset", "linen-shoot-hero.jpg", "", 300, 900),
  node("nd_not_price", "note", "Competitor dropped price 20%", "Held the line. Revisit if it persists past 6 weeks.", 620, 260),
  node("nd_not_reach", "note", "IG reach down 30% since the algo change", "Starts Aug 12. Affects every account, not just ours.", 620, 900),
];

const edge = (id: number, fromId: string, toId: string, kind: Edge["kind"] = "serves", label: string | null = null): Edge => ({
  id: `edg_${id}`,
  fromId,
  toId,
  kind,
  label,
});

export const SEED_EDGES: Edge[] = [
  edge(1, "nd_con_linenstyle", "nd_cmp_linen"),
  edge(2, "nd_con_quiet", "nd_cmp_linen"),
  edge(3, "nd_con_email", "nd_cmp_ramadan"),
  edge(4, "nd_con_2am", "nd_cmp_ee"),
  edge(5, "nd_cmp_ramadan", "nd_str_pos"),
  edge(6, "nd_cmp_linen", "nd_str_icp"),
  edge(7, "nd_cmp_ee", "nd_str_voice"),
  edge(8, "nd_str_icp", "nd_goal_vayn"),
  edge(9, "nd_str_pos", "nd_goal_vayn"),
  edge(10, "nd_str_voice", "nd_goal_md"),
  edge(11, "nd_ast_lookbook", "nd_cmp_ramadan", "relates-to"),
  edge(12, "nd_ast_hero", "nd_con_linenstyle", "relates-to"),
  edge(13, "nd_not_price", "nd_str_pos", "relates-to", "pressure"),
];

export const SEED_ANNOTATIONS: Annotation[] = [
  { id: "ann_1", nodeId: "nd_con_linenstyle", body: "Reshoot the hook at 0:02 - the pause reads as a mistake on mute.", createdAt: T },
  { id: "ann_2", nodeId: "nd_cmp_ee", body: "Webinar date moved to the 14th. Every asset referencing the 7th needs a pass.", createdAt: T },
  { id: "ann_3", nodeId: "nd_goal_vayn", body: "Repeat rate sat at 19% last month. That is the lever, not new traffic.", createdAt: T },
];

/** `id → node` and `id → edge`, the shape the store keeps. */
export const byIdMap = <T extends { id: string }>(list: T[]): Record<string, T> =>
  Object.fromEntries(list.map((item) => [item.id, item]));
