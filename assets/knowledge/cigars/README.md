# Cigar catalog (`assets/knowledge/cigars/`)

Runtime Sterlon catalog data for cigars. **Not** mixed with spirits or JS loaders.

## Layout

| Path | Role |
|------|------|
| `manifest.json` | Index of `reco/*` and `briefs/*` shards — loaded by `catalog-client.js` |
| `reco/*.json` | Reco-hot product slice (tags, sensory, spec, deckKey) |
| `briefs/*.json` | Teaching slice (menuLine, guidance, provenance) — merged at hydrate time |
| `sources/*.json` | Tracker merge shards (build input; raw rows by SKU prefix) |
| `canonical.json` | Full merge audit + validation report from `cigar_catalog_cli.py` |
| `pushes/*.json` | Sheet push payloads for manual apply (not loaded at runtime) |

## Shard naming (reco + briefs)

Logical shard (SKU prefix) → one or more files capped at **9 products** (~≤500 lines each):

| Prefix | Base name | Example files |
|--------|-----------|----------------|
| `L3*`, `L4*` | `levels` | `levels.json` |
| `CUR-*` | `curated` | `curated-01.json` … `curated-06.json` |
| `CA24-*` | `ca24-top25` | `ca24-top25-01.json` … |
| `BB24-*` | `ca24-bestbuy` | `ca24-bestbuy-01.json` … |
| `CA25-*` | `ca25-top25` | `ca25-top25-01.json` … |
| `BB25-*` | `ca25-bestbuy` | `ca25-bestbuy-01.json` … |
| `VID-*`, `HTD-*` | `transcript` | `transcript-01.json` … |
| other | `other` | `other.json` |

`manifest.json` lists every `reco/*` and `briefs/*` part path.

## Build

```bash
cd docs/visionboard/assets/knowledge
python cigar_catalog_cli.py build   # writes sources/, reco/, briefs/, manifest.json, canonical.json
```

npm: `npm run catalog:sync` from `docs/visionboard`.

## Browser load

`LoungeCatalog.init()` fetches `assets/knowledge/cigars/manifest.json` then parallel shard fetches (see `products/catalog-client.js`).
