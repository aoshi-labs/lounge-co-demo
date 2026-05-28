/**
 * execute-handlers-d.mjs — freeze-case op handlers group D.
 * Auto-split from executeFreezeCase; loaded by execute.mjs.
 */
export function handleGroupD(ctx, op, input, H) {
  const { latchSession, effectiveJourneyLevel, pickProvenance,
    projectRecommendationTurnForFreeze, runtimeRecommendationCards,
    loadSterlonConciergeProseStack, loadPairingEvalDataset,
    runPairingQualityGate, SLOT_KEYS } = H;
  const SR = ctx.SterlonRecommendations;
  const RR = ctx.RecommendationRuntime;
  const SS = ctx.SterlonSensory;

  const deckKeyFn = () => input.deckKey || 'bourbon';

  if (op === 'budgetTurn') {
    const RB = ctx.RecommendationBudget;
    const WJ = ctx.WhiskeyJourney;
    const LP = ctx.LoungeProducts;
    const resolveTurn =
      RR && typeof RR.resolveRecommendationTurn === 'function'
        ? RR.resolveRecommendationTurn
        : RR && typeof RR.buildRecommendationSet === 'function'
          ? RR.buildRecommendationSet
          : null;
    if (!resolveTurn) throw new Error('RecommendationRuntime.resolveRecommendationTurn required');
    if (!RB || typeof RB.parseBudgetIntent !== 'function') {
      throw new Error('RecommendationBudget.parseBudgetIntent required');
    }

    const session = input.session || {};
    const text = input.promptText || '';
    const budgetFilter = RB.parseBudgetIntent(text, session.budgetCeiling);
    const journeyLevel =
      input.journeyLevel != null
        ? input.journeyLevel
        : effectiveJourneyLevel(WJ, session, text);

    const turn = resolveTurn({
      promptText: text,
      journeyLevel,
      sessionRuntime: session,
      categoryFocus: 'categoryFocus' in input ? input.categoryFocus : undefined,
      budgetFilter,
      priceCeiling: budgetFilter.mode === 'ceiling' ? budgetFilter.ceiling : null
    });

    function msrpFor(category, name) {
      if (!LP || !name) return null;
      const p =
        category === 'spirit'
          ? LP.findSpiritByName && LP.findSpiritByName(name)
          : LP.findCigarByName && LP.findCigarByName(name);
      return p && p.spec && p.spec.msrp != null ? p.spec.msrp : null;
    }

    function withinBudget(msrp, filter, categoryFocus) {
      if (msrp == null) return true;
      if (!filter || filter.mode === 'none') return true;
      const cigarBudget =
        RB.budgetAppliesToCigars && RB.budgetAppliesToCigars(categoryFocus);
      const spiritBudget =
        RB.budgetAppliesToSpirits && RB.budgetAppliesToSpirits(categoryFocus);
      if (categoryFocus === 'cigar' && !cigarBudget) return true;
      if (categoryFocus === 'spirit' && !spiritBudget) return true;
      if (categoryFocus === 'pairing' && cigarBudget && filter.mode !== 'none') {
        if (filter.mode === 'ceiling') return msrp <= filter.ceiling;
        return msrp >= filter.min && msrp <= filter.max;
      }
      if (filter.mode === 'ceiling') return msrp <= filter.ceiling;
      if (filter.mode === 'range' || filter.mode === 'around') {
        return msrp >= filter.min && msrp <= filter.max;
      }
      return true;
    }

    const categoryFocus = 'categoryFocus' in input ? input.categoryFocus : null;
    const cards = turn.cards || [];
    const cigarMsrps = cards.map((c) => msrpFor('cigar', c.cigar));
    const anchorSpirit = cards[0] && cards[0].spirit ? cards[0].spirit : null;
    const spiritMsrp = msrpFor('spirit', anchorSpirit);

    return {
      budgetMode: budgetFilter.mode,
      budgetMin: budgetFilter.min,
      budgetMax: budgetFilter.max,
      budgetTarget: budgetFilter.target,
      budgetCeiling: budgetFilter.ceiling,
      categoryFocus: categoryFocus == null ? null : categoryFocus,
      degraded: turn.degraded,
      cigars: cards.map((c) => c.cigar),
      cigarMsrps,
      spirit: anchorSpirit,
      spiritMsrp,
      allCigarsWithinBudget: cigarMsrps.every((m) => withinBudget(m, budgetFilter, categoryFocus)),
      spiritWithinBudget: withinBudget(spiritMsrp, budgetFilter, categoryFocus),
      hasBudgetSignal: Array.isArray(turn.provenance && turn.provenance.signals)
        ? turn.provenance.signals.some((s) => String(s).indexOf('budget-') === 0)
        : false
    };
  }

  if (op === 'recommendationTurnContract') {
    const WJ = ctx.WhiskeyJourney;
    const resolveTurn =
      RR && typeof RR.resolveRecommendationTurn === 'function'
        ? RR.resolveRecommendationTurn
        : RR && typeof RR.buildRecommendationSet === 'function'
          ? RR.buildRecommendationSet
          : null;
    if (!resolveTurn) {
      throw new Error('RecommendationRuntime.resolveRecommendationTurn required for recommendationTurnContract freeze');
    }
    const session = input.session || {};
    const text = input.promptText || '';
    const journeyLevel = effectiveJourneyLevel(WJ, session, text);
    const explicitFn = input.promptExplicitlyNamesMenuSpirit;
    const turn = resolveTurn({
      promptText: text,
      journeyLevel,
      sessionRuntime: session,
      promptExplicitlyNamesMenuSpirit: typeof explicitFn === 'function' ? explicitFn : undefined,
      anchorCigar: input.anchorCigar || null,
      categoryFocus: 'categoryFocus' in input ? input.categoryFocus : undefined
    });
    return projectRecommendationTurnForFreeze(ctx, turn);
  }

  if (op === 'recommendationTurnDegraded') {
    const TH = ctx.RecommendationTurnHelpers;
    if (!TH || typeof TH.buildDegradedTurn !== 'function') {
      throw new Error('RecommendationTurnHelpers.buildDegradedTurn required for recommendationTurnDegraded freeze');
    }
    const turn = TH.buildDegradedTurn({
      promptText: input.promptText || '',
      journeyLevel: input.journeyLevel,
      reason: input.reason || 'sterlon-reco-freeze-degraded-snapshot'
    });
    return projectRecommendationTurnForFreeze(ctx, turn);
  }

  if (op === 'recommendationTurnGovernanceForcedDegrade') {
    const TH = ctx.RecommendationTurnHelpers;
    if (!TH || typeof TH.createRecommendationTurn !== 'function') {
      throw new Error('RecommendationTurnHelpers.createRecommendationTurn required');
    }
    const RR2 = ctx.RecommendationRuntime;
    if (!RR2) throw new Error('RecommendationRuntime required');
    const saved = RR2.generateRecommendationContext;
    let turn;
    try {
      RR2.generateRecommendationContext = undefined;
      turn = TH.createRecommendationTurn({
        cards: [
          {
            label: 'Best Pick',
            tier: 'Classic',
            cigar: 'Ashton VSG Torpedo',
            spirit: "Blanton's Single Barrel",
            food: 'Prosciutto & Manchego',
            why: ['fixture']
          }
        ],
        journeyLevel: 'novice',
        degraded: false,
        provenance: { source: 'recommendation-runtime', module: 'fixture-governance' }
      });
    } finally {
      RR2.generateRecommendationContext = saved;
    }
    const gov = TH.validateRecommendationTurn(turn, { governance: true });
    return {
      degraded: turn.degraded,
      runtimeMode: turn.runtimeMode,
      degradedCause: turn.provenance && turn.provenance.degradedCause,
      governanceOk: gov.ok,
      governanceAuthorityOk: gov.governance ? gov.governance.ok : null
    };
  }

  if (op === 'resolveTurnFromChatContext') {
    const WJ = ctx.WhiskeyJourney;
    if (!RR || typeof RR.resolveTurnFromChatContext !== 'function') {
      throw new Error('RecommendationRuntime.resolveTurnFromChatContext required');
    }
    const session = input.session || {};
    const text = input.promptText || '';
    const journeyLevel = effectiveJourneyLevel(WJ, session, text);
    const turn = RR.resolveTurnFromChatContext({
      promptText: text,
      sessionRuntime: session,
      journeyLevel: journeyLevel,
      telemetry: ctx.console ? { emit: function () {} } : null
    });
    return projectRecommendationTurnForFreeze(ctx, turn);
  }

  if (op === 'persistTurnRoundTrip') {
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
    const text = input.promptText || 'recommend a pairing for the evening';
    const original = RR.resolveTurnFromChatContext({
      promptText: text,
      sessionRuntime: session,
      journeyLevel: effectiveJourneyLevel(WJ, session, text)
    });
    RR.saveLastRecommendationTurn(original);
    const loaded = RR.loadLastRecommendationTurn();
    if (!loaded) {
      return { roundTripOk: false, reason: 'loadLastRecommendationTurn returned null' };
    }
    const op2 = original.provenance || {};
    const lp = loaded.provenance || {};
    return {
      roundTripOk: true,
      loadedIsFrozen: Object.isFrozen(loaded),
      turnIdPreserved: lp.turnId === op2.turnId,
      sourcePreserved: lp.source === op2.source,
      runtimeVersionPreserved: lp.runtimeVersion === op2.runtimeVersion,
      scoringVersionPreserved: lp.scoringVersion === op2.scoringVersion,
      degradedPreserved: loaded.degraded === original.degraded,
      cardsLenPreserved: loaded.cards.length === original.cards.length,
      allowlistVerifiedPreserved: loaded.allowlistStatus && original.allowlistStatus
        ? loaded.allowlistStatus.verified === original.allowlistStatus.verified
        : null
    };
  }

  if (op === 'recommendationRuntimeBoundary') {
    const RRb = ctx.RecommendationRuntime;
    const keys = Object.keys(RRb)
      .filter((k) => typeof RRb[k] === 'function' || k === 'version' || k === 'boundaryVersion')
      .sort();
    const resolveTurn =
      RRb && typeof RRb.resolveRecommendationTurn === 'function' ? RRb.resolveRecommendationTurn : null;
    const buildTurn =
      RRb && typeof RRb.buildRecommendationSet === 'function' ? RRb.buildRecommendationSet : null;
    const scoreSmoke =
      RRb && typeof RRb.scoreRecommendation === 'function'
        ? RRb.scoreRecommendation('Ashton VSG Torpedo', "Blanton's Single Barrel")
        : null;
    return {
      version: RRb.version,
      boundaryVersion: RRb.boundaryVersion,
      publicKeysSample: keys.slice(0, 28),
      resolveRecommendationTurnPresent: typeof RRb.resolveRecommendationTurn === 'function',
      buildRecommendationSetPresent: typeof RRb.buildRecommendationSet === 'function',
      resolveTurnFromChatContextPresent: typeof RRb.resolveTurnFromChatContext === 'function',
      resolveRefinementFromContextPresent: typeof RRb.resolveRefinementFromContext === 'function',
      saveLastRecommendationTurnPresent: typeof RRb.saveLastRecommendationTurn === 'function',
      loadLastRecommendationTurnPresent: typeof RRb.loadLastRecommendationTurn === 'function',
      resolveAndBuildSameFn: resolveTurn && buildTurn ? resolveTurn === buildTurn : null,
      scoreRecommendationPresent: typeof RRb.scoreRecommendation === 'function',
      scoreRecommendationHasScore: scoreSmoke != null && typeof scoreSmoke.score === 'number',
      deckTemplatePresent: !!(ctx.DeckTemplate && typeof ctx.DeckTemplate.getDeckCards === 'function')
    };
  }

  if (op === 'srSurfaceArea') {
    const SRs = ctx.SterlonRecommendations;
    const keys = Object.keys(SRs).filter((k) => typeof SRs[k] === 'function' || k === 'MENU_CIGARS').sort();
    return {
      hasValidateCards: typeof SRs.validateCards === 'function',
      hasVerifyOnly: typeof SRs.verifyRecommendationCards === 'function',
      hasMatchMenu: typeof SRs.matchMenuProductInText === 'function',
      exportsRefinementGetter: 'refinementAdjacentPilot' in SRs,
      refinementPivotsOwnsData: !!(ctx.PilotRefinementPivots && ctx.PilotRefinementPivots.refinementAdjacentPilot),
      publicFnKeys: keys
    };
  }

  if (op === 'scoringDrivenSlots') {
    const PE = ctx.PairingEngine;
    const GEN = ctx.RecommendationGenerate;
    const DT = ctx.DeckTemplate;
    const PIDs = ctx.RecommendationProductIds;

    function displayCigar(c) {
      return c.cigar || (PIDs && c.cigarId ? PIDs.displayNameForId('cigar', c.cigarId) : null);
    }
    function displaySpirit(c) {
      return c.spirit || (PIDs && c.spiritId ? PIDs.displayNameForId('spirit', c.spiritId) : null);
    }

    function slotResult(anchorSpirit, journeyLevel) {
      const menuCigars = ctx.LoungeProducts.listMenuCigarNames();
      const slots = PE.pickSlots(anchorSpirit, menuCigars);

      const deckCards =
        DT && typeof DT.getDeckCards === 'function'
          ? DT.getDeckCards('', journeyLevel, 'bourbon')
          : [];
      const cards = GEN.generateRecommendations({ anchorSpirit, journeyLevel, deckCards });
      const cigars = [displayCigar(cards[0]), displayCigar(cards[1]), displayCigar(cards[2])];
      const spirits = [displaySpirit(cards[0]), displaySpirit(cards[1]), displaySpirit(cards[2])];

      return {
        slots,
        cardsCigar: cigars,
        cardsSpirit: spirits,
        allSpiritsMatchAnchor: spirits.every((s) => s === anchorSpirit),
        cardsHaveFood: cards.every((c) => !!c.food),
        cardsHaveWhy: cards.every((c) => Array.isArray(c.why) && c.why.length > 0),
        slotsMatchCards:
          slots.best === cigars[0] && slots.safe === cigars[1] && slots.wildcard === cigars[2]
      };
    }

    return {
      blantons: slotResult("Blanton's Single Barrel", 'novice'),
      pappy:    slotResult('Pappy Van Winkle 23yr',   'advanced')
    };
  }

}
