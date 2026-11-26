# Week 1 : Menu button pushed off-screen on phones

**Team focus this week:** Requirements and project setup  
**Work this week:** Storefront header and theme

## Error

On small phones the hamburger menu overflowed off the screen; in dark mode the menu text was invisible.

## Relevant Context

Header had a large logo, wide icon padding and a theme toggle on every size.

## Key Observation

Too many fixed-width items for a 360 px header; the drawer had a white background that dark mode did not override.

## Solution

Smaller logo and icon padding on mobile, theme toggle hidden below `sm`, and a `.dark` override for the drawer background.

**Because** design phone layout first, then add items for larger screens.
