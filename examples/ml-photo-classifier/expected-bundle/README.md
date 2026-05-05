# personal-photo-classifier

This bundle was produced by [prompt-wizard](https://github.com/sq2cet/prompt-wizard) — a single-file HTML wizard that helps non-technical users articulate an application idea and emit a comprehensive build prompt for [Claude Code](https://docs.claude.com/en/docs/claude-code).

## How to use it

1. Unzip this archive into a directory (the directory name is yours to choose; the contents stay relative).
2. `cd` into the unzipped directory.
3. Start Claude Code: `claude`
4. Paste the entire contents of `PROMPT.md` into the prompt field. Claude will then read the supporting documents under `docs/` and `meta/` as it needs them.

## What's in the bundle

- `README.md` — How to use this bundle (human-facing); JSZip MIT attribution
- `PROMPT.md` — Entry point — Claude reads this first
- `docs/01-vision.md` — Vision & success criteria
- `docs/02-audience.md` — Users · scale · accessibility · i18n
- `docs/03-form-factor.md` — Form factor + rationale
- `docs/04-features.md` — MUST / SHOULD / NICE
- `docs/05-data-input.md` — Inputs to the system
- `docs/06-data-process.md` — Transforms & enrichment
- `docs/07-data-exchange.md` — Inter-system protocols
- `docs/08-data-store.md` — Storage & retention
- `docs/09-data-output.md` — Outputs from the system
- `docs/10-validation.md` — Validation strategy
- `docs/11-error-handling.md` — Error taxonomy & policies
- `docs/12-logging-observability.md` — Logs · metrics · traces · alerts · SLOs · audit
- `docs/13-operations.md` — Deploy · CI/CD · monitoring
- `docs/14-compliance.md` — Compliance & “Not legal advice” guardrail
- `docs/15-constraints.md` — Budget · timeline · forced/forbidden tech
- `meta/tech-stack.md` — Chosen stack & rationale
- `meta/non-functional.md` — Security · performance · reliability · a11y
- `meta/architecture.md` — Files, components, data flow
- `meta/prerequisites.md` — Verify-before-start commands
- `meta/build-plan.md` — Phased build with verification gates
- `meta/test-plan.md` — Unit · integration · E2E · manual
- `meta/open-questions.md` — Items deferred — ASK before deciding
- `meta/out-of-scope.md` — Explicit non-goals
- `notes/user-notes.md` — Free-text comments verbatim (advisory only)
- `answers.json` — Machine-readable wizard state

## Third-party attribution

This bundle does not embed third-party code. The wizard that generated it vendors [JSZip](https://stuk.github.io/jszip/) (MIT licence) for ZIP packing.