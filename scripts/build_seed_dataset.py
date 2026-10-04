"""Collect text-distinct proof candidates from pinned Hugging Face revisions.

Requires: pip install pyarrow requests
Run: python scripts/build_seed_dataset.py [--only proofrank|proofwiki|nemotron|formal|all]
"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import re
import shutil
import sqlite3
import sys

import pyarrow.parquet as pq
import requests
from huggingface_hub import hf_hub_download


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "oulipoof"
STAGE = OUT / ".staging"
SOURCES = {
    "proofrank": ("INSAIT-Institute/ProofRank", "9a6ec576e2de7929d9b72cc7964eccf6577adb35"),
    "proofwiki": ("avewright/proofwiki-math", "7d49431dd99f83236cc9c34ae9ec907581164c7f"),
    "nemotron": ("nvidia/Nemotron-Math-Proofs-v2", "7665d7f1d006fd89aa852a9dab8060c60b63f814"),
    "formal": ("iiis-lean/NuminaMath-LEAN-Proof-Artifacts", "43f4ea4da40c48be8e89edb84cb0825d8a4dfe2d"),
}
METHOD_SOURCES = {
    "proofrank_outputs": ("Anon539823983/ProofRank-outputs", "fde7394473180d6c88404788f626359def74f654"),
}
ALL_SOURCES = {**SOURCES, **METHOD_SOURCES}
LICENSES = {"proofrank": None, "proofwiki": "CC BY-SA 3.0", "nemotron": "CC BY 4.0", "formal": "Apache-2.0; consult upstream AI-MO/NuminaMath-LEAN"}
SESSION = requests.Session()


def norm_text(value):
    return re.sub(r"\s+", " ", value or "").strip()


def norm_lean(value):
    # Lean is layout sensitive: only standardize line endings and outer whitespace.
    return (value or "").replace("\r\n", "\n").replace("\r", "\n").strip()


def digest(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def json_line(handle, row):
    handle.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")


def source_files(key):
    repo, revision = ALL_SOURCES[key]
    url = f"https://huggingface.co/api/datasets/{repo}/tree/{revision}"
    response = SESSION.get(url, params={"recursive": "true", "expand": "true"}, timeout=60)
    response.raise_for_status()
    return {item["path"]: item for item in response.json() if item["type"] == "file"}


def downloaded_file(key, path, expected):
    repo, revision = ALL_SOURCES[key]
    final = Path(hf_hub_download(
        repo_id=repo, repo_type="dataset", revision=revision, filename=path,
        local_dir=STAGE / "hf" / key,
    ))
    if final.stat().st_size != expected["size"]:
        raise ValueError(f"Input size mismatch for {key}/{path}")
    hasher = hashlib.sha256()
    with final.open("rb") as handle:
        for chunk in iter(lambda: handle.read(4 * 1024 * 1024), b""):
            hasher.update(chunk)
    if hasher.hexdigest() != expected["lfs"]["oid"]:
        raise ValueError(f"Input hash mismatch for {key}/{path}")
    return final


def parquet_rows(key, path, expected):
    reader = pq.ParquetFile(downloaded_file(key, path, expected))
    for batch in reader.iter_batches(batch_size=128):
        yield from batch.to_pylist()


def source_manifest(key, files):
    repo, revision = ALL_SOURCES[key]
    return {
        "repository": repo,
        "revision": revision,
        "license": LICENSES.get(key, "CC BY-NC-SA 4.0"),
        "inputs": [{"path": p, "size": files[p]["size"], "sha256": files[p]["lfs"]["oid"]} for p in sorted(files)],
    }


def proofrank_method_clusters():
    path = "clustering_raw/train-00000-of-00001.parquet"
    files = source_files("proofrank_outputs")
    manifest = source_manifest("proofrank_outputs", {path: files[path]})
    clusters = {}
    for row in parquet_rows("proofrank_outputs", path, files[path]):
        if row["project"] != "summary_diversity_clustering" or row["model_id"] != "human/human":
            continue
        try:
            output = json.loads(row["outputs"])
            if isinstance(output, str):
                output = json.loads(output)
        except (TypeError, ValueError):
            continue
        clusters[row["problem_id"]] = output
    return clusters, manifest


def add_proofrank_methods(row, clusters):
    output = clusters.get(row["source_id"])
    n = len(row["proofs"])
    status = "output_unavailable"
    if output:
        members = sorted(member for cluster in output.get("clusters", []) for member in cluster.get("members", []))
        fingerprints = sorted(fp.get("proof_id") for fp in output.get("proof_fingerprints", []))
        if output.get("N") != n:
            status = "summary_count_mismatch"
        elif members != list(range(1, n + 1)) or fingerprints != list(range(1, n + 1)):
            status = "cluster_mapping_mismatch"
        else:
            status = "matched"
            cluster_by_member = {member: cluster for cluster in output["clusters"] for member in cluster["members"]}
            fingerprint_by_id = {fp["proof_id"]: fp for fp in output["proof_fingerprints"]}
            for index, proof in enumerate(row["proofs"], 1):
                cluster = cluster_by_member[index]
                fingerprint = fingerprint_by_id[index]
                proof["technique"] = cluster["cluster_name"]
                proof["method_cluster"] = {
                    "id": cluster["cluster_id"],
                    "name": cluster["cluster_name"],
                    "defining_approach": cluster["defining_approach"],
                }
                proof["method_fingerprint"] = {
                    "primary_approach": fingerprint.get("primary_approach"),
                    "secondary_techniques": fingerprint.get("secondary_techniques", []),
                }
    row["source_metadata"]["method_clustering"] = {
        "status": status,
        "cluster_count": output.get("K") if status == "matched" else None,
        "judge": "GPT-OSS-120B" if status == "matched" else None,
        "artifact": "ProofRank-outputs/clustering_raw",
    }
    return status


def build_proofrank():
    files = source_files("proofrank")
    path = "data/main-00000-of-00001.parquet"
    manifest = source_manifest("proofrank", {path: files[path]})
    clusters, cluster_manifest = proofrank_method_clusters()
    method_counts = Counter()
    count = 0
    output = STAGE / "proofrank.jsonl"
    with output.open("w", encoding="utf-8") as handle:
        for row in parquet_rows("proofrank", path, files[path]):
            if row["in_diversity_eval"] is not True:
                continue
            source_id = row["problem_id"]
            proofs = []
            for index, summary in enumerate(row["human_solution_summaries"] or []):
                if not norm_text(summary):
                    continue
                proofs.append({
                    "proof_id": f"proofrank:{source_id}:summary:{index}",
                    "text": summary,
                    "content_type": "proof_summary",
                    "origin": "unknown",
                    "source_solution_origin": "human",
                    "generator": None,
                    "technique": None,
                    "validation_status": None,
                    "selection_status": "selected_for_proofrank_diversity",
                    "source_url": None,
                    "source_metadata": {"summary_index": index},
                })
            if not proofs:
                raise ValueError(f"Selected ProofRank row {source_id} has no summaries")
            result = {
                "id": f"proofrank:{source_id}", "statement": row["problem"],
                "dataset": "ProofRank", "source_id": source_id, "source_url": None,
                "answer": row["gold_answer"], "categories": [], "level": None,
                "proofs": proofs, "n_proofs": len(proofs),
                "source_metadata": {"in_diversity_eval": True, "license": None},
            }
            method_counts[add_proofrank_methods(result, clusters)] += 1
            json_line(handle, result)
            count += 1
    assert count == 119, f"ProofRank diversity count changed: {count}"
    manifest["rows"] = count
    manifest["method_clustering"] = {"source": cluster_manifest, "counts": dict(method_counts)}
    print(f"ProofRank diversity problems: {count}", flush=True)
    return manifest


def build_proofwiki():
    files = source_files("proofwiki")
    path = "data/train-00000-of-00001.parquet"
    manifest = source_manifest("proofwiki", {path: files[path]})
    groups = defaultdict(list)
    for row in parquet_rows("proofwiki", path, files[path]):
        if row.get("theorem_url") and norm_text(row.get("solution")):
            groups[row["theorem_url"]].append(row)
    counts = Counter()
    output = STAGE / "proofwiki.jsonl"
    with output.open("w", encoding="utf-8") as handle:
        for theorem_url in sorted(groups):
            rows = groups[theorem_url]
            by_text = {}
            for row in rows:
                key = norm_text(row["solution"])
                by_text.setdefault(key, []).append(row)
            if len(by_text) < 2:
                continue
            first = rows[0]
            proofs = []
            for duplicates in by_text.values():
                representative = duplicates[0]
                proofs.append({
                    "proof_id": f"proofwiki:{representative['id']}",
                    "text": representative["solution"], "content_type": "full_proof",
                    "origin": "community_source", "source_solution_origin": "community_source",
                    "generator": None, "technique": None, "validation_status": None,
                    "publication_status": "proofwiki_published",
                    "source_url": representative["proof_url"],
                    "source_metadata": {"source_records": [
                        {"id": r["id"], "proof_url": r["proof_url"], "proof_title": r["proof_title"],
                         "solution_wikitext": r["solution_wikitext"], "proof_references": r["proof_references"]}
                        for r in duplicates]},
                })
            variants = list(dict.fromkeys(row["problem"] for row in rows))
            categories = sorted({cat for row in rows for cat in (row["categories"] or [])})
            json_line(handle, {
                "id": f"proofwiki:{digest(theorem_url)}", "statement": first["problem"],
                "dataset": "proofwiki-math", "source_id": theorem_url, "source_url": theorem_url,
                "answer": None, "categories": categories, "level": None,
                "proofs": proofs, "n_proofs": len(proofs),
                "source_metadata": {
                    "title": first["title"], "title_variants": list(dict.fromkeys(r["title"] for r in rows)),
                    "statement_variants": variants,
                    "problem_wikitext_variants": list(dict.fromkeys(r["problem_wikitext"] for r in rows)),
                    "theorem_references": list(dict.fromkeys(ref for r in rows for ref in (r["theorem_references"] or []))),
                    "source_rows": len(rows), "license": LICENSES["proofwiki"],
                },
            })
            counts[len(proofs)] += 1
    manifest["rows"] = sum(counts.values())
    manifest["proof_count_distribution"] = distribution(counts)
    print(f"ProofWiki multi-proof theorems: {manifest['rows']}", flush=True)
    print(f"ProofWiki proof-count distribution: {manifest['proof_count_distribution']}", flush=True)
    return manifest


def final_assistant_text(messages):
    for message in reversed(messages or []):
        if message.get("role") == "assistant":
            content = message.get("content")
            if isinstance(content, str) and content.strip():
                return content.strip()
    return None


def build_nemotron():
    files = source_files("nemotron")
    path = "data/train.jsonl"
    manifest = source_manifest("nemotron", {path: files[path]})
    db_path = STAGE / "nemotron.sqlite"
    db_path.unlink(missing_ok=True)
    db = sqlite3.connect(db_path)
    db.execute("CREATE TABLE candidates (group_key TEXT, uuid TEXT PRIMARY KEY, statement TEXT, proof TEXT, metadata TEXT)")
    response_count = 0
    kept_count = 0
    try:
        with downloaded_file("nemotron", path, files[path]).open("rb") as source:
            for raw in source:
                if not raw:
                    continue
                response_count += 1
                if response_count % 10000 == 0:
                    print(f"Nemotron scanned {response_count} rows", file=sys.stderr, flush=True)
                row = json.loads(raw)
                if row.get("subset") != "proof":
                    continue
                proof = final_assistant_text(row.get("messages"))
                statement = row.get("problem") or ""
                if not proof or not norm_text(statement):
                    continue
                metadata = {k: row.get(k) for k in ("source", "dataset", "license", "metadata", "tools", "used_in")}
                db.execute("INSERT INTO candidates VALUES (?,?,?,?,?)", (digest(norm_text(statement)), row["uuid"], statement, proof, json.dumps(metadata, ensure_ascii=False)))
                kept_count += 1
                if kept_count % 1000 == 0:
                    db.commit()
        db.commit()
        db.execute("CREATE INDEX candidates_group ON candidates(group_key, uuid)")
        counts = Counter()
        output = STAGE / "nemotron.jsonl"
        with output.open("w", encoding="utf-8") as handle:
            keys = db.execute("SELECT group_key, MIN(statement), COUNT(*) FROM candidates GROUP BY group_key ORDER BY group_key")
            for group_key, statement, raw_count in keys:
                seen = set()
                proofs = []
                for uuid, text, metadata in db.execute("SELECT uuid,proof,metadata FROM candidates WHERE group_key=? ORDER BY uuid", (group_key,)):
                    norm = norm_text(text)
                    if norm in seen:
                        continue
                    seen.add(norm)
                    proofs.append({
                        "proof_id": f"nemotron:{uuid}", "text": text, "content_type": "full_proof",
                        "origin": "synthetic", "source_solution_origin": "synthetic",
                        "generator": "DeepSeek-V4-Pro", "technique": None,
                        "validation_status": None, "source_url": None,
                        "source_metadata": json.loads(metadata),
                    })
                if len(proofs) < 2:
                    continue
                json_line(handle, {
                    "id": f"nemotron:{group_key}", "statement": statement,
                    "dataset": "Nemotron-Math-Proofs-v2", "source_id": group_key,
                    "source_url": None, "answer": None, "categories": [], "level": None,
                    "proofs": proofs, "n_proofs": len(proofs),
                    "source_metadata": {"source_rows": raw_count, "license": LICENSES["nemotron"]},
                })
                counts[len(proofs)] += 1
        manifest["source_rows_scanned"] = response_count
        manifest["proof_candidates_scanned"] = kept_count
        manifest["rows"] = sum(counts.values())
        manifest["proof_count_distribution"] = distribution(counts)
        print(f"Nemotron multi-proof problems: {manifest['rows']}", flush=True)
        print(f"Nemotron proof-count distribution: {manifest['proof_count_distribution']}", flush=True)
        return manifest
    finally:
        db.close()
        db_path.unlink(missing_ok=True)


def distribution(counts):
    return {f"ge_{n}": sum(v for k, v in counts.items() if k >= n) for n in (2, 3, 5, 10)} | {"max": max(counts, default=0)}


def build_formal():
    files = source_files("formal")
    shards = {path: meta for path, meta in files.items() if path.startswith("data/full/shards/") and path.endswith(".parquet")}
    if not shards:
        raise ValueError("No full NuminaMath parquet shards")
    manifest = source_manifest("formal", shards)
    counts = Counter()
    for path in sorted(shards):
        stem = Path(path).stem
        shard_output = STAGE / f"{stem}.jsonl"
        shard_counts = STAGE / f"{stem}.counts.json"
        if shard_output.exists() and shard_counts.exists():
            counts.update(json.loads(shard_counts.read_text()))
            continue
        print(f"Formal shard: {path}", file=sys.stderr, flush=True)
        this_counts = Counter()
        partial = STAGE / f"{stem}.jsonl.partial"
        with partial.open("w", encoding="utf-8") as handle:
            for row in parquet_rows("formal", path, shards[path]):
                this_counts["scanned"] += 1
                if not (row["human_proof_available"] is True and row["prover_proof_available"] is True):
                    continue
                if row["human_validation_status"] != "valid" or row["prover_validation_status"] != "valid":
                    continue
                this_counts["both_valid"] += 1
                human = row["human_formal_proof"] or ""
                prover = row["prover_formal_proof"] or ""
                if not norm_lean(human) or not norm_lean(prover):
                    this_counts["empty_code"] += 1
                    continue
                both_split = row["human_main_theorem_split_valid"] is True and row["prover_main_theorem_split_valid"] is True
                if both_split:
                    h_compare = norm_lean(row["human_main_theorem_proof_code"])
                    p_compare = norm_lean(row["prover_main_theorem_proof_code"])
                    if not h_compare or not p_compare:
                        both_split = False
                if not both_split:
                    h_compare, p_compare = norm_lean(human), norm_lean(prover)
                    this_counts["full_code_comparison"] += 1
                if h_compare == p_compare:
                    this_counts["identical_code"] += 1
                    continue
                def track(prefix, code):
                    return {
                        "code": code, "main_theorem_proof_code": row[f"{prefix}_main_theorem_proof_code"],
                        "main_theorem_split_valid": row[f"{prefix}_main_theorem_split_valid"],
                        "origin": "human" if prefix == "human" else "synthetic",
                        "validation_status": "valid",
                    }
                json_line(handle, {
                    "id": f"numina:{row['uuid']}", "source_id": row["uuid"],
                    "problem": row["problem"], "formal_statement": row["formal_statement"],
                    "source": row["source"], "question_type": row["question_type"], "answer": row["answer"],
                    "statement_origin": row["statement_source"],
                    "human_proof": track("human", human), "prover_proof": track("prover", prover),
                    "lean_version": "4.15.0", "dataset": "NuminaMath-LEAN-Proof-Artifacts",
                    "source_metadata": {
                        "original_index": row["original_index"],
                        "human_ground_truth_type": row["human_ground_truth_type"],
                        "proof_source": row["proof_source"], "license": LICENSES["formal"],
                        "comparison_scope": "main_theorem_proof_code" if both_split else "full_code",
                    },
                })
                this_counts["rows"] += 1
        partial.replace(shard_output)
        shard_counts.write_text(json.dumps(this_counts) + "\n", encoding="utf-8")
        counts.update(this_counts)
    final = STAGE / "formal.jsonl.partial"
    with final.open("wb") as output:
        for path in sorted(shards):
            with (STAGE / f"{Path(path).stem}.jsonl").open("rb") as source:
                shutil.copyfileobj(source, output)
    final.replace(STAGE / "formal.jsonl")
    manifest["counts"] = dict(counts)
    manifest["rows"] = counts["rows"]
    print(f"Numina valid human/prover pairs: {counts['rows']}", flush=True)
    print(f"Numina filtering: {dict(counts)}", flush=True)
    return manifest


def assemble(manifests):
    required = [STAGE / f"{key}.jsonl" for key in ("proofrank", "proofwiki", "nemotron")]
    if not all(path.exists() for path in required):
        return
    target = OUT / "informal.jsonl.partial"
    with target.open("wb") as output:
        for source in required:
            with source.open("rb") as handle:
                shutil.copyfileobj(handle, output)
    target.replace(OUT / "informal.jsonl")
    if (STAGE / "formal.jsonl").exists():
        shutil.copyfile(STAGE / "formal.jsonl", OUT / "formal.jsonl.partial")
        (OUT / "formal.jsonl.partial").replace(OUT / "formal.jsonl")
    if all(key in manifests for key in SOURCES):
        manifests["schema_version"] = 2
        manifests["definition"] = "Text-distinct proof candidates; ProofRank method clusters are source LLM judgments where aligned"
        def file_info(path):
            hasher = hashlib.sha256()
            with path.open("rb") as handle:
                for chunk in iter(lambda: handle.read(4 * 1024 * 1024), b""):
                    hasher.update(chunk)
            return {"bytes": path.stat().st_size, "sha256": hasher.hexdigest()}
        manifests["outputs"] = {
            "informal.jsonl": file_info(OUT / "informal.jsonl"),
            "formal.jsonl": file_info(OUT / "formal.jsonl"),
        }
        manifest_path = OUT / "manifest.json.partial"
        manifest_path.write_text(json.dumps(manifests, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        manifest_path.replace(OUT / "manifest.json")
        print(f"Total informal rows: {sum(manifests[k]['rows'] for k in ('proofrank','proofwiki','nemotron'))}", flush=True)


def enrich_existing_proofrank():
    clusters, cluster_manifest = proofrank_method_clusters()
    counts = Counter()
    target = OUT / "informal.jsonl"
    partial = OUT / "informal.jsonl.partial"
    with target.open("rb") as source, partial.open("wb") as output:
        for line in source:
            if line.startswith(b'{"id":"proofrank:'):
                row = json.loads(line)
                counts[add_proofrank_methods(row, clusters)] += 1
                output.write((json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8"))
            else:
                output.write(line)
    assert sum(counts.values()) == 119, f"Expected 119 ProofRank rows, found {sum(counts.values())}"
    partial.replace(target)
    manifest_path = OUT / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    manifest["schema_version"] = 2
    manifest["definition"] = "Text-distinct proof candidates; ProofRank method clusters are source LLM judgments where aligned"
    manifest["proofrank"]["method_clustering"] = {"source": cluster_manifest, "counts": dict(counts)}
    hasher = hashlib.sha256()
    with target.open("rb") as handle:
        for chunk in iter(lambda: handle.read(4 * 1024 * 1024), b""):
            hasher.update(chunk)
    manifest["outputs"]["informal.jsonl"] = {"bytes": target.stat().st_size, "sha256": hasher.hexdigest()}
    temporary = manifest_path.with_suffix(".json.partial")
    temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(manifest_path)
    print(f"ProofRank method clustering: {dict(counts)}", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", choices=[*SOURCES, "all", "assemble", "enrich-proofrank"], default="all")
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    if args.only == "enrich-proofrank":
        enrich_existing_proofrank()
        return
    STAGE.mkdir(parents=True, exist_ok=True)
    manifest_file = STAGE / "sources.json"
    manifests = json.loads(manifest_file.read_text()) if manifest_file.exists() else {}
    builders = {"proofrank": build_proofrank, "proofwiki": build_proofwiki, "nemotron": build_nemotron, "formal": build_formal}
    for key in builders:
        if args.only not in ("all", key):
            continue
        manifests[key] = builders[key]()
        (STAGE / f"{key}.manifest.json").write_text(json.dumps(manifests[key], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        manifest_file.write_text(json.dumps(manifests, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for key in SOURCES:
        per_source = STAGE / f"{key}.manifest.json"
        if per_source.exists():
            manifests[key] = json.loads(per_source.read_text())
    assemble(manifests)


if __name__ == "__main__":
    main()
