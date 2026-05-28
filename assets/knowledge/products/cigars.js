/**
 * Embedded cigar seed — pre-hydration fallback only.
 * Canonical cigar products live in ../cigars/ (manifest + reco/brief shards).
 */
(function (global) {
  'use strict';

  var CIGARS = [];

  global.LoungeProducts = global.LoungeProducts || {};
  global.LoungeProducts.cigars = CIGARS;
})(typeof window !== 'undefined' ? window : global);
