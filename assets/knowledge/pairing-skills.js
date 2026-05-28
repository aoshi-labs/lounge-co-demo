/**
 * SterlonPairingSkills — pairing playbook runtime (API + selection).
 * Data: pairing-skills-data.js (generated via build-pairing-skills-runtime.py)
 */
(function (global) {
  'use strict';

  var SKILLS = global.PAIRING_SKILLS_DATA || [];

  var META_CORE_IDS = ['PS-000', 'PS-002'];
  var SLOT_CORE_IDS = ['PS-123', 'PS-124'];

  var SECTION_ALIASES = {
    bourbon: 'BOURBON',
    rye: 'BOURBON',
    whiskey: 'WHISKEY',
    whisky: 'WHISKEY',
    scotch: 'WHISKEY',
    japanese: 'WHISKEY',
    rum: 'RUM',
    cognac: 'COGNAC_BRANDY',
    brandy: 'COGNAC_BRANDY',
    tequila: 'TEQUILA_MEZCAL',
    mezcal: 'TEQUILA_MEZCAL',
    agave: 'TEQUILA_MEZCAL',
    wine: 'WINE_BUBBLES',
    champagne: 'WINE_BUBBLES',
    beer: 'BEER',
    coffee: 'COFFEE_CHOCOLATE',
    chocolate: 'COFFEE_CHOCOLATE',
    peat: 'INTENSITY',
    mild: 'INTENSITY',
    bold: 'INTENSITY',
    surprise: 'FRAMEWORK',
    safe: 'STERLON_SLOTS',
    wildcard: 'STERLON_SLOTS',
    pairing: 'STERLON_SLOTS'
  };

  function normalizeText(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/['']/g, "'")
      .replace(/[^a-z0-9\s'/+-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parseTriggers(triggers) {
    if (!triggers) return [];
    return triggers
      .toLowerCase()
      .split(/[/|,]/)
      .map(function (p) {
        return p.trim();
      })
      .filter(function (p) {
        return p.length >= 3;
      });
  }

  function getById(id) {
    for (var i = 0; i < SKILLS.length; i++) {
      if (SKILLS[i].id === id) return SKILLS[i];
    }
    return null;
  }

  function getAll() {
    return SKILLS.slice();
  }

  function getBySection(section) {
    return SKILLS.filter(function (s) {
      return s.section === section;
    });
  }

  function detectSections(text) {
    var t = normalizeText(text);
    var out = {};
    Object.keys(SECTION_ALIASES).forEach(function (key) {
      if (t.indexOf(key) !== -1) out[SECTION_ALIASES[key]] = true;
    });
    return Object.keys(out);
  }

  function scoreSkill(skill, text) {
    var score = 0;
    if (skill.priority === 1) score += 2;
    var parts = parseTriggers(skill.triggers);
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] && text.indexOf(parts[i]) !== -1) score += 4;
    }
    if (skill.title && text.indexOf(skill.title.toLowerCase()) !== -1) score += 2;
    if (skill.mode && text.indexOf(skill.mode.toLowerCase()) !== -1) score += 1;
    return score;
  }

  function selectForTurn(opts) {
    var o = opts || {};
    var text = normalizeText(o.memberText || '');
    var maxSkills = o.maxSkills || 8;
    var chosen = {};
    var ordered = [];
    var rawFocus = o.categoryFocus;
    if (!rawFocus) {
      var _t = text;
      if (
        /\b(spirit only|pour only|whiskey only|bourbon only|just (a |the )?(pour|spirit|whiskey|whisky|bourbon)|no cigar|without a cigar)\b/.test(
          _t
        )
      ) {
        rawFocus = 'spirit';
      } else if (/\b(cigar only|smoke only|just (a |the )?cigar|no pour|without a pour)\b/.test(_t)) {
        rawFocus = 'cigar';
      }
    }
    var focus = rawFocus || 'open';

    function add(skill) {
      if (!skill || chosen[skill.id]) return;
      chosen[skill.id] = true;
      ordered.push(skill);
    }

    var includeMeta = o.includeMeta !== false;
    var isPairingFocus =
      focus === 'pairing' ||
      (focus === 'open' &&
        /\b(full flight|go(es)? with|best.*wildcard|build me a.*(pairing|flight)|pairing flight)\b/.test(
          text
        ));
    var includeSlots = o.includeSlots !== false && isPairingFocus;
    if (includeMeta) {
      META_CORE_IDS.forEach(function (id) {
        add(getById(id));
      });
    }
    add(getById('PS-123'));
    if (includeSlots) {
      add(getById('PS-124'));
      if (o.pairingMode === 'safe') add(getById('PS-121'));
      else if (o.pairingMode === 'wildcard') add(getById('PS-122'));
      else add(getById('PS-120'));
    }

    var sections = detectSections(text);
    SKILLS.forEach(function (skill) {
      if (skill.section === 'META' || skill.section === 'STERLON_SLOTS') return;
      var secHit = sections.indexOf(skill.section) !== -1;
      var trigScore = scoreSkill(skill, text);
      if (secHit) trigScore += 3;
      if (trigScore > 0) skill._score = trigScore;
    });

    var ranked = SKILLS.filter(function (s) {
      return s._score > 0;
    }).sort(function (a, b) {
      if (b._score !== a._score) return b._score - a._score;
      return a.priority - b.priority;
    });

    var SPIRIT_ONLY_EXCLUDE = {
      'PS-010': 1,
      'PS-011': 1,
      'PS-013': 1,
      'PS-030': 1,
      'PS-031': 1,
      'PS-032': 1,
      'PS-033': 1,
      'PS-040': 1
    };
    var CIGAR_ONLY_EXCLUDE = { 'PS-030': 1, 'PS-031': 1, 'PS-032': 1, 'PS-033': 1, 'PS-040': 1 };
    var excludeForFocus =
      focus === 'spirit' ? SPIRIT_ONLY_EXCLUDE : focus === 'cigar' ? CIGAR_ONLY_EXCLUDE : null;

    for (var i = 0; i < ranked.length && ordered.length < maxSkills; i++) {
      if (excludeForFocus && excludeForFocus[ranked[i].id]) {
        delete ranked[i]._score;
        continue;
      }
      add(ranked[i]);
      delete ranked[i]._score;
    }

    SKILLS.forEach(function (s) {
      delete s._score;
    });
    return ordered;
  }

  function formatSkillLine(skill) {
    var parts = [skill.id + ' ' + skill.title + ': ' + skill.rule];
    if (skill.cigarSignals || skill.spiritSignals) {
      parts.push(
        'Signals cigar ' +
          (skill.cigarSignals || '—') +
          ' · spirit ' +
          (skill.spiritSignals || '—')
      );
    }
    if (skill.mode) parts.push('Mode ' + skill.mode);
    if (skill.bodyMatch) parts.push('Body ' + skill.bodyMatch);
    if (skill.bridges) parts.push('Bridges ' + skill.bridges);
    if (skill.example) parts.push('e.g. ' + skill.example);
    return '- ' + parts.join(' · ');
  }

  function buildSystemPromptBlock(opts) {
    var base = opts || {};
    base.maxSkills = base.maxSkills || 12;
    base.includeMeta = true;
    base.includeSlots = true;
    if (!base.memberText) {
      base.memberText = 'pairing playbook session';
    }
    var selected = selectForTurn(base);
    var seen = {};
    selected.forEach(function (s) {
      seen[s.id] = true;
    });
    ['PS-001', 'PS-121', 'PS-122'].forEach(function (id) {
      if (!seen[id]) {
        var s = getById(id);
        if (s) selected.push(s);
      }
    });
    var lines = [
      'PAIRING SKILLS (tracker playbook — apply INTENSITY, then CATEGORY, then flavor bridges)',
      'Use operative rules below with menu SKUs; flavor chips must match official Cigars/Spirits rows.',
      'House examples (not fixed triples):'
    ];
    var pb = global.MenuFlavorCatalog && global.MenuFlavorCatalog.sterlonHousePlaybook;
    if (pb && pb.length) {
      for (var h = 0; h < pb.length; h++) {
        if (!pb[h] || !pb[h].line) continue;
        lines.push('- ' + pb[h].line + (pb[h].rationale ? ' — ' + pb[h].rationale : ''));
      }
    }
    lines.push('');
    lines.push('Active rules for this session:');
    for (var i = 0; i < selected.length; i++) {
      lines.push(formatSkillLine(selected[i]));
    }
    return lines.join('\n');
  }

  function buildTurnBlock(memberText, opts) {
    var o = opts || {};
    o.memberText = memberText;
    o.maxSkills = o.maxSkills || 6;
    o.includeMeta = true;
    o.includeSlots = true;
    var selected = selectForTurn(o);
    if (!selected.length) return '';
    var lines = ['PAIRING SKILLS (this turn — follow these operative rules):'];
    for (var i = 0; i < selected.length; i++) {
      lines.push(formatSkillLine(selected[i]));
    }
    return lines.join('\n');
  }

  function isPairingIntent(text, opts) {
    var t = normalizeText(text);
    var focus = (opts && opts.categoryFocus) || 'open';
    if (
      /\b(spirit only|pour only|cigar only|smoke only|no cigar|no pour|without a cigar|without a pour|just (a |the )?(pour|spirit|cigar|smoke))\b/.test(
        t
      )
    ) {
      return false;
    }
    if (focus === 'spirit' || focus === 'cigar') {
      return /\b(pair|pairing|go(es)? with|full flight|best.*wildcard|wildcard.*best|build me a.*(pairing|flight))\b/.test(
        t
      );
    }
    if (
      /\b(pairing flight|full flight|build me a.*(pairing|flight)|best.*wildcard|wildcard.*best|go(es)? with|what (should|to) (drink|pour)|after dinner (pairing|flight)|surprise me|can'?t go wrong)\b/.test(
        t
      )
    ) {
      return true;
    }
    if (/\b(pair|pairing)\b/.test(t) && /\b(recommend|suggest|build|flight|best|wildcard|safe|give me|for me)\b/.test(t)) {
      return true;
    }
    return false;
  }

  global.SterlonPairingSkills = {
    version: 1,
    SKILLS: SKILLS,
    getAll: getAll,
    getById: getById,
    getBySection: getBySection,
    selectForTurn: selectForTurn,
    buildSystemPromptBlock: buildSystemPromptBlock,
    buildTurnBlock: buildTurnBlock,
    isPairingIntent: isPairingIntent,
    formatSkillLine: formatSkillLine
  };
})(typeof window !== 'undefined' ? window : global);
