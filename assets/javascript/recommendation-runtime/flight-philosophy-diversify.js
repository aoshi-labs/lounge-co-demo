/**
 * FlightPhilosophyPolicy companion — collapsed-slot diversify and repair.
 * Load after flight-philosophy-policy.js.
 */
(function (global) {
  'use strict';

  var FPP = global.FlightPhilosophyPolicy;

  function PIDs() {
    return global.RecommendationProductIds || null;
  }

  function roleScoreForRow(role, row, bestRow, opts) {
    return (row.score != null ? row.score : 0) + FPP.hospitalityDelta(role, row, bestRow, opts);
  }

  function pickTopRoleCandidate(ranked, role, bestRow, usedIds, opts) {
    var o = opts || {};
    var used = usedIds || Object.create(null);
    var best = null;
    var bestScore = -Infinity;
    var tieSeed =
      (o.seedText || '') + '|' + role + '|' + (o.lockedBestCigarId || o.anchorSpiritId || '');
    var E = global.RecommendationEntropy;

    for (var i = 0; i < ranked.length; i++) {
      var row = ranked[i];
      if (!row || !row.id || used[row.id]) continue;
      if (o.lockedBestCigarId && row.id === o.lockedBestCigarId) continue;
      var rs = roleScoreForRow(role, row, bestRow, o);
      if (rs > bestScore) {
        bestScore = rs;
        best = row;
      } else if (rs === bestScore && best && E && E.hashString) {
        var h1 = E.hashString(tieSeed + '|' + row.id);
        var h2 = E.hashString(tieSeed + '|' + best.id);
        if (h1 < h2) best = row;
      }
    }
    return best;
  }

  function idsDistinct(ids) {
    var seen = Object.create(null);
    for (var i = 0; i < ids.length; i++) {
      var k = ids[i];
      if (!k) continue;
      if (seen[k]) return false;
      seen[k] = true;
    }
    return true;
  }

  function repairSlotFromRanked(currentId, ranked, usedIds, excludeIds) {
    var used = usedIds || Object.create(null);
    var ex = excludeIds || Object.create(null);
    for (var i = 0; i < ranked.length; i++) {
      var id = ranked[i].id || ranked[i];
      if (!id || used[id] || ex[id]) continue;
      return id;
    }
    return currentId;
  }

  function diversifyCollapsedCigarSlots(cards, opts) {
    var o = opts || {};
    var out = (cards || []).map(function (c) {
      return Object.assign({}, c);
    });
    var repairSignals = [];
    var pid = PIDs();
    if (!pid || out.length < 3) return { cards: out, repairSignals: repairSignals };

    var cigarIds = out.map(function (c) {
      return c && c.cigarId ? c.cigarId : null;
    });
    if (idsDistinct(cigarIds.filter(Boolean))) return { cards: out, repairSignals: repairSignals };

    var rankedCigars = o.rankedCigars || [];
    if (!rankedCigars.length && o.anchorSpiritId) {
      rankedCigars = pid.rankCandidateIds('spirit', o.anchorSpiritId, pid.listMenuCigarIds(), {
        seedText: o.promptText || '',
        sessionRuntime: o.sessionRuntime
      });
    }
    if (!rankedCigars.length) return { cards: out, repairSignals: repairSignals };

    var bestRow = null;
    var locked = out[0] && out[0].cigarId;
    for (var ri = 0; ri < rankedCigars.length; ri++) {
      if (rankedCigars[ri].id === locked) {
        bestRow = rankedCigars[ri];
        break;
      }
    }
    if (!bestRow) {
      bestRow = { id: locked, name: pid.displayNameForId('cigar', locked), score: 0 };
    }

    var used = Object.create(null);
    if (locked) used[locked] = true;

    if (out[2] && out[2].cigarId && (out[2].cigarId === out[0].cigarId || out[2].cigarId === out[1].cigarId)) {
      var wildPick = pickTopRoleCandidate(rankedCigars, 'wildcard', bestRow, used, o);
      if (wildPick && wildPick.id) {
        out[2].cigarId = wildPick.id;
        out[2].cigar = pid.displayNameForId('cigar', wildPick.id);
        used[wildPick.id] = true;
        repairSignals.push('flight-philosophy-repair-cigar');
      }
    }

    if (out[1] && out[1].cigarId && (out[1].cigarId === out[0].cigarId || out[1].cigarId === out[2].cigarId)) {
      var safePick = pickTopRoleCandidate(rankedCigars, 'safe', bestRow, used, o);
      if (safePick && safePick.id) {
        out[1].cigarId = safePick.id;
        out[1].cigar = pid.displayNameForId('cigar', safePick.id);
        used[safePick.id] = true;
        repairSignals.push('flight-philosophy-repair-cigar');
      }
    }

    return { cards: out, repairSignals: repairSignals };
  }

  function diversifyCollapsedSpiritSlots(cards, opts) {
    var o = opts || {};
    var out = (cards || []).map(function (c) {
      return Object.assign({}, c);
    });
    var repairSignals = [];
    var pid = PIDs();
    if (!pid || out.length < 2) return { cards: out, repairSignals: repairSignals };

    var spiritIds = out.map(function (c) {
      return c && c.spiritId ? c.spiritId : null;
    });
    if (idsDistinct(spiritIds.filter(Boolean))) return { cards: out, repairSignals: repairSignals };

    var pool = o.rankedSpirits || [];
    if (!pool.length) {
      var menu = pid.listMenuSpiritIds();
      if (o.anchorSpiritId && o.namedSpiritLocked) {
        pool = FPP.filterSpiritPoolByDeck(menu, o.anchorSpiritId);
        pool = pid.rankCandidateIds('cigar', o.lockedBestCigarId || pid.listMenuCigarIds()[0], pool, {
          slotRole: 'safe',
          promptText: o.promptText,
          sessionRuntime: o.sessionRuntime
        });
      } else {
        var picked = pid.pickSpiritOnlySlotIds(menu, { seedText: o.promptText || '' });
        pool = [{ id: picked.best }, { id: picked.safe }, { id: picked.wildcard }];
      }
    }
    if (pool.length < 2) {
      repairSignals.push('flight-philosophy-pool-thin');
      return { cards: out, repairSignals: repairSignals };
    }

    var usedS = Object.create(null);
    var anchorSpirit = o.anchorSpiritId || (out[0] && out[0].spiritId);
    if (anchorSpirit) usedS[anchorSpirit] = true;

    for (var si = 1; si < out.length; si++) {
      if (!out[si]) continue;
      var sid = out[si].spiritId;
      if (!sid || usedS[sid]) {
        var alt = repairSlotFromRanked(sid, pool, usedS, usedS);
        if (alt) {
          out[si].spiritId = alt;
          out[si].spirit = pid.displayNameForId('spirit', alt);
          usedS[alt] = true;
          repairSignals.push('flight-philosophy-repair-spirit');
        }
      } else {
        usedS[sid] = true;
      }
    }

    return { cards: out, repairSignals: repairSignals };
  }

  function repairCollapsedFlightCards(cards, opts) {
    var o = opts || {};
    var repairSignals = [];
    var pid = PIDs();
    if (!pid) return { cards: cards || [], repairSignals: repairSignals };

    var flightMode = o.flightMode || (o.anchorCigarId ? 'cigar-anchor' : 'pairing');
    var categoryFocus = o.categoryFocus;
    var out = (cards || []).map(function (c) {
      return Object.assign({}, c);
    });

    if (flightMode !== 'cigar-anchor' && categoryFocus !== 'spirit') {
      var cigarResult = diversifyCollapsedCigarSlots(out, o);
      out = cigarResult.cards;
      repairSignals = repairSignals.concat(cigarResult.repairSignals);
      if (typeof console !== 'undefined' && console.warn && cigarResult.repairSignals.length) {
        console.warn('[FlightPhilosophy] collapsed cigar slots repaired', {
          cigarIds: out.map(function (c) { return c.cigarId; })
        });
      }
    }

    var needsSpiritRepair =
      !o.namedSpiritLocked &&
      (categoryFocus === 'spirit' || flightMode === 'cigar-anchor');
    if (needsSpiritRepair) {
      var spiritResult = diversifyCollapsedSpiritSlots(out, o);
      out = spiritResult.cards;
      repairSignals = repairSignals.concat(spiritResult.repairSignals);
      if (typeof console !== 'undefined' && console.warn && spiritResult.repairSignals.indexOf('flight-philosophy-repair-spirit') !== -1) {
        console.warn('[FlightPhilosophy] collapsed spirit slots repaired', {
          spiritIds: out.map(function (c) { return c.spiritId; })
        });
      }
    }

    return { cards: out, repairSignals: repairSignals };
  }

  Object.assign(global.FlightPhilosophyPolicy, {
    diversifyCollapsedCigarSlots: diversifyCollapsedCigarSlots,
    diversifyCollapsedSpiritSlots: diversifyCollapsedSpiritSlots,
    repairCollapsedFlightCards: repairCollapsedFlightCards
  });
})(typeof window !== 'undefined' ? window : global);
