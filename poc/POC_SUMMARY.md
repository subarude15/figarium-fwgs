# FWGS PLCB Product Resolver — PoC Summary

Date: 2026-09-02

## MCP / runtime used

| Item | Value |
| --- | --- |
| Requested MCP | Figranium / Figarium (Wonder namespace) |
| Wonder MCP status | `needsAuth` — tools unavailable in this cloud agent environment |
| Browser-use MCP status | `error` during tool discovery |
| PoC runtime actually used | Composio `BROWSER_TOOL` (Browser Use cloud browser) |
| Task name | **FWGS PLCB Product Resolver** |
| Task definition | `poc/FWGS_PLCB_PRODUCT_RESOLVER.md` |
| Persistent session ID | `253b0d07-ea31-4b92-8699-5160899ef3cb` |
| Raw run artifacts | `poc/run-results.json` |

The Composio browser toolkit exposes only prompt-based `BROWSER_TOOL_CREATE_TASK` runs (no native named-task registry). The reusable task spec lives in-repo and was executed three times with `plcbItem=000004766`.

## Test case

- PLCB item: `000004766`
- UPC: `087000201156`
- Expected product: Captain Morgan Original Spiced Rum
- Expected proof: `70`

## Fields successfully extracted (3/3 runs)

| Field | Extracted | Value |
| --- | --- | --- |
| `matched` | yes | `true` |
| `ambiguous` | yes | `false` |
| `plcbItem` | yes | `000004766` |
| `productUrl` | yes | `https://www.finewineandgoodspirits.com/captain-morgan-original-spiced-rum/product/000004766` |
| `name` | yes | Captain Morgan Original Spiced Rum |
| `brand` | yes | Captain Morgan |
| `proof` | yes | `70` |
| `volumeText` | yes | `1.75L` |
| `category` | yes | Rum |
| `country` | yes | United States |
| `region` | yes | `null` (not listed on page) |
| `imageUrls` | yes | 2 stable ccstore image URLs (`F1`, `B1`) |
| `evidence.plcbItemMatched` | yes | `true` |
| `evidence.nameMatched` | yes | `true` |

## Reliability across 3 runs

| Check | Result |
| --- | --- |
| Same product page every time | **Yes** — identical `/product/000004766` URL |
| Image URLs stable | **Yes** — same two ccstore URLs in all runs |
| Proof consistently extracted | **Yes** — `70` in all runs |
| Selector stability | **Mixed** — product page fields were readable, but search UI sits in shadow DOM; run 1 used direct search URL, run 3 used search box after cookie persistence |
| Login / cookie / CAPTCHA problems | **None observed** — age gate on first visit only; session cookies persisted; no CAPTCHA, no login |

### Run behavior notes

1. **Run 1:** Full flow — age gate → search URL → single result → product page (6 steps).
2. **Run 2:** Reused session already on product page; returned same JSON without re-searching (1 step). Good for session persistence, not a full end-to-end repeat.
3. **Run 3:** Forced fresh home → search box → `1-1 of 1` results → product page (6 steps). Confirms end-to-end repeatability with cookies.

## Selector / session observations

- FWGS age gate is a normal modal; one click on **YES** is enough.
- Store/pickup modal did not block search in these runs.
- Search can be reached reliably via `https://www.finewineandgoodspirits.com/search?Ntt={plcbItem}` even when the header search control is inside shadow DOM.
- Product metadata (name, item number, proof, volume, country, type/category) appears as visible page text on the PDP.
- Product images use stable ccstore URLs embedding `products/000004766_...`.
- Persistent session worked: run 3 skipped age gate; cookies carried forward.

## Smokey Vault adapter recommendation

**Conditional yes for a PoC adapter, not yet for production default.**

Reasons to proceed:

- PLCB item `000004766` resolved correctly 3/3 times with expected name and proof.
- Output shape matches the requested contract.
- No CAPTCHA/login friction in this sample.
- Persistent browser session behaves as expected.

Reasons to hold before integrating into The Smokey Vault:

1. **Wonder/Figarium MCP was not authenticated** in this environment — the intended MCP could not be inspected or used directly.
2. **Execution is LLM-agent driven**, not deterministic selector-based scraping; run 2 skipped search entirely when already on the PDP.
3. **Volume returned was 1.75L** — FWGS sells multiple sizes under one PLCB item pattern; adapter logic must handle size ambiguity explicitly.
4. **Only one SKU tested** — reliability for ambiguous items, zero-result items, and beer/wine categories is unknown.
5. **Browser-use MCP in this agent failed discovery** — deployment path for Smokey Vault still needs a stable hosted browser-worker endpoint.

### Suggested next step

Authenticate the Wonder/Figarium MCP in Cursor, re-run this same task definition through that server, and compare whether it supports named reusable tasks plus stricter JSON output. If parity holds, build a thin Smokey Vault adapter that calls the external browser-worker service with `{ plcbItem }` and maps the JSON response into the existing FWGS lookup slot — without importing Figarium source into `the-smokey-vault`.
