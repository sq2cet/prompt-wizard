# Tech stack

## Form factor

- **Primary:** web

**Why this choice:** Single-page web app fits the use case; no need for a backend.

## Mandated stack (per `docs/15-constraints.md`)

> The user has mandated:
> 
> vanilla HTML/CSS/JavaScript, no build step, no external dependencies. One index.html file is acceptable.

The catalog recommendation engine is **suppressed** for this build — use the mandated stack as written. Do not propose alternatives unless the human asks.

**Forbidden tech** (also from constraints): Frameworks (React, Vue, etc.); package managers; build tools.

The catalog suggestions below are kept for reference only. **Treat them as inadmissible** unless the human revises the constraint.

## Catalog reference (do not use unless the constraint is revised)

### Next.js + SQLite

Fullstack with file-based DB, batteries-included.

**Pros:**
- Batteries-included framework — routing, SSR, build all in one.
- SQLite needs no server; good for personal-scale apps.

**Cons:**
- React-heavy.
- SQLite has practical write-concurrency limits.

**Prerequisites:** `node`, `git`
