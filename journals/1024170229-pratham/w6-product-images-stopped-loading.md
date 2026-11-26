# Week 6 : Product images stopped loading

**Team focus this week:** SEO, images and performance  
**Work this week:** Image loading through Supabase

## Error

Product and category images failed on the live site.

## Relevant Context

Images were resized by Vercel's image optimiser.

## Key Observation

The free monthly optimisation quota was used up.

## Solution

A custom image loader uses Supabase's image rendering endpoint.

**Because** resizing where the images are stored removes a second quota.
