#!/usr/bin/env python3
"""Reproducible small live benchmark of method signals in mathematical searches."""
import collections
import concurrent.futures
import datetime
import json
import pathlib
import re
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
MARKERS = json.loads((ROOT / "public/method-markers.json").read_text())["markers"]
CASES = [
    ("compact maximum", "ContinuousOn.exists_isMaxOn'", "28ca120c-3282-4ae2-a63c-5288e144930d"),
    ("maximal ideal is prime", "Ideal.IsMaximal.isPrime'", "9514e3d4-a03f-456a-b23e-204e00966662"),
    ("group of prime order is cyclic", "isCyclic_of_prime_card", "f12838c0-3a1d-4925-adf8-e63c4ca8cf33"),
    ("Yoneda embedding is fully faithful", "CategoryTheory.Yoneda.fullyFaithful", "4ea4d1c7-f4f2-4373-a4c8-3b4642ec2875"),
    ("Euclid lemma", "Nat.Prime.dvd_or_dvd", "c6c6d711-c4c6-41fe-bf5e-ec31778d1abd"),
]
EXACT = {
    "Nat.rec": "structural recursor",
    "Or.elim": "disjunction elimination",
    "Decidable.byContradiction": "contradiction principle",
    "False.elim": "ex falso only",
}
SIGNATURES = {
    "Nat.recAux": ("structural induction recursor", re.compile(r"succ\s*:\s*\(n\s*:\s*Nat\)\s*→\s*motive n\s*→\s*motive\s*\(n\s*\+\s*1\)")),
    "Nat.casesAuxOn": ("natural-number case split", re.compile(r"succ\s*:\s*\(n\s*:\s*Nat\)\s*→\s*motive\s*\(n\s*\+\s*1\)")),
}


def fetch(identifier):
    url = f"https://api.theoremsearch.com/graph/statement/{identifier}?direction=src&formality=formal"
    with urllib.request.urlopen(url, timeout=25) as response:
        data = json.load(response)
    root = data["root"]
    names = {n["statement_id"]: n["name"] for n in data["nodes"]}
    edges = [(e["dep_id"], e["edge_type"]) for e in data["edges"] if e["src_id"] == identifier and e["edge_type"] == "proof"]
    return root, names, edges


def run(label, expected_name, root_id):
    started = time.monotonic()
    frontier = collections.deque([(root_id, 0)])
    parents = {root_id: None}
    known_names = {root_id: expected_name}
    checked = set()
    matches = []
    errors = []
    source_label = None
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        while frontier and len(checked) < 30 and time.monotonic() - started < 45:
            batch = []
            while frontier and len(batch) < 2 and len(checked) + len(batch) < 30:
                item = frontier.popleft()
                if item[0] not in checked:
                    batch.append(item)
            if not batch:
                continue
            for (identifier, depth), future in zip(batch, [pool.submit(fetch, i) for i, _ in batch]):
                try:
                    root, names, edges = future.result(timeout=30)
                    checked.add(identifier)
                    known_names.update(names)
                    source_label = source_label or root.get("statement", {}).get("paper_external_id")
                    actual_name = root["name"]
                    body = root.get("statement", {}).get("body", "")
                    if actual_name in SIGNATURES and SIGNATURES[actual_name][1].search(body):
                        matches.append({"name": actual_name, "depth": depth, "source": "TheoremGraph", "signal": SIGNATURES[actual_name][0]})
                    if identifier == root_id and actual_name != expected_name:
                        errors.append(f"Root mismatch: {actual_name}")
                    marker = MARKERS.get(actual_name)
                    if marker and (not marker.get("kind") or marker["kind"] == root.get("statement", {}).get("kind")):
                        matches.append({"name": actual_name, "depth": depth, "source": "MathlibGraph", "tokens": marker["matches"]})
                    for child, _kind in edges:
                        child_name = names.get(child)
                        if child_name in EXACT:
                            matches.append({"name": child_name, "depth": depth + 1, "source": "TheoremGraph", "signal": EXACT[child_name]})
                        if child not in parents:
                            parents[child] = identifier
                            frontier.append((child, depth + 1))
                except Exception as exc:
                    errors.append(f"{identifier}: {exc}")
    return {"query": label, "confirmed": expected_name, "id": root_id, "sourceLabel": source_label,
            "checked": len(checked), "pending": len(frontier), "seconds": round(time.monotonic() - started, 2),
            "signals": matches[:20], "errors": errors}


if __name__ == "__main__":
    result = {"date": datetime.datetime.now(datetime.timezone.utc).isoformat(), "api": "https://api.theoremsearch.com", "maxNodes": 30, "maxSeconds": 45, "cases": []}
    for case in CASES:
        record = run(*case)
        result["cases"].append(record)
        print(json.dumps(record, ensure_ascii=False), flush=True)
    (ROOT / "feasibility/method-search-results.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
