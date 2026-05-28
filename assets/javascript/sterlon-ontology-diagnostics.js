/**
 * SterlonOntologyDiagnostics — ontology activation coverage (dev / telemetry).
 */
(function (global) {
  'use strict';

  var state = {
    turns: 0,
    affinityOverrides: 0,
    suppressions: 0,
    curatedWhy: 0,
    retrievalHits: 0
  };

  function recordTurn(turn) {
    if (!turn) return;
    state.turns += 1;
    var prov = turn.provenance || {};
    (prov.signals || []).forEach(function (sig) {
      if (sig.indexOf('ontology-') === 0) {
        if (sig === 'ontology-affinity-deck') state.affinityOverrides += 1;
        if (sig === 'ontology-suppressed') state.suppressions += 1;
        if (sig === 'ontology-curated-why') state.curatedWhy += 1;
      }
    });
    var rbs = turn.rationaleBySlot || {};
    ['best', 'safe', 'wildcard'].forEach(function (slot) {
      var bullets = rbs[slot];
      if (!Array.isArray(bullets)) return;
      bullets.forEach(function (line) {
        var s = String(line || '');
        if (s.indexOf('Recommend when') !== -1 || s.indexOf('Recommend for') !== -1) {
          state.curatedWhy += 1;
        }
      });
    });
  }

  function snapshot() {
    var OP = global.OntologyPolicy;
    var base = OP && typeof OP.snapshot === 'function' ? OP.snapshot() : {};
    var lounge = global.LoungeProducts;
    var tracker = 0;
    var guidance = 0;
    if (lounge && lounge.cigars) {
      lounge.cigars.forEach(function (c) {
        if (c.tracker && c.tracker.sku) {
          tracker += 1;
          if (c.guidance && c.guidance.whyRecommend) guidance += 1;
        }
      });
    }
    return Object.assign(
      {
        turns: state.turns,
        affinityOverrides: state.affinityOverrides,
        suppressions: state.suppressions,
        curatedWhySignals: state.curatedWhy,
        runtimeUtilizationPct: tracker
          ? Math.round((guidance / tracker) * 100)
          : 0,
        promptVisibleNote:
          'Cigar menu uses compact rollup; full guidance via PRODUCT CONTEXT + retrieval.',
        deadFieldsNote:
          'spec.wrapper/binder/filler not yet in scoring — construction via teaching layer.'
      },
      base
    );
  }

  global.SterlonOntologyDiagnostics = {
    recordTurn: recordTurn,
    snapshot: snapshot
  };
})(typeof window !== 'undefined' ? window : global);
