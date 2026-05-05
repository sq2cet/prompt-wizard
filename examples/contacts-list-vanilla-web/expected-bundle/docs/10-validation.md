# Phase 10: Validation

> System-wide validation strategy, where enforced, sanitisation.

**Mode:** detailed

## How is input validated?
> Type checks, format checks, range / length, allowed values, business-rule checks — describe at a high level.

Type-check on entry; reject empty mandatory fields.

## Where is validation enforced?

- On the client (UI form)

## What happens when validation fails?

Sanitise / coerce silently (`sanitise`)
