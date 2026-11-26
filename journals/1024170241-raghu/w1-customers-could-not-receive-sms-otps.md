# Week 1 : Customers could not receive SMS OTPs

**Team focus this week:** Requirements and project setup  
**Work this week:** Email-OTP login (switched from SMS)

## Error

The first login sent OTPs by SMS, which needed a registered SMS template before it could go live.

## Relevant Context

Auth routes, contracts, frontend pages and tests all assumed phone numbers.

## Key Observation

Email delivery (Resend) needed no approval and was cheaper.

## Solution

Migration 0009 adds email auth; routes, contracts, pages, mocks and tests switched from phone to email OTP. SMS is kept only for order updates.

**Because** choosing a channel the business can actually use unblocks launch.
