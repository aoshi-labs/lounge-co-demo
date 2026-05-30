/* ──────────────────────────────────────────────────────────────────────
   sterlon-gateway-client.js — browser → app-owned Sterlon gateway (no provider keys).

   Payload mirrors OpenAI chat completions plus optional runtime_context.
   ────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  var STERLON_GATEWAY_MODEL_DEFAULT = 'sterlon-default';

  function getSterlonGatewayUrl() {
    if (typeof window === 'undefined') return '';
    var url = window.STERLON_GATEWAY_URL || window.LOUNGE_STERLON_GATEWAY_URL || '';
    return typeof url === 'string' ? url.trim() : '';
  }

  function getSterlonModelHint() {
    if (typeof window !== 'undefined') {
      var model = window.STERLON_MODEL || window.LOUNGE_STERLON_MODEL;
      if (model) {
        var trimmed = String(model).trim();
        if (trimmed) return trimmed;
      }
    }
    return STERLON_GATEWAY_MODEL_DEFAULT;
  }

  function isSterlonGatewayConfigured() {
    return getSterlonGatewayUrl().length > 0;
  }

  function getSterlonRuntimeLabel() {
    return isSterlonGatewayConfigured() ? 'gateway' : 'mock';
  }

  /**
   * @param {Array<{role:string,content:string}>} messages
   * @param {object} options - stream, maxTokens, temperature, responseMode
   * @param {{ currentResponseStyle: string, sessionRuntime: object }} context
   */
  function buildSterlonGatewayPayload(messages, options, context) {
    var opts = options || {};
    var ctx = context || {};
    return {
      model: getSterlonModelHint(),
      messages: messages,
      stream: opts.stream === true,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
      response_mode: opts.responseMode || 'prose',
      runtime_context: {
        responseStyle: ctx.currentResponseStyle,
        sessionRuntime: ctx.sessionRuntime ? Object.assign({}, ctx.sessionRuntime) : {}
      }
    };
  }

  function callSterlonGateway(messages, options, context) {
    var endpoint = getSterlonGatewayUrl();
    if (!endpoint) return Promise.reject(new Error('Sterlon gateway is not configured'));
    var opts = options || {};
    // 60s timeout — recommendation turns with Groq can retry on 429 and need the headroom.
    var signals = [];
    if (opts.signal) signals.push(opts.signal);
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      signals.push(AbortSignal.timeout(60000));
    }
    var composedSignal = null;
    if (signals.length === 1) {
      composedSignal = signals[0];
    } else if (signals.length > 1 && typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
      composedSignal = AbortSignal.any(signals);
    } else if (signals.length > 0) {
      composedSignal = signals[0];
    }
    var fetchOpts = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildSterlonGatewayPayload(messages, options, context))
    };
    if (composedSignal) fetchOpts.signal = composedSignal;
    return fetch(endpoint, fetchOpts).then(function (response) {
      if (!response.ok) {
        return response.arrayBuffer().then(function (buffer) {
          var errBody = new TextDecoder('utf-8').decode(buffer);
          throw new Error('Sterlon gateway error ' + response.status + (errBody ? ': ' + errBody.slice(0, 140) : ''));
        });
      }
      return response;
    });
  }

  function readGatewayCompletionText(response) {
    return response.arrayBuffer().then(function (buffer) {
      var payload = JSON.parse(new TextDecoder('utf-8').decode(buffer));
      if (payload && typeof payload.content === 'string') return payload.content;
      if (payload && typeof payload.text === 'string') return payload.text;
      if (payload.choices && payload.choices[0] && payload.choices[0].message) {
        return payload.choices[0].message.content || '';
      }
      return '';
    });
  }

  /**
   * Read a non-streaming gateway completion (JSON body). Preferred path for visionboard mock.
   * @param {Response} response
   * @param {function(string): string} [repairText]
   */
  function readGatewayText(response, repairText) {
    var repair = typeof repairText === 'function' ? repairText : function (s) { return s; };
    return readGatewayCompletionText(response).then(function (text) {
      return repair(text || '');
    });
  }

  /**
   * Read a streaming gateway completion (SSE). Calls streamOpts.onDelta(fullText, delta)
   * as tokens arrive. Falls back to JSON body when the response is not event-stream.
   * @param {Response} response
   * @param {function(string): string} [repairText]
   * @param {{ signal?: AbortSignal, onDelta?: function(string, string) }} [streamOpts]
   */
  function readGatewayStreamText(response, repairText, streamOpts) {
    var repair = typeof repairText === 'function' ? repairText : function (s) { return s; };
    var signal = streamOpts && streamOpts.signal;
    var onDelta = streamOpts && streamOpts.onDelta;
    var contentType = response.headers && response.headers.get
      ? response.headers.get('content-type') || ''
      : '';

    function emitDelta(delta) {
      if (!delta) return;
      fullText += repair(delta);
      if (typeof onDelta === 'function') onDelta(fullText, delta);
    }

    if (!/text\/event-stream/i.test(contentType) || !response.body || !response.body.getReader) {
      return readGatewayCompletionText(response).then(function (text) {
        var repaired = repair(text || '');
        if (typeof onDelta === 'function' && repaired) onDelta(repaired, repaired);
        return repaired;
      });
    }

    var reader = response.body.getReader();
    var decoder = new TextDecoder('utf-8');
    var fullText = '';
    var streamBuffer = '';

    function rejectIfAborted() {
      if (!signal || !signal.aborted) return null;
      try { reader.cancel(); } catch (_) {}
      var err = new DOMException('Aborted', 'AbortError');
      return Promise.reject(err);
    }

    if (signal) {
      signal.addEventListener('abort', function () {
        try { reader.cancel(); } catch (_) {}
      }, { once: true });
    }

    function appendStreamDelta(line) {
      if (!line.startsWith('data: ')) return;
      var data = line.slice(6).trim();
      if (data === '[DONE]') return;
      try {
        var parsed = JSON.parse(data);
        var delta = parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content;
        if (delta) emitDelta(delta);
      } catch (_) {}
    }

    function pump() {
      var aborted = rejectIfAborted();
      if (aborted) return aborted;
      return reader.read().then(function (result) {
        if (result.done) {
          streamBuffer += decoder.decode();
          if (streamBuffer) streamBuffer.split('\n').forEach(appendStreamDelta);
          return fullText;
        }
        streamBuffer += decoder.decode(result.value, { stream: true });
        var lines = streamBuffer.split('\n');
        streamBuffer = lines.pop() || '';
        lines.forEach(appendStreamDelta);
        return pump();
      });
    }

    return pump();
  }

  window.SterlonGateway = {
    STERLON_GATEWAY_MODEL_DEFAULT: STERLON_GATEWAY_MODEL_DEFAULT,
    getSterlonGatewayUrl: getSterlonGatewayUrl,
    getSterlonModelHint: getSterlonModelHint,
    isSterlonGatewayConfigured: isSterlonGatewayConfigured,
    getSterlonRuntimeLabel: getSterlonRuntimeLabel,
    buildSterlonGatewayPayload: buildSterlonGatewayPayload,
    callSterlonGateway: callSterlonGateway,
    readGatewayCompletionText: readGatewayCompletionText,
    readGatewayText: readGatewayText,
    readGatewayStreamText: readGatewayStreamText
  };
})();
