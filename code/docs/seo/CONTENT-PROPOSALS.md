# Product & category content proposals (for the owner to paste in admin)

Status: **drafts — nothing here is live.** Every fact below is taken from the
current live product/category page (audited 2026-11-07). Anything the page does
not state is marked `[CONFIRM: …]` — fill it in only if it is true, otherwise
delete the sentence. Do not add fitment, model years, Thar Roxx compatibility,
material, warranty, installation or box contents that you have not checked.
No reviews or star ratings.

Search Console: no Search Console connector (Windsor.ai) was available to this
audit, so there are **no query lists here**. The only GSC numbers are the ones
the owner supplied for the Thar vents page. Pull "Queries" for each URL below
(last 28 days vs previous 28) and put the top 3–5 into the "Target queries"
lines before editing.

What the code now does automatically (PR `product-seo`):

- `<title>`: `{Clean name}[ – {variant}] for {cars} | SV Car Customs`, ≤60 chars.
  The variant comes from the name's sub-title ("| Dual Tip (Carbon)"), which
  fixes the duplicate titles below.
- Meta description: `{name} for {cars} at ₹{price}. Free delivery… {first sentence}`, ≤155.
  The first sentence of your description is what shows in Google — **make it the
  sentence you want people to read**.
- Product `<h1>`: same clean name + variant + cars (no more lower-case
  sub-titles like "| Aftermarket steering for Maruti Suzuki Swift (2018 onwards), …").
- Category `<h1>`: "Virtus & Slavia" instead of "VIRTUS / SLAVIA"; "Body Kits".
- Category intro: the admin **category description** shows under the H1 (and
  replaces the generated meta description). An auto intro is shown below it.

The name field drives title + H1, so keep names as `{What} | {Variant}`; the
part after ` | ` is only used for a variant (text in brackets, or a finish such
as "Copy Carbon Fiber").

## Catalogue-wide audit (139 product + category URLs from the sitemap)

| Check | Result |
|---|---|
| Titles > 60 chars | 0 |
| Meta descriptions > 155 chars / missing | 0 / 0 |
| Duplicate titles | 3 pairs — Borla Valvetronic Exhaust (Carbon/Burnt), Remus Valvetronic Exhaust (Carbon/Burnt), Toyota Land Cruiser Prado LC-250 Steering Wheel (two finishes). **Fixed in code.** |
| Duplicate descriptions | 2 Toyota Fortuner wheels open with the same text ("Upgrade your Toyota Fortuner interior with this premium carbon-fiber finish stee…") — **owner: rewrite one** |
| Product descriptions < 100 words | **87 of 117** (median 50–99 words; 8 under 50) — biggest content gap |
| Missing images / missing alt | 0 / 0 |
| Product JSON-LD | all 117 have it, with image + offers; no ratings (correct) |
| Pages that failed to load during audit | `/product/virtus-metal-paddle-shifters-steering-gt-badge-combo`, `/product/virtus-taigun-abs-paddle-shifters` — re-check these |

## Priority pages

### 1. Thar G-Wagon style AC vents — `/product/thar-g-wagon-style-ac-vents`

GSC (owner-supplied): 17 clicks / 152 impressions / pos 5.4 → 4 / 98 / pos 5.5.
Position is flat; impressions −36% and CTR 11.2% → 4.1%. That points to fewer
searches or a changed result page (e.g. shopping/image blocks), not a ranking
loss — check the query list.

Current: title "Thar G-wagon Style AC Vents | SV Car Customs" (44); H1 "Thar g-wagon style Ac vents for Mahindra Thar"; description 75 words; 17 images; price ₹6,500.

- **Name (admin):** `Thar G-Wagon Style AC Vents | RGB LED, Pack of 4`
- **Title (auto):** `Thar G-Wagon Style AC Vents | SV Car Customs`
- **H1 (auto):** `Thar G-Wagon Style AC Vents`
- **Description first sentence (becomes the meta):**
  `G-Wagon style AC vents for the Mahindra Thar with RGB LED lighting, sold as a pack of four with switch control.`
- **Description draft:**
  > G-Wagon style AC vents for the Mahindra Thar with RGB LED lighting, sold as a pack of four with switch control. They replace the plain factory vents and give the cabin a multi-colour ambient glow at night — no app or phone needed.
  >
  > - Pack of four vents
  > - RGB LED multi-colour effect, switch controlled
  > - G-Wagon inspired design
  > - Fits: Mahindra Thar [CONFIRM: model years, e.g. 2020 onwards] [CONFIRM: does it fit Thar Roxx? If not, say "Not for Thar Roxx".]
  > - Material: [CONFIRM: material of the vent housing]
  > - In the box: [CONFIRM: 4 vents + switch + wiring?]
  > - Installation: [CONFIRM: plug-in / needs wiring to which source?]
  >
  > Not sure about your model year? Message us on WhatsApp before you order.
- **Target queries:** [from GSC]

### 2. Maruti copy carbon fibre steering wheel — `/product/maruti-copy-carbon-fibre-steering-wheel-aftermarket-steering`

Current: title 56 ch OK; H1 was 180+ characters; description **49 words**; ₹12,999. Data says: fits Swift 2018+, Fronx, Baleno, Brezza, Ertiga; comes **without airbag and steering controls**, which are moved from the existing wheel.

- **Name:** `Maruti Copy Carbon Fibre Steering Wheel | Aftermarket`
- **H1 (auto):** `Maruti Copy Carbon Fibre Steering Wheel for Swift, Fronx, Baleno, Brezza & Ertiga`
- **First sentence:** `Copy carbon fibre steering wheel for the Maruti Swift (2018+), Fronx, Baleno, Brezza and Ertiga.`
- **Draft:**
  > Copy carbon fibre steering wheel for the Maruti Swift (2018+), Fronx, Baleno, Brezza and Ertiga. The wheel comes without the airbag and steering controls — you move those across from your existing wheel.
  >
  > - Finish: copy carbon fibre (carbon-look) [CONFIRM: rim material, e.g. leather / perforated leather sections]
  > - Fits: Swift 2018+, Fronx, Baleno, Brezza, Ertiga [CONFIRM: years for Fronx/Baleno/Brezza/Ertiga]
  > - Airbag and controls: re-used from your current wheel (not included)
  > - Installation: [CONFIRM: fitting service offered? time needed?]
  > - In the box: [CONFIRM]
- **Target queries:** [from GSC]

### 3. Virtus / Slavia accessories — `/category/virtus-slavia`

Current: title "Virtus & Slavia Body Kits & Accessories | SV Car Customs" (56); H1 was "VIRTUS / SLAVIA" (now "Virtus & Slavia" via code); meta 154; 47 internal links. No admin category description.

- **Category description (admin), ~2 sentences:**
  > Body kits and styling parts for the Volkswagen Virtus and Skoda Slavia — front splitters, side skirts, rear diffusers, spoilers, headlight eyelids, window louvers, mirror caps and paddle shifters. [CONFIRM: one line on which Virtus/Slavia variants (e.g. GT, Topline) or years the range fits.]
- Note: filling the admin description replaces the auto meta. Keep its first 155 characters as the summary.
- **Target queries:** [from GSC — e.g. check "virtus accessories", "slavia accessories"]

### 4. Steering wheels — `/category/steering-wheels`

Current: title "Carbon Fibre Car Steering Wheels | SV Car Customs" (49); H1 "Steering wheels" → "Steering Wheels"; meta 151.

- **Category description:**
  > Real carbon fibre and copy carbon steering wheels for the Toyota Fortuner, Land Cruiser Prado, Ford Endeavour, VW Polo, Mahindra Thar and Maruti cars, plus a universal Momo-style wheel. [CONFIRM: whether airbags/controls are re-used on all wheels, as on the Maruti listing.]
- Fix duplicate opening text on the two Fortuner wheel listings.

### 5. Body kits — `/category/body-kits`

Current: title 46 OK; H1 "Body kits" → "Body Kits"; meta 114; page has ~290 words — thinnest category.

- **Category description:**
  > Complete car body kits for the Maruti Swift (2018+), Audi A5 and Audi S5. [CONFIRM: painted or unpainted on each kit; Swift kit listing says unpainted ABS.]

### 6. VW Polo accessories — `/category/polo`

Current: title "VW Polo Car Accessories Online in India | SV Car Customs" (56); H1 "Polo"; meta 148.

- **Category description:**
  > Volkswagen Polo accessories — Audi Q2-style LED tail lights, a GTI-style front splitter, headlight eyelids, M-style mirror caps, window louvers, gloss black logos and an arm rest. [CONFIRM: Polo generations/years covered, e.g. 2010–2022 or only facelift.]

### 7. Swift body kit — `/product/swift-2018-sport-body-kit-aftermarket-swift-body-kit`

Current: title 43; H1 was "Swift 2018+ sport body kit | Aftermarket swift body kit for Maruti Suzuki Swift (2018 onwards)"; 130 words (OK); ₹27,999. Data says: unpainted; front bumper with lip and grille assembly, rear diffuser, side skirts; ABS; fits factory mounting points, no cutting; professional installation recommended.

- **Name:** `Swift 2018+ Sport Body Kit | Unpainted`
- **First sentence:** `Unpainted sport body kit for the Maruti Swift (2018 onwards): front bumper with lip and grille, rear diffuser and side skirts.`
- Remove unsupported claims already in the text unless true: "improved aerodynamics", "enhances airflow for better engine cooling" [CONFIRM or delete].
- [CONFIRM: does it fit the 2024 Swift (new generation)? If not, say "2018–2023".]

### 8. Cardi K4 ambient lights — `/product/cardi-k4-ambient-lights`

Current: title "Cardi k4 Ambient Lights | SV Car Customs" (40); H1 "Cardi k4 Ambient lights"; 101 words; ₹5,999. Data: Cardi K4 Symphony, 64-colour RGB, phone-app control, one-key control, scanning/flowing effects, flexible strips for dash and doors, main + sub control modules with wiring, "Also suits the Cardi K3", professional installation recommended.

- **Name:** `Cardi K4 Ambient Lights | Symphony 64-Colour RGB` (fixes the lower-case "k4")
- **First sentence:** `64-colour RGB ambient lighting kit for the Cardi K4 (also suits the K3), controlled from your phone.`
- Note: "Cardi K4" is a car-tuning brand/name in the catalogue — [CONFIRM: is this for a specific car (e.g. Kia/Hyundai models) or universal? Add fitment in admin if specific.]

## Thin descriptions — template for the other ~87 listings

Use only what you know about the item:

1. First sentence: what it is + which car(s) + key variant/finish.
2. 4–6 bullets: finish/colour, fits (make/model/years), material, in the box, installation.
3. One line: "Not sure it fits? Message us on WhatsApp before you order."

Anything you cannot confirm — leave it out.
