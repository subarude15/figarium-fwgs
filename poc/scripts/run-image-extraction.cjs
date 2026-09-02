const fs = require('fs');
const path = require('path');
const { Figranium, actions } = require('@figranium/sdk');

const baseUrl = process.env.FIGRANIUM_BASE_URL;
const apiKey = process.env.FIGRANIUM_API_KEY;
if (!baseUrl || !apiKey) {
  console.error('Missing FIGRANIUM_BASE_URL / FIGRANIUM_API_KEY');
  process.exit(1);
}

const f = new Figranium({ baseUrl, apiKey, timeoutMs: 180000 });
const probeScript = require('./image-probe-browser.js');

const cases = [
  { case: 1, itemId: 'spirit-captain-morgan-175l', plcbItem: '000004766', nameIncludes: 'Captain Morgan' },
  { case: 2, itemId: 'spirit-titos-750ml', plcbItem: '000009359', nameIncludes: 'Tito' },
  { case: 3, itemId: 'wine-santa-ema-sauv-blanc', plcbItem: '100056945', nameIncludes: 'Santa Ema' },
  { case: 4, itemId: 'spirit-mishka-1l', plcbItem: '000098661', nameIncludes: 'Mishka' },
];

const outPath = '/workspace/poc/image-extraction-runs.json';
const progressPath = '/workspace/poc/image-extraction-progress.json';
const onlyCase = process.env.ONLY_CASE ? Number(process.env.ONLY_CASE) : null;
const onlyRuns = process.env.ONLY_RUNS ? Number(process.env.ONLY_RUNS) : null;
const mode = process.env.MODE || 'matrix';

function assetKey(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const src = u.searchParams.get('source');
    if (src) return src;
    return u.pathname;
  } catch {
    const m = String(url).match(/\/file\/[^?&#]+\/products\/[^?&#]+/i);
    return m ? m[0] : url;
  }
}

const extractionScript = `
const plcbItem = "{$plcbItem}";
function empty() {
  return {
    matched: true,
    plcbItem,
    imageUrls: [],
    primaryImageUrl: null,
    extractionSource: null,
    candidateCount: 0,
    identityEvidence: { plcbInPrimaryUrl: false, plcbInAnyUrl: false, productPathMatch: false, skuInJsonLd: false },
    diagnostics: { captchaSeen: false, loginRequired: false, selectorFailures: [], durationMs: null }
  };
}
try {
  const el = document.getElementById('fwgs-image-payload');
  if (el && el.textContent) {
    const payload = JSON.parse(el.textContent);
    return Object.assign(empty(), payload, { matched: !!(payload.primaryImageUrl) });
  }
} catch (e) {}

// Fallback: read structured metadata directly if still present in extraction DOM
const found = [];
function add(u, source) {
  if (!u) return;
  const s = String(u);
  if (!/products\\//i.test(s) && !/ccstore\\/v1\\/images/i.test(s)) return;
  if (/logo|icon|banner|favicon|occ-public|general\\//i.test(s)) return;
  if (plcbItem && !s.includes(plcbItem)) return;
  let abs = s;
  try { abs = new URL(s, 'https://www.finewineandgoodspirits.com/').href; } catch (e) {}
  if (!found.some(x => x.url === abs)) found.push({ url: abs, source });
}
const og = document.querySelector('meta[property="og:image"], meta[property="og:image:secure_url"]');
if (og) add(og.getAttribute('content'), 'embedded_json');
document.querySelectorAll('script[type="application/ld+json"]').forEach(function(node){
  try {
    const j = JSON.parse(node.textContent || '');
    const nodes = Array.isArray(j) ? j : [j].concat(j['@graph'] || []);
    nodes.forEach(function(n){
      [].concat((n && n.image) || []).flat().forEach(function(u){
        add(typeof u === 'string' ? u : (u && u.url), 'embedded_json');
      });
    });
  } catch (e) {}
});
const attr = document.documentElement.getAttribute('data-fwgs-primary-image');
if (attr) add(attr, document.documentElement.getAttribute('data-fwgs-image-source') || 'dom');

let html = '';
try { html = String($$data.html() || ''); } catch (e) {}
const fileHits = html.match(/\\/file\\/[^"'\\\\s>]+\\/products\\/[^"'\\\\s>]+/ig) || [];
fileHits.forEach(function(p){
  if (plcbItem && !p.includes(plcbItem)) return;
  add('https://www.finewineandgoodspirits.com/ccstore/v1/images/?source=' + p + '&height=475&width=475', 'other');
});

const primary = found.find(x => /_F1\\./i.test(x.url)) || found[0] || null;
return {
  matched: !!primary,
  plcbItem,
  imageUrls: found.map(x => x.url),
  primaryImageUrl: primary ? primary.url : null,
  extractionSource: primary ? primary.source : null,
  candidateCount: found.length,
  identityEvidence: {
    plcbInPrimaryUrl: !!(primary && primary.url.includes(plcbItem)),
    plcbInAnyUrl: found.some(x => x.url.includes(plcbItem)),
    productPathMatch: true,
    skuInJsonLd: false
  },
  diagnostics: { captchaSeen: false, loginRequired: false, selectorFailures: primary ? [] : ['primary_image_missing'], durationMs: null }
};
`;

async function ensureImageTask() {
  const tasks = await f.tasks.list();
  let task = tasks.find(t => t.name === 'FWGS PLCB Image Extractor');
  const payload = {
    ...(task || {}),
    name: 'FWGS PLCB Image Extractor',
    description: 'Open known FWGS PDP and recover product image URLs from og:image / JSON-LD / live DOM / network.',
    url: 'https://www.finewineandgoodspirits.com/',
    mode: 'agent',
    wait: 1,
    variables: {
      plcbItem: { type: 'string', value: '000004766' },
      pdpUrl: { type: 'string', value: 'https://www.finewineandgoodspirits.com/product/000004766' },
    },
    actions: [
      actions.navigate('{$pdpUrl}'),
      actions.wait(5),
      actions.javascript(`(() => {
        for (const b of document.querySelectorAll('button')) {
          const t = (b.textContent || '').trim();
          if (/^(YES|Accept|Got it|Shop as Guest|Continue)$/i.test(t)) b.click();
        }
        return true;
      })()`),
      actions.wait(2),
      actions.javascript(probeScript, 'imageProbe'),
      actions.wait(1),
    ],
    extractionScript,
    extractionFormat: 'json',
    includeHtml: true,
    includeShadowDom: true,
    disableRecording: true,
    rotateProxies: false,
    autoSolveCaptcha: false,
    statelessExecution: false,
  };
  return f.tasks.save(payload);
}

async function probeReachabilityViaFigranium(taskId, imageUrl) {
  if (!imageUrl) return null;
  // Use a tiny Figranium http_request from an already-cookied browser session
  try {
    const probeTask = {
      name: 'FWGS image reachability probe',
      url: imageUrl,
      mode: 'agent',
      wait: 1,
      disableRecording: true,
      actions: [
        actions.navigate(imageUrl),
        actions.wait(2),
        actions.javascript(`(() => ({ href: location.href, title: document.title, bodyStart: (document.body && document.body.innerText || '').slice(0,120), isImg: /\\\\.(jpg|jpeg|png|webp)/i.test(location.pathname) || /ccstore\\\\/v1\\\\/images/i.test(location.href) }))()`),
      ],
      extractionScript: `return { href: location.href, contentTypeGuess: document.contentType || null, title: document.title };`,
    };
    const saved = await f.tasks.save(probeTask);
    const raw = await f.runTask(saved.id, {}, { timeoutMs: 90000 });
    return {
      via: 'figranium-navigate',
      finalUrl: raw.final_url,
      outcome: raw.outcome,
      data: raw.data,
      // Direct cloud fetch often Akamai 403; Figranium browser navigate is the realistic check
    };
  } catch (e) {
    return { via: 'figranium-navigate', error: e.message, status: e.status };
  }
}

async function directFetch(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(20000), headers: { 'user-agent': 'Mozilla/5.0' } });
    const ctype = res.headers.get('content-type');
    const buf = Buffer.from(await res.arrayBuffer());
    return { httpStatus: res.status, contentType: ctype, bytes: buf.length, reachable: res.ok && /image\\//i.test(ctype || '') };
  } catch (e) {
    return { reachable: false, error: e.message };
  }
}

function pickResult(raw) {
  const data = raw && raw.data;
  if (data && typeof data === 'object' && (data.primaryImageUrl || (Array.isArray(data.imageUrls) && data.imageUrls.length))) {
    return { ...data, resultOrigin: 'extraction' };
  }
  if (raw && raw.imageProbe) return { ...raw.imageProbe, resultOrigin: 'top.imageProbe' };
  if (raw && raw.variables && raw.variables.imageProbe) return { ...raw.variables.imageProbe, resultOrigin: 'variables.imageProbe' };
  return data && typeof data === 'object' ? { ...data, resultOrigin: 'extraction_empty' } : { resultOrigin: 'none', rawKeys: Object.keys(raw || {}) };
}

async function runOne(task, c, run, { checkReach } = {}) {
  const pdpUrl = 'https://www.finewineandgoodspirits.com/product/' + c.plcbItem;
  const t0 = Date.now();
  let raw = null;
  let err = null;
  try {
    raw = await f.runTask(task.id, { variables: { plcbItem: c.plcbItem, pdpUrl } }, { timeoutMs: 150000 });
  } catch (e) {
    err = { status: e.status, code: e.code, message: e.message };
  }
  const durationMs = Date.now() - t0;
  const picked = pickResult(raw);
  const imageUrls = Array.isArray(picked.imageUrls) ? picked.imageUrls : [];
  const primaryImageUrl = picked.primaryImageUrl || imageUrls[0] || null;
  const primarySource = picked.primarySource || picked.extractionSource || null;
  const identityEvidence = picked.identityEvidence || {
    plcbInPrimaryUrl: !!(primaryImageUrl && primaryImageUrl.includes(c.plcbItem)),
    plcbInAnyUrl: imageUrls.some(u => u.includes(c.plcbItem)),
  };
  const direct = await directFetch(primaryImageUrl);
  let viaFig = null;
  if (checkReach && primaryImageUrl && run === 1 && c.case === 1) {
    viaFig = await probeReachabilityViaFigranium(task.id, primaryImageUrl);
  }

  return {
    case: c.case,
    itemId: c.itemId,
    plcbItem: c.plcbItem,
    run,
    executionEngine: 'figranium',
    taskId: task.id,
    taskName: task.name,
    outcome: raw?.outcome || (err ? 'error' : null),
    finalUrl: raw?.final_url || null,
    durationMs,
    imageUrls,
    primaryImageUrl,
    candidateCount: picked.candidateCount ?? imageUrls.length,
    extractionSource: primarySource,
    identityEvidence,
    assetKey: assetKey(primaryImageUrl),
    reachabilityDirect: direct,
    reachabilityFigranium: viaFig,
    falseRecommendationRisk: !!(primaryImageUrl && !primaryImageUrl.includes(c.plcbItem)),
    error: err,
    resultOrigin: picked.resultOrigin,
    rawDataPreview: primaryImageUrl ? undefined : picked,
  };
}

async function main() {
  const healthRes = await fetch(baseUrl.replace(/\\/$/, '') + '/api/health');
  const healthText = await healthRes.text();
  let health;
  try { health = JSON.parse(healthText); } catch { health = { raw: healthText }; }
  if (!healthRes.ok || health.status !== 'ok') {
    console.error('FIGRANIUM_DOWN', healthRes.status, health);
    process.exit(2);
  }

  const task = await ensureImageTask();
  console.log('TASK', task.id, task.name);

  if (mode === 'probe') {
    const rec = await runOne(task, cases[0], 1, { checkReach: true });
    console.log(JSON.stringify(rec, null, 2));
    fs.writeFileSync(progressPath, JSON.stringify(rec, null, 2));
    return;
  }

  const selected = cases.filter(c => onlyCase == null || c.case === onlyCase);
  const all = [];
  for (const c of selected) {
    const runs = onlyRuns || 3;
    for (let run = 1; run <= runs; run++) {
      console.log(`\\n=== case ${c.case} ${c.plcbItem} run ${run}/${runs} ===`);
      const rec = await runOne(task, c, run, { checkReach: run === 1 && c.case === 1 });
      all.push(rec);
      fs.writeFileSync(progressPath, JSON.stringify({ completed: all.length, total: selected.length * (onlyRuns || 3), latest: rec }, null, 2));
      console.log(JSON.stringify({
        case: c.case, run, primaryImageUrl: rec.primaryImageUrl, source: rec.extractionSource,
        count: rec.imageUrls.length, assetKey: rec.assetKey,
        identityOk: rec.identityEvidence?.plcbInPrimaryUrl,
        directReachable: rec.reachabilityDirect?.reachable,
        durationMs: rec.durationMs, error: rec.error?.message || null
      }));
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  const byItem = {};
  for (const r of all) {
    (byItem[r.plcbItem] = byItem[r.plcbItem] || []).push(r);
  }
  const stability = Object.fromEntries(Object.entries(byItem).map(([plcb, rows]) => {
    const keys = rows.map(r => r.assetKey).filter(Boolean);
    const urls = rows.map(r => r.primaryImageUrl).filter(Boolean);
    return [plcb, {
      runs: rows.length,
      primaryPresent: urls.length,
      exactUrlStable: urls.length === rows.length && urls.every(u => u === urls[0]),
      assetKeyStable: keys.length === rows.length && keys.every(k => k === keys[0]),
      uniqueExactUrls: [...new Set(urls)],
      uniqueAssetKeys: [...new Set(keys)],
      sources: [...new Set(rows.map(r => r.extractionSource).filter(Boolean))],
    }];
  }));

  fs.writeFileSync(outPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    baseUrl,
    taskId: task.id,
    taskName: task.name,
    executionInterface: 'figranium-sdk-http',
    method: 'Live browser JS reads og:image + JSON-LD Product.image (PLCB in asset path); stashes payload for extraction.',
    runs: all,
    stability,
  }, null, 2));
  console.log('WROTE', all.length, 'runs');
  console.log(JSON.stringify(stability, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
