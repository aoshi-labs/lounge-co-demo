/**

 * ProductKnowledge — prompt policy + on-demand teaching from LoungeProducts ontology.

 *

 * Catalog layer: full LoungeProducts (allowlist, scoring, cards).

 * Prompt layer: compact venue catalog in static SYSTEM_PROMPT when LoungeCatalog is ready.

 * Teaching layer: per-product briefs injected on expertise / named-product turns.

 */

(function (global) {

  'use strict';



  var PROMPT_RAIL_NOTE =

    'Venue catalog below powers recommendation cards; do not invent products off-menu.';



  var CATALOG_FOOTER_NOTE =

    'Full cigar catalog is selectable at runtime. When the member names a brand, use PRODUCT CONTEXT on that turn.';



  var BODY_TIER_ORDER = ['Light', 'Medium-Light', 'Medium', 'Medium-Full', 'Full'];



  function loungeProducts() {

    return global.LoungeProducts || null;

  }



  function isTrackerSourced(product) {

    return !!(product && product.tracker && product.tracker.sku);

  }



  /** Hand-curated catalog rows (no tracker.sku) — highlighted in compact catalog block. */

  function promptRailProducts(category) {

    var lp = loungeProducts();

    if (!lp) return [];

    var list = category === 'spirit' ? lp.spirits : lp.cigars;

    if (!list || !list.length) return [];

    return list.filter(function (p) {

      return p.category === category && !isTrackerSourced(p);

    });

  }



  function menuLineFor(product) {

    if (!product) return '';

    if (global.MenuFlavorCatalog && global.MenuFlavorCatalog.buildMenuLine) {

      return global.MenuFlavorCatalog.buildMenuLine(product);

    }

    return product.menuLine ? '- ' + product.menuLine : '';

  }



  function buildMenuBlock(label, products, footerLines) {

    var lines = products.map(menuLineFor).filter(Boolean);

    var out = [label, PROMPT_RAIL_NOTE];

    if (lines.length) {

      out = out.concat(lines);

    }

    if (footerLines && footerLines.length) {

      out = out.concat(footerLines);

    }

    return out.join('\n');

  }



  function normalizeBodyTier(body) {

    var b = String(body || '').trim();

    if (!b) return 'Medium';

    if (/medium-full/i.test(b)) return 'Medium-Full';

    if (/medium-light/i.test(b)) return 'Medium-Light';

    if (/^light\b/i.test(b) || /\blight\b/i.test(b) && !/medium/i.test(b)) return 'Light';

    if (/full/i.test(b)) return 'Full';

    if (/medium/i.test(b)) return 'Medium';

    return b;

  }



  function brandKey(name) {

    var parts = String(name || '').trim().split(/\s+/);

    return parts.slice(0, Math.min(2, parts.length)).join(' ');

  }



  function topTagIds(product, limit) {

    var tags = product && product.tags;

    if (!tags || !tags.length) return [];

    return tags

      .slice()

      .sort(function (a, b) {

        return (b.weight || 0) - (a.weight || 0);

      })

      .slice(0, limit || 3)

      .map(function (t) {

        return t.id;

      });

  }



  function catalogSampleSeed() {

    var d = new Date();

    return d.getUTCFullYear() * 1000 + d.getUTCMonth() * 32 + d.getUTCDate();

  }



  function hashIdx(seed, key, mod) {

    var h = seed;

    var s = String(key || '');

    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;

    return mod ? Math.abs(h) % mod : Math.abs(h);

  }



  /** Balanced cigar sample for LLM visibility — not a hero rail. */

  function sampleBalancedCigarExamples(allProducts, limit) {

    var cap = limit != null ? limit : 10;

    var seed = catalogSampleSeed();

    var pool = (allProducts || []).slice();

    if (!pool.length) return [];

    var byTier = {};

    BODY_TIER_ORDER.forEach(function (t) {

      byTier[t] = [];

    });

    pool.forEach(function (p) {

      var tier = normalizeBodyTier(p.spec && p.spec.body);

      if (!byTier[tier]) byTier[tier] = [];

      byTier[tier].push(p);

    });

    var picked = [];

    var perTier = Math.max(1, Math.ceil(cap / BODY_TIER_ORDER.length));

    BODY_TIER_ORDER.forEach(function (tier) {

      var list = byTier[tier] || [];

      if (!list.length) return;

      for (var i = 0; i < perTier && picked.length < cap; i++) {

        var idx = hashIdx(seed + i, tier, list.length);

        var p = list[idx];

        if (picked.indexOf(p) === -1) picked.push(p);

      }

    });

    var k = 0;

    while (picked.length < cap && k < pool.length) {

      var j = hashIdx(seed, 'fill-' + k, pool.length);

      if (picked.indexOf(pool[j]) === -1) picked.push(pool[j]);

      k++;

    }

    return picked.slice(0, cap);

  }



  /** Token-aware cigar appendix: balanced samples + body-tier rollup for tracker SKUs. */

  function buildAdaptiveCigarSamples(products, memberText, limit) {

    var cap = limit != null ? limit : 10;

    var SCR = global.SterlonCatalogRetrieval;

    if (SCR && memberText && typeof SCR.searchCatalog === 'function') {

      var hits = SCR.searchCatalog(memberText, { category: 'cigar', limit: cap });

      if (hits && hits.length) return hits.slice(0, cap);

    }

    return sampleBalancedCigarExamples(products, cap);

  }



  function buildCompactCigarCatalogLines(products, opts) {

    var o = opts || {};

    var tracker = [];

    (products || []).forEach(function (p) {

      if (isTrackerSourced(p)) tracker.push(p);

    });



    var lines = [];

    var sample = o.memberText

      ? buildAdaptiveCigarSamples(products, o.memberText, 10)

      : sampleBalancedCigarExamples(products, 10);

    if (sample.length) {

      lines.push('- Catalog examples (balanced sample — not priority picks):');

      sample.forEach(function (p) {

        var ml = menuLineFor(p);

        if (ml) lines.push('  ' + ml.replace(/^- /, ''));

      });

    }



    var buckets = {};

    BODY_TIER_ORDER.forEach(function (tier) {

      buckets[tier] = { count: 0, brands: {}, minMsrp: null, maxMsrp: null, tags: {} };

    });



    tracker.forEach(function (p) {

      var tier = normalizeBodyTier(p.spec && p.spec.body);

      if (!buckets[tier]) {

        buckets[tier] = { count: 0, brands: {}, minMsrp: null, maxMsrp: null, tags: {} };

      }

      var b = buckets[tier];

      b.count += 1;

      var bk = brandKey(p.name);

      b.brands[bk] = (b.brands[bk] || 0) + 1;

      var msrp = p.spec && p.spec.msrp;

      if (msrp != null) {

        if (b.minMsrp == null || msrp < b.minMsrp) b.minMsrp = msrp;

        if (b.maxMsrp == null || msrp > b.maxMsrp) b.maxMsrp = msrp;

      }

      topTagIds(p, 2).forEach(function (tid) {

        b.tags[tid] = (b.tags[tid] || 0) + 1;

      });

    });



    lines.push('- Tracker catalog (' + tracker.length + ' SKUs by body):');

    BODY_TIER_ORDER.forEach(function (tier) {

      var b = buckets[tier];

      if (!b || !b.count) return;

      var brandList = Object.keys(b.brands)

        .sort(function (a, bKey) {

          return b.brands[bKey] - b.brands[a];

        })

        .slice(0, 5);

      var tagList = Object.keys(b.tags)

        .sort(function (a, bKey) {

          return b.tags[bKey] - b.tags[a];

        })

        .slice(0, 4);

      var priceNote = '';

      if (b.minMsrp != null && b.maxMsrp != null && b.minMsrp !== b.maxMsrp) {

        priceNote = ' · $' + b.minMsrp + '–$' + b.maxMsrp;

      } else if (b.minMsrp != null) {

        priceNote = ' · from $' + b.minMsrp;

      }

      var tagNote = tagList.length ? ' · notes: ' + tagList.join(', ') : '';

      lines.push(

        '  · ' + tier + ': ' + b.count + ' · e.g. ' + brandList.join(', ') + priceNote + tagNote

      );

    });

    var brandIndex = buildCigarBrandIndex(tracker);

    if (brandIndex.length) {

      lines.push('- Brand index (' + Object.keys(brandIndex).length + ' families, use PRODUCT CONTEXT when member names a line):');

      brandIndex.slice(0, 28).forEach(function (row) {

        lines.push('  · ' + row);

      });

      if (brandIndex.length > 28) {

        lines.push('  · … +' + (brandIndex.length - 28) + ' more brands on rail');

      }

    }

    lines.push('- ' + CATALOG_FOOTER_NOTE);

    return lines;

  }



  /** Grouped brand → body tiers, tag families, price span (token-aware). */

  function buildCigarBrandIndex(tracker) {

    var families = Object.create(null);

    (tracker || []).forEach(function (p) {

      var bk = brandKey(p.name);

      if (!families[bk]) {

        families[bk] = { count: 0, bodies: {}, tags: {}, minMsrp: null, maxMsrp: null };

      }

      var f = families[bk];

      f.count += 1;

      var body = normalizeBodyTier(p.spec && p.spec.body);

      f.bodies[body] = (f.bodies[body] || 0) + 1;

      topTagIds(p, 2).forEach(function (tid) {

        f.tags[tid] = (f.tags[tid] || 0) + 1;

      });

      var msrp = p.spec && p.spec.msrp;

      if (msrp != null) {

        if (f.minMsrp == null || msrp < f.minMsrp) f.minMsrp = msrp;

        if (f.maxMsrp == null || msrp > f.maxMsrp) f.maxMsrp = msrp;

      }

    });

    return Object.keys(families)

      .sort(function (a, b) {

        return families[b].count - families[a].count;

      })

      .map(function (brand) {

        var f = families[brand];

        var bodyList = Object.keys(f.bodies)

          .sort(function (x, y) {

            return f.bodies[y] - f.bodies[x];

          })

          .slice(0, 2);

        var tagList = Object.keys(f.tags)

          .sort(function (x, y) {

            return f.tags[y] - f.tags[x];

          })

          .slice(0, 3);

        var price = '';

        if (f.minMsrp != null && f.maxMsrp != null && f.minMsrp !== f.maxMsrp) {

          price = ' · $' + f.minMsrp + '–$' + f.maxMsrp;

        } else if (f.minMsrp != null) {

          price = ' · from $' + f.minMsrp;

        }

        return (

          brand +

          ' (' +

          f.count +

          '): ' +

          bodyList.join(', ') +

          (tagList.length ? ' · ' + tagList.join(', ') : '') +

          price

        );

      });

  }



  function buildCigarsMenuBlock(opts) {

    var o = opts || {};

    var LC = global.LoungeCatalog;

    var includeTracker =

      o.includeTracker === true ||

      (LC && typeof LC.isReady === 'function' && LC.isReady());

    if (!includeTracker) {

      return buildMenuBlock('CIGARS (venue rail)', promptRailProducts('cigar'));

    }

    var lp = loungeProducts();

    var products = lp && lp.cigars ? lp.cigars.slice() : [];

    if (o.priceCeiling != null && isFinite(o.priceCeiling)) {
      var ceiling = Number(o.priceCeiling);
      products = products.filter(function (p) {
        var msrp = p.msrp != null ? Number(p.msrp) : (p.price != null ? Number(p.price) : null);
        return msrp == null || msrp <= ceiling;
      });
    }

    var lines = ['CIGARS (venue catalog — compact index)', PROMPT_RAIL_NOTE].concat(

      buildCompactCigarCatalogLines(products, { memberText: o.memberText })

    );

    return lines.join('\n');

  }



  function buildSpiritsMenuBlock(opts) {

    var o = opts || {};

    var LC = global.LoungeCatalog;

    var includeTracker =

      o.includeTracker === true ||

      (LC && typeof LC.isReady === 'function' && LC.isReady());

    var products = includeTracker

      ? (loungeProducts() && loungeProducts().spirits ? loungeProducts().spirits.slice() : [])

      : promptRailProducts('spirit');

    var footer = [];

    var WJ = global.WhiskeyJourney;

    if (WJ && WJ.INTRO) {

      footer.push(

        'Whiskey Journey: Novice → approachable pours with softer sweetness; ' +

          'Intermediate → more spice and oak; Advanced → long-aged or allocated complexity. ' +

          WJ.INTRO

      );

    }

    var label = includeTracker ? 'SPIRITS (venue catalog)' : 'SPIRITS (venue rail — teaching subset)';

    return buildMenuBlock(label, products, footer);

  }



  function findProduct(nameOrId) {

    var PIDs = typeof window !== 'undefined' ? window.RecommendationProductIds : null;

    if (PIDs && typeof PIDs.getProductRef === 'function') {

      var bySpirit = PIDs.getProductRef('spirit', nameOrId);

      if (bySpirit) return bySpirit;

      var byCigar = PIDs.getProductRef('cigar', nameOrId);

      if (byCigar) return byCigar;

      var byFood = PIDs.getProductRef('food', nameOrId);

      if (byFood) return byFood;

    }

    var lp = loungeProducts();

    if (!lp || typeof lp.findProductByName !== 'function') return null;

    return lp.findProductByName(nameOrId);

  }



  function getProductExpertise(name) {

    if (global.MenuFlavorCatalog && global.MenuFlavorCatalog.getExpertiseByName) {

      return global.MenuFlavorCatalog.getExpertiseByName(name);

    }

    return null;

  }



  function nonEmptyLines(parts) {

    return parts.filter(function (p) {

      return p != null && String(p).trim();

    });

  }



  /** Recommendation policy: whyRecommend, bestFor, avoidIf. */

  function getProductRecommendationBrief(name) {

    var p = findProduct(name);

    if (!p) return null;

    var g = p.guidance || {};

    var lines = nonEmptyLines([

      g.whyRecommend ? 'Why recommend: ' + g.whyRecommend : '',

      g.bestFor ? 'Best for: ' + g.bestFor : '',

      g.avoidIf ? 'Avoid if: ' + g.avoidIf : ''

    ]);

    return lines.length ? lines.join('\n') : null;

  }



  /** Teaching copy: construction roles, member blurb, occasion, pairing, body/strength/smoke time. */

  function getProductTeachingBrief(name) {

    var p = findProduct(name);

    if (!p) return null;



    var expertise = getProductExpertise(name);

    if (expertise && expertise.paragraphs && expertise.paragraphs.length) {

      return expertise.paragraphs.join('\n\n');

    }



    var g = p.guidance || {};

    var s = p.spec || {};

    var OP = global.OntologyPolicy;

    var construction =

      OP && typeof OP.constructionBrief === 'function' ? OP.constructionBrief(p) : '';



    var lines = nonEmptyLines([

      g.memberBlurb || '',

      s.body ? 'Body: ' + s.body : '',

      s.strength != null ? 'Strength (1–10): ' + s.strength : '',

      s.smokeTime ? 'Smoke time: ' + s.smokeTime : '',

      construction || [

        g.wrapperRole ? 'Wrapper role: ' + g.wrapperRole : '',

        g.binderRole ? 'Binder role: ' + g.binderRole : '',

        g.fillerRole ? 'Filler role: ' + g.fillerRole : ''

      ].join('\n\n'),

      g.flavorFamily ? 'Flavor family: ' + g.flavorFamily : '',

      g.occasion ? 'Occasion: ' + g.occasion : '',

      g.pairingAffinity ? 'Pairing affinity: ' + g.pairingAffinity : ''

    ]);



    if (!lines.length && p.menuLine) {

      lines.push(p.menuLine);

    }

    return lines.length ? lines.join('\n\n') : null;

  }



  /** Provenance / confidence / tracker metadata. */

  function getProductSourceBrief(name) {

    var p = findProduct(name);

    if (!p) return null;

    var prov = p.provenance || {};

    var tr = p.tracker || {};

    var lines = nonEmptyLines([

      prov.sourceConfidence ? 'Source confidence: ' + prov.sourceConfidence : '',

      prov.dataGrade != null ? 'Data grade: ' + prov.dataGrade + '/10' : '',

      prov.recommendationConfidence

        ? 'Recommendation confidence: ' + prov.recommendationConfidence

        : '',

      prov.beginnerSafe ? 'Beginner safe: ' + prov.beginnerSafe : '',

      tr.sku ? 'SKU: ' + tr.sku : '',

      tr.caRating != null ? 'CA rating: ' + tr.caRating : '',

      tr.caList ? 'CA list: ' + tr.caList : '',

      prov.articleSource ? 'Article: ' + prov.articleSource : '',

      prov.imageUrl ? 'Image: ' + prov.imageUrl : ''

    ]);

    return lines.length ? lines.join('\n') : null;

  }



  function uniqueNames(names) {

    var seen = {};

    var out = [];

    (names || []).forEach(function (n) {

      var key = String(n || '').trim().toLowerCase();

      if (!key || seen[key]) return;

      seen[key] = true;

      out.push(String(n).trim());

    });

    return out;

  }



  function collectNamedProducts(memberText, opts) {

    var o = opts || {};

    if (o.productNames && o.productNames.length) {

      return uniqueNames(o.productNames);

    }

    var names = [];

    var SR = global.SterlonRecommendations;

    if (SR && typeof SR.matchMenuProductInText === 'function') {

      var hit = SR.matchMenuProductInText(memberText || '');

      if (hit && hit.name) names.push(hit.name);

    }

    return uniqueNames(names);

  }



  /** Per-turn SYSTEM_PROMPT injection for named / card products (on-demand teaching). */

  function buildProductTeachingPromptBlock(memberText, opts) {

    var names = collectNamedProducts(memberText, opts);

    if (!names.length) return '';



    var blocks = [];

    for (var i = 0; i < names.length; i += 1) {

      var name = names[i];

      var teaching = getProductTeachingBrief(name);

      var rec = getProductRecommendationBrief(name);

      if (!teaching && !rec) continue;

      var chunk = ['PRODUCT CONTEXT — ' + name];

      if (teaching) chunk.push(teaching);

      if (rec) chunk.push(rec);

      blocks.push(chunk.join('\n'));

    }

    return blocks.length ? '\n\n' + blocks.join('\n\n') : '';

  }



  function buildProductTeachingPromptExtra(memberText, opts) {

    return buildProductTeachingPromptBlock(memberText, opts);

  }



  /** Card names from a recommendation turn — for gateway teaching injection. */

  function productNamesFromCards(cards) {

    var RP = typeof window !== 'undefined' ? window.RecommendationPresentation : null;

    if (RP && typeof RP.productDisplayNamesFromCards === 'function') {

      return uniqueNames(RP.productDisplayNamesFromCards(cards));

    }

    var names = [];

    (cards || []).forEach(function (card) {

      if (card && card.cigar) names.push(card.cigar);

      if (card && card.spirit) names.push(card.spirit);

    });

    return uniqueNames(names);

  }



  /** Catalog facts for one product — only fields from the tracker (no LLM invention). */

  function buildCatalogFactsLine(name) {

    var p = findProduct(name);

    if (!p) return null;

    var g = p.guidance || {};

    var s = p.spec || {};

    var parts = [];

    if (p.menuLine) parts.push('Menu: ' + p.menuLine);

    if (p.stickSize) parts.push('Size: ' + p.stickSize);

    if (s.wrapper) parts.push('Wrapper: ' + s.wrapper);

    if (s.binder) parts.push('Binder: ' + s.binder);

    if (s.filler) parts.push('Filler: ' + s.filler);

    if (s.body) parts.push('Body: ' + s.body);

    if (s.msrp != null) parts.push('MSRP: $' + s.msrp);

    if (g.occasion) parts.push('Occasion: ' + g.occasion);

    if (s.smokeTime) parts.push('Smoke time: ' + s.smokeTime);

    if (g.memberBlurb) parts.push('Blurb: ' + g.memberBlurb);

    if (g.lineNote) parts.push('Note: ' + g.lineNote);

    return parts.length ? parts.join(' | ') : null;

  }

  /** Guest-facing sensory line — no pipe-delimited catalog schema (specs live on cards). */
  function buildConciergeProseFallback(name) {
    var p = findProduct(name);
    if (!p) return null;
    var g = p.guidance || {};
    var candidate = g.memberBlurb || g.lineNote || '';
    if (candidate) {
      var sentence = String(candidate).split(/\.\s+/)[0].trim();
      if (sentence) return sentence.charAt(sentence.length - 1) === '.' ? sentence : sentence + '.';
    }
    var brief = getProductTeachingBrief(name);
    if (brief) {
      var first = String(brief).split(/\n\n+/)[0].trim();
      if (first && !/^(Body|Strength|Smoke time|Wrapper|Menu):/i.test(first) && first.length <= 200) {
        return first.charAt(first.length - 1) === '.' ? first : first + '.';
      }
    }
    return null;
  }



  /** Per-turn authority block — LLM narrates runtime picks only (Law 4). */

  function buildTurnAuthorityBlock(cards) {

    if (!cards || !cards.length) return '';

    var slotLabels = ['BEST PICK', 'REFINED OPTION', 'CONTRAST WILDCARD'];

    var lines = [

      'TURN AUTHORITY — use exactly these products for the corresponding slots. Do not substitute any other product from the menu, even if you think it is a better match:',

      'CATALOG FACTS (hard — prose must match these fields only; do not invent wrapper origin, vitola, factory, or price):'

    ];

    for (var i = 0; i < cards.length; i += 1) {

      var card = cards[i];

      if (!card) continue;

      var parts = [];

      if (card.spirit) parts.push(card.spirit);

      if (card.cigar) parts.push(card.cigar);

      if (!parts.length) continue;

      var label = slotLabels[i] || 'Slot ' + (i + 1);

      var idNote = [];

      if (card.spiritId) idNote.push('spiritId=' + card.spiritId);

      if (card.cigarId) idNote.push('cigarId=' + card.cigarId);

      lines.push('- ' + label + ' products: ' + parts.join(' + '));

      if (idNote.length) lines.push('  ' + label + ' catalog ids (authority): ' + idNote.join(', '));

      if (card.cigar) {

        var facts = buildCatalogFactsLine(card.cigar);

        if (facts) lines.push('  ' + label + ' cigar facts: ' + facts);

        if (i === 2) {
          lines.push(
            '  CONTRAST WILDCARD prose: explain why this stick contrasts BEST PICK using Wrapper/Binder from facts — flavor/texture tension, not a softer body unless the member asked for mild/light.'
          );
        }

      }

      if (card.spirit) {

        var spiritFacts = buildCatalogFactsLine(card.spirit);

        if (spiritFacts) lines.push('  ' + label + ' spirit facts: ' + spiritFacts);

      }

    }

    lines.push(

      'Never call a cigar a puro unless Filler says puro or single country. Never name a factory (Plasencia, STG, etc.) unless it appears in CATALOG FACTS above. Never cite Robusto/Toro unless Size lists that vitola.'

    );

    return lines.length > 2 ? '\n\n' + lines.join('\n') : '';

  }



  function listAllowlistSpiritNames() {

    var lp = loungeProducts();

    if (lp && typeof lp.listAllowlistSpiritNames === 'function') {

      return lp.listAllowlistSpiritNames();

    }

    if (lp && typeof lp.listMenuSpiritNames === 'function') {

      return lp.listMenuSpiritNames();

    }

    return [];

  }



  function listAllowlistCigarNames() {

    var lp = loungeProducts();

    if (lp && typeof lp.listAllowlistCigarNames === 'function') {

      return lp.listAllowlistCigarNames();

    }

    if (lp && typeof lp.listMenuCigarNames === 'function') {

      return lp.listMenuCigarNames();

    }

    return [];

  }



  /** SYSTEM_PROMPT — pairing skills + house examples (SterlonPairingSkills + MenuFlavorCatalog). */

  function buildHousePlaybookBlock() {

    var sps = global.SterlonPairingSkills;

    if (sps && typeof sps.buildSystemPromptBlock === 'function') {

      return sps.buildSystemPromptBlock({ maxSkills: 10 });

    }

    var c = global.MenuFlavorCatalog;

    var pb = c && c.sterlonHousePlaybook;

    var lines = [

      'HOUSE PAIRING PLAYBOOK',

      'Anchor lines below are teaching examples, not mandatory triples — choose cigar and plate from the menu using tag overlap, body match, and the member\'s cues.'

    ];

    if (pb && pb.length) {

      for (var i = 0; i < pb.length; i += 1) {

        var e = pb[i];

        if (!e || !e.line) continue;

        lines.push('- ' + e.line);

        if (e.rationale) lines.push('  Why: ' + e.rationale);

      }

    }

    return lines.join('\n');

  }



  function buildPairingTurnBlock(memberText, opts) {

    var sps = global.SterlonPairingSkills;

    var o = opts || {};

    var block = '';

    if (sps && typeof sps.buildTurnBlock === 'function') {

      if (typeof sps.isPairingIntent !== 'function' || sps.isPairingIntent(memberText, o)) {

        block = sps.buildTurnBlock(memberText, o);

      }

    }

    var SCR = global.SterlonCatalogRetrieval;

    if (SCR && typeof SCR.buildRetrievalPromptBlock === 'function') {

      block += SCR.buildRetrievalPromptBlock(memberText, o);

    }

    return block;

  }



  global.ProductKnowledge = {

    buildCigarsMenuBlock: buildCigarsMenuBlock,

    buildSpiritsMenuBlock: buildSpiritsMenuBlock,

    buildCompactCigarCatalogLines: buildCompactCigarCatalogLines,

    findProduct: findProduct,

    getProductExpertise: getProductExpertise,

    getProductRecommendationBrief: getProductRecommendationBrief,

    getProductTeachingBrief: getProductTeachingBrief,

    getProductSourceBrief: getProductSourceBrief,

    buildProductTeachingPromptBlock: buildProductTeachingPromptBlock,

    getProductTeachingPromptExtra: buildProductTeachingPromptExtra,

    productNamesFromCards: productNamesFromCards,

    buildTurnAuthorityBlock: buildTurnAuthorityBlock,

    buildCatalogFactsLine: buildCatalogFactsLine,
    buildConciergeProseFallback: buildConciergeProseFallback,

    listAllowlistSpiritNames: listAllowlistSpiritNames,

    listAllowlistCigarNames: listAllowlistCigarNames,

    buildHousePlaybookBlock: buildHousePlaybookBlock,

    buildPairingTurnBlock: buildPairingTurnBlock,

    promptRailProducts: promptRailProducts

  };

})(typeof window !== 'undefined' ? window : global);


