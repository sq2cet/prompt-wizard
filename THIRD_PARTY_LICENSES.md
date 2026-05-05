# Third-party licences

The wizard's source tree vendors third-party software. Each vendored copy
keeps its full licence text alongside the source under `src/vendor/`.

## JSZip 3.10.1

- **Source:** https://github.com/Stuk/jszip
- **Vendored at:** `src/vendor/jszip/jszip.min.js`
- **Full licence text:** `src/vendor/jszip/LICENSE.markdown`
- **Licence summary:** dual MIT / GPLv3. This project uses JSZip under the
  MIT terms.

```
The MIT License
===============

Copyright (c) 2009-2016 Stuart Knightley, David Duponchel, Franz Buchinger, António Afonso

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

The GPLv3 alternative is reproduced in full in
`src/vendor/jszip/LICENSE.markdown`. We do not redistribute under the
GPLv3 terms; the dual licence simply gives downstream consumers the
choice.

## Build verification

`build.py` verifies the SHA-256 of the vendored JSZip on every build
against the pin in `src/vendor/jszip/SHA256SUMS`. A mismatch fails the
build with a clear error so the version is never updated silently.
