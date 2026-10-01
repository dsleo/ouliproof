#!/usr/bin/env python3
"""Spot-check recorded tactic tokens against pinned, public Mathlib source.

This checks a declaration-local text window, not the Lean elaborator's tactic
trace. It deliberately reports ambiguous or absent windows instead of calling
them source mismatches.
"""
import datetime
import json
import pathlib
import re
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
INDEX = json.loads((ROOT / "public/method-markers.json").read_text())
COMMIT = INDEX["mathlibCommit"]
MARKERS = INDEX["markers"]
MAIN = {
    "induction": {"induction", "induction'", "fun_induction"},
    "cases": {"cases", "cases'", "by_cases", "by_cases'"},
    "absurd": {"by_contra", "by_contra!", "contradiction"},
}
cache = {}


def source_for(module):
    if module in cache:
        return cache[module]
    url = f"https://raw.githubusercontent.com/leanprover-community/mathlib4/{COMMIT}/{module.replace('.', '/')}.lean"
    try:
        with urllib.request.urlopen(url, timeout=15) as response:
            cache[module] = response.read().decode("utf-8")
    except (urllib.error.URLError, UnicodeDecodeError):
        cache[module] = ""
    return cache[module]


def check(name, marker, category):
    module = marker["module"]
    source = source_for(module)
    if not source:
        return None
    short = re.escape(name.rsplit(".", 1)[-1])
    declaration = re.compile(rf"(?m)^(?:protected\s+|private\s+|nonrec\s+)*(?:theorem|lemma)\s+{short}(?![\w'])")
    matches = list(declaration.finditer(source))
    if len(matches) != 1:
        return None
    start = matches[0].start()
    line = source.count("\n", 0, start) + 1
    next_declaration = re.search(r"(?m)^(?:(?:protected|private|nonrec|noncomputable)\s+)*(?:theorem|lemma|def|instance|example|abbrev|structure|class)\b", source[matches[0].end():])
    end = matches[0].end() + next_declaration.start() if next_declaration else len(source)
    excerpt = source[start:end]
    token = next((token for token in marker["matches"][category] if token in MAIN[category] and re.search(rf"\b{re.escape(token)}\b", excerpt)), None)
    if not token:
        return None
    return {"name": name, "module": module, "line": line, "token": token,
            "sourceUrl": f"https://github.com/leanprover-community/mathlib4/blob/{COMMIT}/{module.replace('.', '/')}.lean#L{line}"}


def main():
    samples = {}
    attempts = {}
    for category in MAIN:
        samples[category] = []
        attempts[category] = 0
        for name, marker in MARKERS.items():
            if len(samples[category]) >= 10 or attempts[category] >= 250:
                break
            tokens = marker["matches"].get(category, [])
            if marker["kind"] != "theorem" or not marker["module"] or not MAIN[category].intersection(tokens):
                continue
            attempts[category] += 1
            record = check(name, marker, category)
            if record:
                samples[category].append(record)
    result = {"checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
              "mathlibCommit": COMMIT, "method": "source text from declaration header to next top-level declaration; token text only",
              "attemptedRows": attempts, "sampleMatches": samples}
    target = ROOT / "feasibility/method-source-sample.json"
    target.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"attemptedRows": attempts, "sampleMatches": {key: len(value) for key, value in samples.items()}, "sourceModules": len(cache)}, indent=2))


if __name__ == "__main__":
    main()
