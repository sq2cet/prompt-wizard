# Phase 5: Data — Input

> Sources, formats, volume, frequency, validation rules, failure modes.

**Mode:** detailed

## Where does data come from?
> User input, files, APIs, sensors, message queues, database reads — list each source with one line.

User typing into the form; CSV / JSON file uploads.

## In what formats does the data arrive?

- form-input
- JSON
- CSV

## Roughly how much data per day?

A trickle (megabytes) (`trickle`)

## How frequently does new data arrive?

Only when triggered (`ondemand`)

## Phase comment

> [user note] The CSV format should use a header row and quote fields containing commas. Validation: name and email are required, email must match a basic pattern, duplicate emails should be rejected on import with a summary of skipped rows.
