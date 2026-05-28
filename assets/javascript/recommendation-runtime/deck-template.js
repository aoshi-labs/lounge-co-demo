/**
 * Runtime deck template adapter.
 *
 * Owns only card shell fields: labels, tiers, and food slots. Product selection
 * belongs to RecommendationGenerate / PairingEngine, not static preset decks.
 */
(function (global) {
  'use strict';

  var SLOT_LABELS = ['BEST PICK', 'REFINED OPTION', 'CONTRAST WILDCARD'];
  var SLOT_TIERS = ['Classic', 'Value', 'Luxury'];
  var DEFAULT_FOOD_ORDER = [
    'Dark Chocolate Flight',
    'Prosciutto & Manchego',
    'Espresso Tiramisu Bites'
  ];

  function foodNameAt(index) {
    var LP = global.LoungeProducts;
    var names =
      LP && typeof LP.listMenuFoodNames === 'function'
        ? LP.listMenuFoodNames()
        : [];
    return names[index] || DEFAULT_FOOD_ORDER[index] || null;
  }

  function getDeckCards(promptText, journeyLevel, deckKey) {
    return SLOT_LABELS.map(function (label, idx) {
      return {
        label: label,
        tier: SLOT_TIERS[idx],
        cigar: null,
        spirit: null,
        food: null,
        why: []
      };
    });
  }

  function getDegradedCatalogCards(journeyLevel) {
    return getDeckCards('', journeyLevel, null);
  }

  var DT = {
    getDeckCards: getDeckCards,
    getDegradedCatalogCards: getDegradedCatalogCards
  };

  global.DeckTemplate = DT;

  var RR = global.RecommendationRuntime;
  if (RR) {
    RR.deckTemplate = DT;
  }
})(typeof window !== 'undefined' ? window : global);
