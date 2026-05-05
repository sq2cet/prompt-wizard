# Tech stack

## Form factor

- **Primary:** web
- **Secondary:** api

**Why this choice:** Single-page web app is what I will use day to day; the embedded API is just for the front-end to call.

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
