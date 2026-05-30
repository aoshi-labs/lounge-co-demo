/**
 * SterlonPresentationLifecycle — paced streaming and staged recommendation reveal (P1.8).
 *
 * Owns conversational presentation timing (think pauses, prose streaming, chip reveal).
 * Does not change routing, RecommendationRuntime authority, or session continuity semantics.
 *
 * Injected by sterlon-chat.js:
 *   setHistoryProvider  → () => conversationHistory (mutable array; push only)
 *   setPresentationHost → chat DOM/persistence callbacks (validateCards, scrollChat, etc.)
 */
(function (global) {
  'use strict';

  let _historyProvider = function () { return []; };
  let _presentationHost = {};

  function setHistoryProvider(fn) { _historyProvider = fn; }
  function setPresentationHost(host) { _presentationHost = host || {}; }

  function _hist() { return _historyProvider(); }
  function _host() { return _presentationHost; }

  function _persist() {
    const h = _host();
    if (h.saveChatState) h.saveChatState();
  }

  function _GL() { return global.SterlonGatewayLifecycle || {}; }
  function _SL() { return global.SterlonSessionLifecycle || {}; }
  function _SP() { return global.SterlonPresentationOverlays || {}; }
  function _PP() { return global.SterlonProsePipeline || {}; }

  function recoVisibleTextOpts(validatedCards, promptText, opts) {
    const RT = global.SterlonChatRouter || null;
    const SL = _SL();
    const sr = SL && typeof SL.getSessionRuntime === 'function' ? SL.getSessionRuntime() : null;
    const categoryFocus =
      (sr && sr.activeCategoryFocus) ||
      (RT && typeof RT.inferCategoryFocus === 'function' ? RT.inferCategoryFocus(promptText) : null);
    return {
      sealedCards: validatedCards,
      bindSealedSlots:
        opts.enforceRuntimeAuthority === true &&
        validatedCards.length >= 2 &&
        !opts.refinement,
      categoryFocus: categoryFocus
    };
  }
  function _CR() { return global.SterlonCardRenderers || {}; }
  function _GP() { return global.SterlonGatewayProse || {}; }
  function _ST() { return global.SterlonTelemetry || { emit: function () {} }; }

  function prefersReducedMotion() {
    return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function delay(ms) {
    if (prefersReducedMotion()) return Promise.resolve();
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function runConversationalPresentation(taskFn) {
    const GL = _GL();
    const gen = GL.captureStreamGeneration ? GL.captureStreamGeneration() : 0;
    Promise.resolve()
      .then(function () { return taskFn(gen); })
      .catch(function (err) { console.error('Sterlon presentation error:', err); });
  }

  function splitProseIntoStreamLines(displayProse) {
    const PP = _PP();
    const h = _host();
    let cleaned = PP.humanizePresentationProse(displayProse).trim();
    if (PP.normalizeSommelierTemplate) cleaned = PP.normalizeSommelierTemplate(cleaned);
    if (!cleaned) {
      return [{ role: 'lead', text: PP.GENERIC_LEAD_FALLBACK }];
    }
    const blocks = PP.splitConciergeProseBlocks ? PP.splitConciergeProseBlocks(cleaned) : null;
    if (blocks && blocks.length) {
      return blocks.map(function (part, idx) {
        return { role: idx === 0 ? 'lead' : 'mood', text: part.trim() };
      });
    }
    if (/\n\n/.test(cleaned)) {
      return cleaned.split(/\n\n+/).filter(Boolean).map(function (part, idx) {
        return { role: idx === 0 ? 'lead' : 'mood', text: part.trim() };
      });
    }
    const sentences = cleaned.match(/[^.!?]+[.!?]?/g) || [cleaned];
    const chunks = [];
    const style = h.getCurrentResponseStyle ? h.getCurrentResponseStyle() : 'deep';
    if (style === 'quick') {
      sentences.slice(0, 3).forEach(function (s) { if (s.trim()) chunks.push(s.trim()); });
    } else {
      for (let i = 0; i < sentences.length && chunks.length < 3; i += 1) {
        const line = sentences[i].trim();
        if (line) chunks.push(line);
      }
    }
    return chunks.map(function (line, idx) {
      return { role: idx === 0 ? 'lead' : 'mood', text: line };
    });
  }

  async function conversationalThinkPause(profileKey, gen) {
    const SP = _SP();
    const GL = _GL();
    const h = _host();
    const profile = SP.STREAM_PROFILES[profileKey] || SP.STREAM_PROFILES.prose;
    const typing = h.addTypingIndicator ? h.addTypingIndicator() : null;
    if (h.scrollChat) h.scrollChat({ smooth: false });
    await delay(profile.thinkMs);
    if (!GL.isStreamActive || !GL.isStreamActive(gen)) {
      if (typing && typing.remove) typing.remove();
      return false;
    }
    if (typing && typing.remove) typing.remove();
    return true;
  }

  async function streamPaceLine(bubble, lineSpec, card, profile, gen, mentionSource) {
    const PP = _PP();
    const CR = _CR();
    const GL = _GL();
    if (!bubble || !lineSpec) return;
    const p = document.createElement('p');
    p.className = 'sterlon-pace-line' + (lineSpec.role === 'lead' ? ' is-lead' : ' is-mood');
    p.classList.add('sterlon-stream-line');
    bubble.appendChild(p);
    const h = _host();
    if (h.scrollChat) h.scrollChat({ smooth: false });

    const words = lineSpec.text.split(/\s+/).filter(Boolean);
    const step = profile.chunkWords || 4;
    let visible = [];
    for (let i = 0; i < words.length; i += step) {
      if (!GL.isStreamActive || !GL.isStreamActive(gen)) return;
      visible = visible.concat(words.slice(i, i + step));
      p.innerHTML = CR.emphasizeProductNamesFromPlain
        ? CR.emphasizeProductNamesFromPlain(visible.join(' '), card, mentionSource || lineSpec.text)
        : CR.emphasizeProductNames(
          PP.applyInlineBold(PP.escapeHtml(PP.repairMojibake(visible.join(' ')))),
          card,
          visible.join(' '),
          mentionSource
        );
      if (h.scrollChat) h.scrollChat({ smooth: false });
      if (i + step < words.length) await delay(profile.wordMs);
    }
    p.innerHTML = CR.emphasizeProductNamesFromPlain
      ? CR.emphasizeProductNamesFromPlain(lineSpec.text, card, mentionSource || lineSpec.text)
      : CR.emphasizeProductNames(
        PP.applyInlineBold(PP.escapeHtml(PP.repairMojibake(lineSpec.text))),
        card,
        lineSpec.text,
        mentionSource
      );
    p.classList.add('is-settled');
  }

  async function streamProseIntoBubble(bubble, displayProse, card, profileKey, gen) {
    const SP = _SP();
    const GL = _GL();
    const profile = SP.STREAM_PROFILES[profileKey] || SP.STREAM_PROFILES.prose;
    const lines = splitProseIntoStreamLines(displayProse);
    bubble.innerHTML = '';
    for (let i = 0; i < lines.length; i += 1) {
      if (!GL.isStreamActive || !GL.isStreamActive(gen)) return;
      if (i === 1) await delay(profile.leadPauseMs);
      else if (i > 1) await delay(profile.segmentPauseMs);
      await streamPaceLine(bubble, lines[i], card, profile, gen, displayProse);
    }
  }

  function markPresentationHidden(el) {
    if (!el) return;
    el.classList.add('sterlon-present-hidden');
    el.setAttribute('aria-hidden', 'true');
  }

  async function revealPresentationLayer(el, settleMs) {
    const h = _host();
    if (!el) return;
    el.classList.remove('sterlon-present-hidden');
    el.removeAttribute('aria-hidden');
    el.classList.add('sterlon-present-in');
    if (h.scrollChat) h.scrollChat({ smooth: false });
    await delay(16);
    el.classList.add('is-visible');
    await delay(settleMs || 360);
    if (h.scrollChat) h.scrollChat({ smooth: false });
  }

  async function revealPresentationChips(actionsBlock, profile, gen) {
    const GL = _GL();
    const h = _host();
    if (!actionsBlock) return;
    actionsBlock.classList.remove('sterlon-present-hidden');
    actionsBlock.removeAttribute('aria-hidden');
    actionsBlock.classList.add('sterlon-present-in');
    await delay(profile.chipsPauseMs || 140);
    if (!GL.isStreamActive || !GL.isStreamActive(gen)) return;
    const chips = actionsBlock.querySelectorAll('.sterlon-follow-chip');
    chips.forEach(function (chip, idx) {
      chip.classList.add('sterlon-present-in');
      chip.style.setProperty('--sterlon-stagger', String(idx * (profile.chipsStaggerMs || 50)) + 'ms');
      requestAnimationFrame(function () { chip.classList.add('is-visible'); });
    });
    const moreToggle = actionsBlock.querySelector('.sterlon-reco-more-toggle');
    if (moreToggle) {
      moreToggle.classList.add('sterlon-present-in');
      moreToggle.style.setProperty('--sterlon-stagger', String(chips.length * (profile.chipsStaggerMs || 50)) + 'ms');
      requestAnimationFrame(function () { moreToggle.classList.add('is-visible'); });
    }
    if (global.Lounge && global.Lounge.renderIcons) global.Lounge.renderIcons();
    await delay((profile.chipsStaggerMs || 50) * Math.min(chips.length + 1, 7) + 100);
    if (h.scrollChat) h.scrollChat({ smooth: false });
  }

  function resolveStreamProfile(profileKey, opts) {
    const SP = _SP();
    const h = _host();
    const base = SP.STREAM_PROFILES[profileKey || 'recommendation'] || SP.STREAM_PROFILES.recommendation;
    if (profileKey !== 'recommendation_gateway') return base;
    const style = h.getCurrentResponseStyle ? h.getCurrentResponseStyle() : 'deep';
    if (style === 'quick') {
      return Object.assign({}, base, { chipsStaggerMs: 0, affordancePauseMs: 40 });
    }
    if (style === 'luxury') {
      return Object.assign({}, base, { affordancePauseMs: 120, chipsPauseMs: 120 });
    }
    return base;
  }

  async function presentStagedRecommendation(wrap, proseInput, cards, promptText, opts, gen) {
    if (prefersReducedMotion()) {
      renderStagedRecommendationPresentation(
        wrap, proseInput, cards, promptText, Object.assign({}, opts, { instant: true })
      );
      return;
    }

    const SP = _SP();
    const GL = _GL();
    const SL = _SL();
    const h = _host();
    const profile = resolveStreamProfile(opts.profile || 'recommendation', opts);
    const validatedCards = h.validateCards
      ? h.validateCards(cards, promptText, {
        preserveAnchoredCigar: opts.preserveAnchoredCigar,
        enforceRuntimeAuthority: opts.enforceRuntimeAuthority === true
      })
      : cards;
    if (!opts.skipCommit && SL.commitActiveRecommendationSet) {
      SL.commitActiveRecommendationSet(validatedCards, promptText, {
        resetRefinementChain: opts.resetRefinementChain !== false
      });
    }

    wrap.classList.add('sterlon-reco-thread', 'sterlon-presenting');
    const bubble = wrap.querySelector('.ai-bubble');
    const displayProse = opts.useProseAsIs
      ? (h.validateVisibleText
        ? h.validateVisibleText(
          proseInput,
          promptText,
          opts.refinement ? 'refinement' : 'recommendation_gateway',
          recoVisibleTextOpts(validatedCards, promptText, opts)
        )
        : proseInput)
      : (h.buildSommelierRecommendationProse
        ? h.buildSommelierRecommendationProse(validatedCards[0], promptText, proseInput)
        : proseInput);

    if (bubble) {
      bubble.classList.add('sterlon-reco-prose');
      if (opts.refinement) bubble.classList.add('sterlon-reco-prose--refinement');
      bubble.innerHTML = '';
    }

    const PP = _PP();
    const slotProse =
      PP && typeof PP.parseFlightSlotProse === 'function'
        ? PP.parseFlightSlotProse(displayProse)
        : { best: '', refined: '', wildcard: '' };
    const streamSource =
      slotProse.best || slotProse.refined || slotProse.wildcard ? slotProse.best || displayProse : displayProse;
    if (opts.proseDelivery === 'settled' && bubble) {
      const proseForBubble = streamSource;
      if (h.formatConciergeText) {
        bubble.innerHTML = h.formatConciergeText(proseForBubble, validatedCards[0]);
      } else {
        global.SterlonPresentationRender.paintSettledProseBubble(bubble, proseForBubble, validatedCards[0]);
      }
      if (h.scrollChat) h.scrollChat({ smooth: false });
    } else {
      const lines = splitProseIntoStreamLines(streamSource);
      for (let i = 0; i < lines.length; i += 1) {
        if (!GL.isStreamActive || !GL.isStreamActive(gen)) return;
        if (i === 1) await delay(profile.leadPauseMs);
        else if (i > 1) await delay(profile.segmentPauseMs);
        await streamPaceLine(bubble, lines[i], validatedCards, profile, gen);
      }
    }

    if (!GL.isStreamActive || !GL.isStreamActive(gen)) return;

    global.SterlonPresentationRender.renderRecommendationCardStack(wrap, validatedCards, slotProse);

    if (h.renderRecommendationActions) h.renderRecommendationActions(wrap);
    const actions = wrap.querySelector('.sterlon-reco-actions');
    markPresentationHidden(actions);
    if (!GL.isStreamActive || !GL.isStreamActive(gen)) return;
    await delay(profile.affordancePauseMs || 0);
    if (!GL.isStreamActive || !GL.isStreamActive(gen)) return;
    await revealPresentationChips(actions, profile, gen);

    wrap.classList.remove('sterlon-presenting');
    wrap.classList.add('sterlon-presented');
    _hist().push({ role: 'assistant', content: displayProse });
    _persist();
    if (h.syncGlobalQuickActionsBar) h.syncGlobalQuickActionsBar();
    if (h.scrollChat) h.scrollChat({ smooth: true });
  }

  async function presentProseBeat(prose, profileKey, gen, options) {
    const opts = options || {};
    const SP = _SP();
    const GP = _GP();
    const GL = _GL();
    const h = _host();
    const profile = profileKey || 'prose';
    const validated = opts.validateExpertise
      ? GP.validateExpertiseProse(prose)
      : (h.validateVisibleText
        ? h.validateVisibleText(prose, opts.promptText, profile)
        : prose);

    if (prefersReducedMotion()) {
      if (h.appendAssistantBubble) {
        const row = h.appendAssistantBubble(validated);
        if (opts.followupChips && opts.followupChips.length && row) {
          const wrap = row.querySelector('.sterlon-bubble-stack');
          if (wrap && h.renderGrokFollowupActions) h.renderGrokFollowupActions(wrap, opts.followupChips);
        }
      }
      _hist().push({ role: 'assistant', content: validated });
      _persist();
      if (h.scrollChat) h.scrollChat({ smooth: true });
      return;
    }

    const created = h.createAssistantMessageRow ? h.createAssistantMessageRow() : { bubble: null };
    const bubble = created.bubble;
    if (bubble) bubble.classList.add('ai-bubble--plain', 'sterlon-stream-bubble');
    if (opts.proseDelivery === 'settled') {
      global.SterlonPresentationRender.paintSettledProseBubble(bubble, validated, opts.highlightCard || null);
      if (h.scrollChat) h.scrollChat({ smooth: false });
    } else {
      await streamProseIntoBubble(bubble, validated, opts.highlightCard || null, profile, gen);
    }
    if (!GL.isStreamActive || !GL.isStreamActive(gen)) return;
    if (opts.followupChips && opts.followupChips.length && created.wrap && h.renderGrokFollowupActions) {
      h.renderGrokFollowupActions(created.wrap, opts.followupChips);
    }
    _hist().push({ role: 'assistant', content: validated });
    _persist();
    if (h.scrollChat) h.scrollChat({ smooth: true });
  }

  async function finalizeStreamedProseBeat(wrap, bubble, prose, profileKey, gen, options) {
    const opts = options || {};
    const GP = _GP();
    const GL = _GL();
    const h = _host();
    const profile = profileKey || 'recommendation_gateway';
    const validated = opts.validateExpertise
      ? GP.validateExpertiseProse(prose)
      : (h.validateVisibleText
        ? h.validateVisibleText(prose, opts.promptText, profile)
        : prose);

    if (bubble && global.SterlonPresentationRender && global.SterlonPresentationRender.paintSettledProseBubble) {
      bubble.classList.remove('sterlon-token-streaming');
      global.SterlonPresentationRender.paintSettledProseBubble(bubble, validated, opts.highlightCard || null);
      if (h.scrollChat) h.scrollChat({ smooth: false });
    }
    if (!GL.isStreamActive || !GL.isStreamActive(gen)) return;
    if (opts.followupChips && opts.followupChips.length && wrap && h.renderGrokFollowupActions) {
      h.renderGrokFollowupActions(wrap, opts.followupChips);
    }
    _hist().push({ role: 'assistant', content: validated });
    _persist();
    if (h.scrollChat) h.scrollChat({ smooth: true });
  }

  function renderStagedRecommendationPresentation(wrap, proseInput, cards, promptText, options) {
    const opts = options || {};
    if (!opts.instant && !prefersReducedMotion()) {
      runConversationalPresentation(function (gen) {
        return presentStagedRecommendation(wrap, proseInput, cards, promptText, opts, gen);
      });
      return;
    }

    const SL = _SL();
    const h = _host();
    const validatedCards = h.validateCards
      ? h.validateCards(cards, promptText, {
        preserveAnchoredCigar: opts.preserveAnchoredCigar,
        enforceRuntimeAuthority: opts.enforceRuntimeAuthority === true
      })
      : cards;
    if (!opts.skipCommit && SL.commitActiveRecommendationSet) {
      SL.commitActiveRecommendationSet(validatedCards, promptText, {
        resetRefinementChain: opts.resetRefinementChain !== false
      });
    }
    wrap.classList.add('sterlon-reco-thread');
    const bubble = wrap.querySelector('.ai-bubble');
    const displayProse = opts.useProseAsIs
      ? (h.validateVisibleText
        ? h.validateVisibleText(
          proseInput,
          promptText,
          opts.refinement ? 'refinement' : 'recommendation_gateway',
          recoVisibleTextOpts(validatedCards, promptText, opts)
        )
        : proseInput)
      : (h.buildSommelierRecommendationProse
        ? h.buildSommelierRecommendationProse(validatedCards[0], promptText, proseInput)
        : proseInput);
    const PP = _PP();
    const slotProseInstant =
      PP && typeof PP.parseFlightSlotProse === 'function'
        ? PP.parseFlightSlotProse(displayProse)
        : { best: '', refined: '', wildcard: '' };
    const proseForBubble =
      slotProseInstant.best || slotProseInstant.refined || slotProseInstant.wildcard
        ? slotProseInstant.best || displayProse
        : displayProse;
    if (bubble) {
      bubble.classList.add('sterlon-reco-prose');
      if (opts.refinement) bubble.classList.add('sterlon-reco-prose--refinement');
      bubble.innerHTML = h.formatConciergeText
        ? h.formatConciergeText(proseForBubble, validatedCards[0])
        : proseForBubble;
    }
    renderRecommendationCardStack(wrap, validatedCards, slotProseInstant);
    if (h.renderRecommendationActions) h.renderRecommendationActions(wrap);
    if (h.syncGlobalQuickActionsBar) h.syncGlobalQuickActionsBar();
    if (global.Lounge && global.Lounge.renderIcons) global.Lounge.renderIcons();
    _hist().push({ role: 'assistant', content: displayProse });
    _ST().emit('recommendation_rendered', {
      profile: opts.refinement ? 'refinement' : 'recommendation',
      cardCount: validatedCards.length,
      skipCommit: !!opts.skipCommit
    });
    _persist();
    if (h.scrollChat) h.scrollChat({ smooth: true });
  }

  global.SterlonPresentationLifecycle = {
    setHistoryProvider: setHistoryProvider,
    setPresentationHost: setPresentationHost,
    getHost: function () { return _presentationHost; },
    splitProseIntoStreamLines: splitProseIntoStreamLines,
    runConversationalPresentation: runConversationalPresentation,
    conversationalThinkPause: conversationalThinkPause,
    presentStagedRecommendation: presentStagedRecommendation,
    presentProseBeat: presentProseBeat,
    finalizeStreamedProseBeat: finalizeStreamedProseBeat,
    renderStagedRecommendationPresentation: renderStagedRecommendationPresentation
  };
})(typeof window !== 'undefined' ? window : global);
