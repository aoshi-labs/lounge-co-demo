# Spirit Research Tracker — Spirits tab (v1)

New worksheet **Spirits** on the [Cigar Research Tracker](https://docs.google.com/spreadsheets/d/1mLHCA8rvvl5G87FJCxg5tkoDQ1Xp5FDx2QBm7Ty-WUU/edit#gid=1457011877) spreadsheet (tab after **Cigars**, burgundy tab color, frozen header row). Parallel to **Cigars** but fields match the lounge spirit ontology and the whiskey journey.

## Column map (A–AD)

| Col | Header | Example |
|-----|--------|---------|
| A | SKU | `SPI-CUR-PAPPY-23` |
| B | Brand | `Pappy Van Winkle` |
| C | Product Name | `Pappy Van Winkle 23yr` |
| D | Expression | `23 Year` |
| E | Spirit Type | `Bourbon` |
| F | Style | `Straight bourbon` |
| G | Origin | `Kentucky` |
| H | Tier | `7` |
| I | Journey Level | `advanced` |
| J | Journey Rank | `10` |
| K | Proof | `95.6` |
| L | ABV % | `47.8` |
| M | Mash / Grain Bill | `Wheated mash` |
| N | Flavor Family | `Orchard & oak` |
| O | Occasion | `Collector` |
| P | Pairing Affinity (Cigar) | `Maduro / cocoa` |
| Q | Flavor Notes | `caramel, ripe apple, cherry, oak, tobacco, chocolate` |
| R | Notes | Research / blend teaching |
| S | Best For | When to recommend |
| T | Avoid If | When not to recommend |
| U | Why Recommend | Sterlon trigger line |
| V | Recommendation Confidence | `High` |
| W | Source Confidence | `Manufacturer official` (brand/distillery page) · `Ontology + awards` (curated) |
| X | MSRP USD | `85` |
| Y | Catalog Line | Menu-facing one-liner |
| Z | Member Blurb | Enthusiast copy |
| AA | Awards Summary | Semicolon-separated |
| AB | Image URL | |
| AC | Article Source | |
| AD | Sterlon | `Curated` / `Tracker` / blank |
| AE | Data Grade (1-10) | **10** = flavor notes + proof verified against manufacturer site (`spirit-manufacturer-verified.json`). No invented mash bills or mislabeled wheated vs rye. |

Green **SKU** cell = on Sterlon catalog (same convention as Cigars).

**Journey rank rule:** Rank **10** is reserved for the advanced bourbon cap (Pappy 23 curated). Luxury rums at a similar tier use **rank 11** (e.g. Ron Zacapa 23).

## Layout (sheet formatting)

- **Wrap:** `A1:AD` — text wraps in all cells
- **Header row:** ~36px tall, burgundy background
- **Data rows:** ~88px default (auto-resize after paste); Catalog Line / Member Blurb / Notes columns wider (Y–AA ~240px)
- Re-apply layout after bulk paste manually in Google Sheets (header row, wrap, column widths).

## Repo source of truth (today)

- Curated spirits: `docs/visionboard/assets/knowledge/curated-spirit-products.json` → merged into `products/spirits.reco.json`
- Tracker spirits: `spirit-research-tracker-all-rows-*.json` → `build-tracker-spirits-to-ontology.py`
- Journey levels: `docs/visionboard/assets/knowledge/whiskey-journey.js`
