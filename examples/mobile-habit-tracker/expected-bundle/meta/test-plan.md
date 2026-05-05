# Test plan

Quality bar: **shareable**. Test depth scales with the bar.

## Manual smoke tests — derived from MUST features

### Add up to 5 daily habits.
- **Happy path**: do the action; observe the expected outcome.
- Edge: submit with required fields empty (validation should reject).
- Edge: submit with maximum-length input on each field.

### Tap-to-mark-done from the widget.
- **Happy path**: do the action; observe the expected outcome.

### Per-habit streak counter.
- **Happy path**: do the action; observe the expected outcome.

### Per-habit reminder time.
- **Happy path**: do the action; observe the expected outcome.

- Trigger one example of each error category in `docs/11-error-handling.md` and confirm the UX matches the policy in `docs/10-validation.md`.

## Unit tests
- Pure functions: validators, formatters, parsers (CSV / JSON parsers in particular when the features list mentions import/export).
- Edge cases enumerated above should each have a test.

## Integration tests
- Storage read/write round-trips (per `docs/08-data-store.md`).
- External API integrations (with mocks for offline runs).
