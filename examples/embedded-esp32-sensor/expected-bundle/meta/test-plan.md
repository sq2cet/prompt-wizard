# Test plan

Quality bar: **personal**. Test depth scales with the bar.

## Manual smoke tests — derived from MUST features

### Read temperature from a DS18B20 / SHT30 sensor.
- **Happy path**: do the action; observe the expected outcome.

### POST JSON {ts, c, rh} to a configurable URL.
- **Happy path**: do the action; observe the expected outcome.
- Edge: malformed JSON (e.g. trailing comma, unbalanced braces).
- Edge: empty array `[]` or empty object `{}`.

### Deep-sleep between readings.
- **Happy path**: do the action; observe the expected outcome.

- Trigger one example of each error category in `docs/11-error-handling.md` and confirm the UX matches the policy in `docs/10-validation.md`.

## Unit tests
- Pure functions: validators, formatters, parsers (CSV / JSON parsers in particular when the features list mentions import/export).
- Edge cases enumerated above should each have a test.
