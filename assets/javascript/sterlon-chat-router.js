/**
 * sterlon-chat-router.js — pure routing & intent classification.
 *
 * Routing may decide WHICH runtime flow executes, but may never create
 * recommendation authority itself.
 *
 * Invariants:
 *   - no sessionRuntime reads or writes
 *   - no PairingEngine calls
 *   - no DOM manipulation
 *   - no gateway calls
 *   - pure text → classification functions only
 *
 * Architecture: docs/internal/STERLON_RECOMMENDATION_EXTRACTION.md
 *
 * External dependencies resolved lazily at call time (never at module init):
 *   window.SterlonRecommendations  — matchMenuProductInText catalog lookup
 *   window.SterlonProductMatch     — matchOffMenuProductInText, inferCategoryBias
 *   window.SterlonPresentationOverlays — PRODUCT_EXPERTISE for getExpertiseNarrative
 *   window.MenuFlavorCatalog       — getExpertiseByName override
 *   window.WhiskeyJourney          — isJourneyIntent topic/level detection
 *   window.SterlonFlavorMatch      — inferCategoryFocus / resolveFlavorRoute
 *   window.LoungeProducts          — detectBrandHint catalog validation
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Routing constants
  // ---------------------------------------------------------------------------

  /** Expertise sub-branch enum — subject stays the pour/cigar; no recommendation re-render. */
  const ExpertiseBranch = {
    PRODUCT:    'product',
    AWARDS:     'awards',
    SPEC:       'spec',
    JOURNEY:    'journey',
    CONTEXTUAL: 'contextual',
    SENSORY:    'sensory',
    COMPARATIVE:'comparative',
    CONFIDENCE: 'confidence'
  };

  /** Pattern that identifies peated/smoky products by name. */
  const PEATED_POUR_PATTERN = /\b(islay|peated|peat|smoky)\b/i;

  /** Internal regex used by classifyExpertiseBranch to allow expertise even on recall turns. */
  function expertiseRecallException(text) {
    return /\b(tell me more|taste like|special about|what makes|why do people|finish like|describe|explain|after dinner|acquired taste|smoke linger|smoother than|softer than)\b/.test(text || '');
  }

  // ---------------------------------------------------------------------------
  // Lazy external-module accessors
  // ---------------------------------------------------------------------------

  function _SR()  { return (typeof window !== 'undefined') ? window.SterlonRecommendations : null; }
  function _SP()  { return (typeof window !== 'undefined') ? window.SterlonPresentationOverlays : null; }
  function _WJ()  { return (typeof window !== 'undefined') ? window.WhiskeyJourney : null; }
  function _SFM() { return (typeof window !== 'undefined') ? window.SterlonFlavorMatch : null; }
  function _LP()  { return (typeof window !== 'undefined') ? window.LoungeProducts : null; }
  function _MFC() {
    return (typeof window !== 'undefined' && typeof window.MenuFlavorCatalog !== 'undefined')
      ? window.MenuFlavorCatalog : null;
  }

  // ---------------------------------------------------------------------------
  // 1. Evening dimension detectors
  // ---------------------------------------------------------------------------

  function detectEveningOccasion(text) {
    const t = (text || '').toLowerCase();
    if (/\b(second (whiskey|whisky|pour)|another (whiskey|whisky|pour)|next pour)\b/.test(t)) return 'secondPour';
    if (/\b(first cigar|opening cigar|start with a cigar)\b/.test(t)) return 'firstCigar';
    if (/\b(after dinner|after the meal|post-?dinner|dessert)\b/.test(t)) return 'afterDinner';
    if (/\b(outside|outdoors|patio|terrace|balcony|porch)\b/.test(t)) return 'outdoor';
    if (/\b(long conversation|talking for hours|slow conversation)\b/.test(t)) return 'longConversation';
    if (/\b(end of the night|last pour|nightcap|wind down the night)\b/.test(t)) return 'endOfNight';
    if (/\b(late.?night|late night)\b/.test(t)) return 'lateNight';
    if (/\b(rainy night|rain tonight|storm outside)\b/.test(t)) return 'rainyNight';
    if (/\b(summer evening|warm night outside)\b/.test(t)) return 'summerEvening';
    if (/\b(slow meal|long dinner|multi-?course)\b/.test(t)) return 'slowMeal';
    if (/\b(friends over|guests over|having people over|hosting|dinner party)\b/.test(t)) return 'hosting';
    if (/\b(relaxed weekend|slow weekend|lazy evening)\b/.test(t)) return 'relaxedWeekend';
    if (/\b(solo|by myself|alone tonight|just me)\b/.test(t)) return 'solo';
    if (/\b(celebrat|anniversary|birthday|toast|mark the night)\b/.test(t)) return 'celebratory';
    return null;
  }

  function detectEveningRhythm(text) {
    const t = (text || '').toLowerCase();
    if (/\b(second (whiskey|whisky|pour)|another (whiskey|whisky))\b/.test(t)) return 'secondWhiskey';
    if (/\b(second cigar|another cigar|follow-?up cigar)\b/.test(t)) return 'secondCigar';
    if (/\b(won'?t|will not|doesn'?t)\s+exhaust\b|\bwear me out\b|\btoo demanding\b|\btoo much to sit with\b/.test(t)) {
      return 'wontExhaust';
    }
    if (/\b(opens? slowly|slow opener|unfurl|opens? up over time)\b/.test(t)) return 'opensSlowly';
    if (/\b(stays? dry|dry finish|not sweet|less sweet)\b/.test(t)) return 'staysDry';
    if (/\b(lingers?|long finish|hangs on)\b/.test(t) && !/\bsmoke linger\b/.test(t)) return 'lingers';
    if (/\b(easier to sit with|easy to sit with|sit with longer|low maintenance)\b/.test(t)) return 'easyToSitWith';
    if (/\b(quieter|more quiet|lower energy|less intense)\b/.test(t) && !/\b(recommend|give me)\b/.test(t)) return 'quieter';
    return null;
  }

  function detectEveningSocial(text) {
    const t = (text || '').toLowerCase();
    if (/\b(friends over|guests over|having friends).*\b(don'?t|do not|usually|never|rarely|not often)\s+(smoke|smoking)\b/.test(t)) {
      return 'friendsNewToCigars';
    }
    if (/\b(new to cigars?|never smoked|don'?t usually smoke|beginner|introducing.*cigar)\b/.test(t)) {
      return 'friendsNewToCigars';
    }
    if (/\b(conversation.?friendly|easy to talk over|won'?t overpower the table|not overpower)\b/.test(t)) {
      return 'conversationFriendly';
    }
    if (/\b(shared bottle|pass the bottle|table pour|group pour)\b/.test(t)) return 'sharedBottle';
    if (/\b(group|friends|guests|table of|dinner party)\b/.test(t) && /\b(celebrat|toast|birthday)\b/.test(t)) {
      return 'groupCelebration';
    }
    if (/\b(slow dinner|long dinner|pacing the meal)\b/.test(t)) return 'slowDinner';
    if (/\b(beginner.?friendly|gateway|approachable luxury|easy luxury)\b/.test(t)) return 'beginnerLuxury';
    if (/\b(friends over|guests over|hosting|having people over)\b/.test(t)) return 'hosting';
    return null;
  }

  function detectEveningAtmosphere(text) {
    const t = (text || '').toLowerCase();
    if (/\b(outside at night|outdoor(s)? (at )?night|patio at night|better outside)\b/.test(t)) {
      return 'outdoorNight';
    }
    if (/\b(dry evening|stays dry|dry night)\b/.test(t)) return 'dryEvening';
    if (/\b(sweet evening|sweeter night|dessert energy)\b/.test(t)) return 'sweetEvening';
    return null;
  }

  function detectEveningDimensions(text) {
    return {
      occasion:   detectEveningOccasion(text),
      rhythm:     detectEveningRhythm(text),
      social:     detectEveningSocial(text),
      atmosphere: detectEveningAtmosphere(text)
    };
  }

  function detectEveningMood(text) {
    const t = (text || '').toLowerCase();
    if (/\b(stress|stressful|rough day|long day|long week|rough week|exhausting week|draining day|tiring day|rough night|stressful week|exhausted|drained|need to unwind|decompress)\b/.test(t)) {
      return 'decompress';
    }
    if (/\b(celebrat\w*|anniversary|birthday|toast|special occasion|big night|closed the deal|earned it|big win)\b/.test(t)) {
      return 'celebratory';
    }
    if (/\b(hosting|friends over|guests|dinner party|table of)\b/.test(t)) {
      return 'hosting';
    }
    if (/\b(solo|by myself|alone tonight|just me)\b/.test(t)) {
      return 'solo';
    }
    if (/\b(quiet evening|reflective|contemplat|slow night|unhurried|low-?key tonight|quiet night)\b/.test(t)) {
      return 'reflective';
    }
    if (/\b(slower|calmer|softer mood|easy night|take it slow|wind down|slow down|need to slow)\b/.test(t)) {
      return 'calm';
    }
    return null;
  }

  function isEveningExperienceRecommendationRequest(text) {
    const t = (text || '').toLowerCase();
    return /\b(what would you pour|what should i pour|something better outside|better outside)\b/.test(t) ||
      /\b(second (whiskey|whisky|pour)|another (whiskey|whisky|pour))\b/.test(t) ||
      /\b(won'?t|will not|doesn'?t)\s+exhaust\b|\btoo much to sit with\b/.test(t) ||
      /\b(having friends over|friends over).*\b(don'?t|do not|usually|never|rarely)\s+(smoke|smoking)\b/.test(t) ||
      /\b(opens? slowly|easier to sit with|conversation.?friendly)\b/.test(t);
  }

  // ---------------------------------------------------------------------------
  // 2. Commitment signal detectors
  // ---------------------------------------------------------------------------

  function hasRecommendationCommitmentVerbs(text) {
    const t = (text || '').toLowerCase();
    return /\b(give me|show me|recommend|suggest|find me|pick me|set me up|pour me|get me a|i want a|pairing flight|flight tonight|set the table|build me|build a)\b/.test(t) ||
      /\b(give me a|give me the)\s+(bold|peated|smooth|bourbon|whiskey|whisky|cigar|pour)\b/.test(t) ||
      /\b(i want|i'd like|want something)\s+(a\s+)?(bold|smooth|peated|slower|softer|bourbon|whiskey|whisky|cigar|pour)\b/.test(t);
  }

  function isRevealExplorationIntent(text) {
    return /\b(another direction|other direction|other options|what else would you|show me alternatives|want another)\b/i.test(text || '');
  }

  // ---------------------------------------------------------------------------
  // 3. Product name matchers
  // ---------------------------------------------------------------------------

  function _SPM() { return (typeof window !== 'undefined') ? window.SterlonProductMatch : null; }

  function matchOffMenuProductInText(text) {
    const SPM = _SPM();
    if (SPM && typeof SPM.matchOffMenuProductInText === 'function') {
      return SPM.matchOffMenuProductInText(text);
    }
    const t = (text || '').toLowerCase();
    if (/\bchivas\b/.test(t)) return { name: 'Chivas 18', category: 'spirit' };
    if (/\bhibiki\s*(21|30)\b/.test(t)) return { name: 'Hibiki 30', category: 'spirit' };
    if (/\bjohnnie walker blue\b|\bblue label\b/.test(t)) return { name: 'Johnnie Walker Blue', category: 'spirit' };
    if (/\bcrown royal\b/.test(t)) return { name: 'Crown Royal', category: 'spirit' };
    return null;
  }

  function matchOffMenuCigarInText(text) {
    const SPM = _SPM();
    if (SPM && typeof SPM.matchOffMenuCigarInText === 'function') {
      return SPM.matchOffMenuCigarInText(text);
    }
    const t = (text || '').toLowerCase();
    if (/\bla gloria\b|\bgloria cubana\b/.test(t)) {
      return { name: /\bestel[i?]\b/.test(t) ? 'La Gloria Cubana Estel\u00ed' : 'La Gloria Cubana', category: 'cigar' };
    }
    if (/\bmontecristo\b/.test(t)) return { name: 'Montecristo', category: 'cigar' };
    if (/\bromeo y julieta\b|\bryj\b/.test(t)) return { name: 'Romeo y Julieta', category: 'cigar' };
    if (/\bpartagas\b/.test(t)) return { name: 'Partag\u00e1s', category: 'cigar' };
    return null;
  }

  function matchMenuProductInText(text) {
    const SR = _SR();
    if (SR && typeof SR.matchMenuProductInText === 'function') {
      return SR.matchMenuProductInText(text);
    }
    const t = (text || '').toLowerCase();
    const catalog = [];
    if (SR) {
      var spiritNames = typeof SR.getMenuSpirits === 'function' ? SR.getMenuSpirits() : (SR.MENU_SPIRITS || []);
      var cigarNames = typeof SR.getMenuCigars === 'function' ? SR.getMenuCigars() : (SR.MENU_CIGARS || []);
      spiritNames.forEach(function (name) { catalog.push({ name: name, category: 'spirit' }); });
      cigarNames.forEach(function (name) { catalog.push({ name: name, category: 'cigar' }); });
    }
    catalog.sort(function (a, b) { return b.name.length - a.name.length; });
    for (var i = 0; i < catalog.length; i++) {
      if (t.indexOf(catalog[i].name.toLowerCase()) !== -1) return catalog[i];
    }
    return null;
  }

  function resolveMentionedCigar(text) {
    const off = matchOffMenuCigarInText(text);
    if (off) return off;
    const named = matchMenuProductInText(text);
    if (named && named.category === 'cigar') return named;
    return null;
  }

  /**
   * Extract a brand keyword from member text that maps to a spirit family in the catalog.
   * Returns a lowercase fragment suitable for `spirit.name.toLowerCase().includes(hint)`,
   * or null when no known brand is detected.
   */
  function detectBrandHint(text) {
    const t = (text || '').toLowerCase();
    const LP = _LP();
    const BRAND_KEYS = [
      'buffalo trace', 'woodford', 'eagle rare', 'four roses', 'weller',
      "blanton's", 'blantons', 'old forester', 'whistlepig', 'whistle pig',
      'sazerac', 'macallan', 'lagavulin', 'glenfiddich', 'johnnie walker',
      'hibiki', 'yamazaki', 'diplomatico', 'zacapa', 'hennessy',
      'r\u00e9my martin', 'remy martin', 'clase azul', 'don julio', 'pappy'
    ];
    for (var i = 0; i < BRAND_KEYS.length; i++) {
      if (t.indexOf(BRAND_KEYS[i]) !== -1) {
        const key = BRAND_KEYS[i];
        if (!LP) return key;
        const spirits = LP.spirits || [];
        const hit = spirits.find(function (s) {
          return s.name.toLowerCase().indexOf(key) !== -1;
        });
        return hit ? key : null;
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // 4. Pairing and curiosity intents
  // ---------------------------------------------------------------------------

  function isCigarAnchoredPairingRequest(text) {
    const t = (text || '').toLowerCase().trim();
    if (!t || isHesitantOpenerIntent(text)) return false;
    if (!resolveMentionedCigar(text)) return false;
    if (/\b(tell me about|tell me more about|what makes|taste like|have you ever had)\b/.test(t) &&
        !/\b(pairs?|pair|goes with|what\s+(spirit|whisky|whiskey|bourbon|scotch|pour))\b/.test(t)) {
      return false;
    }
    return /\b(what|which)\s+.+\b(pairs?|pair|goes|work)s?\s+(well\s+)?with\b/.test(t) ||
      /\b(pairs?|pair)\s+(well\s+)?with\b/.test(t) ||
      /\bwhat\s+(spirit|whisky|whiskey|bourbon|scotch|pour)\s+.+\bwith\b/.test(t) ||
      /\bwhat\s+(goes|works)\s+with\b/.test(t) ||
      /\bwhat\s+to\s+pair\s+with\b/.test(t);
  }

  function isHesitantOpenerIntent(text) {
    const t = (text || '').toLowerCase().trim();
    if (!t || hasRecommendationCommitmentVerbs(text)) return false;
    if (isEveningExperienceRecommendationRequest(text)) return false;
    if (/\b(not sure|not too sure|honestly not sure|idk|i don'?t know|dont know yet|don'?t know yet|hard to say|no idea|haven'?t decided|just looking around|whatever feels right)\b/.test(t)) {
      return true;
    }
    if (/\b(tonight|this evening)\b/.test(t) && /\b(not sure|idk|don'?t know|maybe|honestly|whatever)\b/.test(t)) {
      return true;
    }
    if (/\b(maybe|kinda|sort of)\b/.test(t) && !/\b(give me|recommend|suggest|show me)\b/.test(t)) {
      return true;
    }
    return false;
  }

  function isExperienceCuriosityIntent(text) {
    if (hasRecommendationCommitmentVerbs(text)) return false;
    return /\b(have you (ever )?had|ever tried|did you (ever )?try|have you tried)\b/.test(text || '') &&
      !!(matchOffMenuProductInText(text) || matchMenuProductInText(text));
  }

  function isOpinionCuriosityIntent(text) {
    if (hasRecommendationCommitmentVerbs(text)) return false;
    return /\b(what do you think|how is|how'?s|worth it|your take|opinion on|familiar with|heard good things|worth the hype|opinions on|any good|is it good)\b/.test(text || '') &&
      !!(matchOffMenuProductInText(text) || matchMenuProductInText(text));
  }

  function getExpertiseNarrative(name) {
    const MFC = _MFC();
    if (MFC && MFC.getExpertiseByName) {
      const ex = MFC.getExpertiseByName(name);
      if (ex) return ex;
    }
    const PK = typeof window !== 'undefined' ? window.ProductKnowledge : null;
    if (PK && typeof PK.getProductTeachingBrief === 'function') {
      const brief = PK.getProductTeachingBrief(name);
      if (brief) {
        return { paragraphs: brief.split(/\n\n+/).filter(Boolean) };
      }
    }
    const SP = _SP();
    return (SP && SP.PRODUCT_EXPERTISE && SP.PRODUCT_EXPERTISE[name]) || null;
  }

  function hasProductTeachingDepth(name) {
    if (getExpertiseNarrative(name)) return true;
    const PK = typeof window !== 'undefined' ? window.ProductKnowledge : null;
    if (PK && typeof PK.getProductTeachingBrief === 'function') {
      return !!PK.getProductTeachingBrief(name);
    }
    return false;
  }

  function isConfidenceBoundaryIntent(text) {
    if (hasRecommendationCommitmentVerbs(text)) return false;
    if (isCigarAnchoredPairingRequest(text)) return false;
    if (isExperienceCuriosityIntent(text)) {
      return !!matchOffMenuProductInText(text);
    }
    if (isOpinionCuriosityIntent(text)) {
      if (matchOffMenuProductInText(text)) return true;
      const named = matchMenuProductInText(text);
      if (named && !hasProductTeachingDepth(named.name)) return true;
    }
    const t = (text || '').toLowerCase().trim();
    if (/\btell me about\b/.test(t)) {
      if (matchOffMenuCigarInText(text) || matchOffMenuProductInText(text)) return true;
      const named = matchMenuProductInText(text);
      if (named && !hasProductTeachingDepth(named.name)) return true;
    }
    if (!/\b(what do you think|how is|how'?s|worth it|your take|opinion on|familiar with|ever tried|have you had)\b/.test(t)) {
      return false;
    }
    if (matchOffMenuProductInText(text)) return true;
    const named = matchMenuProductInText(text);
    if (named && !hasProductTeachingDepth(named.name)) return true;
    return false;
  }

  // ---------------------------------------------------------------------------
  // 5. Expertise branch classifiers
  // ---------------------------------------------------------------------------

  function isExplicitExpertiseToRecommendationTransition(text) {
    const t = (text || '').toLowerCase().trim();
    if (!/\b(show me|give me|recommend|suggest|find me|pick me|set me up with)\b/.test(t)) return false;
    return /\b(smoother|softer|lighter|milder|option|alternative|flight|pour|pick|then)\b/.test(t);
  }

  function isComparativeCuriosityIntent(text) {
    const t = (text || '').toLowerCase().trim();
    if (isExplicitExpertiseToRecommendationTransition(text)) return false;
    return /\bwhat(?:'s|s| is)\s+.+\b(smoother|softer|lighter|milder|warmer|rounder|more elegant|less aggressive|less intense|less smoky|less peat|more cigar.?forward)\s+than\b/.test(t) ||
      /\b(smoother|softer|lighter|milder|warmer|rounder|more elegant|less aggressive|less intense|less smoky|less peat|more cigar.?forward)\s+than\b/.test(t) ||
      /\bwhat(?:'s|s| is)\s+closer to\b/.test(t) ||
      /\bcloser to\b.+\bbut\s+(richer|fuller|sweeter|stronger|warmer|rounder)\b/.test(t) ||
      /\banything\s+(softer|smoother|lighter|milder|warmer)\s+than\b/.test(t) ||
      /\b(rounder finish|more elegant pour|less peaty)\s+than\b/.test(t);
  }

  function isSensoryFollowupIntent(text) {
    const t = (text || '').toLowerCase().trim();
    return /\bdoes (the )?smoke (linger|hang|stay)\b/.test(t) ||
      /\bsmoke (linger|hang|stay)\b/.test(t) ||
      /\bis the finish\b/.test(t) ||
      /\b(finish|aftertaste)\s+(dry|sweet|long|short|clean|harsh)\b/.test(t) ||
      /\bdoes it get (sweeter|stronger|spicier|smokier)\b/.test(t) ||
      /\b(halfway|midway|second third|third third)\b/.test(t) ||
      /\bon the retrohale\b/.test(t) ||
      /\b(stay|linger|hang)\s+on the palate\b/.test(t) ||
      /\bhow long does (the )?smoke\b/.test(t);
  }

  function isContextualExpertiseIntent(text) {
    if (isEveningExperienceRecommendationRequest(text)) return false;
    if (hasRecommendationCommitmentVerbs(text)) return false;
    const t = (text || '').toLowerCase().trim();
    return /\bafter dinner\b/.test(t) ||
      /\bbefore dinner\b/.test(t) ||
      /\b(with|after)\s+dessert\b/.test(t) ||
      /\bacquired taste\b/.test(t) ||
      /\b(first cigar|first time smoking|new to cigars?|beginner)\b/.test(t) ||
      /\b(late.?night|late night)\s+(pour|whisky|whiskey|smoke|cigar)?\b/.test(t) ||
      /\b(long conversation|slow conversation|talking for hours)\b/.test(t) ||
      (/\b(outside|outdoors|patio)\b/.test(t) && /\b(would|work|right for|good for|too)\b/.test(t)) ||
      /\b(winter|summer|fall|spring)\s+(evening|whisky|whiskey|pour|spirit|cigar|smoke)\b/.test(t) ||
      /\b(casual|quiet|celebrat|special)\s+(night|evening|occasion)\b/.test(t) ||
      /\bwould (this|it|that|tonight'?s)\s+work\b/.test(t) ||
      /\bgood (for|after|before)\b/.test(t) ||
      /\bright for\b/.test(t) ||
      /\b(is|would).+\b(too heavy|too bold|too much|too smoky|too strong)\b/.test(t) ||
      /\b(too smoky|too strong)\s+for\b/.test(t) ||
      /\bmore of an?\s+(evening|after-dinner|late-night|winter|summer)\b/.test(t) ||
      /\bspecial occasion\b/.test(t) ||
      /\bcelebratory\b/.test(t) ||
      /\bsummer evening\b/.test(t) ||
      /\b(how\s+(bold|strong|full|intense|heavy|smooth|soft|mild)\s+(is|would|are))\b/.test(t) ||
      /\b(bold|strong|heavy|intense|full|smooth|soft|mild)\s+enough\b/.test(t) ||
      /\b(how\s+much\s+(smoke|body|strength|nicotine|pepper|spice))\b/.test(t) ||
      /\bis (it|this|that)\s+(appropriate|right|suitable|good)\s+for\b/.test(t);
  }

  // Non-recursive explicit-recommendation guard for isJourneyIntent.
  // Must NOT call hasExplicitRecommendationRequest (-> isExpertiseIntent -> classifyExpertiseBranch -> isJourneyIntent = cycle).
  function _isExplicitRecommendationForJourney(text) {
    const t = (text || '').toLowerCase();
    if (hasRecommendationCommitmentVerbs(text)) return true;
    if (/\b(recommend|suggest)\b/.test(t)) return true;
    if (/\b(pairing flight|best\b|wildcard|safe)\b/.test(t)) return true;
    if (isSpiritOnlyRequest(text) || isCigarOnlyRequest(text)) return true;
    if (/\b(under|over|less than|more than|around)\s+\$\d+/.test(t)) return true;
    // "Something from [brand]" or brand + flavor/journey context = recommendation, not expertise.
    if (/\bsomething\s+(from|in|with|like)\b/.test(t)) return true;
    if (/\b(woodford|buffalo trace|weller|four roses|elijah craig|wild turkey|knob creek|maker'?s mark|blanton'?s|pappy|macallan|lagavulin|yamazaki|hibiki)\b/.test(t) &&
        /\b(vanilla|caramel|honey|spice|peat|smoke|flavor|novice|intermediate|advanced|journey)\b/.test(t)) {
      return true;
    }
    return false;
  }

  function isJourneyIntent(text) {
    const WJ = _WJ();
    if (!WJ || !WJ.isJourneyTopic(text)) return false;
    if (_isExplicitRecommendationForJourney(text)) return false;
    const t = (text || '').toLowerCase().trim();
    if (/\b(whiskey journey|bourbon journey|what is the journey|journey level|where .+ (sit|fits|land) on the journey)\b/.test(t)) {
      return true;
    }
    return !!WJ.detectLevelFromPrompt(text);
  }

  function isSpecIntent(text) {
    const t = (text || '').toLowerCase().trim();
    if (
      !/\b(proof|abv|alcohol content|bottling strength|how strong|what strength|mash bill|mash|wheated|wheat recipe|straight bourbon|bottled in bond)\b/.test(t) &&
      !/\b(95\.6|47\.8)\b/.test(t)
    ) {
      return false;
    }
    if (/\b(recommend|suggest|pair|pour me|give me|flight|set (me |)up|what should i (try|drink|smoke))\b/.test(t)) {
      if (!/\b(what|which|tell me|how much|how high)\b[\s\S]{0,40}\b(proof|abv|mash|wheated|strength)\b/.test(t)) {
        return false;
      }
    }
    return true;
  }

  function isAwardsIntent(text) {
    const t = (text || '').toLowerCase().trim();
    if (!/\b(award|awards|medal|medals|trophy|trophies|competition|competitions|accolade|accolades|recognition|recognized|honors?|honoured|honored)\b/.test(t)) {
      if (!/\b(won|winning|took home|took gold|took silver)\b/.test(t)) return false;
    }
    if (/\b(recommend|suggest|pair|pour me|give me|flight|set (me |)up|what should i (try|drink|smoke))\b/.test(t)) {
      if (!/\b(what|which|tell me|list|how many)\b[\s\S]{0,40}\b(award|awards|medal|trophy|competition)\b/.test(t)) {
        return false;
      }
    }
    return true;
  }

  function isProductExpertiseIntent(text) {
    const t = (text || '').toLowerCase().trim();
    if (isExperienceCuriosityIntent(text) || isOpinionCuriosityIntent(text)) return false;
    if (isCigarAnchoredPairingRequest(text)) return false;
    if (/\btell me about\b/.test(t) && (resolveMentionedCigar(text) || matchMenuProductInText(text) || matchOffMenuProductInText(text))) {
      return true;
    }
    const curiosityPatterns = [
      /\btell me more about\b/,
      /\b(more about|more on)\s+(the\s+)?(whisky|whiskey|whisky pour|pour|cigar|spirit|smoke)\b/,
      /\bwhat(?:'s| is) special about\b/,
      /\bwhat does .+ taste like\b/,
      /\bwhy do people (love|like)\b/,
      /\bwhat makes\b/,
      /\bwhat makes .+ different\b/,
      /\bwhat makes .+ special\b/,
      /\bwhat(?:'s| is) the finish like\b/,
      /\bis .+ smok(y|ier|e)\b/,
      /\bhow (?:is|would you describe)\b/,
      /\bwhat(?:'s| is) .+ like\b/,
      /\bdescribe (the\s+)?(pour|cigar|whisky|whiskey|spirit)\b/,
      /\bexplain (the\s+)?(pour|cigar|whisky|whiskey|spirit)\b/,
      /\bcurious about\b/,
      /\bwhat should i know about\b/
    ];
    return curiosityPatterns.some(function (re) { return re.test(t); });
  }

  /** Master expertise dispatcher — returns ExpertiseBranch key or null. */
  function classifyExpertiseBranch(text) {
    const t = (text || '').toLowerCase().trim();
    if (!t) return null;
    if (hasRecommendationCommitmentVerbs(text)) return null;
    if (isCigarAnchoredPairingRequest(text)) return null;
    if (isEveningExperienceRecommendationRequest(text)) return null;
    if (isPivotIntent(text)) return null;
    if (isComparisonIntent(text)) return null;
    if (isEducationalComparisonIntent(text)) return ExpertiseBranch.CONTEXTUAL;
    if (isExplicitExpertiseToRecommendationTransition(text)) return null;
    if (/\b(give me a|give me the|pairing flight|what should i (try|smoke|drink)|flight tonight|set the table)\b/.test(t)) {
      return null;
    }
    if (/\b(recommend|suggest)\b/.test(t) && !/\b(why do people|what makes)\b/.test(t)) return null;
    if (isRecallIntent(text) && !expertiseRecallException(t)) return null;
    if (isRefinementIntent(text) && !isComparativeCuriosityIntent(text)) return null;

    if (isConfidenceBoundaryIntent(text)) return ExpertiseBranch.CONFIDENCE;
    if (isAwardsIntent(text)) return ExpertiseBranch.AWARDS;
    if (isSpecIntent(text)) return ExpertiseBranch.SPEC;
    if (isJourneyIntent(text)) return ExpertiseBranch.JOURNEY;
    if (isComparativeCuriosityIntent(text)) return ExpertiseBranch.COMPARATIVE;
    if (isSensoryFollowupIntent(text)) return ExpertiseBranch.SENSORY;
    if (isContextualExpertiseIntent(text)) return ExpertiseBranch.CONTEXTUAL;
    if (isProductExpertiseIntent(text)) return ExpertiseBranch.PRODUCT;
    return null;
  }

  function isExpertiseIntent(text) {
    return !!classifyExpertiseBranch(text);
  }

  // ---------------------------------------------------------------------------
  // 6. Continuity intents
  // ---------------------------------------------------------------------------

  function isPivotIntent(text) {
    const t = (text || '').toLowerCase();
    return /\b(something else|completely different|forget that|start over|new topic|different direction entirely|give me something else)\b/.test(t);
  }

  function isRecallIntent(text) {
    if (isEveningExperienceRecommendationRequest(text)) return false;
    if (hasRecommendationCommitmentVerbs(text)) return false;
    const t = (text || '').toLowerCase().trim();
    if (/\b(again|what was that|remind me|which one was|which one\b|which whiskey|which whisky|what whiskey|what whisky)\b/.test(t)) return true;
    if (/\b(that one|that whiskey|that whisky)\b/.test(t)) return true;
    if (/\bthe\s+(smoky|peat|peated|japanese|bourbon|sweet|smooth|bold)\s+one\b/.test(t)) return true;
    if (/\b(the\s+)?(first|second|third)\s+(whiskey|whisky|spirit|pour)\b/.test(t)) {
      if (/\b(for a|what would you pour|give me|recommend|suggest|hand me|set me up)\b/.test(t)) return false;
      return true;
    }
    if (/\b(the\s+)?wildcard\b/.test(t) && !/\b(best|safe)\b/.test(t) && !/\bwildcard\s+(pairing|flight|suggestion|pick)\b/.test(t)) {
      if (/\b(change|swap|adjust|dial|tweak|make)\b/.test(t)) return false;
      return true;
    }
    return false;
  }

  function isComparisonIntent(text) {
    if (isEducationalComparisonIntent(text)) return false;
    const t = (text || '').toLowerCase();
    if (/\b(side by side|side-by-side|between them|show me both|compare them|compare the (first|second|third))\b/.test(t)) {
      return true;
    }
    if (/\b(compare|comparison)\b/.test(t) && !/\b(explain|difference between|help me understand|walk me through)\b/.test(t)) {
      return true;
    }
    if (/\b(\bvs\b|versus)\b/.test(t)) {
      if (/\b(explain|difference|help me understand|walk me through|tell me how|how (?:does|do|would))\b/.test(t)) {
        return false;
      }
      if (/\b(pairing|pair|maduro|connecticut|wrapper|espresso|bourbon|cigar|whiskey|whisky)\b/.test(t)) {
        return false;
      }
      return true;
    }
    return false;
  }

  function isEducationalComparisonIntent(text) {
    const t = (text || '').toLowerCase().trim();
    if (!t) return false;
    if (hasRecommendationCommitmentVerbs(text)) return false;
    if (/\b(explain|what(?:'s| is) the difference|help me understand|walk me through|tell me how|how (?:does|do|would))\b/.test(t) &&
        (/\bdifference between\b/.test(t) || /\bversus\b/.test(t) || /\bvs\b/.test(t) || /\bcompared to\b/.test(t))) {
      return true;
    }
    return /\bhow (?:does|do|would) pairing\b/.test(t) && (/\bversus\b/.test(t) || /\bvs\b/.test(t));
  }

  function isClosingIntent(text) {
    const t = (text || '').toLowerCase();
    return /\b(heading home|heading out|calling it(?: a night)?|good night|goodnight|gotta go|gotta run|see you(?: later)?|take care|that'?s all|that'?ll do|save those|done for (the |)night|wrapping up|all set for tonight|that does it)\b/.test(t) ||
      /^(perfect|thanks|thank you|cheers|appreciate it|got it|noted)[.,!]?\s*$/i.test(t.trim());
  }

  var REFINEMENT_AXIS_LEGACY_RE = /\b(lighter|softer|smoother|soften|milder|less smoke|less intense|bolder|fuller|smokier|more smoke|richer|cleaner finish|clean finish|more adventurous|adventurous|under \$?\d+|swap the wildcard|more like the first|even lighter|even bolder|more contrast|contrasting|more interesting|something different|something unexpected|surprise me|less obvious|challenge me|switch it up|mix it up|change it up)\b/;

  function hasRefinementAxisSignal(t) {
    if (REFINEMENT_AXIS_LEGACY_RE.test(t)) return true;
    if (/\b(change|swap|adjust|dial|tweak|make)\s+(the\s+)?(wildcard|best|safe|refined|spirit|cigar|pour|smoke)\b/.test(t)) {
      return true;
    }
    if (/\b(less|more)\s+(black pepper|pepper|smoke|intensity|body)\b/.test(t)) return true;
    if (/\b(lighter|softer|milder|pale|dark)\b[^.]{0,40}\bwrapper\b/.test(t)) return true;
    if (/\bwrapper\b[^.]{0,40}\b(lighter|softer|milder|pale|dark)\b/.test(t)) return true;
    return false;
  }

  function hasRefinementTargetSignal(t) {
    return /\bwildcard\b/.test(t) ||
      /\brefined option\b/.test(t) ||
      /\bbest pick\b/.test(t) ||
      /\bvalue tier\b/.test(t) ||
      /\b(the\s+)?second\b/.test(t) ||
      /\bthe set\b/.test(t) ||
      /\bthe flight\b/.test(t);
  }

  function hasRefinementChangeVerb(t) {
    return /\b(change|swap|adjust|dial|tweak|make)\b/.test(t);
  }

  function isRefinementIntent(text) {
    const t = (text || '').toLowerCase().trim();
    if (hasRecommendationCommitmentVerbs(text)) return false;
    if (/\b(best|safe)\b/.test(t) && /\bwildcard\b/.test(t) && /\b(pairing|flight)\b/.test(t)) return false;
    if (isComparativeCuriosityIntent(text)) return false;
    if (/\bwhat(?:'s|s| is)\s+.*\bthan\b/.test(t)) return false;

    const axis = hasRefinementAxisSignal(t);
    const target = hasRefinementTargetSignal(t);
    const changeVerb = hasRefinementChangeVerb(t);

    if (axis && (target || changeVerb)) return true;
    if (axis && t.length <= 80) return true;
    if (t.length > 160 && !axis) return false;

    if (t === 'luxury' || t === "connoisseur's pick" || t === 'connoisseur') return true;
    return false;
  }

  function isShorthandContinuityMessage(text) {
    return isRecallIntent(text) || isComparisonIntent(text) || isRefinementIntent(text) || isPivotIntent(text);
  }

  // ---------------------------------------------------------------------------
  // 7. Top-level recommendation / greeting classifiers
  // ---------------------------------------------------------------------------

  function isPureGreeting(text) {
    const trimmed = (text || '').trim();
    if (!trimmed || hasExplicitRecommendationRequest(text)) return false;
    const t = trimmed.toLowerCase();
    if (/\b(recommend|pairing|best\b|cigar|whiskey|whisky|bourbon|smooth|bold)\b/.test(t)) return false;
    return /^(hi|hello|hey|yo|howdy|good\s+(morning|afternoon|evening))[!.,?\s]*$/i.test(t) ||
      /^good\s+(morning|afternoon|evening)[!.,?\s]*$/i.test(t);
  }

  function isDeferralPrompt(text) {
    if (isHesitantOpenerIntent(text)) return true;
    const t = (text || '').trim().toLowerCase();
    return /^(i )?(don'?t|do not) know( yet)?[.!?\s]*$/.test(t) ||
      /^not sure( yet)?[.!?\s]*$/.test(t) ||
      /^(i )?haven'?t decided[.!?\s]*$/.test(t) ||
      /^no idea( yet)?[.!?\s]*$/.test(t);
  }

  function isVagueRecommendationPrompt(text) {
    const t = (text || '').toLowerCase().trim();
    if (!t) return false;
    if (isExpertiseIntent(text)) return false;
    if (isDeferralPrompt(text)) return false;
    const vagueExact = [
      /^what do you recommend\??$/,
      /^what should i (try|get|order|drink|smoke)\??$/,
      /^help me (choose|pick|decide)\??$/,
      /^help me choose\??$/,
      /^something good(\s+tonight)?\??$/,
      /^something (for )?tonight\??$/,
      /^i need (some )?help( choosing)?\??$/
    ];
    if (vagueExact.some(function (re) { return re.test(t); })) return true;
    if (/^(what|help)\b/.test(t) && t.length < 42 && !/\b(best|pairing|cigar|whiskey|whisky|bourbon|japanese|ashton|vsg|padron|lagavulin|cohiba|opus|liga|pappy|hibiki|yamazaki|macallan|fortaleza)\b/.test(t)) {
      return true;
    }
    return false;
  }

  function hasExplicitRecommendationRequest(text) {
    const t = (text || '').toLowerCase();
    if (isExpertiseIntent(text)) return false;
    if (isHesitantOpenerIntent(text)) return false;
    if (isExperienceCuriosityIntent(text) || isOpinionCuriosityIntent(text)) return false;
    if (isVagueRecommendationPrompt(text)) return false;
    if (isCigarAnchoredPairingRequest(text)) return true;
    if (hasRecommendationCommitmentVerbs(text)) return true;
    if (/\b(recommend|suggest|pairing flight|best\b|wildcard|connoisseur|what should i (try|smoke|drink))\b/.test(t)) {
      return true;
    }
    if (/\b(pairs?|pair)\s+(well\s+)?with\b/.test(t) && resolveMentionedCigar(text)) return true;
    if (/\bwhat\s+(spirit|whisky|whiskey|bourbon|scotch|pour)\s+.+\bwith\b/.test(t) && resolveMentionedCigar(text)) {
      return true;
    }
    if (/\b(i want|i'd like)\s+(a\s+)?(bold|smooth|peated|slower|softer|bourbon|whiskey|whisky|cigar|pour)\b/.test(t)) {
      return true;
    }
    if (/\b(something|anything)\s+(smoky|smooth|bold|peated|with\s+smoke|slower|softer)\b/.test(t) && !/\b(maybe|not sure|idk|don'?t know)\b/.test(t)) {
      return true;
    }
    if (/\b(what would you pour|what should i pour|second (whiskey|whisky|pour)|better outside|won'?t exhaust)\b/.test(t)) {
      return true;
    }
    if (/\b(having friends over|friends over|guests over).*\b(don'?t|do not|usually|never|rarely)\s+(smoke|smoking)\b/.test(t)) {
      return true;
    }
    if (/\b(opens? slowly|easier to sit with|conversation.?friendly|after dinner pour)\b/.test(t)) {
      return true;
    }
    if (/\b(cigar|whiskey|whisky|bourbon|scotch|tequila|mezcal|japanese|yamazaki|pappy|padron|opus|liga|cohiba|peated|islay|agave|lagavulin|macallan|smooth|bold|luxury)\b/.test(t)) {
      // Require an explicit commitment signal — "tonight" or "pour" alone are too passive
      // and fire on intensity/contextual expertise questions ("Is the Cohiba bold for tonight?").
      return /\b(pairing|give me|want|looking for|in the mood for)\b/.test(t) &&
        t.split(/\s+/).filter(Boolean).length >= 5;
    }
    if (/\b(bourbon|whiskey|whisky|spirit|pour|rum|scotch)\b/.test(t) && !/\bcigar\b/.test(t)) {
      if (/\b(under\s*\$?\d+|journey|novice|intermediate|advanced|vanilla|caramel|woodford|buffalo trace|macallan|flavor family)\b/.test(t)) {
        return true;
      }
    }
    // Brand name + qualifier (flavor, journey, price) treated as spirit recommendation even without
    // explicit "bourbon/whiskey" in the text.
    if (/\b(woodford|buffalo trace|weller|four roses|elijah craig|wild turkey|jim beam|knob creek|maker'?s mark|macallan|lagavulin|yamazaki|hibiki|blanton'?s|pappy)\b/.test(t)) {
      if (/\b(under\s*\$?\d+|journey|novice|intermediate|advanced|vanilla|caramel|honey|spice|smoke|peat|flavor|something from|something like)\b/.test(t)) {
        return true;
      }
    }
    // "something from [spirit/brand/category]" without explicit commitment verb = still a recommendation ask.
    if (/\bsomething\s+(from|in|with|like)\b/.test(t) &&
        /\b(bourbon|whiskey|whisky|scotch|spirit|rum|tequila|mezcal|pour|woodford|buffalo trace|weller|four roses|elijah craig|wild turkey|knob creek|maker'?s|blanton|macallan|lagavulin|pappy|hibiki|yamazaki)\b/.test(t)) {
      return true;
    }
    if (/\bcigar\b/.test(t) && /\b(cocoa|espresso|maduro|connecticut|medium-full|pepper|cedar)\b/.test(t) && /\b(suggest|recommend|give me|want)\b/.test(t)) {
      return true;
    }
    return false;
  }

  function detectClarificationAxis(text) {
    const t = (text || '').toLowerCase();
    if (/what do you recommend|help me (choose|pick|decide)/.test(t)) return 'category';
    if (/something good|tonight|in the mood/.test(t)) return 'intensity';
    return 'category';
  }

  // ---------------------------------------------------------------------------
  // 8. Category classifiers
  // ---------------------------------------------------------------------------

  function isSpiritOnlyRequest(text) {
    const t = (text || '').toLowerCase();
    if (/\b(pairing|pair with|pairs with|full flight)\b/.test(t) && /\bcigar\b/.test(t)) return false;
    if (/\b(spirit only|pour only|whiskey only|whisky only|bourbon only|just (a |the )?(pour|spirit|whiskey|whisky|bourbon)|no cigar|without a cigar)\b/.test(t)) {
      return true;
    }
    if (/\b(cigar|smoke|smoking|padron|cohiba|liga|opus|ashton)\b/.test(t)) return false;
    return /\b(what should i drink|what pour|recommend a (bourbon|whiskey|whisky|spirit)|suggest a (bourbon|whiskey|whisky|spirit))\b/.test(t) &&
      /\b(whiskey|whisky|bourbon|scotch|spirit|pour|rum|tequila|cognac)\b/.test(t);
  }

  /** Member names an in-hand pour and asks for a cigar — pairing, not cigar-only. */
  function hasSpiritAnchoredCigarAsk(text) {
    const t = (text || '').toLowerCase();
    if (!/\bcigars?\b/.test(t)) return false;
    if (
      /\bwith my\b/.test(t) &&
      /\b(coffee|espresso|cappuccino|latte|cold brew)\b/.test(t) &&
      !/\b(whiskey|whisky|bourbon|scotch|spirit|pour|rum|tequila|cognac|wine|beer|cocktail)\b/.test(t)
    ) {
      return false;
    }
    if (
      /\b(drinking|sipping|having|pouring|i'?m on|with my|glass of|bottle of|already (have|got))\b/.test(
        t
      )
    ) {
      return true;
    }
    const SPM = typeof window !== 'undefined' ? window.SterlonProductMatch : null;
    if (SPM && typeof SPM.resolveNamedSpiritId === 'function' && SPM.resolveNamedSpiritId(text)) {
      return /\b(want|need|looking for|recommend|suggest|pair|go well|goes well|work with|works with|maduro|connecticut|wrapper)\b/.test(t);
    }
    return false;
  }

  function isCigarOnlyRequest(text) {
    const t = (text || '').toLowerCase();
    if (hasSpiritAnchoredCigarAsk(text)) return false;
    if (/\bpair(?:ing|)\b/.test(t) && /\bcigar\b/.test(t)) return false;
    if (
      /\bcigars?\b/.test(t) &&
      /\b(coffee|espresso|cappuccino|latte|cold brew)\b/.test(t) &&
      !/\b(whiskey|whisky|bourbon|scotch|spirit|pour|rum|tequila|cognac|wine|beer|cocktail)\b/.test(t)
    ) {
      return true;
    }
    if (/\b(pairing|pair with|pour|whiskey|whisky|bourbon|spirit)\b/.test(t) && !/\bcigar only\b/.test(t)) {
      return false;
    }
    if (/\b(cigar only|smoke only|just a cigar|recommend a cigar|suggest a cigar)\b/.test(t)) return true;
    if (/\b(whiskey|whisky|bourbon|spirit|pour)\b/.test(t)) return false;
    return /\b(recommend|suggest|give me|want)\b/.test(t) && /\bcigar\b/.test(t) && !/\b(pairing|pour)\b/.test(t);
  }

  function inferCategoryFocus(text) {
    const t = (text || '').toLowerCase();
    if (isSpiritOnlyRequest(text)) return 'spirit';
    if (hasSpiritAnchoredCigarAsk(text)) return 'pairing';
    if (isCigarOnlyRequest(text)) return 'cigar';
    if (/\b(go well|goes well|work with|works with|pair(?:ing|)?)\b/.test(t) && /\bcigar|padron|cohiba|liga|opus|ashton|montecristo\b/.test(t)) {
      const SPM = typeof window !== 'undefined' ? window.SterlonProductMatch : null;
      if (SPM && typeof SPM.resolveNamedSpiritId === 'function' && SPM.resolveNamedSpiritId(text)) return 'pairing';
    }
    if (/\bpair(?:ing|)\b/.test(t) && /\bcigar\b/.test(t)) return 'pairing';
    if (/\bcigar|padron|cohiba|liga|opus|ashton|montecristo\b/.test(t)) return 'cigar';
    const SFM = _SFM();
    if (SFM && SFM.resolveFlavorRoute && SFM.resolveFlavorRoute(text, { category: 'spirit' })) return 'spirit';
    if (/\bpairing|full flight\b/.test(t)) return 'pairing';
    if (/\bwhiskey|whisky|bourbon|scotch|spirit|pour|yamazaki|hibiki|pappy|lagavulin|macallan\b/.test(t)) {
      return 'spirit';
    }
    return undefined;
  }

  function inferCategoryBiasForFlavor(text) {
    const t = (text || '').toLowerCase();
    if (/\b(pair|pairs|pairing|goes with|works with|what to pair)\b/.test(t)) {
      const requested = inferRequestedCategoryFromText(text);
      if (requested) return requested;
    }
    const SFM = _SFM();
    const SPM = (typeof window !== 'undefined') ? window.SterlonProductMatch : null;
    if (SPM && typeof SPM.inferCategoryBias === 'function') {
      var spmBias = SPM.inferCategoryBias(text);
      if (spmBias) return spmBias;
    } else if (SFM && SFM.inferCategoryBias) {
      var sfmBias = SFM.inferCategoryBias(text);
      if (sfmBias) return sfmBias;
    }
    if (/\bcigar\b/.test(t) && !/\b(whisky|whiskey|bourbon|scotch|pour)\b/.test(t)) return 'cigar';
    if (/\b(whisky|whiskey|bourbon|scotch|pour|spirit)\b/.test(t)) return 'spirit';
    return 'spirit';
  }

  function inferRequestedCategoryFromText(text) {
    const t = (text || '').toLowerCase();
    if (/\b(what|which)\s+cigar\b/.test(t) || /\bcigar\s+(was\s+)?that\b/.test(t) || /\bwhat cigar was that\b/.test(t)) {
      return 'cigar';
    }
    if (/\b(that\s+)?cigar\b/.test(t) || /\bcigar\s+again\b/.test(t)) return 'cigar';
    if (/\b(that\s+)?(whiskey|whisky|pour)\b/.test(t)) return 'spirit';
    if (/\b(that\s+)?spirit\b/.test(t) && !/\bspirit\s+forward\b/.test(t)) return 'spirit';
    return null;
  }

  // ---------------------------------------------------------------------------
  // 9. Pure routing shape helpers
  // ---------------------------------------------------------------------------

  function normalizeRefineAxis(axis) {
    if (axis === 'softer') return 'lighter';
    return axis;
  }

  /** Map text to a SENSORY_PRELUDE_TEMPLATES key. */
  function pickContextualKey(text) {
    const t = (text || '').toLowerCase();
    if (/\btoo smoky\b|\btoo strong\b|\b(beginner|first cigar|first time smoking|new to cigars?)\b/.test(t)) {
      return 'tooHeavyForBeginner';
    }
    if (/\bfirst cigar\b|\bfirst time smoking\b/.test(t)) return 'firstCigar';
    if (/\bafter dinner\b|\bafter the meal\b/.test(t)) return 'afterDinner';
    if (/\blate.?night\b/.test(t)) return 'lateNight';
    if (/\b(long conversation|slow conversation|talking for hours)\b/.test(t)) return 'longConversation';
    if (/\b(outside|outdoors|patio|better outside)\b/.test(t)) return 'summerEvening';
    if (/\b(second (whiskey|whisky|pour)|another pour)\b/.test(t)) return 'lateNight';
    if (/\b(friends over|guests|hosting|new to cigars?)\b/.test(t)) return 'firstCigar';
    if (/\b(won'?t exhaust|wear me out|too demanding)\b/.test(t)) return 'casual';
    if (/\b(special occasion|celebratory)\b/.test(t)) return /\bcelebrat/.test(t) ? 'celebratory' : 'specialOccasion';
    if (/\bacquired taste\b/.test(t)) return 'acquiredTaste';
    if (/\bsummer evening\b|\bsummer\b/.test(t)) return 'summerEvening';
    if (/\bwinter\b/.test(t)) return 'winter';
    if (/\bcasual\b/.test(t)) return 'casual';
    if (/\bwould (this|it).+\bwork\b/.test(t)) return 'afterDinner';
    return 'afterDinner';
  }

  /** Map text to a sensory narrative key. */
  function pickSensoryKey(text) {
    const t = (text || '').toLowerCase();
    if (/\bsmoke (linger|hang|stay)\b|\bdoes (the )?smoke\b/.test(t)) return 'smokeLinger';
    if (/\bfinish\b|\baftertaste\b/.test(t)) return 'finishDry';
    if (/\b(sweeter|stronger|halfway|second third|evolution)\b/.test(t)) return 'evolution';
    return 'smokeLinger';
  }

  /** Map text to a comparative axis key used in buildComparativeCuriosityProse. */
  function pickComparativeAxis(text) {
    const t = (text || '').toLowerCase();
    if (/\b(less peat|less smoky|less smoke|less peaty)\b/.test(t)) return 'lessPeat';
    if (/\b(more elegant|elegant)\b/.test(t)) return 'moreElegant';
    if (/\b(warmer)\b/.test(t)) return 'warmer';
    if (/\b(rounder finish|rounder)\b/.test(t)) return 'rounder';
    if (/\b(cigar.?forward|more cigar)\b/.test(t)) return 'cigarForward';
    if (/\b(richer|fuller|stronger|bolder)\b/.test(t) && /\bcloser to\b/.test(t)) return 'richer';
    if (/\b(less aggressive|less intense)\b/.test(t)) return 'lessAggressive';
    return 'softer';
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  window.SterlonChatRouter = {
    // Constants
    ExpertiseBranch:                       ExpertiseBranch,
    PEATED_POUR_PATTERN:                   PEATED_POUR_PATTERN,

    // Evening dimension detectors
    detectEveningOccasion:                 detectEveningOccasion,
    detectEveningRhythm:                   detectEveningRhythm,
    detectEveningSocial:                   detectEveningSocial,
    detectEveningAtmosphere:               detectEveningAtmosphere,
    detectEveningDimensions:               detectEveningDimensions,
    detectEveningMood:                     detectEveningMood,
    isEveningExperienceRecommendationRequest: isEveningExperienceRecommendationRequest,

    // Commitment signal detectors
    hasRecommendationCommitmentVerbs:      hasRecommendationCommitmentVerbs,
    isRevealExplorationIntent:             isRevealExplorationIntent,

    // Product name matchers
    matchOffMenuProductInText:             matchOffMenuProductInText,
    matchOffMenuCigarInText:               matchOffMenuCigarInText,
    matchMenuProductInText:                matchMenuProductInText,
    resolveMentionedCigar:                 resolveMentionedCigar,
    detectBrandHint:                       detectBrandHint,

    // Pairing / curiosity intents
    isCigarAnchoredPairingRequest:         isCigarAnchoredPairingRequest,
    isHesitantOpenerIntent:                isHesitantOpenerIntent,
    isExperienceCuriosityIntent:           isExperienceCuriosityIntent,
    isOpinionCuriosityIntent:              isOpinionCuriosityIntent,
    getExpertiseNarrative:                 getExpertiseNarrative,
    isConfidenceBoundaryIntent:            isConfidenceBoundaryIntent,

    // Expertise branch classifiers
    isExplicitExpertiseToRecommendationTransition: isExplicitExpertiseToRecommendationTransition,
    isComparativeCuriosityIntent:          isComparativeCuriosityIntent,
    isSensoryFollowupIntent:               isSensoryFollowupIntent,
    isContextualExpertiseIntent:           isContextualExpertiseIntent,
    isJourneyIntent:                       isJourneyIntent,
    isSpecIntent:                          isSpecIntent,
    isAwardsIntent:                        isAwardsIntent,
    isProductExpertiseIntent:              isProductExpertiseIntent,
    classifyExpertiseBranch:               classifyExpertiseBranch,
    isExpertiseIntent:                     isExpertiseIntent,

    // Continuity intents
    isPivotIntent:                         isPivotIntent,
    isRecallIntent:                        isRecallIntent,
    isComparisonIntent:                    isComparisonIntent,
    isEducationalComparisonIntent:         isEducationalComparisonIntent,
    isClosingIntent:                       isClosingIntent,
    isRefinementIntent:                    isRefinementIntent,
    isShorthandContinuityMessage:          isShorthandContinuityMessage,

    // Top-level recommendation / greeting classifiers
    isPureGreeting:                        isPureGreeting,
    isDeferralPrompt:                      isDeferralPrompt,
    isVagueRecommendationPrompt:           isVagueRecommendationPrompt,
    hasExplicitRecommendationRequest:      hasExplicitRecommendationRequest,
    detectClarificationAxis:               detectClarificationAxis,

    // Category classifiers
    isSpiritOnlyRequest:                   isSpiritOnlyRequest,
    isCigarOnlyRequest:                    isCigarOnlyRequest,
    inferCategoryFocus:                    inferCategoryFocus,
    inferCategoryBiasForFlavor:            inferCategoryBiasForFlavor,
    inferRequestedCategoryFromText:        inferRequestedCategoryFromText,

    // Pure routing shape helpers
    normalizeRefineAxis:                   normalizeRefineAxis,
    pickContextualKey:                     pickContextualKey,
    pickSensoryKey:                        pickSensoryKey,
    pickComparativeAxis:                   pickComparativeAxis
  };

}());
