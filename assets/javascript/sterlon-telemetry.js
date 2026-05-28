/* ──────────────────────────────────────────────────────────────────────
   sterlon-telemetry.js — visionboard telemetry shim (no backend).

   Emits structured CustomEvents and optional console lines when debug is on:
     window.STERLON_TELEMETRY_DEBUG = true
     or localStorage STERLON_TELEMETRY_DEBUG = '1'
   ────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  function isEnabled() {
    try {
      if (typeof window !== 'undefined' && window.STERLON_TELEMETRY_DEBUG) return true;
      if (typeof localStorage !== 'undefined' && localStorage.getItem('STERLON_TELEMETRY_DEBUG') === '1') {
        return true;
      }
    } catch (_) {}
    return false;
  }

  /**
   * @param {string} name - e.g. turn_started, mode_resolved, gateway_request, gateway_error, recommendation_rendered, mock_fallback
   * @param {object} [detail]
   */
  function emit(name, detail) {
    var payload = { event: name, detail: detail || {} };
    if (isEnabled() && typeof console !== 'undefined' && console.info) {
      console.info('[SterlonTelemetry]', name, payload.detail);
    }
    try {
      if (typeof document !== 'undefined' && document.dispatchEvent) {
        document.dispatchEvent(new CustomEvent('sterlon:telemetry', { detail: payload }));
      }
    } catch (_) {}
  }

  window.SterlonTelemetry = {
    emit: emit,
    isEnabled: isEnabled
  };
})();
