/**
 * FlightPhilosophyMetadata - diagnostic metadata and prompt copy for flight philosophy.
 *
 * Depends on: FlightPhilosophyPolicy, RecommendationProductIds, FlightBrandPolicy.
 */
(function (global) {
  'use strict';

  var FPP = global.FlightPhilosophyPolicy;
  if (!FPP) return;

  function PIDs() { return global.RecommendationProductIds || null; }
  function FBP() { return global.FlightBrandPolicy || null; }
  function cigarMetaForRow(row) {
    var pid = PIDs();
    var fbp = FBP();
    var name = row && (row.name || (row.id && pid ? pid.displayNameForId('cigar', row.id) : ''));
    var p = pid && name ? pid.getProductRef('cigar', name) : null;
    var spec = (p && p.spec) || {};
    var sensory = (p && p.sensory) || {};
    return {
      tier: spec.tier != null ? Number(spec.tier) : 0,
      strength: spec.strength != null ? Number(spec.strength) : 0,
      pepper: sensory.pepper != null ? Number(sensory.pepper) : 0,
      wrapper: spec.wrapper ? String(spec.wrapper).toLowerCase() : '',
      lineKey: fbp && name && fbp.cigarLineKey ? fbp.cigarLineKey(name) : '',
      makerKey: fbp && name && fbp.cigarManufacturerKey ? fbp.cigarManufacturerKey(name) : ''
    };
  }
  function computeSlotRoleMetadata(cards, opts) {
    var o = opts || {};
    var pid = PIDs();
    var fbp = FBP();
    var out = [];
    var bestCigarId = o.lockedBestCigarId || (cards[0] && cards[0].cigarId);
    var bestName = bestCigarId && pid ? pid.displayNameForId('cigar', bestCigarId) : '';
    var bestMeta = cigarMetaForRow({ id: bestCigarId, name: bestName });

    for (var i = 0; i < (cards || []).length; i++) {
      var c = cards[i];
      var cigarId = c && c.cigarId;
      var name = cigarId && pid ? pid.displayNameForId('cigar', cigarId) : '';
      var meta = cigarMetaForRow({ id: cigarId, name: name });
      var contrastVsBest = 0;
      if (fbp && bestName && name && global.PairingEngine && global.PairingEngine.scorePair) {
        var anchorSpirit = c && c.spiritId && pid ? pid.displayNameForId('spirit', c.spiritId) : '';
        if (anchorSpirit) {
          var s1 = global.PairingEngine.scorePair(name, anchorSpirit);
          var s2 = global.PairingEngine.scorePair(bestName, anchorSpirit);
          if (s1 && s2 && s1.contrastScore != null && s2.contrastScore != null) {
            contrastVsBest = Math.abs(s1.contrastScore - (s2.contrastScore || 0));
          }
        }
      }
      out.push({
        manufacturerKey: meta.makerKey,
        lineKey: meta.lineKey,
        tier: meta.tier,
        strength: meta.strength,
        pepper: meta.pepper,
        wrapper: meta.wrapper,
        contrastVsBest: contrastVsBest
      });
    }
    return out;
  }

  function buildFlightPhilosophyPromptExtra(opts) {
    var o = opts || {};
    var lines = [
      '',
      'FLIGHT PHILOSOPHY (catalog slots â€” hospitality lanes):',
      '- BEST PICK is the locked pairing truth; REFINED and WILDCARD are curated relatives from the same ranked pool.',
      '- Three distinct cigar SKUs when the menu allows â€” never three copies of the same vitola.'
    ];
    if (o.progressionIntent) {
      lines.push('- Progression intent detected: refined step-up without intimidating wildcard strength.');
    }
    if (o.namedSpiritLocked) {
      lines.push('- Member named their in-hand pour: keep the same spirit on every slot; vary cigars only.');
    }
    return lines.join('\n');
  }

  Object.assign(FPP, {
    computeSlotRoleMetadata: computeSlotRoleMetadata,
    buildFlightPhilosophyPromptExtra: buildFlightPhilosophyPromptExtra
  });
})(typeof window !== 'undefined' ? window : global);
