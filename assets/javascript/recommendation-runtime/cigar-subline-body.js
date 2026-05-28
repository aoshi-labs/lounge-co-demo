/**
 * CigarSublineBody — sub-line body truth vs parent-brand name traps.
 *
 * Famous lines (Opus X, Padron, Liga Privada) have softer sub-blends that must not
 * inherit "full body" from the umbrella name. Used when the member asks for full
 * body / bold espresso pairing.
 */
(function (global) {
  'use strict';

  /** Name patterns for blends that read as the parent line but smoke milder. */
  var MILD_SUBLINE_PATTERNS = [
    /\bangel'?s?\s+share\b/i,
    /\bopus\s*x\b.*\bangel/i,
    /\bpadron\b.*\bdamaso\b/i,
    /\bdamaso\b/i,
    /\bliga\s+privada\b.*\bh99\b/i,
    /\bh99\b/i,
    /\bconnecticut\s+shade\b.*\b(liga|drew)/i
  ];

  function findCigar(name) {
    var PIDs = global.RecommendationProductIds;
    return PIDs && typeof PIDs.getProductRef === 'function'
      ? PIDs.getProductRef('cigar', name)
      : null;
  }

  function cigarBodyLabel(name) {
    var p = findCigar(name);
    return (p && ((p.spec && p.spec.body) || p.body)) || '';
  }

  function cigarStrength(name) {
    var p = findCigar(name);
    if (!p || !p.spec || p.spec.strength == null) return null;
    return Number(p.spec.strength);
  }

  function isMildSubline(name) {
    var n = String(name || '');
    var i;
    for (i = 0; i < MILD_SUBLINE_PATTERNS.length; i++) {
      if (MILD_SUBLINE_PATTERNS[i].test(n)) return true;
    }
    var p = findCigar(name);
    if (!p) return false;
    var avoid = (p.avoidIf || (p.guidance && p.guidance.avoidIf) || '').toLowerCase();
    if (
      avoid &&
      /\b(not maximum strength|softer|cream-forward|mild|medium only)\b/.test(avoid)
    ) {
      return true;
    }
    var why = (p.whyRecommend || (p.guidance && p.guidance.whyRecommend) || '').toLowerCase();
    if (why && /\bnot maximum strength\b/.test(why)) return true;
    return false;
  }

  /** Strict full-body: catalog body Full and not a registered mild sub-line. */
  function isStrictFullBodyCigar(name) {
    if (!name || isMildSubline(name)) return false;
    return cigarBodyLabel(name) === 'Full';
  }

  function memberWantsStrictFullBody(o) {
    if (o && o.bodyConstraint === 'full') return true;
    var t = (o && o.promptText) || '';
    return (
      /\bfull[\s-]?body\b|\bfull[\s-]?strength\b|\bfull\s+cigar\b|\bbold\s+espresso\b/i.test(
        t
      ) || (/\bespresso\b/i.test(t) && /\b(full|bold|heavy|intense)\b/i.test(t))
    );
  }

  function filterForFullBodyIntent(names, o) {
    if (!memberWantsStrictFullBody(o)) return names || [];
    var pool = (names || []).filter(function (name) {
      return isStrictFullBodyCigar(name);
    });
    return pool.length ? pool : names || [];
  }

  function pickBestFromRanked(ranked, usedNames, requireStrictFull) {
    var i;
    var row;
    var name;
    for (i = 0; i < ranked.length; i++) {
      row = ranked[i];
      name = row && row.name;
      if (!name || (usedNames && usedNames[name])) continue;
      if (requireStrictFull && !isStrictFullBodyCigar(name)) continue;
      return name;
    }
    return null;
  }

  /**
   * Re-seat BEST PICK when a mild sub-line or Medium-Full slip won the best slot.
   */
  function reconcileBestPickBodyIntent(slots, anchor, candidates, o) {
    if (!slots || !slots.best || !memberWantsStrictFullBody(o)) return slots;
    if (isStrictFullBodyCigar(slots.best)) return slots;

    var PE = global.PairingEngine;
    if (!PE || typeof PE.rankCandidates !== 'function') return slots;

    var pool = (candidates || []).filter(function (name) {
      return name && name !== slots.safe && name !== slots.wildcard && isStrictFullBodyCigar(name);
    });
    if (!pool.length) return slots;

    var ex = {
      slotRole: 'best',
      promptText: o.promptText,
      journeyLevel: o.journeyLevel,
      sessionRuntime: o.sessionRuntime,
      candidateCategory: 'cigar',
      pairingStrategy: 'balanced'
    };
    var ranked = PE.rankCandidates(anchor, pool, ex);
    var pick = pickBestFromRanked(ranked, null, true);
    if (pick) slots.best = pick;
    return slots;
  }

  function buildSublineBodyPromptExtra(o) {
    if (!memberWantsStrictFullBody(o)) return '';
    return (
      '\n\nSUB-LINE BODY TRAP (hard):\n' +
      '- Do NOT treat umbrella names (Opus X, Padron, Liga Privada) as automatically full-bodied. Evaluate the **exact SKU** on the card.\n' +
      '- **Opus X Angel\'s Share** is cream-forward and softer — never describe it as a powerhouse or best pick for bold espresso; espresso will wash it out.\n' +
      '- For full-body + espresso requests, lead with cigars whose CATALOG FACTS body is **Full** (e.g. standard Opus X, Nicaraguan/Cuban full tiers) — not Angel\'s Share–class sub-lines.\n' +
      '- REFINED OPTION and CONTRAST WILDCARD each need their own prose paragraph; do not only narrate BEST PICK.'
    );
  }

  global.CigarSublineBody = {
    isMildSubline: isMildSubline,
    isStrictFullBodyCigar: isStrictFullBodyCigar,
    memberWantsStrictFullBody: memberWantsStrictFullBody,
    filterForFullBodyIntent: filterForFullBodyIntent,
    reconcileBestPickBodyIntent: reconcileBestPickBodyIntent,
    buildSublineBodyPromptExtra: buildSublineBodyPromptExtra
  };
})(typeof window !== 'undefined' ? window : global);
