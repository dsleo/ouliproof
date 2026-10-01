#!/usr/bin/env python3
"""Check name/kind overlap, and expose fields missing for a proof-version join."""
import concurrent.futures
import datetime
import json
import pathlib
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
SAMPLE = json.loads((ROOT / "feasibility/method-source-sample.json").read_text())["sampleMatches"]
INDEX = json.loads((ROOT / "public/method-markers.json").read_text())["markers"]
URL = "https://api.theoremsearch.com"


def get_json(path):
    with urllib.request.urlopen(URL + path, timeout=30) as response:
        return json.load(response)


def check(category, row):
    name = row["name"]
    query = urllib.parse.urlencode({"query": name, "n_results": 24, "formality": "formal"})
    try:
        result = get_json("/graph/embedding?" + query)
        candidate = next((item for item in result.get("results", []) if item.get("name") == name and str(item.get("external_id", "")).startswith("Mathlib")), None)
        if not candidate:
            return {"category": category, "name": name, "status": "not_in_first_24_search_results"}
        identifier = candidate["statement_id"]
        detail = get_json(f"/graph/statement/{identifier}?direction=src&formality=formal")["root"]
        graph = detail.get("statement", {})
        canonical = lambda value: {"thm": "theorem", "lemma": "theorem", "def": "definition"}.get(value, value)
        return {"category": category, "name": name, "status": "exact_name_found" if detail.get("name") == name else "name_conflict",
                "id": identifier, "graphSourceLabel": graph.get("paper_external_id"), "graphKind": graph.get("kind"),
                "indexKind": INDEX[name]["kind"], "kindMatch": canonical(graph.get("kind")) == canonical(INDEX[name]["kind"]),
                "graphHasBody": bool(graph.get("body")), "graphHasModule": "module" in graph,
                "graphHasMathlibCommit": any("commit" in key.lower() or "revision" in key.lower() for key in graph),
                "mathlibSourceUrl": row["sourceUrl"]}
    except Exception as error:
        return {"category": category, "name": name, "status": "api_error", "error": str(error)}


def main():
    jobs = [(category, row) for category, rows in SAMPLE.items() for row in rows]
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda pair: check(*pair), jobs))
    output = {"checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "source": URL,
              "sampleSize": len(jobs), "results": results}
    (ROOT / "feasibility/method-cross-source-sample.json").write_text(json.dumps(output, indent=2) + "\n")
    counts = {status: sum(item["status"] == status for item in results) for status in sorted({item["status"] for item in results})}
    print(json.dumps({"statuses": counts, "exactNameAndKind": sum(item.get("kindMatch", False) for item in results)}, indent=2))


if __name__ == "__main__":
    main()
