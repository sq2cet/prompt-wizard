# Phase 12: Logging & observability

> What/where/format/levels/retention, masking, metrics, traces, alerts, SLOs, audit.

**Mode:** detailed

## What gets logged, and to where?
> Requests, errors, business events, security events, performance — and the destination (stdout, file, central system).

Application events at INFO; errors with stack at ERROR; structured JSON to stdout.

## What log format?

Structured (JSON) (`structured`)

## Beyond logs, what observability is in place?

- Health-check endpoints

## Are personal data / secrets masked in logs?

Yes
