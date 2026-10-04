# ADR 0003: Integer minor-unit strings

Status: accepted — 2026-10-04

Canonical money uses positive integer strings named `amountMinor`. Strings survive JSON without IEEE-754 range or rounding problems. Currency metadata supplies the exponent; adapters convert at the provider boundary. The implementation does not assume two decimal places.
