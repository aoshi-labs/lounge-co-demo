import assert from 'node:assert/strict';
import { createSterlonVmContext, loadSterlonStack, loadSterlonPreChatStack } from './load-sterlon-stack.mjs';

const ctx = createSterlonVmContext();
loadSterlonStack(ctx);
loadSterlonPreChatStack(ctx);

function resolve(promptText) {
  return ctx.RecommendationRuntime.resolveTurnFromChatContext({
    promptText,
    sessionRuntime: {},
    getJourneyLevel: () => null,
    inferCategoryFocus: (text) => ctx.SterlonChatRouter.inferCategoryFocus(text),
    promptExplicitlyNamesMenuSpirit: (text) => ctx.SterlonRecommendations.promptExplicitlyNamesMenuSpirit(text),
    parseBudgetCeiling: () => null,
    detectBrandHint: (text) => ctx.SterlonChatRouter.detectBrandHint(text)
  });
}

const offSpirit = resolve('would chivas go well with a cigar?');
assert.equal(offSpirit.degraded, true);
assert.equal(offSpirit.provenance.degradedCause, 'product-not-in-demo');
assert.equal(offSpirit.provenance.unavailableProduct.category, 'spirit');
assert.equal(offSpirit.cards.length, 0);

const offCigar = resolve('pair a spirit with a la gloria cubana cigar');
assert.equal(offCigar.degraded, true);
assert.equal(offCigar.provenance.degradedCause, 'product-not-in-demo');
assert.equal(offCigar.provenance.unavailableProduct.category, 'cigar');
assert.equal(offCigar.cards.length, 0);

const copy = ctx.SterlonConciergeRecommendationProse.buildUnavailableDemoProductProse(
  offSpirit.provenance.unavailableProduct
);
assert.match(copy, /not in this demo version/i);
assert.doesNotMatch(copy, /room is moving|fallback/i);

console.log('Sterlon unavailable demo product regression passed');
