/**
 * Routing smoke for live-test prompts (no gateway — exercises Sterlon internals).
 * Run: node tools/sterlon-live-prompt-smoke.mjs
 *
 * Exits 1 if any assertion fails.
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { createSterlonVmContext, loadSterlonStack, loadSterlonPreChatStack, loadScript, visionboardRoot } from './load-sterlon-stack.mjs';

const ctx = createSterlonVmContext();
ctx.document = {
  addEventListener() {},
  documentElement: { dataset: {} }
};
ctx.localStorage = {
  getItem() { return null; },
  setItem() {},
  removeItem() {}
};
loadSterlonStack(ctx);
loadScript(ctx, 'assets/javascript/sterlon-gateway-client.js');
loadSterlonPreChatStack(ctx);
const chatPath = path.join(visionboardRoot, 'assets/javascript/sterlon-chat.js');
vm.runInContext(fs.readFileSync(chatPath, 'utf8'), ctx, { filename: 'sterlon-chat.js' });

const S = ctx.Sterlon;
const SPS = ctx.SterlonPairingSkills;

/** @type {Array<{ label: string, text: string, assertions: Record<string,any> }>} */
const prompts = [
  // ── Recommendation mode ───────────────────────────────────────────────────
  {
    label: 'pairing flight',
    text: 'Build me a bourbon and maduro pairing for after dinner — best, safe, and wildcard.',
    assertions: {
      runtimeMode: 'recommendation',
      expertiseIntent: false,
      isPairingIntent: true,
      includesPS120: true,
      excludesPS120: false,
      spiritOnlyExpected: false,
      cigarOnlyExpected: false
    }
  },
  {
    label: 'spirit only',
    text: 'Recommend a bourbon under $40 for the novice whiskey journey — spirit only, no cigar.',
    assertions: {
      runtimeMode: 'recommendation',
      expertiseIntent: false,
      isPairingIntent: false,
      includesPS120: false,
      excludesPS120: true,
      // explicit "spirit only, no cigar" phrasing must trigger isSpiritOnlyRequest
      spiritOnlyExpected: true,
      cigarOnlyExpected: false,
      // category filter: cigar-assuming skills must be excluded for spirit-only turns
      noneOf: ['PS-010', 'PS-011', 'PS-013', 'PS-030', 'PS-031', 'PS-032', 'PS-033', 'PS-040']
    }
  },
  {
    label: 'cigar flavor',
    // regression guard: "suggest a cigar" phrase triggers isCigarOnlyRequest
    text: 'Suggest a cigar with cocoa and espresso notes, medium-full body.',
    assertions: {
      runtimeMode: 'recommendation',
      expertiseIntent: false,
      isPairingIntent: false,
      includesPS120: false,
      excludesPS120: true,
      spiritOnlyExpected: false,
      cigarOnlyExpected: true,
      // category filter: spirit-paired WHISKEY/BOURBON skills must be excluded for cigar-only turns
      noneOf: ['PS-030', 'PS-031', 'PS-032', 'PS-033', 'PS-040']
    }
  },
  {
    label: 'spirit brand + family',
    // regression guard: matchMenuProductInText recursion was fixed; brand+journey should not crash
    text: 'Something from Woodford or Buffalo Trace, vanilla and caramel, intermediate journey.',
    assertions: {
      runtimeMode: 'recommendation',
      expertiseIntent: false,
      isPairingIntent: false,
      includesPS120: false,
      excludesPS120: true,
      spiritOnlyExpected: false,
      cigarOnlyExpected: false
    }
  },
  {
    label: 'change mind',
    text: 'Actually forget the pairing — just give me a peated scotch pour only.',
    assertions: {
      runtimeMode: 'recommendation',
      expertiseIntent: false,
      isPairingIntent: false,
      includesPS120: false,
      excludesPS120: true,
      spiritOnlyExpected: true,
      cigarOnlyExpected: false,
      noneOf: ['PS-010', 'PS-011', 'PS-013', 'PS-030', 'PS-031', 'PS-032', 'PS-033', 'PS-040']
    }
  },
  {
    label: 'novice under $40 spirit',
    text: 'Something novice and under $40 — spirit recommendation.',
    assertions: {
      runtimeMode: 'recommendation',
      expertiseIntent: false,
      isPairingIntent: false,
      includesPS120: false,
      excludesPS120: true,
      priceCeiling: 40,
      categoryFocusExpected: 'spirit'
    }
  },
  {
    label: 'brand hint woodford',
    text: 'Something from Woodford, intermediate journey.',
    assertions: {
      runtimeMode: 'recommendation',
      expertiseIntent: false,
      isPairingIntent: false,
      includesPS120: false,
      excludesPS120: true,
      brandHintExpected: 'woodford'
    }
  },
  {
    label: 'cigar by flavor notes',
    text: 'Suggest a cigar with cocoa, espresso and a full body.',
    assertions: {
      runtimeMode: 'recommendation',
      expertiseIntent: false,
      isPairingIntent: false,
      includesPS120: false,
      excludesPS120: true,
      categoryFocusExpected: 'cigar',
      spiritOnlyExpected: false,
      cigarOnlyExpected: true,
      noneOf: ['PS-030', 'PS-031', 'PS-032', 'PS-033', 'PS-040']
    }
  },
  // ── Expertise mode ────────────────────────────────────────────────────────
  {
    label: 'expertise — scotch regions',
    text: 'What makes a peated Islay scotch different from a Highland?',
    assertions: {
      runtimeMode: 'expertise',
      expertiseIntent: true,
      isPairingIntent: false,
      includesPS120: false,
      excludesPS120: true,
      categoryFocusExpected: 'spirit',
      spiritOnlyExpected: false,
      cigarOnlyExpected: false
    }
  },
  // ── Greeting mode ─────────────────────────────────────────────────────────
  {
    label: 'greeting — good evening',
    text: 'Good evening',
    assertions: {
      runtimeMode: 'greeting',
      expertiseIntent: false,
      isPairingIntent: false,
      includesPS120: false,
      excludesPS120: true,
      spiritOnlyExpected: false,
      cigarOnlyExpected: false
    }
  },
  // ── Clarification mode ────────────────────────────────────────────────────
  {
    label: 'clarification — vague opener',
    text: 'Hi there',
    assertions: {
      runtimeMode: 'clarification',
      expertiseIntent: false,
      isPairingIntent: false,
      includesPS120: false,
      excludesPS120: true,
      spiritOnlyExpected: false,
      cigarOnlyExpected: false
    }
  }
];

let failures = 0;

function assert(label, condition, msg) {
  if (!condition) {
    console.error(`  FAIL [${label}] ${msg}`);
    failures++;
  }
}

for (const p of prompts) {
  const mode = S.interpretRuntimeMode(p.text);
  const expertise = S.isExpertiseIntent(p.text);
  const spiritOnly = !!(S.isSpiritOnlyRequest && S.isSpiritOnlyRequest(p.text));
  const cigarOnly = !!(S.isCigarOnlyRequest && S.isCigarOnlyRequest(p.text));
  const categoryFocus = S.inferCategoryFocus ? (S.inferCategoryFocus(p.text) || 'open') : 'open';
  const pairingSkill = SPS ? !!SPS.isPairingIntent(p.text, { categoryFocus }) : false;
  const skillIds = SPS ? SPS.selectForTurn({ memberText: p.text, categoryFocus, maxSkills: 8 }).map((s) => s.id) : [];
  const hasPS120 = skillIds.includes('PS-120');
  const brandHint = S.detectBrandHint ? S.detectBrandHint(p.text) : null;
  const priceCeiling = S.parseBudgetCeiling ? S.parseBudgetCeiling(p.text) : null;

  console.log('\n---', p.label, '---');
  console.log('prompt:', p.text.slice(0, 72) + (p.text.length > 72 ? '…' : ''));
  console.log('runtimeMode:', mode);
  console.log('expertiseIntent:', expertise);
  console.log('spiritOnly:', spiritOnly, 'cigarOnly:', cigarOnly, 'categoryFocus:', categoryFocus);
  console.log('isPairingIntent:', pairingSkill);
  console.log('skills:', skillIds.join(', '));
  console.log('brandHint:', brandHint, '| priceCeiling:', priceCeiling);

  const a = p.assertions;
  assert(p.label, mode === a.runtimeMode, `runtimeMode=${mode}, want ${a.runtimeMode}`);
  assert(p.label, expertise === a.expertiseIntent, `expertiseIntent=${expertise}, want ${a.expertiseIntent}`);
  assert(p.label, pairingSkill === a.isPairingIntent, `isPairingIntent=${pairingSkill}, want ${a.isPairingIntent}`);
  if (a.includesPS120) assert(p.label, hasPS120, 'expected PS-120 in skills');
  if (a.excludesPS120) assert(p.label, !hasPS120, 'expected PS-120 NOT in skills');
  if (a.priceCeiling != null) assert(p.label, priceCeiling === a.priceCeiling, `priceCeiling=${priceCeiling}, want ${a.priceCeiling}`);
  if (a.brandHintExpected != null) assert(p.label, brandHint === a.brandHintExpected, `brandHint=${brandHint}, want ${a.brandHintExpected}`);
  if (a.categoryFocusExpected != null) assert(p.label, categoryFocus === a.categoryFocusExpected, `categoryFocus=${categoryFocus}, want ${a.categoryFocusExpected}`);
  if (a.spiritOnlyExpected != null) assert(p.label, spiritOnly === a.spiritOnlyExpected, `spiritOnly=${spiritOnly}, want ${a.spiritOnlyExpected}`);
  if (a.cigarOnlyExpected != null) assert(p.label, cigarOnly === a.cigarOnlyExpected, `cigarOnly=${cigarOnly}, want ${a.cigarOnlyExpected}`);
  if (a.noneOf) {
    for (const bannedId of a.noneOf) {
      assert(p.label, !skillIds.includes(bannedId), `skill ${bannedId} must NOT appear for ${categoryFocus}-focus turn`);
    }
  }
}

// ── Category-focus card-stripping tests ──────────────────────────────────────
// These call buildRecommendationTurnForPrompt (exposed on Sterlon) and verify that
// build-set.js post-processing + validateCards null out the irrelevant category field.
//
// Note: the degrade-copy stale-focus path (activeCategoryFocus='pairing' leaking into
// buildGracefulDegradationProse) cannot be exercised in this Node.js harness without
// mutating the session closure; it is verified in-browser via the live test suite.

console.log('\n\n=== Category focus card-stripping tests ===');

const CATEGORY_STRIP_CASES = [
  {
    // "no cigar" phrase triggers isSpiritOnlyRequest → categoryFocus='spirit' → cigar stripped
    label: 'spirit-only card → cigar null',
    text: 'Recommend a bourbon — no cigar, just the pour.',
    expectedCigar: null,
    expectedSpiritNonNull: true
  },
  {
    // "suggest a cigar" phrase triggers isCigarOnlyRequest → categoryFocus='cigar' → spirit stripped
    label: 'cigar-only card → spirit null',
    text: 'Suggest a cigar with cedar and pepper notes, cigar only.',
    expectedCigar: null,   // spirit null means best card has null spirit AND non-null cigar
    expectedSpiritNonNull: false
  }
];

for (const tc of CATEGORY_STRIP_CASES) {
  const turn = S.buildRecommendationTurnForPrompt ? S.buildRecommendationTurnForPrompt(tc.text) : null;
  const bestCard = turn && turn.cards && turn.cards[0] ? turn.cards[0] : null;

  console.log('\n---', tc.label, '---');
  console.log('prompt:', tc.text.slice(0, 72) + (tc.text.length > 72 ? '…' : ''));
  if (bestCard) {
    console.log('card.cigar:', bestCard.cigar, '| card.spirit:', bestCard.spirit);
  } else {
    console.log('(no turn / no card — RR may not be wired in this context)');
  }

  if (bestCard) {
    // spirit-only: cigar must be null
    if (tc.label.includes('spirit-only')) {
      assert(tc.label, bestCard.cigar === null, `expected card.cigar=null, got ${JSON.stringify(bestCard.cigar)}`);
      assert(tc.label, bestCard.spirit != null, `expected card.spirit non-null, got ${JSON.stringify(bestCard.spirit)}`);
    }
    // cigar-only: spirit must be null, cigar non-null
    if (tc.label.includes('cigar-only')) {
      assert(tc.label, bestCard.spirit === null, `expected card.spirit=null, got ${JSON.stringify(bestCard.spirit)}`);
      assert(tc.label, bestCard.cigar != null, `expected card.cigar non-null, got ${JSON.stringify(bestCard.cigar)}`);
    }
  }
}

const SR = ctx.SterlonRecommendations;

// ── Full-catalog allowlist after hydrate ────────────────────────────────────
if (SR && typeof SR.getMenuSpirits === 'function') {
  const spiritCount = SR.getMenuSpirits().length;
  console.log('\n--- catalog allowlist spirit count ---');
  console.log('spirit count:', spiritCount);
  assert('catalog allowlist', spiritCount >= 30, `expected >= 30 spirits, got ${spiritCount}`);

  const RR = ctx.RecommendationRuntime;
  if (RR && typeof RR.resolveRecommendationTurn === 'function') {
    const budgetTurn = RR.resolveRecommendationTurn({
      promptText: 'Whiskey under 40 dollars that is not too sweet',
      sessionRuntime: {}
    });
    const budgetSpirit = budgetTurn.cards && budgetTurn.cards[0] ? budgetTurn.cards[0].spirit : null;
    console.log('budget whiskey spirit:', budgetSpirit);
    const budgetVerify = SR.verifyRecommendationCards(budgetTurn.cards);
    assert('budget verify ok', budgetVerify.ok, `verify failed: ${JSON.stringify(budgetVerify.violations)}`);
  }
}

// ── validateCards category-focus stripping unit test ─────────────────────────
// Exercise SR.validateCards directly with categoryFocus option.
if (SR && typeof SR.validateCards === 'function') {
  console.log('\n--- validateCards categoryFocus:spirit strips cigar ---');
  const rawCards = [
    { label: 'Best Pick', tier: 'Classic', cigar: 'Padron 1926 No. 35', spirit: "Blanton's Single Barrel", food: null, why: [] }
  ];
  const validated = SR.validateCards(rawCards, '', { categoryFocus: 'spirit', journeyLevel: null }, () => 'bourbon');
  console.log('validated[0].cigar:', validated[0].cigar);
  assert('validateCards spirit strip', validated[0].cigar === null, `cigar should be null, got ${JSON.stringify(validated[0].cigar)}`);
  assert('validateCards spirit strip', validated[0].spirit != null, `spirit should be non-null`);

  console.log('\n--- validateCards categoryFocus:cigar strips spirit ---');
  const rawCards2 = [
    { label: 'Best Pick', tier: 'Classic', cigar: 'Padron 1926 No. 35', spirit: "Blanton's Single Barrel", food: null, why: [] }
  ];
  const validated2 = SR.validateCards(rawCards2, '', { categoryFocus: 'cigar', journeyLevel: null }, () => 'bourbon');
  console.log('validated2[0].spirit:', validated2[0].spirit);
  assert('validateCards cigar strip', validated2[0].spirit === null, `spirit should be null, got ${JSON.stringify(validated2[0].spirit)}`);
  assert('validateCards cigar strip', validated2[0].cigar != null, `cigar should be non-null`);
} else {
  console.log('\n(SterlonRecommendations not available — skipping validateCards unit test)');
}

console.log('\n' + (failures === 0 ? 'ALL ASSERTIONS PASSED' : `${failures} ASSERTION(S) FAILED`));
process.exit(failures > 0 ? 1 : 0);
