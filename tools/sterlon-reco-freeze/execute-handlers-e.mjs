/**
 * execute-handlers-e.mjs — freeze-case op handlers group E.
 * Auto-split from executeFreezeCase; loaded by execute.mjs.
 */
export function handleGroupE(ctx, op, input, H) {
  const { latchSession, effectiveJourneyLevel, pickProvenance,
    projectRecommendationTurnForFreeze, runtimeRecommendationCards,
    loadSterlonConciergeProseStack, loadPairingEvalDataset,
    runPairingQualityGate, SLOT_KEYS } = H;
  const SR = ctx.SterlonRecommendations;
  const RR = ctx.RecommendationRuntime;
  const SS = ctx.SterlonSensory;

  const deckKeyFn = () => input.deckKey || 'bourbon';

  if (op === 'scoringDrivenSlotsCigarAnchor') {
    const PE = ctx.PairingEngine;
    const GEN = ctx.RecommendationGenerate;
    const DT = ctx.DeckTemplate;
    const PIDs = ctx.RecommendationProductIds;
    const anchorCigar = input.anchorCigar || 'Padron 1926 No. 35';
    const journeyLevel = input.journeyLevel || 'advanced';

    const menuSpirits = ctx.LoungeProducts.listMenuSpiritNames();
    const slots = PE.pickSlots(anchorCigar, menuSpirits);

    const deckCards =
      DT && typeof DT.getDeckCards === 'function'
        ? DT.getDeckCards('', journeyLevel, 'bourbon')
        : [];
    const cards = GEN.generateRecommendations({ anchorCigar, journeyLevel, deckCards });

    const displayCigar = (c) =>
      c.cigar || (PIDs && c.cigarId ? PIDs.displayNameForId('cigar', c.cigarId) : null);
    const displaySpirit = (c) =>
      c.spirit || (PIDs && c.spiritId ? PIDs.displayNameForId('spirit', c.spiritId) : null);
    const cardCigars = [displayCigar(cards[0]), displayCigar(cards[1]), displayCigar(cards[2])];
    const cardSpirits = [displaySpirit(cards[0]), displaySpirit(cards[1]), displaySpirit(cards[2])];
    const uniqueSpirits = new Set(cardSpirits.filter(Boolean));

    return {
      anchorCigar,
      slots,
      cardsCigar: cardCigars,
      cardsSpirit: cardSpirits,
      allCigarsMatchAnchor: cardCigars.every((n) => n === anchorCigar),
      allSpiritsNonNull: cardSpirits.every(Boolean),
      spiritsDistinctWhenMenuAllows:
        menuSpirits.length >= 3 ? uniqueSpirits.size === 3 : uniqueSpirits.size === menuSpirits.length,
      cardsHaveFood: cards.every((c) => !!c.food),
      cardsHaveWhy: cards.every((c) => Array.isArray(c.why) && c.why.length > 0),
      slotsMatchCards:
        slots.best === cardSpirits[0] &&
        slots.safe === cardSpirits[1] &&
        slots.wildcard === cardSpirits[2]
    };
  }

  // ── Governance tests (P0.5) ────────────────────────────────────────────────

  if (op === 'governanceImmutability') {
    // Law 2: RecommendationTurn is deep-frozen after creation.
    const WJ = ctx.WhiskeyJourney;
    const resolveTurn =
      RR && typeof RR.resolveRecommendationTurn === 'function'
        ? RR.resolveRecommendationTurn
        : RR && typeof RR.buildRecommendationSet === 'function'
          ? RR.buildRecommendationSet
          : null;
    if (!resolveTurn) throw new Error('RecommendationRuntime required');
    const session = {};
    const turn = resolveTurn({
      promptText: 'recommend a pairing',
      journeyLevel: 'advanced',
      sessionRuntime: session
    });
    const turnFrozen = Object.isFrozen(turn);
    const cardsFrozen = Object.isFrozen(turn.cards);
    const bestCardFrozen = turn.cards[0] ? Object.isFrozen(turn.cards[0]) : null;
    const provenanceFrozen = Object.isFrozen(turn.provenance);
    let turnMutationThrows = false;
    let cardMutationThrows = false;
    try { turn.cards = []; } catch (e) { turnMutationThrows = true; }
    try { if (turn.cards[0]) turn.cards[0].spirit = 'mutated'; } catch (e) { cardMutationThrows = true; }
    return {
      turnFrozen,
      cardsFrozen,
      bestCardFrozen,
      provenanceFrozen,
      turnMutationThrows,
      cardMutationThrows,
      cardSpiritUnchanged: turn.cards[0] ? turn.cards[0].spirit !== 'mutated' : true
    };
  }

  if (op === 'governanceValidatorIdentity') {
    // Law 3: validateCards never changes product identity.
    const SR = ctx.SterlonRecommendations;
    const WJ = ctx.WhiskeyJourney;
    const resolveTurn =
      RR && typeof RR.resolveRecommendationTurn === 'function'
        ? RR.resolveRecommendationTurn
        : RR && typeof RR.buildRecommendationSet === 'function'
          ? RR.buildRecommendationSet
          : null;
    if (!resolveTurn) throw new Error('RecommendationRuntime required');
    const session = {};
    const turn = resolveTurn({
      promptText: 'recommend something peaty',
      journeyLevel: 'advanced',
      sessionRuntime: session
    });
    // Cards from the frozen turn are read-only. Copy for validation input.
    const cardsCopy = turn.cards.map((c) => Object.assign({}, c));
    const validated = SR.validateCards(cardsCopy, 'recommend something peaty', {});
    return {
      inputCigars:   turn.cards.map((c) => c.cigar),
      inputSpirits:  turn.cards.map((c) => c.spirit),
      inputFoods:    turn.cards.map((c) => c.food),
      outputCigars:  validated.map((c) => c.cigar),
      outputSpirits: validated.map((c) => c.spirit),
      outputFoods:   validated.map((c) => c.food),
      cigarsUnchanged:  JSON.stringify(turn.cards.map((c) => c.cigar))  === JSON.stringify(validated.map((c) => c.cigar)),
      spiritsUnchanged: JSON.stringify(turn.cards.map((c) => c.spirit)) === JSON.stringify(validated.map((c) => c.spirit)),
      foodsUnchanged:   JSON.stringify(turn.cards.map((c) => c.food))   === JSON.stringify(validated.map((c) => c.food)),
      enrichedHasStock: validated.every((c) => typeof c.stock === 'string'),
      countPreserved:   turn.cards.length === validated.length
    };
  }

  if (op === 'governanceProvenance') {
    // Law 7: provenance completeness for replay readiness.
    const WJ = ctx.WhiskeyJourney;
    const resolveTurn =
      RR && typeof RR.resolveRecommendationTurn === 'function'
        ? RR.resolveRecommendationTurn
        : RR && typeof RR.buildRecommendationSet === 'function'
          ? RR.buildRecommendationSet
          : null;
    if (!resolveTurn) throw new Error('RecommendationRuntime required');
    const session = {};
    const text = 'recommend a pairing for a special evening';
    const turn = resolveTurn({
      promptText: text,
      journeyLevel: 'advanced',
      sessionRuntime: session
    });
    const p = turn.provenance || {};
    return {
      hasTurnId:       typeof p.turnId === 'string' && p.turnId.length > 0,
      hasScoringVersion: p.scoringVersion != null,
      hasRuntimeVersion: p.runtimeVersion != null,
      hasGeneratedAt:  typeof turn.generatedAt === 'number',
      hasJourneyLevel: turn.journeyLevel != null,
      hasModule:       p.module === 'build-set',
      hasSignals:      Array.isArray(p.signals) && p.signals.length > 0,
      hasSource:       p.source === 'recommendation-runtime',
      hasPromptText:   p.promptText === text,
      allowlistVerified: turn.allowlistStatus && turn.allowlistStatus.verified === true,
      runtimeModeNormal: turn.runtimeMode === 'normal',
      degradedFalse:   turn.degraded === false
    };
  }

  // ── RR-E2 Refinement governance tests ─────────────────────────────────────

  function resolveRefinementForFreeze(input, parentTurn, axis) {
    if (!RR || typeof RR.resolveRefinementFromContext !== 'function') {
      throw new Error('RecommendationRuntime.resolveRefinementFromContext required');
    }
    const result = RR.resolveRefinementFromContext({
      parentTurn: parentTurn,
      refinementAxis: axis || 'lighter',
      refinementTarget: input.refinementTarget || 'best',
      budgetCeiling: input.budgetCeiling,
      refinementSource: 'chat-refinement-chip'
    });
    return result && result.turn ? result.turn : null;
  }

  if (op === 'refinementCreatesNewTurn') {
    const WJ = ctx.WhiskeyJourney;
    const resolveTurn =
      RR && typeof RR.resolveRecommendationTurn === 'function'
        ? RR.resolveRecommendationTurn
        : RR && typeof RR.buildRecommendationSet === 'function'
          ? RR.buildRecommendationSet
          : null;
    if (!resolveTurn) throw new Error('RecommendationRuntime required');
    const session = {};
    const parentTurn = resolveTurn({
      promptText: input.parentPromptText || 'recommend a pairing',
      journeyLevel: effectiveJourneyLevel(WJ, session, input.parentPromptText || ''),
      sessionRuntime: session
    });
    const parentTurnId = parentTurn.provenance && parentTurn.provenance.turnId;
    const refinedTurn = resolveRefinementForFreeze(input, parentTurn, input.refinementAxis || 'lighter');
    const refinedTurnId = refinedTurn && refinedTurn.provenance && refinedTurn.provenance.turnId;
    return {
      parentTurnHasTurnId:   typeof parentTurnId === 'string' && parentTurnId.length > 0,
      refinedTurnHasTurnId:  typeof refinedTurnId === 'string' && refinedTurnId.length > 0,
      turnIdsAreDifferent:   parentTurnId !== refinedTurnId,
      parentRuntimeMode:     parentTurn.runtimeMode,
      refinedRuntimeMode:    refinedTurn ? refinedTurn.runtimeMode : null,
      parentDegraded:        parentTurn.degraded,
      refinedDegraded:       refinedTurn ? refinedTurn.degraded : null,
      parentFrozen:          Object.isFrozen(parentTurn),
      refinedFrozen:         refinedTurn ? Object.isFrozen(refinedTurn) : null,
      refinedHasCards:       refinedTurn && Array.isArray(refinedTurn.cards) && refinedTurn.cards.length > 0
    };
  }

  if (op === 'refinementProvenanceChain') {
    const WJ = ctx.WhiskeyJourney;
    const resolveTurn =
      RR && typeof RR.resolveRecommendationTurn === 'function'
        ? RR.resolveRecommendationTurn
        : RR && typeof RR.buildRecommendationSet === 'function'
          ? RR.buildRecommendationSet
          : null;
    if (!resolveTurn) throw new Error('RecommendationRuntime required');
    const session = {};
    const parentTurn = resolveTurn({
      promptText:    input.parentPromptText || 'recommend a pairing',
      journeyLevel:  effectiveJourneyLevel(WJ, session, input.parentPromptText || ''),
      sessionRuntime: session
    });
    const parentTurnId = parentTurn.provenance && parentTurn.provenance.turnId;
    const axis = input.refinementAxis || 'lighter';
    const refinedTurn = resolveRefinementForFreeze(input, parentTurn, axis);
    const rp = refinedTurn.provenance || {};
    const pp = parentTurn.provenance || {};
    return {
      parentTurnIdSet:           typeof parentTurnId === 'string' && parentTurnId.length > 0,
      refinedCarriesParentId:    rp.parentTurnId === parentTurnId,
      refinedHasParentTurnId:    typeof rp.parentTurnId === 'string' && rp.parentTurnId.length > 0,
      refinedParentTurnIdNonEmpty: !!(rp.parentTurnId),
      refinementType:            rp.refinementType || null,
      refinementReason:          rp.refinementReason || null,
      refinementSource:          rp.refinementSource || null,
      hasRefinementSignal:       Array.isArray(rp.signals) && rp.signals.some(function (s) { return s.indexOf('refinement-') === 0; }),
      sourceIsRuntime:           rp.source === 'recommendation-runtime',
      parentSourceIsRuntime:     pp.source === 'recommendation-runtime',
      moduleIsResolveRefinement: rp.module === 'resolve-refinement',
      structValidOk:             ctx.RecommendationTurnHelpers
        ? ctx.RecommendationTurnHelpers.validateRecommendationTurn(refinedTurn).ok
        : null,
      governanceOk:              ctx.RecommendationTurnHelpers
        ? ctx.RecommendationTurnHelpers.validateRecommendationTurn(refinedTurn, { governance: true }).ok
        : null
    };
  }

  if (op === 'noDirectCardMutation') {
    const WJ = ctx.WhiskeyJourney;
    const resolveTurn =
      RR && typeof RR.resolveRecommendationTurn === 'function'
        ? RR.resolveRecommendationTurn
        : RR && typeof RR.buildRecommendationSet === 'function'
          ? RR.buildRecommendationSet
          : null;
    if (!resolveTurn) throw new Error('RecommendationRuntime required');
    const session = {};
    const parentTurn = resolveTurn({
      promptText:    input.parentPromptText || 'recommend a pairing',
      journeyLevel:  effectiveJourneyLevel(WJ, session, input.parentPromptText || ''),
      sessionRuntime: session
    });
    const parentTurnId    = parentTurn.provenance && parentTurn.provenance.turnId;
    const parentCardSig   = JSON.stringify(parentTurn.cards.map(function (c) { return c && c.spirit; }));
    const parentFrozen    = Object.isFrozen(parentTurn);
    const axes = Array.isArray(input.refinementAxes) ? input.refinementAxes : ['lighter', 'bolder'];
    const refinedTurnIds  = [];
    const refinedNotSameObject = [];
    for (var i = 0; i < axes.length; i++) {
      var axis = axes[i];
      var rt = resolveRefinementForFreeze(input, parentTurn, axis);
      refinedTurnIds.push(rt && rt.provenance ? rt.provenance.turnId : null);
      refinedNotSameObject.push(rt !== parentTurn);
    }
    const parentCardSigAfter  = JSON.stringify(parentTurn.cards.map(function (c) { return c && c.spirit; }));
    const allTurnIdsDistinct  = refinedTurnIds.every(function (id) { return id !== parentTurnId; });
    const allTurnIdsUnique    = new Set(refinedTurnIds).size === refinedTurnIds.length;
    return {
      parentFrozen:          parentFrozen,
      parentCardSigUnchanged: parentCardSig === parentCardSigAfter,
      allRefinedNotParent:   refinedNotSameObject.every(Boolean),
      allTurnIdsDistinct:    allTurnIdsDistinct,
      allTurnIdsUnique:      allTurnIdsUnique,
      refinedCount:          axes.length,
      axes:                  axes
    };
  }

  if (op === 'refinementPersistRoundTrip') {
    const store = Object.create(null);
    ctx.localStorage = {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    };
    const WJ = ctx.WhiskeyJourney;
    if (!RR || typeof RR.resolveTurnFromChatContext !== 'function') {
      throw new Error('RecommendationRuntime.resolveTurnFromChatContext required');
    }
    if (typeof RR.saveLastRecommendationTurn !== 'function' || typeof RR.loadLastRecommendationTurn !== 'function') {
      throw new Error('RecommendationRuntime save/loadLastRecommendationTurn required');
    }
    const session = {};
    const text = input.parentPromptText || 'recommend a pairing for the evening';
    const parent = RR.resolveTurnFromChatContext({
      promptText: text,
      sessionRuntime: session,
      journeyLevel: effectiveJourneyLevel(WJ, session, text)
    });
    const parentTurnId = parent.provenance && parent.provenance.turnId;
    const refinedResult = RR.resolveRefinementFromContext({
      parentTurn: parent,
      refinementAxis: input.refinementAxis || 'lighter',
      refinementTarget: 'best',
      refinementSource: 'chat-refinement-chip'
    });
    const refined = refinedResult && refinedResult.turn;
    if (!refined) {
      return { roundTripOk: false, reason: 'resolveRefinementFromContext returned null' };
    }
    RR.saveLastRecommendationTurn(refined);
    const loaded = RR.loadLastRecommendationTurn();
    if (!loaded) {
      return { roundTripOk: false, reason: 'loadLastRecommendationTurn returned null' };
    }
    const lp = loaded.provenance || {};
    const rp = refined.provenance || {};
    return {
      roundTripOk: true,
      loadedIsFrozen: Object.isFrozen(loaded),
      refinedTurnIdDiffersFromParent: lp.turnId !== parentTurnId,
      parentTurnIdInProvenance: lp.parentTurnId === parentTurnId,
      refinementTypePreserved: lp.refinementType === rp.refinementType,
      moduleIsResolveRefinement: lp.module === 'resolve-refinement',
      turnIdPreserved: lp.turnId === rp.turnId
    };
  }

  // ── P0.7 Restoration governance tests ────────────────────────────────────

  if (op === 'restorationAdoptValid') {
    // Law 8: adoptRestoredTurn must accept a valid serialized turn, re-freeze it,
    // and preserve all provenance fields.
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
    const session = {};
    const text = input.promptText || 'recommend a pairing for the evening';
    const originalTurn = resolveTurn({
      promptText: text,
      journeyLevel: effectiveJourneyLevel(WJ, session, text),
      sessionRuntime: session
    });
    // Simulate localStorage round-trip: frozen → JSON string → plain mutable object.
    const plain = JSON.parse(JSON.stringify(originalTurn));
    const adopted = TH.adoptRestoredTurn(plain);
    if (!adopted) {
      return { adopted: false, reason: 'adoptRestoredTurn returned null for valid turn' };
    }
    const p = adopted.provenance || {};
    const op2 = originalTurn.provenance || {};
    return {
      adopted: true,
      adoptedIsFrozen: Object.isFrozen(adopted),
      adoptedCardsFrozen: Object.isFrozen(adopted.cards),
      bestCardFrozen: adopted.cards[0] ? Object.isFrozen(adopted.cards[0]) : null,
      provenanceFrozen: Object.isFrozen(adopted.provenance),
      validateOk: TH.validateRecommendationTurn(adopted).ok,
      governanceOk: TH.validateRecommendationTurn(adopted, { governance: true }).ok,
      turnIdPreserved: p.turnId === op2.turnId,
      sourcePreserved: p.source === op2.source,
      runtimeVersionPreserved: p.runtimeVersion === op2.runtimeVersion,
      scoringVersionPreserved: p.scoringVersion === op2.scoringVersion,
      cardsLenPreserved: adopted.cards.length === originalTurn.cards.length,
      degradedPreserved: adopted.degraded === originalTurn.degraded,
      journeyLevelPreserved: adopted.journeyLevel === originalTurn.journeyLevel,
      generatedAtPreserved: adopted.generatedAt === originalTurn.generatedAt
    };
  }

}
