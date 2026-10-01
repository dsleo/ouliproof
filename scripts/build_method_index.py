#!/usr/bin/env python3
"""Build the small, reviewable method index from a pinned MathlibGraph file."""
import hashlib
import json
import pathlib
import urllib.request

REVISION = "8c706461fe266802197b62af324de12a3f1aa7fb"
URL = f"https://huggingface.co/datasets/MathNetwork/MathlibGraph/resolve/{REVISION}/tactic_usage.ndjson"
# The dataset card reports 534cf0b. GitHub commit search resolves it to this
# full SHA in leanprover-community/mathlib4 (2026-02-02).
MATHLIB_COMMIT = "534cf0b8f5267c3f20bf52f932ad5f9834187c35"
SOURCE_SHA256 = "3927807af5920b626b687565f415233219df017b5b1555a074a073809bff4f84"
RULES = {
    "induction": {"induction", "induction'", "fun_induction"},
    "cases": {"cases", "cases'", "by_cases", "by_cases'", "rcases"},
    "absurd": {"by_contra", "by_contra!", "contradiction", "exfalso", "absurd"},
}
ROOT = pathlib.Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "method-markers.json"


def main() -> None:
    rows = 0
    source_hash = hashlib.sha256()
    markers = {}
    with urllib.request.urlopen(URL, timeout=120) as response:
        for line in response:
            source_hash.update(line)
            row = json.loads(line)
            rows += 1
            if not isinstance(row.get("name"), str) or not isinstance(row.get("tactics"), list):
                raise ValueError(f"Invalid row {rows}")
            found = {key: sorted(set(row["tactics"]) & tokens) for key, tokens in RULES.items()}
            found = {key: value for key, value in found.items() if value}
            if not found:
                continue
            if row["name"] in markers:
                raise ValueError(f"Duplicate declaration: {row['name']}")
            markers[row["name"]] = {
                "kind": row.get("kind"),
                "module": row.get("module"),
                "matches": found,
            }
    if rows != 235586 or not 12000 <= len(markers) <= 15000:
        raise ValueError(f"Unexpected source coverage: {rows} rows, {len(markers)} markers")
    if source_hash.hexdigest() != SOURCE_SHA256:
        raise ValueError("Pinned tactic file changed; update and review the source hash")
    payload = {
        "schemaVersion": 1,
        "detectorVersion": "methods-1",
        "source": "MathNetwork/MathlibGraph/tactic_usage.ndjson",
        "datasetRevision": REVISION,
        "mathlibCommit": MATHLIB_COMMIT,
        "mathlibCommitStatus": "resolved",
        "sourceSha256": source_hash.hexdigest(),
        "sourceRows": rows,
        "markers": dict(sorted(markers.items())),
    }
    OUTPUT.parent.mkdir(exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"{OUTPUT}: {len(markers)} declarations, {OUTPUT.stat().st_size} bytes; raw SHA256 {source_hash.hexdigest()}")


if __name__ == "__main__":
    main()
