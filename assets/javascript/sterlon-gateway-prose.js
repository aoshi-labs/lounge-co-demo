/**
 * SterlonGatewayProse — prose governance pipeline (P1.5).
 *
 * Owns pure text-in → text-out governance and validation functions extracted
 * from sterlon-chat.js. All functions are stateless: they receive raw text
 * and return governed text with no side effects.
 *
 * Dependencies (lazy, via window globals):
 *   _PP() → window.SterlonProsePipeline   (text transforms)
 *   _SR() → window.SterlonRecommendations (competing-signal check)
 *
 * This module never:
 *   - reads or writes sessionRuntime
 *   - calls DOM APIs
 *   - calls saveSessionRuntime()
 *   - creates RecommendationTurn artifacts
 *   - assigns products or scores
 *
 * Most important invariant:
 *   GP owns narration governance only. Recommendation authority may only
 *   originate from RecommendationRuntime-generated RecommendationTurn artifacts.
 */
(function (global) {
  'use strict';

  // -- Lazy module accessors ------------------------------------------------
  function _PP() { return global.SterlonProsePipeline || null; }
  function _SR() { return global.SterlonRecommendations || null; }

  // -- Governance profile limits --------------------------------------------

  /**
   * Per-profile word and sentence caps applied by governGeneratedProse().
   * 'prose' is the fallback when no profileKey is matched.
   */
  const PROSE_GOVERNANCE_LIMITS = {
    recommendation:         { words: 82,  sentences: 4 },
    recommendation_gateway: { words: 420, sentences: 40 },
    refinement:             { words: 46,  sentences: 2 },
    expertise:              { words: 78,  sentences: 4 },
    comparison:             { words: 68,  sentences: 3 },
    clarification:          { words: 42,  sentences: 2 },
    prose:                  { words: 54,  sentences: 3 }
  };

  const PROSE_BRAND_DRIFT_TRANSITION =
    'Exploring alternatives beyond our main selection, here is how your flight shapes up:';

  function _FBP() { return global.FlightBrandPolicy || null; }
  function _ENT() { return global.RecommendationEntropy || null; }

  function manufacturerKeysForProductName(name, category) {
    var keys = [];
    if (!name) return keys;
    var FBP = _FBP();
    var ENT = _ENT();
    if (category === 'cigar' && FBP) {
      var mk = FBP.cigarManufacturerKey(name);
      if (mk) keys.push(mk);
      var pc = FBP.cigarParentCompany(name);
      if (pc) keys.push(pc);
    } else if (ENT && typeof ENT.brandKey === 'function') {
      keys.push(ENT.brandKey(name));
    } else {
      var first = String(name).trim().toLowerCase().split(/\s+/)[0];
      if (first) keys.push(first);
    }
    return keys.filter(Boolean);
  }

  function collectSealedBrandKeys(cards) {
    var allowed = Object.create(null);
    (cards || []).forEach(function (card) {
      if (!card) return;
      manufacturerKeysForProductName(card.cigar, 'cigar').forEach(function (k) {
        allowed[k] = true;
      });
      manufacturerKeysForProductName(card.spirit, 'spirit').forEach(function (k) {
        allowed[k] = true;
      });
    });
    return allowed;
  }

  function buildBrandLexicon() {
    var lex = Object.create(null);
    var SR = _SR();
    if (!SR) return lex;
    var cigars = SR.getMenuCigars ? SR.getMenuCigars() : [];
    var spirits = SR.getMenuSpirits ? SR.getMenuSpirits() : [];
    cigars.forEach(function (name) {
      manufacturerKeysForProductName(name, 'cigar').forEach(function (k) {
        if (k.length >= 3) lex[k] = true;
      });
    });
    spirits.forEach(function (name) {
      manufacturerKeysForProductName(name, 'spirit').forEach(function (k) {
        if (k.length >= 3) lex[k] = true;
      });
    });
    return lex;
  }

  function textMentionsBrandKey(text, brandKey) {
    if (!brandKey || brandKey.length < 3) return false;
    var escaped = String(brandKey).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('\\b' + escaped.replace(/\s+/g, '\\s+') + '\\b', 'i').test(String(text || ''));
  }

  function hasForeignBrandDrift(text, sealedCards) {
    if (!text || !sealedCards || !sealedCards.length) return false;
    var allowed = collectSealedBrandKeys(sealedCards);
    var lex = buildBrandLexicon();
    var raw = String(text);
    return Object.keys(lex).some(function (bk) {
      return !allowed[bk] && textMentionsBrandKey(raw, bk);
    });
  }

  function anchorProseToSealedCards(text, sealedCards) {
    if (!hasForeignBrandDrift(text, sealedCards)) return text;
    var body = String(text || '').trim();
    if (!body) return body;
    if (body.indexOf(PROSE_BRAND_DRIFT_TRANSITION) === 0) return body;
    return PROSE_BRAND_DRIFT_TRANSITION + ' ' + body;
  }

  function _PK() { return global.ProductKnowledge || null; }

  var SLOT_HEADER_LABELS = ['BEST PICK', 'REFINED OPTION', 'CONTRAST WILDCARD'];
  var SLOT_KEYS = ['best', 'refined', 'wildcard'];

  function primaryProductsForCard(card, categoryFocus) {
    if (!card) return '';
    if (categoryFocus === 'spirit' && card.spirit) return card.spirit;
    if (categoryFocus === 'cigar' && card.cigar) return card.cigar;
    var parts = [];
    if (card.cigar) parts.push(card.cigar);
    if (card.spirit) parts.push(card.spirit);
    return parts.join(' with ');
  }

  function escapeRegExp(text) {
    return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** Remove product-name echoes already carried in the slot header line. */
  function stripSealedProductPrefix(body, products, card, categoryFocus) {
    if (!body) return '';
    var text = String(body).trim();
    if (!text) return '';

    if (products) {
      var productsLower = products.toLowerCase();
      var textLower = text.toLowerCase();
      if (textLower.indexOf(productsLower) === 0) {
        text = text.slice(products.length).trim();
        text = text.replace(/^[\s—–-]+/, '').trim();
        textLower = text.toLowerCase();
      }
    }

    if (card && card.cigar) {
      var cigar = String(card.cigar);
      var cigarLower = cigar.toLowerCase();
      if (text.toLowerCase().indexOf(cigarLower) === 0) {
        text = text.slice(cigar.length).trim();
        text = text.replace(/^[\s—–-]+/, '').trim();
      }
    }

    if (card && card.spirit && categoryFocus !== 'spirit') {
      var spiritPrefix = 'with ' + String(card.spirit);
      var spiritLower = spiritPrefix.toLowerCase();
      while (text.toLowerCase().indexOf(spiritLower) === 0) {
        text = text.slice(spiritPrefix.length).trim();
        text = text.replace(/^[\s—–-]+/, '').trim();
      }
      var spiritRe = escapeRegExp(card.spirit);
      text = text.replace(
        new RegExp('(\\bwith\\s+' + spiritRe + ')\\s+\\1\\b', 'i'),
        '$1'
      );
      text = text.replace(
        new RegExp('\\bwith\\s+' + spiritRe + '\\s+with\\s+' + spiritRe + '\\b', 'gi'),
        'with ' + card.spirit
      );
    }

    if (card && card.spirit && categoryFocus === 'spirit') {
      var soloSpirit = String(card.spirit);
      var soloLower = soloSpirit.toLowerCase();
      if (text.toLowerCase().indexOf(soloLower) === 0) {
        text = text.slice(soloSpirit.length).trim();
        text = text.replace(/^[\s—–-]+/, '').trim();
      }
    }

    return text.trim();
  }

  function cardMentionsText(card, text) {
    var raw = String(text || '').toLowerCase();
    var hit = false;
    [card.cigar, card.spirit].filter(Boolean).forEach(function (p) {
      var needle = String(p).toLowerCase().slice(0, Math.min(14, String(p).length));
      if (needle && raw.indexOf(needle) !== -1) hit = true;
    });
    return hit;
  }

  function buildWildcardContrastFallback(card, bestCard) {
    var wild = card.cigar || card.spirit || 'this pick';
    var best = bestCard.cigar || bestCard.spirit || 'the best pick';
    var PK = _PK();
    var lines = [
      wild + ' contrasts ' + best + ' on purpose — different wrapper rhythm and flavor tension, not a softer echo of the same profile.',
      'Enough contrast to feel like a second path through the evening without breaking the mood.'
    ];
    var factName = card.cigar || card.spirit;
    if (factName && PK && typeof PK.buildConciergeProseFallback === 'function') {
      var sensory = PK.buildConciergeProseFallback(factName);
      if (sensory) lines.push(sensory);
    }
    return lines.join(' ');
  }

  function runtimeSlotBody(card, slotKey, bestCard) {
    var PP = _PP();
    var PK = _PK();
    var SR = _SR();
    var bullets = card.why || [];
    if (SR && typeof SR.normalizeWhyBullets === 'function') {
      bullets = SR.normalizeWhyBullets(bullets, []);
    }
    var lines = bullets.map(function (b) {
      if (PP && PP.isOpsFacingWhyLine && PP.isOpsFacingWhyLine(b)) return '';
      return PP && PP.humanizeWhyBullet ? PP.humanizeWhyBullet(b) : String(b || '');
    }).filter(Boolean);
    if (lines.length) {
      var joined = lines.slice(0, 2).join(' ');
      var HPC = global.HospitalityProseCompose;
      var OP = global.OntologyPolicy;
      var sr = global.SterlonRuntimeState && global.SterlonRuntimeState.getSession
        ? global.SterlonRuntimeState.getSession()
        : null;
      var recoCtx =
        OP && typeof OP.buildRecoContext === 'function'
          ? OP.buildRecoContext({ promptText: '', sessionRuntime: sr || {} })
          : null;
      if (HPC && typeof HPC.maybeComposeForSlot === 'function' && joined.length < 180) {
        var one = HPC.maybeComposeForSlot(joined, card, recoCtx, { slotKey: slotKey, governanceMinWords: 30 });
        if (one.composed) return one.text;
      }
      return joined;
    }
    var name = card.cigar || card.spirit;
    if (name && PK && typeof PK.buildConciergeProseFallback === 'function') {
      var sensory = PK.buildConciergeProseFallback(name);
      if (sensory) return sensory;
    }
    if (slotKey === 'wildcard' && bestCard) {
      return buildWildcardContrastFallback(card, bestCard);
    }
    return '';
  }

  function extractUsableGatewayBody(section, card) {
    if (!section || !String(section).trim()) return '';
    var body = String(section).trim();
    if (hasForeignBrandDrift(body, [card]) && !cardMentionsText(card, body)) return '';
    if (hasForeignBrandDrift(body, [card])) return '';
    return body;
  }

  function cleanGatewaySlotBody(section, card, categoryFocus) {
    if (!section) return '';
    var products = primaryProductsForCard(card, categoryFocus);
    var body = String(section).trim();
    body = body.replace(/^\*\*BEST\s+PICK\s*:\*\*\s*/i, '');
    body = body.replace(/^\*\*REFINED\s+OPTION\s*:\*\*\s*/i, '');
    body = body.replace(/^\*\*CONTRAST\s+WILDCARD\s*:\*\*\s*/i, '');
    body = stripSealedProductPrefix(body, products, card, categoryFocus);
    return extractUsableGatewayBody(body, card);
  }

  /**
   * Rewrite gateway prose so each slot header and lead product matches runtime-sealed cards.
   * Gateway sensory copy is kept only when it does not drift to foreign catalog brands.
   */
  function bindProseToSealedSlots(gatewayProse, sealedCards, opts) {
    var PP = _PP();
    var o = opts || {};
    var cards = (sealedCards || []).slice(0, 3);
    if (!cards.length) return String(gatewayProse || '').trim();

    var parsed = PP && typeof PP.parseFlightSlotProse === 'function'
      ? PP.parseFlightSlotProse(gatewayProse || '')
      : { best: '', refined: '', wildcard: '' };
    if (!parsed.best && !parsed.refined && !parsed.wildcard && gatewayProse) {
      parsed.best = String(gatewayProse).trim();
    }
    var sections = [];
    var bestCard = cards[0];

    for (var i = 0; i < cards.length; i += 1) {
      var card = cards[i];
      var slotKey = SLOT_KEYS[i] || 'best';
      var header = SLOT_HEADER_LABELS[i] || ('SLOT ' + (i + 1));
      var products = primaryProductsForCard(card, o.categoryFocus);
      var gwBody = cleanGatewaySlotBody(parsed[slotKey], card, o.categoryFocus);
      var body = gwBody || runtimeSlotBody(card, slotKey, bestCard);
      if (slotKey === 'wildcard' && String(body).length < 48) {
        body = buildWildcardContrastFallback(card, bestCard);
      }
      body = stripSealedProductPrefix(body, products, card, o.categoryFocus);
      var block = '**' + header + ':** ' + products;
      if (body) block += '\n\n' + body;
      sections.push(block);
    }
    var joined = sections.join('\n\n').trim();
    return PP && typeof PP.stripCatalogSchemaFromProse === 'function'
      ? PP.stripCatalogSchemaFromProse(joined)
      : joined;
  }

  // -- Pure detectors -------------------------------------------------------

  /** Returns true when text contains emoji characters (Unicode 1F300–1FAFF). */
  function hasEmoji(text) {
    return /[\u{1F300}-\u{1FAFF}]/u.test(String(text || ''));
  }

  // -- Core governance pipeline ---------------------------------------------

  /**
   * Strip forbidden structures, remove drift and listicle scaffolding,
   * replace AI buzzwords, and enforce profile word/sentence limits.
   *
   * Gateway layer owns narration; this function enforces that the narration
   * cannot inadvertently carry recommendation authority (via stripStructuredRecoBlocks).
   */
  function governGeneratedProse(rawText, profileKey, opts) {
    const PP = _PP();
    if (!PP) return (rawText || '').trim();
    const o = opts || {};
    const profile = PROSE_GOVERNANCE_LIMITS[profileKey] || PROSE_GOVERNANCE_LIMITS.prose;
    let text = PP.stripStructuredRecoBlocks(rawText);
    text = PP.removeAssistantDrift(text);
    text = PP.removeListicleScaffolding(text);
    text = PP.normalizeSentenceSpacing(text);
    if (PP.normalizeSommelierTemplate && PP.hasSommelierTemplateLabels(text)) {
      text = PP.normalizeSommelierTemplate(text);
    }
    text = text.replace(/\b(robust|elevated|curated|bespoke|premium experience|unlock|delve|journey)\b/gi, function (m) {
      const map = {
        robust: 'steady',
        elevated: 'polished',
        curated: 'chosen',
        bespoke: 'specific',
        'premium experience': 'good evening',
        unlock: 'open',
        delve: 'go',
        journey: 'evening'
      };
      return map[m.toLowerCase()] || m;
    });
    // Luxury-safe pricing language — swap disqualifying adjectives
    text = text.replace(/\b(cheap|cheaply)\b/gi, 'approachable');
    text = text.replace(/\b(inexpensive)\b/gi, 'value-forward');
    text = text.replace(/\baffordable\b/gi, 'approachable');
    text = text.replace(/\bbudget[\s-]friendly\b/gi, 'value-forward');
    text = text.replace(/\bbudget\s+(pick|option|choice|cigar|spirit|pour)\b/gi, 'value pick');
    text = text.replace(/\b(expensive|pricey)\b/gi, 'premium');
    text = PP.limitSentenceCount(text, profile.sentences);
    text = PP.limitWordCount(text, profile.words);
    if (PP.normalizeSommelierTemplate && PP.hasSommelierTemplateLabels(text)) {
      text = PP.normalizeSommelierTemplate(text);
    }
    text = PP.normalizeSentenceSpacing(text).replace(/\n{3,}/g, '\n\n').trim();
    if (o.bindSealedSlots && o.sealedCards && o.sealedCards.length >= 2) {
      return bindProseToSealedSlots(text, o.sealedCards, o);
    }
    if (o.sealedCards && o.sealedCards.length) {
      text = anchorProseToSealedCards(text, o.sealedCards);
    }
    return text;
  }

  // -- Expertise prose validator --------------------------------------------

  /**
   * Apply expertise-profile governance to rawText.
   * Used by all expertise, confidence-boundary, and contextual prose builders.
   */
  function validateExpertiseProse(rawText) {
    const PP = _PP();
    let text = governGeneratedProse(PP ? PP.humanizePresentationProse(rawText || '') : (rawText || ''), 'expertise');
    text = text.replace(/\n{3,}/g, '\n\n').trim();
    return text;
  }

  // -- Competing-recommendation signal check --------------------------------

  /**
   * Returns true when modelProse appears to contain a competing recommendation
   * assertion that would conflict with the card authority from RecommendationRuntime.
   * Delegates to SR for the actual heuristic — this wrapper keeps the call site
   * inside the governance layer where it belongs.
   */
  function containsCompetingRecommendationSignal(text, card) {
    const SR = _SR();
    return SR ? SR.containsCompetingRecommendationSignal(text, card) : false;
  }

  // -- Public API -----------------------------------------------------------

  global.SterlonGatewayProse = {
    // Constant (read-only reference)
    PROSE_GOVERNANCE_LIMITS:             PROSE_GOVERNANCE_LIMITS,
    PROSE_BRAND_DRIFT_TRANSITION:        PROSE_BRAND_DRIFT_TRANSITION,

    // Detectors
    hasEmoji:                            hasEmoji,
    hasForeignBrandDrift:                hasForeignBrandDrift,

    // Core governance
    governGeneratedProse:                governGeneratedProse,
    anchorProseToSealedCards:            anchorProseToSealedCards,
    bindProseToSealedSlots:              bindProseToSealedSlots,
    buildWildcardContrastFallback:       buildWildcardContrastFallback,
    validateExpertiseProse:              validateExpertiseProse,
    containsCompetingRecommendationSignal: containsCompetingRecommendationSignal
  };

})(typeof window !== 'undefined' ? window : global);
