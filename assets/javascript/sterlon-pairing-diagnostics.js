/**
 * SterlonPairingDiagnostics — pairing quality aggregates for eval harness + telemetry.
 */
(function (global) {
  'use strict';

  var state = {
    runs: 0,
    grades: { A: 0, B: 0, C: 0, D: 0, F: 0 },
    failures: Object.create(null),
    antiPairingHits: 0,
    realismSum: 0,
    contrastTensionSum: 0,
    contrastTurns: 0,
    ontologyLiftSum: 0,
    styleDistribution: {
      complementary: 0,
      contrast: 0,
      balanced: 0,
      adventurous: 0,
      classic_lounge: 0,
      educational: 0
    },
    lastRun: null
  };

  function recordResult(result) {
    if (!result || !result.grade) return;
    state.runs += 1;
    if (!(result.antiPairingHit && result.ok)) {
      state.grades[result.grade] = (state.grades[result.grade] || 0) + 1;
    }
    if (result.antiPairingHit) state.antiPairingHits += 1;
    if (result.dimensions && result.dimensions.realism != null) {
      state.realismSum += result.dimensions.realism;
    }
    if (result.dimensions && result.dimensions.contrastTension != null) {
      state.contrastTensionSum += result.dimensions.contrastTension;
      if (result.dimensions.contrastTension >= 0.45) state.contrastTurns += 1;
    }
    if (result.explain && result.explain.pairingStrategy) {
      var sk = result.explain.pairingStrategy;
      state.styleDistribution[sk] = (state.styleDistribution[sk] || 0) + 1;
    }
    (result.failures || []).forEach(function (f) {
      state.failures[f] = (state.failures[f] || 0) + 1;
    });
  }

  function recordRunSummary(summary) {
    state.lastRun = summary;
    if (summary && summary.ontologyLiftAvg != null) {
      state.ontologyLiftSum += summary.ontologyLiftAvg;
    }
  }

  function averageGradeNumeric() {
    var total = 0;
    var count = 0;
    var PE = global.PairingEvaluation;
    if (!PE) return 0;
    Object.keys(state.grades).forEach(function (letter) {
      var n = state.grades[letter];
      if (!n) return;
      var threshold = PE.GRADE_THRESHOLDS[letter] || 0;
      total += n * (threshold + 0.04);
      count += n;
    });
    return count ? total / count : 0;
  }

  function snapshot() {
    var PE = global.PairingEvaluation;
    var avgLetter = PE ? PE.letterFromScore(averageGradeNumeric()) : 'F';
    var topFailures = Object.keys(state.failures)
      .sort(function (a, b) {
        return state.failures[b] - state.failures[a];
      })
      .slice(0, 5)
      .map(function (k) {
        return { code: k, count: state.failures[k] };
      });

    return {
      runs: state.runs,
      gradeDistribution: Object.assign({}, state.grades),
      averageGrade: avgLetter,
      averageGradeNumeric: Math.round(averageGradeNumeric() * 1000) / 1000,
      antiPairingViolations: state.antiPairingHits,
      averageRealism:
        state.runs > 0 ? Math.round((state.realismSum / state.runs) * 100) / 100 : null,
      topFailureModes: topFailures,
      ontologyContributionNote:
        'Compare full vs ignoreOntology modes in pairing-eval-runner baseline section.',
      averageContrastTension:
        state.runs > 0 ? Math.round((state.contrastTensionSum / state.runs) * 1000) / 1000 : null,
      contrastIntelligencePct:
        state.runs > 0 ? Math.round((state.contrastTurns / state.runs) * 1000) / 1000 : null,
      styleDistribution: Object.assign({}, state.styleDistribution),
      pairingSophisticationNote:
        'Contrast % = turns with controlledTension ≥ 0.45; style distribution from pairingStrategy.',
      lastRun: state.lastRun
    };
  }

  function reset() {
    state.runs = 0;
    state.grades = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    state.failures = Object.create(null);
    state.antiPairingHits = 0;
    state.realismSum = 0;
    state.contrastTensionSum = 0;
    state.contrastTurns = 0;
    state.ontologyLiftSum = 0;
    state.styleDistribution = {
      complementary: 0,
      contrast: 0,
      balanced: 0,
      adventurous: 0,
      classic_lounge: 0,
      educational: 0
    };
    state.lastRun = null;
  }

  global.SterlonPairingDiagnostics = {
    recordResult: recordResult,
    recordRunSummary: recordRunSummary,
    snapshot: snapshot,
    reset: reset
  };
})(typeof window !== 'undefined' ? window : global);
