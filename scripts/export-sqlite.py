#!/usr/bin/env python3
"""Export legacy SUPER CUBE SQLite tables to a portable JSON data file."""
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

TABLES = [
    "users", "identities", "games", "play_sessions", "game_events",
    "ratings", "reviews", "favorites", "cloud_saves", "email_codes", "metric_snapshots",
]

def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: python scripts/export-sqlite.py storage/platform.sqlite migration-export.json", file=sys.stderr)
        return 2
    source, output = map(Path, sys.argv[1:])
    if not source.is_file():
        print(f"SQLite database not found: {source}", file=sys.stderr)
        return 2
    connection = sqlite3.connect(f"file:{source.resolve()}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    existing = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    tables = {}
    for table in TABLES:
        if table not in existing:
            continue
        columns = [row[1] for row in connection.execute(f"PRAGMA table_info({table})")]
        order = " ORDER BY id" if "id" in columns else ""
        rows = [dict(row) for row in connection.execute(f'SELECT * FROM "{table}"{order}')]
        tables[table] = {"columns": columns, "rows": rows}
        print(f"Exported {table}: {len(rows)} row(s)")
    document = {"formatVersion": 1, "generatedAt": datetime.now(timezone.utc).isoformat(), "source": str(source), "tables": tables}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(document, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {output} ({output.stat().st_size:,} bytes)")
    connection.close()
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
