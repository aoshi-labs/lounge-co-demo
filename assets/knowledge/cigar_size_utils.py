"""Shared stick-size formatting for Cigar Research Tracker exports."""
from __future__ import annotations

# Optional per-SKU: other common vitolas in the line (smoker-facing).
SIZE_NOTES: dict[str, str] = {
    "L3-MAC-CAFE": "Line also: Hyde Park 5×50.",
    "L3-AF-GRANRES": "Line also: Chateau, Cazadores — length/ring vary.",
    "L3-RYJ-1875": "Line also: Bully 5×50, Toro 6×50.",
    "L3-MONT-WHITE": "Line also: Rothchilde 5×52, Churchill 7×48.",
    "L4-LFD-DL": "Line also: Robusto 5×50, Toro 6×54.",
    "HTD-01-OPUSX": "Many vitolas; listed size is Petite Corona class. Toro/Robusto larger.",
    "HTD-02-ASHTON-ESG": "Line also: Robusto, Toro — ring/length vary.",
    "HTD-03-AF-HEMINGWAY": "Figurado family: Signature, Churchill, etc. — length varies.",
    "HTD-04-ASHTON-CLASSIC": "Several sizes; Magnum is representative long smoke.",
    "HTD-07-MONTECRISTO": "Classic line has multiple vitolas; Toro listed.",
    "HTD-09-DAV-ANIV": "Aniversario line — Churchill representative; other sizes available.",
    "HTD-10-COHIBA": "Red Dot line — multiple vitolas; Robusto representative.",
    "L4-OLIVA-SERIEV": "Line also: Torpedo 6×54, Toro 6×52.",
    "L4-MYF-LEBIJOU": "Line also: Torpedo, Churchill.",
    "L5-FOUND-TABERNACLE": "Line also: Toro 6×52, Lancero 7×38.",
    "L5-DTT-SINCOMP": "Line also: No. 5, Seleccion — dimensions vary.",
    "L5-DREW-LIGA9": "Line also: Toro 6×52, Corona Doble 7×54.",
}


def format_length_inches(length: float) -> str:
    """Humidor-style length: 5¼, 5½, 6⅛, or plain decimal."""
    whole = int(length)
    frac = round(length - whole, 3)
    mapping = (
        (0.125, "⅛"),
        (0.25, "¼"),
        (0.5, "½"),
        (0.75, "¾"),
    )
    for val, sym in mapping:
        if abs(frac - val) < 0.02:
            return f"{whole}{sym}" if whole else sym
    return f"{length:g}"


def format_stick_size(length: float, ring: int | float, shape: str) -> str:
    """What smokers say: 5¼ × 53 · Robusto."""
    ring_i = int(ring)
    return f'{format_length_inches(length)} × {ring_i} · {shape}'


def estimate_smoke_band(length: float, ring: int | float) -> str:
    """Rough session band from dimensions (not construction)."""
    ring_i = int(ring)
    score = length * 12 + ring_i * 0.35
    if score < 72:
        return "short"
    if score < 88:
        return "standard"
    if score < 100:
        return "long"
    return "session"
