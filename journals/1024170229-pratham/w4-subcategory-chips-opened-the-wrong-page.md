# Week 4 : Subcategory chips opened the wrong page

**Team focus this week:** Vehicle fitment and navigation  
**Work this week:** Category menu and subcategory chips

## Error

Clicking a subcategory chip sometimes opened the parent category.

## Relevant Context

A full-card link was stretched underneath the chips.

## Key Observation

Overlapping links: the click could resolve to the link behind.

## Solution

Restructured so the photo, title and each chip are separate links; all 31 menu links checked.

**Because** interactive elements should never overlap.
