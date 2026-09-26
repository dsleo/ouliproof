"""Compare proof-only reachability with proof+definition-body reachability."""

from __future__ import annotations

import collections
import concurrent.futures
import json
import time

from probe_theoremgraph import OUT, ROOTS, WORKERS, fetch


ROOT_NAMES = ("Classical.em", "Nat.add_comm", "Nat.add_eq_zero")
MAX_FETCHED = 120
TARGET = "Classical.choice"


def run(root_name: str, pool, cache: dict):
    root_id = ROOTS[root_name]
    frontier = [root_id]
    parent = {root_id: None}
    via = {}
    names = {}
    fetched = 0
    requests = 0
    started = time.monotonic()
    errors = []
    stop_reason = "complete"

    while frontier:
        remaining = MAX_FETCHED - fetched
        if remaining <= 0:
            stop_reason = "node_budget"
            break
        batch = frontier[:remaining]
        deferred = frontier[remaining:]
        futures = {}
        for node_id in batch:
            if node_id not in cache:
                futures[node_id] = pool.submit(fetch, node_id)
                requests += 1
        for node_id, future in futures.items():
            cache[node_id] = future.result()
        next_frontier = []
        for node_id in batch:
            fetched += 1
            item = cache[node_id]
            if item["status"] != 200 or item.get("missing_names"):
                errors.append({"id": node_id, "status": item["status"]})
                continue
            names[node_id] = item["name"]
            names.update(item["nodes"])
            for edge in item["direct_edges"]:
                if edge["edge_type"] not in ("proof", "def"):
                    continue
                child = edge["dep_id"]
                if child not in parent:
                    parent[child] = node_id
                    via[child] = edge["edge_type"]
                    next_frontier.append(child)
        frontier = deferred + next_frontier
        print(root_name, "fetched", fetched, "pending", len(frontier), flush=True)
        if deferred:
            stop_reason = "node_budget"
            break

    target_paths = []
    for node_id in parent:
        if names.get(node_id) != TARGET:
            continue
        path = []
        cursor = node_id
        while cursor is not None:
            path.append({"name": names.get(cursor), "id": cursor,
                         "via_edge": via.get(cursor)})
            cursor = parent[cursor]
        target_paths.append(list(reversed(path)))
    if errors and stop_reason == "complete":
        stop_reason = "errors"
    return {
        "root": root_name,
        "fetched": fetched,
        "discovered": len(parent),
        "pending": len(frontier),
        "network_requests": requests,
        "elapsed_seconds": round(time.monotonic() - started, 3),
        "stop_reason": stop_reason,
        "errors": errors,
        "paths_to_choice": target_paths,
    }


def main():
    cache = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
        results = [run(name, pool, cache) for name in ROOT_NAMES]
    (OUT / "body-edge-results.json").write_text(
        json.dumps({"followed_edges": ["proof", "def"], "max_fetched": MAX_FETCHED,
                    "results": results}, ensure_ascii=False, indent=2) + "\n"
    )


if __name__ == "__main__":
    main()
