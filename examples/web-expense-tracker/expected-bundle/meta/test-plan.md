# Test plan

Quality bar: **personal**. Test depth scales with the bar.

## Manual smoke tests — derived from MUST features

### Add an expense (amount, date, category, note).
- **Happy path**: do the action; observe the expected outcome.
- Edge: submit with required fields empty (validation should reject).
- Edge: submit with maximum-length input on each field.

### List expenses for a chosen month.
- **Happy path**: do the action; observe the expected outcome.

### Show a monthly total per category.
- **Happy path**: do the action; observe the expected outcome.

- Trigger one example of each error category in `docs/11-error-handling.md` and confirm the UX matches the policy in `docs/10-validation.md`.

## Unit tests
- Pure functions: validators, formatters, parsers (CSV / JSON parsers in particular when the features list mentions import/export).
- Edge cases enumerated above should each have a test.
