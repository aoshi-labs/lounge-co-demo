# pairing-engine/

Deterministic scoring and slot assignment for anchor × candidate pairings.

**Authority:** this module owns the *scoring contract only* — it takes product names in and emits numeric scores and ranked slot assignments out. No prose, no DOM, no session state, no LLM calls.

## Files

| File | Role |
|------|------|
| `score.js` | `PairingEngine` — scoreCandidate, rankCandidates, pickSlots |

## Public API (`window.PairingEngine`)

### `scoreCandidate(anchorName, candidateName)`

Delegates to `SterlonSensory.scorePairing`. Returns `{ score, intensityMatch, bridges }`.

### `rankCandidates(anchorName, candidateNames)`

Scores every candidate against the anchor, sorts descending by score (ties broken by `intensityMatch` true-first). Returns `[{ name, score, intensityMatch, bridges, bodyDelta }, ...]`.

### `pickSlots(anchorName, candidateNames, opts?)`

Assigns the three UX slot names from a ranked list:

| Slot | Rule | Fallback |
|------|------|----------|
| **best** | Highest overall score | — |
| **safe** | Highest `intensityMatch: true`, not already used | Second-ranked |
| **wildcard** | Highest unused with ≥1 bridge AND `\|bodyDelta\|` ≥ `wildcardBodyDeltaMin` (default 2) | Next unused |

Returns `{ best, safe, wildcard }` — name strings only.

**`opts.wildcardBodyDeltaMin`** (default `2`): minimum body dimension delta to qualify for wildcard. Ensures the controlled-novelty pick is perceptibly different from the anchor's body profile while remaining flavour-coherent via bridges.

## Dependency rule

Consumes: `SterlonSensory` (sensory/index.js), `SterlonSensoryProfiles` (sensory/profiles.js).

Must NOT import: DOM, `window` (beyond the global wrapper pattern), prose templates, session state, or `sterlon-chat.js`.

## Load order

```
sensory/profiles.js → sensory/relationships.js → sensory/index.js
  → pairing-engine/score.js
  → recommendation-runtime/...
```
