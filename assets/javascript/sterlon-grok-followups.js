/**
 * sterlon-grok-followups.js — contextual follow-up chips for Grok sommelier mode.
 *
 * Parses [[FOLLOW]] blocks from model output and falls back to scored chip library
 * when the model omits or under-fills the block.
 */
(function (global) {
  'use strict';

  var FOLLOW_BLOCK_RE = /\[\[FOLLOW\]\]\s*([\s\S]*?)\s*\[\[\/FOLLOW\]\]/i;
  var BRACKET_ROW_RE = /\[(?:[^\]]+)\](?:\s*[•·|]\s*\[(?:[^\]]+)\]){1,2}\s*$/;

  var CHIP_LIBRARY = [
    {
      id: 'lower_proof',
      label: 'Lower the Proof',
      prompt: 'My palate is getting tired — suggest a softer, lower-proof pairing for the rest of this smoke.',
      icon: 'chevron-down',
      weight: 0,
      signals: [/high[\s-]?proof|barrel proof|cask strength|stagg|booker'?s?|114|120|130|\b6[0-9]\s*%/i, /fatigue|heavy|hammer|intense|aggressive|hot on the finish/i]
    },
    {
      id: 'more_contrast',
      label: 'More Contrast',
      prompt: 'Keep the same cigar — push a more contrasting pour that changes the vibe on the palate.',
      icon: 'arrow-left-right',
      weight: 0,
      signals: [/complement|similar|echo|match|same lane|harmon/i, /pair(?:ing)?|together| alongside /i]
    },
    {
      id: 'zero_alcohol',
      label: 'Zero Alcohol',
      prompt: 'Pair this with a zero-alcohol option instead — something that still respects the smoke.',
      icon: 'cup-soda',
      weight: 0,
      signals: [/bourbon|whiskey|whisky|scotch|rye|proof|dram|pour|neat|glass/i]
    },
    {
      id: 'budget_friendly',
      label: 'Budget Friendly',
      prompt: 'Same vibe, but keep both the pour and the cigar more approachable on spend.',
      icon: 'wallet',
      weight: 0,
      signals: [/premium|luxury|allocated|anniversary|40th|pappy|unicorn|\$\d{3}|special occasion|top shelf/i]
    },
    {
      id: 'daily_smoker',
      label: 'Daily Smoker Match',
      prompt: 'Skip the occasion bottle — what is the daily-driver pairing for this cigar?',
      icon: 'calendar',
      weight: 0,
      signals: [/premium|luxury|anniversary|40th|celebration|special occasion/i, /padron|opus|davidoff|cohiba/i]
    },
    {
      id: 'lighter_brighter',
      label: 'Lighter & Brighter',
      prompt: 'Take this pairing lighter and brighter — less weight, more lift on the finish.',
      icon: 'sun',
      weight: 0,
      signals: [/dark|heavy|maduro|full[\s-]?body|rich|dense|dessert|sherry bomb|peat|smoke bomb/i]
    },
    {
      id: 'morning_smoke',
      label: 'Morning Smoke',
      prompt: 'I am heading toward a morning smoke — what should I reach for instead?',
      icon: 'sunrise',
      weight: 0,
      signals: [/dessert|nightcap|after dinner|late night|evening|sherry|port|maduro|dark chocolate/i]
    },
    {
      id: 'amp_spice',
      label: 'Amp the Spice',
      prompt: 'Same direction, but turn the spice and energy up a notch.',
      icon: 'flame',
      weight: 0,
      signals: [/mild|soft|cream|connecticut|subtle|elegant|refined|delicate/i]
    },
    {
      id: 'top_tier_luxury',
      label: 'Top Tier Luxury',
      prompt: 'Dress this up — give me the special-occasion, top-tier version of this pairing.',
      icon: 'crown',
      weight: 0,
      signals: [/budget|daily|approachable|weeknight|tuesday|casual|under \$/i]
    },
    {
      id: 'three_options',
      label: 'Three Options',
      prompt: 'Give me three distinct pairing options with different directions.',
      icon: 'list',
      weight: 0,
      signals: [/^(?:give me|show me|list|options)/i]
    },
    {
      id: 'swap_cigar',
      label: 'Swap the Cigar',
      prompt: 'Keep the pour — recommend a different cigar that works better.',
      icon: 'shuffle',
      weight: 0,
      signals: [/bourbon|whiskey|whisky|scotch|rye|rum|tequila|mezcal|dram|pour/i]
    },
    {
      id: 'swap_spirit',
      label: 'Swap the Pour',
      prompt: 'Keep the cigar — recommend a different spirit that works better.',
      icon: 'wine',
      weight: 0,
      signals: [/cigar|smoke|robusto|toro|maduro|wrapper|padron|fuente|oliva|liga/i]
    }
  ];

  function normalizeLabel(text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  }

  function lookupLibraryChip(label) {
    var key = normalizeLabel(label);
    if (!key) return null;
    for (var i = 0; i < CHIP_LIBRARY.length; i += 1) {
      var chip = CHIP_LIBRARY[i];
      if (normalizeLabel(chip.label) === key) return chip;
    }
    for (var j = 0; j < CHIP_LIBRARY.length; j += 1) {
      var candidate = CHIP_LIBRARY[j];
      var candidateKey = normalizeLabel(candidate.label);
      if (key.indexOf(candidateKey) >= 0 || candidateKey.indexOf(key) >= 0) return candidate;
    }
    return null;
  }

  function isValidChipLabel(label) {
    var cleaned = String(label || '').trim();
    if (!cleaned || cleaned.length < 3 || cleaned.length > 48) return false;
    var key = normalizeLabel(cleaned);
    if (!key || key === 'follow' || key === 'follow instructions') return false;
    if (/^\/follow$/i.test(key)) return false;
    if (/^\[\[/.test(cleaned) || /\]\]$/.test(cleaned)) return false;
    return true;
  }

  function parseFollowBlock(body) {
    var chips = [];
    String(body || '').split('\n').forEach(function (line) {
      var trimmed = line.trim();
      if (!trimmed || /^\[\[/.test(trimmed)) return;
      var parts = trimmed.split('|');
      var label = (parts[0] || '').trim();
      var prompt = (parts.slice(1).join('|') || '').trim();
      if (!isValidChipLabel(label)) return;
      if (!prompt) {
        var known = lookupLibraryChip(label);
        prompt = known ? known.prompt : ('Tell me more about ' + label.toLowerCase() + '.');
      }
      var lib = lookupLibraryChip(label);
      chips.push({
        label: label,
        prompt: prompt,
        icon: lib && lib.icon ? lib.icon : 'sparkles'
      });
    });
    return chips;
  }

  function parseBracketRow(text) {
    var matches = String(text || '').match(/\[([^\]]+)\]/g);
    if (!matches || !matches.length) return [];
    return matches.slice(0, 3).map(function (token) {
      var label = token.replace(/^\[|\]$/g, '').trim();
      if (!isValidChipLabel(label)) return null;
      var lib = lookupLibraryChip(label);
      return {
        label: label,
        prompt: lib ? lib.prompt : label,
        icon: lib && lib.icon ? lib.icon : 'sparkles'
      };
    }).filter(Boolean);
  }

  function scoreChipLibrary(context) {
    var ctx = String(context || '');
    return CHIP_LIBRARY.map(function (chip) {
      var score = chip.weight || 0;
      (chip.signals || []).forEach(function (signal) {
        if (signal.test(ctx)) score += 1;
      });
      return { chip: chip, score: score };
    }).sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return 0;
    });
  }

  function selectFallbackChips(userMessage, assistantProse, excludeLabels) {
    var exclude = Object.create(null);
    (excludeLabels || []).forEach(function (label) {
      exclude[normalizeLabel(label)] = true;
    });
    var context = [userMessage, assistantProse].filter(Boolean).join('\n');
    var ranked = scoreChipLibrary(context);
    var picked = [];
    for (var i = 0; i < ranked.length && picked.length < 3; i += 1) {
      var chip = ranked[i].chip;
      if (ranked[i].score <= 0 && picked.length >= 1) continue;
      if (exclude[normalizeLabel(chip.label)]) continue;
      picked.push({
        label: chip.label,
        prompt: chip.prompt,
        icon: chip.icon
      });
    }
    if (picked.length < 3) {
      for (var j = 0; j < CHIP_LIBRARY.length && picked.length < 3; j += 1) {
        var fallback = CHIP_LIBRARY[j];
        if (exclude[normalizeLabel(fallback.label)]) continue;
        if (picked.some(function (p) { return normalizeLabel(p.label) === normalizeLabel(fallback.label); })) continue;
        picked.push({ label: fallback.label, prompt: fallback.prompt, icon: fallback.icon });
      }
    }
    return picked.slice(0, 3);
  }

  function mergeChipSets(primary, fallback) {
    var out = (primary || []).slice(0, 3);
    var seen = Object.create(null);
    out.forEach(function (chip) { seen[normalizeLabel(chip.label)] = true; });
    (fallback || []).forEach(function (chip) {
      if (out.length >= 3) return;
      if (seen[normalizeLabel(chip.label)]) return;
      seen[normalizeLabel(chip.label)] = true;
      out.push(chip);
    });
    return out.slice(0, 3);
  }

  function stripFollowArtifacts(text) {
    var prose = String(text || '');
    prose = prose.replace(/\[\[FOLLOW\]\][\s\S]*?\[\[\/FOLLOW\]\]/gi, '').trim();
    prose = prose.replace(/\[\[FOLLOW\]\][\s\S]*$/i, '').trim();
    prose = prose.replace(/\[\[\/FOLLOW\]\]/gi, '').trim();
    prose = prose.replace(/\[\[FOLLOW\]\]/gi, '').trim();
    prose = prose.replace(BRACKET_ROW_RE, '').trim();
    prose = prose.replace(/\n(?:Lower the Proof|More Contrast|Zero Alcohol|Budget Friendly|Daily Smoker Match|Lighter & Brighter|Morning Smoke|Amp the Spice|Top Tier Luxury|Three Options|Swap the Cigar|Swap the Pour)\|[^\n]*/gi, '').trim();
    prose = prose.replace(/\b[A-Z][A-Za-z0-9&' ]{2,48}\|[^\n.]{8,}/g, '').trim();
    return prose;
  }

  function parseGrokSommelierResponse(rawText, userMessage) {
    var raw = String(rawText || '');
    var parsed = [];
    var block = raw.match(FOLLOW_BLOCK_RE);
    if (block) parsed = parseFollowBlock(block[1]);
    if (!parsed.length && !/\[\[FOLLOW\]\]/i.test(raw) && !/\[\[\/FOLLOW\]\]/i.test(raw)) {
      parsed = parseBracketRow(raw);
    }
    var prose = stripFollowArtifacts(raw);
    var fallback = selectFallbackChips(userMessage, prose, parsed.map(function (c) { return c.label; }));
    return {
      prose: prose,
      chips: mergeChipSets(parsed, fallback).filter(function (chip) {
        return isValidChipLabel(chip && chip.label);
      })
    };
  }

  var GROK_FOLLOWUP_PROMPT_LINES = [
    'Follow-up buttons (every turn):',
    'After your conversational prose, append exactly three tap-to-send follow-up options tailored to what you just recommended.',
    'Use this hidden block only — never write [FOLLOW] or button labels in the visible prose:',
    '[[FOLLOW]]',
    'Lower the Proof|I am getting palate fatigue — suggest a softer, lower-proof pairing for the rest of this smoke.',
    'More Contrast|Same cigar — push a more contrasting pour.',
    'Zero Alcohol|Pair this with a zero-alcohol option instead.',
    '[[/FOLLOW]]',
    'Rotate labels and prompts every turn (budget-friendly, morning smoke, amp the spice, swap the pour, three options, etc.). Each line is Label|Full sentence the member would send next.'
  ].join('\n');

  global.SterlonGrokFollowups = {
    CHIP_LIBRARY: CHIP_LIBRARY,
    parseGrokSommelierResponse: parseGrokSommelierResponse,
    selectFallbackChips: selectFallbackChips,
    GROK_FOLLOWUP_PROMPT_LINES: GROK_FOLLOWUP_PROMPT_LINES
  };
})(typeof window !== 'undefined' ? window : global);
