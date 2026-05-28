# Knowledge layer — cigar & spirit catalog

Sterlon reads **`products/*.reco.json`** and **`products/*.briefs.json`**, not this folder at runtime. This directory is the **build pipeline** from your Google Sheet research tracker into those slices.

## Canonical workflow

From `docs/visionboard`:

```powershell
npm run catalog:health   # architecture + catalog sanity (run before PRs)
npm run catalog:sync     # sheet → TSV → audit → rebuild JSON → diff report
```

See **[CATALOG_SYNC.md](./CATALOG_SYNC.md)** for step-by-step detail.

## What to commit

| Commit | Do not commit |
|--------|----------------|
| `cigars/`, `spirits/` (manifest + shards), `products/*.js` loaders | `*.b64`, `cigar-push-chunk-*.json`, `bb24-*`, `bb25-*` |
| `cigar-corrections.json`, `cigar-*-rows.json` (portfolio row sources) | `__pycache__/`, `mcp-args-*.json`, `gen-wb-*.py`, `workbench-*.txt` |
| `build-*-sheet.py`, `cigar_catalog_cli.py`, `cigar_tracker_pipeline.py` | Ephemeral `_url_*`, `_pending_*` scratch files |

Overrides merge **after** TSV: `cigar-corrections.json` and row JSON globs listed in `cigar_tracker_pipeline.py` (`ROW_JSON_GLOBS`).

## Sheet updates

Pull uses the Google Sheets **CSV export URL** (`npm run catalog:pull` / `cigar_catalog_cli.py pull`).

Push to the tracker: paste `cigar-research-tracker-paste-*.tsv` into the **Cigars** tab, or run `build-*-sheet.py` and apply the generated `*-sheet-push.json` ranges manually in Sheets.

## External enrichment (free APIs)

Research and integration notes: **[docs/internal/CATALOG_FREE_APIS.md](../../../internal/CATALOG_FREE_APIS.md)**.

Phase 1 remains **curated sheet + corrections**; APIs are optional accelerators for spirit metadata and QA, not live pairing authority.
