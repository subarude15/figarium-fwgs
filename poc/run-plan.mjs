#!/usr/bin/env node
/**
 * Batch runner for FWGS PLCB Product Resolver PoC.
 * Uses Composio Browser Tool via dynamic MCP is not available from Node;
 * this script builds prompts and records intended runs for manual/agent execution.
 * Primary execution happens through Composio MULTI_EXECUTE in the agent loop.
 */
import fs from 'node:fs';

const matrix = JSON.parse(fs.readFileSync(new URL('./test-matrix.json', import.meta.url), 'utf8'));

export function buildResolverPrompt(plcbItem, expected = {}, { executionEngine = 'fallback', runIndex = 1 } = {}) {
  const expectedBlock = JSON.stringify(expected ?? {}, null, 2);
  return `TASK NAME: FWGS PLCB Product Resolver
INPUT plcbItem: ${plcbItem}
executionEngine: ${executionEngine}
runIndex: ${runIndex}

Use a normal browser session. Do NOT solve CAPTCHAs, rotate proxies, or evade bot protection.
If CAPTCHA or hard login wall appears, stop with matched=false, captchaSeen/loginRequired set in diagnostics.

Steps:
1. Go to https://www.finewineandgoodspirits.com/
2. Accept age gate YES if shown.
3. Dismiss store/pickup modal only if it blocks search; do not log in.
4. Search for plcbItem=${plcbItem} (search box or /search?Ntt=${encodeURIComponent(plcbItem)}).
5. Count credible product results only.
6. If exactly one credible product, open it and extract metadata from that page only.
7. Return ONLY valid JSON (no markdown) matching this schema:

{
  "matched": boolean,
  "ambiguous": boolean,
  "notFound": boolean,
  "executionEngine": "${executionEngine}",
  "plcbItem": "${plcbItem}",
  "productUrl": string|null,
  "name": string|null,
  "brand": string|null,
  "proof": number|null,
  "abv": number|null,
  "volumeText": string|null,
  "category": string|null,
  "subcategory": string|null,
  "country": string|null,
  "region": string|null,
  "imageUrls": string[],
  "primaryImageUrl": string|null,
  "evidence": {
    "plcbItemMatched": boolean,
    "nameMatched": boolean|null,
    "upcMatched": boolean|null,
    "proofMatched": boolean|null
  },
  "diagnostics": {
    "searchResultCount": number|null,
    "selectorFailures": string[],
    "captchaSeen": boolean,
    "loginRequired": boolean,
    "redirected": boolean,
    "durationMs": number|null
  }
}

Expected (for evidence flags only, do not invent from this):
${expectedBlock}

Rules:
- matched=true only with exactly one credible product opened.
- ambiguous=true if >1 credible product results.
- notFound=true if 0 credible product results.
- primaryImageUrl = best bottle/product image; exclude logos/banners/recommendations.
- imageUrls = all credible product images from PDP.
- Do not scrape unrelated products.`;
}

const plan = [];
for (const item of matrix.items) {
  const runs = item.runsRequired ?? (item.category === 'failure' ? 1 : 2);
  for (let i = 1; i <= runs; i++) {
    plan.push({
      itemId: item.id,
      plcbItem: item.plcbItem,
      run: i,
      expected: item.expected,
      category: item.category,
      prompt: buildResolverPrompt(item.plcbItem, item.expected, { runIndex: i })
    });
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  console.log(JSON.stringify({ planCount: plan.length, plan }, null, 2));
}
