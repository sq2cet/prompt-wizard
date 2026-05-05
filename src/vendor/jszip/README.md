# JSZip — vendored copy

- **Version:** 3.10.1
- **Source:** https://github.com/Stuk/jszip — release v3.10.1
- **Mirror used during vendoring:** `https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js`
- **Licence:** dual MIT / GPLv3. This project uses the MIT terms. The full
  licence text is in `LICENSE.markdown`.
- **SHA-256 pin:** see `SHA256SUMS`. `build.py` verifies the file against
  this pin on every build.

## Why vendored

The wizard ships as a single offline HTML file — every dependency must be
embedded at build time. Vendoring with a SHA pin gives reproducibility and
catches accidental upgrades or supply-chain tampering.

## Updating

To bump the version:

1. Replace `jszip.min.js` from the new release.
2. Replace `LICENSE.markdown` if the upstream copy changed.
3. Recompute the SHA: `shasum -a 256 jszip.min.js > SHA256SUMS`
4. Run the test suite (`build.py build && build.py validate && open
   prompt-wizard.html`) and exercise the Generate button.
