# Cigar sub-line body audit

Sub-lines must **not** inherit parent-brand body/strength. Overrides live in `cigar-corrections.json` and runtime `cigar-subline-body.js`.

## Audited SKUs (venue catalog)

| Parent line | Sub-line SKU | Display name | Body | Strength | vs parent |
|-------------|--------------|--------------|------|----------|-----------|
| Fuente Fuente OpusX | `CUR-05-OPUSX-RDC` | OpusX Reserva d'Chateau | **Full** | 5 | Reference full Opus |
| Fuente Fuente OpusX | `CA25-09-OPUSX-ANGEL` | Opus X Angel's Share | **Medium** | 4 | Softer, cream-forward; not Full |
| Liga Privada (Drew Estate) | `L5-DREW-LIGA9` | Liga Privada No. 9 | **Full** | 6 | Broadleaf flagship |
| Liga Privada (Drew Estate) | `CUR-23-LIGA-H99-ROB` | Liga Privada H99 | **Medium** | 4 | CT Corojo hybrid; not No. 9 |
| Liga Privada (Drew Estate) | `CA25-11-LIGA-T52` | Liga Privada T52 | Medium-Full | — | Distinct line; monitor |

## Not on menu (gap)

| Sub-line | Status |
|----------|--------|
| **Padron Damaso** | Not in current 166-SKU tracker export — add when sourced |

## Rebuild after corrections

```bash
cd docs/visionboard
npm run test:catalog-integrity
```

## Runtime + prose

- Full-body intent: strict `Full` only + `CigarSublineBody` exclusions.
- Three-slot prose: `SterlonProsePipeline.parseFlightSlotProse()`; click flight columns to swap the description (`sterlon-presentation-lifecycle.js`).
