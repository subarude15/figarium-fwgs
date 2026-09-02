# FWGS PLCB Product Resolver

Reusable Figarium / Composio Browser Tool task definition for The Smokey Vault PoC.

## Identity

- **Name:** `FWGS PLCB Product Resolver`
- **Input:** `plcbItem` (string; Pennsylvania PLCB item number, e.g. `000004766`)
- **Runtime:** Composio `BROWSER_TOOL` (persistent cloud browser session)
- **Constraints:** no CAPTCHA bypass, no proxy rotation, no anti-bot evasion, no bulk crawl, no unrelated product scraping

## Workflow

1. Open Fine Wine & Good Spirits (`https://www.finewineandgoodspirits.com/`).
2. If the age gate appears ("Please enjoy responsibly"), click **YES** only.
3. If a store / pickup-or-ship modal blocks the page, dismiss or choose the lightest path that still allows catalog search (do not create an account, do not log in).
4. Search the provided `plcbItem` via site search (prefer the search box; fallback URL `https://www.finewineandgoodspirits.com/search?Ntt={plcbItem}`).
5. Detect search result count for credible product matches only (ignore ads, recipes, accessories).
6. If exactly one credible product match exists, open that product page.
7. Extract only the structured fields listed below.
8. If zero matches or more than one credible match, do not open additional products; return `matched=false` and set `ambiguous` accordingly.

## Output schema

```json
{
  "matched": false,
  "ambiguous": false,
  "plcbItem": "string",
  "productUrl": null,
  "name": null,
  "brand": null,
  "proof": null,
  "volumeText": null,
  "category": null,
  "country": null,
  "region": null,
  "imageUrls": [],
  "evidence": {
    "plcbItemMatched": false,
    "nameMatched": false
  }
}
```

## Prompt template

```text
TASK NAME: FWGS PLCB Product Resolver
INPUT plcbItem: {{plcbItem}}

Use a normal browser session. Do NOT solve CAPTCHAs, rotate proxies, or evade bot protection.
If a CAPTCHA or hard block appears, stop and return matched=false with a short note in name="CAPTCHA_OR_BLOCK".

Goal: resolve one Pennsylvania PLCB item number against Fine Wine & Good Spirits and return ONLY the JSON object specified below.

Steps:
1. Go to https://www.finewineandgoodspirits.com/
2. Accept age gate with YES if shown.
3. Dismiss store/pickup modal only if it blocks search; do not log in.
4. Search for plcbItem={{plcbItem}}.
5. Count credible product results only.
6. If exactly one credible product, open it.
7. Extract structured retail metadata from that product page only.
8. Return ONLY valid JSON matching this schema (no markdown):

{
  "matched": boolean,
  "ambiguous": boolean,
  "plcbItem": "string",
  "productUrl": string|null,
  "name": string|null,
  "brand": string|null,
  "proof": number|null,
  "volumeText": string|null,
  "category": string|null,
  "country": string|null,
  "region": string|null,
  "imageUrls": string[],
  "evidence": {
    "plcbItemMatched": boolean,
    "nameMatched": boolean
  }
}

Rules:
- matched=true only when exactly one credible product was opened and metadata extracted.
- ambiguous=true when more than one credible product result is present.
- proof must be a number (e.g. 70) or null.
- imageUrls should be absolute product image URLs only.
- Do not scrape unrelated products.
```

## Test case

- PLCB item: `000004766`
- UPC: `087000201156`
- Expected name: Captain Morgan Original Spiced Rum
- Expected proof: `70`
