/**
 * build-set-seal.test.mjs — turn sealing for hard eligibility + post-transform allowlist.
 * Run from docs/visionboard:
 *   node assets/javascript/recommendation-runtime/build-set-seal.test.mjs
 */
import vm from 'vm';
import { loadSterlonStack } from '../../../tools/load-sterlon-stack.mjs';

let pass = 0;
let fail = 0;

function assert(label, condition) {
  if (condition) {
    console.log('  PASS  ' + label);
    pass += 1;
  } else {
    console.error('  FAIL  ' + label);
    fail += 1;
  }
}

function createCtx() {
  const ctx = vm.createContext({
    console,
    process,
    setTimeout,
    clearTimeout,
    global: {},
    window: {}
  });
  ctx.global = ctx.window = ctx;
  return ctx;
}

function baseTurnOpts(promptText) {
  return {
    promptText: promptText || 'pair me a bourbon and cigar',
    journeyLevel: 'advanced',
    sessionRuntime: {},
    categoryFocus: 'pairing'
  };
}

function makeCatalogCards(ctx) {
  const PIDs = ctx.RecommendationProductIds;
  const cigarIds = PIDs.listMenuCigarIds();
  const spiritIds = PIDs.listMenuSpiritIds();
  const slots = ['best', 'safe', 'wildcard'];
  const labels = ['Best Pick', 'Refined Option', 'Wildcard'];
  const cards = slots.map(function (slot, idx) {
    const cigarId = cigarIds[idx] || cigarIds[0];
    const spiritId = spiritIds[0];
    return {
      slot: slot,
      label: labels[idx],
      cigarId: cigarId,
      spiritId: spiritId,
      cigar: PIDs.displayNameForId('cigar', cigarId),
      spirit: PIDs.displayNameForId('spirit', spiritId),
      why: ['test rationale']
    };
  });
  return cards;
}

function attachMeta(cards, extra) {
  Object.assign(cards, extra || {});
  return cards;
}

function main() {
  const ctx = createCtx();
  loadSterlonStack(ctx);

  const RR = ctx.RecommendationRuntime;
  const GEN = ctx.RecommendationGenerate;
  const FPP = ctx.FlightPhilosophyPolicy;
  const origGen = GEN.generateRecommendations;
  const origRepair =
    FPP && typeof FPP.repairCollapsedFlightCards === 'function'
      ? FPP.repairCollapsedFlightCards
      : null;

  console.log('\n[1] hardEligibility.degraded=true seals turn.degraded=true');
  GEN.generateRecommendations = function () {
    return attachMeta(makeCatalogCards(ctx), {
      hardEligibility: {
        degraded: true,
        degradedCause: 'no_exact_smoke_time_match',
        constraintsApplied: ['smoke_time']
      }
    });
  };
  const degradedTurn = RR.resolveRecommendationTurn(baseTurnOpts('30-minute smoke'));
  assert('turn.degraded is true', degradedTurn.degraded === true);
  assert(
    'provenance carries hardEligibility',
    !!(degradedTurn.provenance && degradedTurn.provenance.hardEligibility)
  );
  assert(
    'hardEligibility.degraded preserved in provenance',
    degradedTurn.provenance.hardEligibility.degraded === true
  );
  assert(
    'degradedCause from hard eligibility',
    (degradedTurn.provenance.degradedCause || degradedTurn.provenance.reason) ===
      'no_exact_smoke_time_match'
  );
  assert('runtimeMode is degraded', degradedTurn.runtimeMode === 'degraded');

  console.log('\n[2] hardEligibility.degraded=false keeps turn.degraded=false');
  GEN.generateRecommendations = function () {
    return attachMeta(makeCatalogCards(ctx), {
      hardEligibility: {
        degraded: false,
        constraintsApplied: ['smoke_time']
      }
    });
  };
  const normalTurn = RR.resolveRecommendationTurn(baseTurnOpts('30-minute smoke'));
  assert('turn.degraded is false', normalTurn.degraded === false);
  assert('runtimeMode is normal', normalTurn.runtimeMode === 'normal');
  assert('cards still sealed', Array.isArray(normalTurn.cards) && normalTurn.cards.length === 3);

  console.log('\n[3] post-transform off-catalog cards return degraded turn');
  GEN.generateRecommendations = function () {
    return attachMeta(makeCatalogCards(ctx), {
      hardEligibility: { degraded: false, constraintsApplied: [] },
      rankedCigars: ctx.RecommendationProductIds.listMenuCigarIds(),
      rankedSpirits: ctx.RecommendationProductIds.listMenuSpiritIds()
    });
  };
  if (origRepair) {
    FPP.repairCollapsedFlightCards = function (cards) {
      const bad = Object.assign({}, cards[0], {
        cigarId: null,
        cigar: 'Off Menu Cigar'
      });
      return { cards: [bad, cards[1], cards[2]], repairSignals: ['flight-philosophy-repair-test'] };
    };
  }
  const postTurn = RR.resolveRecommendationTurn(baseTurnOpts());
  assert('post-transform turn.degraded is true', postTurn.degraded === true);
  assert(
    'post-transform degradedCause',
    (postTurn.provenance && postTurn.provenance.degradedCause) ===
      'post-transform-off-catalog-products'
  );
  assert('post-transform returns empty cards', Array.isArray(postTurn.cards) && postTurn.cards.length === 0);
  if (origRepair) {
    FPP.repairCollapsedFlightCards = origRepair;
  }

  GEN.generateRecommendations = origGen;

  console.log('\n[4] buildRecoContext: exact durations no longer set quickSmoke');
  const OPC = ctx.OntologyPolicyCore;
  const ctx30 = OPC.buildRecoContext({ promptText: 'I want a 30 min cigar', journeyLevel: 'advanced' });
  assert('"30 min" does not set quickSmoke', ctx30.quickSmoke === false);
  const ctx45 = OPC.buildRecoContext({ promptText: 'need a 45 min smoke', journeyLevel: 'advanced' });
  assert('"45 min" does not set quickSmoke', ctx45.quickSmoke === false);
  const ctxQuick = OPC.buildRecoContext({ promptText: 'something quick on the patio', journeyLevel: 'advanced' });
  assert('"quick/patio" still sets quickSmoke', ctxQuick.quickSmoke === true);

  console.log('\n' + (fail === 0 ? 'All' : fail + ' FAILED,') + ' ' + pass + ' passed.\n');
  if (fail > 0) process.exit(1);
}

main();
