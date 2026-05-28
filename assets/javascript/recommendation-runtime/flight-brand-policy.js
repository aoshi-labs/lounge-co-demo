/**
 * FlightBrandPolicy — manufacturer / line diversity for three-slot cigar flights.
 *
 * Default: BEST PICK, REFINED OPTION, and CONTRAST WILDCARD must not share the same
 * manufacturer (first-token or known multi-word prefix).
 *
 * Exception: when the member explicitly requests a single cigar brand, filter the pool
 * to that manufacturer and require distinct lines (menuLine head) instead.
 *
 * Pure module — no DOM. Used by RecommendationGenerate after PairingEngine.pickSlots.
 */
(function (global) {
  'use strict';

  var MULTI_WORD_MAKERS = [
    'arturo fuente',
    'e.p. carrillo',
    'ep carrillo',
    'la aroma de cuba',
    'hoyo de monterrey',
    'romeo y julieta',
    'my father',
    'plasencia',
    'drew estate',
    'liga privada',
    'alec bradley',
    'rocky patel',
    'aj fernandez',
    'brick house',
    'vegas robaina',
    'h. upmann',
    'one off',
    'oneoff'
  ];

  var WILDCARD_OVERUSED = [
    /\bangel'?s?\s+share\b/i,
    /\bopus\s*x\b.*\bangel/i
  ];

  /** Portfolio parent → member manufacturer keys (single-brand lock expands to these). */
  var CIGAR_PORTFOLIOS = {
    ashton: ['ashton', 'la aroma de cuba', 'san cristobal']
  };

  var PORTFOLIO_DISPLAY = {
    ashton: 'Ashton (incl. La Aroma de Cuba & San Cristobal)'
  };

  function findCigar(name) {
    var PIDs = global.RecommendationProductIds;
    return PIDs && typeof PIDs.getProductRef === 'function'
      ? PIDs.getProductRef('cigar', name)
      : null;
  }

  function cigarParentCompany(name) {
    var p = findCigar(name);
    if (!p || !p.parentCompany) return '';
    return String(p.parentCompany).trim().toLowerCase();
  }

  function portfolioMemberKeys(portfolioKey) {
    return CIGAR_PORTFOLIOS[String(portfolioKey || '').toLowerCase()] || null;
  }

  function cigarBrandLockKey(name) {
    var parent = cigarParentCompany(name);
    if (parent) return parent;
    return cigarManufacturerKey(name);
  }

  function cigarManufacturerKey(name) {
    var lower = String(name || '').trim().toLowerCase();
    if (!lower) return '';
    var i;
    for (i = 0; i < MULTI_WORD_MAKERS.length; i++) {
      if (lower.indexOf(MULTI_WORD_MAKERS[i]) === 0) return MULTI_WORD_MAKERS[i];
    }
    return lower.split(/\s+/)[0] || lower;
  }

  /** Blend / line identity — menuLine head when available. */
  function cigarLineKey(name) {
    var p = findCigar(name);
    if (p && p.menuLine) {
      return String(p.menuLine).split('·')[0].trim().toLowerCase();
    }
    var E = global.RecommendationEntropy;
    if (E && typeof E.brandKey === 'function') return E.brandKey(name);
    return cigarManufacturerKey(name);
  }

  function buildBrandNeedles() {
    var lp = global.LoungeProducts;
    var set = Object.create(null);
    var list = (lp && lp.cigars) || [];
    list.forEach(function (c) {
      if (!c || !c.name) return;
      var mk = cigarManufacturerKey(c.name);
      if (mk) set[mk] = true;
      var pk = cigarParentCompany(c.name);
      if (pk) set[pk] = true;
    });
    MULTI_WORD_MAKERS.forEach(function (m) {
      set[m] = true;
    });
    Object.keys(CIGAR_PORTFOLIOS).forEach(function (p) {
      set[p] = true;
    });
    return Object.keys(set).sort(function (a, b) {
      return b.length - a.length;
    });
  }

  function cigarMatchesBrandLock(name, brandKey) {
    var key = String(brandKey || '').toLowerCase();
    if (!key) return true;
    var members = portfolioMemberKeys(key);
    var mk = cigarManufacturerKey(name);
    if (members && members.length) {
      if (members.indexOf(mk) !== -1) return true;
      if (cigarParentCompany(name) === key) return true;
      return false;
    }
    if (mk === key) return true;
    if (cigarParentCompany(name) === key) return true;
    return String(name || '').toLowerCase().indexOf(key) !== -1;
  }

  function userSpecifiesCigarBrand(promptText, brandKey) {
    var t = String(promptText || '').toLowerCase();
    var b = String(brandKey || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!b) return false;
    return (
      new RegExp('(?:only|just|all)\\s+(?:the\\s+)?' + b, 'i').test(t) ||
      new RegExp('(?:three|3|give me|show me)\\s+(?:\\w+\\s+){0,6}' + b, 'i').test(t) ||
      new RegExp(b + '\\s+cigars?', 'i').test(t) ||
      new RegExp('from\\s+' + b, 'i').test(t) ||
      new RegExp(b + '\\s+(?:lines?|blends?|options?|vitolas?)', 'i').test(t) ||
      new RegExp('(?:pair|recommend|suggest).{0,40}' + b + '\\s+cigars?', 'i').test(t)
    );
  }

  /**
   * Returns a manufacturer key when the member explicitly constrains to one cigar brand.
   */
  function detectRequestedCigarBrand(promptText) {
    var t = String(promptText || '').toLowerCase();
    if (!t) return null;
    var needles = buildBrandNeedles();
    var hit = null;
    var i;
    for (i = 0; i < needles.length; i++) {
      if (t.indexOf(needles[i]) !== -1) {
        hit = needles[i];
        break;
      }
    }
    if (!hit || !userSpecifiesCigarBrand(t, hit)) return null;
    return hit;
  }

  function filterCigarsByManufacturer(names, brandKey) {
    var key = String(brandKey || '').toLowerCase();
    if (!key) return names || [];
    return (names || []).filter(function (name) {
      return cigarMatchesBrandLock(name, key);
    });
  }

  function diversityKey(name, mode) {
    return mode === 'line' ? cigarLineKey(name) : cigarManufacturerKey(name);
  }

  function keyInUse(name, usedKeys, mode) {
    var k = diversityKey(name, mode);
    return usedKeys.indexOf(k) !== -1;
  }

  function isOverusedWildcard(name) {
    var n = String(name || '');
    for (var i = 0; i < WILDCARD_OVERUSED.length; i++) {
      if (WILDCARD_OVERUSED[i].test(n)) return true;
    }
    return false;
  }

  function pickAlternate(current, ranked, usedNames, usedKeys, mode, slotRole) {
    var preferNovelty = slotRole === 'wildcard';
    var fallback = current;
    var i;
    var row;
    var name;

    for (i = 0; i < ranked.length; i++) {
      row = ranked[i];
      name = row && row.name;
      if (!name || usedNames[name]) continue;
      if (keyInUse(name, usedKeys, mode)) continue;
      if (preferNovelty && isOverusedWildcard(name)) {
        fallback = fallback || name;
        continue;
      }
      return name;
    }

    for (i = 0; i < ranked.length; i++) {
      row = ranked[i];
      name = row && row.name;
      if (!name || usedNames[name]) continue;
      if (keyInUse(name, usedKeys, mode)) continue;
      return name;
    }

    return current;
  }

  /**
   * Reassign safe / wildcard when they collide on manufacturer (default) or line (brand lock).
   */
  function applyFlightSlotDiversity(slots, ranked, opts) {
    if (!slots || !ranked || !ranked.length) return slots;
    var o = opts || {};
    var mode = o.cigarBrandLock ? 'line' : 'manufacturer';
    var out = {
      best: slots.best,
      safe: slots.safe,
      wildcard: slots.wildcard
    };
    var usedNames = Object.create(null);
    var usedKeys = [];

    function claim(name) {
      if (!name) return;
      usedNames[name] = true;
      usedKeys.push(diversityKey(name, mode));
    }

    if (out.best) claim(out.best);

    if (out.safe && keyInUse(out.safe, usedKeys, mode)) {
      out.safe = pickAlternate(out.safe, ranked, usedNames, usedKeys, mode, 'safe');
    }
    if (out.safe) claim(out.safe);

    if (out.wildcard && keyInUse(out.wildcard, usedKeys, mode)) {
      out.wildcard = pickAlternate(out.wildcard, ranked, usedNames, usedKeys, mode, 'wildcard');
    }

    return out;
  }

  function buildFlightBrandPromptExtra(opts) {
    var o = opts || {};
    var brandLock = o.cigarBrandLock;
    if (brandLock) {
      var label = PORTFOLIO_DISPLAY[brandLock] || brandLock;
      var portfolioExtra =
        portfolioMemberKeys(brandLock) && portfolioMemberKeys(brandLock).length > 1
          ? '\n- This is a **portfolio lock**: distributed lines (e.g. La Aroma de Cuba, San Cristobal under Ashton) count as in-brand — use line diversity, not cross-manufacturer exclusion.\n' +
            '- Example flight shape: Best Pick Ashton VSG · Refined Ashton ESG · Contrast La Aroma de Cuba Mi Amor (or San Cristobal Clasico for power).\n'
          : '';
      return (
        '\n\nFLIGHT BRAND MODE (member requested one manufacturer):\n' +
        '- The member asked for cigars from **' +
        label +
        '** only. Do NOT apply cross-manufacturer brand exclusion.\n' +
        portfolioExtra +
        '- BEST PICK: flagship blend from that brand that best matches the pour (body + flavor bridge).\n' +
        '- REFINED OPTION: a higher-tier, rarer, or more complex line from the same brand — different blend name, not a rename of BEST PICK.\n' +
        '- CONTRAST WILDCARD: same brand, different wrapper shade or strength arc (e.g. Cameroon vs Habano) — still full-bodied if the member asked for full body.\n' +
        '- All three SKUs must be distinct lines/vitolas within **' +
        label +
        '**.'
      );
    }
    return (
      '\n\nFLIGHT DIVERSITY (hard — catalog slots already enforce this):\n' +
      '- BEST PICK, REFINED OPTION, and CONTRAST WILDCARD must each be from a **different manufacturer**. Never place two OneOff, two Arturo Fuente, or two Padron lines in one flight unless the member explicitly requested that brand.\n' +
      '- BEST PICK: the most direct flavor and body match to the beverage.\n' +
      '- REFINED OPTION: a higher-end, more complex, or artisanal cigar from a **different** manufacturer with a distinct flavor story.\n' +
      '- CONTRAST WILDCARD: a cigar that contrasts the best pick on wrapper, bitterness, acidity, or texture — not a sibling vitola from the same line.'
    );
  }

  global.FlightBrandPolicy = {
    cigarManufacturerKey: cigarManufacturerKey,
    cigarParentCompany: cigarParentCompany,
    cigarBrandLockKey: cigarBrandLockKey,
    cigarLineKey: cigarLineKey,
    detectRequestedCigarBrand: detectRequestedCigarBrand,
    filterCigarsByManufacturer: filterCigarsByManufacturer,
    cigarMatchesBrandLock: cigarMatchesBrandLock,
    applyFlightSlotDiversity: applyFlightSlotDiversity,
    buildFlightBrandPromptExtra: buildFlightBrandPromptExtra
  };
})(typeof window !== 'undefined' ? window : global);
