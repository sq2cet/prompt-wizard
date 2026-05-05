# Architecture

Primary form factor: **web**. The build agent chooses the file structure to match the recommended stack in `meta/tech-stack.md`. Below are the high-level shape and the data flow drawn from the user's answers in `docs/05–09-data-*.md`.

## Data flow

```
INPUT  →  PROCESS  →  EXCHANGE  →  STORE  →  OUTPUT
```

Each step is detailed in its corresponding `docs/0N-data-*.md` file. The build agent should map these to concrete components in the chosen stack and confirm the mapping with the human if it is non-obvious.