# Build plan

Quality bar: **shareable**. Phases below are derived from the MUST features in `docs/04-features.md`, the user-facing import / export flows in `docs/05-data-input.md` and `docs/09-data-output.md`, plus the per-bar quality phases. Each has a goal and an explicit verification — only proceed past a phase once its verification passes.

## Phase 1: Project scaffold

**Verify:** Project compiles / runs hello-world. The shell artefact (e.g. `index.html` for web, `main.py` for CLI) opens / runs without error.

## Phase 2: Core data model and persistence

**Verify:** Round-trip a sample record through your chosen storage (per `docs/08-data-store.md`) without error.

---

**MUST-feature phases — derived from `docs/04-features.md`:**

## Phase 3: Add up to 5 daily habits.

**Verify:** Manually demonstrate this feature end-to-end and capture the smoke-test steps in `meta/test-plan.md`.

## Phase 4: Tap-to-mark-done from the widget.

**Verify:** Manually demonstrate this feature end-to-end and capture the smoke-test steps in `meta/test-plan.md`.

## Phase 5: Per-habit streak counter.

**Verify:** Manually demonstrate this feature end-to-end and capture the smoke-test steps in `meta/test-plan.md`.

## Phase 6: Per-habit reminder time.

**Verify:** Manually demonstrate this feature end-to-end and capture the smoke-test steps in `meta/test-plan.md`.

---

**SHOULD-have features (after MUST is solid):**

## Phase 7: Weekly summary push notification.

**Verify:** Demonstrate end-to-end. May be deferred if MUST features over-run schedule.

## Phase 8: Health-data integration for step-based habits.

**Verify:** Demonstrate end-to-end. May be deferred if MUST features over-run schedule.

## Phase 9: Validation and error handling

**Verify:** Trigger each error category from `docs/11-error-handling.md` and confirm the UX matches the strategy in `docs/10-validation.md`.

## Phase 10: Logging and observability

**Verify:** Confirm structured log lines per `docs/12-logging-observability.md` and any health endpoints / metrics declared there.

## Phase 11: Tests

**Verify:** Run unit and integration tests; all green. Coverage matches the bands in `meta/test-plan.md`.

## Phase 12: Deploy / release

**Verify:** Smoke-test the deployed instance against the MUST features; confirm `docs/13-operations.md` deployment steps are reproducible.
