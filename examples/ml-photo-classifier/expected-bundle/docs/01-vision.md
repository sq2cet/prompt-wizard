# Phase 1: Vision

> One-sentence pitch, problem solved, success criteria, quality bar.

**Mode:** detailed

## In one sentence, what is this app?
> A short summary in plain language — no technical terms required. Imagine telling a friend in one breath.

Classify a personal photo library into rough buckets — people, places, things — using a pre-trained vision model.

## What problem does it solve?
> Why does this need to exist? Who is hurting today and how does this app help?

I have thousands of photos and want to find 'every shot with a dog' or 'every landscape' without manually tagging.

## How will you know when it is working?
> One bullet per success signal. Be concrete (e.g. "I can add an expense in under 10 seconds").

- Running the classifier on a 5 000-photo library produces tag JSON-Lines output without crashing.
- Top-1 accuracy on a 100-photo manually-labelled validation set is at least 70%.
- I can ask the CLI to print every photo tagged with a given label.

## How polished does this need to be?
> This drives how strict subsequent phases are about logging, testing, deployment, etc.

Personal (`personal`)
