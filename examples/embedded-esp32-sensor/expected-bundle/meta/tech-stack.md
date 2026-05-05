# Tech stack

## Form factor

- **Primary:** embedded

**Why this choice:** The whole project is about a microcontroller; nothing else matches.

## Mandated stack (per `docs/15-constraints.md`)

> The user has mandated:
> 
> ESP32 + PlatformIO + ESP-IDF.

The catalog recommendation engine is **suppressed** for this build — use the mandated stack as written. Do not propose alternatives unless the human asks.

**Forbidden tech** (also from constraints): Arduino IDE (use PlatformIO for reproducible builds).

The catalog suggestions below are kept for reference only. **Treat them as inadmissible** unless the human revises the constraint.

## Catalog reference (do not use unless the constraint is revised)

_(No catalog entry for primary form factor `embedded`. The build agent should propose a stack based on the constraints in `docs/15-constraints.md` and confirm with the human.)_