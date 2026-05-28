# Cigar catalog sync — Google Sheet → Sterlon

Source of truth: **[Cigar Research Tracker](https://docs.google.com/spreadsheets/d/1mLHCA8rvvl5G87FJCxg5tkoDQ1Xp5FDx2QBm7Ty-WUU/edit)** (`Cigars` tab).

Sterlon never reads the sheet live. It reads **`cigars/manifest.json`** plus sharded **`cigars/reco/*.json`** and **`cigars/briefs/*.json`**, built by **`cigar_catalog_cli.py`**.

## Recommended workflow (from `docs/visionboard`)

```powershell
# Health check (Sterlon LOC caps, knowledge noise, catalog slices)
npm run catalog:health

# Full pipeline: live sheet → TSV → audit → rebuild JSON → diff report
npm run catalog:sync

# Or step by step:
npm run catalog:pull      # fetch Cigars tab → cigar-research-tracker-cigars-updated.tsv
npm run catalog:audit     # fail if merged rows have identity/validation errors
npm run test:catalog-integrity   # rebuild canonical + reco + briefs (same as catalog:build)
npm run catalog:diff      # on-disk JSON vs what merge would emit
```

Manual TSV export from Google Sheets is still fine (and sometimes safer for comma-heavy cells). After export, skip pull and run `audit` + `build` only.

## CLI reference (`assets/knowledge`)

| Command | Purpose |
|---------|---------|
| `pull` | Fetch public CSV export of `Cigars` tab → TSV (`--force` to overwrite) |
| `audit` | Validate merged sources; `--report` writes `reports/catalog-audit-latest.json` |
| `diff` | Compare merge output vs on-disk `cigars/manifest.json` + shards |
| `build` | Write `cigars/canonical.json`, `cigars/reco/*`, `cigars/briefs/*`, `cigars/manifest.json` |
| `sync` | `pull` → `audit` (strict) → `build` → `diff` report |
| `health` | Sterlon hotspot line counts + ephemeral file warning |

Overrides without re-exporting the whole sheet: **`cigar-corrections.json`** (wins over TSV).

## Repo hygiene

- Commit **`cigars/`** and **`spirits/`** catalog trees plus **`cigar-*-rows.json`** / **`cigar-corrections.json`** — not `*.b64` or `cigar-push-chunk-*.json` (see `assets/knowledge/.gitignore`).
- Sheet updates: CSV pull via `catalog:pull`; push via paste TSV or manual apply of `*-sheet-push.json` from `build-*-sheet.py`.
- Free API research for optional spirit enrichment: **[CATALOG_FREE_APIS.md](../../internal/CATALOG_FREE_APIS.md)**.

## What the pipeline enforces

1. **Row identity** — `catalogLine`, `memberBlurb`, and `stickSize` must mention the row’s Brand/Line. Mis-pasted rows are **cleared** and rebuilt from core fields.
2. **Corrections** — `cigar-corrections.json` + row-level JSON overrides merge last.
3. **Slice integrity** — every reco `id` has a brief; `menuLine` / `memberBlurb` must mention the product name.
4. **Build fails** on validation errors — no silent bad export.

## What Sterlon enforces at runtime

- **Cards** — SKUs from `RecommendationRuntime` (not the LLM).
- **Prose** — gateway prompt includes **CATALOG FACTS** per slot (wrapper, binder, filler, size, MSRP, occasion).
- **Morning coffee** — turn constraints down-rank after-dinner gordos when the member asks for coffee.

## QA helpers

- `python qa-cigar-sheet.py` — live sheet vs `cigar-corrections.json` (rows 6–19 by SKU) + role heuristics.
- Reports (gitignored): `docs/visionboard/reports/catalog-audit-latest.json`, `catalog-diff-latest.json`.

## If prose still drifts

Small local models ignore instructions more often than production-grade hosted models. Facts blocks reduce drift; they do not eliminate it when the model is underpowered.

## Known bad pattern (fixed in pipeline)

Row `BB24-08-PUNCH-DRAGON` in an old TSV had **Ferio Tego Summa** text in Catalog Line while Brand/Line were Punch Dragon Fire. Fix: correct sheet rows + `cigar-corrections.json` + `npm run catalog:sync`.
