'use strict'

// Seed data for the demo account. Reset at any time with GET /__reset.

const DEMO_BOARD_ID = 'brd_demo'

const nodes = [
  // goals
  { id: 'nd_goal_vayn', type: 'goal', title: 'Vayn: 500 orders/month by Q4', body: 'Baseline is 180/month. The number that matters is repeat rate, not reach.', x: 240, y: 40 },
  { id: 'nd_goal_md', type: 'goal', title: 'Mental Diet: 1,000 course completions by December', body: 'Completions, not enrolments. Enrolments are already fine.', x: 880, y: 40 },

  // strategy
  { id: 'nd_str_icp', type: 'strategy', title: 'Vayn ICP: 25-34 urban women', body: 'Buys for herself, not for an occasion. Price-aware but not price-led.', x: 80, y: 260 },
  { id: 'nd_str_pos', type: 'strategy', title: 'Vayn positioning: quiet luxury, not fast fashion', body: 'Never compete on discount. Compete on fabric and fit.', x: 420, y: 260 },
  { id: 'nd_str_voice', type: 'strategy', title: 'Mental Diet voice: clinician, not coach', body: 'Dr Walaa speaks as a doctor. No hype verbs, no transformation language.', x: 880, y: 260 },

  // campaigns
  { id: 'nd_cmp_ramadan', type: 'campaign', title: 'Vayn Ramadan push', body: 'Three weeks. Lookbook-led, one email, two reels.', x: 60, y: 480 },
  { id: 'nd_cmp_linen', type: 'campaign', title: 'Vayn linen drop - September', body: 'New SKU launch. Carousel + reel, no paid until organic proves the hook.', x: 400, y: 480 },
  { id: 'nd_cmp_ee', type: 'campaign', title: 'Mental Diet - Emotional Eating launch', body: 'Webinar to course. The webinar is the offer, not the ad.', x: 880, y: 480 },

  // content
  { id: 'nd_con_linenstyle', type: 'content', title: 'Reel: 3 ways to style linen', body: 'Hook lands at 0:02. Best performer of the drop so far.', x: 300, y: 700 },
  { id: 'nd_con_quiet', type: 'content', title: 'Carousel: what quiet luxury actually means', body: 'Educational. Slower burn, higher saves.', x: 560, y: 700 },
  { id: 'nd_con_2am', type: 'content', title: 'Reel: the 2am hunger loop', body: 'Dr Walaa on camera. Zero edit tricks, straight to the mechanism.', x: 880, y: 700 },
  { id: 'nd_con_email', type: 'content', title: 'Email: Ramadan lookbook drop', body: 'Single CTA. No countdown timer.', x: 40, y: 700 },

  // assets
  { id: 'nd_ast_lookbook', type: 'asset', title: 'vayn-lookbook.pdf', body: '', fileIds: ['fil_lookbook'], x: 40, y: 900 },
  { id: 'nd_ast_hero', type: 'asset', title: 'linen-shoot-hero.jpg', body: '', fileIds: ['fil_hero'], x: 300, y: 900 },

  // notes
  { id: 'nd_not_price', type: 'note', title: 'Competitor dropped price 20%', body: 'Held the line. Revisit if it persists past 6 weeks.', x: 620, y: 260 },
  { id: 'nd_not_reach', type: 'note', title: 'IG reach down 30% since the algo change', body: 'Starts Aug 12. Affects every account, not just ours.', x: 620, y: 900 },
]

const edges = [
  // the traceability spine: content -> campaign -> strategy -> goal
  { id: 'edg_1', fromId: 'nd_con_linenstyle', toId: 'nd_cmp_linen', kind: 'serves' },
  { id: 'edg_2', fromId: 'nd_con_quiet', toId: 'nd_cmp_linen', kind: 'serves' },
  { id: 'edg_3', fromId: 'nd_con_email', toId: 'nd_cmp_ramadan', kind: 'serves' },
  { id: 'edg_4', fromId: 'nd_con_2am', toId: 'nd_cmp_ee', kind: 'serves' },
  { id: 'edg_5', fromId: 'nd_cmp_ramadan', toId: 'nd_str_pos', kind: 'serves' },
  { id: 'edg_6', fromId: 'nd_cmp_linen', toId: 'nd_str_icp', kind: 'serves' },
  { id: 'edg_7', fromId: 'nd_cmp_ee', toId: 'nd_str_voice', kind: 'serves' },
  { id: 'edg_8', fromId: 'nd_str_icp', toId: 'nd_goal_vayn', kind: 'serves' },
  { id: 'edg_9', fromId: 'nd_str_pos', toId: 'nd_goal_vayn', kind: 'serves' },
  { id: 'edg_10', fromId: 'nd_str_voice', toId: 'nd_goal_md', kind: 'serves' },

  // loose relations
  { id: 'edg_11', fromId: 'nd_ast_lookbook', toId: 'nd_cmp_ramadan', kind: 'relates-to' },
  { id: 'edg_12', fromId: 'nd_ast_hero', toId: 'nd_con_linenstyle', kind: 'relates-to' },
  { id: 'edg_13', fromId: 'nd_not_price', toId: 'nd_str_pos', kind: 'relates-to', label: 'pressure' },
]

const annotations = [
  { id: 'ann_1', nodeId: 'nd_con_linenstyle', body: 'Reshoot the hook at 0:02 - the pause reads as a mistake on mute.' },
  { id: 'ann_2', nodeId: 'nd_cmp_ee', body: 'Webinar date moved to the 14th. Every asset referencing the 7th needs a pass.' },
  { id: 'ann_3', nodeId: 'nd_goal_vayn', body: 'Repeat rate sat at 19% last month. That is the lever, not new traffic.' },
]

const files = [
  { id: 'fil_lookbook', name: 'vayn-lookbook.pdf', mime: 'application/pdf', sizeBytes: 4_182_339 },
  { id: 'fil_hero', name: 'linen-shoot-hero.jpg', mime: 'image/jpeg', sizeBytes: 1_204_887 },
]

function buildSeed(now = '2026-08-01T09:00:00.000Z') {
  return {
    users: [
      {
        id: 'usr_demo',
        name: 'Demo',
        email: 'demo@marketingcanvas.dev',
        password: 'password123',
        avatarUrl: null,
        boardId: DEMO_BOARD_ID,
      },
    ],
    boards: [
      { id: DEMO_BOARD_ID, name: 'Marketing Canvas', viewport: { x: 0, y: 0, zoom: 0.8 } },
    ],
    nodes: nodes.map((n) => ({
      fileIds: [],
      body: '',
      ...n,
      boardId: DEMO_BOARD_ID,
      createdAt: now,
      updatedAt: now,
    })),
    edges: edges.map((e) => ({ label: null, ...e, boardId: DEMO_BOARD_ID })),
    annotations: annotations.map((a) => ({ ...a, createdAt: now })),
    files: files.map((f) => ({ ...f, thumbUrl: null, boardId: DEMO_BOARD_ID, createdAt: now })),
    strokes: [],
    marks: [],
    pins: [],
    comments: [],
    sessions: {},
  }
}

module.exports = { buildSeed, DEMO_BOARD_ID }
