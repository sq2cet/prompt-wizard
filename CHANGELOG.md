# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] — 2026-05-05

The interactive AI review release. v1.0.0 collected structured answers from
the user; v2.0.0 lets a Claude model review those answers, surface ambiguities
and conflicts as inline issues, and route the user's responses back into the
generated bundle so the Claude Code build session never re-litigates a
decision the user has already made.

### Added

- **AI review (optional, opt-in)** — a Settings modal stores an Anthropic API
  key in browser-local storage with a three-checkbox consent gate.
  `Get AI review` on the Review screen sends the current state to the
  Anthropic Messages API, forces a `request_review` tool call, and parses
  the response into an iteration on `state.ai_review.iterations`. The wizard
  remains fully usable offline — no key, no network calls, V1 behaviour
  preserved.
- **Six issue kinds** surfaced by the AI review — `ambiguity`, `conflict`,
  `duplicate`, `misplaced`, `redundant`, `missing_context`. Each appears as
  a coloured banner on its target question card (or on the phase header for
  phase-level issues) with four actions: **Accept** Claude's suggestion,
  **Change** — write your own (inline editor pre-populated with the
  suggestion), **Reject** — keep your answer, and (for `ambiguity` and
  `missing_context`) **I don't know — Claude, you choose**. Each response
  is recorded into `state.ai_review.iterations[i].user_responses[id]`.
- **Iteration loop** with a configurable hard cap (default 5). After the
  first review the primary button rewords to **Send updated answers** and
  is disabled until the user has actioned at least one issue. **I'm done —
  generate now** lets the user lock the loop closed before the cap. The
  loop terminates with `stopped_by ∈ { claude_ready, user_done,
  iteration_cap }`; the user can **Resume** unless Claude flagged ready or
  the cap was hit.
- **Bundle integration** — the Generator emits `notes/ai-review.md` with
  the full back-and-forth (every iteration, every issue, every user
  response, every applied value) when at least one iteration exists.
  `meta/open-questions.md` gains a **Deferred to Claude (interactive AI
  review)** section listing every issue the user routed via "I don't
  know" with Claude's prior suggestion as a starting point. The master
  `PROMPT.md` trust-boundary block adds a fourth bullet for
  `notes/ai-review.md` when iterations exist.
- **File-backed persistence** (V2.1) — projects save to a directory the
  user picks once via the File System Access API; the directory handle
  persists across sessions in IndexedDB. **Start a new project** asks for
  a name (3–60 chars, lowercase-kebab-case-able) which becomes the ZIP
  directory name. The startup screen lists saved projects with Load /
  Delete. Browsers without the File System Access API fall back to a
  localStorage banner explaining the limitation.
- **Per-question Clear** — a fourth state-button alongside Answer / Defer
  / Skip that returns a question to blank state without affecting Notes
  or Rationale. Fixes the "radio buttons can't be unselected" gap from V1.
- **Defensive R1 handlers** (V2.0) — `oncompositionend` + `onpaste`
  handlers + a periodic catch-up save protect against the rare case where
  a long features list gets truncated mid-keystroke. Includes a 9-item
  regression test in the snapshot runner.
- **Generator hardening** (V2.2) — constraint-aware
  `meta/tech-stack.md` (recommendations are suppressed when the user
  named a forced tech in `docs/15-constraints.md`); features-derived
  `meta/build-plan.md` and `meta/test-plan.md`; `meta/open-questions.md`
  surfaces deterministic rule-based inconsistencies and duplicate
  phase-comments at generation time; quality-bar collapse omits
  Operations / Compliance / detailed Logging docs at `personal` and
  `throwaway` bars; the dynamic file index in PROMPT.md and README.md
  reflects what was actually emitted.
- **Cost meter** — both the Settings modal and the AI review panel
  header show estimated cumulative USD-equivalent based on per-million-
  token rates declared per model. Labelled "(estimate)" — for billing
  accuracy refer to the Anthropic dashboard.
- **Schema extension** — `src/data/schemas/answers-state.schema.json`
  now declares optional `ai_review` with full `$defs/ai_iteration`,
  `ai_issue`, and `ai_user_response` shapes.

### Changed

- `WIZARD_VERSION` bumped to `2.0.0`. Build artefact size grew from
  226 KB (v1.0.0) to 363 KB — most of the increase is the new Claude
  client, the ClarificationOverlay UI, the file-backed persistence
  module, and the AI review system prompt.
- The Review screen's primary button label is dynamic: **Get AI review**
  before the first iteration, **Send updated answers** afterward,
  **Reviewing… (10 – 30s)** during a request.
- The Settings modal's primary action no longer requires consent when
  the API key field is empty — users can save model preferences for the
  offline path without going through the API consent flow.

### Fixed

- The "radio buttons can't be unselected" issue from v1 (the Clear
  button is the surgical fix).
- A `SecurityError: User activation is required` crash on cold boot in
  Chromium when the wizard tried to re-grant the saved directory handle
  outside a user gesture. The directory check now splits into a silent
  `inspectDirectoryHandle()` query and a gesture-required
  `restoreDirectoryAccess()` action.
- `KNOWN` map filename mismatch (`12-logging-and-observability.md` vs
  the actual `12-logging-observability.md`) that broke the dynamic file
  index in some quality-bar collapse paths.

### Build & test

- Snapshot tests grew from 5 to **7 examples** — the new
  `web-expense-tracker-with-review/` carries a populated
  `state.ai_review` (2 iterations, all 6 issue kinds across the first,
  Claude flagging ready in the second) and locks V2.7's emission paths
  under regression. Total snapshot files: 7 examples × ~27 files = 189.
- New build hook `TEMPLATE_RAW_TEXT_INPUTS` lets a markdown blob (the
  AI review system prompt) be JSON-string-encoded into a
  `<script type="application/json">` block.

## [1.0.0] — 2026-05-05

The first stable release. The wizard is functionally complete end-to-end — a non-technical
user can open the HTML, walk through 15 phases, and download a structured ZIP bundle that
Claude Code can consume.

### Added

- **Single-file HTML deliverable** (`prompt-wizard.html`, ~226 KB) with vendored JSZip
  3.10.1 (MIT, SHA-pinned) and zero runtime dependencies. Works offline.
- **15-phase taxonomy**: vision · audience · form factor · features · 5 data dimensions
  (input · process · exchange · store · output) · validation · error handling · logging
  & observability · operations · compliance · constraints.
- **Three phase modes** (Detailed / Simplified / Skip) plus a per-question **Defer** state
  that flows into `meta/open-questions.md` for Claude to raise with the human.
- **Dependency graph** between answers: changing an upstream value flags downstream phases
  for review with three explicit resolution actions (Re-answer · Mark still valid · Reset).
  Stale phases are visually distinct from rule-based inconsistencies.
- **Rule-based inconsistency engine** (no AI) that surfaces logical contradictions in the
  pre-generation review, distinguishing severity (info / warning / conflict).
- **Atomic per-answer save** to `localStorage` with a debounce on free-text inputs that
  preserves textarea focus during continuous typing. Save indicator pulses on commits and
  on text-input blur; quiet during keystroke storms.
- **Review and Preview screens**: per-phase summary with jump-back-to-edit links; an issues
  panel surfacing stale and inconsistent items; a read-only file-tree viewer that shows
  every file the bundle will contain before the user clicks Generate.
- **Generator** module produces 27 bundle files deterministically; same source runs in the
  browser and in Node (snapshot tests).
- **Bundler** packs the bundle into a real ZIP via vendored JSZip; downloads as
  `<project-slug>-prompt.zip`.
- **5 worked examples** under `examples/` with state.json + 27-file expected-bundle/:
  web expense tracker, CLI photo renamer, mobile habit tracker, ML photo classifier,
  ESP32 temperature sensor.
- **CI snapshot tests** that byte-compare `Generator(state.json)` against committed
  `expected-bundle/` for every example. Frozen build-info timestamp gives reproducible
  diffs.
- **Sanitisation gate**: `build.py scan` + pre-commit hook + CI step block introduction of
  forbidden terms across the source tree. The canonical pattern list lives privately on the
  developer's machine / a CI secret — never in the public repo.
- **JSON-Schema validation** of every YAML data file (`question-taxonomy`, `tech-stack-catalog`,
  `prerequisite-catalog`, `compliance-catalog`, `inconsistency-rules`, `template-bindings`,
  plus the `answers.json` state schema).
- **Accessibility (WCAG 2.1 AA)**: skip link, ARIA live region, focus management on route
  changes, `aria-current` / `aria-required` / `aria-describedby` / `aria-pressed`,
  focus-visible rings, reduced-motion support, light/dark palette with verified contrast.
- **Trust boundaries** documented in the master `PROMPT.md`: structured requirements are
  authoritative; user notes are advisory; open questions must be asked before resolving.
  Conditional compliance guardrail when applicable regimes are non-empty.

### Build & CI

- Reproducible builds via `SOURCE_DATE_EPOCH` and `BUILD_COMMIT_SHA` env vars.
- Vendored libraries SHA-pinned; tampering blocks the build with a clear error.
- CI matrix: sanitisation · schema validate · build · snapshot (5 examples × 27 files).
