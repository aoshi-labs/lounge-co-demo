/**
 * CatalogClient — hydrate LoungeProducts from embedded seed modules + tracker JSON slices.
 * Visionboard: fetch *.reco.json + *.briefs.json at boot (requires HTTP server).
 * Node fixtures: LoungeCatalog.hydrateFromData() with parsed JSON.
 *
 * Phase 2: swap fetch URLs for venue catalog + product brief API.
 */
(function (global) {
  'use strict';

  var BRIEF_KEYS = ['menuLine', 'stickSize', 'guidance', 'provenance', 'parentCompany'];

  var state = {
    ready: false,
    readyPromise: null,
    embeddedSeed: null,
    cigars: [],
    spirits: [],
    foods: [],
    byId: null,
    byName: null
  };

  function normalizeProductName(name) {
    return String(name || '')
      .trim()
      .replace(/\s+/g, ' ');
  }

  function productsFromSlice(doc) {
    if (!doc) return [];
    if (Array.isArray(doc)) return doc;
    if (Array.isArray(doc.products)) return doc.products;
    return [];
  }

  function briefMapFromSlice(doc) {
    var map = Object.create(null);
    productsFromSlice(doc).forEach(function (brief) {
      if (brief && brief.id) map[brief.id] = brief;
    });
    return map;
  }

  function materialize(reco, brief) {
    if (!reco) return null;
    var out = {};
    var key;
    for (key in reco) {
      if (Object.prototype.hasOwnProperty.call(reco, key)) out[key] = reco[key];
    }
    if (brief) {
      for (var i = 0; i < BRIEF_KEYS.length; i += 1) {
        key = BRIEF_KEYS[i];
        if (brief[key] !== undefined && brief[key] !== null) out[key] = brief[key];
      }
    }
    return out;
  }

  function materializeTrackerList(recoDoc, briefsDoc) {
    var briefs = briefMapFromSlice(briefsDoc);
    return productsFromSlice(recoDoc)
      .map(function (reco) {
        return materialize(reco, briefs[reco.id]);
      })
      .filter(Boolean);
  }

  var STRENGTH_LABEL_MAP = {
    1: 'Mild',
    2: 'Medium-Light',
    3: 'Medium',
    4: 'Medium-Full',
    5: 'Full'
  };

  var STRENGTH_LABEL_REVERSE = {
    Mild: 1,
    'Medium-Light': 2,
    Medium: 3,
    'Medium-Full': 4,
    Full: 5
  };

  /**
   * Normalizes mixed configuration data scales into strict string tokens.
   * Enforces schema uniformity before data reaches the PairingEngine.
   */
  function normalizeCigarSensorySchema(rawCigar) {
    var raw = rawCigar || {};
    var strengthMapping = STRENGTH_LABEL_MAP;
    var bodyMapping = STRENGTH_LABEL_MAP;
    var out = {};
    var key;
    for (key in raw) {
      if (Object.prototype.hasOwnProperty.call(raw, key)) out[key] = raw[key];
    }
    out.body =
      typeof raw.body === 'number' ? bodyMapping[raw.body] || 'Medium' : raw.body;
    out.strength =
      typeof raw.strength === 'number'
        ? strengthMapping[raw.strength] || 'Medium'
        : raw.strength;
    out.brand = raw.brand ? String(raw.brand).trim() : 'Unknown';
    out.parent_company = raw.parent_company
      ? String(raw.parent_company).trim()
      : out.brand;
    return out;
  }

  function normalizeCigarProduct(cigar) {
    if (!cigar || cigar.category !== 'cigar') return cigar;

    var spec = cigar.spec || {};
    var flat = {
      body: spec.body != null ? spec.body : cigar.body,
      strength: spec.strength != null ? spec.strength : cigar.strength,
      brand: cigar.brand,
      parent_company: cigar.parent_company || cigar.parentCompany
    };
    var inputStrengthType = typeof flat.strength;
    var norm = normalizeCigarSensorySchema(flat);

    var out = {};
    for (var key in cigar) {
      if (Object.prototype.hasOwnProperty.call(cigar, key)) out[key] = cigar[key];
    }
    out.spec = {};
    for (var specKey in spec) {
      if (Object.prototype.hasOwnProperty.call(spec, specKey)) out.spec[specKey] = spec[specKey];
    }

    out.spec.body = norm.body;

    if (inputStrengthType === 'number') {
      out.spec.strength = flat.strength;
      if (flat.strength >= 1 && flat.strength <= 5) {
        out.spec.strengthLabel = STRENGTH_LABEL_MAP[flat.strength] || 'Medium';
      } else if (out.spec.strengthLabel) {
        delete out.spec.strengthLabel;
      }
    } else if (typeof norm.strength === 'string') {
      out.spec.strength =
        STRENGTH_LABEL_REVERSE[norm.strength] != null
          ? STRENGTH_LABEL_REVERSE[norm.strength]
          : 4;
      out.spec.strengthLabel = norm.strength;
    }

    if (norm.brand) out.brand = norm.brand;
    if (norm.parent_company) out.parentCompany = norm.parent_company;
    delete out.parent_company;

    return out;
  }

  function buildIndexes(cigars, spirits) {
    state.cigars = cigars;
    state.spirits = spirits;
    state.byId = new Map();
    state.byName = new Map();
    cigars
      .concat(spirits, state.foods || [])
      .forEach(function (product) {
        if (!product || !product.id) return;
        state.byId.set(product.id, product);
        var nameKey = normalizeProductName(product.name).toLowerCase();
        if (nameKey) state.byName.set(nameKey, product);
      });
  }

  function embeddedSeedRoot() {
    if (state.embeddedSeed) return state.embeddedSeed;
    var root = global.LoungeProducts || {};
    return {
      cigars: root.cigars || [],
      spirits: root.spirits || [],
      foods: root.foods || []
    };
  }

  function setEmbeddedSeed(seed) {
    state.embeddedSeed = seed || { cigars: [], spirits: [], foods: [] };
    state.foods = state.embeddedSeed.foods || [];
  }

  function notifyCatalogHydrated() {
    var MFC = global.MenuFlavorCatalog;
    if (MFC && typeof MFC.refreshProducts === 'function') {
      MFC.refreshProducts();
    }
    var SFM = global.SterlonFlavorMatch;
    if (SFM && typeof SFM.invalidateProductIndex === 'function') {
      SFM.invalidateProductIndex();
    }
    var ST = global.SterlonTelemetry;
    if (ST && typeof ST.emit === 'function') {
      ST.emit('catalog_menu_ready', {
        spirits: state.spirits.length,
        cigars: state.cigars.length
      });
    }
  }

  function hydrateFromData(data) {
    var seed = embeddedSeedRoot();
    var seedCigars = (seed.cigars || []).map(normalizeCigarProduct);
    var seedSpirits = seed.spirits || [];
    state.foods = seed.foods || [];

    var trackerCigars = materializeTrackerList(data.cigarsReco, data.cigarsBriefs).map(
      normalizeCigarProduct
    );
    var trackerSpirits = materializeTrackerList(data.spiritsReco, data.spiritsBriefs);

    buildIndexes(seedCigars.concat(trackerCigars), seedSpirits.concat(trackerSpirits));
    state.ready = true;
    notifyCatalogHydrated();
  }

  function fetchJson(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error('Catalog fetch failed: ' + url + ' (' + res.status + ')');
      return res.json();
    });
  }

  function mergeShardProducts(shards) {
    var products = [];
    (shards || []).forEach(function (shard) {
      productsFromSlice(shard).forEach(function (p) {
        products.push(p);
      });
    });
    return products;
  }

  /** Load manifest + reco/brief shards for one category (cigars | spirits). */
  function loadCategoryCatalog(catalogBase, category) {
    var catBase = catalogBase + category + '/';
    return fetchJson(catBase + 'manifest.json').then(function (manifest) {
      var recoPaths = manifest.recoShards || [];
      var briefPaths = manifest.briefShards || [];
      return Promise.all([
        Promise.all(recoPaths.map(function (rel) {
          return fetchJson(catBase + rel);
        })),
        Promise.all(briefPaths.map(function (rel) {
          return fetchJson(catBase + rel);
        }))
      ]).then(function (parts) {
        return {
          reco: { version: 1, category: category, slice: 'reco', products: mergeShardProducts(parts[0]) },
          briefs: { version: 1, category: category, slice: 'briefs', products: mergeShardProducts(parts[1]) }
        };
      });
    });
  }

  function init(opts) {
    if (state.ready) {
      return Promise.resolve();
    }
    if (state.readyPromise) {
      return state.readyPromise;
    }

    var o = opts || {};
    var catalogBase = o.catalogBase || o.basePath || 'assets/knowledge/';
    if (catalogBase.charAt(catalogBase.length - 1) !== '/') catalogBase += '/';

    state.readyPromise = Promise.all([
      loadCategoryCatalog(catalogBase, 'cigars'),
      loadCategoryCatalog(catalogBase, 'spirits')
    ])
      .then(function (cats) {
        hydrateFromData({
          cigarsReco: cats[0].reco,
          cigarsBriefs: cats[0].briefs,
          spiritsReco: cats[1].reco,
          spiritsBriefs: cats[1].briefs
        });
      })
      .catch(function (err) {
        state.readyPromise = null;
        throw err;
      });

    return state.readyPromise;
  }

  function ready() {
    if (state.ready) return Promise.resolve();
    if (state.readyPromise) return state.readyPromise;
    return Promise.reject(new Error('LoungeCatalog.init() has not been called'));
  }

  function isReady() {
    return state.ready;
  }

  function findInList(list, name) {
    var key = normalizeProductName(name).toLowerCase();
    if (!key) return null;
    for (var i = 0; i < list.length; i += 1) {
      if (normalizeProductName(list[i].name).toLowerCase() === key) return list[i];
    }
    return null;
  }

  function findByName(category, name) {
    if (state.ready && state.byName) {
      var key = normalizeProductName(name).toLowerCase();
      if (!key) return null;
      var product = state.byName.get(key);
      if (!product || product.category !== category) return null;
      return product;
    }
    var seed = embeddedSeedRoot();
    var list =
      category === 'cigar'
        ? seed.cigars
        : category === 'spirit'
          ? seed.spirits
          : seed.foods;
    var hit = findInList(list || [], name);
    return hit && hit.category === category ? hit : null;
  }

  function findById(id) {
    if (!id) return null;
    if (state.ready && state.byId) {
      return state.byId.get(id) || null;
    }
    var seed = embeddedSeedRoot();
    var lists = (seed.cigars || []).concat(seed.spirits || [], seed.foods || []);
    for (var i = 0; i < lists.length; i += 1) {
      if (lists[i].id === id) return lists[i];
    }
    return null;
  }

  function getCigars() {
    return state.ready ? state.cigars.slice() : [];
  }

  function getSpirits() {
    return state.ready ? state.spirits.slice() : [];
  }

  function getFoods() {
    return state.foods.slice();
  }

  global.LoungeCatalog = {
    init: init,
    ready: ready,
    isReady: isReady,
    setEmbeddedSeed: setEmbeddedSeed,
    hydrateFromData: hydrateFromData,
    normalizeProductName: normalizeProductName,
    normalizeCigarSensorySchema: normalizeCigarSensorySchema,
    normalizeCigarProduct: normalizeCigarProduct,
    materialize: materialize,
    getCigars: getCigars,
    getSpirits: getSpirits,
    getFoods: getFoods,
    getCigarById: function (id) {
      var p = findById(id);
      return p && p.category === 'cigar' ? p : null;
    },
    getSpiritById: function (id) {
      var p = findById(id);
      return p && p.category === 'spirit' ? p : null;
    },
    getFoodById: function (id) {
      var p = findById(id);
      return p && p.category === 'food' ? p : null;
    },
    findCigarByName: function (name) {
      return findByName('cigar', name);
    },
    findSpiritByName: function (name) {
      return findByName('spirit', name);
    },
    findFoodByName: function (name) {
      return findByName('food', name);
    },
    findProductByName: function (name) {
      return (
        findByName('spirit', name) ||
        findByName('cigar', name) ||
        findByName('food', name)
      );
    },
    resolveProduct: function (id) {
      return findById(id);
    },
    getCatalogProducts: function () {
      return getSpirits().concat(getCigars());
    },
    listMenuCigarNames: function () {
      return getCigars().map(function (p) {
        return p.name;
      });
    },
    listMenuSpiritNames: function () {
      return getSpirits().map(function (p) {
        return p.name;
      });
    },
    listMenuFoodNames: function () {
      return getFoods().map(function (p) {
        return p.name;
      });
    },
    listAllowlistSpiritNames: function () {
      return this.listMenuSpiritNames();
    },
    listAllowlistCigarNames: function () {
      return this.listMenuCigarNames();
    }
  };
})(typeof window !== 'undefined' ? window : global);
