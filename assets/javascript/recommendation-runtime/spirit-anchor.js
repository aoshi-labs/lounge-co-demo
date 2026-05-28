/**
 * Spirit anchor selection — category-correct catalog pick with optional PairingEngine scoring.
 */
(function (global) {
  'use strict';

  var JOURNEY_COMPAT = {
    novice: ['novice'],
    intermediate: ['intermediate', 'novice'],
    advanced: ['advanced', 'intermediate']
  };

  function sdk() {
    return global.SpiritDeckKey || null;
  }

  function div() {
    return global.RecommendationDiversity || null;
  }

  function filterCandidates(spirits, journeyLevel, budgetFilter, deckKeyFilter, brandHint) {
    var SEL = global.RecommendationSelectors;
    var compatible = journeyLevel ? JOURNEY_COMPAT[journeyLevel] || null : null;

    return (spirits || []).filter(function (s) {
      if (s.category !== 'spirit') return false;
      if (compatible && compatible.indexOf(s.journeyLevel) === -1) return false;
      if (deckKeyFilter && s.deckKey !== deckKeyFilter) return false;
      if (brandHint && s.name.toLowerCase().indexOf(brandHint) === -1) return false;
      if (SEL && typeof SEL.matchesBudgetFilter === 'function') {
        return SEL.matchesBudgetFilter(s, budgetFilter);
      }
      if (budgetFilter && budgetFilter.mode === 'ceiling') {
        var msrp = s.spec && s.spec.msrp;
        return msrp == null || msrp <= budgetFilter.ceiling;
      }
      return true;
    });
  }

  function sortCandidates(candidates, journeyLevel, budgetFilter) {
    var SEL = global.RecommendationSelectors;
    if (budgetFilter && budgetFilter.mode === 'around' && SEL && typeof SEL.sortProductsByBudgetProximity === 'function') {
      return SEL.sortProductsByBudgetProximity(candidates, budgetFilter);
    }
    var sortAsc = journeyLevel === 'novice';
    return candidates.slice().sort(function (a, b) {
      var ra = a.journeyRank != null ? a.journeyRank : sortAsc ? 99 : 0;
      var rb = b.journeyRank != null ? b.journeyRank : sortAsc ? 99 : 0;
      if (ra !== rb) return sortAsc ? ra - rb : rb - ra;
      var pa = a.spec && a.spec.msrp != null ? a.spec.msrp : sortAsc ? 999 : 0;
      var pb = b.spec && b.spec.msrp != null ? b.spec.msrp : sortAsc ? 999 : 0;
      return sortAsc ? pa - pb : pb - pa;
    });
  }

  function pairingCigarProbes(lp, deckKey, pairingCigar, sessionCigar) {
    if (pairingCigar) return [pairingCigar];
    if (sessionCigar) return [sessionCigar];
    var D = div();
    if (D && typeof D.stratifiedCigarNames === 'function') {
      return D.stratifiedCigarNames(lp, 3);
    }
    if (!lp || !lp.cigars || !lp.cigars.length) return [];
    var cigars = lp.cigars.slice();
    cigars.sort(function (a, b) {
      var sa = a.spec && a.spec.strength != null ? a.spec.strength : 5;
      var sb = b.spec && b.spec.strength != null ? b.spec.strength : 5;
      return sa - sb;
    });
    var mid = cigars[Math.floor(cigars.length / 2)];
    return mid ? [mid.name] : [];
  }

  var COFFEE_ESPRESSO_DECK_ORDER = ['bourbon', 'irish', 'cognac', 'rum', 'rye'];

  function isCoffeeEspressoSpiritContext(recoCtx, promptText) {
    if (recoCtx && recoCtx.morningSession && !recoCtx.boldAsk) return true;
    if (recoCtx && recoCtx.coffeeEspressoPairing && !recoCtx.boldAsk) return true;
    var t = String(promptText || '').toLowerCase();
    if (/\b(after dinner|post.?dinner)\b/.test(t)) return false;
    return (
      /\b(coffee|espresso|cappuccino|latte|cold brew)\b/.test(t) &&
      !/\b(whiskey|whisky|bourbon|scotch|spirit|pour|tequila|mezcal|vodka|cognac|rum|beer|cocktail)\b/.test(t)
    );
  }

  function preferCoffeeEspressoDeck(deckKey, recoCtx, promptText) {
    if (!isCoffeeEspressoSpiritContext(recoCtx, promptText)) return deckKey;
    if (deckKey && COFFEE_ESPRESSO_DECK_ORDER.indexOf(deckKey) !== -1) return deckKey;
    return 'bourbon';
  }

  function filterCoffeeEspressoCandidates(candidates, recoCtx, promptText) {
    if (!isCoffeeEspressoSpiritContext(recoCtx, promptText)) return candidates;
    var loungeNative = (candidates || []).filter(function (s) {
      return (
        COFFEE_ESPRESSO_DECK_ORDER.indexOf(s.deckKey) !== -1 &&
        s.deckKey !== 'agave' &&
        s.deckKey !== 'vodka'
      );
    });
    if (loungeNative.length >= 3) return loungeNative;
    var noAgave = (candidates || []).filter(function (s) {
      return s.deckKey !== 'agave' && s.deckKey !== 'vodka' && s.deckKey !== 'peated';
    });
    return noAgave.length ? noAgave : candidates || [];
  }

  function allowsVodka(promptText) {
    var text = String(promptText || '').toLowerCase();
    return /\b(vodka|palate reset|clean|neutral)\b/.test(text);
  }

  function recentBag(session) {
    var E = global.RecommendationEntropy;
    if (E && typeof E.recentCountsFromSession === 'function') {
      return E.recentCountsFromSession(session || {});
    }
    var out = Object.create(null);
    var set = session && session.activeRecommendationSet;
    if (!set) return { spirits: out, cigars: Object.create(null) };
    ['best', 'safe', 'wildcard'].forEach(function (slot) {
      var card = set[slot];
      if (card && card.spirit) out[card.spirit] = (out[card.spirit] || 0) + 1;
    });
    return { spirits: out, cigars: Object.create(null) };
  }

  /**
   * @param {object} opts
   * @returns {{ name: string|null, signal: string, deckKey: string|null }}
   */
  function selectCatalogSpiritAnchor(opts) {
    var o = opts || {};
    var LP = global.LoungeProducts;
    if (!LP || !LP.spirits) return { name: null, signal: 'catalog-empty', deckKey: null };

    var OP = global.OntologyPolicy;
    var recoCtx =
      OP && typeof OP.buildRecoContext === 'function'
        ? OP.buildRecoContext({
            promptText: o.promptText,
            journeyLevel: o.journeyLevel,
            sessionRuntime: o.sessionRuntime
          })
        : null;

    var SDK = sdk();
    var nlpDeck =
      o.deckKey ||
      (SDK && typeof SDK.inferDeckKeyFromPrompt === 'function'
        ? SDK.inferDeckKeyFromPrompt(o.promptText, {
            categoryFocus: o.categoryFocus,
            sessionDeckKey: o.sessionDeckKey,
            flavorRouteDeckKey: o.flavorRouteDeckKey
          })
        : null);

    var affinityResolve =
      OP && typeof OP.resolveSpiritDeckKey === 'function'
        ? OP.resolveSpiritDeckKey({
            promptText: o.promptText,
            categoryFocus: o.categoryFocus,
            sessionDeckKey: o.sessionDeckKey,
            flavorRouteDeckKey: o.flavorRouteDeckKey,
            nlpDeckKey: nlpDeck,
            pairingCigar: o.pairingCigar,
            sessionCigar: o.sessionCigar,
            openPairing: !nlpDeck
          })
        : { deckKey: nlpDeck, overridden: false };

    var deckKey = preferCoffeeEspressoDeck(affinityResolve.deckKey, recoCtx, o.promptText);
    var openPairing = !affinityResolve.deckKey;
    if (isCoffeeEspressoSpiritContext(recoCtx, o.promptText) && openPairing) {
      openPairing = false;
    }
    var candidates = filterCandidates(
      LP.spirits,
      o.journeyLevel,
      o.budgetFilter,
      deckKey,
      o.brandHint
    );

    if (!candidates.length && deckKey) {
      candidates = filterCandidates(LP.spirits, o.journeyLevel, o.budgetFilter, null, o.brandHint);
      deckKey = null;
      openPairing = true;
    }
    if (!candidates.length) {
      return { name: LP.spirits[0] ? LP.spirits[0].name : null, signal: 'catalog-fallback', deckKey: null };
    }

    if (recoCtx && recoCtx.morningSession && !recoCtx.boldAsk) {
      candidates = candidates.filter(function (s) {
        if (s.deckKey === 'peated') return false;
        var n = String(s.name || '').toLowerCase();
        return !/\b(ardbeg|laphroaig|lagavulin|octomore)\b/.test(n);
      });
      if (!candidates.length) {
        candidates = filterCandidates(LP.spirits, o.journeyLevel, o.budgetFilter, null, o.brandHint);
        candidates = candidates.filter(function (s) {
          return s.deckKey !== 'peated';
        });
      }
    }

    candidates = filterCoffeeEspressoCandidates(candidates, recoCtx, o.promptText);
    if (!allowsVodka(o.promptText)) {
      var noVodka = candidates.filter(function (s) {
        return s.deckKey !== 'vodka';
      });
      if (noVodka.length) candidates = noVodka;
    }

    var sorted = sortCandidates(candidates, o.journeyLevel, o.budgetFilter);
    var coffeeSpiritRank =
      recoCtx &&
      !recoCtx.boldAsk &&
      (recoCtx.morningSession || recoCtx.coffeeEspressoPairing);
    if (OP && typeof OP.rankSpirits === 'function' && coffeeSpiritRank) {
      sorted = OP.rankSpirits(sorted, recoCtx, o.pairingCigar || o.sessionCigar || null);
    }
    var cigarProbe = o.pairingCigar || o.sessionCigar || null;
    if (OP && typeof OP.rankSpirits === 'function' && cigarProbe) {
      sorted = OP.rankSpirits(sorted, recoCtx, cigarProbe);
    }
    var names = sorted.map(function (s) {
      return s.name;
    });

    var cigarProbes = pairingCigarProbes(
      LP,
      deckKey,
      o.pairingCigar || null,
      o.sessionCigar || null
    );
    var D = div();
    var recent = recentBag(o.sessionRuntime);
    var paired =
      D && typeof D.pickSpiritByPairingDiverse === 'function'
        ? D.pickSpiritByPairingDiverse({
            cigarNames: cigarProbes,
            candidateNames: names,
            recent: recent,
            seedText: o.promptText || ''
          })
        : null;

    if (paired) {
      return {
        name: paired,
        signal: openPairing ? 'open-pairing' : 'pairing-scored',
        deckKey: deckKey,
        affinity: affinityResolve.affinity || null,
        affinityOverridden: affinityResolve.overridden,
        ontologyDiagnostics: OP && OP.getAffinityDiagnostics ? OP.getAffinityDiagnostics() : null
      };
    }

    var E = global.RecommendationEntropy;
    var pick =
      E && typeof E.pickSpiritFromCatalog === 'function'
        ? E.pickSpiritFromCatalog(names, {
            recent: recent,
            seedText: o.promptText || ''
          })
        : D && typeof D.pickRotatingFromSorted === 'function'
          ? D.pickRotatingFromSorted(names, o.promptText || '')
          : sorted[0].name;

    return {
      name: pick,
      signal: openPairing ? 'open-ranked' : 'catalog-ranked',
      deckKey: deckKey,
      affinity: affinityResolve.affinity || null,
      affinityOverridden: affinityResolve.overridden,
      ontologyDiagnostics: OP && OP.getAffinityDiagnostics ? OP.getAffinityDiagnostics() : null
    };
  }

  global.SpiritAnchor = {
    selectCatalogSpiritAnchor: selectCatalogSpiritAnchor,
    filterCandidates: filterCandidates,
    sortCandidates: sortCandidates,
    isCoffeeEspressoSpiritContext: isCoffeeEspressoSpiritContext,
    COFFEE_ESPRESSO_DECK_ORDER: COFFEE_ESPRESSO_DECK_ORDER
  };
})(typeof window !== 'undefined' ? window : global);
