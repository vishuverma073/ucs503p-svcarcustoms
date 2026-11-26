# Week 8 : Search and login pages claimed to be the home page

**Team focus this week:** Testing, fixes and launch  
**Work this week:** Canonical URL test; final reports and docs

## Error

Search Console treated search, login and 404 pages as duplicates of the home page.

## Relevant Context

The root layout set `canonical: "/"`, inherited by every page without its own.

## Key Observation

An inherited canonical told Google each page was a copy of `/`.

## Solution

Home sets its own canonical; the layout sets none; a test fails if this regresses.

**Because** next.js layout metadata is inherited by child pages.
