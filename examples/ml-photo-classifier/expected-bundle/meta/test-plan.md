# Test plan

Quality bar: **personal**. Test depth scales with the bar.

## Manual smoke tests — derived from MUST features

### Walk a directory of JPEG/PNG/HEIC photos.
- **Happy path**: do the action; observe the expected outcome.

### Run a pre-trained classifier and emit tags.
- **Happy path**: do the action; observe the expected outcome.

### Query the resulting tag store from the CLI.
- **Happy path**: do the action; observe the expected outcome.

- Trigger one example of each error category in `docs/11-error-handling.md` and confirm the UX matches the policy in `docs/10-validation.md`.

## Unit tests
- Pure functions: validators, formatters, parsers (CSV / JSON parsers in particular when the features list mentions import/export).
- Edge cases enumerated above should each have a test.
