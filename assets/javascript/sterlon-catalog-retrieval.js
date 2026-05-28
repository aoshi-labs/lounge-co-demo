/**
 * SterlonCatalogRetrieval — lightweight ontology search for vague member asks.
 * Pure: no DOM, no session, no LLM.
 */
(function (global) {
  'use strict';

  function lp() {
    return global.LoungeProducts || null;
  }

  function normalize(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[_-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tagIds(product) {
    return (product.tags || []).map(function (t) {
      return t.id;
    });
  }

  function scoreProduct(product, query, ctx) {
    var OP = global.OntologyPolicy;
    if (OP && typeof OP.scoreRetrieval === 'function') {
      return OP.scoreRetrieval(product, query, ctx);
    }
    var q = normalize(query);
    if (!q || !product) return 0;
    var score = 0;
    var name = normalize(product.name);
    var style = normalize((product.spec && product.spec.style) || '');
    var body = normalize((product.spec && product.spec.body) || '');
    var g = product.guidance || {};
    var blob =
      name +
      ' ' +
      style +
      ' ' +
      body +
      ' ' +
      normalize(g.flavorFamily) +
      ' ' +
      normalize(g.pairingAffinity) +
      ' ' +
      normalize(g.bestFor) +
      ' ' +
      normalize(g.avoidIf) +
      ' ' +
      normalize(g.occasion) +
      ' ' +
      normalize(g.memberBlurb) +
      ' ' +
      tagIds(product).join(' ');

    if (name.indexOf(q) !== -1 || q.indexOf(name) !== -1) score += 4;
    q.split(/\s+/).forEach(function (token) {
      if (token.length < 3) return;
      if (blob.indexOf(token) !== -1) score += 1;
    });
    tagIds(product).forEach(function (tid) {
      if (q.indexOf(tid.replace(/_/g, ' ')) !== -1) score += 2;
    });
    return score;
  }

  function searchCatalog(query, opts) {
    var o = opts || {};
    var lounge = lp();
    if (!lounge) return [];
    var OP = global.OntologyPolicy;
    var ctx =
      OP && typeof OP.buildRecoContext === 'function'
        ? OP.buildRecoContext({
            promptText: query,
            journeyLevel: o.journeyLevel,
            sessionRuntime: o.sessionRuntime
          })
        : null;
    var category = o.category || 'any';
    var lists = [];
    if (category === 'spirit' || category === 'any') lists.push(lounge.spirits || []);
    if (category === 'cigar' || category === 'any') lists.push(lounge.cigars || []);
    var merged = [];
    lists.forEach(function (list) {
      merged = merged.concat(list);
    });
    var max = o.limit != null ? o.limit : 8;
    return merged
      .map(function (p) {
        return { product: p, score: scoreProduct(p, query, ctx) };
      })
      .filter(function (row) {
        return row.score > 0;
      })
      .sort(function (a, b) {
        return b.score - a.score;
      })
      .slice(0, max)
      .map(function (row) {
        return row.product;
      });
  }

  function buildRetrievalPromptBlock(memberText, opts) {
    var hits = searchCatalog(memberText, opts);
    if (!hits.length) return '';
    var lines = ['CATALOG RETRIEVAL (ontology matches for this turn — not mandatory picks):'];
    hits.forEach(function (p) {
      var parts = [p.name];
      if (p.spec && p.spec.body) parts.push('body ' + p.spec.body);
      if (p.spec && p.spec.msrp != null) parts.push('$' + p.spec.msrp);
      if (p.deckKey) parts.push(p.deckKey);
      var g = p.guidance || {};
      if (g.pairingAffinity) parts.push('pairs ' + g.pairingAffinity);
      if (g.occasion) parts.push(g.occasion);
      if (g.bestFor) {
        var bf = String(g.bestFor);
        parts.push(bf.length > 72 ? bf.slice(0, 69) + '…' : bf);
      }
      lines.push('- ' + parts.join(' · '));
    });
    return '\n\n' + lines.join('\n');
  }

  global.SterlonCatalogRetrieval = {
    searchCatalog: searchCatalog,
    buildRetrievalPromptBlock: buildRetrievalPromptBlock
  };
})(typeof window !== 'undefined' ? window : global);
