/**
 * Shared pairing quality gate — used by pairing-eval-runner and sterlon-reco-freeze.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { visionboardRoot } from './load-sterlon-stack.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const defaultEvalPath = path.join(visionboardRoot, 'fixtures/pairing-evals/pairing-evals.json');

export function loadPairingEvalDataset(evalPath = defaultEvalPath) {
  return JSON.parse(fs.readFileSync(evalPath, 'utf8'));
}

export function runCanonicalEval(ctx, dataset) {
  const PE = ctx.PairingEvaluation;
  const SPD = ctx.SterlonPairingDiagnostics;
  if (SPD && typeof SPD.reset === 'function') SPD.reset();
  const results = [];
  for (const evalCase of dataset.cases) {
    const scored = PE.scorePairing(evalCase.cigar, evalCase.spirit, {
      evalCase,
      context: evalCase.context || {}
    });
    if (SPD && typeof SPD.recordResult === 'function') SPD.recordResult(scored);
    results.push({
      id: evalCase.id,
      tier: evalCase.tier,
      grade: scored.grade,
      numericScore: scored.numericScore,
      ok: scored.ok,
      antiPairingHit: scored.antiPairingHit,
      failures: scored.failures
    });
  }
  return results;
}

export function runScenarioEval(ctx, dataset) {
  const RR = ctx.RecommendationRuntime;
  const WJ = ctx.WhiskeyJourney;
  const PE = ctx.PairingEvaluation;
  const results = [];
  for (const scenario of dataset.promptScenarios || []) {
    const E = ctx.RecommendationEntropy;
    if (E && typeof E.resetGlobalMetrics === 'function') {
      E.resetGlobalMetrics();
    }
    const session = {};
    const jl =
      scenario.journeyLevel ||
      (WJ && WJ.isNovicePalate && WJ.isNovicePalate(scenario.prompt) ? 'novice' : 'advanced');
    const turn = RR.resolveRecommendationTurn({
      promptText: scenario.prompt,
      journeyLevel: jl,
      sessionRuntime: session,
      categoryFocus: scenario.categoryFocus || null
    });
    const scored = PE.scoreTurn(turn, scenario.expect || null);
    results.push({ id: scenario.id, grade: scored.grade, ok: scored.ok });
  }
  return results;
}

export function sampleOntologyLift(ctx, dataset, sampleSize = 6) {
  const PE = ctx.PairingEvaluation;
  const LP = ctx.LoungeProducts;
  const spirits = LP.spirits.map((s) => s.name);
  let liftSum = 0;
  let liftN = 0;
  for (const evalCase of dataset.cases.filter((c) => !c.antiPairings).slice(0, sampleSize)) {
    const cmp = PE.compareBaselines(evalCase.cigar, spirits);
    if (cmp.ontologyLift != null) {
      liftSum += cmp.ontologyLift;
      liftN += 1;
    }
  }
  return liftN ? liftSum / liftN : null;
}

export function benchmarkAverageNumeric(canonical) {
  const graded = canonical.filter((r) => r.tier !== 'anti-pairing' && r.numericScore != null);
  if (!graded.length) return 0;
  return graded.reduce((s, r) => s + r.numericScore, 0) / graded.length;
}

export function checkPairingQualityGate(canonical, scenarios, snap, baselines = {}) {
  const canonFail = canonical.filter((r) => !r.ok).length;
  const antiCases = canonical.filter((c) => c.tier === 'anti-pairing');
  const antiOk = antiCases.every((r) => r.ok);
  const scenarioFail = scenarios.filter((r) => !r.ok).length;
  const benchmarkAvg = benchmarkAverageNumeric(canonical);
  const avgOk = benchmarkAvg >= 0.78;
  const realismOk = snap.averageRealism == null || snap.averageRealism >= 0.72;
  const gradeOk = snap.averageGradeNumeric == null || snap.averageGradeNumeric >= 0.75;
  const liftOk =
    baselines.ontologyLiftAvg == null || baselines.ontologyLiftAvg >= 0.05;

  return {
    ok: canonFail === 0 && antiOk && scenarioFail === 0 && avgOk && realismOk && gradeOk && liftOk,
    canonFail,
    antiOk,
    scenarioFail,
    benchmarkAverageNumeric: benchmarkAvg,
    averageGradeNumeric: snap.averageGradeNumeric,
    averageRealism: snap.averageRealism,
    gradeOk,
    ontologyLiftAvg: baselines.ontologyLiftAvg
  };
}

/** Full gate run for freeze / CLI. */
export function runPairingQualityGate(ctx, dataset) {
  const canonical = runCanonicalEval(ctx, dataset);
  const scenarios = runScenarioEval(ctx, dataset);
  const snap = ctx.SterlonPairingDiagnostics.snapshot();
  const ontologyLiftAvg = sampleOntologyLift(ctx, dataset);
  const benchmarkAvg = benchmarkAverageNumeric(canonical);
  const gate = checkPairingQualityGate(canonical, scenarios, snap, { ontologyLiftAvg });
  const pass = canonical.filter((r) => r.ok).length;
  return {
    canonicalPass: pass,
    canonicalTotal: canonical.length,
    scenarioPass: scenarios.filter((r) => r.ok).length,
    scenarioTotal: scenarios.length,
    benchmarkAverageNumeric: Math.round(benchmarkAvg * 1000) / 1000,
    averageGrade: snap.averageGrade,
    averageGradeNumeric: snap.averageGradeNumeric,
    antiPairingViolations: snap.antiPairingViolations,
    ontologyLiftAvg,
    gate,
    ok: gate.ok
  };
}
