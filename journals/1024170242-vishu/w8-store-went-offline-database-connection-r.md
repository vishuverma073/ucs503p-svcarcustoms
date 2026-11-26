# Week 8 : Store went offline — database connection refused

**Team focus this week:** Testing, fixes and launch  
**Work this week:** Launch support (database outage)

## Error

Admin login failed and pages were empty; logs showed `ECONNREFUSED` to an IPv6 address on port 5432.

## Relevant Context

`DATABASE_URL` used Supabase's direct host, which resolves to IPv6.

## Key Observation

The API host could not open IPv6 connections.

## Solution

Switched to Supabase's session pooler (IPv4) and restarted the API; re-saved home, products and categories to refresh cached pages.

**Because** the pooler gives an IPv4 endpoint that every host supports.
