# Sterlon product ontology (visionboard mock)

**Status:** Canonical lounge catalog — tracker JSON slices + curated products; no separate demo rail.

## What owns what

| Layer | Owns | Does not own |
|-------|------|----------------|
| **`products/`** (this folder) | Stable `id`, display `name`, `category`, flavor `tags`, `spec`, `sensory` placeholders, spirit `expertise` / `presentation` metadata | Recommendation slots (`best` / `safe` / `wildcard`), labels, validation policy, deck `why` bullets, wildcard descriptors, LLM prose |
| **`catalog-client.js`** | Fetch/hydrate tracker JSON slices; Map-backed lookup; merge reco + brief at query time | Recommendation authority, slot assignment, LLM prose |
| **`menu-flavor-catalog.js`** | Flavor-catalog facade and `sterlonHousePlaybook` | Duplicating product rows (reads `LoungeProducts.getCatalogProducts()`) |
| **`deck-template.js`** | Card labels, tiers, and food slots only | Cigar or spirit product selection |
| **`refinement-pivots.js`** | Taste-adjacent refinement table for house pairings | Refinement turn assembly (`resolve-refinement.js`) |
| **`sterlon-recommendations.js`** | Verify, normalize, validate, menu match | Flight orchestration (RR-E3) |
| **`sterlon-chat.js`** | Narrative, streaming, DOM | SKU authority |

## Load order (load-bearing)

Full Sterlon knowledge + recommendation stack (matches [sterlon.html](../../sterlon.html)):

```html
<script src="assets/knowledge/products/cigars.js"></script>
<script src="assets/knowledge/products/spirits.js"></script>
<script src="assets/knowledge/products/foods.js"></script>
<script src="assets/knowledge/products/catalog-client.js"></script>
<script src="assets/knowledge/products/index.js"></script>
<!-- sterlon.html boot: LoungeCatalog.init() on DOMContentLoaded (requires HTTP server) -->
```

Embedded seed modules (`cigars.js`, `spirits.js`) are empty shells — pre-hydration fallback only. **`*.reco.json` + `*.briefs.json`** are the canonical catalog. Foods remain in `foods.js` until a tracker slice exists.

Use [tools/load-sterlon-stack.mjs](../../tools/load-sterlon-stack.mjs) in Node so VM fixtures match the browser.

**Dev server:** `fetch` requires HTTP. From `docs/visionboard`: `node scripts/serve.mjs` → http://localhost:7654

### Tracker → ontology import (cigars)

| File | Role |
|------|------|
| `../cigar_tracker_pipeline.py` | Merge CSV/TSV + row JSON + corrections; validate; build rich product objects |
| `../cigar_catalog_cli.py build` | Writes `../cigars/{sources,reco,briefs,manifest.json,canonical.json}` |
| `../cigars/manifest.json` | Shard index for browser + Node fixtures |
| `../cigars/reco/*.json` | **Generated** reco-hot shards |
| `../cigars/briefs/*.json` | **Generated** teaching shards |

See [`../cigars/README.md`](../cigars/README.md).

```bash
cd docs/visionboard/assets/knowledge
python build-tracker-to-ontology.py
```

### Tracker → ontology import (spirits)

| File | Role |
|------|------|
| `../export-spirit-tracker-from-sheet.py` | Sync Spirits tab CSV → `spirit-research-tracker-all-rows-*.json` + allowlist (excludes sheet `SPI-CUR-*` rows merged separately) |
| `../curated-spirit-products.json` | Manufacturer-verified curated spirits (Pappy 23, Blanton's) merged into reco |
| `../tracker-sterlon-spirits-all.json` | Tracker SKU allowlist (~90 spirits) |
| `../build-tracker-spirits-to-ontology.py` | Builds `../spirits/{reco,briefs,manifest.json}` |

See [`../spirits/README.md`](../spirits/README.md).

```bash
cd docs/visionboard/assets/knowledge
python export-spirit-tracker-from-sheet.py   # optional sheet refresh
python build-tracker-spirits-to-ontology.py
cd ../.. && node tools/pairing-eval-runner.mjs --gate
cd ../.. && node tools/sterlon-reco-freeze/run.mjs
npm run audit:pilot-residue
```

Post-build ontology fields (`deckKey`, `journeyRank`) are set in `build-tracker-spirits-to-ontology.py` — no separate fix script.

Brief `guidance` fields merge at hydrate time via `catalog-client.js` — required for LLM retrieval, `OntologyPolicy.rankSpirits`, and curated why lines.

### Spirit enrichment QA (WhiskeyFYI — suggest only)

[`../enrich-spirit-suggest.py`](../enrich-spirit-suggest.py) queries [WhiskeyFYI](https://whiskeyfyi.com/developers/) and writes **`../spirit-enrichment-suggestions.json`** — never auto-merges into `spirits/reco/` (see [`CATALOG_FREE_APIS.md`](../../../../internal/CATALOG_FREE_APIS.md)).

```bash
cd docs/visionboard
npm run catalog:enrich-spirits -- --limit 10          # sample rows
npm run catalog:enrich-spirits -- --sku SPI-...       # one SKU
npm run catalog:enrich-spirits -- --dry-run           # print queries only
npm run catalog:enrich-spirits -- --from-sheet        # refresh tracker JSON first
```

**Human workflow:** review `spirit-enrichment-suggestions.json` → edit Spirits tab → `export-spirit-tracker-from-sheet.py` → `build-tracker-spirits-to-ontology.py`.

### Phase 2 (production seam)

| Visionboard | Production |
|-------------|------------|
| `fetch('cigars/manifest.json')` + shards | `GET /v1/venues/:venueId/catalog` |
| `fetch('cigars/briefs/{shard}.json')` | `GET /v1/products/:id/brief` |
| `LoungeCatalog.init({ catalogBase: 'assets/knowledge/' })` | `LoungeCatalog.init({ venueId, apiBase })` |

## API

### `window.LoungeCatalog`

- `init({ basePath })` — fetch four JSON slices; returns `Promise`
- `ready()` — await catalog hydration
- `isReady()` — boolean
- `setEmbeddedSeed({ cigars, spirits, foods })` — register pre-fetch seed (Node fixtures)
- `hydrateFromData({ cigarsReco, cigarsBriefs, spiritsReco, spiritsBriefs })` — Node fixtures

### `window.LoungeProducts` (facade)

- `listMenuCigarNames()` / `listMenuSpiritNames()` / `listMenuFoodNames()` — validation allowlist order
- `findSpiritByName(name)` / `findCigarByName(name)` / `findFoodByName(name)`
- `getSpiritById(id)` / `getCigarById(id)` / `getFoodById(id)`
- `resolveProduct(id)` — any category
- `normalizeProductName(name)` — trim + collapse whitespace
- `getCatalogProducts()` — spirits then cigars

## Dependency rule

**Ontology must not import** `sterlon-recommendations.js`, `sterlon-chat.js`, or DOM modules.

## Node fixtures

VM harnesses load the full stack via [tools/load-sterlon-stack.mjs](../../tools/load-sterlon-stack.mjs), which hydrates catalog JSON synchronously after `index.js`.

See `tools/sterlon-reco-freeze/run.mjs`.
