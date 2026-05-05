# prompt-wizard

[![CI](https://github.com/sq2cet/prompt-wizard/actions/workflows/ci.yml/badge.svg)](https://github.com/sq2cet/prompt-wizard/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A standalone, single-file HTML wizard that helps **non-technical users** turn an idea into a
comprehensive build prompt for [Claude Code](https://docs.claude.com/en/docs/claude-code).

The wizard runs entirely in your browser. No install, no build, no network calls. Open the
HTML file, walk through 15 phases, click **Generate**, and you get a structured ZIP bundle
ready to paste into Claude Code.

## Quick start

1. Download the latest **`prompt-wizard.html`** from
   [**Releases**](https://github.com/sq2cet/prompt-wizard/releases/latest).
2. Double-click the file. It opens in your default browser.
3. Confirm Claude Code is installed (`claude --version` in a terminal). If not, the wizard
   walks you through it.
4. Answer the 15 phases of questions. Skip what you do not know with the **Defer** button —
   Claude will be told to ask you before deciding.
5. Click **Generate bundle** on the Review screen. A ZIP downloads to your Downloads folder.
6. Unzip, `cd` into the directory, run `claude`, and paste the contents of `PROMPT.md`.

## What's in the generated bundle

The ZIP contains 27 files arranged for Claude Code to read on demand:

```
<your-project>/
├── README.md                   # human-facing
├── PROMPT.md                   # Claude reads this first
├── docs/
│   ├── 01-vision.md … 15-constraints.md   # one per wizard phase
├── meta/
│   ├── tech-stack.md           # recommended stack with rationale
│   ├── non-functional.md       # security · perf · a11y · i18n · scaling
│   ├── architecture.md         # files, components, data flow
│   ├── prerequisites.md        # verify-before-start commands
│   ├── build-plan.md           # phased build with verification gates
│   ├── test-plan.md            # unit / integration / E2E / manual
│   ├── open-questions.md       # items the user deferred — ASK before deciding
│   └── out-of-scope.md         # explicit non-goals
├── notes/
│   └── user-notes.md           # free-text comments verbatim (advisory only)
└── answers.json                # round-trippable wizard state
```

## How it works

- 15 phases cover the full lifecycle: vision → audience → form factor → features → 5 data
  dimensions (input · process · exchange · store · output) → validation → error handling →
  logging & observability → operations → compliance → constraints.
- Each phase offers **Detailed / Simplified / Skip** modes; each question additionally has a
  **Defer** state for "I don't know — Claude should ask the human".
- A dependency graph between answers means changing the form factor flags downstream phases
  for review (with three resolution actions: Re-answer · Mark still valid · Reset).
- Free-text comments and rationales flow verbatim into the bundle, clearly marked as
  advisory user notes (separate trust boundary from the structured requirements).

See the worked [examples](examples/README.md) for end-to-end runs covering web, CLI, mobile,
ML, and embedded form factors.

## Repository conventions

- All paths in documentation are relative to `$PROJECT_ROOT` (this directory).
- The build is reproducible given fixed inputs; see `build.py`.
- A sanitisation gate (`build.py scan` + pre-commit hook + CI) blocks introduction of
  forbidden terms — the canonical list is private to the developer's environment / CI
  secret.

## Development setup

Build dependencies live in a project-local venv. The shipped artefact has zero runtime deps.

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
git config core.hooksPath .githooks   # activate the pre-commit hook

# Run all gates locally
python3 build.py scan          # forbidden-terms scan (no third-party deps)
.venv/bin/python build.py validate    # JSON-Schema validate src/data/*.yaml
.venv/bin/python build.py build       # compile src/ → prompt-wizard.html
.venv/bin/python build.py snapshot    # snapshot tests over examples/

# Refresh snapshots after an intentional Generator change
.venv/bin/python build.py snapshot --update
```

## Accessibility

The wizard targets **WCAG 2.1 AA** with skip link, ARIA live region, focus management on
route changes, `aria-current` / `aria-required` / `aria-describedby` / `aria-pressed` where
relevant, focus-visible rings, and reduced-motion support. See
[`docs/accessibility.md`](docs/accessibility.md) for the full commitments and the manual-test
checklist.

## License

MIT — see [LICENSE](LICENSE). Third-party attributions in
[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
