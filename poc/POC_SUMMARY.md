# FWGS PLCB Product Resolver — PoC Summary

Date: 2026-09-02 (updated: image extraction matrix complete)

## Executive summary

**Recommendation: CONDITIONAL GO** for Figranium as the FWGS browser-worker (`@figranium/sdk` → `https://fig.thesmokeybarrelbar.com`).

| Capability | Result |
| --- | --- |
| Product resolve (name/proof/URL/no-result) | **Pass** — prior 12/12 + 2/2 control set |
| Product images | **Pass via second Figranium task** — 12/12 primary, exact URL stable |
| False positives / wrong images | **0** |
| Composio fallback | **Not used** |

Remaining caveats: images need live-browser metadata extract (not cleaned sandbox HTML); Akamai can 403 some datacenter image GETs even when Figranium browser loads them.

See `poc/IMAGE_EXTRACTION.md`, `poc/image-extraction-runs.json`, `poc/figranium-validation.json`.

---

## Image extraction (this phase)

| Check | Result |
| --- | --- |
| Mechanism | `og:image` + JSON-LD `Product.image` → strict `/file/v*/products/{plcb}_*_F1.jpg` → ccstore URL |
| Task | `task_1788378025198` — **FWGS PLCB Image Extractor** |
| Source label | `embedded_json` |
| Captain Morgan / Tito's / Santa Ema / Mishka | **3/3 each** primary present |
| Exact URL stability | **4/4 SKUs stable** |
| Identity (PLCB in asset path) | **12/12** |
| Direct HTTP fetch | Often OK; Santa Ema 403 from this Cloud Agent; Figranium browser load OK |
| CAPTCHA/login | **0** |

### Control image URLs (stable)

- `000004766` → `…/products/000004766_1003007_F1.jpg`
- `000009359` → `…/products/000009359_F1.jpg`
- `100056945` → `…/products/100056945_F1.jpg`
- `000098661` → `…/products/000098661_1035575_F1.jpg`

---

## Prior product-resolve control set

| Metric | Value |
| --- | --- |
| Task | `task_1788365630737` FWGS PLCB Product Resolver |
| Product matches | 12/12 |
| No-result | 2/2 |
| Captain Morgan proof | 70 × 3 |
| Schema compliance | 100% post-retry |

### Hard constraints

1. Use `actions.navigate` to `/product/{plcb}` (not in-page `location.href`).
2. Image extract requires live-browser JS / second Figranium task — sandbox HTML drops media.
3. Keep waits short to avoid Cloudflare 524; tunnel outages (1033/502) occurred during this phase.

---

## Phase 2 fallback evidence (historical — Composio)

Composio `BROWSER_TOOL` previously recovered the same Captain Morgan / Tito's ccstore assets. This phase validates the same media via Figranium only.
