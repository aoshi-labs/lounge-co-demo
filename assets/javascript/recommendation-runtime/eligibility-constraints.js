/**
 * RecommendationEligibilityConstraints — hard eligibility gate for cigar candidates.
 *
 * ARCHITECTURAL POSITION:
 *   Runs inside RecommendationGenerate.generateRecommendations() AFTER broad catalog
 *   filters (budget, body, wrapper, policy, brand lock) and BEFORE scoring, ranking,
 *   and slot picking.
 *
 * What this module does:
 *   • Extracts explicit hard constraints from member prompt text (smoke time, origin).
 *   • Filters candidate cigar IDs against those constraints before scoring.
 *   • Returns degraded metadata when a constraint empties the pool — never silently restores.
 *
 * What this module must NOT do:
 *   • Alter scoring weights, prose, or card labels.
 *   • Create, rank, or select products.
 *   • Silently relax hard constraints in order to produce a non-empty result.
 *
 * Only explicit durations produce a smoke-time hard constraint:
 *   "30-minute smoke" → hard  |  "quick smoke" (no number) → NOT a hard constraint here
 *
 * Origin: "primary" country is read from product.menuLine segment 4 (brief field),
 *   with spec.filler first-token as fallback. Blended fillers (Nicaragua / Honduras)
 *   match on the leading country only. This is documented as a known limitation:
 *   for a fully blended cigar, "Nicaraguan" matches if Nicaragua is the primary filler.
 *
 * Load before: generate.js
 * Depends on: CigarSmokeEstimate (optional, used when available)
 */
(function (global) {
  'use strict';

  /* ── Origin normalization ──────────────────────────────────────────────── */

  var ORIGIN_ALIASES = {
    'nicaraguan': 'Nicaragua',
    'nicaraguan cigar': 'Nicaragua',
    'nicaragua': 'Nicaragua',
    'dominican': 'Dominican Republic',
    'dominican republic': 'Dominican Republic',
    'honduran': 'Honduras',
    'honduran cigar': 'Honduras',
    'honduras': 'Honduras',
    'cuban': 'Cuba',
    'cuban cigar': 'Cuba',
    'cuba': 'Cuba',
    'mexican': 'Mexico',
    'mexican cigar': 'Mexico',
    'mexico': 'Mexico',
    'peruvian': 'Peru',
    'peru': 'Peru',
    'ecuadorian': 'Ecuador',
    'ecuador': 'Ecuador',
    'costa rican': 'Costa Rica',
    'costa rica': 'Costa Rica',
    'american': 'United States',
    'u.s.a.': 'United States',
    'u.s.': 'United States',
    'usa': 'United States',
    'united states': 'United States'
  };

  /* Maps abbreviated menuLine country labels to canonical names. */
  var MENU_LINE_COUNTRY_MAP = {
    'cuban': 'Cuba',
    'dominican': 'Dominican Republic',
    'nicaraguan': 'Nicaragua',
    'honduran': 'Honduras',
    'mexican': 'Mexico',
    'peruvian': 'Peru',
    'ecuadorian': 'Ecuador',
    'costa rican': 'Costa Rica',
    'american': 'United States'
  };

  function normalizeOriginCountry(label) {
    if (!label) return null;
    var lower = String(label).toLowerCase().trim();
    if (ORIGIN_ALIASES[lower]) return ORIGIN_ALIASES[lower];
    if (MENU_LINE_COUNTRY_MAP[lower]) return MENU_LINE_COUNTRY_MAP[lower];
    var canonical = [
      'Nicaragua', 'Dominican Republic', 'Honduras', 'Cuba', 'Mexico',
      'Peru', 'Ecuador', 'Costa Rica', 'United States'
    ];
    for (var i = 0; i < canonical.length; i++) {
      if (lower === canonical[i].toLowerCase()) return canonical[i];
    }
    return null;
  }

  /* ── Smoke-time extraction from prompt ─────────────────────────────────── */

  /*
   * Returns the explicitly stated smoke duration in minutes, or null.
   * Only triggers on explicit numeric durations. Vague phrases like "quick smoke"
   * or "short smoke" (without a number) do NOT produce a hard constraint here —
   * those remain soft scoring preferences handled by OntologyPolicyCore.
   */
  function extractSmokeMinutesFromPrompt(promptText) {
    var text = String(promptText || '').toLowerCase();

    /* "half hour" / "half-hour" → 30 */
    if (/\bhalf[-\s]?hour\b/.test(text)) return 30;

    /* "one hour" / "1 hour" → 60 */
    if (/\bone[-\s]?hour\b/.test(text)) return 60;

    /* "two hours" → 120 */
    if (/\btwo[-\s]?hours?\b/.test(text)) return 120;

    /* "I have [about] X minutes/mins" — explicit time window */
    var haveMatch = text.match(/\bi\s+have\s+(?:about\s+)?(\d+)\s*[-]?\s*min(?:ute)?s?\b/);
    if (haveMatch) {
      var haveMins = parseInt(haveMatch[1], 10);
      if (haveMins >= 10 && haveMins <= 150) return haveMins;
    }

    /* "about X minutes" */
    var aboutMatch = text.match(/\babout\s+(\d+)\s*[-]?\s*min(?:ute)?s?\b/);
    if (aboutMatch) {
      var aboutMins = parseInt(aboutMatch[1], 10);
      if (aboutMins >= 10 && aboutMins <= 150) return aboutMins;
    }

    /* "X-minute smoke" / "X min smoke" / "X minute" — explicit numeric duration */
    var explicitMatch = text.match(/\b(\d+)\s*[-]?\s*min(?:ute)?s?\b/);
    if (explicitMatch) {
      var mins = parseInt(explicitMatch[1], 10);
      if (mins >= 10 && mins <= 150) return mins;
    }

    /* "X hour" / "X hours" */
    var hourMatch = text.match(/\b(\d+)\s*[-]?\s*hours?\b/);
    if (hourMatch) {
      var h = parseInt(hourMatch[1], 10);
      if (h >= 1 && h <= 3) return h * 60;
    }

    return null;
  }

  /* ── Origin extraction from prompt ─────────────────────────────────────── */

  var ORIGIN_PATTERNS = [
    { pattern: /\bnicaraguan?\b|\bfrom nicaragua\b/, result: 'Nicaragua' },
    { pattern: /\bdominican\b|\bfrom dominican republic\b|\bfrom the dominican\b/, result: 'Dominican Republic' },
    { pattern: /\bhonduran?\b|\bfrom honduras\b/, result: 'Honduras' },
    { pattern: /\bcuban?\b|\bfrom cuba\b/, result: 'Cuba' },
    { pattern: /\bmexican?\b|\bfrom mexico\b/, result: 'Mexico' }
  ];

  function extractOriginFromPrompt(promptText) {
    var text = String(promptText || '').toLowerCase();
    for (var i = 0; i < ORIGIN_PATTERNS.length; i++) {
      if (ORIGIN_PATTERNS[i].pattern.test(text)) {
        return ORIGIN_PATTERNS[i].result;
      }
    }
    return null;
  }

  /* ── Product country lookup ─────────────────────────────────────────────── */

  /*
   * Extracts the primary country from a product object.
   *
   * Priority:
   *   1. product.menuLine segment 4 (brief field, set by catalog-client.js hydration)
   *      Format: "Name · Size · Shape · Body · Country · $Price · Notes: ..."
   *   2. product.spec.filler first token (before "/" separator)
   *      Blended fillers like "Nicaragua / Honduras" → "Nicaragua"
   *      Parenthetical variants like "Nicaragua (Estelí, Jalapa)" → "Nicaragua"
   *
   * Limitation: blended-filler cigars match on the primary (first-listed) country only.
   * A "Honduras / Nicaragua" filler cigar does NOT match a "Nicaraguan cigar" request.
   */
  function getProductCountry(product) {
    if (!product) return null;

    var menuLine = String(product.menuLine || '');
    if (menuLine) {
      var parts = menuLine.split(' · ');
      if (parts.length > 4 && parts[4]) {
        var label = parts[4].trim();
        var fromMenu = MENU_LINE_COUNTRY_MAP[label.toLowerCase()] || normalizeOriginCountry(label);
        if (fromMenu) return fromMenu;
      }
    }

    var filler = String((product.spec && product.spec.filler) || '');
    if (filler) {
      var primaryFiller = filler.split(/\s*[\/,]\s*/)[0].trim();
      primaryFiller = primaryFiller.replace(/\s*\(.*\)/, '').trim();
      var fromFiller = normalizeOriginCountry(primaryFiller);
      if (fromFiller) return fromFiller;
    }

    return null;
  }

  /* ── Smoke time estimation for a single cigar ───────────────────────────── */

  /*
   * Returns smoke time in minutes for a product (object) or cigar ID (string).
   * Prefers CigarSmokeEstimate.estimateSmokeMinutes() when available, since it
   * also derives from stick dimensions and vitola hints.
   *
   * For unknown smoke time, returns null — callers must treat null as "does not
   * satisfy an explicit smoke-time hard constraint."
   */
  function estimateSmokeMinutesForEligibility(productOrId, productIds) {
    var product;
    if (productOrId !== null && typeof productOrId === 'object') {
      product = productOrId;
    } else {
      var pid = productIds || (typeof global !== 'undefined' ? global.RecommendationProductIds : null);
      if (!pid || typeof pid.getById !== 'function') return null;
      product = pid.getById('cigar', productOrId);
    }
    if (!product) return null;

    var CSE = typeof global !== 'undefined' ? global.CigarSmokeEstimate : null;
    if (CSE && typeof CSE.estimateSmokeMinutes === 'function') {
      var fromCSE = Number(CSE.estimateSmokeMinutes(product));
      if (Number.isFinite(fromCSE) && fromCSE > 0 && fromCSE < 200) {
        return fromCSE;
      }
    }

    var smokeTime = product.spec && product.spec.smokeTime;
    if (!smokeTime) return null;

    var st = String(smokeTime).trim().toLowerCase();

    /* "2 hr+" → 130 (intentionally above any normal constraint max) */
    if (/2\s*hr\+?/.test(st) || /2\s*hour\+?/.test(st)) return 130;

    /* "X hr" / "X hour" */
    var hrMatch = st.match(/^(\d+)\s*h(?:r|ours?)?\+?$/);
    if (hrMatch) return parseInt(hrMatch[1], 10) * 60;

    /* "X–Y min" range → midpoint */
    var rangeMatch = st.match(/(\d+)\s*[-–]\s*(\d+)/);
    if (rangeMatch) return (parseInt(rangeMatch[1], 10) + parseInt(rangeMatch[2], 10)) / 2;

    /* "X min" / "X mins" / "X minutes" */
    var minuteMatch = st.match(/(\d+)\s*min/);
    if (minuteMatch) return parseInt(minuteMatch[1], 10);

    /* Bare number (treat as minutes) */
    var bareMatch = st.match(/^(\d+)$/);
    if (bareMatch) return parseInt(bareMatch[1], 10);

    return null;
  }

  /* ── Hard constraint extraction ─────────────────────────────────────────── */

  /*
   * Parses a member prompt and returns structured hard constraints.
   * The `toleranceMinutes` argument is a fallback default from generate.js.
   * The eligibility module owns final tolerance derivation — for now ±10 min.
   */
  function extractHardConstraints(opts) {
    var o = opts || {};
    var promptText = o.promptText || '';
    var toleranceMinutes = typeof o.toleranceMinutes === 'number' ? o.toleranceMinutes : 10;

    var targetSmokeMinutes = extractSmokeMinutesFromPrompt(promptText);
    var requiredOriginCountry = extractOriginFromPrompt(promptText);

    var constraints = [];
    var smokeAllowedRange = null;

    if (targetSmokeMinutes != null) {
      smokeAllowedRange = [
        Math.max(10, targetSmokeMinutes - toleranceMinutes),
        targetSmokeMinutes + toleranceMinutes
      ];
      constraints.push({
        type: 'smoke_time',
        mode: 'hard',
        targetSmokeMinutes: targetSmokeMinutes,
        allowedRange: smokeAllowedRange
      });
    }

    if (requiredOriginCountry) {
      constraints.push({
        type: 'origin',
        mode: 'hard',
        requiredOriginCountry: requiredOriginCountry
      });
    }

    return {
      targetSmokeMinutes: targetSmokeMinutes,
      smokeToleranceMinutes: toleranceMinutes,
      smokeAllowedRange: smokeAllowedRange,
      requiredOriginCountry: requiredOriginCountry,
      constraints: constraints
    };
  }

  /* ── Hard eligibility gate ──────────────────────────────────────────────── */

  /*
   * Applies hard constraints to a candidate cigar ID pool.
   *
   * Rules:
   *   • A candidate violating a hard constraint is removed from cigarIds.
   *   • If constraints empty the pool, degraded === true with a specific cause.
   *   • fallbackCigarIds: only returned with degraded === true; uses nearest
   *     honest alternative (widened smoke-time window). Never silently used.
   *   • If opts.productIds is missing, returns original pool unchanged with a warning.
   *
   * @param {string[]} candidateCigarIds
   * @param {object}   opts
   * @param {string}   [opts.promptText]
   * @param {string}   [opts.journeyLevel]
   * @param {object}   [opts.sessionRuntime]
   * @param {string}   [opts.bodyConstraint]
   * @param {object}   [opts.budgetFilter]
   * @param {string}   [opts.anchorSpiritId]
   * @param {object}   [opts.productIds]        RecommendationProductIds instance
   * @param {number}   [opts.toleranceMinutes]  Default ±10 min; module may override
   *
   * @returns {{
   *   cigarIds: string[],
   *   fallbackCigarIds: string[]|null,
   *   degraded: boolean,
   *   degradedCause: string|null,
   *   hardConstraints: object,
   *   constraintsApplied: object[]
   * }}
   */
  function applyHardEligibilityConstraints(candidateCigarIds, opts) {
    var o = opts || {};
    var promptText = o.promptText || '';
    var productIds = o.productIds || (typeof global !== 'undefined' ? global.RecommendationProductIds : null);
    var toleranceMinutes = typeof o.toleranceMinutes === 'number' ? o.toleranceMinutes : 10;

    var hardConstraints = extractHardConstraints({
      promptText: promptText,
      journeyLevel: o.journeyLevel,
      sessionRuntime: o.sessionRuntime,
      bodyConstraint: o.bodyConstraint,
      budgetFilter: o.budgetFilter,
      toleranceMinutes: toleranceMinutes
    });

    /* No hard constraints in prompt — return original pool unchanged. */
    if (!hardConstraints.constraints.length) {
      return {
        cigarIds: (candidateCigarIds || []).slice(),
        fallbackCigarIds: null,
        degraded: false,
        degradedCause: null,
        hardConstraints: hardConstraints,
        constraintsApplied: []
      };
    }

    if (!productIds) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[Sterlon][EligibilityConstraints] productIds not available — hard constraints skipped.');
      }
      return {
        cigarIds: (candidateCigarIds || []).slice(),
        fallbackCigarIds: null,
        degraded: false,
        degradedCause: null,
        hardConstraints: hardConstraints,
        constraintsApplied: []
      };
    }

    var cigarIds = (candidateCigarIds || []).slice();
    var constraintsApplied = [];

    /* ── Smoke-time filter ─────────────────────────────────────────────── */
    if (hardConstraints.targetSmokeMinutes != null) {
      var smokeBefore = cigarIds.length;
      var range = hardConstraints.smokeAllowedRange;

      cigarIds = cigarIds.filter(function (id) {
        var mins = estimateSmokeMinutesForEligibility(id, productIds);
        /* Unknown smoke time does not satisfy an explicit constraint. */
        if (mins == null) return false;
        return mins >= range[0] && mins <= range[1];
      });

      constraintsApplied.push({
        type: 'smoke_time',
        mode: 'hard',
        targetSmokeMinutes: hardConstraints.targetSmokeMinutes,
        allowedRange: range,
        beforeCount: smokeBefore,
        afterCount: cigarIds.length
      });
    }

    /* ── Origin filter ─────────────────────────────────────────────────── */
    if (hardConstraints.requiredOriginCountry) {
      var originBefore = cigarIds.length;
      var requiredCountry = hardConstraints.requiredOriginCountry;

      cigarIds = cigarIds.filter(function (id) {
        var product = typeof productIds.getById === 'function'
          ? productIds.getById('cigar', id)
          : null;
        if (!product) return false;
        return getProductCountry(product) === requiredCountry;
      });

      constraintsApplied.push({
        type: 'origin',
        mode: 'hard',
        requiredOriginCountry: requiredCountry,
        beforeCount: originBefore,
        afterCount: cigarIds.length
      });
    }

    /* ── Degraded path — pool emptied ──────────────────────────────────── */
    if (!cigarIds.length) {
      var degradedCause;
      var hasSmoke = hardConstraints.targetSmokeMinutes != null;
      var hasOrigin = !!hardConstraints.requiredOriginCountry;

      if (hasSmoke && hasOrigin) {
        degradedCause = 'no_combined_hard_constraint_match';
      } else if (hasSmoke) {
        degradedCause = 'no_exact_smoke_time_match';
      } else {
        degradedCause = 'no_origin_match';
      }

      if (typeof console !== 'undefined' && console.warn) {
        console.warn(
          '[Sterlon][EligibilityConstraints] Hard eligibility emptied pool — ' +
          degradedCause + '. Returning degraded metadata. Check RecommendationRuntime eligibility.'
        );
      }

      /*
       * Fallback: nearest honest alternative using a widened smoke-time window.
       * Only returned alongside degraded === true — never silently substituted.
       * If the widened window is also empty, fallbackCigarIds is null.
       */
      var fallbackCigarIds = null;
      if (hardConstraints.targetSmokeMinutes != null && hardConstraints.smokeAllowedRange) {
        var originalTolerance = hardConstraints.smokeAllowedRange[1] - hardConstraints.targetSmokeMinutes;
        var widenedMin = Math.max(10, hardConstraints.targetSmokeMinutes - originalTolerance * 2);
        var widenedMax = hardConstraints.targetSmokeMinutes + originalTolerance * 2;

        var fallback = (candidateCigarIds || []).filter(function (id) {
          var mins = estimateSmokeMinutesForEligibility(id, productIds);
          if (mins == null) return false;
          return mins >= widenedMin && mins <= widenedMax;
        });
        if (fallback.length) fallbackCigarIds = fallback;
      }

      return {
        cigarIds: [],
        fallbackCigarIds: fallbackCigarIds,
        degraded: true,
        degradedCause: degradedCause,
        hardConstraints: hardConstraints,
        constraintsApplied: constraintsApplied
      };
    }

    return {
      cigarIds: cigarIds,
      fallbackCigarIds: null,
      degraded: false,
      degradedCause: null,
      hardConstraints: hardConstraints,
      constraintsApplied: constraintsApplied
    };
  }

  /*
   * Re-applies pre-extracted hard constraints to a candidate cigar pool.
   * Used by resolve-refinement.js to preserve parent turn hard eligibility without
   * re-parsing promptText. Shares filter logic with applyHardEligibilityConstraints.
   *
   * @param {string[]} candidateCigarIds
   * @param {object}   opts
   * @param {object}   opts.hardConstraints  Pre-extracted constraints from parent provenance
   * @param {object}   [opts.productIds]
   */
  function applyInheritedHardConstraints(candidateCigarIds, opts) {
    var o = opts || {};
    var inherited = o.hardConstraints;
    var productIds = o.productIds || (typeof global !== 'undefined' ? global.RecommendationProductIds : null);

    if (!inherited || !inherited.constraints || !inherited.constraints.length) {
      return {
        cigarIds: (candidateCigarIds || []).slice(),
        fallbackCigarIds: null,
        degraded: false,
        degradedCause: null,
        hardConstraints: inherited || null,
        constraintsApplied: [],
        inherited: true
      };
    }

    if (!productIds) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[Sterlon][EligibilityConstraints] productIds unavailable — inherited constraints skipped.');
      }
      return {
        cigarIds: (candidateCigarIds || []).slice(),
        fallbackCigarIds: null,
        degraded: false,
        degradedCause: null,
        hardConstraints: inherited,
        constraintsApplied: [],
        inherited: true
      };
    }

    var cigarIds = (candidateCigarIds || []).slice();
    var constraintsApplied = [];

    if (inherited.targetSmokeMinutes != null && inherited.smokeAllowedRange) {
      var smokeBefore = cigarIds.length;
      var range = inherited.smokeAllowedRange;
      cigarIds = cigarIds.filter(function (id) {
        var mins = estimateSmokeMinutesForEligibility(id, productIds);
        if (mins == null) return false;
        return mins >= range[0] && mins <= range[1];
      });
      constraintsApplied.push({
        type: 'smoke_time', mode: 'hard',
        targetSmokeMinutes: inherited.targetSmokeMinutes,
        allowedRange: range,
        beforeCount: smokeBefore, afterCount: cigarIds.length,
        inherited: true
      });
    }

    if (inherited.requiredOriginCountry) {
      var originBefore = cigarIds.length;
      var requiredCountry = inherited.requiredOriginCountry;
      cigarIds = cigarIds.filter(function (id) {
        var product = typeof productIds.getById === 'function' ? productIds.getById('cigar', id) : null;
        if (!product) return false;
        return getProductCountry(product) === requiredCountry;
      });
      constraintsApplied.push({
        type: 'origin', mode: 'hard',
        requiredOriginCountry: requiredCountry,
        beforeCount: originBefore, afterCount: cigarIds.length,
        inherited: true
      });
    }

    if (!cigarIds.length) {
      var hasSmoke = inherited.targetSmokeMinutes != null;
      var hasOrigin = !!inherited.requiredOriginCountry;
      var degradedCause = hasSmoke && hasOrigin
        ? 'no_combined_hard_constraint_match'
        : hasSmoke ? 'no_exact_smoke_time_match' : 'no_origin_match';

      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[Sterlon][EligibilityConstraints] Inherited constraints emptied refinement pool — ' + degradedCause + '.');
      }

      var fallbackCigarIds = null;
      if (inherited.targetSmokeMinutes != null && inherited.smokeAllowedRange) {
        var originalTolerance = inherited.smokeAllowedRange[1] - inherited.targetSmokeMinutes;
        var widenedMin = Math.max(10, inherited.targetSmokeMinutes - originalTolerance * 2);
        var widenedMax = inherited.targetSmokeMinutes + originalTolerance * 2;
        var fallback = (candidateCigarIds || []).filter(function (id) {
          var mins = estimateSmokeMinutesForEligibility(id, productIds);
          if (mins == null) return false;
          return mins >= widenedMin && mins <= widenedMax;
        });
        if (fallback.length) fallbackCigarIds = fallback;
      }

      return {
        cigarIds: [], fallbackCigarIds: fallbackCigarIds, degraded: true,
        degradedCause: degradedCause, hardConstraints: inherited,
        constraintsApplied: constraintsApplied, inherited: true
      };
    }

    return {
      cigarIds: cigarIds, fallbackCigarIds: null, degraded: false,
      degradedCause: null, hardConstraints: inherited,
      constraintsApplied: constraintsApplied, inherited: true
    };
  }

  if (typeof global === 'undefined' || !global) return;

  global.RecommendationEligibilityConstraints = {
    extractHardConstraints: extractHardConstraints,
    applyHardEligibilityConstraints: applyHardEligibilityConstraints,
    applyInheritedHardConstraints: applyInheritedHardConstraints,
    normalizeOriginCountry: normalizeOriginCountry,
    estimateSmokeMinutesForEligibility: estimateSmokeMinutesForEligibility
  };
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : null));
