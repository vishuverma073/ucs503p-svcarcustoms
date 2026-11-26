# Week 5 : Rate limits could be bypassed

**Team focus this week:** Payments and COD  
**Work this week:** Rate limiting for OTP and login

## Error

An attacker could get a fresh OTP and login budget on every request.

## Relevant Context

Rate-limit keys used the leftmost `X-Forwarded-For` address.

## Key Observation

The client sets that header itself, so it can rotate it at will.

## Solution

Keys now use `Fly-Client-IP`, then `X-Real-IP`, and only then the last `X-Forwarded-For` hop (added by our proxy).

**Because** only trust headers your own infrastructure sets.
