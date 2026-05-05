# Phase 1: Vision

> One-sentence pitch, problem solved, success criteria, quality bar.

**Mode:** detailed

## In one sentence, what is this app?
> A short summary in plain language — no technical terms required. Imagine telling a friend in one breath.

ESP32 temperature sensor that POSTs readings to a webhook every 5 minutes.

## What problem does it solve?
> Why does this need to exist? Who is hurting today and how does this app help?

I want long-term temperature logs for the apartment but do not want to run a Pi 24/7. An ESP32 sleeps between readings and uses a few mA.

## How will you know when it is working?
> One bullet per success signal. Be concrete (e.g. "I can add an expense in under 10 seconds").

- The board boots, joins Wi-Fi, posts a reading, deep-sleeps, and wakes again on schedule.
- Readings appear in the receiving webhook (e.g. an InfluxDB / Grafana set-up) with correct timestamps.
- The board recovers automatically from a Wi-Fi or webhook outage.

## How polished does this need to be?
> This drives how strict subsequent phases are about logging, testing, deployment, etc.

Personal (`personal`)
