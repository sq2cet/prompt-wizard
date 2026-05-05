# Phase 6: Data — Process

> Transforms, enrichment, error handling per stage, idempotency.

**Mode:** detailed

## What does the system do with the data?
> Validate, transform, aggregate, enrich, run an ML model, etc. One step per line.

Parse CSV/JSON; validate rows; reject duplicates with a summary.

## Are the processing steps scheduled or on-demand?

On demand — triggered by a user or event (`ondemand`)

## If a step is retried, is it safe to run again?
> Idempotent steps can be retried freely. Non-idempotent steps need de-duplication or transactions.

Yes
