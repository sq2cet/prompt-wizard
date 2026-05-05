# Phase 9: Data — Output

> Formats, channels, real-time vs batch, recipients, failure modes.

**Mode:** detailed

## What does the system produce?
> A web UI, a JSON API response, a file, a notification, a report — describe each output.

JSONL on disk; CLI subcommand prints filtered results.

## Which channels carry the output?

- On-screen UI
- Downloadable file

## Is output produced in real time or in batches?

Batched (periodic) (`batch`)
