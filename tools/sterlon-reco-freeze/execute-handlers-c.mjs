/**
 * execute-handlers-c.mjs — freeze-case op handlers group C.
 * Auto-split from executeFreezeCase; loaded by execute.mjs.
 */
export function handleGroupC(ctx, op, input, H) {
  const { latchSession, effectiveJourneyLevel, pickProvenance,
    projectRecommendationTurnForFreeze, runtimeRecommendationCards,
    loadSterlonConciergeProseStack, loadPairingEvalDataset,
    runPairingQualityGate, SLOT_KEYS } = H;
  const SR = ctx.SterlonRecommendations;
  const RR = ctx.RecommendationRuntime;
  const SS = ctx.SterlonSensory;

  const deckKeyFn = () => input.deckKey || 'bourbon';

  if (op === 'contextByIdParity') {
    const PIDs = ctx.RecommendationProductIds;
    if (!PIDs || typeof PIDs.resolveProductIds !== 'function') {
      throw new Error('RecommendationProductIds.resolveProductIds required');
    }
    const opts = input.opts || {};
    const byName = RR.generateRecommendationContext(opts);
    const ids = PIDs.resolveProductIds(opts);
    const byId = RR.generateRecommendationContext({
      cigarId: ids.cigarId,
      spiritId: ids.spiritId,
      foodId: ids.foodId,
      journeyLevel: opts.journeyLevel,
      pairingMode: opts.pairingMode
    });
    return {
      cigarIdMatch: byName.cigarId === byId.cigarId,
      spiritIdMatch: byName.spiritId === byId.spiritId,
      foodIdMatch: byName.foodId === byId.foodId,
      cigarSpiritMatches:
        JSON.stringify(byName.compatibility.cigarSpirit) ===
        JSON.stringify(byId.compatibility.cigarSpirit),
      spiritFoodMatches:
        JSON.stringify(byName.compatibility.spiritFood) ===
        JSON.stringify(byId.compatibility.spiritFood),
      confidenceMatch: byName.confidence === byId.confidence
    };
  }

  if (op === 'stripRecoAuthority') {
    const RP = ctx.RecommendationPresentation;
    if (!RP) throw new Error('RecommendationPresentation required');
    const sample =
      input.sample ||
      'Opening line.\n[[RECO]]\n{"cigar":"Off Menu Cigar","spirit":"Fake Spirit"}\n[[/RECO]]\nClosing.';
    const stripped = RP.stripLlmRecoAuthority(sample);
    return {
      hadBlock: RP.hasStructuredRecoBlock(sample),
      strippedClean: !RP.hasStructuredRecoBlock(stripped),
      retainsOpening: stripped.indexOf('Opening line') !== -1,
      dropsInjectedSku: stripped.indexOf('Off Menu Cigar') === -1 && stripped.indexOf('Fake Spirit') === -1
    };
  }

  if (op === 'presentationNamesFromIds') {
    const RP = ctx.RecommendationPresentation;
    const PIDs = ctx.RecommendationProductIds;
    const GEN = ctx.RecommendationGenerate;
    if (!RP || !PIDs || !GEN) {
      throw new Error('RecommendationPresentation, RecommendationProductIds, RecommendationGenerate required');
    }
    const spiritIds = PIDs.listMenuSpiritIds();
    const anchorSpiritId = input.anchorSpiritId || spiritIds[0];
    const cards = GEN.generateRecommendations({
      anchorSpiritId,
      journeyLevel: 'novice',
      deckCards: [],
      promptText: input.promptText || ''
    });
    const names = RP.productDisplayNamesFromCards(cards);
    const spiritName = PIDs.displayNameForId('spirit', cards[0].spiritId);
    const cigarName = PIDs.displayNameForId('cigar', cards[0].cigarId);
    return {
      allCardsHaveIds: cards.every((c) => c.cigarId && c.spiritId),
      namesFromIdsOnly:
        names.length >= 2 &&
        names.every((n) => typeof n === 'string' && n.length > 0),
      namesMatchCatalog: names.indexOf(spiritName) !== -1 && names.indexOf(cigarName) !== -1
    };
  }

  if (op === 'validateEnforceLocksIds') {
    const SR = ctx.SterlonRecommendations;
    const RR = ctx.RecommendationRuntime;
    const PIDs = ctx.RecommendationProductIds;
    if (!SR || !RR || !PIDs) {
      throw new Error('SterlonRecommendations, RecommendationRuntime, RecommendationProductIds required');
    }
    const turn = RR.resolveRecommendationTurn({
      promptText: input.promptText || "I'm new to whiskey, what should I pour?",
      journeyLevel: 'novice',
      sessionRuntime: {}
    });
    const before = turn.cards.map((c) => ({
      cigarId: c.cigarId,
      spiritId: c.spiritId
    }));
    const validated = SR.validateCards(turn.cards, input.promptText || '', {
      enforceRuntimeAuthority: true
    });
    return {
      idsPreserved:
        JSON.stringify(before) ===
        JSON.stringify(validated.map((c) => ({ cigarId: c.cigarId, spiritId: c.spiritId }))),
      displayHydrated: validated.every(
        (c) => c.cigar === PIDs.displayNameForId('cigar', c.cigarId)
      ),
      hasPresentationFields: validated.every((c) => typeof c.stock === 'string')
    };
  }

  if (op === 'matchMenuIntentReturnsId') {
    const IM = ctx.RecommendationIntentMatch;
    const SR = ctx.SterlonRecommendations;
    if (!IM || !SR) throw new Error('RecommendationIntentMatch and SterlonRecommendations required');
    const text = input.promptText || 'something with Buffalo Trace tonight';
    const direct = IM.matchMenuProductIntent(text);
    const shim = SR.matchMenuProductInText(text);
    return {
      directHasProductId: !!(direct && direct.productId),
      directIntentOnly: !!(direct && direct.intentOnly),
      shimHasProductId: !!(shim && shim.productId),
      shimIntentOnly: !!(shim && shim.intentOnly),
      categoriesAlign: direct && shim ? direct.category === shim.category : false,
      idsAlign: direct && shim ? direct.productId === shim.productId : false
    };
  }

  if (op === 'sessionRegistryByProductId') {
    const SL = ctx.SterlonSessionLifecycle;
    const RS = ctx.SterlonRuntimeState;
    const PIDs = ctx.RecommendationProductIds;
    if (!SL || !RS || !PIDs) {
      throw new Error('SterlonSessionLifecycle, SterlonRuntimeState, RecommendationProductIds required');
    }
    const session = RS.createDefaultSessionState();
    SL.setSessionProvider(function () { return session; });
    const spiritIds = PIDs.listMenuSpiritIds();
    const cigarIds = PIDs.listMenuCigarIds();
    const spiritId = spiritIds[0] || null;
    const cigarId = cigarIds[0] || null;
    if (!spiritId || !cigarId) {
      return { skipped: true, reason: 'empty-menu' };
    }
    const spiritName = PIDs.displayNameForId('spirit', spiritId);
    SL.commitActiveRecommendationSet(
      [
        { cigarId, spiritId, why: ['test'] },
        { cigarId, spiritId, why: ['test'] },
        { cigarId, spiritId, why: ['test'] }
      ],
      'registry test',
      { categoryFocus: 'pairing' }
    );
    const set = session.activeRecommendationSet;
    const reg = session.sessionProductRegistry;
    return {
      bestHasSpiritId: !!(set && set.best && set.best.spiritId === spiritId),
      bestHasCigarId: !!(set && set.best && set.best.cigarId === cigarId),
      registryLen: reg.length,
      registryEntriesHaveProductId: reg.every((e) => e.category !== 'spirit' || !!e.productId),
      dedupeById: SL.registerProductEntry(spiritId, 'spirit', 'mentioned', null) ===
        SL.registerProductEntry(spiritName, 'spirit', 'mentioned', null)
    };
  }

  if (op === 'generateIdAuthority') {
    const GEN = ctx.RecommendationGenerate;
    const PIDs = ctx.RecommendationProductIds;
    if (!GEN || typeof GEN.generateRecommendations !== 'function') {
      throw new Error('RecommendationGenerate.generateRecommendations required');
    }
    if (!PIDs || typeof PIDs.listMenuSpiritIds !== 'function') {
      throw new Error('RecommendationProductIds required for generateIdAuthority');
    }
    const spiritIds = PIDs.listMenuSpiritIds();
    const anchorSpiritId = input.anchorSpiritId || spiritIds[0] || null;
    const cards = GEN.generateRecommendations({
      anchorSpiritId,
      journeyLevel: input.journeyLevel || 'novice',
      deckCards: input.deckCards || [],
      promptText: input.promptText || '',
      sessionRuntime: input.session || {}
    });
    return {
      productIdAuthorityVersion: PIDs.PRODUCT_ID_AUTHORITY_VERSION,
      allSlotsHaveProductIds: (cards || []).every((c) => c && c.cigarId && c.spiritId),
      generateEmitsIdsOnly: (cards || []).every((c) => !c.cigar && !c.spirit),
      cardsProductIds: (cards || []).map((c) => ({
        cigarId: c.cigarId,
        spiritId: c.spiritId
      }))
    };
  }

  if (op === 'idFirstTurnSeal') {
    const WJ = ctx.WhiskeyJourney;
    const PIDs = ctx.RecommendationProductIds;
    const resolveTurn =
      RR && typeof RR.resolveRecommendationTurn === 'function'
        ? RR.resolveRecommendationTurn
        : RR && typeof RR.buildRecommendationSet === 'function'
          ? RR.buildRecommendationSet
          : null;
    if (!resolveTurn) {
      throw new Error('RecommendationRuntime.resolveRecommendationTurn required for idFirstTurnSeal');
    }
    const session = input.session || {};
    const text = input.promptText || '';
    const journeyLevel = effectiveJourneyLevel(WJ, session, text);
    const turn = resolveTurn({
      promptText: text,
      journeyLevel,
      sessionRuntime: session
    });
    const projected = projectRecommendationTurnForFreeze(ctx, turn);
    const idSealed =
      PIDs && typeof PIDs.allSlotsIdSealed === 'function' ? PIDs.allSlotsIdSealed(turn.cards) : false;
    return Object.assign(projected, {
      productIdAuthorityVersion: turn.productIdAuthority,
      idSealed,
      slotsHaveCanonicalKeys: (turn.cards || []).every((c, i) => c && c.slot === SLOT_KEYS[i])
    });
  }

  if (op === 'parseBudgetIntents') {
    const RB = ctx.RecommendationBudget;
    if (!RB || typeof RB.parseBudgetIntent !== 'function') {
      throw new Error('RecommendationBudget.parseBudgetIntent required');
    }
    return (input.cases || []).map((c) => ({
      text: c.text,
      intent: RB.parseBudgetIntent(c.text || '', c.sessionCeiling)
    }));
  }

}
