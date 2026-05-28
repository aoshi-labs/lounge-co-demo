/**
 * execute-handlers-b.mjs — freeze-case op handlers group B.
 * Auto-split from executeFreezeCase; loaded by execute.mjs.
 */
export function handleGroupB(ctx, op, input, H) {
  const { latchSession, effectiveJourneyLevel, pickProvenance,
    projectRecommendationTurnForFreeze, runtimeRecommendationCards,
    loadSterlonConciergeProseStack, loadPairingEvalDataset,
    runPairingQualityGate, SLOT_KEYS } = H;
  const SR = ctx.SterlonRecommendations;
  const RR = ctx.RecommendationRuntime;
  const SS = ctx.SterlonSensory;

  const deckKeyFn = () => input.deckKey || 'bourbon';

  if (op === 'sessionProviderUnwired') {
    const SL = ctx.SterlonSessionLifecycle;
    const RS = ctx.SterlonRuntimeState;
    if (!SL || !RS) {
      throw new Error('SterlonSessionLifecycle and SterlonRuntimeState required');
    }
    const e1 = SL.registerProductEntry('Spirit A', 'spirit', 'mentioned', null);
    const e2 = SL.registerProductEntry('Spirit A', 'spirit', 'mentioned', null);
    const session = RS.createDefaultSessionState();
    SL.setSessionProvider(function () { return session; });
    SL.registerProductEntry('Spirit B', 'spirit', 'mentioned', null);
    return {
      unwiredSameEntry: e1 === e2,
      wiredRegistryLen: session.sessionProductRegistry.length
    };
  }

  if (op === 'sessionPersistQuotaFailure') {
    const SL = ctx.SterlonSessionLifecycle;
    const RS = ctx.SterlonRuntimeState;
    if (!SL || !RS) throw new Error('SterlonSessionLifecycle required');
    let warned = false;
    const origWarn = console.warn;
    console.warn = function () {
      const msg = String(arguments[0] || '');
      if (msg.indexOf('Failed to persist session runtime') !== -1) warned = true;
      origWarn.apply(console, arguments);
    };
    SL.setSessionProvider(function () { return RS.createDefaultSessionState(); });
    ctx.localStorage = {
      setItem() {
        const err = new Error('quota exceeded');
        err.name = 'QuotaExceededError';
        throw err;
      },
      getItem() { return null; },
      removeItem() {}
    };
    SL.saveSessionRuntime();
    console.warn = origWarn;
    return { warnedOnPersistFailure: warned };
  }

  if (op === 'sessionProviderDoubleWire') {
    const SL = ctx.SterlonSessionLifecycle;
    const RS = ctx.SterlonRuntimeState;
    if (!SL || !RS) throw new Error('SterlonSessionLifecycle required');
    let lateWarned = false;
    let doubleWarned = false;
    const origWarn = console.warn;
    console.warn = function () {
      const msg = String(arguments[0] || '');
      if (msg.indexOf('called after fallback session was used') !== -1) lateWarned = true;
      if (msg.indexOf('called more than once') !== -1) doubleWarned = true;
      origWarn.apply(console, arguments);
    };
    SL.registerProductEntry('Spirit A', 'spirit', 'mentioned', null);
    const session = RS.createDefaultSessionState();
    SL.setSessionProvider(function () { return session; });
    SL.setSessionProvider(function () { return session; });
    console.warn = origWarn;
    return { lateWireWarned: lateWarned, doubleWireWarned: doubleWarned };
  }

  if (op === 'selectorIntensityAdjacent') {
    const ladder = input.ladder || ["Blanton's Single Barrel", 'Pappy Van Winkle 23yr'];
    return RR.selectors.getIntensityAdjacent(input.name, input.direction, ladder);
  }

  if (op === 'recommendationCards') {
    return runtimeRecommendationCards(ctx, input.prompt || '', input.session || {});
  }

  if (op === 'generateRecommendationContext') {
    return RR.generateRecommendationContext(input.opts || {});
  }

  if (op === 'buildRationaleAtoms') {
    return RR.buildRationaleAtoms(input.cigar, input.spirit, input.food);
  }

  if (op === 'scorePairing') {
    return SS.scorePairing(input.nameA, input.nameB);
  }

  if (op === 'ctxScoreParity') {
    const opts = input.opts || {};
    const cigar = opts.cigar || '';
    const spirit = opts.spirit || '';
    const food = opts.food || '';
    const ctx = RR.generateRecommendationContext(opts);
    const csD = SS.scorePairing(cigar, spirit);
    const sfD = food ? SS.scorePairing(spirit, food) : null;
    const jCtx = JSON.stringify(ctx.compatibility.cigarSpirit);
    const jDir = JSON.stringify(csD);
    const jSfCtx = JSON.stringify(ctx.compatibility.spiritFood);
    const jSfDir = JSON.stringify(sfD);
    return {
      cigarSpiritMatches: jCtx === jDir,
      spiritFoodMatches: !food ? true : jSfCtx === jSfDir,
      ctxCigarSpirit: ctx.compatibility.cigarSpirit,
      directCigarSpirit: csD
    };
  }

}
