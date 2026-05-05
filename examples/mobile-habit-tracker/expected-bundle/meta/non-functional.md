# Non-functional requirements

## Accessibility
- Target: `best_effort`

## Internationalisation
- Multi-language: no / unspecified

## Scale
- Expected user base: `small`

## Validation strategy
Type-check on entry; reject empty mandatory fields with an inline message.

## Error handling
Bad input → reject inline. Missing dependency → fail loudly. Unexpected exceptions → log and surface a generic 'Something went wrong, please retry'.

## Logging & observability
Application events at INFO; errors with stack at ERROR; structured JSON to stdout.