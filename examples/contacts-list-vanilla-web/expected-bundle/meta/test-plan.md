# Test plan

Quality bar: **personal**. Test depth scales with the bar.

## Manual smoke tests — derived from MUST features

### View a table of contacts (columns: name, email, phone, company, notes)
- **Happy path**: do the action; observe the expected outcome.

### Add a new contact via a form
- **Happy path**: do the action; observe the expected outcome.
- Edge: submit with required fields empty (validation should reject).
- Edge: submit with maximum-length input on each field.

### Edit an existing contact inline or via modal
- **Happy path**: do the action; observe the expected outcome.
- Edge: edit a field and cancel — original value should remain.
- Edge: concurrent edits to the same record (if multi-user).

### Delete a contact with confirmation
- **Happy path**: do the action; observe the expected outcome.
- Edge: delete the only record.
- Edge: delete + immediate re-add with the same key.

### Search/filter the list by name or company
- **Happy path**: do the action; observe the expected outcome.
- Edge: query that matches nothing.
- Edge: query containing punctuation, accents, or non-Latin script.

### Import contacts from a JSON file
- **Happy path**: do the action; observe the expected outcome.
- Edge: file with header row plus quoted fields containing commas.
- Edge: file with embedded newlines inside quoted fields.
- Edge: file missing a required column.
- Edge: empty file.
- Edge: malformed JSON (e.g. trailing comma, unbalanced braces).
- Edge: empty array `[]` or empty object `{}`.

### Export all contacts to a JSON file
- **Happy path**: do the action; observe the expected outcome.
- Edge: malformed JSON (e.g. trailing comma, unbalanced braces).
- Edge: empty array `[]` or empty object `{}`.
- Edge: export an empty list (zero rows / records).
- Edge: round-trip — export then re-import is idempotent.

### Import contacts from a CSV file
- **Happy path**: do the action; observe the expected outcome.
- Edge: file with header row plus quoted fields containing commas.
- Edge: file with embedded newlines inside quoted fields.
- Edge: file missing a required column.
- Edge: empty file.

### Export all contacts to a CSV file
- **Happy path**: do the action; observe the expected outcome.
- Edge: file with header row plus quoted fields containing commas.
- Edge: file with embedded newlines inside quoted fields.
- Edge: file missing a required column.
- Edge: empty file.
- Edge: export an empty list (zero rows / records).
- Edge: round-trip — export then re-import is idempotent.

- Trigger one example of each error category in `docs/11-error-handling.md` and confirm the UX matches the policy in `docs/10-validation.md`.

## Unit tests
- Pure functions: validators, formatters, parsers (CSV / JSON parsers in particular when the features list mentions import/export).
- Edge cases enumerated above should each have a test.
