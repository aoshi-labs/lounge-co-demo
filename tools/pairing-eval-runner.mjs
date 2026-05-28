#!/usr/bin/env node
/**
 * Pairing evaluation harness — benchmark pairing quality, realism, and ontology contribution.
 *
 * Run from docs/visionboard:
 *   node tools/pairing-eval-runner.mjs
 *   node tools/pairing-eval-runner.mjs --export reports/pairing-eval
 *   node tools/pairing-eval-runner.mjs --gate
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createSterlonVmContext,
  loadSterlonStack,
  loadScript,
  visionboardRoot
} from './load-sterlon-stack.mjs';
import {
  defaultEvalPath,
  loadPairingEvalDataset,
  runCanonicalEval,
  runScenarioEval,
  sampleOntologyLift,
  checkPairingQualityGate,
  benchmarkAverageNumeric
} from './pairing-eval-gate.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const evalPath = defaultEvalPath;

function parseArgs(argv) {
  const out = { exportDir: null, gate: false, verbose: false, grade: false };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--gate') out.gate = true;
    if (argv[i] === '--verbose') out.verbose = true;
    if (argv[i] === '--grade') out.grade = true;
    if (argv[i] === '--export' && argv[i + 1]) {
      out.exportDir = argv[++i];
    }
  }
  return out;
}

function effectiveJourney(WJ, session, text) {
  if (WJ && WJ.isNovicePalate && WJ.isNovicePalate(text)) return 'novice';
  if (session.latchedJourneyLevel === 'novice' || session.latchedJourneyLevel === 'advanced') {
    return session.latchedJourneyLevel;
  }
  return 'advanced';
}

function runCanonicalCases(ctx, dataset) {
  const PE = ctx.PairingEvaluation;
  const results = [];
  for (const evalCase of dataset.cases) {
    const scored = PE.scorePairing(evalCase.cigar, evalCase.spirit, {
      evalCase,
      context: evalCase.context || {}
    });
    ctx.SterlonPairingDiagnostics.recordResult(scored);
    results.push({
      id: evalCase.id,
      tier: evalCase.tier,
      cigar: evalCase.cigar,
      spirit: evalCase.spirit,
      grade: scored.grade,
      numericScore: scored.numericScore,
      ok: scored.ok,
      failures: scored.failures,
      antiPairingHit: scored.antiPairingHit,
      explain: scored.explain
    });
  }
  return results;
}

function runPromptScenarios(ctx, dataset) {
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
    const jl = scenario.journeyLevel || effectiveJourney(WJ, session, scenario.prompt);
    const turn = RR.resolveRecommendationTurn({
      promptText: scenario.prompt,
      journeyLevel: jl,
      sessionRuntime: session,
      categoryFocus: scenario.categoryFocus || null
    });
    const scored = PE.scoreTurn(turn, scenario.expect || null);
    ctx.SterlonPairingDiagnostics.recordResult(scored);
    const card = turn.cards && turn.cards[0];
    const spirit = card && card.spirit ? ctx.LoungeProducts.findSpiritByName(card.spirit) : null;
    results.push({
      id: scenario.id,
      prompt: scenario.prompt,
      cigar: card && card.cigar,
      spirit: card && card.spirit,
      spiritDeck: spirit ? spirit.deckKey : null,
      grade: scored.grade,
      ok: scored.ok,
      signals: (turn.provenance && turn.provenance.signals) || [],
      failures: scored.failures
    });
  }
  return results;
}

function runInvestorWalkthrough(ctx, dataset) {
  const RR = ctx.RecommendationRuntime;
  const PE = ctx.PairingEvaluation;
  const flows = dataset.investorWalkthrough || [];
  const results = [];
  for (const flow of flows) {
    const turn = RR.resolveRecommendationTurn({
      promptText: flow.prompt,
      journeyLevel: flow.journeyLevel || 'advanced',
      sessionRuntime: {}
    });
    const scored = PE.scoreTurn(turn, { minGrade: flow.minGrade || 'C' });
    const card = turn.cards && turn.cards[0];
    results.push({
      id: flow.id,
      label: flow.label,
      prompt: flow.prompt,
      cigar: card && card.cigar,
      spirit: card && card.spirit,
      grade: scored.grade,
      ok: scored.ok
    });
  }
  return results;
}

function runBaselines(ctx, dataset) {
  const PE = ctx.PairingEvaluation;
  const LP = ctx.LoungeProducts;
  const spirits = LP.spirits.map((s) => s.name);
  const rows = [];
  let liftSum = 0;
  let liftN = 0;

  for (const evalCase of dataset.cases.filter((c) => !c.antiPairings).slice(0, 6)) {
    const cmp = PE.compareBaselines(evalCase.cigar, spirits);
    if (cmp.ontologyLift != null) {
      liftSum += cmp.ontologyLift;
      liftN += 1;
    }
    rows.push({ id: evalCase.id, cigar: evalCase.cigar, ...cmp });
  }

  const summary = {
    ontologyLiftAvg: liftN ? liftSum / liftN : 0,
    rows
  };
  ctx.SterlonPairingDiagnostics.recordRunSummary(summary);
  return summary;
}

function gradeSummary(results) {
  const dist = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  let pass = 0;
  let fail = 0;
  for (const r of results) {
    dist[r.grade] = (dist[r.grade] || 0) + 1;
    if (r.ok) pass += 1;
    else fail += 1;
  }
  return { dist, pass, fail, total: results.length };
}

/** Composite 1–10 harness grade (weighted metrics). */
function compositeHarnessGrade(canonical, scenarios, snap, baselines, investor) {
  const canonPassRate = canonical.length ? canonical.filter((r) => r.ok).length / canonical.length : 0;
  const scenarioPassRate = scenarios.length ? scenarios.filter((r) => r.ok).length / scenarios.length : 0;
  const investorPassRate = investor.length ? investor.filter((r) => r.ok).length / investor.length : 0;
  const bench = benchmarkAverageNumeric(canonical);
  const realism = snap.averageRealism != null ? snap.averageRealism : 0.7;
  const avgGrade = snap.averageGradeNumeric != null ? snap.averageGradeNumeric : 0.7;
  const lift = baselines.ontologyLiftAvg != null ? baselines.ontologyLiftAvg : 0.05;
  const raw =
    canonPassRate * 0.22 +
    scenarioPassRate * 0.18 +
    investorPassRate * 0.12 +
    bench * 0.22 +
    realism * 0.12 +
    avgGrade * 0.1 +
    Math.min(1, lift / 0.08) * 0.04;
  return Math.round(raw * 10 * 10) / 10;
}

function exportMarkdown(dir, dataset, canonical, scenarios, baselines, snap) {
  const lines = [
    '# Sterlon Pairing Evaluation Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Summary',
    '',
    `- Canonical cases: ${canonical.length} (${gradeSummary(canonical).pass} pass / ${gradeSummary(canonical).fail} fail)`,
    `- Prompt scenarios: ${scenarios.length}`,
    `- Average grade (diagnostics): **${snap.averageGrade}** (${snap.averageGradeNumeric})`,
    `- Anti-pairing violations: ${snap.antiPairingViolations}`,
    `- Avg realism: ${snap.averageRealism}`,
    `- Ontology lift (baseline sample): ${baselines.ontologyLiftAvg != null ? baselines.ontologyLiftAvg.toFixed(3) : 'n/a'}`,
    '',
    '## Grade distribution',
    '',
    '| Grade | Count |',
    '|-------|-------|',
    ...Object.entries(snap.gradeDistribution).map(([g, n]) => `| ${g} | ${n} |`),
    '',
    '## Top failure modes',
    '',
    ...(snap.topFailureModes.length
      ? snap.topFailureModes.map((f) => `- ${f.code}: ${f.count}`)
      : ['- none']),
    '',
    '## Canonical benchmark',
    '',
    '| ID | Tier | Cigar | Spirit | Grade | OK | Notes |',
    '|----|------|-------|--------|-------|----|-------|',
    ...canonical.map((r) => {
      const notes = (r.failures || []).join(', ') || '—';
      return `| ${r.id} | ${r.tier} | ${r.cigar} | ${r.spirit} | ${r.grade} | ${r.ok ? 'yes' : '**no**'} | ${notes} |`;
    }),
    '',
    '## Prompt scenarios',
    '',
    '| ID | Grade | Cigar | Spirit | Deck | OK |',
    '|----|-------|-------|--------|------|----|',
    ...scenarios.map(
      (r) =>
        `| ${r.id} | ${r.grade} | ${r.cigar || '—'} | ${r.spirit || '—'} | ${r.spiritDeck || '—'} | ${r.ok ? 'yes' : 'no'} |`
    ),
    '',
    '## Worst pairings (canonical)',
    '',
    ...canonical
      .filter((r) => r.grade === 'D' || r.grade === 'F' || !r.ok)
      .map(
        (r) =>
          `### ${r.id}\n- **${r.cigar}** + **${r.spirit}** → ${r.grade}\n- Affinity: ${r.explain.pairingAffinity || '—'} · body Δ ${r.explain.bodyDelta}\n`
      ),
    '',
    '## Best pairings (canonical)',
    '',
    ...canonical
      .filter((r) => r.grade === 'A' || r.grade === 'B')
      .slice(0, 5)
      .map(
        (r) =>
          `### ${r.id}\n- **${r.cigar}** + **${r.spirit}** → ${r.grade} (${r.numericScore})\n- ${r.explain.bridges && r.explain.bridges.length ? 'Bridges: ' + r.explain.bridges.join(', ') : ''}\n`
      ),
    '',
    '## Investor walkthrough (live prompts)',
    '',
    ...(dataset.investorWalkthrough || []).map((w) => `- **${w.id}**: \`${w.prompt}\` (${w.journeyLevel})`),
    ''
  ];
  fs.writeFileSync(path.join(dir, 'pairing-eval-report.md'), lines.join('\n'));
}

function exportCsv(dir, canonical, scenarios) {
  const header = 'type,id,cigar,spirit,grade,numericScore,ok,failures\n';
  const rows = canonical.map((r) =>
    [
      'canonical',
      r.id,
      csvEsc(r.cigar),
      csvEsc(r.spirit),
      r.grade,
      r.numericScore,
      r.ok,
      csvEsc((r.failures || []).join(';'))
    ].join(',')
  );
  const srows = scenarios.map((r) =>
    ['scenario', r.id, csvEsc(r.cigar), csvEsc(r.spirit), r.grade, '', r.ok, csvEsc((r.failures || []).join(';'))].join(
      ','
    )
  );
  fs.writeFileSync(path.join(dir, 'pairing-eval.csv'), header + rows.concat(srows).join('\n') + '\n');
}

function csvEsc(s) {
  const t = String(s || '');
  return t.indexOf(',') !== -1 ? `"${t.replace(/"/g, '""')}"` : t;
}


function main() {
  const args = parseArgs(process.argv);
  const dataset = loadPairingEvalDataset(evalPath);

  const ctx = createSterlonVmContext();
  loadSterlonStack(ctx);
  loadScript(ctx, 'assets/javascript/pairing-evaluation/score.js');
  loadScript(ctx, 'assets/javascript/sterlon-pairing-diagnostics.js');
  if (!ctx.PairingEvaluation || !ctx.SterlonPairingDiagnostics) {
    console.error('PairingEvaluation modules failed to load');
    process.exit(1);
  }

  ctx.SterlonPairingDiagnostics.reset();

  const canonical = runCanonicalCases(ctx, dataset);
  const scenarios = runPromptScenarios(ctx, dataset);
  const investor = runInvestorWalkthrough(ctx, dataset);
  const baselines = runBaselines(ctx, dataset);
  const snap = ctx.SterlonPairingDiagnostics.snapshot();

  const cs = gradeSummary(canonical);
  console.log('Pairing evaluation harness');
  console.log('  Canonical:', cs.pass, '/', cs.total, 'pass | dist', cs.dist);
  console.log('  Scenarios:', scenarios.filter((r) => r.ok).length, '/', scenarios.length, 'pass');
  if (investor.length) {
    console.log(
      '  Investor flows:',
      investor.filter((r) => r.ok).length,
      '/',
      investor.length,
      'pass'
    );
  }
  console.log('  Diagnostics avg grade:', snap.averageGrade, snap.averageGradeNumeric);
  console.log('  Anti-pairing hits:', snap.antiPairingViolations);
  console.log('  Ontology lift (sample):', baselines.ontologyLiftAvg != null ? baselines.ontologyLiftAvg.toFixed(3) : 'n/a');

  const composite = compositeHarnessGrade(canonical, scenarios, snap, baselines, investor);
  if (args.grade) {
    console.log('  Composite harness grade:', composite, '/ 10');
  }

  if (args.verbose) {
    canonical.filter((r) => !r.ok).forEach((r) => console.log('  FAIL', r.id, r.grade, r.failures));
  }

  if (args.exportDir) {
    const dir = path.isAbsolute(args.exportDir) ? args.exportDir : path.join(visionboardRoot, args.exportDir);
    fs.mkdirSync(dir, { recursive: true });
    exportMarkdown(dir, dataset, canonical, scenarios, baselines, snap);
    exportCsv(dir, canonical, scenarios);
    fs.writeFileSync(
      path.join(dir, 'pairing-eval-snapshot.json'),
      JSON.stringify({ canonical, scenarios, investor, baselines, snap }, null, 2) + '\n'
    );
    console.log('  Exported to', dir);
  }

  const gate = checkPairingQualityGate(canonical, scenarios, snap, baselines);
  if (args.gate) {
    if (!gate.ok) {
      console.error('PAIRING QUALITY GATE FAILED', JSON.stringify(gate, null, 2));
      process.exit(1);
    }
    console.log('Pairing quality gate passed.');
  }

  const canonFail = canonical.filter((r) => !r.ok);
  if (canonFail.length && !args.gate) {
    process.exit(1);
  }
}

main();
