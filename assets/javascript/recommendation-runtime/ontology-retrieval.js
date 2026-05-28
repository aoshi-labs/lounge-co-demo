/**
 * OntologyRetrieval — catalog retrieval scoring and card why bullets.
 */
(function (global) {
  'use strict';

  var C = global.OntologyPolicyCore;
  var CC = global.OntologyCigarContext;
  var SC = global.OntologySpiritContext;
  if (!C || !CC || !SC) return;

  function whyFromProduct(product) {
    var why = C.guidanceOf(product).whyRecommend;
    if (!why || !String(why).trim()) return '';
    var line = String(why).trim();
    if (line.length > 220) line = line.slice(0, 217) + '…';
    return line;
  }

  function buildCardWhy(cigarName, spiritName, foodName, deckWhy, pairingMeta) {
    var meta = pairingMeta || {};
    var CEP = global.CoffeeEspressoProse;
    if (
      CEP &&
      typeof CEP.buildSlotWhyLines === 'function' &&
      meta.recoCtx &&
      CEP.isActive(meta.recoCtx)
    ) {
      var coffeeLines = CEP.buildSlotWhyLines({
        slotRole: meta.slotRole,
        cigarName: cigarName,
        spiritName: spiritName,
        recoCtx: meta.recoCtx
      });
      if (coffeeLines.length) {
        var SR0 = global.SterlonRecommendations;
        if (SR0 && SR0.normalizeWhyBullets) {
          return SR0.normalizeWhyBullets(coffeeLines, deckWhy || []);
        }
        return coffeeLines.slice(0, 3);
      }
    }

    var lines = [];
    var CP = global.ContrastPairing;
    if (CP && cigarName && spiritName) {
      var contrastLn = CP.buildContrastWhyLine(
        cigarName,
        spiritName,
        pairingMeta && pairingMeta.analysis
      );
      if (contrastLn) lines.push(contrastLn);
    }
    var cigar = C.findProduct(cigarName, 'cigar');
    if (cigar) {
      var curated = whyFromProduct(cigar);
      if (curated) lines.push(curated);
    }
    var RR = global.RecommendationRuntime;
    if (lines.length < 2 && RR && cigarName && spiritName) {
      var atoms = RR.buildRationaleAtoms(cigarName, spiritName, foodName);
      var sensory = RR.renderWhyBullets(atoms, deckWhy || [], { skipOntology: true });
      sensory.forEach(function (ln) {
        if (lines.indexOf(ln) === -1) lines.push(ln);
      });
    }
    var SR = global.SterlonRecommendations;
    if (SR && SR.normalizeWhyBullets) return SR.normalizeWhyBullets(lines, deckWhy || []);
    return lines.slice(0, 3);
  }

  function constructionBrief(product) {
    if (!product) return '';
    var g = C.guidanceOf(product);
    return [g.wrapperRole, g.binderRole, g.fillerRole]
      .filter(function (x) {
        return x && String(x).trim();
      })
      .join(' ');
  }

  function retrievalBlob(product) {
    var g = C.guidanceOf(product);
    var s = product.spec || {};
    var p = C.provenanceOf(product);
    return [
      product.name,
      g.flavorFamily,
      g.pairingAffinity,
      g.occasion,
      g.bestFor,
      g.avoidIf,
      g.memberBlurb,
      g.whyRecommend,
      s.body,
      s.style,
      s.smokeTime,
      p.beginnerSafe,
      (product.tags || [])
        .map(function (t) {
          return t.id;
        })
        .join(' ')
    ]
      .map(C.normalizeText)
      .join(' ');
  }

  function scoreRetrieval(product, query, ctx) {
    var q = C.normalizeText(query);
    if (!q || !product) return 0;
    var score = 0;
    var blob = retrievalBlob(product);
    var name = C.normalizeText(product.name);
    if (name.indexOf(q) !== -1 || q.indexOf(name) !== -1) score += 4;
    q.split(/\s+/).forEach(function (token) {
      if (token.length < 3) return;
      if (blob.indexOf(token) !== -1) score += 1.2;
    });
    if (product.category === 'cigar') {
      score += CC.cigarContextScore(product.name, ctx || C.buildRecoContext({})) * 2;
    } else if (product.category === 'spirit') {
      score += SC.spiritContextScore(product, ctx || C.buildRecoContext({}), null) * 2;
    }
    (product.tags || []).forEach(function (t) {
      if (q.indexOf(String(t.id).replace(/_/g, ' ')) !== -1) score += 2;
    });
    return score;
  }

  global.OntologyRetrieval = {
    buildCardWhy: buildCardWhy,
    constructionBrief: constructionBrief,
    retrievalBlob: retrievalBlob,
    scoreRetrieval: scoreRetrieval
  };
})(typeof window !== 'undefined' ? window : global);
