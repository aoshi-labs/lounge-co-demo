/**
 * Embedded spirit seed — pre-hydration fallback only.
 * Canonical spirit products live in ../spirits/ (manifest + reco/brief shards).
 */
(function (global) {
  'use strict';

  var SPIRITS = [];

  global.LoungeProducts = global.LoungeProducts || {};
  global.LoungeProducts.spirits = SPIRITS;
})(typeof window !== 'undefined' ? window : global);
