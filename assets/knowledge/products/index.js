/**
 * Lounge product ontology barrel — lookup helpers and menu allowlist names.
 * Tracker rows hydrate via LoungeCatalog (catalog-client.js).
 * Ontology must not import recommendation or chat modules.
 */
(function (global) {
  'use strict';

  var prior = global.LoungeProducts || {};
  if (global.LoungeCatalog && typeof global.LoungeCatalog.setEmbeddedSeed === 'function') {
    global.LoungeCatalog.setEmbeddedSeed({
      cigars: prior.cigars || [],
      spirits: prior.spirits || [],
      foods: prior.foods || []
    });
  }

  function catalog() {
    return global.LoungeCatalog || null;
  }

  function normalizeProductName(name) {
    var LC = catalog();
    if (LC && typeof LC.normalizeProductName === 'function') {
      return LC.normalizeProductName(name);
    }
    return String(name || '')
      .trim()
      .replace(/\s+/g, ' ');
  }

  function delegate(method, args) {
    var LC = catalog();
    if (!LC || typeof LC[method] !== 'function') return null;
    return LC[method].apply(LC, args);
  }

  function embeddedList(category) {
    return prior[category] || [];
  }

  function listNames(category, listFn) {
    var LC = catalog();
    if (LC && LC.isReady && LC.isReady()) {
      return delegate(listFn, []);
    }
    return embeddedList(category).map(function (p) {
      return p.name;
    });
  }

  global.LoungeProducts = {
    version: 1,
    normalizeProductName: normalizeProductName,
    get cigars() {
      var LC = catalog();
      return LC && LC.isReady && LC.isReady() ? LC.getCigars() : embeddedList('cigars').slice();
    },
    get spirits() {
      var LC = catalog();
      return LC && LC.isReady && LC.isReady() ? LC.getSpirits() : embeddedList('spirits').slice();
    },
    get foods() {
      var LC = catalog();
      return LC && LC.isReady && LC.isReady() ? LC.getFoods() : embeddedList('foods').slice();
    },
    getCigarById: function (id) {
      return delegate('getCigarById', [id]);
    },
    getSpiritById: function (id) {
      return delegate('getSpiritById', [id]);
    },
    getFoodById: function (id) {
      return delegate('getFoodById', [id]);
    },
    findCigarByName: function (name) {
      return delegate('findCigarByName', [name]);
    },
    findSpiritByName: function (name) {
      return delegate('findSpiritByName', [name]);
    },
    findFoodByName: function (name) {
      return delegate('findFoodByName', [name]);
    },
    findProductByName: function (name) {
      return delegate('findProductByName', [name]);
    },
    resolveProduct: function (id) {
      return delegate('resolveProduct', [id]);
    },
    getCatalogProducts: function () {
      var LC = catalog();
      if (LC && LC.isReady && LC.isReady()) {
        return delegate('getCatalogProducts', []);
      }
      return embeddedList('spirits').concat(embeddedList('cigars'));
    },
    listMenuCigarNames: function () {
      return listNames('cigars', 'listMenuCigarNames');
    },
    listMenuSpiritNames: function () {
      return listNames('spirits', 'listMenuSpiritNames');
    },
    listMenuFoodNames: function () {
      return listNames('foods', 'listMenuFoodNames');
    },
    listAllowlistSpiritNames: function () {
      return listNames('spirits', 'listAllowlistSpiritNames');
    },
    listAllowlistCigarNames: function () {
      return listNames('cigars', 'listAllowlistCigarNames');
    }
  };
})(typeof window !== 'undefined' ? window : global);
