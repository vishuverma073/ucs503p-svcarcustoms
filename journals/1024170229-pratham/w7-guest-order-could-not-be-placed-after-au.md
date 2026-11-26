# Week 7 : Guest order could not be placed after autofill

**Team focus this week:** Security and guest checkout  
**Work this week:** Guest checkout form

## Error

On a phone, browser autofill broke the mobile number and the order could never be placed.

## Relevant Context

The input had `maxLength=10`.

## Key Observation

Autofill inserts "+91 98765 43210", which was cut to "+91 98765 ".

## Solution

Input accepts any length; `toMobile10()` strips +91, 91, 0 and spaces. City/state filled from the PIN also clear their errors.

**Because** validate after normalising input, not by limiting what can be typed.
