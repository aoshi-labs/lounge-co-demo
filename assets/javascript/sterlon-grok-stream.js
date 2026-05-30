/**
 * sterlon-grok-stream.js — token streaming for Grok sommelier turns.
 *
 * Streams gateway tokens into the assistant bubble as they arrive, then finalizes
 * with formatted prose (gold product names, pace lines) and follow-up chips.
 */
(function (global) {
  'use strict';

  function prefersReducedMotion() {
    return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function streamVisibleText(raw) {
    var text = String(raw || '');
    var idx = text.search(/\[\[FOLLOW\]\]/i);
    if (idx >= 0) text = text.slice(0, idx);
    return text;
  }

  function paintTokenStreamBubble(bubble, rawText, PP, scrollChat) {
    if (!bubble) return;
    var visible = streamVisibleText(rawText);
    if (!visible) return;
    var escaped = PP.escapeHtml(PP.repairMojibake(visible));
    var line = bubble.querySelector('.sterlon-token-stream');
    if (!line) {
      bubble.classList.add('ai-bubble--plain', 'sterlon-stream-bubble', 'sterlon-token-streaming');
      bubble.innerHTML = '<p class="sterlon-pace-line is-lead sterlon-token-stream">' + escaped + '</p>';
    } else {
      line.innerHTML = escaped;
    }
    if (scrollChat) scrollChat({ smooth: false });
  }

  /**
   * Stream a gateway turn into a live bubble, then finalize with formatted prose.
   * Defaults reproduce the Grok sommelier behavior; callers can override the system
   * prompt, sampling, presentation profile, response parser, and a prose transform.
   *
   * @param {{
   *   userText: string, gen: *, signal: AbortSignal,
   *   getGatewayContext?: function, getHistory?: function,
   *   systemPrompt?: string, responseMode?: string,
   *   maxTokens?: number, temperature?: number, profileKey?: string,
   *   parse?: function(string, string): {prose: string, chips: Array},
   *   transformProse?: function(string): string
   * }} opts
   */
  async function executeTurn(opts) {
    var userText = opts.userText;
    var gen = opts.gen;
    var signal = opts.signal;
    var SG = global.SterlonGateway;
    var PP = global.SterlonProsePipeline;
    var GSM = global.SterlonGrokSommelier;
    var GL = global.SterlonGatewayLifecycle || {};
    var SPL = global.SterlonPresentationLifecycle;
    var h = SPL && SPL.getHost ? SPL.getHost() : {};
    var useStream = !prefersReducedMotion();
    var typingRow = h.addTypingIndicator ? h.addTypingIndicator() : null;
    var created = null;
    var wrap = null;
    var bubble = null;
    var rafPending = false;
    var rafId = 0;
    var streamSettled = false;
    var lastFull = '';

    function ensureBubble() {
      if (typingRow && typingRow.remove) {
        typingRow.remove();
        typingRow = null;
      }
      if (created) return;
      created = h.createAssistantMessageRow ? h.createAssistantMessageRow() : null;
      if (created) {
        wrap = created.wrap;
        bubble = created.bubble;
      }
    }

    // Stop the raw token-stream painter from repainting once the formatted,
    // finalized bubble has been written — otherwise a trailing animation frame
    // can overwrite the formatted prose with raw markdown (race exposed by fast models).
    function settleStream() {
      streamSettled = true;
      if (rafId && global.cancelAnimationFrame) global.cancelAnimationFrame(rafId);
      rafId = 0;
      rafPending = false;
    }

    function onDelta(fullText) {
      if (!fullText || !useStream || streamSettled) return;
      ensureBubble();
      lastFull = fullText;
      if (rafPending) return;
      rafPending = true;
      rafId = global.requestAnimationFrame(function () {
        rafPending = false;
        if (streamSettled) return;
        paintTokenStreamBubble(bubble, lastFull, PP, h.scrollChat);
      });
    }

    try {
      var profileKey = opts.profileKey || 'recommendation_gateway';
      var systemPrompt = opts.systemPrompt != null
        ? opts.systemPrompt
        : ((GSM && GSM.buildGrokSystemPrompt)
          ? GSM.buildGrokSystemPrompt(userText)
          : ((GSM && GSM.GROK_SOMMELIER_SYSTEM_PROMPT) || ''));
      var response = await SG.callSterlonGateway([
        { role: 'system', content: systemPrompt },
        ...(opts.getHistory ? opts.getHistory() : [])
      ], {
        stream: useStream,
        responseMode: opts.responseMode || 'prose',
        maxTokens: opts.maxTokens || 720,
        temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.94,
        signal: signal
      }, opts.getGatewayContext ? opts.getGatewayContext() : {});

      var content = useStream
        ? await SG.readGatewayStreamText(response, PP.repairMojibake, { signal: signal, onDelta: onDelta })
        : await SG.readGatewayText(response, PP.repairMojibake);

      settleStream();
      if (typingRow && typingRow.remove) typingRow.remove();

      var parseFn = typeof opts.parse === 'function'
        ? opts.parse
        : ((GSM && GSM.parseGrokSommelierResponse)
          ? function (c, u) { return GSM.parseGrokSommelierResponse(c, u); }
          : function (c) { return { prose: c || '', chips: [] }; });
      var parsed = parseFn(content || '', userText) || { prose: content || '', chips: [] };
      var prose = PP.humanizePresentationProse(parsed.prose || '');
      if (typeof opts.transformProse === 'function') prose = opts.transformProse(prose);
      var beatOpts = {
        promptText: userText,
        followupChips: parsed.chips || []
      };
      var streamStillActive = GL.isStreamActive && GL.isStreamActive(gen);

      if (useStream && bubble && SPL && SPL.finalizeStreamedProseBeat) {
        await SPL.finalizeStreamedProseBeat(wrap, bubble, prose, profileKey, gen, beatOpts);
        return;
      }

      if (!streamStillActive) return;

      if (SPL && SPL.presentProseBeat) {
        await SPL.presentProseBeat(prose, profileKey, gen, Object.assign({}, beatOpts, {
          proseDelivery: 'settled'
        }));
      }
    } catch (err) {
      if (typingRow && typingRow.remove) typingRow.remove();
      throw err;
    }
  }

  global.SterlonGrokStream = {
    executeTurn: executeTurn,
    streamVisibleText: streamVisibleText
  };
})(typeof window !== 'undefined' ? window : global);
