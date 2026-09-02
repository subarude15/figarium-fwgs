# FWGS PLCB Product Resolver — PoC Summary

Date: 2026-09-02 (updated: Figranium control set complete)

## Executive summary

**Recommendation: CONDITIONAL GO** for Figranium as the FWGS browser-worker, via **`@figranium/sdk` HTTP** against `https://fig.thesmokeybarrelbar.com`.

Figranium MCP is still absent from the Cloud Agent catalog, but the live host authenticated and executed the saved task. Control set: **12/12 product matches**, **2/2 no-result** (after one CF 524 retry), **0 false positives**, Captain Morgan **3/3** (name + proof 70). Blocking gap for a full Smokey Vault adapter: **product images are never present** in the Figranium extraction sandbox.

No silent Composio fallback was used.

See `poc/figranium-validation.json` and `poc/figranium-control-runs.json`.

---

## Figranium control-validation (this phase)

### Figranium executed: **yes** (SDK/HTTP, not MCP)

| Check | Result |
| --- | --- |
| `figranium` MCP namespace in Cloud Agent | **Missing** (not in catalog) |
| Host + API key | **OK** — `fig.thesmokeybarrelbar.com` |
| Saved task | `task_1788365630737` — **FWGS PLCB Product Resolver** |
| Total Figranium control runs | **14** (1 original CF 524 replaced by retry) |
| Schema compliance rate | **100%** (post-retry) |
| Product match rate | **12/12** |
| False positive count | **0** |
| Captain Morgan stability | **3/3** (name + proof 70) |
| Primary image stability | **0/12** (images absent from extraction DOM) |
| Proof stability | Captain 70×3, Tito's 80×3, Mishka 80×3 |
| CAPTCHA/login count | **0** |
| Average runtime | **~56s** |
| No-result behavior | **2/2** `notFound:true` after retry |
| Silent fallback used | **No** |

### Control set results

| Case | PLCB | Runs | Outcome |
| --- | --- | --- | --- |
| 1 | `000004766` Captain Morgan | 3/3 | matchOk; proof 70; volumeText 2/3 |
| 2 | `000009359` Tito's | 3/3 | matchOk; proof 80; 750ML |
| 3 | `100056945` Santa Ema | 3/3 | matchOk; 750ML; no proof (wine) |
| 4 | `000098661` Mishka 1L | 3/3 | matchOk; proof 80; volumeText 1L |
| 5 | `999999999` | 2/2 | notFound (run2 retried after CF 524) |

### Hard constraints discovered

1. **In-page `location.href` does not advance Figranium page state** for extraction/`final_url`. Use `actions.navigate` to `/product/{plcbItem}` after search.
2. **`$$data.url` is broken** in the extraction sandbox; use `$$data.shadowText()` / `$$data.html()` and treat client `final_url` as `productUrl` authority.
3. **Product images** are not in cleaned HTML, shadowText, or light-DOM `img` tags during extraction.
4. **Cloudflare 524** if origin exceeds ~120s — keep waits short; retry on 524.

### Unblock for full GO

1. Figranium: expose product image URLs to extraction (include shadow image nodes / less aggressive HTML cleaning), or accept a second image-fetch step outside extraction.
2. Optionally attach `figranium` MCP to Cloud Agent (SDK path already works).
3. Harden origin so sync task runs stay under CF 120s.

---

## Phase 2 fallback evidence (historical — Composio)

| Metric | Value |
| --- | --- |
| Execution engine | Composio `BROWSER_TOOL` (`executionEngine: "fallback"`) |
| Items in matrix | 15 (12 products + 3 failure cases) |
| Total runs | 21 |
| Product matches | 17/17 |
| False positives | 0 |

Historical fallback still validates the FWGS workflow when Figranium is unavailable; this phase validates Figranium itself for core resolve fields (not images).
