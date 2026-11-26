# Session lost on Safari and Firefox

## Error

Customers on Safari and Firefox were logged out after about 15 minutes, while
Chrome users stayed logged in.

## Relevant Context

The access token is short-lived; the browser renews it with a refresh token
kept in an httpOnly cookie. That cookie was set by the API's own domain
(Fly.io), while the storefront runs on a different domain (Vercel).

## Key Observation

From the storefront's point of view, a cookie set by the API domain is a
**third-party cookie**. Safari (ITP) and Firefox (Total Cookie Protection)
block third-party cookies by default, so the refresh request carried no
cookie and failed.

## Solution

Route all session calls through a same-origin proxy in Next.js
(`/api/auth/...` on the storefront domain), which forwards to the API. The
refresh cookie is now set by the storefront's own domain, so it is
first-party in every browser.

**Because** a cookie is first-party only when it belongs to the site shown in
the address bar.
