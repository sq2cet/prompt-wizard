# Third-party licences

This project will vendor the following third-party software. Licences are reproduced here in full
when each dependency is added to the source tree.

## Pending

- **JSZip** — MIT or GPL-3.0-or-later (this project uses the MIT terms). Will be vendored under
  `src/vendor/jszip/` with its `LICENSE.markdown` reproduced verbatim alongside.

## How attribution is verified

`build.py` will (when implemented) assert that every entry under `src/vendor/` has a corresponding
section in this file with the licence text, and will fail the build otherwise.
