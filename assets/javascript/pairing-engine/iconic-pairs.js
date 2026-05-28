/**
 * PairingIconic — shared lounge-realistic pairing memory for runtime + eval.
 * Pure: LoungeProducts reads only; no DOM.
 */
(function (global) {
  'use strict';

  var REALISM_RULES = [
    { cigar: /padron|1926/i, spirit: /buffalo|woodford|blanton|pappy|macallan/i, bonus: 0.08, id: 'padron-bourbon' },
    { cigar: /opus/i, spirit: /pappy|macallan|hennessy|johnnie walker blue/i, bonus: 0.1, id: 'opus-luxury' },
    { cigar: /macanudo|connecticut|hyde/i, spirit: /buffalo|woodford|blanton|tito/i, bonus: 0.06, id: 'mild-bourbon' },
    { cigar: /fuente.*rosado|rosado sungrown/i, spirit: /hennessy|cognac|remy|rémy/i, bonus: 0.08, id: 'rosado-cognac' },
    {
      cigar: /liga privada|padron 1926|opus|maduro/i,
      spirit: /ardbeg|lagavulin|laphroaig|talisker/i,
      bonus: 0.07,
      id: 'bold-peat-maduro',
      bold: true
    },
    { cigar: /oliva.*melanio|serie v|spice|habano/i, spirit: /sazerac|rittenhouse|pikesville|rye/i, bonus: 0.07, id: 'rye-spice' },
    { cigar: /hoyo|monte|medium/i, spirit: /glenlivet|glenfiddich|macallan 12|oban/i, bonus: 0.06, id: 'scotch-medium' },
    { cigar: /maduro|sungrown|melanio/i, spirit: /don julio|fortaleza|casamigos|clase azul/i, bonus: 0.05, id: 'agave-maduro', contrast: true }
  ];

  var LUXURY_SPIRIT_PATTERNS = [
    /pappy van winkle/i,
    /macallan 18/i,
    /hennessy xo/i,
    /johnnie walker blue/i,
    /martell cordon bleu/i,
    /nikka from the barrel/i
  ];

  var BOLD_SPIRIT_DECKS = { peated: true, scotch: true };

  function lp() {
    return global.LoungeProducts || null;
  }

  function findCigar(name) {
    var lounge = lp();
    return lounge && lounge.findCigarByName ? lounge.findCigarByName(name) : null;
  }

  function findSpirit(name) {
    var lounge = lp();
    return lounge && lounge.findSpiritByName ? lounge.findSpiritByName(name) : null;
  }

  function sensoryBody(name) {
    var SS = global.SterlonSensory;
    if (!SS || !SS.getSensoryDimension) return null;
    return SS.getSensoryDimension(name, 'body');
  }

  function flavorTags(name) {
    var SS = global.SterlonSensory;
    return SS && SS.getFlavorNotes ? SS.getFlavorNotes(name) || [] : [];
  }

  function tagOverlap(cigarName, spiritName) {
    var a = flavorTags(cigarName);
    var b = flavorTags(spiritName);
    var set = {};
    b.forEach(function (t) {
      set[t] = true;
    });
    return a.filter(function (t) {
      return set[t];
    });
  }

  function matchRule(cigarName, spiritName, rule) {
    return rule.cigar.test(cigarName || '') && rule.spirit.test(spiritName || '');
  }

  function realismBonus(cigarName, spiritName) {
    var bonus = 0;
    var matched = null;
    REALISM_RULES.forEach(function (rule) {
      if (matchRule(cigarName, spiritName, rule)) {
        bonus = Math.max(bonus, rule.bonus);
        matched = rule.id;
      }
    });
    return { bonus: bonus, ruleId: matched };
  }

  function isBoldPairAllowed(cigarName, spiritName, strategy) {
    var cigar = findCigar(cigarName);
    var spirit = findSpirit(spiritName);
    if (!cigar || !spirit) return false;

    var str = cigar.spec && cigar.spec.strength != null ? Number(cigar.spec.strength) : 5;
    var body = sensoryBody(cigarName);
    var fullBody = str >= 7 || (body != null && body >= 8);
    if (!fullBody) return false;

    var deck = spirit.deckKey || '';
    if (!BOLD_SPIRIT_DECKS[deck] && deck !== 'peated') {
      if (deck !== 'scotch' && !/ardbeg|lagavulin|laphroaig|talisker/i.test(spiritName)) {
        return false;
      }
    }

    var overlap = tagOverlap(cigarName, spiritName);
    var bridgeOk =
      overlap.length >= 1 ||
      /smoke|peat|cocoa|leather|earth|espresso|coffee|tobacco/i.test(
        overlap.join(' ') + ' ' + (cigarName + ' ' + spiritName).toLowerCase()
      );

    if (!bridgeOk) return false;

    if (strategy === 'complementary' || strategy === 'classic_lounge') {
      return matchRule(cigarName, spiritName, { cigar: REALISM_RULES[4].cigar, spirit: REALISM_RULES[4].spirit });
    }
    return true;
  }

  function iconicPairBoost(cigarName, spiritName) {
    return realismBonus(cigarName, spiritName).bonus;
  }

  function luxurySpiritCandidates(menuNames) {
    var names = menuNames || [];
    var out = [];
    names.forEach(function (n) {
      for (var i = 0; i < LUXURY_SPIRIT_PATTERNS.length; i++) {
        if (LUXURY_SPIRIT_PATTERNS[i].test(n)) {
          out.push(n);
          break;
        }
      }
    });
    return out;
  }

  function contrastTensionBump(cigarName, spiritName) {
    var r = realismBonus(cigarName, spiritName);
    if (!r.ruleId) return 0;
    var rule = REALISM_RULES.filter(function (x) {
      return x.id === r.ruleId;
    })[0];
    if (rule && (rule.bold || rule.contrast)) return r.bonus * 0.85;
    return r.bonus * 0.4;
  }

  global.PairingIconic = {
    REALISM_RULES: REALISM_RULES,
    realismBonus: realismBonus,
    iconicPairBoost: iconicPairBoost,
    isBoldPairAllowed: isBoldPairAllowed,
    luxurySpiritCandidates: luxurySpiritCandidates,
    contrastTensionBump: contrastTensionBump
  };
})(typeof window !== 'undefined' ? window : global);
