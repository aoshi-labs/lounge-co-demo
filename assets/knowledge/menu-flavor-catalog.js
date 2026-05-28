/**
 * Sterlon flavor catalog surface over LoungeProducts ontology.
 * Product truth (names, tags, spec, expertise) lives in assets/knowledge/products/.
 */
(function (global) {
  'use strict';

  function buildMenuLine(product) {
    if (!product || !product.menuLine) return '';
    return '- ' + product.menuLine;
  }

  function catalogProducts() {
    var lp = global.LoungeProducts;
    if (lp && typeof lp.getCatalogProducts === 'function') {
      return lp.getCatalogProducts();
    }
    return [];
  }

  function getExpertiseByName(name) {
    var products = catalogProducts();
    var p = products.find(function (x) {
      return x.name === name;
    });
    return p && p.expertise ? p.expertise : null;
  }

  function getProductByName(name) {
    var lp = global.LoungeProducts;
    if (lp && typeof lp.findProductByName === 'function') {
      var hit = lp.findProductByName(name);
      if (hit) return hit;
    }
    var products = catalogProducts();
    return (
      products.find(function (x) {
        return x.name === name;
      }) || null
    );
  }

  var sterlonHousePlaybook = [
    {
      line: 'Match body first',
      rationale: 'Keep cigar body and spirit weight close enough that neither side flattens the other.'
    },
    {
      line: 'Bridge one flavor family',
      rationale: 'Use one clear bridge such as cocoa, oak, spice, fruit, cream, smoke, or earth.'
    },
    {
      line: 'Add controlled contrast',
      rationale: 'Use the plate or pour to add lift: salt against sweetness, citrus against richness, or cream against pepper.'
    }
  ];

  function getProducts() {
    return catalogProducts();
  }

  function refreshProducts() {
    /* no-op: getProducts() reads live LoungeProducts each call */
  }

  global.MenuFlavorCatalog = {
    version: 3,
    buildMenuLine: buildMenuLine,
    getExpertiseByName: getExpertiseByName,
    getProductByName: getProductByName,
    getProducts: getProducts,
    refreshProducts: refreshProducts,
    sterlonHousePlaybook: sterlonHousePlaybook,
    get products() {
      return getProducts();
    }
  };
})(typeof window !== 'undefined' ? window : global);
