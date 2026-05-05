# Tech stack

## Form factor

- **Primary:** cli

**Why this choice:** A one-shot script I run when I dump a card from the camera; a CLI is the most ergonomic shape.

## Recommended stacks

### Python + click

Standard library + click for ergonomic argument parsing.

**Pros:**
- Wide ecosystem.
- Easy to ship as a single file.

**Cons:**
- Python startup time is non-zero.

**Prerequisites:** `python`
