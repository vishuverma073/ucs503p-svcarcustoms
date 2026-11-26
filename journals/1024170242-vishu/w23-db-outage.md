# Store went offline — database connection refused

## Error

Admin sign-in failed and the storefront showed empty pages. API logs:

```
Error: connect ECONNREFUSED [2406:da14:...]:5432
```

## Relevant Context

`DATABASE_URL` pointed at Supabase's **direct** database host, which resolves
to an IPv6 address.

## Key Observation

The API host could not open the IPv6 connection, so every database query
failed. Cached storefront pages that were regenerated during the outage came
back empty.

## Solution

Switch `DATABASE_URL` to Supabase's **session pooler**
(`aws-1-ap-northeast-1.pooler.supabase.com:5432`), which is reachable over
IPv4, and restart the API. Then re-save the home page, products and categories
in the admin panel to refresh the cached pages.

**Because** the pooler gives an IPv4 endpoint, which every host supports.
