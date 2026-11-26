# Week 3 : Shop menu closed before links could be clicked

**Team focus this week:** Login and accounts  
**Work this week:** Shop mega-menu

## Error

Moving the mouse from the Shop button into the mega-menu closed it.

## Relevant Context

The menu closed on `mouseleave`.

## Key Observation

A small gap between button and panel fired `mouseleave`.

## Solution

Added a 160 ms close delay, cancelled on re-enter.

**Because** hover menus need a short grace period to cross gaps.
