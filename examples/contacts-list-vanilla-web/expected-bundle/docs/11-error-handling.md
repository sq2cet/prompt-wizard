# Phase 11: Error handling

> Error taxonomy, retry policy, idempotency, timeouts, error UX.

**Mode:** detailed

## What categories of errors exist, and how should each be handled?
> User input, dependency failure, auth, rate limit, internal bug — for each, what is the response?

Bad CSV row → log and skip; localStorage write failure → toast.

## How does the user see errors?

Toast / inline notification (`toast`)

## How are critical errors surfaced to operators?

Logged at ERROR level (`log`)
