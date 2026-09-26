"""Check representative TheoremGraph paths through a deployed Vercel rewrite.

Usage: python3 check_live.py https://your-deployment.vercel.app
"""

import json
import sys
import time
from urllib.request import urlopen

BASE = sys.argv[1].rstrip("/")
PATHS = {
    "Classical.em to Classical.choice": [
        ("46f9bdf2-6f17-43d0-9009-8485b2479ea2", "Classical.em"),
        ("24429694-bfba-471f-8323-65376ba97978", "Classical.choose_spec", "proof"),
        ("900586fb-f641-490a-88d5-e93467529e57", "Classical.indefiniteDescription", "proof"),
        ("7b185410-dd7e-483a-b914-98d71aa2e23b", "Classical.choice", "def"),
    ],
    "Nat.add_eq_zero to Classical.choice": [
        ("66b1e8d2-0ca6-4d33-bea6-e1463dc26ff8", "Nat.add_eq_zero"),
        ("062941d4-a580-486a-91b3-6bae7498558e", "Classical.propDecidable", "proof"),
        ("7b185410-dd7e-483a-b914-98d71aa2e23b", "Classical.choice", "def"),
    ],
    "Nat.add_comm to Nat.zero_add": [
        ("5546ccb4-5beb-4176-807a-cc42f622aa33", "Nat.add_comm"),
        ("23cea27e-8254-4e41-96dd-57f732be6402", "Nat.zero_add", "proof"),
    ],
}

cache = {}
checks = []
for label, path in PATHS.items():
    for source, target in zip(path, path[1:]):
        source_id, source_name = source[:2]
        target_id, target_name, edge_type = target
        if source_id not in cache:
            url = f"{BASE}/tg/graph/statement/{source_id}?direction=src&formality=formal"
            start = time.monotonic()
            with urlopen(url, timeout=30) as response:
                data = json.load(response)
                status = response.status
            cache[source_id] = (status, data, round(time.monotonic() - start, 3))
        status, data, latency = cache[source_id]
        nodes = {item["statement_id"]: item.get("name") for item in data["nodes"]}
        found = any(
            edge.get("src_id") == source_id
            and edge.get("dep_id") == target_id
            and edge.get("edge_type") == edge_type
            for edge in data["edges"]
        )
        checks.append({
            "path": label,
            "edge": f"{source_name} --{edge_type}--> {target_name}",
            "ok": status == 200 and data["root"]["name"] == source_name
            and nodes.get(target_id) == target_name and found,
            "seconds": latency,
        })

print(json.dumps({"base": BASE, "requests": len(cache), "checks": checks}, indent=2))
if not all(check["ok"] for check in checks):
    sys.exit(1)
