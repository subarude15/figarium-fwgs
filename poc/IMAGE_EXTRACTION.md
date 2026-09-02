# FWGS Product Image Extraction (Figranium PoC)

Date: 2026-09-02  
**Decision: CONDITIONAL GO**

## 1. Where FWGS product images actually come from

Primary bottle images are published in **page structured metadata** on the PDP:

| Source | Role |
| --- | --- |
| `meta[property="og:image"]` | Primary front (`_F1`) ccstore URL |
| JSON-LD `Product.image` | Same asset; `sku` / `productId` = PLCB |
| Inline OCC / gallery blobs | Additional views (e.g. `_B1`) via `/file/v…/products/{plcb}_…` |
| Live `<img>` / shadow DOM | Often empty or UI-only in Figranium extraction sandbox |

Canonical URL shape:

```text
https://www.finewineandgoodspirits.com/ccstore/v1/images/?source=/file/v{versionId}/products/{plcbItem}_{optionalSku}_F1.jpg&height=475&width=475
```

- `{versionId}` is opaque — **do not invent**.
- PLCB appears in the asset path → identity filter.
- Stable identity = `source=` path; `height`/`width` are resize params (not auth signatures).

## 2. How Figranium can access them

Figranium cleaned `$$data.html()` / light-DOM extraction **strips** product media. Required path:

1. `actions.navigate` → `/product/{plcbItem}`
2. Live-browser `actions.javascript` reads `og:image` + JSON-LD (+ strict `/file/v*/products/*.(jpg|png|webp)` scan)
3. Keep only paths containing the PLCB item
4. Stash payload in `#fwgs-image-payload`; extraction returns structured JSON

Saved task: **`FWGS PLCB Image Extractor`** (`task_1788378025198`) — thin second Figranium step after product resolve.

## 3. Extraction method selected

**`embedded_json`** (og:image / JSON-LD), with strict file-path normalization to rebuild clean ccstore URLs at `height=475&width=475`.

Prefer `_F1` for `primaryImageUrl`; include other PLCB-matched views in `imageUrls`.

## 4. Product identity verification

Accept only when:

- Asset path contains the PLCB item under `/products/`
- Page is a product URL / known PDP navigation
- Reject logos, `occ-public`, general assets, and non-matching recommendation tiles

Matrix: **0** false-recommendation selections.

## 5. Stability across runs (4 × 3)

| PLCB | Primary asset key | Exact URL stable | Source |
| --- | --- | --- | --- |
| `000004766` | `/file/v4181866484679415500/products/000004766_1003007_F1.jpg` | 3/3 | embedded_json |
| `000009359` | `/file/v8267655237597476021/products/000009359_F1.jpg` | 3/3 | embedded_json |
| `100056945` | `/file/v6165810439292000430/products/100056945_F1.jpg` | 3/3 | embedded_json |
| `000098661` | `/file/v2450119215989133212/products/000098661_1035575_F1.jpg` | 3/3 | embedded_json |

Matches prior Composio PoC assets for Captain Morgan / Tito's. Avg runtime ~22s.

## 6. Cookies / auth

- URLs are **not** short-lived signed tokens.
- Query params: `source`, `height`, `width` only.
- Host sits behind **Akamai**: some datacenter GETs return 403; Figranium browser navigation loads the image document (e.g. title `images (475×475)` for Santa Ema).

## 7. Suitability for Smokey Vault `localizeImage`

**Yes, with caveats:**

- Persist the full ccstore URL (or at least stable `source=` path + rebuild).
- Downstream fetch should use a normal browser-like client if Akamai blocks the Vault runtime.
- Do not hardcode version IDs — always resolve via Figranium PDP metadata.

## 8. Known limitations

- Requires a **second Figranium step** (or equivalent live-browser JS before extract); sandbox-only extract is insufficient.
- Akamai can 403 bare HTTP fetches from some networks/SKUs even when Figranium browser succeeds.
- Figranium public tunnel had a multi-hour Cloudflare 502/1033 outage during this phase; matrix completed after recovery.
- No Composio fallback used.

## Decision

**CONDITIONAL GO**

- Primary image for all 4 control products, 3/3 each, exact URL + asset-key stable
- Identity-safe (PLCB in path), deterministic `embedded_json`, no CAPTCHA/login, no Composio
- Architecture uses an official Figranium second task (acceptable); Akamai fetch variability remains an ops caveat for Vault localization
