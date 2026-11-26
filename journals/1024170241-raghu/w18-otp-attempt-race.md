# OTP attempt limit could be bypassed

## Error

A security audit (7 Oct) showed that sending many OTP guesses at the same
moment allowed more than the 5 permitted attempts.

## Relevant Context

On each guess the API read the row's `attempts` value, checked it against
`MAX_ATTEMPTS`, and then wrote back `attempts + 1`.

## Key Observation

This is a **read-then-write race**: concurrent requests all read the same
stale `attempts` value before any of them wrote, so each one passed the check.

## Solution

Claim the attempt atomically in one SQL statement:

``` sql
UPDATE otp_codes SET attempts = attempts + 1
WHERE id = $1 AND consumed_at IS NULL AND attempts < 5
RETURNING id;
```

If no row comes back, the limit is reached and the API answers `429 Too many
attempts`.

**Because** a single conditional `UPDATE` is atomic in PostgreSQL, so only 5
requests can ever succeed.
