# Build plan

Quality bar: **personal**. Phases below are derived from the MUST features in `docs/04-features.md`, the user-facing import / export flows in `docs/05-data-input.md` and `docs/09-data-output.md`, plus the per-bar quality phases. Each has a goal and an explicit verification — only proceed past a phase once its verification passes.

## Phase 1: Project scaffold

**Verify:** Project compiles / runs hello-world. The shell artefact (e.g. `index.html` for web, `main.py` for CLI) opens / runs without error.

## Phase 2: Core data model and persistence

**Verify:** Round-trip a sample record through your chosen storage (per `docs/08-data-store.md`) without error.

---

**MUST-feature phases — derived from `docs/04-features.md`:**

## Phase 3: Walk a directory of JPEG/PNG/HEIC photos.

**Verify:** Manually demonstrate this feature end-to-end and capture the smoke-test steps in `meta/test-plan.md`.

## Phase 4: Run a pre-trained classifier and emit tags.

**Verify:** Manually demonstrate this feature end-to-end and capture the smoke-test steps in `meta/test-plan.md`.

## Phase 5: Query the resulting tag store from the CLI.

**Verify:** Manually demonstrate this feature end-to-end and capture the smoke-test steps in `meta/test-plan.md`.

---

**SHOULD-have features (after MUST is solid):**

## Phase 6: Cache classifier output so re-runs only process new files.

**Verify:** Demonstrate end-to-end. May be deferred if MUST features over-run schedule.

## Phase 7: Support a custom labels file.

**Verify:** Demonstrate end-to-end. May be deferred if MUST features over-run schedule.

## Phase 8: Validation and error handling

**Verify:** Trigger each error category from `docs/11-error-handling.md` and confirm the UX matches the strategy in `docs/10-validation.md`.
