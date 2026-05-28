import { createSterlonVmContext, loadSterlonStack } from './load-sterlon-stack.mjs';
import { executeFreezeCase } from './sterlon-reco-freeze/execute.mjs';

const ctx = createSterlonVmContext();
loadSterlonStack(ctx);
const RT = ctx.SterlonChatRouter;
const RR = ctx.RecommendationRuntime;
const pid = ctx.RecommendationProductIds;

const routingCases = [
  {
    id: 'pair-morning-espresso',
    text: 'Pair a cigar with a morning espresso. I want something elegant, smooth, and not too heavy for an early smoke.',
    expectFocus: 'pairing'
  },
  {
    id: 'need-cigar-coffee',
    text: 'I need a cigar with my morning espresso',
    expectFocus: 'cigar'
  },
  {
    id: 'cigar-only-explicit',
    text: 'Recommend a cigar only',
    expectFocus: 'cigar'
  }
];

console.log('=== routing probes ===');
for (const c of routingCases) {
  const focus = RT.inferCategoryFocus(c.text);
  const ok = focus === c.expectFocus;
  console.log(c.id, focus, ok ? 'OK' : 'FAIL (want ' + c.expectFocus + ')');
}

const regression = executeFreezeCase(ctx, {
  op: 'guestQualityAuthority',
  cases: [
    {
      id: 'old-forester-maduro-locked',
      promptText: "I'm drinking Old Forester 1920 and want a maduro cigar",
      categoryFocus: 'pairing',
      journeyLevel: 'intermediate',
      expectNamedSpiritId: 'spi-trk-of-1920',
      expectSpiritLockedAllSlots: true,
      expectAllMaduroCigars: true,
      forbidLigeroHeavyOnAnchorSlots: ['best', 'safe']
    },
    {
      id: 'old-forester-after-dinner-maduro',
      promptText:
        "I'm drinking Old Forester 1920 after dinner and want a rich maduro cigar",
      categoryFocus: 'pairing',
      journeyLevel: 'intermediate',
      expectNamedSpiritId: 'spi-trk-of-1920',
      expectSpiritLockedAllSlots: true,
      expectAllMaduroCigars: true,
      forbidLigeroHeavyOnAnchorSlots: ['best', 'safe']
    },
    {
      id: 'buffalo-trace-novice-smoker',
      promptText:
        "I'm new to cigars and sipping Buffalo Trace. Recommend something approachable.",
      categoryFocus: 'pairing',
      journeyLevel: 'novice',
      expectNamedSpiritId: 'spi-trk-bt-buffalo',
      forbiddenSpiritNamePattern: 'ardbeg|laphroaig|lagavulin|octomore'
    },
    {
      id: 'morning-espresso-pairing',
      promptText:
        'Pair a cigar with a morning espresso. I want something elegant, smooth, and not too heavy for an early smoke.',
      categoryFocus: 'pairing',
      journeyLevel: 'intermediate',
      expectFocus: 'pairing',
      forbiddenSpiritNamePattern: 'ardbeg|laphroaig|lagavulin|octomore|casamigos|clase azul|mezcal',
      expectSpiritDeckIn: ['bourbon', 'irish', 'cognac', 'rum'],
      expectDistinctWhyAcrossSlots: true
    },
    {
      id: 'cigar-only-under-budget',
      promptText: 'recommend a cigar under $10',
      categoryFocus: 'cigar',
      journeyLevel: 'intermediate'
    },
    {
      id: 'cigar-only-coffee-no-pair',
      promptText: 'I need a cigar with my morning espresso',
      categoryFocus: 'cigar',
      journeyLevel: 'intermediate',
      expectFocus: 'cigar'
    }
  ]
});

console.log('\n=== regression probes ok ===', regression.ok);
for (const c of regression.cases) {
  const spirits = (c.cardsProductIds || []).map((row) =>
    row.spiritId ? pid.displayNameForId('spirit', row.spiritId) : null
  );
  const cigars = (c.cardsProductIds || []).map((row) =>
    row.cigarId ? pid.displayNameForId('cigar', row.cigarId) : null
  );
  console.log('\n---', c.id, c.ok ? 'OK' : 'FAIL');
  console.log('checks:', c.checks);
  console.log('spirits:', spirits);
  console.log('cigars:', cigars);
}

const morningText =
  'Pair a cigar with a morning espresso. I want something elegant, smooth, and not too heavy for an early smoke.';
const morningTurn = RR.resolveRecommendationTurn({
  promptText: morningText,
  journeyLevel: 'intermediate',
  sessionRuntime: {},
  categoryFocus: 'pairing'
});
console.log('\n=== morning why bullets ===');
(morningTurn.cards || []).forEach((card, i) => {
  console.log(['best', 'safe', 'wildcard'][i] + ':', card?.why);
});

process.exit(regression.ok && routingCases.every((c) => RT.inferCategoryFocus(c.text) === c.expectFocus) ? 0 : 1);
