#!/usr/bin/env python3
"""Build the small metadata index used by the deployed proof browser."""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "oulipoof"
OUTPUT = ROOT / "api" / "collection-index.json"
FEATURED = DATA / "featured-results.json"


def main() -> None:
    featured = json.loads(FEATURED.read_text(encoding="utf-8"))["results"]
    items: list[dict] = []
    source_counts: Counter[tuple[str, str]] = Counter()
    position: dict[str, int] = {}
    proof_ids_by_item: dict[str, set[str]] = {}

    for filename, kind in (("informal.jsonl", "informal"), ("formal.jsonl", "formal")):
        with (DATA / filename).open("rb") as source:
            while line := source.readline():
                offset = source.tell() - len(line)
                row = json.loads(line)
                statement = row["statement"] if kind == "informal" else row["problem"]
                item = {
                    "id": row["id"],
                    "kind": kind,
                    "dataset": row["dataset"],
                    "title": row.get("source_metadata", {}).get("title") if kind == "informal" else None,
                    "statement": statement,
                    "source_id": row.get("source_id"),
                    "formal_statement": row.get("formal_statement") if kind == "formal" else None,
                    "n_proofs": row["n_proofs"] if kind == "informal" else 2,
                    "file": filename,
                    "byte_offset": offset,
                    "byte_length": len(line),
                }
                position[item["id"]] = len(items) + 1
                if kind == "informal":
                    proof_ids_by_item[item["id"]] = {proof["proof_id"] for proof in row["proofs"]}
                if item["id"] in featured:
                    item["featured"] = {key: featured[item["id"]][key] for key in ("title", "field", "period", "overview")}
                items.append(item)
                source_counts[(kind, row["dataset"])] += 1

    item_ids = {item["id"] for item in items}
    missing = set(featured) - item_ids
    if missing:
        raise ValueError(f"Featured results missing from collection: {sorted(missing)}")
    for item_id, curation in featured.items():
        unknown = set(curation["proofs"]) - proof_ids_by_item[item_id]
        if unknown:
            raise ValueError(f"Unknown featured proof IDs for {item_id}: {sorted(unknown)}")

    payload = {
        "version": 1,
        "sources": [
            {"kind": kind, "dataset": dataset, "count": count}
            for (kind, dataset), count in sorted(source_counts.items())
        ],
        "items": items,
        "position": position,
        "featured": featured,
        "featured_items": [
            {"id": item["id"], "title": featured[item["id"]]["title"], "field": featured[item["id"]]["field"]}
            for item in items if item["id"] in featured
        ],
    }
    OUTPUT.parent.mkdir(exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(items):,} records to {OUTPUT} ({OUTPUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
