"""`ragctl logs`, the last-N view of the request log.

Records written before the request logger escaped U+0085/U+2028/U+2029 can hold
them raw inside a JSON string, so the reader must split on "\\n" only, or it
breaks such a record into fragments, drops it, and counts the pieces toward N.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

import ragctl


def _write_log(tmp_path: Path, records: list[str]) -> None:
    (tmp_path / "requests.jsonl").write_text("\n".join(records) + "\n", encoding="utf-8")


def test_a_record_with_a_raw_unicode_line_break_is_shown_whole(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys
) -> None:
    old = json.dumps({"query": "old\u2028record", "response": "a1"}, ensure_ascii=False)
    new = json.dumps({"query": "new", "response": "a2"})
    _write_log(tmp_path, [old, new])
    monkeypatch.setattr(ragctl, "RAG_LOG_DIR", tmp_path)
    monkeypatch.setattr(ragctl, "_c", lambda s, *a: s)

    assert ragctl.cmd_logs(5) == 0
    out = capsys.readouterr().out
    assert "last 2 request(s)" in out
    assert "old\u2028record" in out
    assert "Q: new" in out
