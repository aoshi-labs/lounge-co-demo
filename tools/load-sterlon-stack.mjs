/**
 * Load the Sterlon browser script stack into a vm context (Node fixtures).
 * Order mirrors [docs/visionboard/sterlon.html](sterlon.html) through recommendations
 * (excludes gateway, chat, lounge). Patches **`RecommendationRuntime.resolveRecommendationTurn`**
 * and `buildRecommendationSet` via `build-set.js`.
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const visionboardRoot = path.join(__dirname, '..');

/**
 * @param {import('vm').Context} ctx
 * @param {string} rel - path relative to visionboard root
 */
export function loadScript(ctx, rel) {
  const abs = path.join(visionboardRoot, rel);
  vm.runInContext(fs.readFileSync(abs, 'utf8'), ctx, { filename: rel });
}

/**
 * Hydrate LoungeCatalog from generated JSON slices (sync, Node fixtures).
 * @param {import('vm').Context} ctx
 */
function loadCategorySlices(knowledgeRoot, category) {
  const catDir = path.join(knowledgeRoot, category);
  const manifest = JSON.parse(fs.readFileSync(path.join(catDir, 'manifest.json'), 'utf8'));
  const merge = (paths) => {
    const products = [];
    for (const rel of paths) {
      const doc = JSON.parse(fs.readFileSync(path.join(catDir, rel), 'utf8'));
      if (Array.isArray(doc.products)) products.push(...doc.products);
    }
    return { version: 1, category, products };
  };
  return {
    reco: merge(manifest.recoShards || []),
    briefs: merge(manifest.briefShards || [])
  };
}

export function hydrateCatalogFromJson(ctx) {
  const knowledgeRoot = path.join(visionboardRoot, 'assets/knowledge');
  const cigars = loadCategorySlices(knowledgeRoot, 'cigars');
  const spirits = loadCategorySlices(knowledgeRoot, 'spirits');
  vm.runInContext(
    `LoungeCatalog.hydrateFromData({
      cigarsReco: ${JSON.stringify(cigars.reco)},
      cigarsBriefs: ${JSON.stringify(cigars.briefs)},
      spiritsReco: ${JSON.stringify(spirits.reco)},
      spiritsBriefs: ${JSON.stringify(spirits.briefs)}
    });`,
    ctx
  );
}

/**
 * Products → sensory → recommendation-runtime → catalog → journey → product-knowledge → flavor-match → recommendations.
 * @param {import('vm').Context} ctx
 */
export function loadSterlonStack(ctx) {
  const chain = [
    'assets/knowledge/products/cigars.js',
    'assets/knowledge/products/spirits.js',
    'assets/knowledge/products/foods.js',
    'assets/knowledge/products/catalog-client.js',
    'assets/knowledge/products/index.js',
    'assets/knowledge/sensory/profiles.js',
    'assets/knowledge/sensory/relationships.js',
    'assets/knowledge/sensory/index.js',
    'assets/javascript/recommendation-runtime/recommendation-entropy.js',
    'assets/javascript/recommendation-runtime/contrast-pairing.js',
    'assets/javascript/pairing-engine/iconic-pairs.js',
    'assets/javascript/pairing-engine/score.js',
    'assets/javascript/recommendation-runtime/cigar-smoke-estimate.js',
    'assets/javascript/recommendation-runtime/comfort-calibration.js',
    'assets/javascript/recommendation-runtime/ontology-policy-core.js',
    'assets/javascript/recommendation-runtime/ontology-policy-scoring.js',
    'assets/javascript/recommendation-runtime/ontology-cigar-context.js',
    'assets/javascript/recommendation-runtime/ontology-spirit-context.js',
    'assets/javascript/recommendation-runtime/ontology-retrieval.js',
    'assets/javascript/recommendation-runtime/ontology-policy.js',
    'assets/javascript/recommendation-runtime/rationale.js',
    'assets/javascript/recommendation-runtime/coffee-espresso-prose.js',
    'assets/javascript/recommendation-runtime/selectors.js',
    'assets/javascript/recommendation-runtime/parse-budget.js',
    'assets/javascript/recommendation-runtime/product-ids.js',
    'assets/javascript/recommendation-runtime/product-id-policy-filters.js',
    'assets/javascript/recommendation-runtime/intent-match.js',
    'assets/javascript/recommendation-runtime/presentation-cards.js',
    'assets/javascript/recommendation-runtime/context.js',
    'assets/javascript/recommendation-runtime/index.js',
    'assets/javascript/recommendation-runtime/recommendation-turn.js',
    'assets/javascript/recommendation-runtime/recommendation-turn-validate.js',
    'assets/javascript/recommendation-runtime/cigar-subline-body.js',
    'assets/javascript/recommendation-runtime/flight-brand-policy.js',
    'assets/javascript/recommendation-runtime/flight-philosophy-policy.js',
    'assets/javascript/recommendation-runtime/flight-philosophy-diversify.js',
    'assets/javascript/recommendation-runtime/flight-philosophy-metadata.js',
    'assets/javascript/recommendation-runtime/eligibility-constraints.js',
    'assets/javascript/recommendation-runtime/generate.js',
    'assets/knowledge/spirit-deck-key.js',
    'assets/knowledge/menu-flavor-catalog.js',
    'assets/knowledge/refinement-pivots.js',
    'assets/javascript/recommendation-runtime/deck-template.js',
    'assets/javascript/recommendation-runtime/diversity.js',
    'assets/javascript/recommendation-runtime/spirit-anchor.js',
    'assets/javascript/recommendation-runtime/build-set.js',
    'assets/javascript/recommendation-runtime/build-set-helpers.js',
    'assets/javascript/recommendation-runtime/resolve-chat-context.js',
    'assets/javascript/recommendation-runtime/persist-turn.js',
    'assets/javascript/recommendation-runtime/resolve-refinement.js',
    'assets/knowledge/whiskey-journey.js',
    'assets/knowledge/pairing-skills-data.js',
    'assets/knowledge/pairing-skills.js',
    'assets/knowledge/product-knowledge.js',
    'assets/javascript/sterlon-catalog-retrieval.js',
    'assets/javascript/sterlon-flavor-match.js',
    'assets/javascript/sterlon-recommendations.js',
    'assets/javascript/sterlon-ontology-diagnostics.js',
    'assets/javascript/pairing-evaluation/score.js',
    'assets/javascript/sterlon-pairing-diagnostics.js',
    'assets/javascript/sterlon-product-match.js',
    'assets/javascript/sterlon-runtime-state.js',
    'assets/javascript/sterlon-session-lifecycle.js',
    'assets/javascript/sterlon-session-routing.js',
    'assets/javascript/sterlon-chat-router.js',
    'assets/javascript/sterlon-stack-validate.js'
  ];
  for (let i = 0; i < chain.length; i += 1) {
    const rel = chain[i];
    loadScript(ctx, rel);
    if (rel === 'assets/knowledge/products/index.js') {
      hydrateCatalogFromJson(ctx);
    }
  }
}

/** Presentation + concierge prose modules (after base stack; mirrors sterlon.html). */
export function loadSterlonConciergeProseStack(ctx) {
  const chain = [
    'assets/javascript/sterlon-presentation-overlays.js',
    'assets/javascript/sterlon-prose-pipeline.js',
    'assets/javascript/sterlon-gateway-prose.js',
    'assets/javascript/sterlon-concierge-prose-shared.js',
    'assets/javascript/sterlon-concierge-expertise.js',
    'assets/javascript/sterlon-concierge-recommendation-prose.js',
    'assets/javascript/sterlon-concierge-reco-prose-deep.js',
    'assets/javascript/sterlon-concierge-prose.js'
  ];
  for (let i = 0; i < chain.length; i += 1) {
    loadScript(ctx, chain[i]);
  }
}

/** Scripts loaded after session routing, before sterlon-chat.js (Shrink 4). */
export function loadSterlonPreChatStack(ctx) {
  loadSterlonConciergeProseStack(ctx);
  const chain = [
    'assets/javascript/sterlon-gateway-lifecycle.js',
    'assets/javascript/sterlon-presentation-lifecycle.js',
    'assets/javascript/sterlon-scroll-anchor.js',
    'assets/javascript/sterlon-chat-prompts.js',
    'assets/javascript/sterlon-turn-handlers.js'
  ];
  for (let i = 0; i < chain.length; i += 1) {
    loadScript(ctx, chain[i]);
  }
}

/**
 * @returns {import('vm').Context}
 */
export function createSterlonVmContext() {
  const ctx = vm.createContext({ console });
  ctx.global = ctx;
  ctx.window = ctx;
  return ctx;
}
