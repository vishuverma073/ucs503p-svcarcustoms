# Google Merchant Center setup — SV Car Customs

This guide puts the SV Car Customs products on Google Shopping (the **Shopping** tab and
product results on Google Search) for free. Follow the steps in order. Each step tells you
exactly where to click.

**Time needed:** about 45 minutes, then 3–7 days while Google reviews the products.

**You need:**

- The Google account that owns **Google Search Console** for `www.svcarcustoms.in`
  (use the same account everywhere below — it makes the linking one click).
- Access to the **Vercel** project (only if you use the HTML-tag method in Step 2).
- The **GA4** property and the **Google Business Profile** of the shop (Steps 7 and 8).

> **Before you start:** the website must be live. If Vercel is paused, the site shows an
> error page and Google cannot verify the site or read the product feed. Resume the Vercel
> project first, then open https://www.svcarcustoms.in/feed.xml in a browser — you should see
> a page full of product data. If you see an error, stop and tell the developer.

---

## Step 1 — Create the Merchant Center account

1. Open **https://merchants.google.com** and sign in with the Search Console Google account.
2. Click **Get started** (or **Sign up for Merchant Center**).
3. Business details:
   - **Business name:** `SV Car Customs`
   - **Country:** India
   - **Where can customers buy your products?** → choose **On my website**.
   - **Website:** `https://www.svcarcustoms.in`
4. Contact details: phone `+91 92050 05425`, the shop address (Shop no. 2, Ground Floor,
   Plot no. 734-A, Opposite CISF Camp, Delhi 110061). Use the **same** address and phone
   that the website's Contact page shows — Google checks they match.
5. Accept the Terms of Service and click **Continue / Create account**.

## Step 2 — Verify and claim www.svcarcustoms.in

Google must confirm you own the website. Go to **Settings (gear icon) → Business details →
Website** (in some accounts: **Settings → Online store**). Click **Verify website**, then
choose **one** method:

### Method A (easiest) — Google Search Console

1. Choose **Verify using Google Search Console**.
2. Pick the property `https://www.svcarcustoms.in` and click **Continue**.
3. It works in one click **if this Google account is an "Owner" of that property** in
   Search Console. If it says you are not an owner: open Search Console → **Settings →
   Users and permissions** and make this account an **Owner**, then try again.

### Method B — HTML tag (only if Method A does not work)

1. Choose **Add an HTML tag**. Google shows something like
   `<meta name="google-site-verification" content="AbCdEf123..." />`.
2. Copy **only the value inside `content="..."`** (for example `AbCdEf123...`).
3. Open **Vercel → svcar project → Settings → Environment Variables**.
4. Find `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` (create it if missing), set the value you
   copied, environment **Production**, and **Save**.
5. Go to **Deployments → latest production deployment → ⋯ → Redeploy**. (The value only
   reaches the site after a new deployment.)
6. Back in Merchant Center, click **Verify**.

> **Careful:** the website can carry **only one** verification tag through this variable. If Search
> Console was verified with this same variable, changing it can break the Search Console
> verification. That is why Method A is better.

After verification, click **Claim website** if Google shows that button. The status should
become **Verified and claimed**.

## Step 3 — Shipping: free delivery, India

1. **Settings → Shipping and returns → Shipping services → Add shipping service**.
2. Fill in:
   - **Service name:** `Free delivery India`
   - **Country:** India · **Currency:** INR
   - **Order cut-off time / handling time:** **1 to 2 business days** (this is what the
     website's Shipping page says: orders are processed in 1–2 business days).
   - **Transit time:** enter the real courier time (minimum and maximum days) — ask your
     courier partner. The website does not promise a delivery date, so choose honest numbers.
   - **Shipping cost:** **Free shipping** (no minimum order value).
3. **Save**.

> The product feed already says shipping is ₹0 for every product. If you ever start
> charging a delivery fee in the admin panel, also change it here and tell the developer
> (the website title also says "Free delivery").

## Step 4 — Return policy: exchange only

Our real policy (website page **/refund**): **no returns and no refunds**. Only an item
**delivered damaged** is **exchanged**, if the customer claims within **4 days** with a
complete **unboxing video**. Orders cannot be cancelled.

1. **Settings → Shipping and returns → Return policies → Add return policy**.
2. **Country:** India.
3. **Return policy:** choose **No returns** / **Returns not accepted**.
   - Do **not** choose "returns accepted within 4 days" — Google would then show shoppers
     "4-day returns", which is not true (change-of-mind returns are not accepted). The
     damaged-item exchange is explained on the policy page.
4. **Return policy URL:** `https://www.svcarcustoms.in/refund`
5. **Save**.

## Step 5 — Add the product feed (daily automatic fetch)

1. Left menu → **Products → Add products** (or **Products → Feeds → Add product source**).
2. Choose **Add products from a file** → **Enter a link to your file**.
3. **File URL:** `https://www.svcarcustoms.in/feed.xml`
4. **Fetch frequency:** **Daily** · **Time:** e.g. 6:00 AM · **Time zone:** (GMT+05:30) India.
5. **Country of sale:** India · **Language:** English · **Currency:** INR.
6. Leave username/password empty. Click **Continue / Create**.
7. Click **Fetch now** once so you do not wait for the first scheduled fetch.

After 1–3 hours open **Products → All products**. Items show **Approved**, **Pending**
(under review), or **Needs attention**. Open any item in "Needs attention" to read the
reason, and send a screenshot to the developer if it is not clear.

## Step 6 — Turn on free listings

1. Left menu → **Marketing** (in some accounts **Growth → Manage programs**).
2. Find **Free listings** (or **Free product listings**) and click **Get started / Turn on**.
3. Confirm. Free listings show products on Google Search, Shopping, Images and Lens at no
   cost. (Paid Shopping ads are separate and need Google Ads — not part of this setup.)

## Step 7 — Link Google Analytics (GA4)

1. **Settings → Apps and services** (older menu: **Settings → Linked accounts**).
2. **Google Analytics → Link account**.
3. Choose the GA4 property of www.svcarcustoms.in (its measurement ID starts with `G-`;
   it is the `NEXT_PUBLIC_GA_ID` value in Vercel).
4. Click **Link**. Your Google account must be an **Editor** of that GA4 property.

## Step 8 — Link Google Business Profile

1. **Settings → Apps and services → Business Profile → Link**.
2. Choose the **SV Car Customs** profile (Delhi). The Google account must be an owner or
   manager of that profile; if the profile is under another email, first add this email as a
   manager in Business Profile (**Business Profile → ⋮ → Business Profile settings → People
   and access → Add**).
3. Click **Link**. Make sure the shop name, address and phone are the same everywhere
   (Business Profile, Merchant Center, website Contact page).

---

## Which products are NOT in the feed, and why

The feed leaves out some products on purpose. Google suspends the **whole account**
(without warning) if it thinks a store sells fake branded goods. These items stay on the
website; they are only kept out of Google Shopping:

| Reason | Products |
| --- | --- |
| Title names another brand (Akrapovic, Borla, Remus, Forge, MOMO, Sparco, Oettinger, Cardi, Windek) | Akrapovic exhaust tip · Borla Valvetronic exhausts (2) · Remus Valvetronic exhausts (3) · Forge air intakes (2) · MOMO universal steering · Sparco gear knob · Sparco/Bride backpack · Polo Oettinger spoiler · Cardi K4 ambient lights · Windek tyre inflator · Windek vacuum cleaner |
| Copies a carmaker's logo or badge | Virtus / Skoda / Polo / Honda City replacement logos · steering GT badges (2) · Virtus paddle shifter + GT badge combo |
| Says "OEM" or "Original" | Virtus/Slavia OEM GT spoiler · Land Cruiser Original carbon fibre steering wheel |
| Second copy of another listing | Remus single tip (2nd listing) · Sparco/Bride backpack (2nd listing) · Polo Q2 tail lights red (2nd listing) |

**If any of these are genuine** (for example real Cardi or Windek products bought from the
brand or its distributor, or real OEM Volkswagen parts), tell the developer which ones —
they can be added back under the correct brand. Keep the purchase bill in case Google asks.

## If Google shows a problem

- **"Misrepresentation"** — check that the website shows phone, email, address, the
  /refund, /shipping and /terms pages, and that the shop details match Merchant Center.
  Then click **Request review**.
- **"Price mismatch"** — the website price and feed price differ for a few hours after a
  price change. Wait for the next daily fetch, or click **Fetch now** on the feed.
- **"Website not claimed"** — repeat Step 2.
- **"Feed fetch failed"** — the website was down or paused. Make sure the site is live and
  click **Fetch now**.

---

### Note for the developer

- Feed: `svcar-india/src/app/feed.xml/route.ts` → `src/lib/merchant-feed.ts`; exclusions in
  `src/lib/feed-brands.ts` (`GENUINE_BRANDS`, `CONFIRMED_GENUINE`).
- `sale_price` and `product_type` appear only after the API with the extended
  `GET /products/feed` (`listPrice`, `categoryId`) is deployed to Fly. Until then the feed
  sends the current selling price as `price`, which is also valid.
