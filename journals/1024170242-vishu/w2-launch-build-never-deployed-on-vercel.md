# Week 2 : Launch build never deployed on Vercel

**Team focus this week:** Catalogue and admin panel  
**Work this week:** Fixed the storefront deployment pipeline

## Error

`pnpm install --frozen-lockfile` failed on Vercel and the launch build did not go live.

## Relevant Context

`svcar-india` uses npm (`package-lock.json`), but a stray, outdated `pnpm-lock.yaml` had been committed.

## Key Observation

Vercel picks the package manager from the lockfile it finds; it chose pnpm and the pnpm lockfile was out of date.

## Solution

Deleted the stray `pnpm-lock.yaml`, so Vercel used the in-sync `package-lock.json` and `npm ci` passed.

**Because** a project must have exactly one lockfile for one package manager.
