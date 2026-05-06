# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.2.0] — 2026-05-06

The generator-coherence release. v2.0–v2.1 layered new features (AI
review, local bridge); v2.2.0 hardens the bundle against seven cross-
cutting bugs surfaced in an external review of an in-the-wild test bundle.
Each fix is a generic generator-coherence improvement, not a one-off
patch — the same fixes also harden the wizard against scenarios the
external reviewer named (multi-entity domains, forced-tech `python +
fastapi`, production quality bar, compliance-active builds).

### Fixed

- **Project-pointer poisoning when starting a new project** (data-corruption
  bug). The v2.1.0 New project flow ran `State.commit(s => slug = "alpha")`
  *before* `setActiveProject("alpha")`, so the first commit's autosave wrote
  the new slug into the *previous* project's file. Files saved between
  v2.1.0 and v2.2.0 may have stale `project_slug` fields; verify
  `<filename>.json`'s slug matches its filename if you observed the symptom.
  Fix is one line: `setActiveProject(null)` before reset/commit so the
  pre-create commit routes to localStorage instead of clobbering the
  previous file.

### Added

- **Value-fallback chain for structured docs** (Pattern 2). When a
  question's answer has no explicit `value` (common when AI Accept lands
  on a single_select / boolean — V2.5 stashes the suggestion in
  `rationale` rather than overwriting the option). The doc generator now
  reads through a 4-step chain: `value → AI-applied → rationale → (not
  answered)`. Closes the V2.1 reviewer's bug where `data_store/storage_mechanism`
  was Accept'd to "localStorage" but `docs/08-data-store.md` still said
  `_(not answered)_`. The doc now renders the AI-applied value with an
  "applied via AI review iteration N" footnote pointing at
  `notes/ai-review.md`.
- **Open-questions funnel for blanks-in-detailed-mode** (Patterns 3 + 6).
  `meta/open-questions.md` gains a new `## Detailed-mode questions left
  unanswered` section that surfaces every visible question with no value,
  no AI fallback, no rationale, no Skip, and no Defer. Grouped by phase
  for readability. Empty-skeleton phases (detailed mode but every question
  blank) show their full question list here so Claude Code asks the human
  rather than fabricating defaults question-by-question.
- **Cross-doc link integrity** (Pattern 1). Meta generators now receive
  the actually-emitted set of doc files. References to dropped docs (e.g.
  `docs/11-error-handling.md` at `personal` quality bar) either rewrite
  to a fallback wording or are dropped entirely. `meta/non-functional.md`
  skips whole `## Error handling` / `## Logging` sections when the user
  gave no answer AND the doc was collapsed, instead of pointing at
  nothing. `meta/build-plan.md` and `meta/test-plan.md` pick verification
  text from a 2 × 2 / 2 × 2 × 2 matrix of "which docs are present". Also
  fixes a stale filename reference (`docs/12-logging-and-observability.md`
  in the body — actual filename is `docs/12-logging-observability.md`).
- **Synthesis docs derive from content, not template** (Pattern 4).
  `meta/architecture.md`'s data-flow diagram now reflects which lifecycle
  phases have content. A localStorage-only contact manager that never
  engages Process / Exchange shows a smaller flow ("INPUT → STORE →
  OUTPUT") plus a one-liner naming the omitted layers, instead of
  printing the canonical 5-layer flow regardless. `meta/build-plan.md`
  derives phases from MUST features *and* from user-described data
  import / export flows in `docs/05` / `docs/09` (CSV / JSON / XML / Excel
  detection). Closes reviewer's bug #4 ("import/export missing from
  features+build-plan even when described in detail").
- **AI review system prompt: explicit "What NOT to flag"** (Pattern 5).
  Five suppression categories: wizard-completion advice, generic "could
  be more detailed" notes, style / wording suggestions, wizard-enforced
  rules already covered elsewhere, speculation about future build
  states. Closing line: "Better to surface zero real issues than ten
  synthesised ones." Closes reviewer's bug #5 (procedural meta-advice
  recorded as `applied_value`).

### Changed

- `WIZARD_VERSION` bumped to `2.2.0`. Build artefact: 405 KB (+1 KB vs
  v2.1.0).
- All 7 example expected-bundle/ snapshots re-baked. Most diffs are the
  new `meta/open-questions.md` section, the new build-plan import/export
  phases when the example state contains them, and the version footer.
- The `_formatAnswer` signature gained `state, phaseId` parameters. Only
  one call site in the codebase. The new helpers `_findAiAppliedValue`,
  `_isEffectivelyBlank`, `_seeDoc`, and `_dataIoActions` are exported
  internally (not on the Generator surface).

### Build & test

- Snapshots remain at 7 examples × 27–28 files = 189 files asserted
  byte-for-byte on every push. v2.2.0 surfaced new content in 5 of 7
  examples' open-questions and 1 example's build-plan; the rest are
  unchanged at the synthesis level.

## [2.1.0] — 2026-05-05

The local-Claude-Code release. v2.0.0 required an Anthropic API key for the
AI review; v2.1.0 adds a second backend that talks to your locally-installed
`claude` CLI through a small bridge you run alongside the wizard. No key, no
hosted-API spend — billed via your existing Claude Code setup.

### Added

- **Local Claude Code backend** (`Settings → AI review backend`). The wizard
  POSTs to a tiny `wizard-bridge.js` (Node, vanilla, ~250 lines, zero npm
  dependencies) which spawns `claude -p ... --output-format json` under the
  hood and returns a Messages-API-shaped envelope. The wizard's parsing path
  (issue list, banners, Accept/Change/Reject, iteration loop) is unchanged.
- **Bundled bridge script** — `bridge/wizard-bridge.js` is committed in the
  repo and JSON-string-encoded into the built HTML, so a Settings modal
  button **Download wizard-bridge.js** writes it locally without any
  separate download. Run with `node wizard-bridge.js` (default port 4179),
  Ctrl-C to stop.
- **Bridge UI in Settings** — the backend radio toggles between
  "Anthropic API" and "Local Claude Code (bridge)". Bridge mode shows a
  4-step setup checklist (verify Node 18+ → Download script → run it →
  Test bridge), a configurable bridge URL field, and a **Test bridge**
  button that probes `GET /health` and reports the bridge's version + port
  inline.
- **Backend-aware AI panel header** — the Review screen header now shows
  whether the active backend is `via Anthropic API` (with token + USD
  meter) or `via wizard-bridge (local Claude Code)` (no cost meter, since
  billing happens via Claude Code).
- **`AISettings.validateBridge(url)`** helper — reusable from anywhere; the
  Settings Test button uses it. Returns `{ ok, version, port }` or
  `{ ok: false, error }` with a contextual error message ("Is
  `node wizard-bridge.js` running?").

### Changed

- `WIZARD_VERSION` bumped to `2.1.0`. Build artefact size grew from 363 KB
  to 386 KB (+23 KB) — the bundled bridge source plus the Settings modal
  expansion.
- `Claude.review(state, taxonomy)` no longer assumes the Anthropic API. It
  reads `cfg.backend` and routes to either `https://api.anthropic.com/v1/messages`
  or `<bridge_url>/review`. Both paths return the same envelope so the
  iteration loop stays backend-agnostic.
- The Review screen's "Get AI review" button now opens Settings whenever
  the **active** backend is unconfigured — for `api` that's "no key", for
  `bridge` that's "no bridge URL" (rare; default is set).
- `AI settings` link is always visible on the AI review panel (V2.0.0 hid
  it when no key was set — confusing once a non-API backend was an option).

### Fixed

- `runAIReview` no longer hard-fails on the no-key check when the user has
  configured the local-bridge backend instead. (Previously the button
  appeared to "do nothing" for users who expected local Claude Code to
  satisfy the AI review requirement — V2.0.0 had no path that bypassed the
  API key.)

### Build & test

- New `TEMPLATE_RAW_TEXT_INPUTS` entry: `bridge/wizard-bridge.js` →
  `<script id="data-bridge-script" type="application/json">`. Same
  pattern V2.0 used for the AI review system prompt.
- `git add bridge/` is required before `python build.py scan` so the
  sanitisation gate covers the new directory.
- All 7 snapshot examples re-baked for the v2.1.0 wizard-version footer.
- The bridge itself is **not** in CI — same testing posture as V2.4's
  Anthropic API path. The bridge is user-tested via the Settings modal's
  Test button, which exercises the full HTTP path including CORS from
  `file://` to `localhost`.

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
