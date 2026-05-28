/**
 * SterlonTurnHandlers — Wave 3 continuity / expertise / anchored pairing / closing
 * turn dispatch extracted from sterlon-chat.js (wired via setHost from chat boot).
 *
 * Host contract (sterlon-chat supplies):
 *   getSessionRuntime, RT, SO, SL, PL, GL, CP (optional; reserved), GP/PP via prose builders,
 *   RuntimeMode, unlockComposer, renderProseOnlyTurn, renderRecallTurn, renderComparisonTurn,
 *   renderRecommendationTurn, synchronizeRecommendationContinuity, coordinateRefinementTurn,
 *   buildRecommendationTurnForPrompt, buildConfidenceBoundaryProse, buildExpertiseProseForBranch,
 *   buildAnchoredCigarPairingProse, buildClosingProse, buildReferentClarifyProse, finalizeConversationalTurn
 */
(function (global) {
  'use strict';

  var _host = {};

  function setHost(h) {
    _host = h || {};
  }

  function _h() {
    return _host;
  }

  function _sr() {
    var fn = _h().getSessionRuntime;
    return typeof fn === 'function' ? fn() : null;
  }

  function resolveExpertiseSubject(text) {
    var sessionRuntime = _sr();
    var RT = _h().RT;
    var SO = _h().SO;
    if (!sessionRuntime || !RT || !SO) {
      return { status: 'miss' };
    }
    var t = (text || '').toLowerCase();
    if (sessionRuntime.activeRecommendationSet) {
      var best = sessionRuntime.activeRecommendationSet.best;
      if (best && /\b(this|it|that pour|tonight'?s|the pairing)\b/.test(t)) {
        var cat = /\bcigar\b/.test(t) && !/\b(whisky|whiskey|pour|spirit)\b/.test(t) ? 'cigar' : 'spirit';
        var productName = cat === 'cigar' ? best.cigar : best.spirit;
        if (productName) {
          var registryEntry = sessionRuntime.sessionProductRegistry.find(
            function (e) { return e.name === productName && e.category === cat; }
          );
          return {
            status: 'resolved',
            name: productName,
            category: cat,
            entry: registryEntry || null
          };
        }
      }
    }
    var cigarMention = RT.resolveMentionedCigar(text);
    if (cigarMention) {
      var regCigar = sessionRuntime.sessionProductRegistry.find(
        function (e) { return e.name === cigarMention.name && e.category === 'cigar'; }
      );
      return {
        status: 'resolved',
        name: cigarMention.name,
        category: 'cigar',
        entry: regCigar || null
      };
    }
    var named = RT.matchMenuProductInText(text);
    if (named) {
      var regNamed = sessionRuntime.sessionProductRegistry.find(
        function (e) { return e.name === named.name && e.category === named.category; }
      );
      return {
        status: 'resolved',
        name: named.name,
        category: named.category,
        entry: regNamed || null
      };
    }
    if (/\b(that|the)\s+(whisky|whiskey|pour|spirit)\b/.test(t) || (/\b(it|that one)\b/.test(t) && !/\bcigar\b/.test(t))) {
      var spirits = SO.getRegistrySpirits().sort(function (a, b) { return b.turnIndex - a.turnIndex; });
      if (spirits.length) {
        return { status: 'resolved', name: spirits[0].name, category: 'spirit', entry: spirits[0] };
      }
    }
    if (/\b(that|the)\s+cigar\b/.test(t) || (/\b(it|that one)\b/.test(t) && sessionRuntime.lastReferencedProduct)) {
      var cigars = sessionRuntime.sessionProductRegistry
        .filter(function (e) { return e.category === 'cigar'; })
        .sort(function (a, b) { return b.turnIndex - a.turnIndex; });
      if (cigars.length) {
        return { status: 'resolved', name: cigars[0].name, category: 'cigar', entry: cigars[0] };
      }
    }
    if (sessionRuntime.lastReferencedProduct) {
      var entry = sessionRuntime.sessionProductRegistry.find(function (e) { return e.id === sessionRuntime.lastReferencedProduct.id; });
      if (entry) {
        return { status: 'resolved', name: entry.name, category: entry.category, entry: entry };
      }
    }
    return { status: 'miss' };
  }

  function renderExpertiseTurn(prose) {
    var h = _h();
    var PL = h.PL;
    var GL = h.GL;
    if (!PL || !GL || typeof PL.runConversationalPresentation !== 'function') return;
    PL.runConversationalPresentation(function (gen) {
      return Promise.resolve()
        .then(function () { return PL.conversationalThinkPause('expertise', gen); })
        .then(function (ok) {
          if (!ok || !GL.isStreamActive(gen)) return;
          return PL.presentProseBeat(prose, 'expertise', gen, { validateExpertise: true });
        })
        .finally(function () {
          if (typeof h.unlockComposer === 'function') h.unlockComposer();
        });
    });
  }

  function touchReferencedProduct(entry) {
    var sessionRuntime = _sr();
    var SL = _h().SL;
    if (!entry || !sessionRuntime || !SL) return;
    entry.lastReferencedAtTurn = sessionRuntime.turnCount;
    sessionRuntime.lastReferencedProduct = { id: entry.id, category: entry.category };
    SL.saveSessionRuntime();
  }

  function resolveActiveBestPickEntry(category) {
    var sessionRuntime = _sr();
    var SL = _h().SL;
    if (!sessionRuntime || !SL) return null;
    var set = sessionRuntime.activeRecommendationSet;
    if (!set || !set.best) return null;
    var name = category === 'cigar' ? set.best.cigar : set.best.spirit;
    if (!name) return null;
    var entry = sessionRuntime.sessionProductRegistry.find(
      function (e) { return e.name === name && e.category === category; }
    );
    if (!entry) {
      entry = SL.registerProductEntry(name, category, 'best', set.setId || null);
    }
    return entry;
  }

  function resolveRegistryReferent(text) {
    var sessionRuntime = _sr();
    var RT = _h().RT;
    var SO = _h().SO;
    if (!sessionRuntime || !RT || !SO) return { status: 'miss' };
    var t = (text || '').toLowerCase();
    var registry = sessionRuntime.sessionProductRegistry;
    if (!registry.length) return { status: 'miss' };

    var requestedCategory = RT.inferRequestedCategoryFromText(text);
    var eligible = requestedCategory
      ? registry.filter(function (e) { return e.category === requestedCategory; })
      : registry.slice();

    if (!requestedCategory && /\b(that one|it)\b/.test(t) && sessionRuntime.lastReferencedProduct) {
      var last = registry.find(function (e) { return e.id === sessionRuntime.lastReferencedProduct.id; });
      if (last) return { status: 'resolved', entry: last };
    }

    if (requestedCategory === 'spirit' && /\b(that whiskey|that whisky|that pour)\b/.test(t)) {
      var lastSp = sessionRuntime.lastReferencedProduct
        ? registry.find(function (e) { return e.id === sessionRuntime.lastReferencedProduct.id; })
        : null;
      if (lastSp && lastSp.category === 'spirit') return { status: 'resolved', entry: lastSp };
      return SO.resolveRecencyAmongEntries(eligible);
    }

    if (requestedCategory === 'cigar' && sessionRuntime.activeRecommendationSet) {
      var singularCigarRecall = /\b(what|which)\s+cigar\b/.test(t) ||
        /\bcigar\s+(was\s+)?that\b/.test(t) ||
        /\bwhat cigar was that\b/.test(t) ||
        (/\b(again|what was that|remind me)\b/.test(t) && /\bcigar\b/.test(t));
      if (singularCigarRecall) {
        var bestEntry = resolveActiveBestPickEntry('cigar');
        if (bestEntry) return { status: 'resolved', entry: bestEntry };
      }
    }

    if (requestedCategory === 'cigar' && (/\b(that cigar|the cigar)\b/.test(t) || /\bcigar\s+again\b/.test(t))) {
      var lastC = sessionRuntime.lastReferencedProduct
        ? registry.find(function (e) { return e.id === sessionRuntime.lastReferencedProduct.id; })
        : null;
      if (lastC && lastC.category === 'cigar') return { status: 'resolved', entry: lastC };
      var bestC = resolveActiveBestPickEntry('cigar');
      if (bestC) return { status: 'resolved', entry: bestC };
      return SO.resolveRecencyAmongEntries(eligible);
    }

    if (/\bthe\s+(smoky|peat|peated)\s+one\b/.test(t)) {
      var pool = requestedCategory ? eligible : registry;
      var matches = pool.filter(
        function (e) { return e.tags && (e.tags.indexOf('smoke') >= 0 || e.tags.indexOf('peat') >= 0); }
      );
      return SO.finalizeTagReferentResolution(matches);
    }

    if (/\bthe\s+japanese\s+one\b/.test(t) || /\bjapanese\s+whisky\b/.test(t)) {
      var matchesJ = eligible.filter(
        function (e) { return e.category === 'spirit' && e.tags && e.tags.indexOf('japanese') >= 0; }
      );
      return SO.finalizeTagReferentResolution(matchesJ);
    }

    if (/\b(first|second|third)\s+(whiskey|whisky|spirit|pour)\b/.test(t)) {
      var spiritsOrd = eligible.filter(function (e) { return e.category === 'spirit'; })
        .sort(function (a, b) { return a.turnIndex - b.turnIndex; });
      var ord = /\bfirst\b/.test(t) ? 0 : /\bsecond\b/.test(t) ? 1 : 2;
      if (spiritsOrd[ord]) return { status: 'resolved', entry: spiritsOrd[ord] };
    }

    if (/\bwildcard\b/.test(t)) {
      var w = eligible.find(function (e) { return e.role === 'wildcard' && e.category === 'spirit'; });
      if (w) return { status: 'resolved', entry: w };
    }

    if (/\b(best pick|the best)\b/.test(t)) {
      var b = eligible.find(function (e) { return e.role === 'best' && e.category === 'spirit'; });
      if (b) return { status: 'resolved', entry: b };
    }

    if (/\bjapanese\b/.test(t) && /\b(whiskey|whisky|again|what was that)\b/.test(t)) {
      var matchesJa = eligible.filter(
        function (e) { return e.category === 'spirit' && e.tags && e.tags.indexOf('japanese') >= 0; }
      );
      return SO.finalizeTagReferentResolution(matchesJa);
    }

    if (/\b(again|what was that|remind me|which one)\b/.test(t) || /\b(whiskey|whisky)\s+again\b/.test(t)) {
      if (requestedCategory === 'spirit') {
        return SO.resolveRecencyAmongEntries(eligible);
      }
      if (requestedCategory === 'cigar') {
        return SO.resolveRecencyAmongEntries(eligible);
      }
      var spiritsRec = SO.getRegistrySpirits();
      return SO.resolveRecencyAmongEntries(spiritsRec);
    }

    var nameMatch = eligible.filter(function (e) { return t.indexOf(e.name.toLowerCase()) >= 0; });
    if (nameMatch.length === 1) return { status: 'resolved', entry: nameMatch[0] };
    if (nameMatch.length > 1) return { status: 'ambiguous', candidates: nameMatch.slice(0, 3) };

    return { status: 'miss' };
  }

  function resolveComparisonTargets(text) {
    var SO = _h().SO;
    if (!SO) return { status: 'miss' };
    var spirits = SO.getRegistrySpirits().sort(function (a, b) { return b.turnIndex - a.turnIndex; });
    if (spirits.length >= 2) return { status: 'resolved', entries: spirits.slice(0, 2) };
    if (spirits.length === 1) return { status: 'miss' };
    return { status: 'miss' };
  }

  function handleExpertiseTurn(text) {
    var h = _h();
    var RT = h.RT;
    var SL = h.SL;
    var RuntimeMode = h.RuntimeMode;
    if (!RT || !SL || !RuntimeMode) return false;
    if (RT.isEducationalComparisonIntent && RT.isEducationalComparisonIntent(text)) {
      if (typeof h.buildEducationalPairingComparisonProse !== 'function') return false;
      renderExpertiseTurn(h.buildEducationalPairingComparisonProse(text));
      SL.updateSessionStateForContinuity(RuntimeMode.EXPERTISE, text);
      return true;
    }
    var branch = RT.classifyExpertiseBranch(text);
    if (!branch) return false;
    var sessionRuntime = _sr();
    if (!sessionRuntime) return false;
    if (branch === RT.ExpertiseBranch.CONFIDENCE) {
      if (typeof h.buildConfidenceBoundaryProse !== 'function') return false;
      renderExpertiseTurn(h.buildConfidenceBoundaryProse(text));
      SL.updateSessionStateForContinuity(RuntimeMode.EXPERTISE, text);
      return true;
    }
    var subject = resolveExpertiseSubject(text);
    if (subject.status !== 'resolved') {
      if (typeof h.renderProseOnlyTurn === 'function') {
        h.renderProseOnlyTurn('Happy to go deeper — which pour or cigar are we talking about? I can stay with tonight\'s pairing if that is the one.');
      }
      SL.updateSessionStateForContinuity(RuntimeMode.CLARIFICATION, text);
      return true;
    }
    var entry = subject.entry || SL.registerProductEntry(
      subject.name,
      subject.category,
      'mentioned',
      sessionRuntime.activeRecommendationSet ? sessionRuntime.activeRecommendationSet.setId : null
    );
    touchReferencedProduct(entry);
    sessionRuntime.lastExpertiseBranch = branch;
    if (typeof h.buildExpertiseProseForBranch !== 'function') return false;
    renderExpertiseTurn(h.buildExpertiseProseForBranch(branch, subject, text));
    SL.updateSessionStateForContinuity(RuntimeMode.EXPERTISE, text);
    return true;
  }

  function handleContinuityTurn(text) {
    var h = _h();
    var SO = h.SO;
    var SL = h.SL;
    var RuntimeMode = h.RuntimeMode;
    if (!SO || !SL || !RuntimeMode) return false;
    var sessionRuntime = _sr();
    if (!sessionRuntime) return false;
    var intent = SO.interpretContinuityIntent(text);

    if (intent === 'pivot') {
      sessionRuntime.refinementAxis = null;
      sessionRuntime.refinementTarget = null;
      sessionRuntime.refinementChainDepth = 0;
      if (/\bsomething else\b/.test((text || '').toLowerCase()) && sessionRuntime.activeRecommendationSet) {
        sessionRuntime.hasExplicitRecommendationRequest = true;
        SL.saveSessionRuntime();
        return false;
      }
      SL.saveSessionRuntime();
      return false;
    }

    if (intent === 'recall') {
      var referent = resolveRegistryReferent(text);
      if (typeof h.buildReferentClarifyProse !== 'function' || typeof h.renderProseOnlyTurn !== 'function') return false;
      if (referent.status === 'ambiguous') {
        h.renderProseOnlyTurn(h.buildReferentClarifyProse(referent.candidates));
        SL.updateSessionStateForContinuity(RuntimeMode.CLARIFICATION, text);
        return true;
      }
      if (referent.status === 'miss') {
        var spirits = SO.getRegistrySpirits();
        h.renderProseOnlyTurn(h.buildReferentClarifyProse(spirits.length ? spirits : null));
        SL.updateSessionStateForContinuity(RuntimeMode.CLARIFICATION, text);
        return true;
      }
      touchReferencedProduct(referent.entry);
      var wantsNew = /\b(something else|give me|recommend|new|different)\b/i.test(text);
      if (wantsNew) return false;
      if (typeof h.renderRecallTurn === 'function') h.renderRecallTurn(referent.entry);
      SL.updateSessionStateForContinuity(RuntimeMode.RECALL, text);
      return true;
    }

    if (intent === 'comparison') {
      var targets = resolveComparisonTargets(text);
      if (typeof h.buildReferentClarifyProse !== 'function' || typeof h.renderProseOnlyTurn !== 'function' || typeof h.renderComparisonTurn !== 'function') {
        return false;
      }
      if (targets.status !== 'resolved' || !targets.entries || targets.entries.length < 2) {
        h.renderProseOnlyTurn(h.buildReferentClarifyProse(SO.getRegistrySpirits()));
        SL.updateSessionStateForContinuity(RuntimeMode.CLARIFICATION, text);
        return true;
      }
      sessionRuntime.comparisonSet = targets.entries;
      targets.entries.forEach(touchReferencedProduct);
      h.renderComparisonTurn(targets.entries);
      SL.updateSessionStateForContinuity(RuntimeMode.COMPARISON, text);
      return true;
    }

    if (intent === 'refinement_unresolved') {
      if (typeof h.buildReferentClarifyProse !== 'function' || typeof h.renderProseOnlyTurn !== 'function') return false;
      h.renderProseOnlyTurn(h.buildReferentClarifyProse(null));
      SL.updateSessionStateForContinuity(RuntimeMode.CLARIFICATION, text);
      return true;
    }

    if (intent === 'refinement') {
      if (typeof h.coordinateRefinementTurn !== 'function') return false;
      return h.coordinateRefinementTurn(text);
    }

    return false;
  }

  function handleAnchoredPairingTurn(text) {
    var h = _h();
    var RT = h.RT;
    var SL = h.SL;
    if (!RT || !SL) return false;
    var sessionRuntime = _sr();
    if (!sessionRuntime) return false;
    if (!RT.isCigarAnchoredPairingRequest(text)) return false;
    var cigar = RT.resolveMentionedCigar(text);
    if (!cigar) return false;
    if (typeof h.buildRecommendationTurnForPrompt !== 'function' ||
        typeof h.buildAnchoredCigarPairingProse !== 'function' ||
        typeof h.renderRecommendationTurn !== 'function' ||
        typeof h.synchronizeRecommendationContinuity !== 'function' ||
        !h.RuntimeMode) {
      return false;
    }
    sessionRuntime.activeCategoryFocus = 'spirit';
    var turn = h.buildRecommendationTurnForPrompt(text, { anchorCigar: cigar.name, categoryFocus: null });
    var cards = turn.cards;
    var spirit = cards[0] && cards[0].spirit;
    var prose = h.buildAnchoredCigarPairingProse(cigar, text, spirit);
    h.renderRecommendationTurn(prose, cards, text, { preserveAnchoredCigar: true });
    h.synchronizeRecommendationContinuity(h.RuntimeMode.RECOMMENDATION, text, function () {
      SL.registerProductEntry(cigar.name, 'cigar', 'mentioned', null);
      if (cards[0] && cards[0].spirit) {
        SL.registerProductEntry(cards[0].spirit, 'spirit', 'recommended', null);
      }
    });
    return true;
  }

  function handleClosingIntentTurn(text) {
    var h = _h();
    var RT = h.RT;
    if (!RT || typeof h.renderProseOnlyTurn !== 'function' || typeof h.buildClosingProse !== 'function' || typeof h.finalizeConversationalTurn !== 'function' || !h.RuntimeMode) {
      return false;
    }
    if (!RT.isClosingIntent(text)) return false;
    h.renderProseOnlyTurn(h.buildClosingProse(text));
    h.finalizeConversationalTurn(text, { continuityMode: h.RuntimeMode.CLARIFICATION });
    return true;
  }

  global.SterlonTurnHandlers = {
    setHost: setHost,
    resolveExpertiseSubject: resolveExpertiseSubject,
    resolveRegistryReferent: resolveRegistryReferent,
    handleExpertiseTurn: handleExpertiseTurn,
    handleContinuityTurn: handleContinuityTurn,
    handleAnchoredPairingTurn: handleAnchoredPairingTurn,
    handleClosingIntentTurn: handleClosingIntentTurn
  };
})(typeof window !== 'undefined' ? window : global);
