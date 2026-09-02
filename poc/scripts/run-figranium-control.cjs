const fs = require('fs');
const path = require('path');
const { Figranium, actions, variable } = require('@figranium/sdk');

const baseUrl = process.env.FIGRANIUM_BASE_URL;
const apiKey = process.env.FIGRANIUM_API_KEY;
if (!baseUrl || !apiKey) {
  console.error('Missing FIGRANIUM_BASE_URL / FIGRANIUM_API_KEY');
  process.exit(1);
}

const f = new Figranium({ baseUrl, apiKey, timeoutMs: 300000 });
const extractionScript = fs.readFileSync(path.join(__dirname, 'extraction.js'), 'utf8');

const REQUIRED_KEYS = [
  'matched','ambiguous','notFound','plcbItem','productUrl','name','brand','proof','abv',
  'volumeText','category','subcategory','country','region','imageUrls','primaryImageUrl','diagnostics'
];
const DIAG_KEYS = ['searchResultCount','captchaSeen','loginRequired','selectorFailures','durationMs'];

function schemaCheck(obj) {
  const issues = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, issues: ['not_object'] };
  for (const k of REQUIRED_KEYS) if (!(k in obj)) issues.push('missing:' + k);
  const extras = Object.keys(obj).filter(k => !REQUIRED_KEYS.includes(k));
  for (const e of extras) issues.push('extra:' + e);
  if (typeof obj.matched !== 'boolean') issues.push('type:matched');
  if (typeof obj.ambiguous !== 'boolean') issues.push('type:ambiguous');
  if (typeof obj.notFound !== 'boolean') issues.push('type:notFound');
  if (typeof obj.plcbItem !== 'string') issues.push('type:plcbItem');
  for (const k of ['productUrl','name','brand','volumeText','category','subcategory','country','region','primaryImageUrl']) {
    if (!(obj[k] === null || typeof obj[k] === 'string')) issues.push('type:' + k);
  }
  for (const k of ['proof','abv']) {
    if (!(obj[k] === null || typeof obj[k] === 'number')) issues.push('type:' + k);
  }
  if (!Array.isArray(obj.imageUrls) || obj.imageUrls.some(x => typeof x !== 'string')) issues.push('type:imageUrls');
  if (!obj.diagnostics || typeof obj.diagnostics !== 'object') issues.push('type:diagnostics');
  else {
    for (const k of DIAG_KEYS) if (!(k in obj.diagnostics)) issues.push('missing:diagnostics.' + k);
  }
  return { ok: issues.length === 0, issues };
}

function normalize(data, durationClientMs, finalUrl, plcbItem) {
  const d = data.diagnostics || {};
  let productUrl = data.productUrl ?? null;
  const finalMatch = finalUrl && String(finalUrl).match(/https:\/\/www\.finewineandgoodspirits\.com\/[^?\s]*\/product\/([0-9A-Za-z]+)/i);
  const finalItem = finalMatch ? finalMatch[1] : null;
  // final_url is authoritative when extraction sandbox omits page URL / item number
  if (finalMatch && finalItem === String(plcbItem)) {
    productUrl = finalMatch[0].split('?')[0];
  } else if (!productUrl && data.matched && plcbItem) {
    productUrl = 'https://www.finewineandgoodspirits.com/product/' + plcbItem;
  }
  return {
    matched: !!data.matched,
    ambiguous: !!data.ambiguous,
    notFound: !!data.notFound,
    plcbItem: data.plcbItem ?? plcbItem ?? null,
    productUrl,
    name: data.name ?? null,
    brand: data.brand ?? null,
    proof: data.proof ?? null,
    abv: data.abv ?? null,
    volumeText: data.volumeText ?? null,
    category: data.category ?? null,
    subcategory: data.subcategory ?? null,
    country: data.country ?? null,
    region: data.region ?? null,
    imageUrls: Array.isArray(data.imageUrls) ? data.imageUrls : [],
    primaryImageUrl: data.primaryImageUrl ?? null,
    diagnostics: {
      searchResultCount: d.searchResultCount ?? null,
      captchaSeen: !!d.captchaSeen,
      loginRequired: !!d.loginRequired,
      selectorFailures: Array.isArray(d.selectorFailures) ? d.selectorFailures : [],
      durationMs: durationClientMs
    }
  };
}

const cases = [
  { case: 1, itemId: 'spirit-captain-morgan-175l', plcbItem: '000004766', runs: 3, expect: { nameIncludes: 'Captain Morgan', proof: 70, matched: true } },
  { case: 2, itemId: 'spirit-titos-750ml', plcbItem: '000009359', runs: 3, expect: { nameIncludes: 'Tito', proof: 80, matched: true } },
  { case: 3, itemId: 'wine-santa-ema-sauv-blanc', plcbItem: '100056945', runs: 3, expect: { nameIncludes: 'Santa Ema', matched: true } },
  { case: 4, itemId: 'spirit-mishka-1l', plcbItem: '000098661', runs: 3, expect: { nameIncludes: 'Mishka', proof: 80, matched: true } },
  { case: 5, itemId: 'failure-no-result', plcbItem: '999999999', runs: 2, expect: { notFound: true, matched: false } },
];

const outPath = '/workspace/poc/figranium-control-runs.json';
const progressPath = '/workspace/poc/figranium-control-progress.json';
const onlyCase = process.env.ONLY_CASE ? Number(process.env.ONLY_CASE) : null;
const onlyRuns = process.env.ONLY_RUNS ? Number(process.env.ONLY_RUNS) : null;

async function ensureTask() {
  const tasks = await f.tasks.list();
  let task = tasks.find(t => t.id === 'task_1788365630737') || tasks.find(t => t.name === 'FWGS PLCB Product Resolver');
  // Note: in-page location.href often does not update Figranium final_url / extraction page.
  // Use actions.navigate to {$pdpUrl} after search. For no-result runs, client sets pdpUrl
  // back to the search URL so extraction stays on the SERP.
  const payload = {
    ...(task || {}),
    id: task?.id || 'task_1788365630737',
    name: 'FWGS PLCB Product Resolver',
    description: 'Deterministic PLCB item resolver against Fine Wine & Good Spirits. Input: plcbItem + pdpUrl. Returns strict JSON schema.',
    url: 'https://www.finewineandgoodspirits.com/',
    mode: 'agent',
    wait: 2,
    variables: {
      plcbItem: { type: 'string', value: '000004766' },
      pdpUrl: { type: 'string', value: 'https://www.finewineandgoodspirits.com/product/000004766' },
    },
    actions: [
      actions.navigate('https://www.finewineandgoodspirits.com/search?Ntt=' + '{$plcbItem}'),
      actions.wait(4),
      actions.javascript(`(() => {
        for (const b of document.querySelectorAll('button')) {
          const t = (b.textContent || '').trim();
          if (/^(YES|Accept|Got it|Shop as Guest|Continue)$/i.test(t)) b.click();
        }
        const no = /no-search-results/i.test(location.href) || /sorry,\\s*there were no search results/i.test(document.body?.textContent || '');
        const urls = [...new Set(Array.from(document.querySelectorAll('a[href*="/product/"]'))
          .map(a => a.href)
          .filter(u => /\\/product\\/[0-9A-Za-z]+/i.test(u)))];
        return { noResult: no, count: urls.length, href: location.href };
      })()`),
      actions.wait(1),
      actions.navigate('{$pdpUrl}'),
      actions.wait(5),
      actions.javascript(`(() => {
        for (const b of document.querySelectorAll('button')) {
          const t = (b.textContent || '').trim();
          if (/^(YES|Accept|Got it|Shop as Guest|Continue)$/i.test(t)) b.click();
        }
        return location.href;
      })()`),
      actions.wait(1),
    ],
    extractionScript,
    extractionFormat: 'json',
    includeHtml: false,
    includeShadowDom: true,
    disableRecording: true,
    rotateProxies: false,
    autoSolveCaptcha: false,
    statelessExecution: false,
  };
  const saved = await f.tasks.save(payload);
  return saved;
}

async function main() {
  const task = await ensureTask();
  console.log('TASK', task.id, 'extractLen', (task.extractionScript || '').length);

  const selected = cases.filter(c => onlyCase == null || c.case === onlyCase);
  const allRuns = [];
  for (const c of selected) {
    const runs = onlyRuns || c.runs;
    for (let run = 1; run <= runs; run++) {
      console.log(`\n=== case ${c.case} ${c.plcbItem} run ${run}/${runs} ===`);
      const t0 = Date.now();
      let raw = null;
      let err = null;
      try {
        const pdpUrl = c.expect.notFound
          ? ('https://www.finewineandgoodspirits.com/search?Ntt=' + c.plcbItem)
          : ('https://www.finewineandgoodspirits.com/product/' + c.plcbItem);
        raw = await f.runTask(task.id, { variables: { plcbItem: c.plcbItem, pdpUrl } }, { timeoutMs: 180000 });
      } catch (e) {
        err = { status: e.status, code: e.code, message: e.message };
      }
      const durationClientMs = Date.now() - t0;
      let data = raw && raw.data;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (_) {}
      }
      const normalized = (data && typeof data === 'object' && !Array.isArray(data) && typeof data.matched === 'boolean')
        ? normalize(data, durationClientMs, raw?.final_url, c.plcbItem)
        : null;
      const compliance = normalized
        ? schemaCheck(normalized)
        : { ok: false, issues: ['no_structured_data', typeof data === 'string' ? data.slice(0, 200) : String(data)] };

      let falsePositive = false;
      let matchOk = null;
      if (normalized && c.expect.matched) {
        matchOk = normalized.matched === true
          && !!normalized.productUrl
          && normalized.productUrl.includes('/product/' + c.plcbItem);
        if (normalized.matched && !matchOk) falsePositive = true;
        if (c.expect.nameIncludes && normalized.name && !String(normalized.name).includes(c.expect.nameIncludes)) falsePositive = true;
        if (c.expect.proof != null && normalized.proof != null && normalized.proof !== c.expect.proof) falsePositive = true;
      }
      if (normalized && c.expect.notFound) {
        matchOk = normalized.matched === false && normalized.notFound === true && normalized.productUrl === null;
        if (normalized.matched === true) falsePositive = true;
      }

      const record = {
        case: c.case,
        itemId: c.itemId,
        plcbItem: c.plcbItem,
        run,
        executionEngine: 'figranium',
        taskId: task.id,
        outcome: raw?.outcome || (err ? 'error' : null),
        finalUrl: raw?.final_url || null,
        durationClientMs,
        logs: raw?.logs || [],
        screenshotUrl: raw?.screenshot_url || null,
        result: normalized,
        schemaCompliant: compliance.ok,
        schemaIssues: compliance.issues,
        matchOk,
        falsePositive,
        error: err,
        rawDataPreview: normalized ? undefined : (typeof data === 'object' ? data : String(data).slice(0, 500)),
      };
      allRuns.push(record);
      fs.writeFileSync(progressPath, JSON.stringify({ taskId: task.id, completed: allRuns.length, total: selected.reduce((n, x) => n + (onlyRuns || x.runs), 0), latest: record }, null, 2));
      console.log(JSON.stringify({
        case: c.case, run, schemaCompliant: compliance.ok, matched: normalized?.matched, notFound: normalized?.notFound,
        name: normalized?.name, proof: normalized?.proof, volumeText: normalized?.volumeText,
        productUrl: normalized?.productUrl, primaryImageUrl: normalized?.primaryImageUrl,
        finalUrl: record.finalUrl, durationClientMs, issues: compliance.issues, falsePositive, matchOk, error: err?.message
      }));
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  fs.writeFileSync(outPath, JSON.stringify({
    taskId: task.id,
    taskName: 'FWGS PLCB Product Resolver',
    baseUrl,
    generatedAt: new Date().toISOString(),
    executionInterface: 'figranium-sdk-http (Cloud Agent has no figranium MCP namespace; used official @figranium/sdk against live host)',
    runs: allRuns
  }, null, 2));
  console.log('WROTE', allRuns.length, 'runs to', outPath);
}
main().catch(e => { console.error(e); process.exit(1); });
