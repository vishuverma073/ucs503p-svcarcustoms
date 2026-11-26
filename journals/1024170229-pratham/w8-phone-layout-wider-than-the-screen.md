# Week 8 : Phone layout wider than the screen

**Team focus this week:** Testing, fixes and launch  
**Work this week:** Mobile fixes and design refresh

## Error

The home page was 657 px wide on a 390 px phone.

## Relevant Context

The hero used a two-column grid with long text.

## Key Observation

Grid children default to `min-width: auto` and refuse to shrink.

## Solution

One column on phones, `min-w-0` on grid children, `break-words`.

**Because** `min-width: 0` lets grid and flex items shrink.
