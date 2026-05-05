# Tech stack

## Form factor

- **Primary:** web

**Why this choice:** Single-page web app fits the use case; no need for a backend.

## Recommended stacks

### Next.js + SQLite

Fullstack with file-based DB, batteries-included.

**Pros:**
- Batteries-included framework — routing, SSR, build all in one.
- SQLite needs no server; good for personal-scale apps.

**Cons:**
- React-heavy.
- SQLite has practical write-concurrency limits.

**Prerequisites:** `node`, `git`
