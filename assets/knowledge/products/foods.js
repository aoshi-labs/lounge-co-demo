/**
 * Embedded food pairings — canonical names and ids (foods have no tracker JSON slice yet).
 */
(function (global) {
  'use strict';

  var FOODS = [
    { id: 'dark-chocolate-flight', name: 'Dark Chocolate Flight', category: 'food', deckKey: 'bourbon', sensory: { body: 4, sweetness: 8, pepper: 1, cocoa: 9, earthiness: 2 } },
    { id: 'prosciutto-manchego', name: 'Prosciutto & Manchego', category: 'food', deckKey: 'bourbon', sensory: { body: 3, sweetness: 2, pepper: 2, cocoa: 1, earthiness: 3 } },
    { id: 'smoked-almonds', name: 'Smoked Almonds', category: 'food', deckKey: 'bourbon', sensory: { body: 3, sweetness: 3, pepper: 3, cocoa: 2, earthiness: 4 } },
    { id: 'marcona-olives', name: 'Marcona Olives', category: 'food', deckKey: 'bourbon', sensory: { body: 2, sweetness: 2, pepper: 4, cocoa: 1, earthiness: 5 } },
    { id: 'prime-filet-sliders', name: 'Prime Filet Sliders', category: 'food', deckKey: 'bourbon', sensory: { body: 7, sweetness: 2, pepper: 3, cocoa: 2, earthiness: 4 } },
    { id: 'citrus-olive-oil-cake', name: 'Citrus-Olive Oil Cake', category: 'food', deckKey: 'bourbon', sensory: { body: 4, sweetness: 7, pepper: 1, cocoa: 2, earthiness: 2 } },
    { id: 'espresso-tiramisu-bites', name: 'Espresso Tiramisu Bites', category: 'food', deckKey: 'bourbon', sensory: { body: 5, sweetness: 7, pepper: 2, cocoa: 8, earthiness: 3 } }
  ];

  global.LoungeProducts = global.LoungeProducts || {};
  global.LoungeProducts.foods = FOODS;
})(typeof window !== 'undefined' ? window : global);
