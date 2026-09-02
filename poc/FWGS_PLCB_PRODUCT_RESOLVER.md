# FWGS PLCB Product Resolver

Reusable browser-worker task for resolving Pennsylvania PLCB item numbers against Fine Wine & Good Spirits (FWGS).

## Identity

- **Name:** `FWGS PLCB Product Resolver`
- **Runtime target:** Figranium (`task_execute` / `create_task` via `figranium-mcp`)
- **Fallback runtime:** Composio `BROWSER_TOOL` (labeled `executionEngine: "fallback"`)
- **Constraints:** no CAPTCHA bypass, no proxy rotation, no anti-bot evasion, no bulk crawl

## Input

```json
{
  "plcbItem": "000004766",
  "expected": {
    "upc": "087000201156",
    "name": "Captain Morgan Original Spiced Rum",
    "proof": 70
  }
}
```

`expected` is optional and used only for evidence flags — never invent fields from it.

## Output

```json
{
  "matched": false,
  "ambiguous": false,
  "notFound": false,
  "executionEngine": "figranium",
  "plcbItem": "000004766",
  "productUrl": null,
  "name": null,
  "brand": null,
  "proof": null,
  "abv": null,
  "volumeText": null,
  "category": null,
  "subcategory": null,
  "country": null,
  "region": null,
  "imageUrls": [],
  "primaryImageUrl": null,
  "evidence": {
    "plcbItemMatched": false,
    "nameMatched": null,
    "upcMatched": null,
    "proofMatched": null
  },
  "diagnostics": {
    "searchResultCount": null,
    "selectorFailures": [],
    "captchaSeen": false,
    "loginRequired": false,
    "redirected": false,
    "durationMs": null
  }
}
```

### Field rules

- Use `null` for unknown values — do not guess.
- `matched=true` only when exactly one credible product page was opened and fields extracted from that page.
- `ambiguous=true` when more than one credible product result exists for the PLCB search.
- `notFound=true` when search completes with zero credible product results.
- `proof` is spirits proof (number). `abv` is percent alcohol for wine/beer when proof is not shown.
- `primaryImageUrl` must be the best front bottle/product image; reject logos, icons, banners, recommendation tiles.
- `executionEngine` must reflect the actual runner: `"figranium"` or `"fallback"`.

## Workflow

1. Open `https://www.finewineandgoodspirits.com/`
2. Accept age gate (**YES**) if shown; do not log in.
3. Dismiss store/pickup modal only if it blocks search.
4. Search `plcbItem` via site search or `https://www.finewineandgoodspirits.com/search?Ntt={plcbItem}`
5. Count credible product results (ignore recipes, accessories, ads).
6. If exactly one credible match, open product page and extract fields.
7. Return only the JSON object above (no markdown).

## Figranium task design (when engine available)

Recommended block sequence for a saved Figranium task:

1. `navigate` → FWGS home
2. `click` age gate YES if visible
3. `navigate` → search URL with `{$plcbItem}`
4. `javascript` → count product result cards; return `{ searchResultCount }`
5. Conditional: if count === 1 → click product link
6. `javascript` → extract JSON fields from PDP DOM / JSON-LD
7. Return structured JSON as task output

Expose runtime variable: `plcbItem`.

## Test matrix

See `poc/test-matrix.json`.

## Phase-2 connectivity note

As of 2026-09-02, this cloud agent could **not** reach Figranium:

| Path | Status |
| --- | --- |
| Wonder MCP namespace | `needsAuth` — no tools |
| `figranium-mcp` / Cursor plugin | Not configured in agent environment |
| `FIGRANIUM_BASE_URL` + `FIGRANIUM_API_KEY` | Not present |
| Local Docker Figranium on `:11345` | Docker unavailable; port closed |

Fallback runs must set `"executionEngine": "fallback"` and must **not** be reported as Figranium validation.
