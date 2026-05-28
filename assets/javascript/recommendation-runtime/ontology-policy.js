/**
 * OntologyPolicy — thin facade over core + cigar + spirit + retrieval modules.
 */
(function (global) {
  'use strict';

  var C = global.OntologyPolicyCore;
  var CC = global.OntologyCigarContext;
  var SC = global.OntologySpiritContext;
  var R = global.OntologyRetrieval;

  function snapshot() {
    var lounge = C && C.lp();
    var cigars = lounge && lounge.cigars ? lounge.cigars : [];
    var tracker = cigars.filter(function (c) {
      return c.tracker && c.tracker.sku;
    });
    var withGuidance = tracker.filter(function (c) {
      return c.guidance && c.guidance.pairingAffinity;
    }).length;
    return {
      trackerCigars: tracker.length,
      withPairingAffinity: withGuidance,
      affinityCoveragePct: tracker.length ? Math.round((withGuidance / tracker.length) * 100) : 0,
      activeFields: [
        'pairingAffinity',
        'whyRecommend',
        'bestFor',
        'avoidIf',
        'beginnerSafe',
        'smokeTime',
        'wrapperRole',
        'binderRole',
        'fillerRole',
        'occasion',
        'flavorFamily'
      ],
      lastDiagnostics: C ? C.getAffinityDiagnostics() : {}
    };
  }

  if (!C || !CC || !SC || !R) {
    global.OntologyPolicy = { snapshot: snapshot };
    return;
  }

  global.OntologyPolicy = {
    buildRecoContext: C.buildRecoContext,
    resolveSpiritDeckKey: SC.resolveSpiritDeckKey,
    filterCigarNames: CC.filterCigarNames,
    rankCigarNames: CC.rankCigarNames,
    rankSpirits: SC.rankSpirits,
    cigarContextScore: CC.cigarContextScore,
    spiritContextScore: SC.spiritContextScore,
    spiritAffinityBoost: SC.spiritAffinityBoost,
    HIGH_PROOF_MADURO_RULES: C.HIGH_PROOF_MADURO_RULES,
    filterSpiritNamesByStrategy: SC.filterSpiritNamesByStrategy,
    refinementStrategyForAxis: SC.refinementStrategyForAxis,
    pickSpiritPreservingAffinity: SC.pickSpiritPreservingAffinity,
    buildCardWhy: R.buildCardWhy,
    constructionBrief: R.constructionBrief,
    retrievalBlob: R.retrievalBlob,
    scoreRetrieval: R.scoreRetrieval,
    avoidIfTriggered: C.avoidIfTriggered,
    highProofBourbonMaduroDelta: C.highProofBourbonMaduroDelta,
    isHighProofBourbonContext: C.isHighProofBourbonContext,
    deckKeysForAffinity: C.deckKeysForAffinity,
    getAffinityDiagnostics: C.getAffinityDiagnostics,
    snapshot: snapshot
  };
})(typeof window !== 'undefined' ? window : global);
