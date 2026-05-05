# Open questions

**ASK before deciding.** Every item below was explicitly deferred by the user, surfaces a stale answer that was not re-confirmed, or was flagged at generation time by a deterministic data-quality rule. Surface each one to the human before making a unilateral decision.

## Deferred to Claude (interactive AI review)

The user ran an AI review pass and chose **"I don't know — Claude, you choose"** on the items below. Pick a sensible default for each during the build, then surface the chosen default under "Decisions made on the user's behalf" in the build summary. Full back-and-forth in `notes/ai-review.md`.

- **Missing context** at `data_store/retention_period` (iteration 1): No retention period given. The build needs a number, not a vague intent.
  - Claude's prior suggestion (use as a starting point): Default to keeping data forever (single-user, local-first).
