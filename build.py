#!/usr/bin/env python3
"""Build script and sanitisation gate for prompt-wizard.

Subcommands:
    scan        Run the sanitisation regex scan over the source tree.
                Used by the pre-commit hook and CI.
    build       (Future) compile src/ into prompt-wizard.html. Not yet implemented.

The sanitisation gate refuses to run without a canonical forbidden-terms file.
The canonical list is private to the developer's environment / CI secrets and is
intentionally NOT committed to this repository. See src/data/forbidden-terms.example.txt.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
DEFAULT_TERMS_PATH = Path.home() / ".config" / "prompt-wizard" / "forbidden-terms.txt"

# Files/dirs the scan must skip. Order matters: matched as path components.
SCAN_EXCLUDES = (
    ".git",
    "node_modules",
    "__pycache__",
    ".pytest_cache",
    "dist",
    "build",
    # The example file describes the structure but has no real terms; skipping
    # it is defensive in case a future maintainer puts an actual term in it.
    "forbidden-terms.example.txt",
)

# File extensions to include in the scan.
SCAN_INCLUDE_EXTS = {
    ".md", ".html", ".css", ".js", ".json", ".yaml", ".yml",
    ".py", ".txt", ".sh", ".toml", ".cfg", ".ini",
}


@dataclass
class Match:
    path: Path
    line_no: int
    line: str
    pattern: str


def load_forbidden_patterns(terms_file: Path) -> list[re.Pattern[str]]:
    """Load forbidden-term regexes from the canonical list."""
    if not terms_file.is_file():
        sys.stderr.write(
            f"\nERROR: canonical forbidden-terms file not found: {terms_file}\n"
            f"\nSet FORBIDDEN_TERMS_FILE or place the file at the default path.\n"
            f"See src/data/forbidden-terms.example.txt for format.\n\n"
            f"The build/scan WILL NOT run without this file.\n"
        )
        sys.exit(2)

    patterns: list[re.Pattern[str]] = []
    for raw_line in terms_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        try:
            patterns.append(re.compile(line))
        except re.error as e:
            sys.stderr.write(f"ERROR: invalid regex in {terms_file}: {line!r} -> {e}\n")
            sys.exit(2)

    if not patterns:
        sys.stderr.write(
            f"ERROR: {terms_file} is empty (no patterns).\n"
            f"At least one pattern must be defined.\n"
        )
        sys.exit(2)

    return patterns


def iter_scan_files(root: Path):
    """Yield files in `root` that should be scanned."""
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if any(part in SCAN_EXCLUDES for part in path.parts):
            continue
        if path.name in SCAN_EXCLUDES:
            continue
        if path.suffix.lower() not in SCAN_INCLUDE_EXTS:
            continue
        yield path


def detect_sync_locks(root: Path) -> list[Path]:
    """Return any cloud-sync lock or temp files in the source tree."""
    locks: list[Path] = []
    lock_patterns = (re.compile(r"^~\$"), re.compile(r"\.tmp$"), re.compile(r"^\.~lock\."))
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if any(part == ".git" for part in path.parts):
            continue
        if any(p.search(path.name) for p in lock_patterns):
            locks.append(path)
    return locks


def scan(root: Path, patterns: list[re.Pattern[str]]) -> list[Match]:
    """Scan files under `root` for any forbidden pattern. Return all matches."""
    matches: list[Match] = []
    for path in iter_scan_files(root):
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, PermissionError):
            continue
        for line_no, line in enumerate(text.splitlines(), start=1):
            for pattern in patterns:
                if pattern.search(line):
                    matches.append(Match(path, line_no, line, pattern.pattern))
                    break
    return matches


def cmd_scan(args: argparse.Namespace) -> int:
    """Run the sanitisation scan. Returns exit code."""
    terms_path = Path(args.terms_file) if args.terms_file else DEFAULT_TERMS_PATH

    # Cloud-sync conflict detection — abort cleanly if a sync is mid-flight.
    locks = detect_sync_locks(PROJECT_ROOT)
    if locks:
        sys.stderr.write("ERROR: cloud-sync lock or temp files detected:\n")
        for lock in locks:
            sys.stderr.write(f"  {lock.relative_to(PROJECT_ROOT)}\n")
        sys.stderr.write(
            "\nThis usually means a sync is in flight. Wait for sync to settle, then re-run.\n"
        )
        return 3

    patterns = load_forbidden_patterns(terms_path)
    matches = scan(PROJECT_ROOT, patterns)

    if matches:
        sys.stderr.write(f"FAIL: {len(matches)} forbidden-term match(es) found:\n\n")
        for m in matches:
            rel = m.path.relative_to(PROJECT_ROOT)
            sys.stderr.write(f"  {rel}:{m.line_no}: {m.line.strip()[:120]}\n")
        sys.stderr.write(
            "\nFix: remove the offending text. The canonical forbidden-terms list explains why.\n"
        )
        return 1

    print(f"OK: scanned tree, no forbidden-term matches ({len(patterns)} patterns checked).")
    return 0


def cmd_build(args: argparse.Namespace) -> int:
    """Compile src/ -> prompt-wizard.html. Not yet implemented."""
    sys.stderr.write(
        "build: not yet implemented. Run `python3 build.py scan` to verify hygiene.\n"
    )
    return 64  # EX_USAGE


def main() -> int:
    parser = argparse.ArgumentParser(prog="build.py")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_scan = sub.add_parser("scan", help="Run the sanitisation regex scan.")
    p_scan.add_argument(
        "--terms-file",
        help="Path to canonical forbidden-terms file. "
             f"Defaults to $FORBIDDEN_TERMS_FILE or {DEFAULT_TERMS_PATH}.",
        default=os.environ.get("FORBIDDEN_TERMS_FILE"),
    )
    p_scan.set_defaults(func=cmd_scan)

    p_build = sub.add_parser("build", help="Compile src/ into prompt-wizard.html (TBD).")
    p_build.set_defaults(func=cmd_build)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
