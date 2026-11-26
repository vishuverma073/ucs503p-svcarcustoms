# Domain redirects: svcarcustoms.com → www.svcarcustoms.in

I checked this on 2026-11-07 with read-only GET/HEAD requests. Nothing in DNS or domain config was changed.

## What each host returns today

| URL | Response | Served by | Final |
|---|---|---|---|
| `https://www.svcarcustoms.in/` | 200 | Vercel | itself (canonical origin) |
| `https://svcarcustoms.in/` | **308** → `https://www.svcarcustoms.in/` | Vercel | OK, 1 hop |
| `http://svcarcustoms.com/` | 301 → `https://svcarcustoms.com/` → 301 → `https://www.svcarcustoms.com/` | Cloudflare | **200 on .com** |
| `https://svcarcustoms.com/` | 301 → `https://www.svcarcustoms.com/` | Cloudflare | **200 on .com** |
| `https://www.svcarcustoms.com/` | **200**, a static copy of the old site | Cloudflare | itself |
| `https://www.svcarcustoms.com/robots.txt` | 200, `Allow: /`, sitemap = .com | Cloudflare | |
| `https://www.svcarcustoms.com/sitemap.xml` | 200, lists only `https://www.svcarcustoms.com/` | Cloudflare | |

The problem is that `www.svcarcustoms.com` is still a live, indexable site. Its home page has `<link rel="canonical" href="https://www.svcarcustoms.com/">`, so it competes with the .in site and does not pass any signals to it. Its old deep URLs (`/shop/...`, `/about-us`) now return **404**, so any old product or category URLs Google still has indexed are dead ends instead of redirects.

## Old .com URL → new .in URL

I could only work out old URLs from the links on the archived .com home page. The .com sitemap lists the home page and nothing else, and the old product URLs are not in any file that is still served. For the old product URLs that Search Console shows, use the pattern rules below the table.

| Old URL (.com) | Status now | Redirect to (.in) |
|---|---|---|
| `/` | 200 | `https://www.svcarcustoms.in/` |
| `/shop/all` | 404 | `https://www.svcarcustoms.in/shop` |
| `/shop/Virtus?cid=5914658` | 404 | `https://www.svcarcustoms.in/category/virtus-slavia` |
| `/shop/Spoilers?cid=6229344` | 404 | `https://www.svcarcustoms.in/category/spoilers` |
| `/shop/Universal?cid=5914304` | 404 | `https://www.svcarcustoms.in/category/universal` |
| `/about-us` | 404 | `https://www.svcarcustoms.in/about` |
| `/cart` | — | `https://www.svcarcustoms.in/cart` |
| `/wishlist` | — | `https://www.svcarcustoms.in/` (the new site has no wishlist; this is the only home-page target, because nothing else is equivalent) |
| any other path | 404 | same path on `https://www.svcarcustoms.in` (path-preserving; the .in site returns a proper 404 with store navigation for unknown paths) |

Pattern rules for old URLs from Search Console (Performance → Pages, filter by `svcarcustoms.com`):

- `/shop/<Name>?cid=<n>` goes to `/category/<slug>`. Pick the slug from the live category list in https://www.svcarcustoms.in/sitemap.xml: audi, body-kits, jdm-style-bags, spoilers, hilux, maruti, paddle-shifters, virtus-slavia, steering-wheels, exhaust-tips, gear-knob, universal, bmw, thar, polo, verna-2023, skoda, honda, air-intakes, exhausts.
- An old product URL goes to `/product/<slug>` when the same item exists in the .in sitemap. Match by product name. If no equivalent product exists, let it fall through to the path-preserving rule, which gives a real 404. Do **not** send dead products to the home page, because Google treats that as a soft 404.

## What the owner needs to do

`svcarcustoms.com` is on **Cloudflare** (the `server: cloudflare` header), not on Vercel. Pick **one** of the two options.

### Option A: redirect in Cloudflare (keeps .com DNS where it is) — recommended

1. Cloudflare dashboard → select the `svcarcustoms.com` zone.
2. **Rules → Redirect Rules → Create rule**. Name it `com-to-in-specific`. Under "If incoming requests match…", choose **Custom filter expression** → Edit expression:
   `(http.host in {"svcarcustoms.com" "www.svcarcustoms.com"} and http.request.uri.path eq "/shop/Virtus")`
   Then → **Static** → URL `https://www.svcarcustoms.in/category/virtus-slavia`, status **301**, untick "Preserve query string". Deploy.
   Add one rule like this for each row of the table above. A **Bulk Redirect list** (Rules → Bulk Redirects) is quicker if there are many: one row per old URL, 301, with "Include subdomains" on.
3. Create a last rule, `com-to-in-catchall`, ordered **after** the specific ones:
   `(http.host in {"svcarcustoms.com" "www.svcarcustoms.com"})`
   Then → **Dynamic** → expression `concat("https://www.svcarcustoms.in", http.request.uri.path)`, status **301**, tick "Preserve query string". Deploy.
4. If the static .com copy is a Cloudflare Pages/Workers project, remove its custom domain (Workers & Pages → project → Custom domains). This makes sure the redirect rule answers and not the old page. Then check the step below.

### Option B: move .com to Vercel and redirect there

1. Vercel dashboard → project **svcar-india** → **Settings → Domains → Add Domain** → `svcarcustoms.com` → choose **Redirect to** `www.svcarcustoms.in`, status **308 Permanent**. Do the same for `www.svcarcustoms.com`.
2. Vercel then shows the DNS records it needs (A `76.76.21.21` for the apex, CNAME `cname.vercel-dns.com` for www). Put these in at Cloudflare (DNS → Records, **proxy off / DNS only**), replacing the current records. This step is a DNS change, so the owner has to make it.
3. Note: Vercel's domain redirect keeps the path (`/shop/Virtus` → `https://www.svcarcustoms.in/shop/Virtus`, which is a 404). The specific `/shop/...` → `/category/...` mappings would then need code redirects in `svcar-india/next.config.ts` with a `has: [{ type: "host", value: "(www\\.)?svcarcustoms\\.com" }]` condition. That file is a restricted path, so I did not change it here.

### Check afterwards

```
curl -sI https://www.svcarcustoms.com/ | grep -iE '^(HTTP|location)'          # expect 301/308 → https://www.svcarcustoms.in/
curl -sI "https://svcarcustoms.com/shop/Virtus?cid=5914658" | grep -i location # expect /category/virtus-slavia
curl -sI https://svcarcustoms.in/ | grep -i location                           # expect https://www.svcarcustoms.in/
```

Then in Google Search Console: add and verify the `svcarcustoms.com` Domain property → Settings → **Change of address** → new site `https://www.svcarcustoms.in`. Then submit `https://www.svcarcustoms.in/sitemap.xml` in the .in property.
