# Week 1 : Product names could inject a script

**Team focus this week:** Requirements and project setup  
**Work this week:** SRS draft; security review of structured data

## Error

Security review: a product name containing `</script>` would break out of the JSON-LD block.

## Relevant Context

Structured data is printed inside a `<script type="application/ld+json">` tag.

## Key Observation

Any `</script>` inside the JSON ends the tag early, allowing stored XSS.

## Solution

Escape `</script>` (and `<`) when writing JSON-LD; covered by tests.

**Because** data placed inside HTML must be escaped for that context.
