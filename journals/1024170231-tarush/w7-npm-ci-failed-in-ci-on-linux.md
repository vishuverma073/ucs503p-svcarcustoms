# Week 7 : `npm ci` failed in CI on Linux

**Team focus this week:** Security and guest checkout  
**Work this week:** CI workflows

## Error

CI failed: package.json and package-lock.json were not in sync.

## Relevant Context

The lockfile was generated with `legacy-peer-deps=true`.

## Key Observation

That setting leaves optional peer dependencies out; a clean Linux install expects them.

## Solution

Project `.npmrc` with `legacy-peer-deps=false` and a regenerated lockfile.

**Because** a lockfile is reproducible only with the same npm settings everywhere.
