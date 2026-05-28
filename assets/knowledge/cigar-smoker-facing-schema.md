# Cigar Research Tracker — smoker-facing columns (Sterlon v1)

These columns live in **AC–AK** (after `Article Source`). Blend/reco columns **M–W** are unchanged.

## Cigar Aficionado scores (AL–AO)

Official **Cigar Aficionado** ratings where we have a published list match (Top 25 or Best Buy). Blank for curated classics, Holt’s teaching rows, and transcript picks without a CA score.

| Col | Header | Example | Notes |
|-----|--------|---------|--------|
| AL | CA Rating | `97` | Integer 0–100; point score from CA |
| AM | CA List Year | `2025` | Year of the list |
| AN | CA List | `Top 25` | `Top 25` or `Best Buy` |
| AO | CA Rank | `3` | Position on that list; blank for Best Buy |

Regenerate from repo JSON via `apply-ca-ratings.py` → `cigar-ca-ratings-map.json`.

## Why size is load-bearing

Smokers think in **length × ring + shape**, not SKU codes:

- **Length** → time on the porch (Short Story ≈ 30–45 min; Churchill ≈ 90 min)
- **Ring gauge** → volume, draw, intensity
- **Shape** → burn line, experience (Figurado, Torpedo, Chisel, Ambar vitola)

Sterlon must name the stick size in every pick and honor requests like “short smoke,” “big ring,” or “robusto.”

## Column map (AC–AK)

| Col | Header | Example | Format in sheet |
|-----|--------|---------|-----------------|
| AC | MSRP USD | `12` | Number (not currency) |
| AD | Length | `5.25` | **Number** — plain inches |
| AE | Ring Gauge | `53` | **Number** |
| AF | Shape | `Robusto` | Text |
| AG | Stick Size | `5¼ × 53 · Ambar` | **Formula or paste** — smoker-facing display |
| AH | Catalog Line | includes stick size | Text |
| AI | Member Blurb | enthusiast copy | Text |
| AJ | Price Note | MSRP caveats, vitola varies | Text |
| AK | Size Note | Other sizes in the line | Text |

### Sheet formatting (important)

Set **AD (Length)** and **AE (Ring Gauge)** to **Number**, not Currency — otherwise exports show `$5.25`.

**Stick Size (AG)** can be a formula:

```google-sheets
=IF(AND(AD2<>"",AE2<>""), SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(TEXT(AD2,"0.00"),".25","¼"),".5","½"),".75","¾"),".00","") & " × " & AE2 & " · " & AF2, "")
```

Or paste values from `apply-smoker-facing-fields.py` (recommended for v1).

## Catalog line rhythm

```
{Name} · {stick size} · {body} · {origin} · {price} · Notes: {flavor chips}
```

Example: `The Cohiba Ambar · 5¼ × 53 · Ambar · Medium-Full · Cuban · — · Notes: oak, caramel, almond, cream`

## Sterlon filtering (conceptual)

| Member says | Use |
|-------------|-----|
| under $10 | `MSRP USD ≤ 10` |
| short / quick / before dinner | `Length ≤ 5` or smoke time ≤ 45 min |
| long session / movie | `Length ≥ 6` or ring ≥ 54 |
| big ring / chunky | `Ring Gauge ≥ 54` |
| lancero / slim | shape or ring ≤ 42 |
| robusto / toro / churchill | match **Shape** |

## Files

- `cigar_size_utils.py` — format `5¼ × 53 · Robusto`, size notes, smoke band
- `cigar-smoker-facing-fields.json` — full export
- `apply-smoker-facing-fields.py` — regenerate + paste TSV `AC1:AK44`
