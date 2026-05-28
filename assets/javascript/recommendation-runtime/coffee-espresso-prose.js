/**
 * CoffeeEspressoProse — lounge-native copy for morning / coffee pairing turns.
 * Presentation only; does not affect scoring or slot selection.
 */
(function (global) {
  'use strict';

  function isActive(ctx) {
    if (!ctx || ctx.boldAsk) return false;
    return !!(ctx.morningSession || ctx.coffeeEspressoPairing);
  }

  function normalizeKey(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^a-z0-9 ]/g, '')
      .trim();
  }

  function shortSpiritLabel(name) {
    var n = String(name || '').trim();
    if (!n) return 'the pour';
    var m = n.match(/^(.*?)\s+\d+\s*year/i);
    if (m) return m[1].trim();
    if (n.length > 28) return n.split(/\s+/).slice(0, 3).join(' ');
    return n;
  }

  function spiritBridgeLine(spiritProduct, spiritName) {
    var deck = spiritProduct && spiritProduct.deckKey ? spiritProduct.deckKey : '';
    var blob = [
      spiritName,
      spiritProduct && spiritProduct.spec && spiritProduct.spec.style,
      spiritProduct && spiritProduct.guidance && spiritProduct.guidance.flavorFamily
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    var label = shortSpiritLabel(spiritName);

    if (deck === 'irish' || /\birish\b/.test(blob)) {
      return label + ' gives the espresso a soft malt-and-honey bridge — gentle enough for an early cup.';
    }
    if (deck === 'cognac' || /\bcognac|brandy\b/.test(blob)) {
      return label + ' lends dried fruit and warm oak beside the cup without turning the flight heavy.';
    }
    if (deck === 'rum' || /\brum\b/.test(blob)) {
      return label + ' brings molasses sweetness that flatters bitter coffee more than spice heat.';
    }
    if (/\b(caramel|vanilla|honey|toffee|brown sugar)\b/.test(blob)) {
      return label + ' gives the espresso a caramel-oak bridge — sweetness in the glass, not heat on the finish.';
    }
    return label + ' gives the espresso a caramel-oak bridge — enough sweetness in the glass to frame the smoke.';
  }

  function cigarFlavorHints(cigarProduct, cigarName) {
    var blob = [
      cigarName,
      cigarProduct && cigarProduct.spec && cigarProduct.spec.wrapper,
      cigarProduct && cigarProduct.guidance && cigarProduct.guidance.flavorFamily,
      cigarProduct && cigarProduct.guidance && cigarProduct.guidance.wrapperRole
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    var hints = [];
    if (/\b(cream|creamy|connecticut|shade)\b/.test(blob)) hints.push('cream');
    if (/\b(cocoa|chocolate|cedar)\b/.test(blob)) hints.push('cocoa or cedar');
    if (/\b(cameroon)\b/.test(blob)) hints.push('Cameroon sweetness');
    if (/\b(nut|almond|cashew)\b/.test(blob)) hints.push('nut');
    if (!hints.length) hints.push('cream', 'cocoa', 'cedar');
    return hints.slice(0, 3);
  }

  function cigarDirectionLine(slot, cigarProduct, cigarName) {
    var hints = cigarFlavorHints(cigarProduct, cigarName);
    var joinHints =
      hints.length > 2
        ? hints[0] + ', ' + hints[1] + ', or ' + hints[2]
        : hints.length === 2
          ? hints[0] + ' or ' + hints[1]
          : hints[0];

    if (slot === 'wildcard') {
      return (
        'Wildcard can stretch the lane — still ' +
        joinHints +
        ' beside the cup, not pepper-forward or ligero-heavy.'
      );
    }
    if (slot === 'safe') {
      return (
        'Refined pick: ' +
        joinHints +
        ' for smooth volume — approachable beside bitter coffee, not spice on the finish.'
      );
    }
    return (
      'Stay with ' +
      joinHints +
      ' in the smoke — polite beside the espresso, not pepper-forward or ligero-heavy.'
    );
  }

  function buildSlotWhyLines(opts) {
    var o = opts || {};
    if (!isActive(o.recoCtx)) return [];
    var slot = o.slotRole === 'safe' ? 'safe' : o.slotRole === 'wildcard' ? 'wildcard' : 'best';
    var C = global.OntologyPolicyCore;
    var spiritName = o.spiritName || '';
    var cigarName = o.cigarName || '';
    if (!spiritName || !cigarName) return [];

    var spiritProduct =
      o.spiritProduct ||
      (C && typeof C.findProduct === 'function' ? C.findProduct(spiritName, 'spirit') : null);
    var cigarProduct =
      o.cigarProduct ||
      (C && typeof C.findProduct === 'function' ? C.findProduct(cigarName, 'cigar') : null);

    return [
      spiritBridgeLine(spiritProduct, spiritName),
      cigarDirectionLine(slot, cigarProduct, cigarName)
    ];
  }

  function proseStem(line) {
    var key = normalizeKey(line);
    return key.length > 48 ? key.slice(0, 48) : key;
  }

  /** Prevent best/safe/wildcard from recycling the same why skeleton across a flight. */
  function differentiateFlightWhy(cards, recoCtx) {
    if (!isActive(recoCtx) || !cards || !cards.length) return cards;
    var used = Object.create(null);
    return cards.map(function (card, idx) {
      if (!card) return card;
      var slot = card.slot || ['best', 'safe', 'wildcard'][idx] || 'best';
      var why = (card.why || []).slice();
      var fresh = [];
      why.forEach(function (line) {
        var stem = proseStem(line);
        if (!stem || used[stem]) return;
        used[stem] = true;
        fresh.push(line);
      });
      if (fresh.length >= 1) {
        return Object.assign({}, card, { why: fresh.slice(0, 3) });
      }
      var rebuilt = buildSlotWhyLines({
        slotRole: slot,
        spiritName: card.spirit,
        cigarName: card.cigar,
        recoCtx: recoCtx
      });
      rebuilt.forEach(function (line) {
        var stem = proseStem(line);
        if (!stem || used[stem]) return;
        used[stem] = true;
        fresh.push(line);
      });
      return Object.assign({}, card, { why: fresh.slice(0, 3) });
    });
  }

  function coffeePairingLead(spiritName, cigarName) {
    var spirit = shortSpiritLabel(spiritName);
    var cigar = cigarName || 'this cigar';
    return (
      'For the cup, I would pour ' +
      spirit +
      ' and hand you ' +
      cigar +
      ' — the smoke should read cream or cocoa beside the espresso, not pepper.'
    );
  }

  global.CoffeeEspressoProse = {
    isActive: isActive,
    buildSlotWhyLines: buildSlotWhyLines,
    differentiateFlightWhy: differentiateFlightWhy,
    coffeePairingLead: coffeePairingLead
  };
})(typeof window !== 'undefined' ? window : global);
