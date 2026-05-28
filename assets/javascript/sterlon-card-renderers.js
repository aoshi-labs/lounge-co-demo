/* ──────────────────────────────────────────────────────────────────────
   sterlon-card-renderers.js — Pure element-factory and HTML-string
   helpers for Sterlon recommendation cards and follow-up chips.

   BOUNDARY CONTRACT
   May:   build and return new DOM elements (via document.createElement
          + .innerHTML) or plain HTML strings. No side effects.
   May NOT: append to or modify live DOM nodes, create recommendations,
            mutate RecommendationTurn, assign products or scores, route
            orchestration, access PairingEngine, call RecommendationRuntime,
            or read session state.

   Callers are responsible for inserting returned elements into the DOM.

   Depends on: window.SterlonPresentationOverlays (SP) and
               window.SterlonProsePipeline (PP).
   Must be loaded after both of those modules.
   ────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  var SP = window.SterlonPresentationOverlays;
  var PP = window.SterlonProsePipeline;

  // ── Mood summary line ─────────────────────────────────────────────
  // Returns a short atmospheric string derived from the card's first
  // why-bullet. Used in the primary card prose bubble.

  function recommendationMoodLine(card) {
    var why = (card && card.why && card.why[0]) ? String(card.why[0]) : '';
    if (/peat|smoke|campfire|iodine/i.test(why)) {
      return 'It\'s rich, composed, and made for a night with depth.';
    }
    if (/cream|honey|soft|elegant|refined/i.test(why)) {
      return 'Calm, polished, and easy to settle into.';
    }
    if (/sherry|fruit|chocolate|cocoa/i.test(why)) {
      return 'Warm and layered without turning heavy.';
    }
    return 'Balanced enough to linger with, not loud enough to rush.';
  }

  // ── Product-name emphasis ─────────────────────────────────────────
  // Wraps occurrences of card product names in a highlight span.

  var FLIGHT_SLOT_LABELS = ['BEST PICK', 'REFINED OPTION', 'CONTRAST WILDCARD'];
  var FLIGHT_SLOT_ICONS = ['compass', 'crown', 'sparkles'];

  function emphasizeProductNames(html, cardOrCards) {
    if (!cardOrCards) return html;
    var cards = Array.isArray(cardOrCards) ? cardOrCards : [cardOrCards];
    var RP = window.RecommendationPresentation;
    var names =
      RP && typeof RP.displayNamesForEmphasis === 'function'
        ? RP.displayNamesForEmphasis(cards)
        : [];
    if (!names.length) {
      cards.forEach(function (card) {
        if (!card) return;
        if (card.cigar) names.push(card.cigar);
        if (card.spirit) names.push(card.spirit);
      });
    }
    names.filter(Boolean).forEach(function (name) {
      var escaped = PP.escapeHtml(name);
      if (!escaped) return;
      html = html.split(escaped).join('<span class="sterlon-reco-emphasis">' + escaped + '</span>');
    });
    return html;
  }

  function flightSlotLabel(card, index) {
    return (card && card.label) || FLIGHT_SLOT_LABELS[index] || 'Slot ' + (index + 1);
  }

  function buildFlightSlotHtml(card, index) {
    var label = flightSlotLabel(card, index);
    var isWildcard = isContrastWildcardLabel(label);
    var lines = '';
    if (card.cigar) {
      var metaBits = [];
      if (card.cigarVitola) metaBits.push(card.cigarVitola);
      if (card.cigarSmokeTime) metaBits.push(card.cigarSmokeTime);
      var metaHtml = metaBits.length
        ? '<span class="sterlon-reco-flight-line-meta">' + PP.escapeHtml(metaBits.join(' · ')) + '</span>'
        : '';
      lines +=
        '<div class="sterlon-reco-flight-line">' +
        '<span class="sterlon-reco-flight-line-label">Cigar</span>' +
        '<strong class="sterlon-reco-flight-line-value">' + PP.escapeHtml(card.cigar) + '</strong>' +
        metaHtml +
        '</div>';
    }
    if (card.spirit) {
      lines +=
        '<div class="sterlon-reco-flight-line">' +
        '<span class="sterlon-reco-flight-line-label">Spirit</span>' +
        '<strong class="sterlon-reco-flight-line-value">' + PP.escapeHtml(card.spirit) + '</strong></div>';
    }
    if (!lines) return '';
    var slotClass = 'sterlon-reco-flight-slot';
    if (index === 0) slotClass += ' is-best';
    if (isWildcard) slotClass += ' is-wildcard';
    return (
      '<div class="' + slotClass + '">' +
      '<header class="sterlon-reco-flight-slot-head">' +
      '<i data-lucide="' + FLIGHT_SLOT_ICONS[index] + '" class="ic-13"></i>' +
      '<span class="sterlon-reco-flight-slot-label">' + PP.escapeHtml(label) + '</span>' +
      '</header>' +
      '<div class="sterlon-reco-flight-slot-body">' + lines + '</div>' +
      '</div>'
    );
  }

  function renderUnifiedFlightCard(cards) {
    var list = cards || [];
    var slots = '';
    for (var i = 0; i < 3; i++) {
      var card = list[i];
      if (!card || (!card.cigar && !card.spirit)) continue;
      slots += buildFlightSlotHtml(card, i);
    }
    var el = document.createElement('div');
    el.className =
      'sterlon-reco-card is-primary is-hero sterlon-reco-card--conversation sterlon-reco-card--unified sterlon-reco-card--flight';
    el.innerHTML =
      '<div class="sterlon-reco-card-atmosphere" aria-hidden="true"></div>' +
      '<div class="sterlon-reco-card-illus" aria-hidden="true">' + SP.RECO_CARD_ILLUSTRATION_SVG + '</div>' +
      '<div class="sterlon-reco-card-inner">' +
      '<div class="sterlon-reco-flight-grid" role="list">' + slots + '</div>' +
      '</div>';
    return el;
  }

  // ── Primary card element factory ──────────────────────────────────
  // Returns a new <div> element for the hero recommendation card.

  function isContrastWildcardLabel(label) {
    return /\bwildcard\b/i.test(label || '') || /\bcontrast\b/i.test(label || '');
  }

  function renderConversationalPrimaryCard(card, options) {
    var opts = options || {};
    var el = document.createElement('div');
    el.className = 'sterlon-reco-card is-primary is-hero sterlon-reco-card--conversation sterlon-reco-card--unified';
    var title = opts.displayLabel || card.label || 'BEST PICK';
    var cols = '';
    if (card.cigar)  cols += '<div class="sterlon-reco-col"><span class="sterlon-reco-col-label">Cigar</span><strong class="sterlon-reco-col-value">'  + PP.escapeHtml(card.cigar)  + '</strong></div>';
    if (card.spirit) cols += '<div class="sterlon-reco-col"><span class="sterlon-reco-col-label">Spirit</span><strong class="sterlon-reco-col-value">' + PP.escapeHtml(card.spirit) + '</strong></div>';
    el.innerHTML =
      '<div class="sterlon-reco-card-atmosphere" aria-hidden="true"></div>' +
      '<div class="sterlon-reco-card-illus" aria-hidden="true">' + SP.RECO_CARD_ILLUSTRATION_SVG + '</div>' +
      '<div class="sterlon-reco-card-inner">' +
        '<header class="sterlon-reco-card-title">' +
          '<i data-lucide="compass" class="ic-14"></i>' +
          '<span>' + PP.escapeHtml(title) + '</span>' +
        '</header>' +
        '<div class="sterlon-reco-card-columns">' + cols + '</div>' +
      '</div>';
    return el;
  }

  // ── Backup card element factory ───────────────────────────────────

  function renderConversationalBackupCard(card) {
    var el = document.createElement('div');
    var isWildcard = isContrastWildcardLabel(card.label);
    el.className = 'sterlon-reco-card sterlon-reco-card--backup' + (isWildcard ? ' is-wildcard' : '');
    var icon = isWildcard ? 'sparkles' : 'crown';
    var label = card.label || (isWildcard ? 'CONTRAST WILDCARD' : 'REFINED OPTION');
    var rows = '';
    if (card.cigar)  rows += '<div class="sterlon-reco-backup-row"><span>Cigar</span><strong>'  + PP.escapeHtml(card.cigar)  + '</strong></div>';
    if (card.spirit) rows += '<div class="sterlon-reco-backup-row"><span>Spirit</span><strong>' + PP.escapeHtml(card.spirit) + '</strong></div>';
    el.innerHTML =
      '<header class="sterlon-reco-backup-head">' +
        '<i data-lucide="' + icon + '" class="ic-13"></i>' +
        '<span class="sterlon-reco-backup-label">' + PP.escapeHtml(label) + '</span>' +
      '</header>' +
      '<div class="sterlon-reco-backup-rows">' + rows + '</div>';
    return el;
  }

  // ── Generic card element factory ──────────────────────────────────
  // Routes to primary or backup factory; falls back to classic card layout.

  function renderRecommendationCardEl(card, options) {
    var opts = options || {};
    if (opts.isPrimary) return renderConversationalPrimaryCard(card, opts);
    if (opts.isBackup) return renderConversationalBackupCard(card, opts);
    var el = document.createElement('div');
    var cardClasses = ['sterlon-reco-card'];
    if (isContrastWildcardLabel(card.label)) cardClasses.push('is-wildcard');
    el.className = cardClasses.join(' ');
    var displayLabel = opts.displayLabel || card.label;
    var showTier = opts.showTier !== false && !opts.isPrimary;
    var rows = '';
    if (card.cigar)  rows += '<div class="sterlon-reco-row"><span>Cigar</span><strong>'  + PP.escapeHtml(card.cigar)  + '</strong></div>';
    if (card.spirit) rows += '<div class="sterlon-reco-row"><span>Spirit</span><strong>' + PP.escapeHtml(card.spirit) + '</strong></div>';
    el.innerHTML =
      '<div class="sterlon-reco-head"><span class="sterlon-reco-label">' + PP.escapeHtml(displayLabel) + '</span>' +
      (showTier ? '<span class="sterlon-reco-tier">' + PP.escapeHtml(card.tier) + '</span>' : '') +
      '</div>' +
      (card.descriptor ? '<div class="sterlon-reco-descriptor">' + PP.escapeHtml(card.descriptor) + '</div>' : '') +
      rows +
      '<div class="sterlon-reco-stock">' + PP.escapeHtml(card.stock) + '</div>';
    return el;
  }

  // ── Follow-up chip icon HTML ──────────────────────────────────────
  // Returns an HTML string (not an element) for the icon portion of a chip.

  function followChipIconHtml(cfg) {
    if (cfg.comparison) return '<i data-lucide="scale" class="ic-12"></i>';
    if (cfg.refinement && SP.FOLLOWUP_CHIP_ICONS[cfg.refinement]) {
      return '<i data-lucide="' + SP.FOLLOWUP_CHIP_ICONS[cfg.refinement] + '" class="ic-12"></i>';
    }
    return '';
  }

  // ── Public API ────────────────────────────────────────────────────

  window.SterlonCardRenderers = {
    recommendationMoodLine: recommendationMoodLine,
    emphasizeProductNames: emphasizeProductNames,
    renderUnifiedFlightCard: renderUnifiedFlightCard,
    renderConversationalPrimaryCard: renderConversationalPrimaryCard,
    renderConversationalBackupCard: renderConversationalBackupCard,
    renderRecommendationCardEl: renderRecommendationCardEl,
    followChipIconHtml: followChipIconHtml
  };
})();
