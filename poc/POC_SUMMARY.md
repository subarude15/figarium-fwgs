# FWGS PLCB Product Resolver — PoC Summary

Date: 2026-09-02 (updated: Figranium control-validation attempt)

## Executive summary

**Recommendation: NO-GO** for a Figranium-based thin external FWGS adapter in The Smokey Vault.

This phase was required to use **real Figranium MCP execution**. It **stopped at Phase 1** — Figranium MCP is not available to this Cloud Agent. No silent Composio fallback was used.

Prior phase-2 fallback evidence (21 Composio runs, 17/17 product matches, 0 false positives) remains useful for the **FWGS workflow**, but does **not** validate Figranium.

See `poc/figranium-validation.json` for the full Phase-1 probe record.

---

## Figranium control-validation (this phase)

### Figranium MCP authenticated: **no**

| Check | Result |
| --- | --- |
| `figranium` MCP namespace in Cloud Agent | **Missing** (not in catalog) |
| `task_list` / `create_task` / `task_execute` | **Not callable** |
| Saved task ID/name | **Not created** |
| Total Figranium runs | **0** |
| Schema compliance rate | **n/a** (no runs) |
| Product match rate | **n/a** |
| False positive count | **n/a** |
| Captain Morgan stability | **n/a** (Figranium) |
| Primary image stability | **n/a** (Figranium) |
| Proof stability | **n/a** (Figranium) |
| CAPTCHA/login count | **n/a** |
| Average runtime | **n/a** |
| Selector failures | **n/a** |
| No-result behavior | **n/a** (Figranium) |
| Silent fallback used | **No** |

### Exact blocker (updated after `fig.thesmokeybarrelbar.com` retry)

1. **Public host is reachable:** `https://fig.thesmokeybarrelbar.com/api/health` → `200 {"status":"ok"}`.
2. **Auth fails:** `/api/tasks` → `401 {"error":"INVALID_API_KEY"}` with the previously supplied LAN API key (tried Bearer and `x-api-key`).
3. **No `figranium` MCP namespace** in this Cloud Agent catalog (Desktop `~/.cursor/mcp.json` does not apply).
4. **Wonder MCP** still `needsAuth`; interactive OAuth is desktop-only.
5. Cloud Agent secrets `FIGRANIUM_BASE_URL` / `FIGRANIUM_API_KEY` are still **absent**.

**Unblock now:** copy/create the API key from Figranium Settings on **this** host and set:

- `FIGRANIUM_BASE_URL=https://fig.thesmokeybarrelbar.com`
- `FIGRANIUM_API_KEY=<key for this host>`

### Planned control set (not executed)

| Case | PLCB item | Role | Runs planned |
| --- | --- | --- | --- |
| 1 | `000004766` | Captain Morgan control | 3 |
| 2 | `000009359` | Spirit (Tito's) | 3 |
| 3 | `100056945` | Wine (Santa Ema) | 3 |
| 4 | `000098661` | Different size (Mishka 1L) | 3 |
| 5 | `999999999` | No-result | 2 |

Saved task draft name: **FWGS PLCB Product Resolver** (not created). Design notes are in `poc/figranium-validation.json`.

### Unblock steps

1. Expose Figranium on a **Cloud-Agent-reachable URL** (Cloudflare Tunnel / Tailscale Funnel / ngrok / public reverse proxy) — not `192.168.1.2`.
2. Add Cloud Agent environment secrets: `FIGRANIUM_BASE_URL`, `FIGRANIUM_API_KEY`.
3. Attach custom MCP server `figranium` (`npx -y figranium-mcp`) to the **Cloud Agent environment** (not only Desktop Cursor).
4. Re-run this agent; Phase 1 must succeed with `task_list` before creating the saved task and running the 5-case control set.

Environment dashboard: https://cursor.com/dashboard/cloud-agents/environments/e/e06f916c-a6d7-11f1-a7d1-d6b4613131ce

---

## Phase 2 fallback evidence (historical — not Figranium)

| Metric | Value |
| --- | --- |
| Execution engine | Composio `BROWSER_TOOL` (`executionEngine: "fallback"`) |
| Items in matrix | 15 (12 products + 3 failure cases) |
| Total fallback runs | 21 |
| Product match rate | 17/17 (100%), 0 false positives |
| Captain Morgan 3/3 | Stable URL, proof 70, stable F1/B1 images |
| CAPTCHA / login | None observed |
| Schema compliance | 1/21 fully compliant (LLM drift) |

Artifacts: `poc/test-matrix.json`, `poc/run-results.json`

---

## Recommendation

| Option | Applies? |
| --- | --- |
| **GO** | **No** — Figranium never executed; GO requires real Figranium + 100% schema compliance |
| **CONDITIONAL GO** | Only for continuing **connectivity setup** / Desktop-side Figranium experiments |
| **NO-GO** | **Yes** for a Smokey Vault Figranium adapter until Cloud Agent can call `figranium` MCP |

### GO checklist (current)

| Requirement | Status |
| --- | --- |
| Real Figranium execution | ❌ |
| 100% schema compliance | ❌ not measured |
| 0 false positives | ⚠️ fallback only |
| Captain Morgan stable on Figranium | ❌ not run |
| Useful stable image extraction | ❌ not run on Figranium |
| Deterministic no-result behavior | ❌ not run on Figranium |
| No CAPTCHA/login dependency | ⚠️ fallback only |

---

## Artifacts

| File | Description |
| --- | --- |
| `poc/figranium-validation.json` | Phase-1 connectivity probe + planned control set + task draft |
| `poc/FWGS_PLCB_PRODUCT_RESOLVER.md` | Resolver contract v2 |
| `poc/test-matrix.json` | Full 15-case matrix |
| `poc/run-results.json` | Historical fallback runs (21) |
| `poc/POC_SUMMARY.md` | This document |
| `poc/run-plan.mjs` | Fallback prompt builder (not used this phase) |
