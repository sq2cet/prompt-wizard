# Tech stack

## Form factor

- **Primary:** cli

**Why this choice:** A one-shot script I run when I dump a card from the camera; a CLI is the most ergonomic shape.

## Mandated stack (per `docs/15-constraints.md`)

> The user has mandated:
> 
> Python with click for argument parsing.

The catalog recommendation engine is **suppressed** for this build — use the mandated stack as written. Do not propose alternatives unless the human asks.

The catalog suggestions below are kept for reference only. **Treat them as inadmissible** unless the human revises the constraint.

## Catalog reference (do not use unless the constraint is revised)

### Python + click

Standard library + click for ergonomic argument parsing.

**Pros:**
- Wide ecosystem.
- Easy to ship as a single file.

**Cons:**
- Python startup time is non-zero.

**Prerequisites:** `python`
