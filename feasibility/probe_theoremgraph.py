"""Small, bounded, reproducible probe of TheoremGraph's formal proof edges.

Run: python3 feasibility/probe_theoremgraph.py
Requires: requests. Results are written beside this script.
This is an API feasibility probe, not the application's traversal engine.
"""

from __future__ import annotations

import collections
import concurrent.futures
import json
import time
from pathlib import Path

import requests


BASE = "https://api.theoremsearch.com"
OUT = Path(__file__).parent
ROOTS = {
    "Nat.add_zero": "5dd9fd70-1bd4-4d7f-be72-a45b65a05bc5",
    "Nat.zero_add": "23cea27e-8254-4e41-96dd-57f732be6402",
    "Nat.add_comm": "5546ccb4-5beb-4176-807a-cc42f622aa33",
    "Nat.eq_zero_of_add_eq_zero": "2bc6b0da-d7c1-4270-b311-b7ea83e96caf",
    "Nat.add_eq_zero": "66b1e8d2-0ca6-4d33-bea6-e1463dc26ff8",
    "Classical.em": "46f9bdf2-6f17-43d0-9009-8485b2479ea2",
}
TARGET_NAMES = {
    "Classical.choice",
    "Classical.em",
    "Classical.propDecidable",
    "Decidable.byContradiction",
    "False.elim",
    "Nat.zero_add",
    "Nat.succ_add",
    "Nat.rec",
    "propext",
}
MAX_NODES_PER_ROOT = 80
MAX_SECONDS_PER_ROOT = 50
WORKERS = 3


def fetch(node_id: str) -> dict:
    start = time.monotonic()
    try:
        response = requests.get(
            f"{BASE}/graph/statement/{node_id}",
            params={"direction": "src", "formality": "formal"},
            timeout=20,
        )
        latency = round(time.monotonic() - start, 3)
        payload = response.json() if response.ok else None
        if not response.ok:
            return {"id": node_id, "status": response.status_code, "latency": latency}
        if not isinstance(payload, dict) or not all(
            key in payload for key in ("root", "nodes", "edges")
        ):
            return {"id": node_id, "status": "invalid_schema", "latency": latency}
        root = payload["root"]
        if root.get("statement_id") != node_id:
            return {"id": node_id, "status": "wrong_root", "latency": latency}
        nodes = {
            item["statement_id"]: item.get("name", "")
            for item in payload["nodes"]
            if isinstance(item, dict) and item.get("statement_id")
        }
        direct = [
            edge
            for edge in payload["edges"]
            if edge.get("src_id") == node_id
        ]
        missing_names = [
            edge["dep_id"] for edge in direct if edge.get("dep_id") not in nodes
        ]
        return {
            "id": node_id,
            "status": response.status_code,
            "latency": latency,
            "bytes": len(response.content),
            "name": root.get("name"),
            "kind": root.get("statement", {}).get("kind"),
            "paper_external_id": root.get("statement", {}).get("paper_external_id"),
            "body_present": bool(root.get("statement", {}).get("body")),
            "nodes": nodes,
            "direct_edges": direct,
            "missing_names": missing_names,
            "response_edge_count": len(payload["edges"]),
        }
    except Exception as error:
        return {
            "id": node_id,
            "status": "exception",
            "latency": round(time.monotonic() - start, 3),
            "error": repr(error),
        }


def path_to(node_id: str, parent: dict[str, str | None], names: dict[str, str]):
    path = []
    cursor = node_id
    while cursor is not None:
        path.append({"id": cursor, "name": names.get(cursor)})
        cursor = parent[cursor]
    return list(reversed(path))


def traverse(root_id: str, cache: dict[str, dict], pool):
    started = time.monotonic()
    frontier = [root_id]
    parent: dict[str, str | None] = {root_id: None}
    distance = {root_id: 0}
    names = {}
    levels = []
    errors = []
    total_bytes = 0
    network_requests = 0
    network_latency = []
    inspected = []
    stop_reason = "complete"

    while frontier:
        if time.monotonic() - started > MAX_SECONDS_PER_ROOT:
            stop_reason = "time_budget"
            break
        remaining = MAX_NODES_PER_ROOT - len(inspected)
        if remaining <= 0:
            stop_reason = "node_budget"
            break
        batch = frontier[:remaining]
        deferred = frontier[remaining:]
        futures = {}
        for node_id in batch:
            if node_id not in cache:
                futures[node_id] = pool.submit(fetch, node_id)
                network_requests += 1
        for node_id, future in futures.items():
            cache[node_id] = future.result()

        next_frontier = []
        level_names = []
        for node_id in batch:
            item = cache[node_id]
            inspected.append(node_id)
            if node_id in futures:
                total_bytes += item.get("bytes", 0)
                network_latency.append(item["latency"])
            if item["status"] != 200 or item["missing_names"]:
                errors.append({
                    "id": node_id,
                    "status": item["status"],
                    "missing_names": item.get("missing_names", []),
                })
                continue
            names[node_id] = item["name"]
            names.update(item["nodes"])
            level_names.append(item["name"])
            for edge in item["direct_edges"]:
                if edge.get("edge_type") != "proof":
                    continue
                child = edge["dep_id"]
                if child not in parent:
                    parent[child] = node_id
                    distance[child] = distance[node_id] + 1
                    next_frontier.append(child)
        levels.append({
            "distance": len(levels),
            "nodes_fetched": len(batch),
            "proof_children_discovered": len(next_frontier),
            "sample_fetched_names": level_names[:10],
        })
        frontier = deferred + next_frontier
        print(
            f"  level {len(levels)-1}: fetched {len(batch)}, "
            f"new {len(next_frontier)}, pending {len(frontier)}",
            flush=True,
        )
        if deferred:
            stop_reason = "node_budget"
            break

    if errors and stop_reason == "complete":
        stop_reason = "errors"
    hits = [
        {"target": names[node_id], "distance": distance[node_id],
         "path": path_to(node_id, parent, names)}
        for node_id in parent
        if node_id != root_id and names.get(node_id) in TARGET_NAMES
    ]
    hits.sort(key=lambda hit: (hit["distance"], hit["target"]))
    return {
        "root_id": root_id,
        "root_name": names.get(root_id),
        "stop_reason": stop_reason,
        "elapsed_seconds": round(time.monotonic() - started, 3),
        "network_requests": network_requests,
        "network_response_bytes": total_bytes,
        "median_request_seconds": (
            sorted(network_latency)[len(network_latency) // 2]
            if network_latency else None
        ),
        "fetched_nodes": len(inspected),
        "discovered_nodes": len(parent),
        "pending_nodes": len(frontier),
        "levels": levels,
        "errors": errors,
        "hits": hits,
        "direct_edges": (
            collections.Counter(
                edge["edge_type"] for edge in cache[root_id]["direct_edges"]
            ) if cache.get(root_id, {}).get("status") == 200 else {}
        ),
        "root_body_present": cache.get(root_id, {}).get("body_present"),
    }


def main():
    cache = {}
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for name, node_id in ROOTS.items():
            print(name, flush=True)
            result = traverse(node_id, cache, pool)
            results.append(result)
            print(
                f"  {result['stop_reason']}: {result['fetched_nodes']} fetched, "
                f"{result['discovered_nodes']} discovered, "
                f"{result['network_requests']} requests",
                flush=True,
            )
    data = {
        "source": BASE,
        "date": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "parameters": {
            "max_nodes_per_root": MAX_NODES_PER_ROOT,
            "max_seconds_per_root": MAX_SECONDS_PER_ROOT,
            "workers": WORKERS,
        },
        "results": results,
    }
    (OUT / "probe-results.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    )
    for name in ("Nat.add_comm", "Classical.em"):
        node_id = ROOTS[name]
        (OUT / f"fixture-{name}.json").write_text(
            json.dumps(cache[node_id], ensure_ascii=False, indent=2) + "\n"
        )


if __name__ == "__main__":
    main()
