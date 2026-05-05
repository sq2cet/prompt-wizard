# Build plan

Quality bar: **personal**. Phases below are derived from the MUST features in `docs/04-features.md` plus the per-bar quality phases. Each has a goal and an explicit verification — only proceed past a phase once its verification passes.

## Phase 1: Project scaffold

**Verify:** Project compiles / runs hello-world. The shell artefact (e.g. `index.html` for web, `main.py` for CLI) opens / runs without error.

## Phase 2: Core data model and persistence

**Verify:** Round-trip a sample record through your chosen storage (per `docs/08-data-store.md`) without error.

---

**MUST-feature phases — derived from `docs/04-features.md`:**

## Phase 3: View a table of contacts (columns: name, email, phone, company, notes)

**Verify:** Manually demonstrate this feature end-to-end and capture the smoke-test steps in `meta/test-plan.md`.

## Phase 4: Add a new contact via a form

**Verify:** Manually demonstrate this feature end-to-end and capture the smoke-test steps in `meta/test-plan.md`.

## Phase 5: Edit an existing contact inline or via modal

**Verify:** Manually demonstrate this feature end-to-end and capture the smoke-test steps in `meta/test-plan.md`.

## Phase 6: Delete a contact with confirmation

**Verify:** Manually demonstrate this feature end-to-end and capture the smoke-test steps in `meta/test-plan.md`.

## Phase 7: Search/filter the list by name or company

**Verify:** Manually demonstrate this feature end-to-end and capture the smoke-test steps in `meta/test-plan.md`.

## Phase 8: Import contacts from a JSON file

**Verify:** Manually demonstrate this feature end-to-end and capture the smoke-test steps in `meta/test-plan.md`.

## Phase 9: Export all contacts to a JSON file

**Verify:** Manually demonstrate this feature end-to-end and capture the smoke-test steps in `meta/test-plan.md`.

## Phase 10: Import contacts from a CSV file

**Verify:** Manually demonstrate this feature end-to-end and capture the smoke-test steps in `meta/test-plan.md`.

## Phase 11: Export all contacts to a CSV file

**Verify:** Manually demonstrate this feature end-to-end and capture the smoke-test steps in `meta/test-plan.md`.

---

**SHOULD-have features (after MUST is solid):**

## Phase 12: Sortable columns.

**Verify:** Demonstrate end-to-end. May be deferred if MUST features over-run schedule.

## Phase 13: Bulk delete.

**Verify:** Demonstrate end-to-end. May be deferred if MUST features over-run schedule.

## Phase 14: Validation and error handling

**Verify:** Trigger each error category from `docs/11-error-handling.md` and confirm the UX matches the strategy in `docs/10-validation.md`.
