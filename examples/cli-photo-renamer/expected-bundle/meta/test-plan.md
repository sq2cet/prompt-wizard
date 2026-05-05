# Test plan

Quality bar: **personal**. Test depth scales with the bar.

## Manual smoke tests — derived from MUST features

### Rename based on EXIF DateTimeOriginal.
- **Happy path**: do the action; observe the expected outcome.

### Skip files without EXIF.
- **Happy path**: do the action; observe the expected outcome.

### Dry-run mode that prints what would happen.
- **Happy path**: do the action; observe the expected outcome.

- Trigger one example of each error category in `docs/11-error-handling.md` and confirm the UX matches the policy in `docs/10-validation.md`.

## Unit tests
- Pure functions: validators, formatters, parsers (CSV / JSON parsers in particular when the features list mentions import/export).
- Edge cases enumerated above should each have a test.
