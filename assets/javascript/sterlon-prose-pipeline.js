/* ──────────────────────────────────────────────────────────────────────
   sterlon-prose-pipeline.js — Pure text-transformation utilities for Sterlon.

   BOUNDARY CONTRACT
   May:   transform, clean, normalize, and format string content for
          presentation. All functions are pure — they take a string (or card
          object for field access) and return a string with no side effects.
   May NOT: create recommendations, mutate RecommendationTurn, assign
            products or scores, route orchestration, access PairingEngine,
            call RecommendationRuntime, read or write session state,
            or mutate live DOM nodes.

   Depends on: window.SterlonPresentationOverlays (for MOJIBAKE_REPAIR_PAIRS).
   Must be loaded after sterlon-presentation-overlays.js.
   ────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  var SP = window.SterlonPresentationOverlays;

  // ── Mojibake repair ────────────────────────────────────────────────

  function repairMojibake(text) {
    var repaired = String(text || '');
    SP.MOJIBAKE_REPAIR_PAIRS.forEach(function (pair) {
      repaired = repaired.split(pair[0]).join(pair[1]);
    });
    return repaired;
  }

  // ── [[RECO]] block stripping ───────────────────────────────────────

  function stripStructuredRecoBlocks(text) {
    return repairMojibake(text).replace(/\[\[RECO\]\][\s\S]*?\[\[\/RECO\]\]/g, '').trim();
  }

  // ── Whitespace and sentence normalisation ─────────────────────────

  function normalizeSentenceSpacing(text) {
    return repairMojibake(text)
      .replace(/\s+([,.!?;:])/g, '$1')
      .replace(/([.!?])([A-Z])/g, '$1 $2')
      .replace(/([.!?])([A-Z][a-z])/g, '$1 $2')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/[ \t]+\n/g, '\n');
  }

  function removeListicleScaffolding(text) {
    return repairMojibake(text)
      .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, '')
      .replace(/\b(?:option|choice|recommendation)\s+\d+\s*[:.-]\s*/gi, '')
      .replace(/\b(?:here are|here's)\s+(?:some|a few|three|3)\s+(?:options|recommendations|choices)[^.?!]*[.?!]?\s*/gi, '')
      .replace(/\b(?:first|second|third),\s+(?=(?:I|the|a|an)\b)/gi, '');
  }

  function removeAssistantDrift(text) {
    return repairMojibake(text)
      .replace(/\bhow can I help(?: you)?(?: today| tonight)?\??/gi, 'Tell me where the evening is leaning.')
      .replace(/\bbased on (?:your|the) (?:preferences|profile|taste profile|data|history)[, ]*/gi, '')
      .replace(/\bas an ai\b[^.?!]*[.?!]?/gi, '')
      .replace(/\bi (?:would )?recommend(?: that you try| trying| you go with)?\b/gi, 'my pick is')
      .replace(/\bi suggest(?: that you try| trying)?\b/gi, 'my pick is')
      .replace(/\blet me (?:assist|help) you\b/gi, 'we can shape this')
      .replace(/\bI can help with that\b[.?!]?/gi, '')
      .replace(/\bin conclusion[, ]*/gi, '')
      .replace(/\boverall[, ]*/gi, '')
      .replace(/\bit depends on your preferences\b[.?!]?/gi, 'we can narrow it from the room you want.');
  }

  // ── Sentence and word limiters ────────────────────────────────────

  function splitSentences(text) {
    return repairMojibake(text).match(/[^.!?]+[.!?]?/g) || [];
  }

  function limitSentenceCount(text, maxSentences) {
    var raw = String(text || '').trim();
    if (!maxSentences || maxSentences < 1) return raw;
    var paragraphs = raw.split(/\n\n+/).filter(Boolean);
    var kept = [];
    var remaining = maxSentences;
    for (var i = 0; i < paragraphs.length && remaining > 0; i += 1) {
      var sentences = splitSentences(paragraphs[i]).map(function (s) { return s.trim(); }).filter(Boolean);
      var part = sentences.slice(0, remaining).join(' ');
      if (part) kept.push(part);
      remaining -= sentences.length;
    }
    return kept.join('\n\n') || raw;
  }

  function wordCount(text) {
    return String(text || '').trim().split(/\s+/).filter(Boolean).length;
  }

  function limitWordCount(text, maxWords) {
    var raw = repairMojibake(text).trim();
    if (!maxWords || wordCount(raw) <= maxWords) return raw;
    var words = raw.split(/\s+/).slice(0, maxWords);
    var trimmed = words.join(' ');
    if (!/[.!?]$/.test(trimmed)) trimmed = trimmed.replace(/[,:;\-]?$/, '.');
    var lastStop = Math.max(trimmed.lastIndexOf('.'), trimmed.lastIndexOf('!'), trimmed.lastIndexOf('?'));
    if (lastStop > Math.floor(trimmed.length * 0.58)) trimmed = trimmed.slice(0, lastStop + 1);
    if (/[.!?]$/.test(trimmed)) return trimmed;
    return trimmed.replace(/[,:;\-]?$/, '.');
  }

  // ── Concierge voice scrubbing ─────────────────────────────────────

  function scrubConciergePhrases(text) {
    return repairMojibake(text)
      .replace(/\bperfect pairing\b/gi, 'excellent match')
      .replace(/\babsolutely\b/gi, '')
      .replace(/\byou'll love\b/gi, 'you may appreciate')
      .replace(/\bgame changer\b/gi, 'notable shift')
      .replace(/\bnext level\b/gi, 'more polished')
      .replace(/\bhere are some options\b/gi, '')
      .replace(/\bhow can I help\b\??/gi, 'Tell me where the evening is leaning.')
      .replace(/\bbased on your preferences\b,?/gi, '')
      .replace(/\bI would recommend\b/gi, 'my pick is')
      .replace(/\bI recommend\b/gi, 'my pick is');
  }

  /** Presentation-only — strips runtime / framework language from visible prose. */
  function stripCatalogSchemaFromProse(text) {
    var t = repairMojibake(String(text || '')).trim();
    if (!t) return '';

    t = t.replace(/\s*\|\s*(?:Menu|Size|Wrapper|Binder|Filler|Body|MSRP|Occasion|Smoke time|Blurb|Note|Sensory beats)\s*:[^|]*/gi, '');
    t = t.replace(/\b(?:Menu|Size|Wrapper|Binder|Filler|Body|MSRP|Occasion|Smoke time|Blurb|Note|Sensory beats)\s*:\s*[^|.\n]+/gi, '');
    t = t.replace(/\$\d+(?:\.\d{2})?\s*\|\s*Size\s*:[^.\n]+/gi, '');
    t = t.replace(/\|\s*MSRP\s*:\s*\$\d+[^.\n]*/gi, '');
    t = t.replace(/\s*·\s*\d+(?:\.\d+)?\s*×\s*\d+[^.\n]*(?:Robusto|Toro|Corona|Figurado|Petit|Lonsdale|Chisel|Torpedo)[^.\n]*/gi, '');
    t = t.replace(/\bRecommend(?: when| for)[^.]*\.?/gi, '');
    t = t.replace(/\bvalue seekers?[^.]*\.?/gi, '');
    t = t.replace(/\bhumidor fillers?[^.]*\.?/gi, '');
    t = t.replace(/\bsomething good under \$[^.]*\.?/gi, '');
    t = t.replace(/\[MOCK\][^\n]*/gi, '');
    t = t.replace(/\s*\|\s*/g, ' ');
    t = normalizeSentenceSpacing(t).replace(/\n{3,}/g, '\n\n').trim();
    return t;
  }

  function isOpsFacingWhyLine(line) {
    var t = String(line || '').toLowerCase();
    return /\brecommend when|\brecommend for|value seeker|humidor filler|something good under|top 25|best for teaching| - cit\.?$/i.test(t);
  }

  /** Presentation-only — strips runtime / framework language from visible prose. */
  function humanizePresentationProse(text) {
    var t = scrubConciergePhrases(stripStructuredRecoBlocks(text || '')).trim();
    t = t.replace(/\bHonestly,?\s+I would probably\b/gi, 'I\'d probably');
    t = t.replace(/\bHere is the adjusted flight[^.]*\.?/gi, '');
    t = t.replace(/\bI eased the [^.]*\.?/gi, '');
    t = t.replace(/\bI (?:adjusted|shifted) the (?:flight|recommendation)[^.]*\.?/gi, '');
    t = t.replace(/\bpower-to-power body alignment[^.]*\.?/gi, '');
    t = t.replace(/\b(body alignment|flavor architecture|member sentiment|balanced framework|pairing optimization|recommendation lane|pairing logic|pairing frame|same pairing logic|adjusted flight|washout|palate fatigue)\b/gi, '');
    t = t.replace(/\b(i do not have that in my database|not in (?:my|the) database|according to (?:my|the) data)\b/gi, '');
    t = t.replace(/\b(inventory system|catalog lookup|parameter|filter setting)\b/gi, '');
    t = t.replace(/\b(interlock|interlock\.|bridges? the .+ profile)\b/gi, function (m) {
      return /interlock/i.test(m) ? 'echo each other' : m;
    });
    // Collapse runs of spaces / tabs only — DO NOT collapse newlines, since
    // formatConciergeText relies on \n\n paragraph breaks to split the
    // ownership line from the sensory paragraph and observation.
    t = normalizeSentenceSpacing(t).replace(/[ \t]+([,.])/g, '$1');
    // Normalize 3+ consecutive newlines down to exactly two (paragraph break).
    t = t.replace(/\n{3,}/g, '\n\n').trim();
    return stripCatalogSchemaFromProse(t);
  }

  // ── HTML helpers ──────────────────────────────────────────────────

  function escapeHtml(text) {
    return repairMojibake(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Converts **bold** markdown (already HTML-escaped) to <strong> tags.
  // Call after escapeHtml, before setting innerHTML.
  function applyInlineBold(escapedHtml) {
    return String(escapedHtml || '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }

  // ── Prelude template filling ──────────────────────────────────────
  // Substitutes {{cigar}} with the active card's cigar name.

  function fillPreludeTemplate(template, card) {
    var cigarName = (card && card.cigar) ? card.cigar : 'the cigar';
    return String(template || '').split('{{cigar}}').join(cigarName);
  }

  // ── Display name helpers ──────────────────────────────────────────

  function shortProductLabel(name, category) {
    if (!name) return category === 'cigar' ? 'this cigar' : 'this pour';
    return name.replace(/\s+(16|12|17|18|23)yr\b/i, '').replace(/\s+Torpedo\b/i, '').trim();
  }

  // ── Mood tone application ─────────────────────────────────────────

  function applyMoodToneToProse(prose, mood) {
    if (!mood || !prose) return prose;
    if (mood === 'decompress' || mood === 'calm') {
      return prose.replace(/\b(I'd probably|Tonight I'd probably)\b/g, 'I would probably');
    }
    return prose;
  }

  // ── Lead prose detection ──────────────────────────────────────────

  function isFrameworkLeadProse(text) {
    var t = String(text || '').toLowerCase();
    return /tiered so you can choose|three tiers|two paths if you want|set the table for you tonight - a best pick|whiskey-forward - here is how|composed pairing - three/i.test(t);
  }

  var GENERIC_LEAD_FALLBACK =
    'Tonight I\'d keep it balanced — something you can sip slowly without anything fighting on the palate.';

  function isGenericLeadProse(rawText) {
    var text = humanizePresentationProse(rawText || '').trim();
    if (!text) return true;
    if (text === GENERIC_LEAD_FALLBACK) return true;
    return /tonight'?s strongest route remains balanced/i.test(text);
  }

  // ── Why-bullet humanisation ───────────────────────────────────────

  function humanizeWhyBullet(line) {
    var t = (line || '').trim();
    if (!t || isOpsFacingWhyLine(t)) return '';
    var known = {
      'Power-to-power body alignment avoids washout.': 'The smoke stays dry enough to sit beside the cigar without turning muddy.',
      'Dark chocolate and peat smoke interlock.': 'Dark chocolate and peat echo each other instead of fighting.',
      'Nut bitterness keeps smoke crisp.': 'Smoked almonds keep the smoke crisp between sips.',
      'Full-body match keeps both voices present.': 'Neither the pour nor the cigar disappears on the palate.',
      'Medium cigar body respects refined whisky texture.': 'The cigar stays medium-bodied so the whisky keeps its silk.',
      'Cream-hay profile bridges orchard fruit and spice.': 'Cream and hay in the cigar pick up the orchard fruit in the glass.',
      'Citrus brightens finish and resets palate.': 'A little citrus between sips keeps the finish clean.',
      'Body is balanced, no component dominates.': 'Nothing on the table shouts over anything else.',
      'Eased intensity while keeping the pairing frame coherent.': 'Keeps the richness but lands softer on the finish.',
      'Added depth and structure without leaving the same lane.': 'More weight in the glass without the smoke turning muddy.'
    };
    if (known[t]) return known[t];
    return humanizePresentationProse(t);
  }

  var FLIGHT_SLOT_HEADER_RES = [
    { key: 'best', re: /\*\*BEST\s+PICK\s*:\*\*/i },
    { key: 'refined', re: /\*\*REFINED\s+OPTION\s*:\*\*/i },
    { key: 'wildcard', re: /\*\*CONTRAST\s+WILDCARD\s*:\*\*/i }
  ];

  /**
   * Split three-slot recommendation prose by markdown headers.
   * Returns { best, refined, wildcard } strings (paragraph only, no header line).
   */
  function parseFlightSlotProse(text) {
    var out = { best: '', refined: '', wildcard: '' };
    var cleaned = stripStructuredRecoBlocks(text).trim();
    if (!cleaned) return out;

    var markers = [];
    var i;
    for (i = 0; i < FLIGHT_SLOT_HEADER_RES.length; i += 1) {
      var m = FLIGHT_SLOT_HEADER_RES[i];
      var match = cleaned.match(m.re);
      if (match) {
        markers.push({ key: m.key, index: match.index, len: match[0].length });
      }
    }
    if (markers.length < 2) return out;

    markers.sort(function (a, b) {
      return a.index - b.index;
    });

    function sliceSection(startIdx, endIdx) {
      var chunk = cleaned.slice(startIdx, endIdx).trim();
      chunk = chunk.replace(/^\*\*[^*]+\*\*\s*[^\n]*\n?/, '').trim();
      return humanizePresentationProse(chunk);
    }

    for (i = 0; i < markers.length; i += 1) {
      var start = markers[i].index + markers[i].len;
      var end = i + 1 < markers.length ? markers[i + 1].index : cleaned.length;
      out[markers[i].key] = sliceSection(start, end);
    }
    return out;
  }

  // ── Public API ────────────────────────────────────────────────────

  window.SterlonProsePipeline = {
    GENERIC_LEAD_FALLBACK: GENERIC_LEAD_FALLBACK,
    repairMojibake: repairMojibake,
    stripStructuredRecoBlocks: stripStructuredRecoBlocks,
    normalizeSentenceSpacing: normalizeSentenceSpacing,
    removeListicleScaffolding: removeListicleScaffolding,
    removeAssistantDrift: removeAssistantDrift,
    splitSentences: splitSentences,
    limitSentenceCount: limitSentenceCount,
    limitWordCount: limitWordCount,
    scrubConciergePhrases: scrubConciergePhrases,
    humanizePresentationProse: humanizePresentationProse,
    stripCatalogSchemaFromProse: stripCatalogSchemaFromProse,
    isOpsFacingWhyLine: isOpsFacingWhyLine,
    escapeHtml: escapeHtml,
    applyInlineBold: applyInlineBold,
    fillPreludeTemplate: fillPreludeTemplate,
    shortProductLabel: shortProductLabel,
    applyMoodToneToProse: applyMoodToneToProse,
    isFrameworkLeadProse: isFrameworkLeadProse,
    isGenericLeadProse: isGenericLeadProse,
    humanizeWhyBullet: humanizeWhyBullet,
    parseFlightSlotProse: parseFlightSlotProse
  };
})();
