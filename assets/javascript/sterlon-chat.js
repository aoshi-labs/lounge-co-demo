/* ──────────────────────────────────────────────────────────────────────
   sterlon-chat.js — Sterlon chat engine

   Gateway-backed Sterlon runtime. Pairing cards (preset flight UI) are optional;
   when off, recommendations are prose-first against the same menu allowlists.
   Browser code never holds provider credentials; live model calls go through
   an app-owned gateway. The static visionboard falls back to deterministic
   local copy when no gateway is configured.

   P1.9 orchestration convergence (in-file coordinators below send()):
   coordinates cross-subsystem execution order only. Recommendation authority
   remains RecommendationRuntime-owned; routing → SO/RT, session → SL,
   presentation cadence → PL, gateway stream → GL/SG.
   Architecture: docs/internal/STERLON_RECOMMENDATION_EXTRACTION.md
   ────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  const ST = window.SterlonTelemetry || { emit: function () {} };
  const RS = window.SterlonRuntimeState;
  const SG = window.SterlonGateway;
  const SR = window.SterlonRecommendations;
  const PP = window.SterlonProsePipeline;          // P1.2 — pure text transforms
  const CR = window.SterlonCardRenderers;          // P1.2 — card element factories
  const RT = window.SterlonChatRouter;             // P1.3 — pure routing & intent classification
  const SO = window.SterlonSessionRouting;         // P1.4 — session-aware routing helpers
  const SL = window.SterlonSessionLifecycle;       // P1.7 — session persistence + rec-set coordination
  const PL = window.SterlonPresentationLifecycle;  // P1.8 — paced streaming + staged presentation
  const GL = window.SterlonGatewayLifecycle;       // P1.5 — abort controller + stream generation
  const GP = window.SterlonGatewayProse;           // P1.5 — prose governance pipeline
  const SV = window.SterlonStackValidate;
  const CP = window.SterlonConciergeProse;         // CS-4 — local concierge template prose
  const CHP = window.SterlonChatPrompts;           // CS-4 — system prompts + style extras
  const SA = window.SterlonScrollAnchor;           // CS-4 — scroll anchoring
  const TH = window.SterlonTurnHandlers;         // CS-4 — expertise/continuity/closing handlers
  /**
   * RecommendationRuntime is loaded with the Sterlon stack before this file.
   * Normal recommendation authority requires RR.resolveRecommendationTurn (or transitional RR.buildRecommendationSet); if both are missing,
   * chat enters explicit degraded mode (buildDegradedTurn) — never silent SR-only substitution.
   */
  const RR = window.RecommendationRuntime || null;
  if (RR && RR.resolveRecommendationTurn === null) {
    console.warn(
      'Sterlon: RecommendationRuntime.resolveRecommendationTurn is null — build-set.js may not have loaded.'
    );
  }
  if (!RS || !SG || !SR) {
    console.error('Sterlon: load sterlon-runtime-state.js, sterlon-recommendations.js, and sterlon-gateway-client.js before sterlon-chat.js');
  }


  /** Passthrough to SterlonChatPrompts — avoids duplicating one-liner wrappers. */
  function chpCall(name) {
    if (!CHP) return '';
    const fn = CHP[name];
    if (typeof fn !== 'function') return '';
    return fn.apply(CHP, Array.prototype.slice.call(arguments, 1));
  }

  /** Passthrough to SterlonConciergeProse — host modules call CP methods directly. */
  function cpCall(name) {
    if (!CP) return '';
    const fn = CP[name];
    if (typeof fn !== 'function') return '';
    return fn.apply(CP, Array.prototype.slice.call(arguments, 1));
  }

  function responseStylePrompt(style) {
    const map = (CHP && CHP.RESPONSE_STYLE_PROMPTS) || {};
    return map[style] || map.deep || '';
  }

  const gatewayContext = () => ({
    currentResponseStyle,
    sessionRuntime
  });

  const TASTING_DEMO_STEPS = [
    { key: 'product', prompt: 'Great. What are you tasting? (cigar or spirit name)' },
    { key: 'rating',  prompt: 'How would you score it right now on a 1-10 scale?' },
    { key: 'notes',   prompt: 'Give me 2-4 flavor notes in your own words.' },
    { key: 'pairing', prompt: 'What did you pair it with, if anything?' },
    { key: 'moment',  prompt: 'How did it drink overall: smooth, bold, balanced, or evolving?' }
  ];

  let currentResponseStyle = 'deep';
  let activeTastingDemo = null;
  let conversationHistory = [];
  let _sendLocked = false;

  const CHAT_STORAGE_KEY    = 'lounge-sterlon-chat-v1';
  const HISTORY_STORAGE_KEY = 'lounge-sterlon-history-v1';
  const THREADS_STORAGE_KEY   = 'lounge-sterlon-threads-v1';
  const STYLE_STORAGE_KEY     = 'lounge-sterlon-style-v1';
  const MAX_HISTORY_TURNS     = 24;

  function lockComposer() {
    _sendLocked = true;
    const c = document.getElementById('composer');
    const btn = document.querySelector('.sterlon-send-btn');
    if (c) c.disabled = true;
    if (btn) btn.disabled = true;
  }

  function unlockComposer() {
    _sendLocked = false;
    const c = document.getElementById('composer');
    const btn = document.querySelector('.sterlon-send-btn');
    if (c) c.disabled = false;
    if (btn) btn.disabled = false;
    if (c) c.focus();
  }

  // ── Conversational runtime spine (PR1 — mode + output shape) ─────────
  const RuntimeMode = RS.RuntimeMode;
  const OutputShape = RS.OutputShape;

  const SESSION_RUNTIME_STORAGE_KEY = RS.SESSION_RUNTIME_STORAGE_KEY;
  const SESSION_RUNTIME_LEGACY_KEY = RS.SESSION_RUNTIME_LEGACY_KEY;

  function createDefaultSessionState() {
    return RS.createDefaultSessionState();
  }

  let sessionRuntime = createDefaultSessionState();

  // Wire P1.4/P1.7 session modules with live closures over the IIFE-private bindings.
  if (SO) {
    SO.setSessionProvider(function () { return sessionRuntime; });
    SO.setActiveTastingProvider(function () { return activeTastingDemo; });
  }
  if (SL) {
    SL.setSessionProvider(function () { return sessionRuntime; });
  }

  let sterlonStackOk = true;

  function validateSterlonStack() {
    if (!SV || typeof SV.assertSterlonStack !== 'function') {
      sterlonStackOk = false;
      console.error('Sterlon: sterlon-stack-validate.js must load before sterlon-chat.js');
      ST.emit('stack_incomplete', { missing: ['SterlonStackValidate'], warnings: [] });
      return { ok: false, missing: ['SterlonStackValidate'], warnings: [] };
    }
    const result = SV.assertSterlonStack();
    sterlonStackOk = result.ok;
    if (!result.ok) {
      console.error('[Sterlon] Stack incomplete — missing:', result.missing.join(', '));
      ST.emit('stack_incomplete', { missing: result.missing, warnings: result.warnings });
    } else if (result.warnings.length) {
      console.warn('[Sterlon] Stack loaded with warnings:', result.warnings.join(', '));
      ST.emit('stack_warnings', { warnings: result.warnings });
    }
    return result;
  }

  function showStackDegradedBanner(missing) {
    if (typeof document === 'undefined') return;
    let banner = document.getElementById('sterlon-stack-degraded');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'sterlon-stack-degraded';
      banner.className = 'sterlon-stack-degraded';
      banner.setAttribute('role', 'status');
      const col = document.querySelector('.sterlon-chat-col');
      if (col) col.prepend(banner);
    }
    banner.textContent = 'Sterlon is running in degraded mode — some modules failed to load (' + (missing || []).join(', ') + ').';
  }

  function ensureStackForRecommendation() {
    if (sterlonStackOk) return true;
    renderProseOnlyTurn('Sterlon is missing required modules and cannot run recommendations right now. Please reload the page.');
    return false;
  }

  function resetSessionRuntime() {
    sessionRuntime = createDefaultSessionState();
    try { localStorage.removeItem(SESSION_RUNTIME_STORAGE_KEY); } catch (_) {}
  }

  function loadSessionRuntime() {
    try {
      let raw = localStorage.getItem(SESSION_RUNTIME_STORAGE_KEY);
      if (!raw) raw = localStorage.getItem(SESSION_RUNTIME_LEGACY_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        sessionRuntime = Object.assign(createDefaultSessionState(), parsed);
        if (sessionRuntime.journeyLevel && !sessionRuntime.latchedJourneyLevel) {
          sessionRuntime.latchedJourneyLevel = sessionRuntime.journeyLevel;
        }
      }
    } catch (_) {}
  }

  // ── PR2 — continuity runtime (session-scoped structured state) ─────

  /** Intensity ladders — read from SterlonSensory when loaded, then catalog names. */
  const SPIRIT_INTENSITY_LADDER = (function () {
    var ss = typeof window !== 'undefined' && window.SterlonSensory;
    if (ss && typeof ss.getIntensityOrderedSpirits === 'function') return ss.getIntensityOrderedSpirits();
    var lp = typeof window !== 'undefined' && window.LoungeProducts;
    return lp && typeof lp.listMenuSpiritNames === 'function' ? lp.listMenuSpiritNames() : [];
  })();

  const CIGAR_INTENSITY_LADDER = (function () {
    var ss = typeof window !== 'undefined' && window.SterlonSensory;
    if (ss && typeof ss.getIntensityOrderedCigars === 'function') return ss.getIntensityOrderedCigars();
    var lp = typeof window !== 'undefined' && window.LoungeProducts;
    return lp && typeof lp.listMenuCigarNames === 'function' ? lp.listMenuCigarNames() : [];
  })();

    /** Typed into composer on chip click — must retain refinement trigger tokens for PR2 parsers. */
  const REFINEMENT_CHIP_LABELS = {
    lighter:   'Take the smoke down a touch',
    bolder:    'Push it darker',
    under30:   'Keep it under $30 but stay in this lane',
    luxury:    'Something for a special occasion',
    connoisseur: 'Surprise me in this lane',
    contrast:  'something with more contrast'
  };

  const FOLLOWUP_ADVANCED_CONFIG = [
    { prompt: 'something for later in the night', label: 'Something for later in the night' },
    { prompt: 'something more celebratory tonight', label: 'Something more celebratory' },
    { prompt: 'what would you pour after dinner', label: 'What would you pour after dinner?' },
    { refinement: 'under30', label: 'Keep the spend sensible' },
    { refinement: 'luxury', label: 'Dress it up for tonight' },
    { prompt: 'stay in this mood but take it easier', label: 'Stay in this mood' },
    { refinement: 'connoisseur', label: 'Surprise me in this lane' }
  ];

  function selectPrimaryFollowupChips() {
    const dims = SO.getMergedEveningDimensions();
    const mood = SO.getActiveEveningMood();
    const chips = [];

    if (dims.social === 'friendsNewToCigars') {
      chips.push({ prompt: 'something approachable for guests who rarely smoke cigars', label: 'Easier for the table' });
    } else if (dims.rhythm === 'wontExhaust' || mood === 'decompress') {
      chips.push({ prompt: 'something that wont exhaust me tonight', label: 'Less demanding' });
    } else if (dims.rhythm === 'secondWhiskey' || dims.occasion === 'secondPour') {
      chips.push({ prompt: 'what would you pour after dinner', label: 'What would you pour after dinner?' });
    } else if (dims.occasion === 'outdoor' || dims.atmosphere === 'outdoorNight') {
      chips.push({ prompt: 'something for later in the night', label: 'Something for later in the night' });
    } else {
      chips.push({ prompt: 'something that opens more slowly', label: 'Something that opens slower' });
    }

    if (dims.occasion !== 'outdoor' && dims.atmosphere !== 'outdoorNight') {
      chips.push({ prompt: 'something better outside at night', label: 'Better outside' });
    } else {
      chips.push({ refinement: 'lighter', label: 'A quieter direction' });
    }

    if (dims.rhythm !== 'secondWhiskey' && dims.occasion !== 'secondPour') {
      chips.push({ prompt: 'something for a second whiskey tonight', label: 'A second-pour whiskey' });
    } else if (mood === 'celebratory' || dims.occasion === 'celebratory') {
      chips.push({ prompt: 'something more celebratory tonight', label: 'Something more celebratory' });
    } else {
      chips.push({ prompt: 'stay in this mood but take it easier', label: 'Stay in this mood' });
    }

    if (sessionRuntime.comparisonAffordance && chips.length < 3) {
      chips.push({ comparison: true, label: 'Compare side by side' });
    }
    return chips.slice(0, 3);
  }

  function selectAdvancedFollowupChips(primaryChips) {
    const primaryKeys = {};
    (primaryChips || []).forEach(c => {
      if (c.refinement) primaryKeys[c.refinement] = true;
      if (c.comparison) primaryKeys.comparison = true;
    });
    const advanced = FOLLOWUP_ADVANCED_CONFIG.filter(cfg => !primaryKeys[cfg.refinement]);
    if (sessionRuntime.comparisonAffordance && !primaryKeys.comparison) {
      advanced.push({ comparison: true, label: 'Compare side by side' });
    }
    advanced.push({ prompt: 'show me what else is on the table', label: 'Show me what else is on the table' });
    return advanced;
  }

  function rememberEveningDimensions(text) {
    return SL.applyEveningDimensions(sessionRuntime, RT.detectEveningDimensions(text));
  }

  function rememberEveningMood(text) {
    const mood = RT.detectEveningMood(text);
    if (mood) SL.applyEveningMood(sessionRuntime, mood, sessionRuntime.turnCount || 0);
    rememberEveningDimensions(text);
    SL.saveSessionRuntime();
    return sessionRuntime.eveningMood;
  }

  function handleAnchoredPairingTurn(text) {
    return TH ? TH.handleAnchoredPairingTurn(text) : false;
  }
  function handleExpertiseTurn(text) {
    return TH ? TH.handleExpertiseTurn(text) : false;
  }
  function handleContinuityTurn(text) {
    return TH ? TH.handleContinuityTurn(text) : false;
  }

  function getFlavorMatch() {
    return typeof window !== 'undefined' ? window.SterlonFlavorMatch : null;
  }

  function shouldRenderRecommendationFlight(mode) {
    // P0.4: card UI rendering deferred to presentation phase.
    return false;
  }

  function resolveOutputShape(mode) {
    if (mode === RuntimeMode.TASTING) return OutputShape.TASTING_FLOW;
    if (mode === RuntimeMode.GREETING || mode === RuntimeMode.CLARIFICATION) return OutputShape.PROSE_ONLY;
    if (mode === RuntimeMode.EXPERTISE) return OutputShape.EXPERTISE_PROSE;
    if (mode === RuntimeMode.RECALL) return OutputShape.RECALL_PROSE;
    if (mode === RuntimeMode.COMPARISON) return OutputShape.COMPARISON_PROSE;
    if (mode === RuntimeMode.REFINEMENT) return OutputShape.REFINEMENT_FLIGHT;
    return OutputShape.PROSE_WITH_RECOMMENDATIONS;
  }

  function resolveFlavorRoute(text) {
    const SFM = getFlavorMatch();
    if (!SFM) return null;
    return SFM.resolveFlavorRoute(text, { category: RT.inferCategoryBiasForFlavor(text) });
  }

  /** Read-only deck key for validation/fallback — never mutates sessionRuntime. */
  function resolveDeckKey(text) {
    const route = resolveFlavorRoute(text);
    if (route && route.deckKey) return route.deckKey;
    return sessionRuntime.activeDeckKey || 'bourbon';
  }

  let currentTurnDeckKey = 'bourbon';

  /** Apply flavor routing + journey latch once per member turn (send loop only). */
  function commitTurnRouting(text) {
    const route = resolveFlavorRoute(text);
    currentTurnDeckKey = SL.applyTurnRouting(sessionRuntime, {
      route: route,
      defaultDeckKey: route ? (sessionRuntime.activeDeckKey || 'bourbon') : 'bourbon'
    });
    SO.getEffectiveJourneyLevel(sessionRuntime, text || '');
  }

  function getEffectiveJourneyLevel(promptText) {
    return SO.getEffectiveJourneyLevel(sessionRuntime, promptText || '');
  }

  function shouldUseGatewayProse(runtimeMode) {
    return runtimeMode === RuntimeMode.GREETING || runtimeMode === RuntimeMode.CLARIFICATION;
  }

  // ── Utilities ───────────────────────────────────────────────────────

  function shuffledCopy(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = copy[i]; copy[i] = copy[j]; copy[j] = tmp;
    }
    return copy;
  }

  function randomFlavorTargets() {
    const pool = [
      'cedar and cream', 'cocoa and espresso', 'pepper and leather',
      'earth and dark fruit', 'floral citrus lift', 'toasted nut and oak'
    ];
    return shuffledCopy(pool).slice(0, 3);
  }

  function buildRandomCigarActionPrompt(action) {
    const cigars = shuffledCopy(SR.MENU_CIGARS).slice(0, 3);
    const flavors = randomFlavorTargets();
    const opener = action === 'wildcard'
      ? 'Give me a wildcard cigar flight for tonight.'
      : action === 'research'
        ? 'Research these cigars and guide me quickly.'
        : 'Suggest something I might like tonight, but keep it varied.';
    return opener +
      ' Keep this random and diverse.' +
      ' Use exactly these three cigars as anchors: ' + cigars.join(', ') + '.' +
      ' Make one easygoing, one balanced, and one bold.' +
      ' Flavor direction targets: ' + flavors.join('; ') + '.' +
      " Mention each cigar's body and strength profile in one short line each." +
      ' End with one clear best pick for tonight.';
  }

  function slotSignatureForRecommendationCompare(card) {
    if (!card) return '';
    return [card.cigar || '', card.spirit || '', card.food || ''].join('\u0001');
  }

  function inferRecoSlotFromTurn(turn, card) {
    if (!turn || !turn.cards || !card) return null;
    const order = (window.RecommendationTurnHelpers && window.RecommendationTurnHelpers.SLOT_ORDER) || [
      'best',
      'safe',
      'wildcard'
    ];
    const sig = slotSignatureForRecommendationCompare(card);
    for (let i = 0; i < order.length; i++) {
      if (slotSignatureForRecommendationCompare(turn.cards[i]) === sig) return order[i];
    }
    return null;
  }

  /**
   * Hydrate session from a governed RecommendationTurn (Law 8 — no DOM authority).
   * @returns {boolean} true when turn was applied
   */
  function hydrateSessionFromGovernedTurn(turn) {
    if (!turn) return false;
    sessionRuntime.lastRecommendationTurn = turn;
    if (turn.cards && turn.cards.length && SL && SL.commitActiveRecommendationSet) {
      const promptText = (turn.provenance && turn.provenance.promptText) || '';
      SL.commitActiveRecommendationSet(turn.cards, promptText, { resetRefinementChain: false });
    }
    return true;
  }

  function buildRecommendationTurnForPrompt(promptText, opts) {
    const o = opts || {};
    if (!RR || typeof RR.resolveTurnFromChatContext !== 'function') {
      console.error('Sterlon: RecommendationRuntime.resolveTurnFromChatContext missing');
      return null;
    }
    const turn = RR.resolveTurnFromChatContext({
      promptText: promptText || '',
      sessionRuntime: sessionRuntime,
      getJourneyLevel: function (t) { return SO.getEffectiveJourneyLevel(sessionRuntime, t || ''); },
      inferCategoryFocus: function (t) {
        return 'categoryFocus' in o ? o.categoryFocus : RT.inferCategoryFocus(t || '');
      },
      anchorCigar: o.anchorCigar || null,
      promptExplicitlyNamesMenuSpirit: promptExplicitlyNamesMenuSpirit,
      parseBudgetCeiling: function (t) { return SO.parseBudgetCeiling(t || ''); },
      detectBrandHint: function (t) { return RT.detectBrandHint(t || ''); },
      telemetry: ST
    });
    sessionRuntime.lastRecommendationTurn = turn;
    if (typeof RR.saveLastRecommendationTurn === 'function') {
      RR.saveLastRecommendationTurn(turn);
    }
    return turn;
  }

  function promptExplicitlyNamesMenuSpirit(text) {
    if (SR && typeof SR.promptExplicitlyNamesMenuSpirit === 'function') {
      return SR.promptExplicitlyNamesMenuSpirit(text);
    }
    const named = RT.matchMenuProductInText(text || '');
    return !!(named && named.category === 'spirit');
  }

  function buildRecommendationCards(promptText) {
    return buildRecommendationTurnForPrompt(promptText).cards;
  }

  function recoCardOptions(promptText) {
    return { journeyLevel: getEffectiveJourneyLevel(promptText || '') };
  }

  function validateCards(cards, promptText, options) {
    const opts = options || {};
    // Resolve category focus for this prompt; skip 'pairing' as it does not map to a slot strip.
    const cf = RT.inferCategoryFocus(promptText) || sessionRuntime.activeCategoryFocus || null;
    const categoryFocusOpt = (cf === 'spirit' || cf === 'cigar') ? { categoryFocus: cf } : {};
    return SR.validateCards(
      cards, promptText,
      Object.assign({}, categoryFocusOpt, recoCardOptions(promptText), opts)
    );
  }

  function formatConciergeText(rawText, highlightCard) {
    const cleaned = PP.humanizePresentationProse(rawText).trim();
    if (!cleaned) return '<p class="sterlon-pace-line is-lead">Tonight I would start with something composed and balanced.</p>';
    if (/\n\n/.test(cleaned)) {
      return cleaned.split(/\n\n+/).filter(Boolean).slice(0, 3).map((part, idx) => {
        const cls = idx === 0 ? ' is-lead' : ' is-mood';
        return '<p class="sterlon-pace-line' + cls + '">' + CR.emphasizeProductNames(PP.escapeHtml(part.trim()), highlightCard) + '</p>';
      }).join('');
    }
    const sentences = cleaned.match(/[^.!?]+[.!?]?/g) || [cleaned];
    const chunks = [];
    if (currentResponseStyle === 'quick') {
      sentences.slice(0, 3).forEach(s => chunks.push(s.trim()));
    } else {
      for (let i = 0; i < sentences.length && chunks.length < 3; i += 1) {
        const line = sentences[i].trim();
        if (line) chunks.push(line);
      }
    }
    return chunks
      .map((line, idx) => {
        const cls = idx === 0 ? ' is-lead' : (idx === 1 ? ' is-mood' : '');
        return '<p class="sterlon-pace-line' + cls + '">' + CR.emphasizeProductNames(PP.escapeHtml(line), highlightCard) + '</p>';
      })
      .join('');
  }

  function validateVisibleText(rawText, promptTextForFallback, profileKey, opts) {
    const profile = profileKey || 'recommendation';
    const govOpts = opts && opts.sealedCards
      ? {
          sealedCards: opts.sealedCards,
          bindSealedSlots: opts.bindSealedSlots === true,
          categoryFocus: opts.categoryFocus || null,
          promptText: promptTextForFallback || null
        }
      : undefined;
    let text = GP.governGeneratedProse(PP.humanizePresentationProse(rawText || ''), profile, govOpts);
    if (!text) {
      text = promptTextForFallback
        ? cpCall('buildRecommendationLeadProse', promptTextForFallback)
        : PP.GENERIC_LEAD_FALLBACK;
    }
    text = text.replace(/\b(i am an ai|as an ai|language model)\b/gi, '');
    if (GP.hasEmoji(text)) {
      text = text.replace(/[\u{1F300}-\u{1FAFF}]/gu, '');
    }
    return GP.governGeneratedProse(text, profile, govOpts);
  }

  // ── Conversational presentation (P1.8 → SterlonPresentationLifecycle / PL) ─

  function buildFollowChipButton(cfg) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sterlon-follow-chip';
    btn.innerHTML = CR.followChipIconHtml(cfg) + '<span>' + PP.escapeHtml(cfg.label) + '</span>';
    if (cfg.refinement) btn.setAttribute('data-refinement', cfg.refinement);
    if (cfg.comparison) btn.setAttribute('data-comparison', 'side-by-side');
    if (cfg.prompt) btn.setAttribute('data-prompt', cfg.prompt);
    return btn;
  }

  function renderRecommendationActions(recoWrap) {
    const block = document.createElement('div');
    block.className = 'sterlon-reco-actions';

    const primaryChips = selectPrimaryFollowupChips();
    const primaryRow = document.createElement('div');
    primaryRow.className = 'sterlon-followups sterlon-followups-primary';
    primaryChips.forEach(cfg => primaryRow.appendChild(buildFollowChipButton(cfg)));

    const moreWrap = document.createElement('div');
    moreWrap.className = 'sterlon-reco-more-options';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'sterlon-reco-more-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = '<span>More options</span><i data-lucide="chevron-down" class="ic-12"></i>';
    const advancedRow = document.createElement('div');
    advancedRow.className = 'sterlon-followups sterlon-followups-advanced';
    advancedRow.hidden = true;
    selectAdvancedFollowupChips(primaryChips).forEach(cfg => {
      advancedRow.appendChild(buildFollowChipButton(cfg));
    });

    moreWrap.appendChild(toggle);
    moreWrap.appendChild(advancedRow);
    block.appendChild(primaryRow);
    block.appendChild(moreWrap);
    recoWrap.appendChild(block);
  }

  function syncGlobalQuickActionsBar() {
    const bar = document.getElementById('quick-actions');
    if (!bar) return;
    bar.hidden = true;
    bar.setAttribute('aria-hidden', 'true');
  }

  function addTypingIndicator() {
    const chat = document.getElementById('chat');
    const row = document.createElement('div');
    row.id = 'typing-indicator';
    row.className = 'sterlon-bubble-row';
    row.innerHTML = '<div class="sterlon-bubble-avatar"><img src="assets/images/sterlon.jpg" alt="" class="sterlon-avatar-img"/></div><div class="ai-bubble ai-bubble--plain" style="min-width:48px"><span class="typing-dots"><span>.</span><span>.</span><span>.</span></span></div>';
    chat.appendChild(row);
    scrollChat();
    return row;
  }

  function appendUserBubble(text) {
    const chat = document.getElementById('chat');
    const bubble = document.createElement('div');
    bubble.className = 'user-bubble';
    bubble.textContent = PP.repairMojibake(text);
    chat.appendChild(bubble);
    scrollChat({ force: true, smooth: true });
  }

  function appendAssistantBubble(rawText) {
    const chat = document.getElementById('chat');
    const row = document.createElement('div');
    row.className = 'sterlon-bubble-row';
    row.innerHTML = '<div class="sterlon-bubble-avatar"><img src="assets/images/sterlon.jpg" alt="" class="sterlon-avatar-img"/></div><div class="sterlon-bubble-stack"><div class="ai-bubble"></div></div>';
    const bubble = row.querySelector('.ai-bubble');
    bubble.classList.add('ai-bubble--plain');
    bubble.innerHTML = formatConciergeText(rawText);
    chat.appendChild(row);
    scrollChat({ smooth: true });
    return row;
  }

  function createAssistantMessageRow() {
    const row = document.createElement('div');
    row.className = 'sterlon-bubble-row';
    row.innerHTML = '<div class="sterlon-bubble-avatar"><img src="assets/images/sterlon.jpg" alt="" class="sterlon-avatar-img"/></div><div class="sterlon-bubble-stack"><div class="ai-bubble"></div></div>';
    document.getElementById('chat').appendChild(row);
    return {
      wrap: row.querySelector('.sterlon-bubble-stack'),
      bubble: row.querySelector('.ai-bubble')
    };
  }

  function renderProseOnlyTurn(prose, profileKey) {
    const profile = profileKey || 'clarification';
    PL.runConversationalPresentation(async (gen) => {
      try {
        const ok = await PL.conversationalThinkPause(profile, gen);
        if (!ok || !GL.isStreamActive(gen)) return;
        await PL.presentProseBeat(prose, profile, gen, {});
      } finally {
        unlockComposer();
      }
    });
  }

  function renderRecommendationTurn(prose, cards, promptText, presentationOpts) {
    const lead = (typeof prose === 'string' && prose.trim()) ? prose.trim() : '';
    const presOpts = presentationOpts || {};
    PL.runConversationalPresentation(async (gen) => {
      try {
        const ok = await PL.conversationalThinkPause('recommendation', gen);
        if (!ok || !GL.isStreamActive(gen)) return;
        const { wrap } = createAssistantMessageRow();
        await PL.presentStagedRecommendation(wrap, lead, cards, promptText, {
          profile: 'recommendation',
          preserveAnchoredCigar: presOpts.preserveAnchoredCigar,
          enforceRuntimeAuthority: presOpts.enforceRuntimeAuthority === true
        }, gen);
      } finally {
        unlockComposer();
      }
    });
  }

  function renderRecallTurn(entry) {
    const prose = cpCall('buildRecallProse', entry);
    PL.runConversationalPresentation(async (gen) => {
      try {
        const ok = await PL.conversationalThinkPause('prose', gen);
        if (!ok || !GL.isStreamActive(gen)) return;
        await PL.presentProseBeat(prose, 'prose', gen, {});
      } finally {
        unlockComposer();
      }
    });
  }

  function renderComparisonTurn(entries) {
    const prose = cpCall('buildComparisonProse', entries);
    PL.runConversationalPresentation(async (gen) => {
      try {
        const ok = await PL.conversationalThinkPause('comparison', gen);
        if (!ok || !GL.isStreamActive(gen)) return;
        await PL.presentProseBeat(prose, 'comparison', gen, {});
      } finally {
        unlockComposer();
      }
    });
  }

  // Prose-only refinement (no card mutation): still renders as its own
  // conversational beat in a fresh assistant row so it never visually merges
  // with the prior recommendation.
  function renderRefinementProseTurn(prose) {
    const validated = PP.humanizePresentationProse(validateVisibleText(prose, '', 'refinement'));
    renderProseOnlyTurn(validated);
  }

  function scrollChat(options) {
    if (SA) SA.scrollChat(options);
  }
  function initScrollAnchoring() {
    if (SA) SA.init({ getScrollContainerId: 'sterlon-chat-scroll', chatId: 'chat', chatColSelector: '.sterlon-chat-col' });
  }

  // ── Tasting demo (in-chat 5-step capture) ───────────────────────────

  function isTastingDemoEnabled() {
    try {
      return localStorage.getItem('STERLON_ENABLE_TASTING_DEMO') === '1';
    } catch (_) {
      return false;
    }
  }

  function beginTastingDemo(seedProduct) {
    if (!isTastingDemoEnabled()) {
      if (window.toast) toast('Structured tasting capture is off in this build.');
      return;
    }
    activeTastingDemo = { step: 0, data: { product: seedProduct || '' } };
    if (seedProduct) {
      activeTastingDemo.step = 1;
      const intro = "Excellent. I'll keep this concise. I've prefilled the product as " + seedProduct + '. Let me capture the session cleanly.';
      appendAssistantBubble(intro + ' ' + TASTING_DEMO_STEPS[1].prompt);
      conversationHistory.push({ role: 'assistant', content: intro + ' ' + TASTING_DEMO_STEPS[1].prompt });
    } else {
      const kickoff = "Let's log this tasting in-chat. I'll ask five quick questions and then return a polished summary.";
      appendAssistantBubble(kickoff + ' ' + TASTING_DEMO_STEPS[0].prompt);
      conversationHistory.push({ role: 'assistant', content: kickoff + ' ' + TASTING_DEMO_STEPS[0].prompt });
    }
    saveChatState();
  }

  function finalizeTastingDemo() {
    if (!activeTastingDemo) return;
    const d = activeTastingDemo.data;
    const summary =
      'Logged. Here is your tasting recap.\n\n' +
      'Product: '  + (d.product || 'Unspecified') + '.\n' +
      'Score: '    + (d.rating  || 'N/A') + '/10.\n' +
      'Notes: '    + (d.notes   || 'None captured.') + '.\n' +
      'Pairing: '  + (d.pairing || 'None') + '.\n' +
      'Session profile: ' + (d.moment || 'Balanced') + '.\n\n' +
      'If you want, I can suggest a next pour that complements this profile.';
    appendAssistantBubble(summary);
    conversationHistory.push({ role: 'assistant', content: summary });
    activeTastingDemo = null;
    saveChatState();
  }

  function handleTastingDemoReply(text) {
    if (!activeTastingDemo) return false;
    const stepMeta = TASTING_DEMO_STEPS[activeTastingDemo.step];
    if (!stepMeta) { finalizeTastingDemo(); return true; }
    if (stepMeta.key === 'rating') {
      const numeric = Number(String(text).replace(/[^0-9.]/g, ''));
      if (!Number.isFinite(numeric) || numeric < 1 || numeric > 10) {
        const nudge = 'Give me a quick numeric score from 1 to 10 so I can keep the log clean.';
        appendAssistantBubble(nudge);
        conversationHistory.push({ role: 'assistant', content: nudge });
        saveChatState();
        return true;
      }
      activeTastingDemo.data[stepMeta.key] = String(Math.round(numeric * 10) / 10);
    } else {
      activeTastingDemo.data[stepMeta.key] = text;
    }
    activeTastingDemo.step += 1;
    const next = TASTING_DEMO_STEPS[activeTastingDemo.step];
    if (!next) { finalizeTastingDemo(); return true; }
    appendAssistantBubble(next.prompt);
    conversationHistory.push({ role: 'assistant', content: next.prompt });
    saveChatState();
    return true;
  }

  // ── Persistence ─────────────────────────────────────────────────────

  function saveChatState() {
    const chat = document.getElementById('chat');
    if (!chat) return;
    repairConversationDom(chat);
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, chat.innerHTML);
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(repairConversationHistory(conversationHistory)));
      localStorage.setItem(STYLE_STORAGE_KEY, currentResponseStyle);
    } catch (_) {}
  }

  function repairConversationDom(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      const fixed = PP.repairMojibake(node.nodeValue);
      if (fixed !== node.nodeValue) node.nodeValue = fixed;
    });
  }

  const DEMO_HISTORY_SIGNATURES = [
    /your last review/i,
    /pappy\s*23\s+the lounge just got/i,
    /natural fit.*retrohale/i,
    /welcome back\. tell me what you'?re in the mood for — something elegant, bold, or exploratory/i
  ];

  function isDemoContaminatedHistory(history) {
    if (!Array.isArray(history) || !history.length) return false;
    return history.some(row => {
      const text = String((row && row.content) || '');
      return DEMO_HISTORY_SIGNATURES.some(re => re.test(text));
    });
  }

  function repairConversationHistory(history) {
    if (!Array.isArray(history)) return [];
    if (isDemoContaminatedHistory(history)) return [];
    return history.map(row => {
      if (!row || typeof row !== 'object') return row;
      return Object.assign({}, row, {
        content: PP.repairMojibake(row.content || '')
      });
    });
  }

  function buildSessionContextSummary() {
    if (MAX_HISTORY_TURNS == null) return null;
    const total = conversationHistory.length;
    if (total <= MAX_HISTORY_TURNS) return null;
    const omittedTurns = Math.floor((total - MAX_HISTORY_TURNS) / 2);
    const parts = [
      '[Context: ' + omittedTurns + ' earlier exchange' + (omittedTurns !== 1 ? 's' : '') + ' omitted.'
    ];
    const reco = sessionRuntime.activeRecommendationSet;
    if (reco) {
      const products = [];
      if (reco.best && reco.best.spirit) products.push(reco.best.spirit);
      if (reco.best && reco.best.cigar) products.push(reco.best.cigar);
      if (products.length) parts.push('Last flight: ' + products.join(' + ') + '.');
    }
    if (sessionRuntime.activeCategoryFocus && sessionRuntime.activeCategoryFocus !== 'open') {
      parts.push('Focus: ' + sessionRuntime.activeCategoryFocus + '.');
    }
    if (sessionRuntime.refinementChainDepth > 0) {
      parts.push('Refinement depth: ' + sessionRuntime.refinementChainDepth + '.');
    }
    if (sessionRuntime.eveningMood) {
      parts.push('Mood: ' + sessionRuntime.eveningMood + '.');
    }
    parts.push(']');
    return parts.join(' ');
  }

  // Returns history for the gateway: full log when uncapped, else recent slice + summary prefix.
  function buildGatewayHistory() {
    const summary = buildSessionContextSummary();
    const recent = MAX_HISTORY_TURNS == null
      ? conversationHistory.slice()
      : conversationHistory.slice(-MAX_HISTORY_TURNS);
    if (!summary) return recent;
    return [{ role: 'assistant', content: summary }, ...recent];
  }

  function shouldForceFreshChat() {
    try {
      if (new URLSearchParams(window.location.search).get('fresh') === '1') return true;
    } catch (_) {}
    return window.STERLON_FRESH_CHAT_ON_LOAD === true;
  }

  function shouldRenderStarterMessage() {
    return window.STERLON_RENDER_STARTER_MESSAGE !== false;
  }

  function cloneSessionRuntime() {
    return RS.cloneSessionRuntimeState(sessionRuntime);
  }

  function loadChatState() {
    const chat = document.getElementById('chat');
    if (!chat) return;
    if (shouldForceFreshChat()) {
      clearChatState();
      renderStarterConversation();
      updateResponseStyleUI();
      return;
    }
    const savedHtml    = localStorage.getItem(CHAT_STORAGE_KEY);
    const savedHistory = localStorage.getItem(HISTORY_STORAGE_KEY);
    const savedStyle   = localStorage.getItem(STYLE_STORAGE_KEY);
    let restoredHistory = false;
    if (savedHistory) {
      try {
        const parsed = repairConversationHistory(JSON.parse(savedHistory));
        if (parsed.length) {
          conversationHistory = parsed;
          restoredHistory = true;
        }
      } catch (_) {}
    }
    if (savedHtml && restoredHistory) {
      chat.innerHTML = PP.repairMojibake(savedHtml);
      repairConversationDom(chat);
    } else {
      if (savedHtml && !restoredHistory) {
        localStorage.removeItem(CHAT_STORAGE_KEY);
      }
      renderStarterConversation();
    }
    const styleMap = CHP && CHP.RESPONSE_STYLE_PROMPTS ? CHP.RESPONSE_STYLE_PROMPTS : {};
    if (savedStyle && styleMap[savedStyle]) currentResponseStyle = savedStyle;
    loadSessionRuntime();
    if (RR && typeof RR.loadLastRecommendationTurn === 'function') {
      hydrateSessionFromGovernedTurn(RR.loadLastRecommendationTurn());
    }
    // Law 8: recommendation authority is not reconstructed from DOM (rebuildSessionRuntimeFromDOM).
    updateResponseStyleUI();
  }

  function clearChatState() {
    localStorage.removeItem(CHAT_STORAGE_KEY);
    localStorage.removeItem(HISTORY_STORAGE_KEY);
    if (RR && typeof RR.clearLastRecommendationTurn === 'function') {
      RR.clearLastRecommendationTurn();
    }
    activeTastingDemo = null;
    resetSessionRuntime();
  }

  function getStarterAssistantText() {
    const greeting = cpCall('buildTimeGreeting') || 'Good evening';
    return greeting + '. Tell me the mood \u2014 restrained, rich, or something with a little theatre \u2014 and I\u2019ll take it from there.';
  }

  function renderStarterConversation() {
    const chat = document.getElementById('chat');
    if (!chat) return;
    if (!shouldRenderStarterMessage()) {
      chat.innerHTML = '';
      conversationHistory = [];
      scrollChat({ force: true, smooth: false });
      return;
    }
    const starter = getStarterAssistantText();
    chat.innerHTML =
      '<div class="sterlon-bubble-row">' +
        '<div class="sterlon-bubble-avatar"><img src="assets/images/sterlon.jpg" alt="" class="sterlon-avatar-img"/></div>' +
        '<div class="sterlon-bubble-stack"><div class="ai-bubble ai-bubble--plain">' + PP.escapeHtml(starter) + '</div></div>' +
      '</div>';
    conversationHistory = [{ role: 'assistant', content: starter }];
    saveChatState();
    scrollChat({ force: true, smooth: false });
  }

  // ── Thread management (history drawer) ──────────────────────────────

  function getThreads() {
    try {
      const raw = localStorage.getItem(THREADS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) { return []; }
  }

  function setThreads(threads) {
    try {
      localStorage.setItem(THREADS_STORAGE_KEY, JSON.stringify(threads.slice(0, 24)));
    } catch (_) {}
  }

  function buildThreadTitle(history) {
    const firstUser = (history || []).find(h => h.role === 'user');
    if (firstUser && firstUser.content) return firstUser.content.slice(0, 58);
    return 'Untitled Sterlon thread';
  }

  function archiveCurrentThread(reason) {
    const chat = document.getElementById('chat');
    if (!chat) return;
    if (!chat.textContent.trim()) return;
    const snapshotHistory = Array.isArray(conversationHistory) ? conversationHistory.slice() : [];
    const hasRealTurn = snapshotHistory.some(h => h.role === 'user');
    if (!hasRealTurn) return;
    const threads = getThreads();
    threads.unshift({
      id: 't-' + Date.now(),
      title: buildThreadTitle(snapshotHistory),
      updatedAt: new Date().toISOString(),
      reason: reason || 'manual',
      chatHtml: chat.innerHTML,
      history: snapshotHistory,
      runtime: cloneSessionRuntime()
    });
    setThreads(threads);
  }

  function formatThreadTime(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'Just now';
    return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function restoreThread(threadId) {
    const thread = getThreads().find(t => t.id === threadId);
    if (!thread) return;
    const chat = document.getElementById('chat');
    if (!chat) return;
    chat.innerHTML = PP.repairMojibake(thread.chatHtml || '');
    repairConversationDom(chat);
    conversationHistory = repairConversationHistory(Array.isArray(thread.history) ? thread.history : []);
    if (thread.runtime && typeof thread.runtime === 'object') {
      sessionRuntime = Object.assign(createDefaultSessionState(), thread.runtime);
      if (!Array.isArray(sessionRuntime.sessionProductRegistry)) {
        sessionRuntime.sessionProductRegistry = [];
      }
      if (sessionRuntime.lastRecommendationTurn && RR && typeof RR.adoptRestoredTurn === 'function') {
        try {
          const plain = JSON.parse(JSON.stringify(sessionRuntime.lastRecommendationTurn));
          hydrateSessionFromGovernedTurn(RR.adoptRestoredTurn(plain));
        } catch (_) {}
      }
      SL.saveSessionRuntime();
    } else {
      resetSessionRuntime();
    }
    saveChatState();
    closeHistoryDrawer();
    (SA && SA.setPinned ? SA.setPinned(true) : null);
    scrollChat({ force: true, smooth: false });
    if (window.toast) toast('Loaded: ' + thread.title, { duration: 1800 });
  }

  function renderHistoryDrawer() {
    const list = document.getElementById('history-list');
    if (!list) return;
    const threads = getThreads();
    if (!threads.length) {
      list.innerHTML = '<div class="history-empty">No saved chats yet. Start a new conversation and it will appear here.</div>';
      return;
    }
    list.innerHTML = threads.map(t =>
      '<button type="button" class="history-item" data-thread-id="' + PP.escapeHtml(t.id) + '">' +
        '<div class="history-item-title">' + PP.escapeHtml(t.title) + '</div>' +
        '<div class="history-item-meta">'  + PP.escapeHtml(formatThreadTime(t.updatedAt)) + '</div>' +
      '</button>'
    ).join('');
  }

  function bindHistoryDrawerEvents() {
    const list = document.getElementById('history-list');
    if (!list || list.dataset.threadDelegationBound) return;
    list.dataset.threadDelegationBound = '1';
    list.addEventListener('click', e => {
      const btn = e.target.closest('[data-thread-id]');
      if (!btn) return;
      restoreThread(btn.getAttribute('data-thread-id'));
    });
  }

  function openHistoryDrawer() {
    const drawer = document.getElementById('history-drawer');
    if (!drawer) return;
    renderHistoryDrawer();
    drawer.hidden = false;
    requestAnimationFrame(() => {
      drawer.classList.add('open');
      if (window.Lounge && Lounge.modal) Lounge.modal.open(drawer);
    });
  }

  function closeHistoryDrawer() {
    const drawer = document.getElementById('history-drawer');
    if (!drawer) return;
    if (window.Lounge && Lounge.modal) Lounge.modal.close(drawer);
    drawer.classList.remove('open');
    setTimeout(() => { drawer.hidden = true; }, 220);
  }

  // ── Response-style switcher ─────────────────────────────────────────

  function updateResponseStyleUI() {
    document.querySelectorAll('.sterlon-style-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.style === currentResponseStyle);
    });
  }

  function setResponseStyle(style) {
    const styles = CHP && CHP.RESPONSE_STYLE_PROMPTS ? CHP.RESPONSE_STYLE_PROMPTS : {};
    if (!styles[style]) return;
    currentResponseStyle = style;
    updateResponseStyleUI();
    try { localStorage.setItem(STYLE_STORAGE_KEY, currentResponseStyle); } catch (_) {}
    if (window.toast) {
      const label = style === 'quick' ? 'Quick recommendation' : style === 'deep' ? 'Pairing' : 'Full flight';
      toast('Style set: ' + label, { duration: 1800 });
    }
  }

  // ── P1.9 orchestration convergence coordinators ─────────────────────
  // Order-only glue between RT/SO (routing), RR (authority), PL (cadence), SL (continuity).
  // May not create RecommendationTurn, mutate authority, or infer products from presentation.

  /**
   * Persist session continuity after a turn path completes (sync; does not await PL).
   */
  function finalizeConversationalTurn(text, options) {
    const opts = options || {};
    if (opts.continuityMode != null) {
      SL.updateSessionStateForContinuity(opts.continuityMode, text);
    }
    if (opts.saveSession !== false) {
      SL.saveSessionRuntime();
    }
  }

  /**
   * After recommendation presentation: registry touch-ups + conversationalMode/threadPhase.
   */
  function synchronizeRecommendationContinuity(mode, text, syncRegistry) {
    if (typeof syncRegistry === 'function') syncRegistry();
    SL.updateSessionStateForContinuity(mode, text);
  }

  function cardToRefinementTier(card) {
    if (!card) return {};
    return {
      spirit: card.spirit,
      cigar: card.cigar,
      food: card.food,
      why: card.why
    };
  }

  /**
   * Gateway prose path for greeting/clarification turns (PL cadence).
   */
  async function callGatewayProseTurn(text, runtimeMode) {
    const typingRow = addTypingIndicator();
    const gen = GL.captureStreamGeneration();
    const signal = GL.acquireGatewayFetchSignal();
    try {
      const response = await SG.callSterlonGateway([
        {
          role: 'system',
          content: chpCall('getSystemPrompt') + chpCall('getProductTeachingPromptExtra', text) +
            chpCall('getProseTurnModeInstruction', runtimeMode) +
            '\n\n' + responseStylePrompt(currentResponseStyle) +
            '\n\n' + ((CHP && CHP.CONCIERGE_VOICE_RULES) || '') +
            '\n\n' + ((CHP && CHP.CONCIERGE_LIVE_PROSE_RULES) || '')
        },
        ...buildGatewayHistory()
      ], {
        stream: false,
        responseMode: 'prose',
        maxTokens: currentResponseStyle === 'luxury' ? 220 : 160,
        temperature: 0.72,
        signal
      }, gatewayContext());

      const content = await SG.readGatewayText(response, PP.repairMojibake);
      if (typingRow && typingRow.remove) typingRow.remove();
      const profile = runtimeMode === RuntimeMode.GREETING || runtimeMode === RuntimeMode.CLARIFICATION
        ? 'clarification'
        : 'prose';
      const prose = GP.governGeneratedProse(PP.humanizePresentationProse(content || ''), profile);
      if (!GL.isStreamActive(gen)) { unlockComposer(); return; }
      await PL.presentProseBeat(prose, profile, gen, { promptText: text, proseDelivery: 'settled' });
      unlockComposer();
      SL.updateSessionStateForContinuity(runtimeMode || RuntimeMode.CLARIFICATION, text);
    } catch (err) {
      if (typingRow && typingRow.remove) typingRow.remove();
      if (GL.isGatewayAbortError(err) || !GL.isStreamActive(gen)) { unlockComposer(); return; }
      console.error('Sterlon gateway prose error:', err);
      ST.emit('gateway_error', { phase: 'prose', message: String(err && err.message ? err.message : err) });
      if (window.toast) {
        toast('Sterlon is moving a little slowly right now.', { duration: 2200, variant: 'burg' });
      }
      ST.emit('mock_fallback', { reason: 'gateway_error', phase: 'prose', runtimeMode });
      renderProseOnlyTurn(cpCall('buildGracefulDegradationProse', text, runtimeMode));
      SL.updateSessionStateForContinuity(RuntimeMode.CLARIFICATION, text);
      unlockComposer();
    }
  }

  /**
   * Refinement continuity path: runtime turn authority, prose beat, governed persistence (RR-E2).
   */
  function coordinateRefinementTurn(text) {
    const axis = SO.parseRefinementAxis(text);
    const target = SO.parseRefinementTarget(text);
    if (axis === 'budget') SL.applyBudgetCeiling(sessionRuntime, SO.parseBudgetCeiling(text));
    if (sessionRuntime.refinementChainDepth >= 3 && !/\b(yes|keep refining|another)\b/i.test(text)) {
      renderProseOnlyTurn('We can keep refining this flight, or start fresh — tell me which you prefer.');
      return true;
    }
    const parent = sessionRuntime.lastRecommendationTurn;
    if (!parent || !parent.cards || !parent.cards.length) {
      renderProseOnlyTurn('Tell me what you\'d like to adjust — softer, bolder, or closer to your budget.');
      return true;
    }
    if (!RR || typeof RR.resolveRefinementFromContext !== 'function') {
      console.error('Sterlon: RecommendationRuntime.resolveRefinementFromContext missing');
      renderProseOnlyTurn('I can refine that once recommendations are back online.');
      return true;
    }
    const targetKey = target === 'set' ? 'best' : (target || 'best');
    const refinedResult = RR.resolveRefinementFromContext({
      parentTurn: parent,
      refinementAxis: axis,
      refinementTarget: target,
      budgetCeiling: sessionRuntime.budgetCeiling,
      journeyLevel: parent.journeyLevel || getEffectiveJourneyLevel(text),
      sourcePrompt: (parent.provenance && parent.provenance.promptText) || text,
      spiritLadder: SPIRIT_INTENSITY_LADDER,
      cigarLadder: CIGAR_INTENSITY_LADDER,
      refinementSource: 'chat-refinement-chip',
      peatedPourPattern: RT.PEATED_POUR_PATTERN
    });
    if (!refinedResult || !refinedResult.turn) {
      renderProseOnlyTurn('I couldn\'t refine that flight just now — try again or start fresh.');
      return true;
    }
    const refined = refinedResult.turn;
    SL.commitRefinementTurn(sessionRuntime, refined);
    if (typeof RR.saveLastRecommendationTurn === 'function') {
      RR.saveLastRecommendationTurn(refined);
    }
    SL.applyRefinementState(sessionRuntime, axis, targetKey, (sessionRuntime.refinementChainDepth || 0) + 1);
    SL.commitActiveRecommendationSet(refined.cards, text, { resetRefinementChain: false });
    const proseLead = cpCall(
      'buildRefinementLeadProse',
      axis,
      targetKey,
      cardToRefinementTier(refined.cards[0]),
      cardToRefinementTier(parent.cards[0]),
      refinedResult.refinementTail || ''
    );
    renderRefinementProseTurn(proseLead);
    SL.updateSessionStateForContinuity(RuntimeMode.REFINEMENT, text);
    return true;
  }

  /**
   * Prose-only path: gateway prose for greeting/clarification; local copy for hesitant/ambiguous turns.
   */
  async function coordinateProseOnlyConversationalFlow(text, runtimeMode) {
    if (shouldUseGatewayProse(runtimeMode)) {
      ST.emit('gateway_request', { phase: 'prose', responseMode: 'prose' });
      await callGatewayProseTurn(text, runtimeMode);
      finalizeConversationalTurn(text, { saveSession: true });
      return;
    }
    const prose = RT.isHesitantOpenerIntent(text)
      ? cpCall('buildHesitantOpenerProse', text)
      : (/\b(maybe|perhaps|not sure|kind of|sort of)\b/i.test(text)
        ? cpCall('buildSoftAmbiguityProse', text)
        : cpCall('buildClarificationProse', text));
    renderProseOnlyTurn(prose);
  }

  /**
   * Recommendation path: runtime turn authority, then gateway stream presentation.
   */
  async function executeRecommendationPresentationFlow(text, runtimeMode) {
    if (!ensureStackForRecommendation()) {
      finalizeConversationalTurn(text);
      return;
    }
    const runtimeTurn = buildRecommendationTurnForPrompt(text);
    await executeGatewayRecommendationTurn(text, runtimeMode, runtimeTurn);
  }

  // ── Send loop (P1.6 — explicit pipeline stages) ─────────────────────

  function applyTurnSessionIntake(text) {
    SL.applyTurnIntake(sessionRuntime, text, {
      focusHint: RT.inferCategoryFocus(text),
      isPivot: RT.isPivotIntent(text),
      applyEveningMood: function (_sr, t) { rememberEveningMood(t); },
      applyTurnRouting: function (_sr, t) { commitTurnRouting(t); },
      emit: ST.emit
    });
  }

  function handleClosingIntentTurn(text) {
    return TH ? TH.handleClosingIntentTurn(text) : false;
  }

  function resolveTurnMode(text) {
    const runtimeMode = SO.interpretRuntimeMode(text);
    const outputShape = resolveOutputShape(runtimeMode);
    ST.emit('mode_resolved', { runtimeMode, outputShape });
    SL.updateSessionStateAfterTurn(runtimeMode, text);
    return { runtimeMode, outputShape };
  }

  async function executeGatewayRecommendationTurn(text, runtimeMode, runtimeTurn) {
    const runtimeCards = runtimeTurn.cards;

    const typingRow = addTypingIndicator();
    const turnGen = GL.captureStreamGeneration();
    const signal = GL.acquireGatewayFetchSignal();
    let row = null;
    try {
      ST.emit('gateway_request', { phase: 'recommendation', responseMode: 'recommendation', stream: false });
      const response = await SG.callSterlonGateway([
        {
          role: 'system',
          content:
            chpCall('getSystemPrompt', {
              priceCeiling: SO.parseBudgetCeiling(text),
              categoryFocus: SO.getConversationalCategoryFocus() || (RT && RT.inferCategoryFocus ? RT.inferCategoryFocus(text) : null)
            }) +
            chpCall('getPairingSkillsPromptExtra', text) +
            chpCall('getProductTeachingPromptExtra', text, {
              productNames:
                (window.RecommendationPresentation &&
                  typeof window.RecommendationPresentation.productDisplayNamesFromCards === 'function'
                  ? window.RecommendationPresentation.productDisplayNamesFromCards(runtimeCards)
                  : ProductKnowledge && typeof ProductKnowledge.productNamesFromCards === 'function'
                    ? ProductKnowledge.productNamesFromCards(runtimeCards)
                    : [])
            }) +
            chpCall('getTurnConstraintsPromptExtra', text) +
            chpCall('getFlightBrandPromptExtra', text) +
            chpCall('getSublineBodyPromptExtra', text) +
            '\n\n' +
            responseStylePrompt(currentResponseStyle) +
            '\n\n' +
            ((CHP && CHP.CONCIERGE_VOICE_RULES) || '') +
            '\n\n' +
            ((CHP && CHP.RECOMMENDATION_LIVE_PROSE_RULES) || '') +
            chpCall('getTurnAuthorityPromptExtra', runtimeCards)
        },
        ...buildGatewayHistory()
      ], {
        stream: false,
        responseMode: 'recommendation',
        maxTokens: currentResponseStyle === 'quick' ? 380 : currentResponseStyle === 'luxury' ? 620 : 500,
        temperature: currentResponseStyle === 'luxury' ? 0.8 : 0.7,
        signal
      }, gatewayContext());

      // Keep typing indicator until JSON completion is parsed — then render settled prose.
      const fullText = await SG.readGatewayText(response, PP.repairMojibake);
      typingRow.remove();

      if (!GL.isStreamActive(turnGen)) {
        return;
      }

      row = document.createElement('div');
      row.className = 'sterlon-bubble-row';
      row.innerHTML = '<div class="sterlon-bubble-avatar"><img src="assets/images/sterlon.jpg" alt="" class="sterlon-avatar-img"/></div><div class="sterlon-bubble-stack"><div class="ai-bubble"></div></div>';
      document.getElementById('chat').appendChild(row);
      const wrap = row.querySelector('.sterlon-bubble-stack');

      // LLM response is prose only — strip any accidental [[RECO]] block (Phase D: no prose authority).
      const RP = window.RecommendationPresentation;
      const visibleLead = RP && typeof RP.stripLlmRecoAuthority === 'function'
        ? RP.stripLlmRecoAuthority(PP.repairMojibake(fullText))
        : PP.repairMojibake(fullText).replace(/\[\[RECO\]\][\s\S]*?\[\[\/RECO\]\]/g, '').trim();
      await PL.presentStagedRecommendation(wrap, visibleLead, runtimeCards, text, {
        profile: 'recommendation_gateway',
        proseDelivery: 'settled',
        enforceRuntimeAuthority: true,
        useProseAsIs: true
      }, turnGen);
      unlockComposer();
    } catch (err) {
      if (typingRow && typingRow.remove) typingRow.remove();
      if (row && row.remove) row.remove();
      if (GL.isGatewayAbortError(err) || !GL.isStreamActive(turnGen)) { unlockComposer(); return; }
      console.error('Sterlon gateway error:', err);
      ST.emit('gateway_error', { phase: 'recommendation', message: String(err && err.message ? err.message : err) });
      ST.emit('mock_fallback', { reason: 'gateway_error', phase: 'recommendation', runtimeMode });
      if (window.toast) {
        toast('Sterlon is moving a little slowly right now.', { duration: 2400, variant: 'burg' });
      }
      renderProseOnlyTurn(cpCall('buildGracefulDegradationProse', text, runtimeMode));
    }
  }

  async function send() {
    if (_sendLocked) return;
    const composer = document.getElementById('composer');
    if (!composer) return;
    const text = composer.value.trim();
    if (!text) return;

    if (window.LoungeCatalog && typeof window.LoungeCatalog.ready === 'function') {
      try {
        await window.LoungeCatalog.ready();
      } catch (_catalogErr) {
        if (window.toast) {
          toast('Menu is still loading — try again in a moment.', { duration: 2400, variant: 'burg' });
        }
        return;
      }
    }

    lockComposer();
    GL.cancelActivePresentations();
    GL.abortInFlightGatewayFetch();
    (SA && SA.setPinned ? SA.setPinned(true) : null);
    appendUserBubble(text);
    composer.value = '';
    conversationHistory.push({ role: 'user', content: PP.repairMojibake(text) });
    saveChatState();

    if (activeTastingDemo) {
      handleTastingDemoReply(text);
      return;
    }

    applyTurnSessionIntake(text);

    if (handleAnchoredPairingTurn(text)) {
      finalizeConversationalTurn(text);
      return;
    }
    if (handleExpertiseTurn(text)) {
      finalizeConversationalTurn(text);
      return;
    }
    if (handleContinuityTurn(text)) {
      finalizeConversationalTurn(text);
      return;
    }

    if (handleClosingIntentTurn(text)) return;

    const { runtimeMode, outputShape } = resolveTurnMode(text);

    if (outputShape === OutputShape.PROSE_ONLY) {
      await coordinateProseOnlyConversationalFlow(text, runtimeMode);
      return;
    }

    await executeRecommendationPresentationFlow(text, runtimeMode);
  }

  function ask(btn) {
    const composer = document.getElementById('composer');
    if (!composer) return;
    composer.value = (btn.textContent || '').trim();
    send();
  }

  function newChat() {
    archiveCurrentThread('new-chat');
    clearChatState();
    renderStarterConversation();
    closeHistoryDrawer();
    if (window.toast) toast('Started a new conversation', { duration: 1600 });
  }

  // ── Quick-action chip handler (replaces the inline one) ─────────────

  function toggleComposerTools(evt) {
    if (evt && evt.stopPropagation) evt.stopPropagation();
    const menu = document.getElementById('composer-tools-menu');
    const btn = document.getElementById('composer-tools-btn');
    if (!menu || !btn) return;
    const open = !menu.hidden;
    menu.hidden = open;
    btn.setAttribute('aria-expanded', open ? 'false' : 'true');
  }

  function closeComposerTools() {
    const menu = document.getElementById('composer-tools-menu');
    const btn = document.getElementById('composer-tools-btn');
    if (menu) menu.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function quickAction(btn, action) {
    closeComposerTools();
    if (action === 'more') {
      if (window.toast) toast('Customize chips in Lounge Settings -> Sterlon');
      return;
    }
    if (action === 'log') {
      beginTastingDemo('');
      return;
    }
    if (action === 'wildcard' || action === 'research' || action === 'recommend') {
      const composer = document.getElementById('composer');
      if (composer) composer.value = buildRandomCigarActionPrompt(action);
      send();
      return;
    }
    const composer = document.getElementById('composer');
    if (composer) composer.value = (btn.textContent || '').trim();
    send();
  }

  // ── DOM event wiring ────────────────────────────────────────────────

  function attachListeners() {
    initScrollAnchoring();
    const composer = document.getElementById('composer');
    if (composer) {
      composer.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          send();
        }
      });
    }
    const chat = document.getElementById('chat');
    if (chat) {
      chat.addEventListener('click', e => {
        const moreToggle = e.target.closest('.sterlon-reco-more-toggle');
        if (moreToggle) {
          const panel = moreToggle.parentElement && moreToggle.parentElement.querySelector('.sterlon-followups-advanced');
          const open = moreToggle.getAttribute('aria-expanded') === 'true';
          moreToggle.setAttribute('aria-expanded', open ? 'false' : 'true');
          if (panel) panel.hidden = open;
          scrollChat();
          return;
        }
        const quickBtn = e.target.closest('.sterlon-quick-action-btn');
        if (quickBtn) {
          const action = quickBtn.getAttribute('data-action');
          const c = document.getElementById('composer');
          if (action === 'lighter') {
            if (c) { c.value = REFINEMENT_CHIP_LABELS.lighter; send(); }
          } else if (action === 'bolder') {
            if (c) { c.value = REFINEMENT_CHIP_LABELS.bolder; send(); }
          } else if (action === 'contrast') {
            if (c) { c.value = REFINEMENT_CHIP_LABELS.contrast; send(); }
          } else if (action === 'save-flight') {
            if (!quickBtn.classList.contains('is-saved')) {
              quickBtn.classList.add('is-saved');
              const span = quickBtn.querySelector('span');
              if (span) span.textContent = 'Saved';
              if (window.toast) toast('Flight saved to your cigar library.', { duration: 2200 });
            }
          }
          return;
        }

        const chip = e.target.closest('.sterlon-follow-chip');
        if (!chip) return;
        const refinement = chip.getAttribute('data-refinement');
        const comparison = chip.getAttribute('data-comparison');
        const c = document.getElementById('composer');
        if (!c) return;
        if (refinement) {
          c.value = REFINEMENT_CHIP_LABELS[refinement] || refinement;
          send();
          return;
        }
        if (comparison) {
          c.value = 'show me both side-by-side';
          send();
          return;
        }
        const prompt = chip.getAttribute('data-prompt') || '';
        if (!prompt) return;
        c.value = prompt;
        send();
      });
    }
    document.addEventListener('click', e => {
      const menu = document.getElementById('composer-tools-menu');
      const btn = document.getElementById('composer-tools-btn');
      if (!menu || menu.hidden) return;
      if (menu.contains(e.target) || (btn && btn.contains(e.target))) return;
      closeComposerTools();
    });
  }

  // ── Expose for inline onclicks + page integration ────────────────────

  window.send                 = send;
  window.ask                  = ask;
  window.newChat              = newChat;
  window.quickAction          = quickAction;
  window.toggleComposerTools  = toggleComposerTools;
  window.setResponseStyle     = setResponseStyle;
  window.openHistoryDrawer    = openHistoryDrawer;
  window.closeHistoryDrawer   = closeHistoryDrawer;
  window.restoreThread        = restoreThread;
  window.beginTastingDemo     = beginTastingDemo;

  // Convenience for debugging / future API swap-in.
  window.Sterlon = {
    isGatewayConfigured: () => SG.isSterlonGatewayConfigured(),
    getGatewayUrl: () => SG.getSterlonGatewayUrl(),
    getRuntimeMode: () => SG.getSterlonRuntimeLabel(),
    getModelHint: () => SG.getSterlonModelHint(),
    getConversationHistory: () => conversationHistory.slice(),
    getSessionRuntime: () => Object.assign({}, sessionRuntime),
    interpretRuntimeMode: SO.interpretRuntimeMode,
    interpretContinuityIntent: SO.interpretContinuityIntent,
    isSpiritOnlyRequest: RT.isSpiritOnlyRequest,
    isCigarOnlyRequest: RT.isCigarOnlyRequest,
    inferCategoryFocus: RT.inferCategoryFocus,
    isExpertiseIntent: RT.isExpertiseIntent,
    classifyExpertiseBranch: RT.classifyExpertiseBranch,
    ExpertiseBranch: RT.ExpertiseBranch,
    isExplicitExpertiseToRecommendationTransition: RT.isExplicitExpertiseToRecommendationTransition,
    resolveExpertiseSubject: function (text) {
      return TH && TH.resolveExpertiseSubject ? TH.resolveExpertiseSubject(text) : null;
    },
    buildExpertiseProse: function (subject) { return cpCall('buildExpertiseProse', subject); },
    buildContextualExpertiseProse: function (subject, text) { return cpCall('buildContextualExpertiseProse', subject, text); },
    buildSensoryFollowupProse: function (subject, text) { return cpCall('buildSensoryFollowupProse', subject, text); },
    buildComparativeCuriosityProse: function (subject, text) { return cpCall('buildComparativeCuriosityProse', subject, text); },
    buildConfidenceBoundaryProse: function (text) { return cpCall('buildConfidenceBoundaryProse', text); },
    detectEveningMood: RT.detectEveningMood,
    rememberEveningMood,
    detectEveningDimensions: RT.detectEveningDimensions,
    rememberEveningDimensions,
    getMergedEveningDimensions: SO.getMergedEveningDimensions,
    buildDimensionLeadProse: function (text) { return cpCall('buildDimensionLeadProse', text); },
    isConfidenceBoundaryIntent: RT.isConfidenceBoundaryIntent,
    resolveRegistryReferent: function (text) {
      return TH && TH.resolveRegistryReferent ? TH.resolveRegistryReferent(text) : null;
    },
    getActiveRecommendationSet: () => {
      const s = sessionRuntime.activeRecommendationSet;
      return s ? JSON.parse(JSON.stringify(s)) : null;
    },
    getSessionProductRegistry: () => sessionRuntime.sessionProductRegistry.slice(),
    resolveFlavorRoute,
    resolveDeckKey: text => resolveDeckKey(text || ''),
    scoreMenuByFlavor: (text, opts) => {
      const SFM = getFlavorMatch();
      return SFM ? SFM.scoreMenu(text, opts) : null;
    },
    shouldRenderRecommendationFlight,
    getEffectiveJourneyLevel: promptText => getEffectiveJourneyLevel(promptText || ''),
    resolvePilotRecommendationCards: promptText => buildRecommendationCards(promptText || ''),
    buildRecommendationTurnForPrompt: promptText => buildRecommendationTurnForPrompt(promptText || ''),
    detectBrandHint: text => RT.detectBrandHint(text || ''),
    parseBudgetCeiling: text => SO.parseBudgetCeiling(text || ''),
    RuntimeMode,
    OutputShape,
    clearAll: () => {
      clearChatState();
      try { localStorage.removeItem(THREADS_STORAGE_KEY); } catch (_) {}
      renderStarterConversation();
    }
  };


  function conciergeCtx() {
    return {
      sessionRuntime: sessionRuntime,
      currentTurnDeckKey: currentTurnDeckKey,
      spiritIntensityLadder: SPIRIT_INTENSITY_LADDER,
      cigarIntensityLadder: CIGAR_INTENSITY_LADDER,
      inferRecoSlotFromTurn: inferRecoSlotFromTurn,
      validateVisibleText: validateVisibleText,
      RuntimeMode: RuntimeMode
    };
  }

  if (CP && CP.setContextProvider) {
    CP.setContextProvider(function () { return conciergeCtx(); });
  }

  if (TH && TH.setHost) {
    TH.setHost({
      getSessionRuntime: function () { return sessionRuntime; },
      RT: RT, SO: SO, SL: SL, PL: PL, GL: GL, RuntimeMode: RuntimeMode,
      buildConfidenceBoundaryProse: CP && CP.buildConfidenceBoundaryProse,
      buildExpertiseProseForBranch: CP && CP.buildExpertiseProseForBranch,
      buildEducationalPairingComparisonProse: CP && CP.buildEducationalPairingComparisonProse,
      renderProseOnlyTurn: renderProseOnlyTurn,
      renderRecallTurn: renderRecallTurn,
      renderComparisonTurn: renderComparisonTurn,
      buildReferentClarifyProse: CP && CP.buildReferentClarifyProse,
      buildAnchoredCigarPairingProse: CP && CP.buildAnchoredCigarPairingProse,
      buildRecommendationTurnForPrompt: buildRecommendationTurnForPrompt,
      renderRecommendationTurn: renderRecommendationTurn,
      synchronizeRecommendationContinuity: synchronizeRecommendationContinuity,
      coordinateRefinementTurn: coordinateRefinementTurn,
      buildClosingProse: CP && CP.buildClosingProse,
      finalizeConversationalTurn: finalizeConversationalTurn,
      unlockComposer: unlockComposer
    });
  }

  // Wire P1.8 presentation lifecycle (after saveChatState + DOM helpers exist).
  if (PL) {
    PL.setHistoryProvider(function () { return conversationHistory; });
    PL.setPresentationHost({
      saveChatState: saveChatState,
      getCurrentResponseStyle: function () { return currentResponseStyle; },
      scrollChat: scrollChat,
      addTypingIndicator: addTypingIndicator,
      appendAssistantBubble: appendAssistantBubble,
      createAssistantMessageRow: createAssistantMessageRow,
      validateCards: validateCards,
      buildSommelierRecommendationProse: CP && CP.buildSommelierRecommendationProse,
      validateVisibleText: validateVisibleText,
      renderRecommendationActions: renderRecommendationActions,
      formatConciergeText: formatConciergeText,
      syncGlobalQuickActionsBar: syncGlobalQuickActionsBar
    });
  }

  // ── Boot ─────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', () => {
    const stackResult = validateSterlonStack();
    if (!stackResult.ok) showStackDegradedBanner(stackResult.missing);
    if (document.documentElement) {
      document.documentElement.dataset.sterlonRuntime = SG.getSterlonRuntimeLabel();
    }
    attachListeners();
    bindHistoryDrawerEvents();
    syncGlobalQuickActionsBar();
    loadChatState();
    (SA && SA.setPinned ? SA.setPinned(true) : null);
    scrollChat({ force: true, smooth: false });
  });
})();
