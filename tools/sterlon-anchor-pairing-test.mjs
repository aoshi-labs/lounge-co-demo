import assert from 'node:assert/strict';
import { createSterlonVmContext, loadSterlonStack } from './load-sterlon-stack.mjs';

const ctx = createSterlonVmContext();
loadSterlonStack(ctx);

const promptText = 'im smoking a padron 1964 cigar. would a hennessy go well with it';
const categoryFocus = ctx.SterlonChatRouter.inferCategoryFocus(promptText);
assert.equal(categoryFocus, 'pairing');

const cigarId = ctx.SterlonProductMatch.resolveNamedCigarId(promptText);
const spiritId = ctx.SterlonProductMatch.resolveNamedSpiritId(promptText);
assert.ok(cigarId, 'expected Padron cigar anchor id');
assert.ok(spiritId, 'expected Hennessy spirit anchor id');

const turn = ctx.RecommendationRuntime.resolveTurnFromChatContext({
  promptText,
  sessionRuntime: {},
  getJourneyLevel: () => null,
  inferCategoryFocus: () => categoryFocus,
  promptExplicitlyNamesMenuSpirit: (text) => ctx.SterlonRecommendations.promptExplicitlyNamesMenuSpirit(text),
  parseBudgetCeiling: () => null,
  detectBrandHint: (text) => ctx.SterlonChatRouter.detectBrandHint(text)
});

assert.equal(turn.provenance.anchorCigarId, cigarId);
assert.equal(turn.provenance.anchorSpiritId, spiritId);
assert.match(turn.cards[0].cigar, /Padron 1964/i);
assert.match(turn.cards[0].spirit, /Hennessy/i);

const validated = ctx.SterlonRecommendations.validateCards(turn.cards, promptText, { categoryFocus });
assert.match(validated[0].cigar, /Padron 1964/i);
assert.match(validated[0].spirit, /Hennessy/i);

console.log('Sterlon anchor pairing regression passed');
