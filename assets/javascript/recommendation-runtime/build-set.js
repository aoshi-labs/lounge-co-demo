/**
 * RecommendationRuntime.resolveRecommendationTurn / buildRecommendationSet.
 *
 * Depends on globals: DeckTemplate, SterlonRecommendations (verify/match only),
 * SterlonFlavorMatch, WhiskeyJourney,
 * RecommendationTurnHelpers (load recommendation-turn.js before this file).
 *
 * Returns a RecommendationTurn: cards + per-slot contexts (one-time semantic emission).
 */
(function (global) {
  'use strict';

  // Bump when sensory profiles, harmony bridges, or scoring weights change.
  var SCORING_VERSION = 1;

  function isHeavySpiritProduct(product) {
    if (!product) return false;
    if (product.deckKey === 'peated') return true;
    var n = String(product.name || '').toLowerCase();
    if (/\b(ardbeg|laphroaig|lagavulin|octomore|peated)\b/.test(n)) return true;
    var str =
      product.spec && product.spec.strength != null ? Number(product.spec.strength) : 5;
    return product.deckKey === 'rye' && str >= 7;
  }

  function resolveDeckKeyForTurn(promptText, session, route, categoryFocus) {
    var SDK = global.SpiritDeckKey;
    if (SDK && typeof SDK.inferDeckKeyFromPrompt === 'function') {
      var fromPrompt = SDK.inferDeckKeyFromPrompt(promptText, {
        categoryFocus: categoryFocus,
        sessionDeckKey: session.activeDeckKey || null,
        flavorRouteDeckKey: route && route.deckKey ? route.deckKey : null
      });
      if (fromPrompt) return fromPrompt;
    }
    if (route && route.deckKey) return route.deckKey;
    if (session.activeDeckKey) return session.activeDeckKey;
    return null;
  }

  function collectAllowlistViolations(cards, categoryFocus, PIDsMod) {
    var allowlistViols =
      PIDsMod && typeof PIDsMod.idAuthorityViolations === 'function'
        ? PIDsMod.idAuthorityViolations(cards)
        : [];
    if (!allowlistViols.length && cards && cards.length) {
      var slotNames3 = ['best', 'safe', 'wildcard'];
      for (var pci = 0; pci < cards.length; pci++) {
        var pcCard = cards[pci];
        var pcSlot = slotNames3[pci] || ('slot-' + pci);
        var needsCigar = categoryFocus !== 'spirit';
        var needsSpirit = categoryFocus !== 'cigar';
        if (needsCigar && !pcCard.cigarId) {
          allowlistViols.push({
            slot: pcSlot,
            field: 'cigar',
            name: pcCard.cigar || null
          });
        }
        if (needsSpirit && !pcCard.spiritId) {
          allowlistViols.push({
            slot: pcSlot,
            field: 'spirit',
            name: pcCard.spirit || null
          });
        }
        if (pcCard.food && !pcCard.foodId) {
          allowlistViols.push({ slot: pcSlot, field: 'food', name: pcCard.food });
        }
      }
    }
    return allowlistViols;
  }

  function returnOffCatalogDegradedTurn(TH, journeyLevel, allowlistViols, degradedCause) {
    var tel = global.SterlonTelemetry;
    if (tel && typeof tel.emit === 'function') {
      tel.emit('recommendation_allowlist_violation', {
        violations: allowlistViols,
        module: 'build-set',
        degradedCause: degradedCause
      });
    }
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(
        '[Sterlon][build-set] Off-catalog products — returning degraded turn.',
        degradedCause,
        allowlistViols
      );
    }
    return TH.createRecommendationTurn({
      cards: [],
      journeyLevel: journeyLevel,
      degraded: true,
      degradedCause: degradedCause,
      provenance: {
        source: 'degraded',
        reason: degradedCause,
        degradedCause: degradedCause,
        module: 'build-set',
        scoringVersion: SCORING_VERSION,
        runtimeVersion: (global.RecommendationRuntime && global.RecommendationRuntime.version) || 1,
        allowlistViolations: allowlistViols
      }
    });
  }

  function shouldForceBeginnerCigarFirst(promptText, journeyLevel) {
    var text = String(promptText || '').toLowerCase();
    if (!text) return false;
    if (journeyLevel !== 'novice') {
      if (!/\b(first cigar|first time|new to cigar|beginner|never smoked)\b/.test(text)) {
        return false;
      }
    }
    return /\b(first cigar|first time|new to cigar|beginner|never smoked|smooth|mild|gentle|approachable)\b/.test(text) ||
      /\bunder\s*\$?10\b/.test(text) ||
      (/\b(coffee|espresso)\b/.test(text) && /\bcigar\b/.test(text));
  }

  /**
   * @param {object} opts
   * @param {string}      opts.promptText
   * @param {string}      opts.journeyLevel        'novice' | 'advanced'
   * @param {object}      opts.sessionRuntime      session bag (flavorRoute, latchedJourneyLevel, …) — mutated like chat
   * @param {string|null} [opts.categoryFocus]     'spirit' | 'cigar' | 'pairing' | null
   * @param {number|null} [opts.priceCeiling]      max MSRP USD or null (legacy; prefer budgetFilter)
   * @param {object|null} [opts.budgetFilter]      parsed budget intent
   * @param {string|null} [opts.brandHint]         lowercase brand keyword or null
   * @param {string|null} [opts.bodyConstraint]    'full' | 'medium' | 'mild' | null
   * @returns {object} RecommendationTurn
   */
  function buildRecommendationSet(opts) {
    var o = opts || {};
    var promptText = o.promptText || '';
    var journeyLevel = o.journeyLevel;
    var categoryFocus = o.categoryFocus || null;
    if (!categoryFocus) {
      var RTinfer = global.SterlonChatRouter;
      if (RTinfer && typeof RTinfer.inferCategoryFocus === 'function') {
        categoryFocus = RTinfer.inferCategoryFocus(promptText) || null;
      }
    }
    var session = o.sessionRuntime || {};
    var RB = global.RecommendationBudget;

    var budgetFilter = o.budgetFilter || null;
    if (!budgetFilter && RB && typeof RB.parseBudgetIntent === 'function') {
      var sessionCeiling =
        session.budgetCeiling != null ? session.budgetCeiling : null;
      budgetFilter = RB.parseBudgetIntent(promptText, sessionCeiling);
    }
    if (!budgetFilter) {
      budgetFilter = RB && RB.NONE ? Object.assign({}, RB.NONE) : { mode: 'none' };
    }

    var priceCeiling = (o.priceCeiling != null) ? Number(o.priceCeiling) : null;
    if (priceCeiling == null && budgetFilter.mode === 'ceiling') {
      priceCeiling = budgetFilter.ceiling;
    }
    var brandHint = o.brandHint || null;

    var SR = global.SterlonRecommendations;
    var SFM = global.SterlonFlavorMatch;
    var WJ = global.WhiskeyJourney;
    var TH = global.RecommendationTurnHelpers;

    if (!TH || typeof TH.createRecommendationTurn !== 'function') {
      var telem = global.SterlonTelemetry;
      if (typeof console !== 'undefined' && console.warn) {
        console.warn(
          '[Sterlon][build-set] RecommendationTurnHelpers missing — explicit degraded turn (load-order regression).'
        );
      }
      if (telem && typeof telem.emit === 'function') {
        telem.emit('recommendation_runtime_degraded', {
          module: 'build-set',
          reason: 'RecommendationTurnHelpers-missing'
        });
      }
      var RR = global.RecommendationRuntime;
      if (RR && typeof RR.createRecommendationTurn === 'function') {
        return RR.createRecommendationTurn({
          cards: [],
          journeyLevel: journeyLevel == null ? null : journeyLevel,
          degraded: true,
          runtimeMode: 'degraded',
          degradedCause: 'RecommendationTurnHelpers-missing',
          provenance: {
            source: 'degraded',
            reason: 'RecommendationTurnHelpers-missing',
            degradedCause: 'RecommendationTurnHelpers-missing',
            module: 'build-set'
          }
        });
      }
      return {
        contractVersion: 1,
        runtimeMode: 'degraded',
        journeyLevel: journeyLevel == null ? null : journeyLevel,
        cards: [],
        contextsBySlot: { best: null, safe: null, wildcard: null },
        rationaleBySlot: { best: [], safe: [], wildcard: [] },
        compatibilityBySlot: { best: null, safe: null, wildcard: null },
        confidenceBySlot: { best: null, safe: null, wildcard: null },
        provenance: {
          source: 'degraded',
          reason: 'RecommendationTurnHelpers-missing',
          degradedCause: 'RecommendationTurnHelpers-missing',
          module: 'build-set'
        },
        generatedAt: Date.now(),
        degraded: true
      };
    }

    var usedNoviceCap = false;

    var explicitFn = o.promptExplicitlyNamesMenuSpirit;
    var explicitSpirit =
      typeof explicitFn === 'function'
        ? !!explicitFn(promptText)
        : SR.promptExplicitlyNamesMenuSpirit
          ? SR.promptExplicitlyNamesMenuSpirit(promptText)
          : false;

    if (shouldForceBeginnerCigarFirst(promptText, journeyLevel) && !explicitSpirit) {
      categoryFocus = 'pairing';
    }

    var routeCategory = global.RecommendationBuildSetHelpers.flavorRouteCategory(categoryFocus, promptText);
    var route =
      session.flavorRoute ||
      (SFM && SFM.resolveFlavorRoute
        ? SFM.resolveFlavorRoute(promptText, { category: routeCategory })
        : null);

    var OPreco = global.OntologyPolicy;
    var recoCtxEarly =
      OPreco && typeof OPreco.buildRecoContext === 'function'
        ? OPreco.buildRecoContext({
            promptText: promptText,
            journeyLevel: journeyLevel,
            sessionRuntime: session
          })
        : null;
    if (
      route &&
      route.product &&
      route.category === 'spirit' &&
      recoCtxEarly &&
      recoCtxEarly.morningSession &&
      !recoCtxEarly.boldAsk &&
      isHeavySpiritProduct(route.product)
    ) {
      route = null;
      session.flavorRoute = null;
      session.flavorRoutedSpirit = null;
    }

    var noviceThisTurn = WJ && WJ.isNovicePalate && WJ.isNovicePalate(promptText);
    var blockAdvancedFlavor =
      (session.latchedJourneyLevel === 'novice' || noviceThisTurn) &&
      route &&
      route.product &&
      route.product.category === 'spirit' &&
      WJ &&
      WJ.isAdvancedProduct &&
      WJ.isAdvancedProduct(route.product) &&
      !explicitSpirit;

    // ── Session side-effects (intentional) ─────────────────────────────────
    // Turn resolution mutates the session bag to persist routing decisions
    // (flavorRoute, spirit hero, journey level) across turns. This is load-bearing:
    // continuity handlers in sterlon-chat.js read these fields on subsequent turns.

    if (blockAdvancedFlavor) {
      route = null;
      session.flavorRoute = null;
      session.flavorRoutedSpirit = null;
    }

    if (
      journeyLevel === 'novice' &&
      route &&
      route.product &&
      route.product.category === 'spirit' &&
      route.product.journeyLevel === 'advanced' &&
      !explicitSpirit
    ) {
      route = null;
      session.flavorRoute = null;
      session.flavorRoutedSpirit = null;
    }

    var DT = global.DeckTemplate;
    var deckKey = resolveDeckKeyForTurn(promptText, session, route, categoryFocus);
    session.activeDeckKey = deckKey;
    var deckCards = [];
    if (DT && typeof DT.getDeckCards === 'function') {
      deckCards = DT.getDeckCards(promptText, journeyLevel, deckKey);
    } else {
      return TH.createRecommendationTurn({
        cards: [],
        journeyLevel: journeyLevel,
        degraded: true,
        runtimeMode: 'degraded',
        provenance: {
          source: 'degraded',
          reason: 'deck-template-missing',
          degradedCause: 'deck-template-missing',
          module: 'build-set'
        }
      });
    }

    // Resolve anchor from routing decisions — single authority point.
    // Explicit anchorCigar: caller-resolved cigar (e.g. handleAnchoredPairingTurn) bypasses flavor routing.
    // Cigar flavor route: lock best-slot cigar, score spirits against it in generate.js.
    // Spirit flavor route: use the matched spirit as anchor.
    // No route: select from full catalog using journey/price/brand filters.
    var applySpiritBudget =
      RB && typeof RB.budgetAppliesToSpirits === 'function'
        ? RB.budgetAppliesToSpirits(categoryFocus)
        : categoryFocus === 'spirit' || categoryFocus == null;
    var applyCigarBudget =
      RB && typeof RB.budgetAppliesToCigars === 'function'
        ? RB.budgetAppliesToCigars(categoryFocus)
        : categoryFocus === 'cigar' || categoryFocus === 'pairing';
    var spiritBudgetFilter = applySpiritBudget ? budgetFilter : { mode: 'none' };
    var cigarBudgetFilter = applyCigarBudget ? budgetFilter : { mode: 'none' };

    var PIDsMod = global.RecommendationProductIds;
    var BSH = global.RecommendationBuildSetHelpers;
    var anchorResult = BSH.resolveRouteAndAnchor({
      opts: o, session: session, route: route,
      promptText: promptText, journeyLevel: journeyLevel, categoryFocus: categoryFocus,
      spiritBudgetFilter: spiritBudgetFilter, brandHint: brandHint, deckKey: deckKey
    });
    var anchorSpirit = anchorResult.anchorSpirit;
    var anchorCigar = anchorResult.anchorCigar;
    var anchorSpiritId = anchorResult.anchorSpiritId;
    var anchorCigarId = anchorResult.anchorCigarId;
    var usedFlavorRoute = anchorResult.usedFlavorRoute;
    var usedNamedSpirit = anchorResult.usedNamedSpirit;
    var usedCatalogAnchor = anchorResult.usedCatalogAnchor;
    var catalogAnchorSignal = anchorResult.catalogAnchorSignal;
    deckKey = anchorResult.deckKey;

    // Scoring-driven card generation (Step 4). Cigar slots from PairingEngine; food from deck.
    var GEN = global.RecommendationGenerate;
    var cards;
    var lockedBestCigarId = null;
    var progressionIntent = false;
    var rankedPoolSize = null;
    var rankedCigars = null;
    var rankedSpirits = null;
    var generatePipelineOrder = null;
    var hardEligibility = null;
    if (GEN && typeof GEN.generateRecommendations === 'function') {
      cards = GEN.generateRecommendations({
        anchorSpiritId: anchorSpiritId,
        anchorCigarId: anchorCigarId,
        anchorSpirit: anchorSpirit,
        anchorCigar: anchorCigar,
        journeyLevel: journeyLevel,
        deckCards: deckCards,
        categoryFocus: categoryFocus,
        budgetFilter: cigarBudgetFilter,
        bodyConstraint: o.bodyConstraint || null,
        promptText: promptText,
        sessionRuntime: session,
        namedSpiritLocked: usedNamedSpirit
      });
      if (cards && cards.lockedBestCigarId) lockedBestCigarId = cards.lockedBestCigarId;
      if (cards && cards.progressionIntent != null) progressionIntent = !!cards.progressionIntent;
      if (cards && cards.rankedPoolSize != null) rankedPoolSize = cards.rankedPoolSize;
      if (cards && cards.rankedCigars) rankedCigars = cards.rankedCigars;
      if (cards && cards.rankedSpirits) rankedSpirits = cards.rankedSpirits;
      if (cards && cards.generatePipelineOrder) generatePipelineOrder = cards.generatePipelineOrder.slice();
      hardEligibility = (cards && cards.hardEligibility) ? cards.hardEligibility : null;
      session.journeyRoutedSpirit =
        cards[0] && cards[0].spirit
          ? cards[0].spirit
          : PIDsMod && cards[0] && cards[0].spiritId
            ? PIDsMod.displayNameForId('spirit', cards[0].spiritId)
            : null;
    } else {
      // GEN not loaded — fall back to deck hero path (load-order or bundle regression).
      var fallbackPath = 'deck';
      if (SFM && route && route.category === 'spirit') {
        fallbackPath = 'sfm-spirit-hero';
        cards = SFM.applySpiritHeroToCards(deckCards, route, { journeyLevel: journeyLevel });
      } else if (WJ && journeyLevel) {
        fallbackPath = 'whiskey-journey';
        cards = WJ.applyJourneyHeroToCards(deckCards, journeyLevel, deckKey);
        session.journeyRoutedSpirit = cards[0] && cards[0].spirit ? cards[0].spirit : null;
      } else {
        cards = deckCards;
      }
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[RecommendationRuntime] RecommendationGenerate missing — using ' + fallbackPath + ' fallback');
      }
      var telemGen = global.SterlonTelemetry;
      if (telemGen && typeof telemGen.emit === 'function') {
        telemGen.emit('reco_gen_fallback', { path: fallbackPath });
      }
    }

    var shouldRerank =
      categoryFocus !== 'spirit' &&
      categoryFocus !== 'cigar' &&
      cards &&
      cards.length >= 2 &&
      cards.some(function (c) {
        return (
          c &&
          ((c.cigarId && c.spiritId) || (c.cigar && c.spirit))
        );
      });
    var rerankResult = shouldRerank
      ? BSH.rerankBestPairingSlot(cards, {
          promptText: promptText,
          journeyLevel: journeyLevel,
          session: session,
          lockedBestCigarId: lockedBestCigarId
        })
      : { cards: cards, reranked: false, skipped: false };
    cards = rerankResult.cards;
    var bestSlotReranked = rerankResult.reranked;
    var rerankSkippedForPhilosophy = rerankResult.skipped;

    // Pre-transform allowlist enforcement.
    // Strict null (=== null, not undefined) means generate.js resolved the name against
    // LoungeProducts and found nothing. Cards from fallback paths have undefined IDs and
    // are intentionally skipped here (they run under an already-degraded mode signal).
    var allowlistViols = collectAllowlistViolations(cards, categoryFocus, PIDsMod);
    if (allowlistViols.length > 0) {
      return returnOffCatalogDegradedTurn(TH, journeyLevel, allowlistViols, 'off-catalog-products');
    }

    if (WJ && journeyLevel === 'novice' && WJ.enforceNoviceCap) {
      cards = WJ.enforceNoviceCap(cards, deckKey);
      session.journeyRoutedSpirit = cards[0] && cards[0].spirit ? cards[0].spirit : null;
      usedNoviceCap = true;
    }

    var FPP = global.FlightPhilosophyPolicy;
    var repairSignals = [];
    if (FPP && typeof FPP.repairCollapsedFlightCards === 'function') {
      var repairResult = FPP.repairCollapsedFlightCards(cards, {
        categoryFocus: categoryFocus,
        anchorSpiritId: anchorSpiritId,
        anchorCigarId: anchorCigarId,
        namedSpiritLocked: usedNamedSpirit,
        lockedBestCigarId: lockedBestCigarId,
        promptText: promptText,
        sessionRuntime: session,
        flightMode: anchorCigarId ? 'cigar-anchor' : 'pairing',
        rankedCigars: rankedCigars,
        rankedSpirits: rankedSpirits
      });
      cards = repairResult.cards;
      repairSignals = repairResult.repairSignals || [];
    }

    // Strip irrelevant category field so buildPerSlotLayers / generateRecommendationContext
    // do not run pairing scoring on null products. 'pairing' and null leave both fields.
    if (categoryFocus === 'spirit') {
      cards = cards.map(function (c) { return Object.assign({}, c, { cigar: null, cigarId: null }); });
    } else if (categoryFocus === 'cigar') {
      // anchorCigar mode in generate.js may already have spirit=null per slot;
      // null spiritId too so product-ids hydration cannot resurrect a pour.
      cards = cards.map(function (c) {
        return Object.assign({}, c, { spirit: null, spiritId: null });
      });
    }

    var postTransformViols = collectAllowlistViolations(cards, categoryFocus, PIDsMod);
    if (postTransformViols.length > 0) {
      return returnOffCatalogDegradedTurn(
        TH,
        journeyLevel,
        postTransformViols,
        'post-transform-off-catalog-products'
      );
    }

    var prov = BSH.assembleProvenance({
      opts: o, categoryFocus: categoryFocus, cards: cards,
      usedFlavorRoute: usedFlavorRoute, usedNamedSpirit: usedNamedSpirit,
      usedCatalogAnchor: usedCatalogAnchor, catalogAnchorSignal: catalogAnchorSignal,
      usedNoviceCap: usedNoviceCap, budgetFilter: budgetFilter, session: session,
      progressionIntent: progressionIntent, rerankSkippedForPhilosophy: rerankSkippedForPhilosophy,
      bestSlotReranked: bestSlotReranked, repairSignals: repairSignals,
      deckKey: deckKey, lockedBestCigarId: lockedBestCigarId, rankedPoolSize: rankedPoolSize,
      rankedCigars: rankedCigars, rankedSpirits: rankedSpirits,
      generatePipelineOrder: generatePipelineOrder, anchorCigarId: anchorCigarId,
      hardEligibility: hardEligibility,
      SCORING_VERSION: SCORING_VERSION, promptText: promptText
    });

    var hardEligibilityDegraded =
      !!(hardEligibility && hardEligibility.degraded === true);
    var hardEligibilityCause = hardEligibilityDegraded
      ? (hardEligibility.degradedCause || 'hard-eligibility-degraded')
      : null;

    var turn = TH.createRecommendationTurn({
      cards: cards,
      journeyLevel: journeyLevel,
      degraded: hardEligibilityDegraded,
      degradedCause: hardEligibilityCause,
      provenance: prov
    });
    var E = global.RecommendationEntropy;
    if (E && typeof E.recordTurnOnSession === 'function') E.recordTurnOnSession(session, turn);
    if (E && typeof E.recordGlobalPick === 'function') E.recordGlobalPick(turn);
    var RD = global.SterlonRecoDiagnostics;
    if (RD && typeof RD.recordTurn === 'function') RD.recordTurn(turn);
    var OD = global.SterlonOntologyDiagnostics;
    if (OD && typeof OD.recordTurn === 'function') OD.recordTurn(turn);
    return turn;
  }

  var RR0 = global.RecommendationRuntime;
  if (RR0) {
    RR0.buildRecommendationSet = buildRecommendationSet;
    RR0.resolveRecommendationTurn = buildRecommendationSet;
  }
})(typeof window !== 'undefined' ? window : global);
