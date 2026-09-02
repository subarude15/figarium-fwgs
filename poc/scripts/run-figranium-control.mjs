import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire('/tmp/fig-sdk/package.json');
const { Figranium } = require('@figranium/sdk');

const baseUrl = process.env.FIGRANIUM_BASE_URL;
const apiKey = process.env.FIGRANIUM_API_KEY;
if (!baseUrl || !apiKey) {
  console.error('Missing FIGRANIUM_BASE_URL / FIGRANIUM_API_KEY');
  process.exit(1);
}

const f = new Figranium({ baseUrl, apiKey, timeoutMs: 300000 });

const extractionScript = `
const plcbItem = "{$plcbItem}";
const href = (typeof $$data !== "undefined" && $$data.url) ? String($$data.url) : "";
const text = (document.body && (document.body.textContent || document.body.innerText)) ? String(document.body.textContent || document.body.innerText) : "";
const selectorFailures = [];
const captchaSeen = /captcha|recaptcha|hcaptcha|cf-turnstile/i.test(text + href);
const loginRequired = /\\/login|\\/signin/i.test(href);

function absUrl(u) {
  try { return new URL(u, href || "https://www.finewineandgoodspirits.com/").href; } catch (e) { return null; }
}
function numOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
}
function pickLabelValue(labelRe) {
  const lines = text.split(/\\n+/).map(function(s){ return s.trim(); }).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    if (labelRe.test(lines[i])) {
      const parts = lines[i].split(/[:\\u2013\\u2014]/);
      if (parts.length > 1 && parts.slice(1).join(":").trim()) return parts.slice(1).join(":").trim();
      if (lines[i+1] && !labelRe.test(lines[i+1])) return lines[i+1];
    }
  }
  const dts = Array.from(document.querySelectorAll("dt"));
  for (const dt of dts) {
    if (labelRe.test((dt.textContent || "").trim())) {
      const dd = dt.nextElementSibling;
      if (dd) return dd.textContent.trim();
    }
  }
  return null;
}
function empty(overrides) {
  const base = {
    matched: false,
    ambiguous: false,
    notFound: false,
    plcbItem: plcbItem,
    productUrl: null,
    name: null,
    brand: null,
    proof: null,
    abv: null,
    volumeText: null,
    category: null,
    subcategory: null,
    country: null,
    region: null,
    imageUrls: [],
    primaryImageUrl: null,
    diagnostics: {
      searchResultCount: null,
      captchaSeen: !!captchaSeen,
      loginRequired: !!loginRequired,
      selectorFailures: selectorFailures.slice(),
      durationMs: null
    }
  };
  return Object.assign(base, overrides || {});
}

const isNoResult = /no-search-results/i.test(href) || /sorry,\\s*there were no search results/i.test(text);
const productAnchors = Array.from(document.querySelectorAll('a[href*="/product/"]'))
  .map(function(a){ return absUrl(a.getAttribute("href")); })
  .filter(Boolean);
const uniqueProductUrls = Array.from(new Set(productAnchors.filter(function(u){ return /\\/product\\/[0-9A-Za-z]+/i.test(u); })));
const onPdp = /\\/product\\/[0-9A-Za-z]+/i.test(href);

if (!onPdp) {
  const count = isNoResult ? 0 : uniqueProductUrls.length;
  if (count === 0 || isNoResult) {
    return empty({
      notFound: true,
      diagnostics: { searchResultCount: 0, captchaSeen: !!captchaSeen, loginRequired: !!loginRequired, selectorFailures: selectorFailures.slice(), durationMs: null }
    });
  }
  if (count > 1) {
    return empty({
      ambiguous: true,
      diagnostics: { searchResultCount: count, captchaSeen: !!captchaSeen, loginRequired: !!loginRequired, selectorFailures: selectorFailures.slice(), durationMs: null }
    });
  }
  selectorFailures.push("expected_pdp_after_single_result");
  return empty({
    diagnostics: { searchResultCount: 1, captchaSeen: !!captchaSeen, loginRequired: !!loginRequired, selectorFailures: selectorFailures.slice(), durationMs: null }
  });
}

const pdpMatch = href.match(/\\/product\\/([0-9A-Za-z]+)/i);
const pdpItem = pdpMatch ? pdpMatch[1] : null;
const h1 = document.querySelector("h1");
const name = h1 ? String(h1.textContent || "").trim() : null;
if (!name) selectorFailures.push("h1_name");

const brand = pickLabelValue(/^brand$/i);
let volumeText = pickLabelValue(/^(size|volume)$/i);
if (!volumeText) {
  const m = text.match(/\\b(\\d+(?:\\.\\d+)?\\s?(?:mL|ML|L))\\b/);
  volumeText = m ? m[1] : null;
}
const category = pickLabelValue(/^(type|category)$/i);
const subcategory = pickLabelValue(/^sub[- ]?category$/i);
const country = pickLabelValue(/^country$/i);
const region = pickLabelValue(/^region$/i);

let proof = numOrNull(pickLabelValue(/^proof$/i));
let abv = numOrNull(pickLabelValue(/^(abv|alcohol by volume|alcohol)$/i));
if (proof == null) {
  const m = text.match(/\\bPROOF\\s*[:\\s]*([0-9]{2,3})\\b/i);
  if (m) proof = Number(m[1]);
}
if (abv == null) {
  const m = text.match(/\\b([0-9]{1,2}(?:\\.[0-9]+)?)\\s*%\\s*(?:alc|alcohol|abv)\\b/i);
  if (m) abv = Number(m[1]);
}

const imageCandidates = Array.from(document.querySelectorAll("img"))
  .map(function(img){ return absUrl(img.getAttribute("src") || img.getAttribute("data-src") || img.getAttribute("data-lazy-src")); })
  .filter(Boolean)
  .filter(function(u){ return /\\/products\\//i.test(u) || /ccstore\\/v1\\/images/i.test(u); })
  .filter(function(u){ return !/logo|icon|banner|sprite|svg-dividers|favicon/i.test(u); });
const uniqueImages = Array.from(new Set(imageCandidates));
let primaryImageUrl = null;
for (const u of uniqueImages) { if (/_F1\\./i.test(u)) { primaryImageUrl = u; break; } }
if (!primaryImageUrl) {
  for (const u of uniqueImages) { if (/products\\//i.test(u)) { primaryImageUrl = u; break; } }
}
if (!primaryImageUrl) primaryImageUrl = uniqueImages[0] || null;

return {
  matched: true,
  ambiguous: false,
  notFound: false,
  plcbItem: plcbItem,
  productUrl: href.split("?")[0],
  name: name,
  brand: brand,
  proof: proof,
  abv: abv,
  volumeText: volumeText,
  category: category,
  subcategory: subcategory,
  country: country,
  region: region,
  imageUrls: uniqueImages,
  primaryImageUrl: primaryImageUrl,
  diagnostics: {
    searchResultCount: 1,
    captchaSeen: !!captchaSeen,
    loginRequired: !!loginRequired,
    selectorFailures: selectorFailures.slice(),
    durationMs: null,
    pdpItem: pdpItem
  }
};
`;

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

function normalize(data, durationClientMs) {
  const d = data.diagnostics || {};
  return {
    matched: !!data.matched,
    ambiguous: !!data.ambiguous,
    notFound: !!data.notFound,
    plcbItem: data.plcbItem ?? null,
    productUrl: data.productUrl ?? null,
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

const tasks = await f.tasks.list();
const task = tasks.find(t => t.name === 'FWGS PLCB Product Resolver');
if (!task) throw new Error('missing task');
task.extractionScript = extractionScript;
task.includeHtml = false;
await f.tasks.save(task);
console.log('TASK', task.id);

const allRuns = [];
for (const c of cases) {
  for (let run = 1; run <= c.runs; run++) {
    console.log(`\\n=== case ${c.case} ${c.plcbItem} run ${run}/${c.runs} ===`);
    const t0 = Date.now();
    let raw = null;
    let err = null;
    try {
      raw = await f.runTask(task.id, { variables: { plcbItem: c.plcbItem } }, { timeoutMs: 300000 });
    } catch (e) {
      err = { status: e.status, code: e.code, message: e.message };
    }
    const durationClientMs = Date.now() - t0;
    let data = raw && raw.data;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch (_) {}
    }
    const normalized = (data && typeof data === 'object' && !Array.isArray(data) && typeof data.matched === 'boolean')
      ? normalize(data, durationClientMs)
      : null;
    const compliance = normalized
      ? schemaCheck(normalized)
      : { ok: false, issues: ['no_structured_data', typeof data === 'string' ? data.slice(0, 200) : String(data)] };

    let falsePositive = false;
    let matchOk = null;
    if (normalized && c.expect.matched) {
      matchOk = normalized.matched === true && !!normalized.productUrl && normalized.productUrl.includes('/product/' + c.plcbItem);
      if (normalized.matched && !matchOk) falsePositive = true;
      if (c.expect.nameIncludes && normalized.name && !normalized.name.includes(c.expect.nameIncludes)) falsePositive = true;
    }
    if (normalized && c.expect.notFound) {
      matchOk = normalized.matched === false && normalized.notFound === true && normalized.productUrl === null;
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
    };
    allRuns.push(record);
    fs.writeFileSync(progressPath, JSON.stringify({ taskId: task.id, completed: allRuns.length, total: 14, latest: record }, null, 2));
    console.log(JSON.stringify({
      case: c.case, run, schemaCompliant: compliance.ok, matched: normalized?.matched, notFound: normalized?.notFound,
      name: normalized?.name, proof: normalized?.proof, volumeText: normalized?.volumeText,
      productUrl: normalized?.productUrl, primaryImageUrl: normalized?.primaryImageUrl,
      durationClientMs, issues: compliance.issues, falsePositive
    }));
    await new Promise(r => setTimeout(r, 2000));
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
