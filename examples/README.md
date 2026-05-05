# Worked examples

Each subdirectory holds a realistic, end-to-end wizard run for a different form factor:

| Folder                          | Form factor      | One-line idea                                                              |
|---------------------------------|------------------|----------------------------------------------------------------------------|
| `web-expense-tracker/`             | Web app          | A personal expense tracker with categories and monthly summaries.          |
| `cli-photo-renamer/`               | CLI tool         | Rename photos to YYYYMMDD-HHMM based on EXIF timestamps.                   |
| `mobile-habit-tracker/`            | Mobile app       | Habit tracker for iPhone with a home-screen widget.                        |
| `ml-photo-classifier/`             | ML pipeline      | Classify a personal photo library into people / places / things.           |
| `embedded-esp32-sensor/`           | Embedded / IoT   | ESP32 temperature sensor that POSTs readings to a webhook every 5 minutes. |
| `contacts-list-vanilla-web/`       | Web app (V2.0)   | Contacts CRUD — regression carrier for R1–R8 from the V1 user-test review. |
| `web-expense-tracker-with-review/` | Web app (V2.7)   | Same domain as `web-expense-tracker/` but with a populated `ai_review` (2 iterations, all 6 issue kinds, accept / change / reject / defer mix). Locks V2.7's `notes/ai-review.md` + open-questions emission. |

Each directory contains:

- `state.json` — the raw wizard state. Drop this into the wizard's localStorage (or use the
  Import button — see the wizard's Review screen) to load the example.
- `expected-bundle/` — the ZIP contents the Generator should emit for this state, file by file.
  The CI snapshot test asserts `Generator(state) === expected-bundle/` byte-for-byte. If you
  change the Generator and a snapshot diverges, regenerate intentionally:

  ```bash
  python3 build.py snapshot --update     # re-bake every expected-bundle/
  python3 build.py snapshot               # verify nothing else regressed
  ```

## Why these five

They cover the breadth of form factors the wizard recommends stacks for, exercise different
question kinds (text · longtext · list · radios · checkboxes · pills), and produce bundles whose
content is materially different. A regression that affects "all bundles" should fail multiple
snapshots; one that only affects ML pipelines should fail just `ml-photo-classifier`.
