/**
 * OntologyPolicyCore â€” shared helpers for tracker guidance scoring.
 * Loaded before ontology-cigar-context, ontology-spirit-context, ontology-retrieval.
 */
(function (global) {
  'use strict';

  var AFFINITY_TO_DECKS = {
    bourbon: ['bourbon', 'rye'],
    rye: ['rye', 'bourbon'],
    scotch: ['scotch', 'irish', 'peated'],
    cognac: ['cognac', 'rum'],
    coffee: ['bourbon', 'irish', 'rye'],
    rum: ['rum', 'cognac'],
    champagne: ['cognac', 'vodka'],
    port: ['cognac', 'rum'],
    tequila: ['agave'],
    mezcal: ['agave'],
    irish: ['irish', 'scotch'],
    vodka: ['vodka', 'cognac']
  };

  var FLAVOR_FAMILY_HINTS = {
    'dark & heavy': { tags: ['cocoa', 'espresso', 'earth'], bodyMin: 7 },
    'sweet spice': { tags: ['cedar', 'spice', 'caramel'], bodyMin: 4 },
    woodsy: { tags: ['cedar', 'wood', 'earth'], bodyMin: 5 },
    coffee: { tags: ['coffee', 'cocoa', 'cedar'], bodyMin: 5 },
    creamy: { tags: ['cream', 'cedar', 'nut'], bodyMin: 3 },
    dessert: { tags: ['caramel', 'cream', 'chocolate'], bodyMin: 5 },
    earthy: { tags: ['earth', 'leather', 'cedar'], bodyMin: 5 },
    savory: { tags: ['earth', 'spice', 'leather'], bodyMin: 6 }
  };

  var lastDiagnostics = {
    affinityInfluencePct: 0,
    deckOverride: false,
    affinityConflict: false,
    suppressedCount: 0,
    contextHits: []
  };

  function lp() {
    return global.LoungeProducts || null;
  }

  function normalizeText(t) {
    return String(t || '')
      .toLowerCase()
      .replace(/[_-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function findProduct(name, category) {
    var PIDs = global.RecommendationProductIds;
    if (PIDs && typeof PIDs.getProductRef === 'function') {
      return PIDs.getProductRef(category, name);
    }
    return null;
  }

  function guidanceOf(product) {
    return (product && product.guidance) || {};
  }

  function provenanceOf(product) {
    return (product && product.provenance) || {};
  }

  function normalizeAffinity(raw) {
    var a = normalizeText(raw);
    if (!a) return '';
    if (a.indexOf('bourbon') !== -1) return 'bourbon';
    if (a.indexOf('scotch') !== -1 || a.indexOf('whisky') !== -1) return 'scotch';
    if (a.indexOf('cognac') !== -1 || a.indexOf('brandy') !== -1) return 'cognac';
    if (a.indexOf('coffee') !== -1) return 'coffee';
    if (a.indexOf('rum') !== -1) return 'rum';
    if (a.indexOf('champagne') !== -1 || a.indexOf('sparkling') !== -1) return 'champagne';
    if (a.indexOf('port') !== -1) return 'port';
    if (a.indexOf('tequila') !== -1 || a.indexOf('agave') !== -1 || a.indexOf('mezcal') !== -1) {
      return 'agave';
    }
    if (a.indexOf('irish') !== -1) return 'irish';
    if (a.indexOf('vodka') !== -1) return 'vodka';
    if (a.indexOf('rye') !== -1) return 'rye';
    return a.split(/\s+/)[0] || '';
  }

  function deckKeysForAffinity(affinity) {
    var key = normalizeAffinity(affinity);
    return AFFINITY_TO_DECKS[key] ? AFFINITY_TO_DECKS[key].slice() : [];
  }

  function parseSmokeMinutes(smokeTime) {
    var m = String(smokeTime || '').match(/(\d+)\s*(?:â€“|-|to)\s*(\d+)/i);
    if (m) return (parseInt(m[1], 10) + parseInt(m[2], 10)) / 2;
    var single = String(smokeTime || '').match(/(\d+)/);
    return single ? parseInt(single[1], 10) : null;
  }

  function sessionOccasion(session) {
    var sr = session && session.sterlonRouting;
    return sr && sr.eveningOccasion ? sr.eveningOccasion : null;
  }

  function sessionRhythm(session) {
    var sr = session && session.sterlonRouting;
    return sr && sr.eveningRhythm ? sr.eveningRhythm : null;
  }

  function sessionAtmosphere(session) {
    var sr = session && session.sterlonRouting;
    return sr && sr.eveningAtmosphere ? sr.eveningAtmosphere : null;
  }

  function detectComfortAsk(text) {
    return (
      /\b(not intimidating|without intimidating|easy sipping|new to cigars?|relaxed|approachable)\b/.test(
        text
      ) ||
      /\b(sophisticated|comfortable|not a powerhouse|maximum strength)\b/.test(text) ||
      /\b(smooth|mild|easy|gentle|lighter|not too strong|not too heavy|elegant|early smoke)\b/.test(
        text
      ) ||
      /\b(first cigar|first time|new to cigar|beginner|never smoked)\b/.test(text)
    );
  }

  function buildRecoContext(opts) {
    var o = opts || {};
    var text = normalizeText(o.promptText || '');
    var session = o.sessionRuntime || {};
    var CSE = global.CigarSmokeEstimate;
    // Soft scoring hint only. Explicit numeric durations ("30 min", "45 min") are hard constraints handled by RecommendationEligibilityConstraints.
    var quickSmoke = /\b(quick|short|lunch|under an hour|patio)\b/.test(text);
    var longSession = /\b(long|evening|session|hours|slow)\b/.test(text);
    var ctx = {
      promptText: o.promptText || '',
      journeyLevel: o.journeyLevel || 'advanced',
      quickSmoke: quickSmoke,
      longSession: longSession,
      firstTimer: /\b(first cigar|first time|new to cigar|beginner|never smoked)\b/.test(text),
      celebration: /\b(celebrat|anniversary|birthday|toast|special)\b/.test(text),
      afterDinner: /\b(after dinner|post.?dinner|dessert)\b/.test(text),
      softAsk: /\b(smooth|mild|easy|gentle|approachable|not too strong)\b/.test(text),
      boldAsk:
        /\b(bold|full.?bodied|strong|intense)\b/.test(text) ||
        (/\bheavy\b/.test(text) && !/\bnot too heavy\b/.test(text)),
      comfortAsk: (function () {
        var softening =
          /\b(not too heavy|not too strong|elegant|smooth|mild|gentle|early smoke)\b/.test(text);
        var bold =
          (/\b(bold|full.?bodied|strong|intense)\b/.test(text) ||
            (/\bheavy\b/.test(text) && !/\bnot too heavy\b/.test(text))) &&
          !softening;
        return !bold && detectComfortAsk(text);
      })(),
      fullBodyAsk:
        /\b(full[\s-]?body|full[\s-]?strength|full\s+cigar)\b/.test(text) ||
        (/\bespresso\b/.test(text) &&
          (/\b(full|bold|intense)\b/.test(text) ||
            (/\bheavy\b/.test(text) && !/\bnot too heavy\b/.test(text)))),
      highProofBourbon: /\b(high proof|barrel proof|cask strength|overproof|old forester 1920|booker'?s|wild turkey 101|stagg|1920)\b/.test(text) ||
        /\b(10[0-9]|11[0-9]|12[0-9]|13[0-9])\s*proof\b/.test(text),
      morningSession: (function () {
        if (/\b(after dinner|post.?dinner)\b/.test(text)) return false;
        if (/\b(morning|early smoke|with coffee|coffee session)\b/.test(text)) return true;
        return (
          /\b(coffee|espresso)\b/.test(text) &&
          /\b(pair|morning|elegant|smooth|light|early|not too heavy|gentle)\b/.test(text)
        );
      })(),
      coffeeEspressoPairing: (function () {
        if (/\b(after dinner|post.?dinner)\b/.test(text)) return false;
        if (!/\b(coffee|espresso|cappuccino|latte|cold brew)\b/.test(text)) return false;
        return (
          /\b(morning|early smoke|with coffee|coffee session|pair|elegant|smooth|gentle|recommend|suggest)\b/.test(
            text
          ) &&
          !/\b(whiskey|whisky|bourbon|scotch|spirit|pour|tequila|mezcal|vodka|cognac|rum|beer|cocktail)\b/.test(
            text
          )
        );
      })(),
      sessionOccasion: sessionOccasion(session),
      sessionRhythm: sessionRhythm(session),
      sessionAtmosphere: sessionAtmosphere(session),
      // Soft scoring ceiling only; not a hard eligibility cap. Hard duration filtering is upstream in RecommendationEligibilityConstraints.
      maxSmokeMinutes: (function () {
        if (quickSmoke) return 50;
        if (longSession) return 120;
        return null;
      })(),
      pairingStrategy: o.pairingStrategy || null
    };
    if (CSE && typeof CSE.resolveTargetSmokeMinutes === 'function') {
      ctx.targetSmokeMinutes = CSE.resolveTargetSmokeMinutes(ctx);
    }
    if (ctx.morningSession && !ctx.boldAsk) {
      ctx.comfortAsk = true;
    }
    return ctx;
  }





  function memberAllowsLigeroPowerSlots(ctx) {
    if (!ctx) return false;
    var t = normalizeText(ctx.promptText || '');
    return !!(
      ctx.boldAsk ||
      ctx.fullBodyAsk ||
      /\b(powerhouse|maximum strength|double ligero|ligero bomb|pepper bomb|full strength cigar)\b/.test(t)
    );
  }

  function productBlob(product) {
    if (!product) return '';
    return normalizeText(
      [
        product.name,
        product.deckKey,
        product.category,
        product.spec && product.spec.wrapper,
        product.spec && product.spec.binder,
        product.spec && product.spec.filler,
        product.spec && product.spec.origin,
        product.spec && product.spec.style,
        product.spec && product.spec.body,
        product.guidance && product.guidance.wrapperRole,
        product.guidance && product.guidance.binderRole,
        product.guidance && product.guidance.fillerRole,
        product.guidance && product.guidance.flavorFamily,
        product.guidance && product.guidance.bestFor,
        product.guidance && product.guidance.avoidIf,
        product.guidance && product.guidance.whyRecommend,
        (product.tags || []).map(function (tag) { return tag && tag.id; }).join(' '),
        JSON.stringify(product.sensory || {})
      ].filter(Boolean).join(' ')
    );
  }

  function isMaduroWrapperIntent(product) {
    var wrapper = normalizeText(product && product.spec && product.spec.wrapper);
    var blob = productBlob(product);
    return /\b(maduro|broadleaf|san andr(?:es)?)\b/.test(wrapper + ' ' + blob);
  }

  function isLigeroHeavyMaduro(product) {
    if (!product) return false;
    var blob = productBlob(product);
    if (!/\b(double ligero|ligero)\b/.test(blob)) return false;
    return isMaduroWrapperIntent(product) || /\bmaduro\b/.test(blob);
  }

  function isPepperHeavyMaduro(product) {
    if (!product || !isMaduroWrapperIntent(product)) return false;
    var blob = productBlob(product);
    var sensory = product.sensory || {};
    return (
      /\b(pepper bomb|black pepper|red pepper|cayenne|pepper-forward|sharp spice)\b/.test(blob) ||
      (sensory.pepper != null && Number(sensory.pepper) >= 7)
    );
  }

  function isBlockedForHighProofAnchorSlot(product, ctx) {
    if (!global.OntologyPolicyCore.isHighProofBourbonContext(ctx || {}, null)) return false;
    if (memberAllowsLigeroPowerSlots(ctx)) return false;
    return isLigeroHeavyMaduro(product) || isPepperHeavyMaduro(product);
  }


  function textHitsBlob(blob, text) {
    var hits = 0;
    text.split(/\s+/).forEach(function (token) {
      if (token.length < 4) return;
      if (blob.indexOf(token) !== -1) hits += 1;
    });
    return hits;
  }

  function avoidIfTriggered(product, ctx) {
    var avoid = guidanceOf(product).avoidIf;
    if (!avoid) return false;
    var blob = normalizeText(avoid);
    var prompt = normalizeText(ctx.promptText || '');
    if (ctx.firstTimer && /\b(beginner|first|new to|nicotine|overwhelm)\b/.test(blob)) return true;
    if (ctx.quickSmoke && /\b(long|2.?hour|two hour|commit|extended)\b/.test(blob)) return true;
    if (ctx.softAsk && /\b(heavy|full|strong|nicaraguan|overwhelm|peat)\b/.test(blob)) return true;
    if (ctx.journeyLevel === 'novice' && /\b(beginner|first|nicotine|sensitive)\b/.test(blob)) {
      return true;
    }
    if (
      ctx.fullBodyAsk &&
      /\b(not maximum strength|maximum strength|full body|bold espresso|powerhouse|softer|cream-forward)\b/.test(
        blob
      )
    ) {
      return true;
    }
    return textHitsBlob(blob, prompt) >= 2;
  }

  function bestForBoost(product, ctx) {
    var best = guidanceOf(product).bestFor;
    if (!best) return 0;
    var blob = normalizeText(best);
    var score = 0;
    if (ctx.celebration && /\b(celebrat|special|occasion|toast)\b/.test(blob)) score += 0.35;
    if (ctx.afterDinner && /\b(after dinner|dessert|evening|nightcap)\b/.test(blob)) score += 0.3;
    if (ctx.quickSmoke && /\b(quick|short|lunch|value|under)\b/.test(blob)) score += 0.35;
    if (ctx.firstTimer && /\b(beginner|first|approachable|mild)\b/.test(blob)) score += 0.4;
    if (ctx.softAsk && /\b(approachable|mild|connecticut|cream)\b/.test(blob)) score += 0.25;
    if (ctx.boldAsk && /\b(full|bold|experienced|connoisseur)\b/.test(blob)) score += 0.25;
    var occ = normalizeText(guidanceOf(product).occasion || '');
    if (ctx.sessionOccasion && occ.indexOf(normalizeText(ctx.sessionOccasion)) !== -1) score += 0.2;
    score += Math.min(0.25, textHitsBlob(blob, normalizeText(ctx.promptText)) * 0.08);
    return score;
  }

  function beginnerPenalty(product, ctx) {
    if (ctx.journeyLevel !== 'novice') return 0;
    var safe = provenanceOf(product).beginnerSafe;
    if (safe && /^no$/i.test(String(safe).trim())) return 0.85;
    var str = product.spec && product.spec.strength != null ? Number(product.spec.strength) : 5;
    if (str >= 7) return 0.35;
    return 0;
  }

  // Soft scoring penalty only. Hard smoke-duration filtering happens upstream before ranking.
  function smokeTimePenalty(product, ctx) {
    var CSE = global.CigarSmokeEstimate;
    var mins =
      CSE && typeof CSE.estimateSmokeMinutes === 'function'
        ? CSE.estimateSmokeMinutes(product)
        : parseSmokeMinutes(product.spec && product.spec.smokeTime);
    if (mins == null) return 0;

    if (ctx.maxSmokeMinutes != null) {
      if (ctx.quickSmoke && mins > ctx.maxSmokeMinutes) return 0.55;
      if (ctx.longSession && mins < 55) return 0.1;
    }

    if (CSE && typeof CSE.smokeMinutesFitPenalty === 'function' && ctx.targetSmokeMinutes != null) {
      return CSE.smokeMinutesFitPenalty(mins, ctx);
    }
    return 0;
  }

  function flavorFamilyBoost(product, ctx) {
    var ff = normalizeText(guidanceOf(product).flavorFamily || '');
    if (!ff) return 0;
    var hint = FLAVOR_FAMILY_HINTS[ff];
    if (!hint) return 0.05;
    if (ctx.boldAsk && hint.bodyMin >= 7) return 0.2;
    if (ctx.softAsk && hint.bodyMin <= 5) return 0.2;
    return 0.08;
  }

  function getAffinityDiagnostics() {
    return {
      affinityInfluencePct: lastDiagnostics.affinityInfluencePct,
      deckOverride: lastDiagnostics.deckOverride,
      affinityConflict: lastDiagnostics.affinityConflict,
      suppressedCount: lastDiagnostics.suppressedCount,
      contextHits: lastDiagnostics.contextHits.slice()
    };
  }

  global.OntologyPolicyCore = {
    lastDiagnostics: lastDiagnostics,
    lp: lp,
    normalizeText: normalizeText,
    productBlob: productBlob,
    findProduct: findProduct,
    guidanceOf: guidanceOf,
    provenanceOf: provenanceOf,
    normalizeAffinity: normalizeAffinity,
    deckKeysForAffinity: deckKeysForAffinity,
    buildRecoContext: buildRecoContext,
    avoidIfTriggered: avoidIfTriggered,
    bestForBoost: bestForBoost,
    beginnerPenalty: beginnerPenalty,
    smokeTimePenalty: smokeTimePenalty,
    flavorFamilyBoost: flavorFamilyBoost,
    memberAllowsLigeroPowerSlots: memberAllowsLigeroPowerSlots,
    isLigeroHeavyMaduro: isLigeroHeavyMaduro,
    isPepperHeavyMaduro: isPepperHeavyMaduro,
    isBlockedForHighProofAnchorSlot: isBlockedForHighProofAnchorSlot,
    getAffinityDiagnostics: getAffinityDiagnostics
  };
})(typeof window !== 'undefined' ? window : global);
