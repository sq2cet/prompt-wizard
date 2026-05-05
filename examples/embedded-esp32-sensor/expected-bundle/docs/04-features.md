# Phase 4: Features

> MUST · SHOULD · NICE-to-have, numbered and testable.

**Mode:** detailed

## What features are absolutely required?
> One feature per line. Testable phrasing helps — "user can sign in" beats "good auth".

- Read temperature from a DS18B20 / SHT30 sensor.
- POST JSON {ts, c, rh} to a configurable URL.
- Deep-sleep between readings.

## What features would be very nice to have?
> Important but not blocking — the build plan can de-prioritise these if needed.

- OTA firmware update.
- Battery-voltage reporting.

## What features are bonus, future, or experimental?
> Anything worth recording so it is not forgotten, but not part of v1.

- Local on-board screen showing the latest reading.

## If you could only ship one feature, which is the one users will love most?

Months of uptime on a single 18650 cell.
