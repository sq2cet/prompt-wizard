# Open questions

**ASK before deciding.** Every item below was explicitly deferred by the user, surfaces a stale answer that was not re-confirmed, or was flagged at generation time by a deterministic data-quality rule. Surface each one to the human before making a unilateral decision.

## Cross-field consistency findings

These are deterministic rule-based checks run at generation time. They are not exhaustive — an opt-in AI review (V2 feature) catches semantic issues this pass cannot.

### CONFLICT · `validation_silent_with_strict_intent`

Validation policy is set to "Sanitise / coerce silently" — but free-text
comments under Phase 5 (Data — Input) or Phase 9 (Data — Output) often
describe rejection-with-summary. Confirm whether the policy is silent
sanitisation OR explicit rejection. The two contradict each other.

**Suggested fix:**

If you want explicit rejection (e.g. "duplicate emails are rejected with
a summary"), change failure_response to "reject". Use "sanitise" only
when you genuinely want silent coercion (e.g. trimming whitespace).

### WARNING · `pii_unmasked_unencrypted`

Both encryption-at-rest and PII masking in logs are off. If the data
store contains anything that could be considered personal (names,
emails, phone numbers, addresses, identifiers, etc.) this combination
is risky even at a personal quality bar. Confirm there is no PII, or
enable masking and/or encryption.

**Suggested fix:**

Either explicitly attest "no PII is stored" in this phase's comment,
or set encryption_at_rest to true (Phase 8) and pii_masking to true
(Phase 12).

## Duplicate phase comments

The following phases share an identical free-text comment. The user almost certainly pasted the same content into two boxes; before relying on either, confirm whether the duplication is intentional.

- Phase 5 (Data — Input) matches Phase 9 (Data — Output).
  Excerpt: _The CSV format should use a header row and quote fields containing commas. Validation: name and email are required, e…_
