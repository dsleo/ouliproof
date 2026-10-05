"""Local HTTP API for the Oulipoof seed collection.

Run from the repository root: python3 scripts/serve_seed_dataset.py
The Vite app proxies /seed-api to this server and serves the UI at /dataset.
"""

from __future__ import annotations

import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import sqlite3
from urllib.parse import parse_qs, urlsplit


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "oulipoof"
INDEX = DATA / ".seed-index.sqlite"
FEATURED = DATA / "featured-results.json"
PAGE_SIZE = 1
INDEX_VERSION = 2


def source_signature():
    return {name: {"size": (DATA / name).stat().st_size, "mtime_ns": (DATA / name).stat().st_mtime_ns}
            for name in ("informal.jsonl", "formal.jsonl")}


def index_current():
    if not INDEX.exists():
        return False
    try:
        with sqlite3.connect(INDEX) as db:
            record = db.execute("SELECT value FROM meta WHERE key='source_signature'").fetchone()
            version = db.execute("SELECT value FROM meta WHERE key='index_version'").fetchone()
        return bool(record and version and int(version[0]) == INDEX_VERSION and json.loads(record[0]) == source_signature())
    except (sqlite3.DatabaseError, OSError, ValueError):
        return False


def build_index():
    if index_current():
        return
    temp = INDEX.with_suffix(".sqlite.partial")
    temp.unlink(missing_ok=True)
    db = sqlite3.connect(temp)
    try:
        db.executescript("""
            PRAGMA journal_mode=OFF;
            PRAGMA synchronous=OFF;
            CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE items (
                id TEXT PRIMARY KEY, kind TEXT NOT NULL, dataset TEXT NOT NULL,
                title TEXT, statement TEXT NOT NULL, source_id TEXT,
                n_proofs INTEGER NOT NULL, file TEXT NOT NULL,
                byte_offset INTEGER NOT NULL, byte_length INTEGER NOT NULL
            );
            CREATE VIRTUAL TABLE item_search USING fts5(statement, title, source_id, formal_statement);
            CREATE INDEX items_filters ON items(kind, dataset);
        """)
        for name, kind in (("informal.jsonl", "informal"), ("formal.jsonl", "formal")):
            count = 0
            with (DATA / name).open("rb") as source:
                while True:
                    offset = source.tell()
                    line = source.readline()
                    if not line:
                        break
                    row = json.loads(line)
                    title = row.get("source_metadata", {}).get("title") if kind == "informal" else None
                    statement = row["statement"] if kind == "informal" else row["problem"]
                    n_proofs = row["n_proofs"] if kind == "informal" else 2
                    cursor = db.execute(
                        "INSERT INTO items VALUES (?,?,?,?,?,?,?,?,?,?)",
                        (row["id"], kind, row["dataset"], title, statement, row.get("source_id"), n_proofs, name, offset, len(line)),
                    )
                    db.execute("INSERT INTO item_search(rowid,statement,title,source_id,formal_statement) VALUES (?,?,?,?,?)",
                               (cursor.lastrowid, statement, title or "", row.get("source_id") or "", row.get("formal_statement") or ""))
                    count += 1
                    if count % 1000 == 0:
                        print(f"Indexed {count} {kind} rows", flush=True)
            print(f"Indexed {count} {kind} rows", flush=True)
        db.execute("INSERT INTO meta VALUES (?,?)", ("source_signature", json.dumps(source_signature(), sort_keys=True)))
        db.execute("INSERT INTO meta VALUES (?,?)", ("index_version", str(INDEX_VERSION)))
        db.commit()
    finally:
        db.close()
    temp.replace(INDEX)


def search_query(value):
    tokens = re.findall(r"\w+", value, flags=re.UNICODE)[:12]
    return " AND ".join('"' + token.replace('"', '') + '"*' for token in tokens)


def list_items(params):
    term = (params.get("q", [""])[0] or "").strip()[:160]
    kind = params.get("kind", ["all"])[0]
    dataset = params.get("dataset", ["all"])[0]
    try:
        page = max(1, min(10000, int(params.get("page", ["1"])[0])))
    except ValueError:
        page = 1
    if kind not in ("all", "informal", "formal"):
        kind = "all"
    where = []
    args = []
    join = ""
    match = search_query(term)
    if match:
        join = " JOIN item_search ON item_search.rowid = items.rowid "
        where.append("item_search MATCH ?")
        args.append(match)
    if kind != "all":
        where.append("items.kind = ?")
        args.append(kind)
    if dataset != "all":
        where.append("items.dataset = ?")
        args.append(dataset)
    clause = " WHERE " + " AND ".join(where) if where else ""
    with sqlite3.connect(INDEX) as db:
        total = db.execute("SELECT COUNT(*) FROM items" + join + clause, args).fetchone()[0]
        rows = db.execute(
            "SELECT items.id,items.kind,items.dataset,items.title,items.statement,items.n_proofs "
            "FROM items" + join + clause + " ORDER BY items.rowid LIMIT ? OFFSET ?",
            [*args, PAGE_SIZE, (page - 1) * PAGE_SIZE],
        ).fetchall()
    return {"total": total, "page": page, "page_size": PAGE_SIZE,
            "items": [dict(zip(("id", "kind", "dataset", "title", "statement", "n_proofs"), row)) for row in rows]}


def get_item(item_id):
    with sqlite3.connect(INDEX) as db:
        record = db.execute("SELECT file,byte_offset,byte_length FROM items WHERE id=?", (item_id,)).fetchone()
    if record is None:
        return None
    file, offset, length = record
    with (DATA / file).open("rb") as source:
        source.seek(offset)
        line = source.read(length)
    row = json.loads(line)
    if file == "formal.jsonl":
        for key in ("human_proof", "prover_proof"):
            proof = row[key]
            proof["tactics_count"] = len(proof.pop("tactics", []))
            proof["proof_tree_available"] = proof.pop("proof_tree", None) is not None
    else:
        curation = json.loads(FEATURED.read_text(encoding="utf-8"))["results"].get(item_id)
        if curation:
            row["curation"] = curation
    return row


def get_position(item_id):
    with sqlite3.connect(INDEX) as db:
        record = db.execute("SELECT rowid FROM items WHERE id=?", (item_id,)).fetchone()
        if record is None:
            return None
        position = db.execute("SELECT COUNT(*) FROM items WHERE rowid <= ?", (record[0],)).fetchone()[0]
    return {"page": position}


def stats():
    with sqlite3.connect(INDEX) as db:
        rows = db.execute("SELECT kind,dataset,COUNT(*) FROM items GROUP BY kind,dataset ORDER BY kind,dataset").fetchall()
    featured = json.loads(FEATURED.read_text(encoding="utf-8"))["results"]
    return {"sources": [{"kind": kind, "dataset": dataset, "count": count} for kind, dataset, count in rows],
            "total": sum(row[2] for row in rows),
            "featured": [{"id": item_id, "title": result["title"], "field": result["field"]}
                         for item_id, result in featured.items()]}


class Handler(BaseHTTPRequestHandler):
    def respond(self, status, payload):
        body = payload if isinstance(payload, bytes) else json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlsplit(self.path)
        params = parse_qs(url.query)
        try:
            if url.path == "/seed-api/stats":
                self.respond(200, stats())
            elif url.path == "/seed-api/items":
                self.respond(200, list_items(params))
            elif url.path == "/seed-api/item":
                item_id = params.get("id", [""])[0]
                result = get_item(item_id)
                if result is None:
                    self.respond(404, {"error": "Record not found"})
                else:
                    self.respond(200, result)
            elif url.path == "/seed-api/position":
                result = get_position(params.get("id", [""])[0])
                self.respond(404, {"error": "Record not found"}) if result is None else self.respond(200, result)
            else:
                self.respond(404, {"error": "Endpoint not found"})
        except (OSError, sqlite3.DatabaseError, ValueError) as exc:
            self.respond(500, {"error": str(exc)})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=5188)
    parser.add_argument("--build-index-only", action="store_true")
    args = parser.parse_args()
    build_index()
    if args.build_index_only:
        print(f"Index ready: {INDEX}")
        return
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"Seed API ready at http://127.0.0.1:{args.port}/seed-api/stats", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
