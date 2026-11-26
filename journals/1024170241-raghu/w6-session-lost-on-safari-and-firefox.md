# Week 6 : Session lost on Safari and Firefox

**Team focus this week:** SEO, images and performance  
**Work this week:** Session cookies via same-origin proxy

## Error

Safari and Firefox users were logged out after about 15 minutes.

## Relevant Context

The refresh cookie came from the API's domain, different from the storefront's.

## Key Observation

For the storefront that is a third-party cookie, which these browsers block.

## Solution

All session calls go through a same-origin Next.js proxy, so the cookie is first-party.

**Because** a cookie is first-party only for the site in the address bar.
