# Week 7 : OTP attempt limit could be bypassed

**Team focus this week:** Security and guest checkout  
**Work this week:** Security hardening (OTP attempts)

## Error

Many simultaneous guesses got more than the 5 permitted attempts.

## Relevant Context

Each guess read `attempts`, checked it, then wrote `attempts + 1`.

## Key Observation

Read-then-write race: concurrent requests all read the same old value.

## Solution

One atomic `UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1 AND attempts < 5 RETURNING id`; no row means 429.

**Because** a single conditional UPDATE is atomic in PostgreSQL.
