/**
 * FlightPhilosophyPolicy â€” hospitality lane curation for three-slot flights.
 *
 * Pipeline seam (spirit-anchored cigars in generate.js):
 *   pickSlotIds â†’ FBP â†’ CSB reconciles â†’ applyCigarFlightPhilosophy â†’ [applySpiritFlightPhilosophy]
 *
 * Pairing truth = lockedBestCigarId after PE + FBP + CSB.
 * Flight truth = three distinct hospitality lanes from the same ranked pool.
 *
 * Pure module â€” no DOM. Load after FlightBrandPolicy + CigarSublineBody, before generate.js.
 */
(function (global) {
  'use strict';

  var GENERATE_PIPELINE_ORDER = [
    'pickSlotIds',
    'applyFlightSlotDiversityIds',
    'reconcileBestPickBodyIntentIds',
    'reconcileWildcardBodyIntentIds',
    'applyCigarFlightPhilosophy',
    'applySpiritFlightPhilosophy'
  ];

  var PROGRESSION_RE =
    /\b(step\s*up|next\s*level|graduate|more\s+refined|sophisticated|without\s+intimidat|not\s+intimidat|approachable\s+upgrade)\b/i;

  var CIGAR_HOSPITALITY_DELTAS = {
    refined: {
      tierAboveBest: 0.05,
      tierSameAsBest: -0.04,
      strengthBelowBest: 0.03,
      pepperCleaner: 0.04,
      differentLine: 0.05,
      differentMaker: 0.04,
      sameTierProgression: -0.08,
      sameLineProgression: -0.1
    },
    wildcard: {
      differentMaker: 0.06,
      differentWrapper: 0.04,
      differentLine: 0.03,
      sameLineAntiClone: -0.1,
      heroPenalty: -0.08,
      bodyDeltaProgressionCap: -0.06,
      sameTierProgression: -0.08,
      sameLineProgression: -0.1,
      strengthAboveProgression: -0.12
    }
  };

  var SPIRIT_HOSPITALITY_DELTAS = {
    refined: {
      journeyRankLower: 0.05,
      journeyRankEqual: 0.02,
      differentBrand: 0.04,
      approachableMsrp: 0.03,
      contextScoreCap: 0.04
    },
    wildcard: {
      differentBrand: 0.06,
      journeyRankHigherThanRefined: 0.03,
      contrastCap: 0.04,
      styleMismatch: 0.04
    }
  };

  function PIDs() {
    return global.RecommendationProductIds || null;
  }

  function FBP() {
    return global.FlightBrandPolicy || null;
  }

  function detectProgressionIntent(promptText) {
    return PROGRESSION_RE.test(String(promptText || ''));
  }

  function cigarMetaForRow(row) {
    var pid = PIDs();
    var fbp = FBP();
    var name = row && (row.name || (row.id && pid ? pid.displayNameForId('cigar', row.id) : ''));
    var p = pid && name ? pid.getProductRef('cigar', name) : null;
    var spec = (p && p.spec) || {};
    var sensory = (p && p.sensory) || {};
    return {
      id: row && row.id ? row.id : pid && name ? pid.resolveCigarId(name) : null,
      name: name,
      tier: spec.tier != null ? Number(spec.tier) : 0,
      strength: spec.strength != null ? Number(spec.strength) : 0,
      pepper: sensory.pepper != null ? Number(sensory.pepper) : 0,
      wrapper: spec.wrapper ? String(spec.wrapper).toLowerCase() : '',
      lineKey: fbp && name && fbp.cigarLineKey ? fbp.cigarLineKey(name) : '',
      makerKey: fbp && name && fbp.cigarManufacturerKey ? fbp.cigarManufacturerKey(name) : '',
      bodyDelta: row && row.bodyDelta != null ? row.bodyDelta : 0,
      score: row && row.score != null ? row.score : 0,
      contrastScore: row && row.contrastScore != null ? row.contrastScore : 0
    };
  }

  function spiritMetaForId(spiritId) {
    var pid = PIDs();
    var p = pid ? pid.getById('spirit', spiritId) : null;
    var E = global.RecommendationEntropy;
    var name = p && p.name ? p.name : pid ? pid.displayNameForId('spirit', spiritId) : '';
    return {
      id: spiritId,
      name: name,
      deckKey: p && p.deckKey ? p.deckKey : '',
      journeyRank: p && p.journeyRank != null ? Number(p.journeyRank) : 0,
      msrp: p && p.spec && p.spec.msrp != null ? Number(p.spec.msrp) : 0,
      style: p && p.spec && p.spec.style ? String(p.spec.style).toLowerCase() : '',
      brandKey: E && name && E.brandKey ? E.brandKey(name) : String(name || '').split(/\s+/)[0].toLowerCase()
    };
  }

  function hospitalityDelta(role, row, bestRow, opts) {
    var o = opts || {};
    var ctx = o.recoContext || null;
    var meta = cigarMetaForRow(row);
    var best = cigarMetaForRow(bestRow || { id: o.lockedBestCigarId, name: o.lockedBestName });
    var d = role === 'wildcard' ? CIGAR_HOSPITALITY_DELTAS.wildcard : CIGAR_HOSPITALITY_DELTAS.refined;
    var delta = 0;
    var pid = PIDs();
    var rowProduct = pid && meta.name ? pid.getProductRef('cigar', meta.name) : null;
    var rowSensory = (rowProduct && rowProduct.sensory) || {};
    var bestSensory = (function () {
      var bp = pid && best.name ? pid.getProductRef('cigar', best.name) : null;
      return (bp && bp.sensory) || {};
    })();

    if (role === 'safe') {
      if (meta.tier > best.tier) delta += d.tierAboveBest;
      if (meta.tier === best.tier) delta += d.tierSameAsBest;
      if (meta.strength < best.strength) delta += d.strengthBelowBest;
      if (meta.pepper <= best.pepper - 1) delta += d.pepperCleaner;
      if (meta.lineKey && best.lineKey && meta.lineKey !== best.lineKey) delta += d.differentLine;
      if (meta.makerKey && best.makerKey && meta.makerKey !== best.makerKey) delta += d.differentMaker;
    } else if (role === 'wildcard') {
      if (meta.makerKey && best.makerKey && meta.makerKey !== best.makerKey) delta += d.differentMaker;
      if (meta.wrapper && best.wrapper && meta.wrapper !== best.wrapper) delta += d.differentWrapper;
      if (meta.lineKey && best.lineKey && meta.lineKey !== best.lineKey) delta += d.differentLine;
      if (meta.lineKey && best.lineKey && meta.lineKey === best.lineKey) delta += d.sameLineAntiClone;
      var D = global.RecommendationDiversity;
      if (D && D.isHeroCigar && meta.name && D.isHeroCigar(meta.name)) delta += d.heroPenalty;
      if (o.progressionIntent && meta.bodyDelta >= 4) delta += d.bodyDeltaProgressionCap;
    }

    if (o.progressionIntent) {
      if (meta.tier === best.tier) delta += d.sameTierProgression;
      if (meta.lineKey && best.lineKey && meta.lineKey === best.lineKey) delta += d.sameLineProgression;
      if (role === 'wildcard' && meta.strength > best.strength + 1) delta += d.strengthAboveProgression;
    }

    if (ctx && ctx.comfortAsk && role === 'safe') {
      var sweet = rowSensory.sweetness != null ? Number(rowSensory.sweetness) : 0;
      var bestSweet = bestSensory.sweetness != null ? Number(bestSensory.sweetness) : 0;
      var pepper = rowSensory.pepper != null ? Number(rowSensory.pepper) : 0;
      var bestPepper = bestSensory.pepper != null ? Number(bestSensory.pepper) : 0;
      if (sweet > bestSweet) delta += 0.03;
      if (pepper <= bestPepper) delta += 0.03;
    }

    var CSE = global.CigarSmokeEstimate;
    if (ctx && ctx.targetSmokeMinutes != null && CSE && rowProduct && (role === 'safe' || role === 'wildcard')) {
      var mins = CSE.estimateSmokeMinutes(rowProduct);
      if (mins != null) {
        var smokeNudge = CSE.smokeMinutesFitDelta(mins, ctx) * 0.25;
        if (smokeNudge > 0.03) smokeNudge = 0.03;
        if (smokeNudge < -0.03) smokeNudge = -0.03;
        delta += smokeNudge;
        o._smokeNudgeApplied = true;
      }
    } else if (role === 'safe' || role === 'wildcard') {
      o._smokeNudgeSkipped = true;
    }

    if (ctx && ctx.comfortAsk && role === 'safe') {
      o._comfortNudgeApplied = true;
    } else if (role === 'safe' || role === 'wildcard') {
      o._comfortNudgeSkipped = true;
    }

    return delta;
  }

  function spiritContextScore(cigarId, spiritId) {
    var OP = global.OntologyPolicy;
    var pid = PIDs();
    if (!OP || !pid || !cigarId || !spiritId) return 0;
    var cigarName = pid.displayNameForId('cigar', cigarId);
    var spiritName = pid.displayNameForId('spirit', spiritId);
    if (typeof OP.spiritContextScore === 'function') {
      return OP.spiritContextScore(spiritName, cigarName) || 0;
    }
    if (typeof OP.scoreSpiritForCigar === 'function') {
      return OP.scoreSpiritForCigar(spiritName, cigarName) || 0;
    }
    return 0;
  }

  function spiritHospitalityDelta(role, row, anchorRow, refinedRow, opts) {
    var o = opts || {};
    var meta = spiritMetaForId(row && row.id ? row.id : row);
    var anchor = spiritMetaForId(anchorRow && anchorRow.id ? anchorRow.id : anchorRow);
    var refined = refinedRow ? spiritMetaForId(refinedRow.id || refinedRow) : null;
    var d = role === 'wildcard' ? SPIRIT_HOSPITALITY_DELTAS.wildcard : SPIRIT_HOSPITALITY_DELTAS.refined;
    var delta = 0;
    var score = row && row.score != null ? row.score : 0;

    if (role === 'safe') {
      if (meta.journeyRank < anchor.journeyRank) delta += d.journeyRankLower;
      else if (meta.journeyRank === anchor.journeyRank) delta += d.journeyRankEqual;
      if (meta.brandKey !== anchor.brandKey) delta += d.differentBrand;
      if (anchor.msrp > 0 && meta.msrp > 0 && meta.msrp <= anchor.msrp + 15) delta += d.approachableMsrp;
      var ctx = spiritContextScore(o.lockedBestCigarId, meta.id);
      delta += d.contextScoreCap * Math.min(1, Math.max(0, ctx));
    } else if (role === 'wildcard') {
      if (meta.brandKey !== anchor.brandKey && (!refined || meta.brandKey !== refined.brandKey)) {
        delta += d.differentBrand;
      }
      if (refined && meta.journeyRank > refined.journeyRank) delta += d.journeyRankHigherThanRefined;
      if (row && row.contrastScore != null && row.contrastScore >= 0.2) {
        var contrastNorm = Math.min(1, Math.max(0, (row.contrastScore - 0.2) / 0.8));
        delta += d.contrastCap * contrastNorm;
      }
      if (meta.style && anchor.style && meta.style !== anchor.style) delta += d.styleMismatch;
    }

    return { delta: delta, roleScore: score + delta };
  }

  function roleScoreForRow(role, row, bestRow, opts) {
    return (row.score != null ? row.score : 0) + hospitalityDelta(role, row, bestRow, opts);
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

  function applyCigarFlightPhilosophy(slotIds, ranked, opts) {
    var o = opts || {};
    var out = {
      best: o.lockedBestCigarId || (slotIds && slotIds.best) || null,
      safe: slotIds && slotIds.safe ? slotIds.safe : null,
      wildcard: slotIds && slotIds.wildcard ? slotIds.wildcard : null
    };
    if (!ranked || !ranked.length || !out.best) return out;

    var pid = PIDs();
    var bestRow = null;
    for (var bi = 0; bi < ranked.length; bi++) {
      if (ranked[bi].id === out.best) {
        bestRow = ranked[bi];
        break;
      }
    }
    if (!bestRow) {
      bestRow = { id: out.best, name: pid ? pid.displayNameForId('cigar', out.best) : '', score: 0 };
    }

    o.lockedBestName = bestRow.name;
    var used = Object.create(null);
    used[out.best] = true;

    var safePick = pickTopRoleCandidate(ranked, 'safe', bestRow, used, o);
    if (safePick && safePick.id) {
      out.safe = safePick.id;
      used[safePick.id] = true;
    }

    var wildPick = pickTopRoleCandidate(ranked, 'wildcard', bestRow, used, o);
    if (wildPick && wildPick.id) {
      out.wildcard = wildPick.id;
    }

    return out;
  }

  function filterSpiritPoolByDeck(spiritIds, anchorSpiritId) {
    var anchor = spiritMetaForId(anchorSpiritId);
    if (!anchor.deckKey) return (spiritIds || []).filter(function (id) { return id && id !== anchorSpiritId; });
    return (spiritIds || []).filter(function (id) {
      if (!id || id === anchorSpiritId) return false;
      var m = spiritMetaForId(id);
      return m.deckKey === anchor.deckKey;
    });
  }

  function applySpiritFlightPhilosophy(spiritSlotIds, ranked, opts) {
    var o = opts || {};
    var anchorId = o.anchorSpiritId || (spiritSlotIds && spiritSlotIds.best) || null;
    var out = {
      best: anchorId,
      safe: spiritSlotIds && spiritSlotIds.safe ? spiritSlotIds.safe : anchorId,
      wildcard: spiritSlotIds && spiritSlotIds.wildcard ? spiritSlotIds.wildcard : anchorId
    };
    if (!anchorId || !ranked || ranked.length < 1) return out;

    var used = Object.create(null);
    used[anchorId] = true;
    var anchorRow = { id: anchorId, score: 0 };

    var refinedBest = null;
    var refinedScore = -Infinity;
    for (var ri = 0; ri < ranked.length; ri++) {
      var row = ranked[ri];
      if (!row || !row.id || used[row.id]) continue;
      var scored = spiritHospitalityDelta('safe', row, anchorRow, null, o);
      if (scored.roleScore > refinedScore) {
        refinedScore = scored.roleScore;
        refinedBest = row;
      }
    }
    if (refinedBest && refinedBest.id) {
      out.safe = refinedBest.id;
      used[refinedBest.id] = true;
    }

    var wildBest = null;
    var wildScore = -Infinity;
    for (var wi = 0; wi < ranked.length; wi++) {
      var wrow = ranked[wi];
      if (!wrow || !wrow.id || used[wrow.id]) continue;
      var wscored = spiritHospitalityDelta('wildcard', wrow, anchorRow, refinedBest, o);
      if (wscored.roleScore > wildScore) {
        wildScore = wscored.roleScore;
        wildBest = wrow;
      }
    }
    if (wildBest && wildBest.id) out.wildcard = wildBest.id;

    return out;
  }

  global.FlightPhilosophyPolicy = {
    GENERATE_PIPELINE_ORDER: GENERATE_PIPELINE_ORDER,
    detectProgressionIntent: detectProgressionIntent,
    CIGAR_HOSPITALITY_DELTAS: CIGAR_HOSPITALITY_DELTAS,
    SPIRIT_HOSPITALITY_DELTAS: SPIRIT_HOSPITALITY_DELTAS,
    hospitalityDelta: hospitalityDelta,
    spiritHospitalityDelta: spiritHospitalityDelta,
    applyCigarFlightPhilosophy: applyCigarFlightPhilosophy,
    applySpiritFlightPhilosophy: applySpiritFlightPhilosophy,
    filterSpiritPoolByDeck: filterSpiritPoolByDeck
  };
})(typeof window !== 'undefined' ? window : global);
