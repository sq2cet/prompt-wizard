# Architecture

Primary form factor: **embedded**. The build agent chooses the file structure to match the recommended stack in `meta/tech-stack.md`.

## Data flow

```
INPUT  →  PROCESS  →  EXCHANGE  →  STORE  →  OUTPUT
```

Each step is detailed in its corresponding `docs/0N-data-*.md` file. The build agent should map these to concrete components in the chosen stack and confirm the mapping with the human if it is non-obvious.