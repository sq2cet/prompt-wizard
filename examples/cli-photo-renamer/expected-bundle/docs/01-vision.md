# Phase 1: Vision

> One-sentence pitch, problem solved, success criteria, quality bar.

**Mode:** detailed

## In one sentence, what is this app?
> A short summary in plain language — no technical terms required. Imagine telling a friend in one breath.

Rename JPEG and HEIC photos in a directory to YYYYMMDD-HHMM based on the EXIF capture timestamp.

## What problem does it solve?
> Why does this need to exist? Who is hurting today and how does this app help?

My camera dumps files like IMG_4521.JPG with no useful sort order. I want stable date-based names so chronological browsing works in any tool.

## How will you know when it is working?
> One bullet per success signal. Be concrete (e.g. "I can add an expense in under 10 seconds").

- Pointing the tool at a folder of mixed-camera shots produces consistent date-prefixed filenames.
- Photos without an EXIF timestamp are flagged, not silently renamed.
- Running the tool twice on the same folder is a no-op.

## How polished does this need to be?
> This drives how strict subsequent phases are about logging, testing, deployment, etc.

Personal (`personal`)
