# Phase 9: Data — Output

> Formats, channels, real-time vs batch, recipients, failure modes.

**Mode:** detailed

## What does the system produce?
> A web UI, a JSON API response, a file, a notification, a report — describe each output.

On-screen table; CSV / JSON downloads.

## Which channels carry the output?

- On-screen UI
- Downloadable file

## Is output produced in real time or in batches?

Real time (`realtime`)

## Phase comment

> [user note] The CSV format should use a header row and quote fields containing commas. Validation: name and email are required, email must match a basic pattern, duplicate emails should be rejected on import with a summary of skipped rows.
