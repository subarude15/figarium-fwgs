# FWGS PLCB Product Resolver — PoC Summary (Phase 2)

Date: 2026-09-02

## Executive summary

**Recommendation: NO-GO** for a Figranium-based thin external FWGS adapter in The Smokey Vault.

Figranium itself was **not authenticated or executed** in this cloud agent environment. All 21 runs used Composio `BROWSER_TOOL` (Browser Use cloud) with `executionEngine: "fallback"`. The FWGS resolution **workflow** is promising, but **Figranium as the execution engine remains unvalidated**.

A **CONDITIONAL GO** applies only to continuing PoC work on the resolver contract and selector strategy — not to production integration behind Figranium.

---

## 1. Was Figranium successfully authenticated and used?

**No.**

| Path | Status |
| --- | --- |
| Wonder MCP namespace | `needsAuth` — zero tools; interactive OAuth unavailable in cloud agent |
| Browser-use MCP | `error` during tool discovery |
| `figranium-mcp` / Cursor plugin | Not configured in agent environment |
| `FIGRANIUM_BASE_URL` + `FIGRANIUM_API_KEY` | Not present in environment |
| Local Docker Figranium on `:11345` | Docker unavailable; port closed |

**Required to unblock:**

1. Self-host Figranium (`ghcr.io/figranium/figranium:latest`) on a reachable host
2. Configure Cursor MCP: `npx -y figranium-mcp` with `FIGRANIUM_BASE_URL` and `FIGRANIUM_API_KEY`
3. Add secrets to Cloud Agent environment for autonomous runs

Wonder is **not** a substitute for `figranium-mcp`.

---

## 2. Test coverage

| Metric | Value |
| --- | --- |
| Items in matrix | 15 (12 products + 3 failure cases) |
| Spirits tested | 8 |
| Wines tested | 4 |
| Different package sizes | 2 (1.75L Captain Morgan, 1L Mishka, 561ML Korbel multipack) |
| Missing/non-applicable proof | 4 wines + Palmer's gin |
| No-result case | `999999999` |
| Malformed input | `ABC123` |
| Unpadded normalization | `4766` → `000004766` |
| Total runs executed | 21 |
| Figranium runs | 0 |
| Fallback runs | 21 |
| Planned runs (full 2× matrix) | 28 |
| Second-run coverage | Partial — 5 items with ≥2 runs |

Test matrix: `poc/test-matrix.json`

---

## 3. Reliability metrics

| Metric | Result |
| --- | --- |
| Match rate (product runs) | **17/17 (100%)** — no false positives |
| False positive count | **0** |
| No-result count (correct) | **2/2** (`999999999`, `ABC123`) |
| Ambiguous count | **0** |
| CAPTCHA observed | **0** |
| Login required | **0** |
| Captain Morgan 3/3 runs | Matched; proof 70; identical product URL |
| Product URL stability (multi-run items) | **Stable** for Captain Morgan, Tito's, Smirnoff, Mishka, Santa Ema |
| Image URL stability (where extracted) | **Stable** for Captain Morgan (F1/B1) and Tito's (F1) |
| Proof extraction (spirits with proof on page) | **10/10 correct** |
| Wine ABV extraction | **0/4** — ABV often absent on FWGS wine PDPs |
| Schema fully compliant runs | **1/21** (Tito's run 1 only) |
| Average steps per run | ~4.8 (range 1–14) |
| Average runtime estimate | ~30–90 seconds per run |

Raw results: `poc/run-results.json`

---

## 4. Image validation

| PLCB item | Primary image | Stable across runs |
| --- | --- | --- |
| `000004766` | ccstore F1 front bottle (`...000004766_1003007_F1.jpg`) | Yes (3/3 runs) |
| `000009359` | ccstore F1 front bottle (`...000009359_F1.jpg`) | Yes (2/2 runs with images) |

**Gap:** Most phase-2 fallback runs omitted `imageUrls` / `primaryImageUrl` due to LLM schema drift. Image extraction works when the agent follows the contract, but is not reliably enforced under fallback execution.

---

## 5. Failure behavior

| Case | Expected | Observed |
| --- | --- | --- |
| `999999999` (no result) | `matched=false`, `notFound=true` | Correct — FWGS "no search results" page |
| `ABC123` (malformed) | `matched=false`, no false match | Correct — no results |
| `4766` (unpadded) | May resolve via FWGS search | Resolves to Captain Morgan `000004766` PDP |
| Figranium auth | Structured blocker | Documented; no silent fallback to Figranium |
| Selector missing | Structured partial result | Agents wait for skeleton loaders; direct search URL most reliable |
| Network/timeout | Not explicitly injected | One Palmer's task stuck in queue; stopped and retried successfully |

No guessing or unrelated product acceptance observed.

---

## 6. Selector / session fragility

- Age gate modal on first visit; one **YES** click sufficient; cookies persist.
- Search results frequently show skeleton loading — agents need 3–5s wait.
- Header search may sit in shadow DOM; **`/search?Ntt={plcbItem}`** is the most reliable entry.
- Wine PDPs often omit ABV/proof — return `null`, do not invent.
- LLM-driven fallback frequently returns ad-hoc JSON (`productName` vs `name`, nested `product` object, prose diagnostics).
- Persistent session can skip search on repeat (Captain Morgan run 2) — good for session behavior, weak for end-to-end regression unless forced.

---

## 7. Figranium-specific issues

1. **Never executed** — cannot validate block-based tasks, `task_execute`, or Figranium session persistence.
2. **Wonder ≠ Figranium** — Wonder MCP `needsAuth` does not provide Figranium browser-worker tools.
3. **No deterministic JSON** — Figranium's value proposition (structured block output) was not tested.
4. **Cloud Agent gap** — requires user to configure `figranium-mcp` + secrets or authenticate in Cursor Desktop.

---

## 8. Production readiness decision

### Is Figranium reliable enough to justify a thin external FWGS adapter in The Smokey Vault?

**NO-GO** — conditions for GO are not met:

| GO requirement | Status |
| --- | --- |
| Figranium actually used | ❌ Not used |
| No false positive matches | ✅ 0 observed (fallback only) |
| No unresolved auth blocker | ❌ Blocker unresolved |
| Stable Captain Morgan repeated runs | ✅ 3/3 stable (fallback) |
| Acceptable broader matrix reliability | ✅ 17/17 product matches (fallback) |
| Structured no-result/ambiguous behavior | ✅ Correct for tested failure cases |
| Useful product image extraction | ⚠️ Works when schema followed; unreliable under LLM fallback |
| No CAPTCHA/login dependency | ✅ None observed |

### Recommended next steps

1. **User action:** Configure `figranium-mcp` with `FIGRANIUM_BASE_URL` and `FIGRANIUM_API_KEY` (or authenticate Wonder/Figranium in Cursor Desktop).
2. **Re-run** the same test matrix through Figranium with a saved block-based task (not LLM prompt agent).
3. **Enforce** strict JSON schema validation at the adapter boundary.
4. **Complete** second-run coverage for all 12 product items under Figranium before revisiting GO.

### CONDITIONAL GO (workflow only)

The FWGS PLCB lookup **workflow** (search by item number → single PDP → extract metadata) is viable. A thin adapter contract is defined in `poc/FWGS_PLCB_PRODUCT_RESOLVER.md`. Proceed with Figranium validation before any Smokey Vault integration.

---

## Artifacts

| File | Description |
| --- | --- |
| `poc/FWGS_PLCB_PRODUCT_RESOLVER.md` | Resolver contract v2 + Figranium task design |
| `poc/test-matrix.json` | 15-case test matrix with connectivity notes |
| `poc/run-results.json` | 21 runs with normalized metrics |
| `poc/run-plan.mjs` | Prompt builder for batch execution |
| `poc/POC_SUMMARY.md` | This document |

PR: https://github.com/subarude15/figarium-fwgs/pull/1
