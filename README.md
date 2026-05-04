# prompt-wizard

A standalone, single-file HTML wizard that helps non-technical users articulate an application idea
top-down and produce a comprehensive prompt for [Claude Code](https://docs.claude.com/en/docs/claude-code)
to build the application.

## Status

Early development. The wizard ships as one file (`prompt-wizard.html`) that runs in any modern browser
with no install, no build, and no internet at runtime. See [docs/PLAN.md](docs/PLAN.md) for the full
specification (work in progress).

## Concept

The wizard walks the user through 15 phases — vision, audience, form factor, features, the five data
dimensions (input · process · exchange · store · output), validation, error handling, logging &
observability, operations, compliance, and constraints. Each phase offers Detailed / Simplified / Skip
modes. Each question offers an explicit "Defer" state for "I don't know — Claude should ask".

Output is a multi-file ZIP bundle: a short master `PROMPT.md` plus per-phase docs and synthesis docs
that Claude Code consumes to drive a complete build with verification gates at every step.

## Repository conventions

- All paths in documentation are relative to `$PROJECT_ROOT` (this directory).
- Build is reproducible given fixed inputs; see `build.py`.
- The repo includes a sanitisation gate (`build.py` + pre-commit hook + CI) that runs on every change.

## License

MIT — see [LICENSE](LICENSE).

## Third-party

See [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) (vendored dependencies will be listed there as
they are added).
