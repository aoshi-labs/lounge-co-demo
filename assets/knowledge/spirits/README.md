# Spirit catalog (`assets/knowledge/spirits/`)

Runtime Sterlon catalog data for spirits.

## Layout

| Path | Role |
|------|------|
| `manifest.json` | Index of `reco/*` and `briefs/*` shards |
| `reco/*.json` | Reco-hot slice |
| `briefs/*.json` | Teaching slice (guidance, menuLine) |

## Shard naming

| Prefix | Base name | Files |
|--------|-----------|--------|
| `SPI-CUR-*` | `curated` | `curated.json` (usually one part) |
| `SPI-TRK-*` | `tracker` | `tracker-01.json` … (8 products each, ≤500 lines) |
| other | `other` | `other.json` |

## Build

```bash
cd docs/visionboard/assets/knowledge
python export-spirit-tracker-from-sheet.py   # optional
python build-tracker-spirits-to-ontology.py
```

Post-build ontology fields (`deckKey`, `journeyRank`) are set in `build-tracker-spirits-to-ontology.py` — no separate fix script.

Tracker inputs live in `assets/knowledge/` root (`spirit-research-tracker-*.json`, `curated-spirit-products.json`).
