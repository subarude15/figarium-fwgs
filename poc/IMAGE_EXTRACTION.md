# FWGS Product Image Extraction (Figranium PoC)

Date: 2026-09-02  
Status: **in progress** — Figranium host tunnel intermittent (Cloudflare 1033); Phase 1 source discovery complete.

## 1. Where FWGS product images actually come from

On live FWGS PDPs, the primary bottle image is published in **page structured metadata**, not only in gallery `<img>` nodes:

| Source | Example (Captain Morgan `000004766`) |
| --- | --- |
| `meta[property="og:image"]` | `…/ccstore/v1/images/?source=/file/v4181866484679415500/products/000004766_1003007_F1.jpg&height=300&width=300` |
| JSON-LD `Product.image` | same URL; `sku` / `productId` = PLCB item |
| Open Graph image | same |
| Historical gallery (Composio) | same asset path; also `_B1.jpg` back view on some SKUs |

URL pattern (Oracle Commerce Cloud media):

```text
https://www.finewineandgoodspirits.com/ccstore/v1/images/?source=/file/v{versionId}/products/{plcbItem}_{optionalSku}_F1.jpg&height={h}&width={w}
```

- `{versionId}` is opaque and **must not be guessed**.
- `{plcbItem}` appears in the asset path → strong identity signal.
- `height` / `width` are resize query params (300 vs 475 observed); underlying `source=` path is the stable asset identity.

### What does **not** work reliably

| Approach | Result |
| --- | --- |
| Figranium `$$data.html()` cleaned extraction HTML | Product `/file/.../products/` paths stripped; light-DOM `img` list is logos/UI only |
| `$$data.shadowText()` | Product name/proof text only — no image URLs |
| Constructing filenames without page data | Forbidden / non-deterministic (`v{id}` unknown) |
| Direct Cloud Agent `curl` to FWGS / ccstore | Akamai **403 Access Denied** |

## 2. How Figranium can access them

Preferred Figranium path (supported second step):

1. `actions.navigate` → `https://www.finewineandgoodspirits.com/product/{plcbItem}`
2. Dismiss age gate if present
3. `actions.javascript` in the **live browser** (not extraction sandbox):
   - read `og:image` / `twitter:image`
   - parse `application/ld+json` `Product.image`
   - optionally walk shadow DOM / `performance.getEntriesByType('resource')`
   - keep only URLs containing the PLCB item
4. Stash JSON payload into `#fwgs-image-payload` for the extraction step
5. Extraction returns `{ imageUrls, primaryImageUrl, extractionSource, identityEvidence }`

Saved task name: **FWGS PLCB Image Extractor** (created when host is up).

## 3. Extraction method selected

**Primary:** `embedded_json` — `og:image` + JSON-LD `Product.image`  
**Identity filter:** URL must include `/{plcbItem}` in the `source=` product path  
**Primary preference:** `_F1.` front view over `_B1.`  
**Rejected:** logos, UI SVG, social, tracking, `occ-public`, recommendation tiles without PLCB match

## 4. Product identity verification

Minimum gate for accepting an image:

- PLCB item substring present in `/products/{plcb}_…` asset path, **and**
- Current page is `/product/…`, **and**
- Prefer JSON-LD `sku` / `productId` matching PLCB when present

This excludes “You May Also Like” images that lack the current PLCB in the asset path.

## 5. Stability across runs

Pending Figranium matrix (4 products × 3).  
Phase-1 metadata discovery (Context browser scrape for source location only — **not** the validated extraction path) found stable primary assets:

| PLCB | Asset path |
| --- | --- |
| `000004766` | `/file/v4181866484679415500/products/000004766_1003007_F1.jpg` |
| `000009359` | `/file/v8267655237597476021/products/000009359_F1.jpg` |
| `100056945` | `/file/v6165810439292000430/products/100056945_F1.jpg` |
| `000098661` | `/file/v2450119215989133212/products/000098661_1035575_F1.jpg` |

Matches prior Composio PoC URLs for Captain Morgan / Tito's.

## 6. Cookies / auth

- Image URLs are **not signed** with short-lived tokens; only `source`, `height`, `width` query params.
- Host is behind **Akamai bot protection**: unauthenticated datacenter fetches often 403.
- Browser sessions that can load the PDP can typically load `/ccstore/v1/images/…` (to be confirmed via Figranium navigate once tunnel is up).

## 7. Suitability for later Smokey Vault `localizeImage`

**Likely yes**, with caveats:

- Use the full `ccstore/v1/images/?source=…` URL (do not strip query params unless proven unnecessary).
- Prefer normalizing identity on `source=` path for dedupe.
- Downstream fetch may need a normal browser TLS fingerprint / residential path if Akamai blocks the Vault runtime similarly.
- Do **not** hardcode version IDs; always resolve from PDP metadata via Figranium.

## 8. Known limitations

- Figranium extraction sandbox alone is insufficient (cleaned HTML drops media).
- Requires a thin **second Figranium step** (or javascript action before extract) on the resolved PDP URL.
- Figranium public tunnel (`fig.thesmokeybarrelbar.com`) returned Cloudflare **1033** during this phase start — matrix blocked until host recovers.
- No Composio fallback used for the validated path.

## Decision (pending matrix)

Expected once Figranium recovers and 4×3 matrix passes:

**CONDITIONAL GO** — deterministic metadata extraction via Figranium live browser JS; images usable if Vault fetch environment can retrieve ccstore URLs.
