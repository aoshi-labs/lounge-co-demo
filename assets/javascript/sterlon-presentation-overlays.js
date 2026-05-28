/* ──────────────────────────────────────────────────────────────────────
   sterlon-presentation-overlays.js — Static presentation data for Sterlon.

   BOUNDARY CONTRACT
   May:   contain static copy, prose templates, overlay maps, timing
          constants, and presentational lookup tables.
   May NOT: create recommendations, mutate RecommendationTurn, assign
            products or scores, route orchestration, access PairingEngine,
            call RecommendationRuntime, or read session state.

   This module has zero function calls and zero runtime dependencies.
   It exposes its contents on window.SterlonPresentationOverlays so that
   sterlon-chat.js can reference them without polluting the global namespace.
   ────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  // ── Text repair ────────────────────────────────────────────────────

  var MOJIBAKE_REPAIR_PAIRS = [
    ['\u00e2\u20ac\u201d', '\u2014'], // — -> —
    ['\u00e2\u20ac\u201c', '\u2013'], // – -> –
    ['\u00e2\u20ac\u2122', '\u2019'], // ' -> '
    ['\u00e2\u20ac\u02dc', '\u2018'], // ' -> '
    ['\u00e2\u20ac\u0153', '\u201c'], // " -> "
    ['\u00e2\u20ac\u009d', '\u201d'], // " -> "
    ['\u00e2\u20ac\ufffd', '\u201d'], // " -> "
    ['\u00e2\u20ac\u00a6', '\u2026'], // … -> …
    ['\u00e2\u20ac\u00a2', '\u2022'], // • -> •
    ['\u00c2\u00b7', '\u00b7'],       // · -> ·
    ['\u00c2\u00a0', ' '],            // NBSP mojibake -> space
    ['\u00c3\u00a9', '\u00e9'],       // é -> é
    ['\u00c3\u00ad', '\u00ed'],       // í -> í
    ['\u00c3\u00a1', '\u00e1']        // á -> á
  ];

  // ── Off-menu guidance ──────────────────────────────────────────────

  var OFF_MENU_SPIRIT_GUIDANCE = {
    'Chivas 18': 'I have not spent enough quiet evenings with Chivas 18 on this table to guide you the way I would a bottle we pour every week. Stylistically it is a blended Scotch built for harmony — honey, orchard fruit, gentle oak — polite rather than dramatic. From tonight\'s menu, an approachable bourbon such as Buffalo Trace or Woodford Reserve is the honest parallel if you want that same easy sip.',
    'Johnnie Walker Blue': 'Blue Label is a reference pour more than a regular on our list — I would not pretend to know its current batch the way I know tonight\'s venue catalog. In spirit it is silk and smoke wrapped in blenders\' polish. For something equally composed on the menu tonight, a mid-tier Scotch such as Macallan 12 or Glenfiddich 12 is the honest style match.',
    'Crown Royal': 'Crown is not something we keep in rotation here, so I would lean on style, not memory — vanilla-forward, soft grain, easy finish. Maker\'s Mark or Buffalo Trace on tonight\'s list gives you that same unhurried sweetness from what we actually pour.',
    'Hibiki 30': 'I have not spent enough evenings with Hibiki 30 to guide someone confidently toward it yet, but stylistically it sits in a much more delicate and polished direction than the heavier pours we pour every week. Hibiki Harmony or Yamazaki 12 on tonight\'s menu is the honest gateway from what we stock.'
  };

  var OFF_MENU_CIGAR_GUIDANCE = {
    'La Gloria Cubana': 'La Gloria Cubana — especially the Estelí line — usually brings medium-full Nicaraguan body: cocoa, leather, cedar, and pepper that builds without turning syrupy. I do not keep every vitola on this rail every night, but that profile loves a pour with malt sweetness and dry spice beside it rather than something too pale or aggressively peated unless you want smoke on smoke.',
    'Montecristo': 'Montecristo reads classic Cuban-medium in spirit — cream, hay, gentle cocoa — even when the stick in your hand is from another origin. I would not quote a specific box from memory on this rail, but stylistically it wants an elegant, medium-bodied pour that does not bully the retrohale.'
  };

  // ── Mood and occasion overlay templates ────────────────────────────

  var MOOD_PRELUDE_OVERLAYS = {
    calm: {
      observation: 'Let it open slowly — there is no rush in the glass tonight.'
    },
    decompress: {
      paragraph: 'After a long day, this is the kind of pour that asks for quiet more than commentary — present beside the {{cigar}}, never demanding the room.',
      observation: 'Sip it slowly; the smoke and malt settle in as the evening unwinds.'
    },
    celebratory: {
      observation: 'Save a little room to notice how the finish lengthens — it is worth the pause.'
    },
    reflective: {
      observation: 'The pairing leaves space between draws — enough room to think without losing the thread.'
    },
    hosting: {
      observation: 'It holds attention without stealing it — easy to pour while the table keeps talking.'
    },
    solo: {
      observation: 'One glass, one chair — the flavors do the socializing for you.'
    }
  };

  /** Conversational breadth — occasion, rhythm, social energy, atmosphere (session-scoped). */
  var EVENING_DIMENSION_PRELUDE_OVERLAYS = {
    secondWhiskey: {
      paragraph: 'A second whiskey should change the cadence, not repeat the first act — still interesting beside the {{cigar}}, but with a softer conversational weight in the glass.',
      observation: 'Think texture and warmth more than drama; something you can return to while the room keeps talking.'
    },
    outdoorNight: {
      paragraph: 'Outside at night, the air cools everything down — this pour stays calm enough to notice without shouting over the evening.',
      observation: 'Dry finish, gentle warmth, enough presence beside the {{cigar}} that you feel the night without chasing flavor.'
    },
    friendsNewToCigars: {
      paragraph: 'For friends who rarely smoke, the pairing should feel welcoming — medium body, friendly flavor, nothing that asks for a lecture between puffs.',
      observation: 'Cream, cedar, and a clean finish keep the table at ease while the {{cigar}} does the introducing.'
    },
    wontExhaust: {
      paragraph: 'This is built for an evening you want to stay in — present beside the {{cigar}}, but with a rhythm that does not wear you down.',
      observation: 'Lower conversational weight in the glass; you can sip, set it down, and pick the thread back up without fatigue.'
    },
    longConversation: {
      paragraph: 'For a long conversation, the pairing should evolve slowly — the {{cigar}} and the pour give you something new to notice between stories.',
      observation: 'Lingering warmth without sharp edges; the kind of table rhythm that rewards patience.'
    },
    afterDinner: {
      paragraph: 'After the table clears, this is the kind of pairing that feels earned — richer beside the {{cigar}}, but still composed rather than heavy.',
      observation: 'Warm finish, quiet room presence; dessert energy without turning sweet.'
    },
    hosting: {
      paragraph: 'When you are hosting, the pour should hold the table without dominating it — enough character beside the {{cigar}} that guests notice, not compete.',
      observation: 'Shared-bottle energy: easy to pour again, easy to talk over, still feels considered.'
    },
    lateNight: {
      paragraph: 'Late in the evening, the room gets quieter — this pour has enough depth beside the {{cigar}} to feel intentional without asking for speed.',
      observation: 'Contemplative cadence; the finish lingers while the conversation thins out.'
    }
  };

  // ── Product expertise narratives ───────────────────────────────────
  // Fallback when MenuFlavorCatalog.getExpertiseByName is not loaded.
  // Each entry supplies paragraphs (per-paragraph delivery), a pairingBridge
  // sentence, and optional contextual/sensory/comparative sub-maps.

  /** Ontology / ProductKnowledge owns per-product teaching; no static hero narratives. */
  var PRODUCT_EXPERTISE = {};

  // ── Sensory prelude templates ──────────────────────────────────────
  // Per-deck templates — spoken, sensory, restrained. The {{cigar}}
  // placeholder is substituted at render time by fillPreludeTemplate.
  // Each entry is one sensory paragraph + one short observational line.

  var SENSORY_PRELUDE_TEMPLATES = {
    peated: {
      paragraph: "There's something magnetic about the smoke on this pour. It's deep and brooding, but controlled enough to sit beside the {{cigar}} without either one taking over.",
      observation: "Dark malt, a touch of dried fruit, that long maritime finish. The two settle in quietly."
    },
    bourbon: {
      paragraph: "This pour stays caramel- and oak-forward without turning sweet — full and patient beside the {{cigar}}, opening slowly as both settle in.",
      observation: "Wood and warmth carry the finish. Worth sipping slowly between draws."
    },
    japanese: {
      paragraph: "This one stays soft on the front and lets the {{cigar}} speak. Orchard fruit, a touch of hay, and a clean honey-citrus finish that resets between draws.",
      observation: "Refined without being thin. The pairing feels deliberate rather than loud."
    },
    agave: {
      paragraph: "The agave shows up dressed in oak here — vanilla, cinnamon, a quiet mineral edge underneath. Sits beside the {{cigar}} without losing the herbal pull it's known for.",
      observation: "A good after-dinner pour. The body matches the cigar without competing on the palate."
    },
    default: {
      paragraph: "This one sits comfortably across most evenings — body enough to stay present beside the {{cigar}}, but nothing so loud the conversation has to slow down.",
      observation: "Cedar, a touch of honey, a clean finish that resets between draws. An easy pour to settle into."
    }
  };

  // ── Lead prose pools ──────────────────────────────────────────────
  // Round-robin selection via pickFromPool (sterlon-chat.js) — keeps the
  // recommendation opener feeling varied without being random.

  var SPIRIT_LEAD_POOL = [
    'The pour is where I\'d anchor tonight.',
    'Start with the glass — everything else follows.',
    'My pick is the spirit first, then we build the smoke around it.',
    'Lead with the pour. The cigar comes second.',
    'The whisky is the move tonight.'
  ];

  var CIGAR_LEAD_POOL = [
    'Light that first. The pour follows.',
    'The smoke is the anchor here.',
    'Start with the cigar — let it open before anything else.',
    'My pick leads with the stick.',
    'The cigar sets the pace for the rest of the evening.'
  ];

  var PAIRING_LEAD_POOL = [
    'Here is how I\'d compose the table tonight.',
    'The pairing is the thing — let me set it up.',
    'A composed flight makes sense here.',
    'My pick is a full pairing — cigar, pour, and something to ground it.',
    'Let me put the whole table together.'
  ];

  var OPEN_LEAD_POOL = [
    'Here is where I\'d start.',
    'My pick — no hesitation.',
    'This is the move.',
    'Let me anchor the evening.',
    'One clear choice here.'
  ];

  // ── Unified card prose prefix templates ───────────────────────────
  // { pre, suf } pairs indexed by turnCount % 5 for round-robin rotation.

  var UNIFIED_SPIRIT_PREFIXES = [
    { pre: '', suf: ' — that\'s the anchor.' },
    { pre: 'Start with the', suf: '.' },
    { pre: 'My pick:', suf: '.' },
    { pre: 'The', suf: ' is the move tonight.' },
    { pre: 'I\'d pour the', suf: ' first.' }
  ];

  var UNIFIED_CIGAR_PREFIXES = [
    { pre: 'Light the', suf: ' first.' },
    { pre: 'The', suf: ' is where this starts.' },
    { pre: 'My pick —', suf: '.' },
    { pre: '', suf: ', right in your lane.' },
    { pre: 'I\'d hand you the', suf: '.' }
  ];

  var UNIFIED_OPEN_PREFIXES = [
    { pre: 'Here\'s the anchor —', suf: '.' },
    { pre: 'My pick:', suf: '.' },
    { pre: 'Start here:', suf: '.' },
    { pre: '', suf: ' — no hesitation.' },
    { pre: 'The pick is the', suf: '.' }
  ];

  // ── Streaming presentation profiles ───────────────────────────────
  // Timing constants per turn type. All values in milliseconds.

  var STREAM_PROFILES = {
    recommendation: {
      thinkMs: 160,
      leadPauseMs: 180,
      segmentPauseMs: 140,
      chunkWords: 5,
      wordMs: 54,
      // Post-prose beat before follow-up chips animate in.
      affordancePauseMs: 120,
      chipsPauseMs: 140,
      chipsStaggerMs: 50
    },
    recommendation_gateway: {
      thinkMs: 100,
      leadPauseMs: 0,
      segmentPauseMs: 0,
      chunkWords: 8,
      wordMs: 24,
      affordancePauseMs: 80,
      chipsPauseMs: 100,
      chipsStaggerMs: 28
    },
    refinement: {
      thinkMs: 140,
      leadPauseMs: 140,
      segmentPauseMs: 120,
      chunkWords: 5,
      wordMs: 44,
      affordancePauseMs: 0,
      chipsPauseMs: 120,
      chipsStaggerMs: 46
    },
    expertise: {
      thinkMs: 100,
      leadPauseMs: 100,
      segmentPauseMs: 100,
      chunkWords: 5,
      wordMs: 34,
      affordancePauseMs: 0,
      chipsPauseMs: 0,
      chipsStaggerMs: 0
    },
    comparison: {
      thinkMs: 160,
      leadPauseMs: 140,
      segmentPauseMs: 120,
      chunkWords: 4,
      wordMs: 40,
      affordancePauseMs: 0,
      chipsPauseMs: 0,
      chipsStaggerMs: 0
    },
    clarification: {
      thinkMs: 120,
      leadPauseMs: 100,
      segmentPauseMs: 100,
      chunkWords: 5,
      wordMs: 30,
      affordancePauseMs: 0,
      chipsPauseMs: 0,
      chipsStaggerMs: 0
    },
    prose: {
      thinkMs: 100,
      leadPauseMs: 80,
      segmentPauseMs: 80,
      chunkWords: 5,
      wordMs: 30,
      affordancePauseMs: 0,
      chipsPauseMs: 0,
      chipsStaggerMs: 0
    }
  };

  // ── Card illustration SVG ─────────────────────────────────────────
  // Tactile cigar illustration — body + band + faint embers + three smoke
  // wisps. Drawn with stroke-on-currentColor so it adapts to theme tokens.

  var RECO_CARD_ILLUSTRATION_SVG =
    '<svg class="sterlon-reco-illus-svg" viewBox="0 0 140 120" aria-hidden="true" focusable="false">' +
    '<path d="M16 64h78a6 6 0 0 1 6 6v0a6 6 0 0 1-6 6H16a4 4 0 0 1-4-4v-4a4 4 0 0 1 4-4Z" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
    '<path d="M94 64l14 2.5-14 7" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>' +
    '<path d="M104 67.5l4 -1 -2 4z" fill="currentColor" opacity=".55" stroke="none"/>' +
    '<path d="M32 64v12" fill="none" stroke="currentColor" stroke-width="1.1"/>' +
    '<path d="M40 64v12" fill="none" stroke="currentColor" stroke-width="1.1"/>' +
    '<path d="M32 67h8" fill="none" stroke="currentColor" stroke-width=".7" opacity=".6"/>' +
    '<path d="M32 73h8" fill="none" stroke="currentColor" stroke-width=".7" opacity=".6"/>' +
    '<path d="M22 70l60 0" fill="none" stroke="currentColor" stroke-width=".5" opacity=".25" stroke-dasharray="1.5 3"/>' +
    '<path d="M104 56c10 10 12 22 6 34-5 10-14 16-24 19" fill="none" stroke="currentColor" stroke-width="1" opacity=".42"/>' +
    '<path d="M110 48c7 8 9 18 6 27" fill="none" stroke="currentColor" stroke-width=".75" opacity=".28"/>' +
    '<path d="M116 42c5 5 7 11 7 18" fill="none" stroke="currentColor" stroke-width=".55" opacity=".18"/>' +
    '</svg>';

  // ── Follow-up chip icons ──────────────────────────────────────────

  var FOLLOWUP_CHIP_ICONS = {
    lighter: 'wind',
    bolder: 'flame',
    luxury: 'sparkles',
    under30: 'coins',
    connoisseur: 'award',
    comparison: 'scale',
    'show-backup': 'layers'
  };

  // ── Public API ────────────────────────────────────────────────────

  window.SterlonPresentationOverlays = {
    MOJIBAKE_REPAIR_PAIRS: MOJIBAKE_REPAIR_PAIRS,
    OFF_MENU_SPIRIT_GUIDANCE: OFF_MENU_SPIRIT_GUIDANCE,
    OFF_MENU_CIGAR_GUIDANCE: OFF_MENU_CIGAR_GUIDANCE,
    MOOD_PRELUDE_OVERLAYS: MOOD_PRELUDE_OVERLAYS,
    EVENING_DIMENSION_PRELUDE_OVERLAYS: EVENING_DIMENSION_PRELUDE_OVERLAYS,
    PRODUCT_EXPERTISE: PRODUCT_EXPERTISE,
    SENSORY_PRELUDE_TEMPLATES: SENSORY_PRELUDE_TEMPLATES,
    SPIRIT_LEAD_POOL: SPIRIT_LEAD_POOL,
    CIGAR_LEAD_POOL: CIGAR_LEAD_POOL,
    PAIRING_LEAD_POOL: PAIRING_LEAD_POOL,
    OPEN_LEAD_POOL: OPEN_LEAD_POOL,
    UNIFIED_SPIRIT_PREFIXES: UNIFIED_SPIRIT_PREFIXES,
    UNIFIED_CIGAR_PREFIXES: UNIFIED_CIGAR_PREFIXES,
    UNIFIED_OPEN_PREFIXES: UNIFIED_OPEN_PREFIXES,
    STREAM_PROFILES: STREAM_PROFILES,
    RECO_CARD_ILLUSTRATION_SVG: RECO_CARD_ILLUSTRATION_SVG,
    FOLLOWUP_CHIP_ICONS: FOLLOWUP_CHIP_ICONS
  };
})();
