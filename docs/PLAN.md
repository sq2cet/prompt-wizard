# prompt-wizard — Plan

This file is the **public, sanitised** copy of the project specification. The full working plan with
iteration history is kept in the developer's private workspace and is not committed to this
repository.

## Status

Iteration 11 of the spec was approved. Initial repo skeleton (this commit set) lays down:

- MIT licence
- README and third-party attribution stub
- Sanitisation gate (`build.py scan`) with pre-commit hook and CI workflow
- Canonical forbidden-terms list intentionally external (private file or CI secret)

## Next milestones

| Milestone | Deliverable |
|-----------|-------------|
| Phase 0   | JSON Schema for the data files; build.py `validate` subcommand wired into CI. |
| Phase 1   | Single-page HTML scaffold with prerequisite-check screen and 15-phase nav. |
| Phase 2   | Phase shell with Detailed / Simplified / Skip / Defer states; localStorage autosave. |
| Phase 3–5 | Phase content for all 15 phases. |
| Phase 6   | Mode switching, dependency tracking, staleness propagation, inconsistency engine. |
| Phase 7   | Pre-generation review with Preview Prompt. |
| Phase 8   | Generator + Bundler (ZIP via JSZip) producing the multi-file output bundle. |
| Phase 9   | Five worked examples + snapshot tests. |
| Phase 10  | Accessibility audit (WCAG 2.1 AA target). |
| Phase 11  | Polish, documentation, release. |

A fuller breakdown of the architecture (state schema, modular layout, output bundle structure,
inconsistency rules, error matrix) will be transcribed into this file in a subsequent commit, with
all environment-specific details stripped.

## Concept

A single-file HTML wizard that walks a non-technical user through 15 phases — vision, audience,
form factor, features, the five data dimensions (input · process · exchange · store · output),
validation, error handling, logging & observability, operations, compliance, and constraints — and
emits a multi-file ZIP bundle that drives a Claude Code session to build the described application
with verification gates at every step.

Each phase offers Detailed / Simplified / Skip modes. Each question additionally offers an explicit
**Defer** state (≠ Skip): "I don't know, Claude should ask the human before deciding." Deferred
items flow into `meta/open-questions.md` in the bundle.
