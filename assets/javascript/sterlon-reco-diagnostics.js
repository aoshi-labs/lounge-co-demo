/**

 * SterlonRecoDiagnostics — recommendation diversity counters (dev / telemetry).

 */

(function (global) {

  'use strict';



  var state = {

    turns: 0,

    spirits: Object.create(null),

    cigars: Object.create(null),

    signals: Object.create(null),

    deckKeys: Object.create(null)

  };



  function recordTurn(turn) {

    if (!turn || !turn.cards) return;

    state.turns += 1;

    var prov = turn.provenance || {};

    (prov.signals || []).forEach(function (sig) {

      state.signals[sig] = (state.signals[sig] || 0) + 1;

    });

    if (prov.deckKey) {

      state.deckKeys[prov.deckKey] = (state.deckKeys[prov.deckKey] || 0) + 1;

    }

    turn.cards.forEach(function (card) {

      if (card.spirit) state.spirits[card.spirit] = (state.spirits[card.spirit] || 0) + 1;

      if (card.cigar) state.cigars[card.cigar] = (state.cigars[card.cigar] || 0) + 1;

    });

    var ST = global.SterlonTelemetry;

    if (ST && typeof ST.emit === 'function') {

      ST.emit('reco_diversity_snapshot', snapshot());

    }

  }



  function topKeys(map, n) {

    return Object.keys(map)

      .sort(function (a, b) {

        return map[b] - map[a];

      })

      .slice(0, n || 5)

      .map(function (k) {

        return { name: k, count: map[k] };

      });

  }



  function totalCounts(map) {

    var t = 0;

    Object.keys(map).forEach(function (k) {

      t += map[k];

    });

    return t;

  }



  function dominancePct(map, total, isHero) {

    if (!total || !isHero) return 0;

    var hero = 0;

    Object.keys(map).forEach(function (k) {

      if (isHero(k)) hero += map[k];

    });

    return Math.round((hero / total) * 1000) / 10;

  }



  function snapshot() {

    var spiritTotal = totalCounts(state.spirits);

    var cigarTotal = totalCounts(state.cigars);

    var D = global.RecommendationDiversity;

    var heroSpirit = D && D.isHeroSpirit ? D.isHeroSpirit : function () { return false; };

    var heroCigar = D && D.isHeroCigar ? D.isHeroCigar : function () { return false; };

    return {

      turns: state.turns,

      uniqueSpirits: Object.keys(state.spirits).length,

      uniqueCigars: Object.keys(state.cigars).length,

      topSpirits: topKeys(state.spirits, 6),

      topCigars: topKeys(state.cigars, 6),

      signals: state.signals,

      deckKeys: state.deckKeys

    };

  }



  function diversitySnapshot() {
    var snap = snapshot();
    var spiritTotal = totalCounts(state.spirits);
    var cigarTotal = totalCounts(state.cigars);
    var E = global.RecommendationEntropy;
    var entropyMetrics = E && typeof E.computeMetrics === 'function' ? E.computeMetrics() : {};
    return Object.assign(
      {
        turns: snap.turns,
        uniqueSpirits: snap.uniqueSpirits,
        uniqueCigars: snap.uniqueCigars,
        topSpirits: snap.topSpirits,
        topCigars: snap.topCigars,
        signals: snap.signals,
        deckKeys: snap.deckKeys,
        spiritSlotTotal: spiritTotal,
        cigarSlotTotal: cigarTotal
      },
      entropyMetrics
    );
  }

  function demoGravitySnapshot() {

    var snap = snapshot();

    var spiritTotal = totalCounts(state.spirits);

    var cigarTotal = totalCounts(state.cigars);

    var D = global.RecommendationDiversity;

    var heroSpirit = D && D.isHeroSpirit ? D.isHeroSpirit : function () { return false; };

    var heroCigar = D && D.isHeroCigar ? D.isHeroCigar : function () { return false; };

    var bourbonDeck = state.deckKeys.bourbon || 0;

    var deckTotal = totalCounts(state.deckKeys);

    var topSpirit = snap.topSpirits[0];

    var topCigar = snap.topCigars[0];

    return {

      turns: snap.turns,

      heroSpiritDominancePct: dominancePct(state.spirits, spiritTotal, heroSpirit),

      heroCigarDominancePct: dominancePct(state.cigars, cigarTotal, heroCigar),

      bourbonDeckTurnPct: deckTotal ? Math.round((bourbonDeck / deckTotal) * 1000) / 10 : 0,

      topSpiritSharePct:

        topSpirit && spiritTotal

          ? Math.round((topSpirit.count / spiritTotal) * 1000) / 10

          : 0,

      topCigarSharePct:

        topCigar && cigarTotal ? Math.round((topCigar.count / cigarTotal) * 1000) / 10 : 0,

      uniqueSpirits: snap.uniqueSpirits,

      uniqueCigars: snap.uniqueCigars,

      openPairingSignals: (state.signals['open-pairing'] || 0) + (state.signals['open-ranked'] || 0),

      topSpirits: snap.topSpirits,

      topCigars: snap.topCigars,

      signals: snap.signals

    };

  }



  function reset() {

    state.turns = 0;

    state.spirits = Object.create(null);

    state.cigars = Object.create(null);

    state.signals = Object.create(null);

    state.deckKeys = Object.create(null);

  }



  global.SterlonRecoDiagnostics = {

    recordTurn: recordTurn,

    snapshot: snapshot,

    diversitySnapshot: diversitySnapshot,

    demoGravitySnapshot: demoGravitySnapshot,

    reset: reset

  };

})(typeof window !== 'undefined' ? window : global);

