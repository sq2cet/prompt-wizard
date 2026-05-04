#!/usr/bin/env python3
"""Build script and sanitisation gate for prompt-wizard.

Subcommands:
    scan        Run the sanitisation regex scan over the source tree.
                Used by the pre-commit hook and CI.
    validate    Validate every YAML in src/data/ against its JSON Schema in
                src/data/schemas/. Fails fast on any violation.
    build       (Future) compile src/ into prompt-wizard.html. Not yet implemented.

The sanitisation gate refuses to run without a canonical forbidden-terms file.
The canonical list is private to the developer's environment / CI secrets and is
intentionally NOT committed to this repository. See src/data/forbidden-terms.example.txt.

Build dependencies (validate / build subcommands): jsonschema, PyYAML.
Install with `python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt`.
The `scan` subcommand has no third-party dependencies.
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
    """Yield files that should be scanned.

    If the project is a git repository, restrict to git-tracked files (so the
    scan exactly mirrors what would be pushed to the public repo). Otherwise
    fall back to a filesystem walk with the same exclusion list.
    """
    import subprocess

    try:
        result = subprocess.run(
            ["git", "-C", str(root), "ls-files", "-z"],
            capture_output=True, check=True, text=False,
        )
        tracked = [p for p in result.stdout.split(b"\x00") if p]
        for raw in tracked:
            rel = raw.decode("utf-8", errors="replace")
            path = root / rel
            if not path.is_file():
                continue
            if path.suffix.lower() not in SCAN_INCLUDE_EXTS:
                continue
            if path.name in SCAN_EXCLUDES:
                continue
            yield path
        return
    except (subprocess.CalledProcessError, FileNotFoundError):
        # Not a git repo or git unavailable — fall back to filesystem walk.
        pass

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


# ---------------------------------------------------------------------------
# `validate` subcommand: JSON Schema validation of src/data/*.yaml
# ---------------------------------------------------------------------------

# Mapping of YAML data files to their schema files (both relative to PROJECT_ROOT).
# Add new entries as new data files are introduced.
DATA_TO_SCHEMA: dict[str, str] = {
    "src/data/question-taxonomy.yaml":   "src/data/schemas/question-taxonomy.schema.json",
    "src/data/tech-stack-catalog.yaml":  "src/data/schemas/tech-stack-catalog.schema.json",
    "src/data/prerequisite-catalog.yaml":"src/data/schemas/prerequisite-catalog.schema.json",
    "src/data/compliance-catalog.yaml":  "src/data/schemas/compliance-catalog.schema.json",
    "src/data/inconsistency-rules.yaml": "src/data/schemas/inconsistency-rules.schema.json",
    "src/data/template-bindings.yaml":   "src/data/schemas/template-bindings.schema.json",
}


def cmd_validate(args: argparse.Namespace) -> int:
    """Validate every YAML data file against its JSON Schema."""
    try:
        import json
        import jsonschema
        import yaml
    except ImportError as e:
        sys.stderr.write(
            f"ERROR: required Python package not installed: {e.name}\n"
            f"Run: python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt\n"
            f"Then run: .venv/bin/python build.py validate\n"
        )
        return 2

    failures = 0
    for data_rel, schema_rel in DATA_TO_SCHEMA.items():
        data_path = PROJECT_ROOT / data_rel
        schema_path = PROJECT_ROOT / schema_rel

        if not data_path.is_file():
            sys.stderr.write(f"FAIL: data file missing: {data_rel}\n")
            failures += 1
            continue
        if not schema_path.is_file():
            sys.stderr.write(f"FAIL: schema file missing: {schema_rel}\n")
            failures += 1
            continue

        try:
            data = yaml.safe_load(data_path.read_text(encoding="utf-8"))
        except yaml.YAMLError as e:
            sys.stderr.write(f"FAIL: {data_rel}: YAML parse error: {e}\n")
            failures += 1
            continue

        try:
            schema = json.loads(schema_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            sys.stderr.write(f"FAIL: {schema_rel}: JSON parse error: {e}\n")
            failures += 1
            continue

        try:
            jsonschema.validate(instance=data, schema=schema)
        except jsonschema.ValidationError as e:
            location = "/".join(str(p) for p in e.absolute_path) or "<root>"
            sys.stderr.write(
                f"FAIL: {data_rel}: schema violation at {location}\n"
                f"      {e.message}\n"
            )
            failures += 1
            continue

        print(f"OK:   {data_rel}")

    if failures:
        sys.stderr.write(f"\n{failures} validation failure(s).\n")
        return 1
    print(f"\nAll {len(DATA_TO_SCHEMA)} data file(s) valid against their schemas.")
    return 0


# ---------------------------------------------------------------------------
# `build` subcommand: compile src/ into a single prompt-wizard.html
# ---------------------------------------------------------------------------

# Template placeholders → either a YAML data file (encoded as JSON) or a
# fragment file. Names match `__NAME__` tokens in src/index.template.html.
TEMPLATE_DATA_INPUTS: dict[str, str] = {
    "DATA_QUESTION_TAXONOMY":   "src/data/question-taxonomy.yaml",
    "DATA_TECH_STACKS":         "src/data/tech-stack-catalog.yaml",
    "DATA_PREREQUISITES":       "src/data/prerequisite-catalog.yaml",
    "DATA_COMPLIANCE":          "src/data/compliance-catalog.yaml",
    "DATA_INCONSISTENCY_RULES": "src/data/inconsistency-rules.yaml",
    "DATA_TEMPLATE_BINDINGS":   "src/data/template-bindings.yaml",
}

TEMPLATE_FRAGMENT_INPUTS: dict[str, str] = {
    "STYLES": "src/styles.css",
    "APP_JS": "src/app.js",
}

WIZARD_VERSION = "0.1.0"  # Single source of truth; bumped per release.


def _git_short_sha() -> str:
    """Best-effort short commit SHA. Empty string if not available."""
    import subprocess
    try:
        out = subprocess.run(
            ["git", "-C", str(PROJECT_ROOT), "rev-parse", "--short", "HEAD"],
            capture_output=True, check=True, text=True,
        )
        return out.stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return ""


def _build_timestamp() -> str:
    """Build timestamp. Reproducible builds can pin this via SOURCE_DATE_EPOCH."""
    import datetime as dt
    epoch = os.environ.get("SOURCE_DATE_EPOCH")
    if epoch:
        try:
            return dt.datetime.fromtimestamp(int(epoch), tz=dt.timezone.utc).isoformat()
        except ValueError:
            pass
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def _data_version() -> str:
    """Pull data_version from one of the catalogs (they all carry the same field)."""
    try:
        import yaml
        text = (PROJECT_ROOT / "src/data/question-taxonomy.yaml").read_text(encoding="utf-8")
        loaded = yaml.safe_load(text)
        return str(loaded.get("version", "0.0.0"))
    except Exception:
        return "0.0.0"


def cmd_build(args: argparse.Namespace) -> int:
    """Compile src/ → prompt-wizard.html (single-file deliverable)."""
    try:
        import json
        import yaml
    except ImportError as e:
        sys.stderr.write(
            f"ERROR: required Python package not installed: {e.name}\n"
            f"Run: python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt\n"
        )
        return 2

    template_path = PROJECT_ROOT / "src/index.template.html"
    if not template_path.is_file():
        sys.stderr.write(f"ERROR: missing template: {template_path}\n")
        return 1

    template = template_path.read_text(encoding="utf-8")

    # Resolve data placeholders (YAML → JSON string).
    substitutions: dict[str, str] = {}
    for token, rel in TEMPLATE_DATA_INPUTS.items():
        path = PROJECT_ROOT / rel
        if not path.is_file():
            sys.stderr.write(f"ERROR: missing data file: {rel}\n")
            return 1
        loaded = yaml.safe_load(path.read_text(encoding="utf-8"))
        # Compact JSON; safe inside <script type="application/json"> as long as
        # we don't contain "</script>" — guarded by `_safe_json_for_inline`.
        substitutions[token] = _safe_json_for_inline(loaded)

    # Resolve fragment placeholders (raw file contents).
    for token, rel in TEMPLATE_FRAGMENT_INPUTS.items():
        path = PROJECT_ROOT / rel
        if not path.is_file():
            sys.stderr.write(f"ERROR: missing fragment: {rel}\n")
            return 1
        substitutions[token] = path.read_text(encoding="utf-8")

    # Build-info metadata block (also surfaced inline as a JSON script tag).
    data_version = _data_version()
    commit_sha = os.environ.get("BUILD_COMMIT_SHA") or _git_short_sha()
    build_info = {
        "wizard_version": WIZARD_VERSION,
        "data_version": data_version,
        "claude_code_target_version": "1.x",
        "commit_sha": commit_sha,
        "built_at": _build_timestamp(),
    }
    substitutions["BUILD_INFO"] = _safe_json_for_inline(build_info)
    substitutions["WIZARD_VERSION"] = WIZARD_VERSION
    substitutions["DATA_VERSION"] = data_version

    # Emit. Use literal string replacement to keep things simple — placeholders
    # are unique tokens and not interpreted as regex.
    rendered = template
    unresolved: list[str] = []
    for token, value in substitutions.items():
        marker = f"__{token}__"
        if marker not in rendered:
            unresolved.append(token)
            continue
        rendered = rendered.replace(marker, value)

    # Detect any remaining __FOO__ tokens in the rendered output — they would
    # indicate a placeholder that the build forgot to populate.
    leftover = re.findall(r"__([A-Z][A-Z0-9_]+)__", rendered)
    if leftover:
        sys.stderr.write(
            "ERROR: unresolved placeholder(s) in built HTML: "
            + ", ".join(sorted(set(leftover))) + "\n"
        )
        return 1
    if unresolved:
        sys.stderr.write(
            "WARNING: data computed but placeholder absent from template: "
            + ", ".join(sorted(unresolved)) + "\n"
        )

    out_path = PROJECT_ROOT / "prompt-wizard.html"
    out_path.write_text(rendered, encoding="utf-8")
    size_kb = len(rendered.encode("utf-8")) / 1024
    print(
        f"OK: built {out_path.relative_to(PROJECT_ROOT)} "
        f"({size_kb:.1f} KB · wizard {WIZARD_VERSION} · data {data_version}"
        + (f" · {commit_sha}" if commit_sha else "") + ")"
    )

    return 0


def _safe_json_for_inline(value) -> str:
    """JSON-encode `value` for inclusion inside an inline <script type=application/json>.

    The HTML spec lets <script> end with the literal sequence `</script` so we
    must escape any `<` that could form `</script` inside a JSON string. Browsers
    parse JSON strings, so escaping `<` as `\\u003c` is safe and standard.
    """
    import json
    return (
        json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        .replace("<", "\\u003c")
        .replace(">", "\\u003e")
        .replace("&", "\\u0026")
    )


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

    p_validate = sub.add_parser(
        "validate", help="Validate src/data/*.yaml against their JSON Schemas."
    )
    p_validate.set_defaults(func=cmd_validate)

    p_build = sub.add_parser("build", help="Compile src/ into prompt-wizard.html (TBD).")
    p_build.set_defaults(func=cmd_build)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
