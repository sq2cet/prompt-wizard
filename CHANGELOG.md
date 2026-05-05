# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
