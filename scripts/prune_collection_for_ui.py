"""Remove collection fields that the proof browser never displays.

The formal source artifacts contain tactic traces and proof trees for research
workflows. They are not needed to inspect proof diversity in the UI and account
for most of the local dataset size.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "oulipoof"


def prune_track(track: dict) -> dict:
    return {
        key: track.get(key)
        for key in (
            "code",
            "main_theorem_proof_code",
            "main_theorem_split_valid",
            "origin",
            "validation_status",
        )
    }


def main() -> None:
    source_path = DATA / "formal.jsonl"
    target_path = DATA / "formal.jsonl.partial"
    count = 0
    with source_path.open("r", encoding="utf-8") as source, target_path.open("w", encoding="utf-8") as target:
        for line in source:
            row = json.loads(line)
            row["human_proof"] = prune_track(row["human_proof"])
            row["prover_proof"] = prune_track(row["prover_proof"])
            target.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
            count += 1
    target_path.replace(source_path)

    manifest_path = DATA / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    hasher = hashlib.sha256()
    with source_path.open("rb") as source:
        for chunk in iter(lambda: source.read(4 * 1024 * 1024), b""):
            hasher.update(chunk)
    manifest["outputs"]["formal.jsonl"] = {
        "bytes": source_path.stat().st_size,
        "sha256": hasher.hexdigest(),
        "profile": "ui: no tactic traces or proof trees",
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Pruned {count} formal records to {source_path.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
