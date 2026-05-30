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

  function collectEmphasisNames(cardOrCards, plainText) {
    var names = [];
    var cards = cardOrCards ? (Array.isArray(cardOrCards) ? cardOrCards : [cardOrCards]) : [];
    if (cards.length) {
      var RP = window.RecommendationPresentation;
      if (RP && typeof RP.displayNamesForEmphasis === 'function') {
        names = RP.displayNamesForEmphasis(cards);
      }
      if (!names.length) {
        cards.forEach(function (card) {
          if (!card) return;
          if (card.cigar) names.push(card.cigar);
          if (card.spirit) names.push(card.spirit);
        });
      }
    }
    if (plainText) {
      var SPM = window.SterlonProductMatch;
      if (SPM && typeof SPM.findProductMentionsInText === 'function') {
        names = names.concat(SPM.findProductMentionsInText(plainText));
      }
    }
    var seen = Object.create(null);
    return names
      .filter(Boolean)
      .filter(function (name) {
        var key = String(name).toLowerCase();
        if (seen[key]) return false;
        seen[key] = true;
        return true;
      })
      .sort(function (a, b) { return String(b).length - String(a).length; });
  }

  function foldProductApostrophes(text) {
    return String(text || '').replace(/[\u2018\u2019\u2032`´]/g, "'");
  }

  function namePattern(name) {
    var escaped = escapeRegExp(foldProductApostrophes(name)).replace(/'/g, "[''\u2018\u2019\u2032]");
    if (escaped.length <= 5) return '\\b' + escaped + '\\b';
    return escaped;
  }

  function unwrapProductBoldMarkdown(plain) {
    var names = [];
    var text = String(plain || '').replace(/\*\*([^*]{2,80})\*\*/g, function (_, inner) {
      var name = String(inner || '').trim();
      if (name) names.push(name);
      return name;
    });
    return { text: text, markdownNames: names };
  }

  function collectNamesInPlain(plain, cardOrCards, mentionSource) {
    var normalizedPlain = foldProductApostrophes(plain);
    var allNames = collectEmphasisNames(cardOrCards, mentionSource || normalizedPlain);
    var inBlock = [];
    var seen = Object.create(null);
    allNames.forEach(function (name) {
      var re = new RegExp(namePattern(name), 'gi');
      var match;
      while ((match = re.exec(normalizedPlain)) !== null) {
        var hit = match[0];
        var key = hit.toLowerCase();
        if (seen[key]) continue;
        seen[key] = true;
        inBlock.push(hit);
      }
    });
    return inBlock.sort(function (a, b) { return b.length - a.length; });
  }

  function escapeRegExp(text) {
    return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function buildEmphasisRanges(plainText, names) {
    var plain = foldProductApostrophes(plainText);
    var candidates = [];
    names.forEach(function (name) {
      var re = new RegExp(namePattern(name), 'gi');
      var match;
      while ((match = re.exec(plain)) !== null) {
        candidates.push({
          start: match.index,
          end: match.index + match[0].length,
          len: match[0].length
        });
      }
    });
    candidates.sort(function (a, b) {
      if (b.len !== a.len) return b.len - a.len;
      return a.start - b.start;
    });
    var accepted = [];
    candidates.forEach(function (candidate) {
      var overlaps = accepted.some(function (slot) {
        return !(candidate.end <= slot.start || candidate.start >= slot.end);
      });
      if (!overlaps) accepted.push(candidate);
    });
    accepted.sort(function (a, b) { return a.start - b.start; });
    return accepted;
  }

  function renderPlainWithEmphasisRanges(plainText, ranges) {
    var plain = foldProductApostrophes(plainText);
    if (!ranges.length) {
      return PP.escapeHtml(PP.repairMojibake(plain));
    }
    var html = '';
    var cursor = 0;
    ranges.forEach(function (range) {
      if (range.start > cursor) {
        html += PP.escapeHtml(PP.repairMojibake(plain.slice(cursor, range.start)));
      }
      html += '<span class="sterlon-reco-emphasis">' +
        PP.escapeHtml(PP.repairMojibake(plain.slice(range.start, range.end))) +
        '</span>';
      cursor = range.end;
    });
    if (cursor < plain.length) {
      html += PP.escapeHtml(PP.repairMojibake(plain.slice(cursor)));
    }
    return html;
  }

  function emphasizeProductNamesFromPlain(plainText, cardOrCards, mentionSource) {
    var plain = foldProductApostrophes(PP.repairMojibake(String(plainText || '')));
    if (!plain) return '';
    var unwrapped = unwrapProductBoldMarkdown(plain);
    plain = unwrapped.text;
    var SPM = window.SterlonProductMatch;
    var isProduct = SPM && typeof SPM.isLikelyProductName === 'function'
      ? SPM.isLikelyProductName.bind(SPM)
      : function () { return true; };
    var names = collectNamesInPlain(plain, cardOrCards, mentionSource || plain);
    unwrapped.markdownNames.forEach(function (name) {
      if (!isProduct(name)) return;
      if (names.some(function (hit) { return hit.toLowerCase() === name.toLowerCase(); })) return;
      if (new RegExp(namePattern(name), 'i').test(plain)) names.push(name);
    });
    names = names.sort(function (a, b) { return String(b).length - String(a).length; });
    if (!names.length) {
      return PP.escapeHtml(plain);
    }
    return renderPlainWithEmphasisRanges(plain, buildEmphasisRanges(plain, names));
  }

  function emphasizeProductNames(html, cardOrCards, plainText, mentionSource) {
    if (plainText) {
      return emphasizeProductNamesFromPlain(plainText, cardOrCards, mentionSource || plainText);
    }
    var names = collectEmphasisNames(cardOrCards, mentionSource);
    if (!names.length) return html;
    names.forEach(function (name) {
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
    emphasizeProductNamesFromPlain: emphasizeProductNamesFromPlain,
    renderUnifiedFlightCard: renderUnifiedFlightCard,
    renderConversationalPrimaryCard: renderConversationalPrimaryCard,
    renderConversationalBackupCard: renderConversationalBackupCard,
    renderRecommendationCardEl: renderRecommendationCardEl,
    followChipIconHtml: followChipIconHtml
  };
})();
