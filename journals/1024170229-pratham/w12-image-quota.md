# Product images stopped loading

## Error

Product and category images returned errors on the live site; the HTML still
loaded.

## Relevant Context

Images were served through Next.js `<Image>`, which resizes them with
Vercel's image optimiser. Product photos are stored in Supabase Storage.

## Key Observation

The project had used up the free plan's monthly image-optimisation quota, so
Vercel refused to resize any more images.

## Solution

A custom image loader builds URLs for Supabase's image rendering endpoint
(`/storage/v1/render/image/...?width=...&quality=...`), so resizing happens in
Supabase and Vercel's optimiser is no longer used.

**Because** the store already hosts its images in Supabase, letting the same
service resize them removes a second quota from the critical path.
