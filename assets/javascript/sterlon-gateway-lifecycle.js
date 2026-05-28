/**
 * SterlonGatewayLifecycle — abort controller + UI generation counter (P1.5).
 *
 * Owns the two mutable module-level state variables that govern gateway
 * cancellation and stale UI-stream invalidation:
 *
 *   activeStreamGeneration  — integer, incremented by cancelActivePresentations();
 *                             presentation functions capture it as `gen` and check
 *                             isStreamActive(gen) to detect superseded turns.
 *   gatewayFetchAbort       — current AbortController; nulled after abort.
 *
 * This module has NO external dependencies (no PP, SR, session, DOM).
 *
 * Most important invariant:
 *   GL owns cancellation signals and stream-invalidation counters only.
 *   It has no opinion on recommendation authority, prose content, or session state.
 */
(function (global) {
  'use strict';

  // -- Module state ---------------------------------------------------------

  let activeStreamGeneration = 0;
  let gatewayFetchAbort = null;

  // -- Abort helpers --------------------------------------------------------

  /**
   * Returns true when err is a fetch/stream abort (AbortError or code 20).
   * Use to silently short-circuit catch blocks on intentional cancellation.
   */
  function isGatewayAbortError(err) {
    return !!(err && (err.name === 'AbortError' || err.code === 20));
  }

  /**
   * Abort any in-flight gateway fetch and clear the stored controller.
   * Safe to call multiple times (no-op when nothing is in flight).
   */
  function abortInFlightGatewayFetch() {
    if (!gatewayFetchAbort) return;
    try { gatewayFetchAbort.abort(); } catch (_) {}
    gatewayFetchAbort = null;
  }

  /**
   * Abort any prior fetch, create a fresh AbortController, and return its signal.
   * Called once per gateway request to guarantee a clean cancellation scope.
   */
  function acquireGatewayFetchSignal() {
    abortInFlightGatewayFetch();
    const controller = new AbortController();
    gatewayFetchAbort = controller;
    return controller.signal;
  }

  // -- UI presentation stream lifecycle -------------------------------------

  /**
   * Invalidate all in-flight UI presentation tasks by bumping the generation
   * counter. Returns the new generation value so callers can capture it as
   * their `gen` without a separate captureStreamGeneration() call.
   */
  function cancelActivePresentations() {
    activeStreamGeneration += 1;
    return activeStreamGeneration;
  }

  /**
   * Read the current generation counter without mutating it.
   * Use inside presentation task wrappers that need to capture gen AFTER a
   * prior cancelActivePresentations() has already run.
   */
  function captureStreamGeneration() {
    return activeStreamGeneration;
  }

  /**
   * Returns true when the captured gen still matches the current generation,
   * i.e., no cancelActivePresentations() has been called since gen was taken.
   * Every async presentation step must guard with this before touching the DOM.
   */
  function isStreamActive(gen) {
    return gen === activeStreamGeneration;
  }

  // -- Public API -----------------------------------------------------------

  global.SterlonGatewayLifecycle = {
    isGatewayAbortError:      isGatewayAbortError,
    abortInFlightGatewayFetch: abortInFlightGatewayFetch,
    acquireGatewayFetchSignal: acquireGatewayFetchSignal,
    cancelActivePresentations: cancelActivePresentations,
    captureStreamGeneration:   captureStreamGeneration,
    isStreamActive:            isStreamActive
  };

})(typeof window !== 'undefined' ? window : global);
