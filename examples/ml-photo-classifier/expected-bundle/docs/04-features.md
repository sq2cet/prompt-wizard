# Phase 4: Features

> MUST · SHOULD · NICE-to-have, numbered and testable.

**Mode:** detailed

## What features are absolutely required?
> One feature per line. Testable phrasing helps — "user can sign in" beats "good auth".

- Walk a directory of JPEG/PNG/HEIC photos.
- Run a pre-trained classifier and emit tags.
- Query the resulting tag store from the CLI.

## What features would be very nice to have?
> Important but not blocking — the build plan can de-prioritise these if needed.

- Cache classifier output so re-runs only process new files.
- Support a custom labels file.

## What features are bonus, future, or experimental?
> Anything worth recording so it is not forgotten, but not part of v1.

- GPU acceleration on CUDA / Metal.

## If you could only ship one feature, which is the one users will love most?

I never manually tag a photo again.
