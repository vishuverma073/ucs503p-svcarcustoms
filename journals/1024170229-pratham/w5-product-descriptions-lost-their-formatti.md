# Week 5 : Product descriptions lost their formatting

**Team focus this week:** Payments and COD  
**Work this week:** Product detail page

## Error

Descriptions with "Key Features" and "Specifications" showed as one paragraph.

## Relevant Context

Imported descriptions contain newlines.

## Key Observation

HTML collapses whitespace by default.

## Solution

Rendered descriptions with `whitespace-pre-line`.

**Because** cSS decides how whitespace in text is shown.
