/**
 * Spirit ontology integrity audit — fails CI when catalog rows violate deck/category invariants.
 * Run from docs/visionboard: node tools/spirit-ontology-audit.mjs
 */
import { createSterlonVmContext, loadSterlonStack } from './load-sterlon-stack.mjs';

const ctx = createSterlonVmContext();
loadSterlonStack(ctx);

const SDK = ctx.SpiritDeckKey;
const LP = ctx.LoungeProducts;
if (!SDK || !LP) {
  console.error('SpiritDeckKey or LoungeProducts missing');
  process.exit(1);
}

const issues = SDK.validateSpiritCatalog(LP.spirits || []);
if (issues.length) {
  console.error('Spirit ontology violations:', JSON.stringify(issues, null, 2));
  process.exit(1);
}

const probes = [
  { prompt: 'bold bourbon pairing', deck: 'bourbon', forbidDeck: ['cognac', 'vodka', 'agave', 'rum', 'scotch', 'irish'] },
  { prompt: 'recommend a tequila under $60', deck: 'agave', forbidDeck: ['bourbon', 'cognac', 'vodka'] },
  { prompt: 'something peaty from islay', deck: 'peated', forbidDeck: ['bourbon', 'cognac'] },
  { prompt: 'cognac after dinner', deck: 'cognac', forbidDeck: ['bourbon', 'vodka'] }
];

let failed = 0;
for (const probe of probes) {
  const turn = ctx.RecommendationRuntime.resolveRecommendationTurn({
    promptText: probe.prompt,
    journeyLevel: 'advanced',
    sessionRuntime: {}
  });
  const spirit = turn.cards && turn.cards[0] ? turn.cards[0].spirit : null;
  const product = spirit && LP.findSpiritByName ? LP.findSpiritByName(spirit) : null;
  const deck = product ? product.deckKey : null;
  if (!spirit || deck !== probe.deck) {
    console.error('FAIL', probe.prompt, 'expected deck', probe.deck, 'got', spirit, deck);
    failed++;
    continue;
  }
  if (probe.forbidDeck.indexOf(deck) !== -1) {
    console.error('FAIL forbidden deck', probe.prompt, deck);
    failed++;
    continue;
  }
  console.log('OK', probe.prompt, '->', spirit, '(' + deck + ')');
}

if (failed) process.exit(1);
console.log('\nSpirit ontology audit passed (' + (LP.spirits || []).length + ' spirits).');
