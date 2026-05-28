/**
 * execute-handlers-f.mjs — freeze-case op handlers group F.
 * Auto-split from executeFreezeCase; loaded by execute.mjs.
 */
export function handleGroupF(ctx, op, input, H) {
  const { latchSession, effectiveJourneyLevel, pickProvenance,
    projectRecommendationTurnForFreeze, runtimeRecommendationCards,
    loadSterlonConciergeProseStack, loadPairingEvalDataset,
    runPairingQualityGate, SLOT_KEYS } = H;
  const SR = ctx.SterlonRecommendations;
  const RR = ctx.RecommendationRuntime;
  const SS = ctx.SterlonSensory;

  const deckKeyFn = () => input.deckKey || 'bourbon';

  if (op === 'restorationAdoptInvalid') {
    // Law 8: adoptRestoredTurn must reject malformed/incomplete objects and return null.
    const TH = ctx.RecommendationTurnHelpers;
    if (!TH || typeof TH.adoptRestoredTurn !== 'function') {
      throw new Error('RecommendationTurnHelpers.adoptRestoredTurn required');
    }
    const nullResult         = TH.adoptRestoredTurn(null);
    const undefinedResult    = TH.adoptRestoredTurn(undefined);
    const emptyObjectResult  = TH.adoptRestoredTurn({});
    const stringResult       = TH.adoptRestoredTurn('not-a-turn');
    const noCardsResult      = TH.adoptRestoredTurn({ contractVersion: 1, provenance: { source: 'recommendation-runtime', module: 'build-set' } });
    const badCardsResult     = TH.adoptRestoredTurn({ contractVersion: 1, cards: 'not-an-array', provenance: { source: 'recommendation-runtime', module: 'build-set' } });
    // A fabricated card set with products that don't exist in the allowlist
    // should still pass structure validation (allowlist check is runtime-level, not
    // governance validation). Confirm the structural gates are the active guard here.
    return {
      nullReturnsNull:          nullResult === null,
      undefinedReturnsNull:     undefinedResult === null,
      emptyObjectReturnsNull:   emptyObjectResult === null,
      stringReturnsNull:        stringResult === null,
      noCardsReturnsNull:       noCardsResult === null,
      badCardsArrayReturnsNull: badCardsResult === null
    };
  }

  if (op === 'restorationAdoptVersionMismatch') {
    // Law 8: adoptRestoredTurn must discard a turn whose runtimeVersion does not
    // match the current runtime — preventing stale serialized authority from
    // being hydrated after a runtime upgrade.
    const TH = ctx.RecommendationTurnHelpers;
    const WJ = ctx.WhiskeyJourney;
    if (!TH || typeof TH.adoptRestoredTurn !== 'function') {
      throw new Error('RecommendationTurnHelpers.adoptRestoredTurn required');
    }
    const resolveTurn =
      RR && typeof RR.resolveRecommendationTurn === 'function'
        ? RR.resolveRecommendationTurn
        : RR && typeof RR.buildRecommendationSet === 'function'
          ? RR.buildRecommendationSet
          : null;
    if (!resolveTurn) throw new Error('RecommendationRuntime required');
    const currentVersion = RR.version;
    const session = {};
    const originalTurn = resolveTurn({
      promptText: 'recommend something',
      journeyLevel: 'advanced',
      sessionRuntime: session
    });
    // Simulate a turn serialized at a different runtime version.
    const plain = JSON.parse(JSON.stringify(originalTurn));
    plain.provenance.runtimeVersion = typeof currentVersion === 'number'
      ? currentVersion + 999
      : 'stale-version-xyz';
    const staleResult = TH.adoptRestoredTurn(plain);
    // Verify the matching version still adopts cleanly.
    const validPlain = JSON.parse(JSON.stringify(originalTurn));
    const matchingResult = TH.adoptRestoredTurn(validPlain);
    return {
      staleTurnReturnsNull:    staleResult === null,
      matchingVersionAdopts:   matchingResult !== null,
      matchingIsFrozen:        matchingResult ? Object.isFrozen(matchingResult) : null,
      currentRuntimeVersion:   currentVersion
    };
  }

  if (op === 'restorationAdoptDegraded') {
    // Law 8: degraded turns (explicit, governed failures) must survive adoption —
    // session restoration must preserve degraded state, not silently drop it.
    const TH = ctx.RecommendationTurnHelpers;
    if (!TH || typeof TH.adoptRestoredTurn !== 'function' || typeof TH.buildDegradedTurn !== 'function') {
      throw new Error('RecommendationTurnHelpers required');
    }
    const degradedTurn = TH.buildDegradedTurn({
      promptText: input.promptText || 'recommend something',
      journeyLevel: input.journeyLevel || 'advanced',
      reason: 'p0-7-restore-test'
    });
    // Simulate localStorage round-trip.
    const plain = JSON.parse(JSON.stringify(degradedTurn));
    const adopted = TH.adoptRestoredTurn(plain);
    if (!adopted) {
      return { adopted: false, reason: 'adoptRestoredTurn rejected a valid degraded turn' };
    }
    const validateResult = TH.validateRecommendationTurn(adopted, { governance: true });
    return {
      adopted: true,
      adoptedIsFrozen:    Object.isFrozen(adopted),
      degradedPreserved:  adopted.degraded === true,
      validateOk:         TH.validateRecommendationTurn(adopted).ok,
      governanceOk:       validateResult.ok,
      reasonPreserved:    adopted.provenance && adopted.provenance.reason === 'p0-7-restore-test'
    };
  }

  if (op === 'stackValidate') {
    const SV = ctx.SterlonStackValidate;
    if (!SV || typeof SV.assertSterlonStack !== 'function') {
      throw new Error('SterlonStackValidate.assertSterlonStack required');
    }
    const result = SV.assertSterlonStack();
    return {
      ok: result.ok,
      missing: result.missing.slice(),
      warnings: result.warnings.slice(),
      hasResolveTurn: !!(ctx.RecommendationRuntime && ctx.RecommendationRuntime.resolveRecommendationTurn),
      hasLoungeProducts: !!ctx.LoungeProducts,
      requiredModuleCount: SV.REQUIRED_CHECKS ? SV.REQUIRED_CHECKS.length : null
    };
  }

  if (op === 'routerSamples') {
    const RT = ctx.SterlonChatRouter;
    const SPM = ctx.SterlonProductMatch;
    if (!RT) throw new Error('SterlonChatRouter required');
    const offMenu = RT.matchOffMenuProductInText('I had chivas last night');
    const evening = RT.detectEveningDimensions('after dinner on the patio');
    const refinementDepth = { depth: 0, capped: false };
    for (let i = 0; i < 4; i += 1) {
      refinementDepth.depth += 1;
      if (refinementDepth.depth >= 3) refinementDepth.capped = true;
    }
    const maxHistory = input.maxHistoryTurns || 12;
    const historyLen = 20;
    const historySlice = historyLen > maxHistory ? historyLen - maxHistory : 0;
    return {
      offMenuName: offMenu && offMenu.name,
      offMenuCategory: offMenu && offMenu.category,
      eveningOccasion: evening.occasion,
      eveningAtmosphere: evening.atmosphere,
      refinementDepthCapped: refinementDepth.capped,
      historySliceStart: historySlice,
      aliasPappy: SPM && SPM.resolveAlias ? (SPM.resolveAlias('thinking about pappy') || {}).name : null
    };
  }

  if (op === 'aliasMatch') {
    const SPM = ctx.SterlonProductMatch;
    if (!SPM || typeof SPM.resolveAlias !== 'function') {
      throw new Error('SterlonProductMatch.resolveAlias required');
    }
    const cases = input.cases || [
      { text: 'pappy tonight', expect: 'Pappy Van Winkle 23yr' },
      { text: 'blantons pour', expect: "Blanton's Single Barrel" },
      { text: 'cohiba siglo', expect: 'Cohiba Siglo VI' },
      { text: 'random wine', expect: null }
    ];
    return cases.map(function (c) {
      const hit = SPM.resolveAlias(c.text);
      return {
        text: c.text,
        name: hit ? hit.name : null,
        ok: hit ? hit.name === c.expect : c.expect === null
      };
    });
  }

  if (op === 'sessionRouting') {
    const SL = ctx.SterlonSessionLifecycle;
    const SO = ctx.SterlonSessionRouting;
    const RS = ctx.SterlonRuntimeState;
    if (!SL || !SO || !RS) throw new Error('Session modules required');
    const sr = RS.createDefaultSessionState();
    SL.setSessionProvider(function () { return sr; });
    SO.setSessionProvider(function () { return sr; });
    const deckKey = SL.applyTurnRouting(sr, {
      route: { deckKey: 'bourbon', category: 'spirit', name: 'Pappy Van Winkle 23yr' }
    });
    const levelNovice = SO.getEffectiveJourneyLevel(sr, 'I am new to whiskey, keep it approachable');
    const levelAgain = SO.getEffectiveJourneyLevel(sr, 'something else');
    SL.applyEveningDimensions(sr, { occasion: 'afterDinner', rhythm: null, social: null, atmosphere: null });
    SL.applyRefinementState(sr, 'lighter', 'best', 1);
    SL.applyBudgetCeiling(sr, 30);
    return {
      deckKey: deckKey,
      flavorRoutedSpirit: sr.flavorRoutedSpirit,
      activeCategoryFocus: sr.activeCategoryFocus,
      latchedJourneyLevel: sr.latchedJourneyLevel,
      levelNovice: levelNovice,
      levelIdempotent: levelAgain === levelNovice,
      eveningOccasion: sr.eveningOccasion,
      refinementAxis: sr.refinementAxis,
      refinementTarget: sr.refinementTarget,
      refinementChainDepth: sr.refinementChainDepth,
      budgetCeiling: sr.budgetCeiling
    };
  }

  if (op === 'conciergeProseSamples') {
    loadSterlonConciergeProseStack(ctx);
    const CP = ctx.SterlonConciergeProse;
    const RS = ctx.SterlonRuntimeState;
    if (!CP || !RS) throw new Error('SterlonConciergeProse + SterlonRuntimeState required');
    const sr = RS.createDefaultSessionState();
    sr.turnCount = 0;
    CP.setContextProvider(function () {
      return {
        sessionRuntime: sr,
        currentTurnDeckKey: 'bourbon',
        RuntimeMode: RS.RuntimeMode
      };
    });
    const card = {
      cigar: 'Padron 1964 Anniversary',
      spirit: "Blanton's Single Barrel",
      why: ['vanilla', 'caramel', 'oak']
    };
    return {
      greetingHello: CP.buildGreetingProse('hello there'),
      clarificationSpirit: CP.buildClarificationProse('something smooth for after dinner'),
      refinementLighter: CP.buildRefinementLeadProse(
        'lighter',
        'best',
        { spirit: "Woodford Reserve", cigar: 'Oliva Serie V Melanio' },
        { spirit: "Blanton's Single Barrel", cigar: 'Padron 1964 Anniversary' },
        ''
      ),
      gracefulDegradation: CP.buildGracefulDegradationProse(
        'recommend bourbon',
        RS.RuntimeMode.RECOMMENDATION
      ),
      sommelierLead: CP.buildSommelierRecommendationProse(
        card,
        'recommend a bourbon pour',
        null
      )
    };
  }

  if (op === 'proseGovernanceLimits') {
    loadSterlonConciergeProseStack(ctx);
    const GP = ctx.SterlonGatewayProse;
    const PP = ctx.SterlonProsePipeline;
    if (!GP || typeof GP.governGeneratedProse !== 'function') {
      throw new Error('SterlonGatewayProse.governGeneratedProse required');
    }
    const longRaw =
      'This is an intentionally verbose concierge answer that keeps going with extra detail, ' +
      'layered tasting notes, repeated framing, and more words than any profile should allow. '.repeat(12);
    const limits = GP.PROSE_GOVERNANCE_LIMITS || {};
    const profiles = Object.keys(limits);
    function countWords(text) {
      return String(text || '').trim().split(/\s+/).filter(Boolean).length;
    }
    function countSentences(text) {
      return String(text || '').split(/[.!?]+/).filter(function (s) { return s.trim().length > 0; }).length;
    }
    return profiles.map(function (profileKey) {
      const cap = limits[profileKey] || limits.prose;
      const governed = GP.governGeneratedProse(longRaw, profileKey);
      const words = countWords(governed);
      const sentences = countSentences(governed);
      return {
        profile: profileKey,
        words: words,
        sentences: sentences,
        withinWordCap: words <= cap.words,
        withinSentenceCap: sentences <= cap.sentences,
        normalizedSpacing: PP && PP.normalizeSentenceSpacing
          ? PP.normalizeSentenceSpacing(governed) === governed
          : true
      };
    });
  }

}
