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
   * @param {{ userText: string, gen: *, signal: AbortSignal, getGatewayContext: function, getHistory: function }} opts
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

    function onDelta(fullText) {
      if (!fullText || !useStream) return;
      ensureBubble();
      lastFull = fullText;
      if (rafPending) return;
      rafPending = true;
      global.requestAnimationFrame(function () {
        rafPending = false;
        paintTokenStreamBubble(bubble, lastFull, PP, h.scrollChat);
      });
    }

    try {
      var systemPrompt = (GSM && GSM.buildGrokSystemPrompt)
        ? GSM.buildGrokSystemPrompt(userText)
        : ((GSM && GSM.GROK_SOMMELIER_SYSTEM_PROMPT) || '');
      var response = await SG.callSterlonGateway([
        { role: 'system', content: systemPrompt },
        ...(opts.getHistory ? opts.getHistory() : [])
      ], {
        stream: useStream,
        responseMode: 'prose',
        maxTokens: 720,
        temperature: 0.94,
        signal: signal
      }, opts.getGatewayContext ? opts.getGatewayContext() : {});

      var content = useStream
        ? await SG.readGatewayStreamText(response, PP.repairMojibake, { signal: signal, onDelta: onDelta })
        : await SG.readGatewayText(response, PP.repairMojibake);

      if (typingRow && typingRow.remove) typingRow.remove();
      if (!GL.isStreamActive || !GL.isStreamActive(gen)) return;

      var parsed = (GSM && GSM.parseGrokSommelierResponse)
        ? GSM.parseGrokSommelierResponse(content || '', userText)
        : { prose: content || '', chips: [] };
      var prose = PP.humanizePresentationProse(parsed.prose || '');
      var beatOpts = {
        promptText: userText,
        followupChips: parsed.chips || []
      };

      if (useStream && bubble && SPL && SPL.finalizeStreamedProseBeat) {
        await SPL.finalizeStreamedProseBeat(wrap, bubble, prose, 'recommendation_gateway', gen, beatOpts);
        return;
      }

      if (SPL && SPL.presentProseBeat) {
        await SPL.presentProseBeat(prose, 'recommendation_gateway', gen, Object.assign({}, beatOpts, {
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
