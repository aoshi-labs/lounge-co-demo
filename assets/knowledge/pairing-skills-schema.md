# Pairing Skills tab — research tracker

Worksheet **Pairing skills** on the [Cigar Research Tracker](https://docs.google.com/spreadsheets/d/1mLHCA8rvvl5G87FJCxg5tkoDQ1Xp5FDx2QBm7Ty-WUU/edit) spreadsheet.

## Purpose

Canonical pairing playbook for Sterlon and human curators — not product SKUs. Product tasting notes stay on **Cigars** (T) and **Spirits** (Q); this tab teaches *how* to pair.

## Column map (A–M)

| Col | Header | Usage |
|-----|--------|--------|
| A | Section | META, FRAMEWORK, INTENSITY, WHISKEY, BOURBON, RUM, COGNAC_BRANDY, TEQUILA_MEZCAL, WINE_BUBBLES, BEER, COFFEE_CHOCOLATE, ANTI_PATTERN, STERLON_SLOTS, CANONICAL |
| B | Skill ID | Stable id `PS-###` |
| C | Priority | 1 = critical, 2 = important |
| D | Skill Title | Short label |
| E | Operative Rule | What to do (Sterlon-ready instruction) |
| F | Cigar Signals | Strength, wrapper, flavor chips |
| G | Spirit / Drink Signals | Category, body, official chips |
| H | Pairing Mode | Complement, Contrast, Avoid, Either |
| I | Body / Strength Match | e.g. Δ body ≤ 1, intensityMatch |
| J | Flavor Bridges | Shared chip vocabulary |
| K | Worked Example | Named pairing when applicable |
| L | Member Intent Triggers | Utterance hooks |
| M | Source | URL or internal ref |

## Repo source

- Rows: `pairing-skills-sheet-rows.json`
- Regenerate push payload: `push-pairing-skills-sheet.py` → `pairing-skills-sheet-push.json`
- **Sterlon runtime:** `build-pairing-skills-runtime.py` → `pairing-skills-data.js` (compact skills; column M Source not shipped)
- **Sterlon API:** `pairing-skills.js` → `window.SterlonPairingSkills`

### Sterlon runtime API

| Method | Role |
|--------|------|
| `selectForTurn({ memberText, pairingMode, maxSkills, categoryFocus })` | Rank skills by intent triggers + section cues. `categoryFocus` (`'pairing'`/`'spirit'`/`'cigar'`/`'open'`) controls whether STERLON_SLOTS (PS-120/121/122, PS-124) are included. Single-category turns get PS-123 only. |
| `buildSystemPromptBlock(opts)` | Base playbook in `ProductKnowledge.buildHousePlaybookBlock()` |
| `buildTurnBlock(memberText, opts)` | Extra rules on pairing-intent turns (injected via `ProductKnowledge.buildPairingTurnBlock`). Pass `{ categoryFocus }` to limit skills to the relevant category. |
| `isPairingIntent(text, opts)` | Lightweight pairing-topic detector. Accepts `opts.categoryFocus`: for `'spirit'`/`'cigar'` only explicit pairing-flight language (`pair with`, `full flight`, `best.*wildcard`) returns true. Bare `recommend`/`suggest`/category tokens do not. |

Load order: `pairing-skills-data.js` then `pairing-skills.js` after `menu-flavor-catalog.js`, before `product-knowledge.js` (see `sterlon.html`).

## External sources (v1)

- [William Henry — Guide to Pairing Cigars and Spirits](https://www.williamhenry.com/blogs/wh-insider/guide-to-pairing-cigars-and-spirits)
- [Cigar Place — How to Pair Cigars and Drinks](https://www.cigarplace.biz/blog/how-to-pair-cigars-and-drinks.html)
- [Havana House — Ultimate Guide to Pairing](https://www.havanahouse.co.uk/ultimate-guide-pairing-blog/)

Aligned with `PairingEngine` / `SterlonSensory.scorePairing` (best / safe / wildcard slots).
