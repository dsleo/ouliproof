"""Measure a small fixed set of TheoremGraph formal search queries.

Run: python3 feasibility/probe_search.py
Requires: requests. Writes search-results.json beside this script.
"""

from __future__ import annotations

import concurrent.futures
import json
import time

import requests

from probe_theoremgraph import BASE, OUT, ROOTS


QUERIES = [
    ("Nat.add_comm", "Nat.add_comm"),
    ("for all natural numbers a and b, a + b = b + a", "Nat.add_comm"),
    ("law of excluded middle: for every proposition p, p or not p", "Classical.em"),
    ("zero plus a natural number equals the same natural number", "Nat.zero_add"),
    ("if the sum of two natural numbers is zero, then both are zero", "Nat.eq_zero_of_add_eq_zero"),
    ("Classical.choice", "Classical.choice"),
]
TARGET_IDS = {**ROOTS, "Classical.choice": "7b185410-dd7e-483a-b914-98d71aa2e23b"}


def search(query: str, target: str):
    start = time.monotonic()
    try:
        response = requests.get(
            f"{BASE}/graph/embedding",
            params={"query": query, "formality": "formal", "n_results": 10},
            timeout=40,
        )
        payload = response.json() if response.ok else {}
        results = payload.get("results", [])
        ids = [item.get("statement_id") for item in results]
        target_id = TARGET_IDS[target]
        return {
            "query": query,
            "target": target,
            "http_status": response.status_code,
            "elapsed_seconds": round(time.monotonic() - start, 3),
            "target_rank": ids.index(target_id) + 1 if target_id in ids else None,
            "result_count": len(results),
            "unique_ids": len(set(ids)),
            "results": [
                {
                    "id": item.get("statement_id"),
                    "name_field": item.get("name"),
                    "source_title": item.get("title"),
                    "score": item.get("score"),
                }
                for item in results
            ],
        }
    except Exception as error:
        return {"query": query, "target": target, "error": repr(error)}


def main():
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        rows = list(pool.map(lambda pair: search(*pair), QUERIES))
    (OUT / "search-results.json").write_text(
        json.dumps({"date": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "endpoint": f"{BASE}/graph/embedding", "results": rows},
                   ensure_ascii=False, indent=2) + "\n"
    )
    for row in rows:
        print(row["query"], row.get("http_status"), row.get("elapsed_seconds"),
              row.get("target_rank"), row.get("unique_ids"))


if __name__ == "__main__":
    main()
