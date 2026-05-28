/**
 * execute-handlers-g.mjs — freeze-case op handlers group G.
 * Auto-split from executeFreezeCase; loaded by execute.mjs.
 */
export function handleGroupG(ctx, op, input, H) {
  const { latchSession, effectiveJourneyLevel, pickProvenance,
    projectRecommendationTurnForFreeze, runtimeRecommendationCards,
    loadSterlonConciergeProseStack, loadPairingEvalDataset,
    runPairingQualityGate, SLOT_KEYS } = H;
  const SR = ctx.SterlonRecommendations;
  const RR = ctx.RecommendationRuntime;
  const SS = ctx.SterlonSensory;

  const deckKeyFn = () => input.deckKey || 'bourbon';

  if (op === 'spiritOntologyValidate') {
    const SDK = ctx.SpiritDeckKey;
    const LP = ctx.LoungeProducts;
    if (!SDK || !LP) throw new Error('SpiritDeckKey + LoungeProducts required');
    const issues = SDK.validateSpiritCatalog(LP.spirits || []);
    return {
      spiritCount: (LP.spirits || []).length,
      violationCount: issues.length,
      ok: issues.length === 0,
      sampleViolations: issues.slice(0, 5)
    };
  }

  if (op === 'categoryIntegrityTurns') {
    const LP = ctx.LoungeProducts;
    const RR = ctx.RecommendationRuntime;
    const WJ = ctx.WhiskeyJourney;
    const cases = input.cases || [];
    return cases.map(function (c) {
      const session = {};
      const turn = RR.resolveRecommendationTurn({
        promptText: c.prompt,
        journeyLevel: effectiveJourneyLevel(WJ, session, c.prompt),
        sessionRuntime: session
      });
      const spirit = turn.cards && turn.cards[0] ? turn.cards[0].spirit : null;
      const product = spirit && LP.findSpiritByName ? LP.findSpiritByName(spirit) : null;
      const deck = product ? product.deckKey : null;
      const signals = turn.provenance && turn.provenance.signals ? turn.provenance.signals : [];
      const forbiddenHit =
        c.forbiddenDecks && deck ? c.forbiddenDecks.indexOf(deck) !== -1 : false;
      return {
        prompt: c.prompt,
        spirit: spirit,
        deckKey: deck,
        expectedDeck: c.expectedDeck,
        deckMatches: deck === c.expectedDeck,
        forbiddenHit: forbiddenHit,
        degraded: turn.degraded,
        signals: signals,
        ok: !turn.degraded && deck === c.expectedDeck && !forbiddenHit
      };
    });
  }

  if (op === 'openPairingProbe') {
    const RR = ctx.RecommendationRuntime;
    const WJ = ctx.WhiskeyJourney;
    const LP = ctx.LoungeProducts;
    const RD = ctx.SterlonRecoDiagnostics;
    if (RD && typeof RD.reset === 'function') RD.reset();
    const prompts = input.prompts || [];
    const spirits = Object.create(null);
    prompts.forEach(function (p) {
      const session = {};
      const turn = RR.resolveRecommendationTurn({
        promptText: p,
        journeyLevel: effectiveJourneyLevel(WJ, session, p),
        sessionRuntime: session
      });
      if (RD && typeof RD.recordTurn === 'function') RD.recordTurn(turn);
      const s = turn.cards && turn.cards[0] ? turn.cards[0].spirit : null;
      if (s) spirits[s] = (spirits[s] = spirits[s] || 0) + 1;
    });
    const unique = Object.keys(spirits).length;
    const counts = Object.keys(spirits).map(function (k) {
      return { name: k, count: spirits[k] };
    });
    counts.sort(function (a, b) {
      return b.count - a.count;
    });
    const top = counts[0];
    const topShare = top && prompts.length ? top.count / prompts.length : 0;
    const grav = RD && RD.demoGravitySnapshot ? RD.demoGravitySnapshot() : {};
    const eagleRare = top && /eagle rare/i.test(top.name);
    return {
      promptCount: prompts.length,
      uniqueSpirits: unique,
      topSpirit: top ? top.name : null,
      topSpiritShare: topShare,
      heroSpiritDominancePct: grav.heroSpiritDominancePct,
      ok: unique >= 3 && topShare <= 0.5 && !eagleRare
    };
  }

  if (op === 'monteCarloDiversity') {
    const RR = ctx.RecommendationRuntime;
    const WJ = ctx.WhiskeyJourney;
    const E = ctx.RecommendationEntropy;
    const RD = ctx.SterlonRecoDiagnostics;
    if (!RR || !E) throw new Error('RecommendationRuntime + RecommendationEntropy required');
    if (typeof E.resetGlobalMetrics === 'function') E.resetGlobalMetrics();
    if (RD && typeof RD.reset === 'function') RD.reset();

    const thresholds = input.thresholds || {
      minUniqueSpirits: 12,
      minUniqueCigars: 28,
      maxTopSpiritSharePct: 18,
      maxTopCigarSharePct: 22,
      maxAshtonSharePct: 22,
      maxEagleRareSharePct: 18,
      minSpiritUtilizationPct: 35,
      minCigarUtilizationPct: 12,
      maxConvergenceScore: 0.42
    };

    const prompts = input.prompts || [
      'recommend something tonight',
      'what should I try',
      'surprise me',
      'help me pick',
      'evening recommendation',
      'give me a pairing',
      'pair something for me',
      'what pairs well tonight',
      'something smooth',
      'something bold',
      'something luxurious',
      'something approachable',
      'make it richer',
      'make it lighter',
      'refine bolder',
      'under 30',
      'what would you pour',
      'curate something for me',
      'menu recommendation',
      'wildcard pick',
      'comfort pick',
      'something interesting',
      'something balanced',
      'first visit recommendation',
      'open to anything',
      'harmony pairing',
      'celebration pick',
      'slow evening pairing',
      'value pick',
      'splurge tonight'
    ];

    const repeat = input.repeatPerPrompt != null ? input.repeatPerPrompt : 4;
    let runCount = 0;
    prompts.forEach(function (p) {
      for (let r = 0; r < repeat; r += 1) {
        const session = {};
        const turn = RR.resolveRecommendationTurn({
          promptText: p + (r ? ' ' + r : ''),
          journeyLevel: effectiveJourneyLevel(WJ, session, p),
          sessionRuntime: session
        });
        if (E.recordGlobalPick) E.recordGlobalPick(turn);
        if (RD && RD.recordTurn) RD.recordTurn(turn);
        runCount += 1;
      }
    });

    const metrics = E.computeMetrics ? E.computeMetrics() : {};
    const checks = {
      uniqueSpirits: metrics.uniqueSpirits >= thresholds.minUniqueSpirits,
      uniqueCigars: metrics.uniqueCigars >= thresholds.minUniqueCigars,
      topSpiritShare: metrics.topSpiritSharePct <= thresholds.maxTopSpiritSharePct,
      topCigarShare: metrics.topCigarSharePct <= thresholds.maxTopCigarSharePct,
      ashtonShare: metrics.ashtonSharePct <= thresholds.maxAshtonSharePct,
      eagleRareShare: metrics.eagleRareSharePct <= thresholds.maxEagleRareSharePct,
      spiritUtilization: metrics.spiritUtilizationPct >= thresholds.minSpiritUtilizationPct,
      cigarUtilization: metrics.cigarUtilizationPct >= thresholds.minCigarUtilizationPct,
      convergence: metrics.convergenceScore <= thresholds.maxConvergenceScore
    };
    const ok = Object.keys(checks).every(function (k) {
      return checks[k];
    });

    return {
      runCount: runCount,
      promptVariants: prompts.length,
      metrics: metrics,
      thresholds: thresholds,
      checks: checks,
      ok: ok
    };
  }

  if (op === 'catalogLoadingFallbacks') {
    const SR = ctx.SterlonRecommendations;
    const LP = ctx.LoungeProducts;
    const savedCigars = LP.listMenuCigarNames;
    const savedSpirits = LP.listMenuSpiritNames;
    LP.listMenuCigarNames = function () {
      return [];
    };
    LP.listMenuSpiritNames = function () {
      return [];
    };
    const cigars = SR.getMenuCigars ? SR.getMenuCigars() : [];
    const spirits = SR.getMenuSpirits ? SR.getMenuSpirits() : [];
    LP.listMenuCigarNames = savedCigars;
    LP.listMenuSpiritNames = savedSpirits;
    const heroPattern = /\b(padron|ashton|pappy|blanton)\b/i;
    const heroHit =
      cigars.some(function (n) {
        return heroPattern.test(n);
      }) ||
      spirits.some(function (n) {
        return heroPattern.test(n);
      });
    return {
      cigarCount: cigars.length,
      spiritCount: spirits.length,
      heroHit: heroHit,
      ok: cigars.length === 0 && spirits.length === 0 && !heroHit
    };
  }

  if (op === 'ontologyAffinityDeck') {
    const OP = ctx.OntologyPolicy;
    const LP = ctx.LoungeProducts;
    if (!OP || !LP) throw new Error('OntologyPolicy + LoungeProducts required');
    const cigarName = input.cigarName;
    const cigar = LP.findCigarByName(cigarName);
    const resolved = OP.resolveSpiritDeckKey({
      promptText: input.promptText || 'something peaty islay',
      pairingCigar: cigarName,
      nlpDeckKey: 'peated'
    });
    return {
      cigarName,
      pairingAffinity: cigar && cigar.guidance ? cigar.guidance.pairingAffinity : null,
      deckKey: resolved.deckKey,
      overridden: resolved.overridden,
      ok: resolved.deckKey === (input.expectedDeck || 'bourbon') && resolved.overridden === true
    };
  }

  if (op === 'ontologyCuratedWhy') {
    const turn = ctx.RecommendationRuntime.resolveRecommendationTurn({
      promptText: input.promptText || 'recommend a cigar and bourbon',
      journeyLevel: input.journeyLevel || 'advanced',
      sessionRuntime: input.session || {}
    });
    const why0 = turn.cards && turn.cards[0] && turn.cards[0].why ? String(turn.cards[0].why[0] || '') : '';
    const signals = (turn.provenance && turn.provenance.signals) || [];
    return {
      whyLen: why0.length,
      hasCuratedPrefix: /recommend (when|for)/i.test(why0),
      signalCurated: signals.indexOf('ontology-curated-why') !== -1,
      ok: /recommend (when|for)/i.test(why0) && signals.indexOf('ontology-curated-why') !== -1
    };
  }

  if (op === 'ontologyNoviceQuickSmoke') {
    const turn = ctx.RecommendationRuntime.resolveRecommendationTurn({
      promptText: input.promptText || 'quick lunch smoke something mild',
      journeyLevel: 'novice',
      sessionRuntime: {}
    });
    const cigar = turn.cards && turn.cards[0] ? turn.cards[0].cigar : null;
    const p = cigar ? ctx.LoungeProducts.findCigarByName(cigar) : null;
    const mins = p && p.spec && p.spec.smokeTime ? parseInt(String(p.spec.smokeTime), 10) : 999;
    const beginner = p && p.provenance ? String(p.provenance.beginnerSafe || '') : '';
    return {
      cigar,
      smokeTime: p && p.spec ? p.spec.smokeTime : null,
      beginnerSafe: beginner,
      signals: (turn.provenance && turn.provenance.signals) || [],
      ok:
        !!cigar &&
        (mins < 70 || beginner.toLowerCase() === 'yes') &&
        ((turn.provenance && turn.provenance.signals) || []).indexOf('ontology-suppressed') !== -1
    };
  }

  if (op === 'ontologyRetrievalContext') {
    const SCR = ctx.SterlonCatalogRetrieval;
    const hits = SCR.searchCatalog(input.query || 'dessert cigar cognac after dinner', {
      category: 'cigar',
      limit: 5
    });
    const top = hits[0];
    const g = top && top.guidance ? top.guidance : {};
    return {
      hitCount: hits.length,
      topName: top ? top.name : null,
      topOccasion: g.occasion || null,
      topAffinity: g.pairingAffinity || null,
      ok:
        hits.length > 0 &&
        (String(g.pairingAffinity || '').toLowerCase().indexOf('cognac') !== -1 ||
          String(g.occasion || '').toLowerCase().indexOf('dinner') !== -1 ||
          String(g.bestFor || '').toLowerCase().indexOf('dinner') !== -1)
    };
  }

}
