/**
 * RecommendationRationale — structured pairing explanation atoms.
 *
 * Derives typed atoms from product sensory profiles and harmony bridges.
 * Narrative layers should render these atoms — not invent pairing claims.
 *
 * Depends on: sensory/profiles.js, sensory/relationships.js
 * Does NOT depend on: DOM, session state, prose templates, sterlon-chat.js
 */
(function (global) {
  'use strict';

  function ssp() { return global.SterlonSensoryProfiles || null; }
  function ssr() { return global.SterlonSensoryRelationships || null; }

  /**
   * Find the first HARMONY_BRIDGES entry whose label matches — returns the
   * bridge definition object (with .a, .b, .label) or null.
   */
  function findBridgeDef(label) {
    var rel = ssr();
    if (!rel || !rel.HARMONY_BRIDGES) return null;
    var list = rel.HARMONY_BRIDGES;
    for (var i = 0; i < list.length; i++) {
      if (list[i].label === label) return list[i];
    }
    return null;
  }

  /**
   * Given a bridge definition and two tag arrays, determine which product
   * contributes which tag — returning { from: 'category.tag', to: 'category.tag' }.
   */
  function resolveDirection(bridgeDef, tagsA, catA, tagsB, catB) {
    if (!bridgeDef) return { from: catA, to: catB };
    var setA = {};
    var setB = {};
    for (var i = 0; i < tagsA.length; i++) setA[tagsA[i]] = true;
    for (var j = 0; j < tagsB.length; j++) setB[tagsB[j]] = true;

    if (setA[bridgeDef.a] && setB[bridgeDef.b]) {
      return { from: catA + '.' + bridgeDef.a, to: catB + '.' + bridgeDef.b };
    }
    if (setA[bridgeDef.b] && setB[bridgeDef.a]) {
      return { from: catA + '.' + bridgeDef.b, to: catB + '.' + bridgeDef.a };
    }
    return { from: catA, to: catB };
  }

  function addBridgeAtoms(bridgeLabels, tagsA, catA, tagsB, catB, baseStrength, scope, atoms) {
    for (var i = 0; i < bridgeLabels.length; i++) {
      var label = bridgeLabels[i];
      var def = findBridgeDef(label);
      var dir = resolveDirection(def, tagsA, catA, tagsB, catB);
      atoms.push({
        type: 'harmony',
        from: dir.from,
        to: dir.to,
        strength: baseStrength,
        label: label,
        scope: scope
      });
    }
  }

  /**
   * Build an array of rationale atoms for a cigar + spirit (+ optional food) pairing.
   *
   * Atom shapes:
   *   { type: 'harmony',          from, to, strength, label, scope }
   *   { type: 'intensity-match',  from, to, delta, strength, label }
   *   { type: 'intensity-contrast', from, to, delta, strength, label }
   *
   * Returns [] when sensory modules are not loaded — callers must handle gracefully.
   */
  function buildRationaleAtoms(cigarName, spiritName, foodName) {
    var p = ssp();
    var r = ssr();
    if (!p || !r) return [];

    var atoms = [];

    // ── Intensity relationship ────────────────────────────────────────
    var cigarProfile  = p.getSensoryProfile(cigarName);
    var spiritProfile = p.getSensoryProfile(spiritName);

    if (cigarProfile && spiritProfile) {
      var bodyDelta = Math.abs((cigarProfile.body || 0) - (spiritProfile.body || 0));
      var matched   = r.isIntensityMatch(cigarProfile, spiritProfile);
      atoms.push({
        type:     matched ? 'intensity-match' : 'intensity-contrast',
        from:     'cigar.body',
        to:       'spirit.body',
        delta:    bodyDelta,
        strength: matched ? Math.max(0, 1 - bodyDelta / 10) : Math.max(0, 0.5 - bodyDelta / 10),
        label:    matched ? 'body-matched' : 'body-contrast'
      });
    }

    var CP = global.ContrastPairing;
    if (CP && typeof CP.analyzePair === 'function') {
      var contrast = CP.analyzePair(cigarName, spiritName);
      if (contrast.controlledTension >= 0.55 && contrast.explainLine) {
        atoms.push({
          type: 'flavor-contrast',
          from: 'cigar',
          to: 'spirit',
          strength: contrast.controlledTension,
          label: contrast.oppositionHits.length ? contrast.oppositionHits[0].id : 'controlled-tension',
          scope: 'cigar-spirit',
          line: contrast.explainLine
        });
      }
    }

    // ── Cigar–Spirit flavor bridges ───────────────────────────────────
    var cigarTags  = p.getFlavorNotes(cigarName);
    var spiritTags = p.getFlavorNotes(spiritName);
    var csBridges  = r.findHarmonyBridges(cigarTags, spiritTags);
    addBridgeAtoms(csBridges, cigarTags, 'cigar', spiritTags, 'spirit', 0.8, 'cigar-spirit', atoms);

    // ── Spirit–Food bridges ───────────────────────────────────────────
    if (foodName) {
      var foodTags = p.getFlavorNotes(foodName);
      var sfBridges = r.findHarmonyBridges(spiritTags, foodTags);
      addBridgeAtoms(sfBridges, spiritTags, 'spirit', foodTags, 'food', 0.7, 'spirit-food', atoms);
    }

    return atoms;
  }

  /** Deterministic copy for harmony labels used in rationale atoms. */
  var HARMONY_WHY_LINES = {
    'cocoa-chocolate': 'Cocoa in the smoke threads cleanly into the chocolate column in the glass.',
    'cocoa-espresso': 'Espresso and cedar in the cigar echo baking spice and cocoa in the pour.',
    'wood-structure': 'Cedar structure in the smoke finds the oak line in the spirit without crowding.',
    'earth-leather': 'Earth and leather in the smoke meet tobacco depth in the glass.',
    'smoke-spice': 'Smoke weight in the cigar meets spice lift in the glass.',
    'fruit-spice': 'Fruit lift in the glass answers the spice line in the smoke.',
    'nutty-oak': 'Nutty tones bridge the oak frame in the glass and the smoke.',
    'caramel-vanilla': 'Caramel and vanilla in the pour lengthen the sweet edge of the smoke.'
  };

  function atomToWhyLine(atom) {
    if (!atom) return '';
    if (atom.type === 'intensity-match') {
      return 'Body lines up — both sides sit in the same weight class so neither overpowers.';
    }
    if (atom.type === 'intensity-contrast') {
      return 'Controlled contrast — cigar and spirit lean on different body registers on purpose.';
    }
    if (atom.type === 'flavor-contrast' && atom.line) {
      return atom.line;
    }
    if (atom.type === 'harmony' && atom.label) {
      var h = HARMONY_WHY_LINES[atom.label];
      if (h) return h;
      return 'Shared flavor architecture links ' + String(atom.label).replace(/-/g, ' ') + ' across the flight.';
    }
    return '';
  }

  /**
   * Map rationale atoms to 1–3 why bullets (max length via SterlonRecommendations.normalizeWhyBullets).
   */
  function renderWhyBullets(atoms, fallbackWhy, opts) {
    var o = opts || {};
    if (o.skipOntology) {
      /* fall through */
    }
    var SR = global.SterlonRecommendations;
    var fb = Array.isArray(fallbackWhy) ? fallbackWhy : [];
    var rank = { harmony: 0, 'intensity-match': 1, 'intensity-contrast': 2, 'flavor-contrast': 3 };
    var sorted = (atoms || []).slice().sort(function (a, b) {
      var ra = rank[a.type] != null ? rank[a.type] : 9;
      var rb = rank[b.type] != null ? rank[b.type] : 9;
      if (ra !== rb) return ra - rb;
      return 0;
    });
    var lines = [];
    for (var i = 0; i < sorted.length && lines.length < 3; i++) {
      var line = atomToWhyLine(sorted[i]);
      if (line) lines.push(line);
    }
    return SR && SR.normalizeWhyBullets ? SR.normalizeWhyBullets(lines, fb) : lines.concat(fb).slice(0, 3);
  }

  /**
   * Short sensory paragraph from cigar–spirit harmony atoms (presentation helper).
   */
  function renderSensoryPreludeFromAtoms(rationaleAtoms, card) {
    var cigarName = (card && card.cigar) ? String(card.cigar) : 'the cigar';
    var parts = [];
    var atoms = rationaleAtoms || [];
    for (var i = 0; i < atoms.length && parts.length < 2; i++) {
      var a = atoms[i];
      if (a.type === 'harmony' && a.scope === 'cigar-spirit' && a.label) {
        var line = HARMONY_WHY_LINES[a.label];
        if (line) parts.push(line);
      }
    }
    if (!parts.length) return '';
    var body = parts.join(' ');
    return body.split('{{cigar}}').join(cigarName);
  }

  global.RecommendationRationale = {
    buildRationaleAtoms: buildRationaleAtoms,
    renderWhyBullets: renderWhyBullets,
    renderSensoryPreludeFromAtoms: renderSensoryPreludeFromAtoms
  };
})(typeof window !== 'undefined' ? window : global);
