/**
 * SterlonConciergeProse — thin facade over shared + expertise + recommendation modules.
 *
 * Wired from sterlon-chat.js via setContextProvider(() => ({ ... })).
 * Architecture: docs/internal/STERLON_CHAT_SHRINK_4 (CS-5 concierge prose split).
 */
(function (global) {
  'use strict';

  var Shared = global.SterlonConciergeProseShared;
  var Expertise = global.SterlonConciergeExpertise;
  var Recommendation = global.SterlonConciergeRecommendationProse;

  if (!Shared || !Expertise || !Recommendation) {
    global.SterlonConciergeProse = Shared
      ? { setContextProvider: Shared.setContextProvider }
      : {};
    return;
  }

  global.SterlonConciergeProse = Object.assign(
    { setContextProvider: Shared.setContextProvider },
    Expertise,
    Recommendation
  );
})(typeof window !== 'undefined' ? window : global);
