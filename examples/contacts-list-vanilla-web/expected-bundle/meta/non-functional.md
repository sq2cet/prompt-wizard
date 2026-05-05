# Non-functional requirements

## Accessibility
- Target: `best_effort`

## Internationalisation
- Multi-language: no / unspecified

## Scale
- Expected user base: `solo`

## Validation strategy
Type-check on entry; reject empty mandatory fields.

## Error handling
Bad CSV row → log and skip; localStorage write failure → toast.

## Logging & observability
Console-only; INFO + ERROR levels.