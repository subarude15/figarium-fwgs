import { Figranium, actions, variable } from '@figranium/sdk';

const baseUrl = process.env.FIGRANIUM_BASE_URL;
const apiKey = process.env.FIGRANIUM_API_KEY;
if (!baseUrl || !apiKey) {
  console.error('FIGRANIUM_BASE_URL and FIGRANIUM_API_KEY required');
  process.exit(1);
}

const f = new Figranium({ baseUrl, apiKey, timeoutMs: 300000 });

const extractionScript = `
const started = Date.now();
const plcbItem = String(variables?.plcbItem ?? '{$plcbItem}' ?? '');
const text = (document.body?.innerText || '');
const href = location.href;

const captchaSeen = /captcha|recaptcha|hcaptcha|cf-turnstile/i.test(text) || !!document.querySelector('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], .cf-turnstile');
const loginRequired = /sign in|log in|create an account/i.test(document.title) && /login|signin/i.test(href);
const selectorFailures = [];

function absUrl(u) {
  try { return new URL(u, location.href).href; } catch { return null; }
}

function numOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function pickLabelValue(labelRe) {
  const labels = Array.from(document.querySelectorAll('dt, th, span, div, li, p, strong, label'));
  for (const el of labels) {
    const t = (el.textContent || '').trim();
    if (!labelRe.test(t)) continue;
    // sibling / next value patterns
    let val = el.nextElementSibling?.textContent?.trim();
    if (!val) {
      const parent = el.parentElement;
      if (parent) {
        const clone = parent.cloneNode(true);
        const first = clone.firstElementChild;
        if (first) first.remove();
        val = clone.textContent?.trim();
      }
    }
    if (val && !labelRe.test(val)) return val;
  }
  // fallback: line scan
  const lines = text.split(/\\n+/).map(s => s.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    if (labelRe.test(lines[i])) {
      const same = lines[i].split(/[:\\u2013\\u2014-]/);
      if (same.length > 1 && same[1].trim()) return same[1].trim();
      if (lines[i+1]) return lines[i+1];
    }
  }
  return null;
}

const empty = (overrides = {}) => ({
  matched: false,
  ambiguous: false,
  notFound: false,
  plcbItem,
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
    selectorFailures,
    durationMs: null
  },
  ...overrides
});

// Search / no-result page handling
const isNoResult = /no-search-results/i.test(href) || /sorry,\\s*there were no search results/i.test(text);
const productAnchors = Array.from(document.querySelectorAll('a[href*="/product/"]'))
  .map(a => absUrl(a.getAttribute('href')))
  .filter(Boolean);
const uniqueProductUrls = [...new Set(productAnchors.filter(u => /\\/product\\/[0-9A-Za-z]+/i.test(u)))];

const onPdp = /\\/product\\/[0-9A-Za-z]+/i.test(href);

if (!onPdp) {
  const count = isNoResult ? 0 : uniqueProductUrls.length;
  if (count === 0 || isNoResult) {
    return empty({
      notFound: true,
      diagnostics: {
        searchResultCount: 0,
        captchaSeen: !!captchaSeen,
        loginRequired: !!loginRequired,
        selectorFailures,
        durationMs: null
      }
    });
  }
  if (count > 1) {
    return empty({
      ambiguous: true,
      diagnostics: {
        searchResultCount: count,
        captchaSeen: !!captchaSeen,
        loginRequired: !!loginRequired,
        selectorFailures,
        durationMs: null
      }
    });
  }
  // Single search hit but still on SERP — should have been clicked by actions; treat as incomplete
  selectorFailures.push('expected_pdp_after_single_result');
  return empty({
    diagnostics: {
      searchResultCount: 1,
      captchaSeen: !!captchaSeen,
      loginRequired: !!loginRequired,
      selectorFailures,
      durationMs: null
    }
  });
}

// PDP extraction
const pdpMatch = href.match(/\\/product\\/([0-9A-Za-z]+)/i);
const pdpItem = pdpMatch ? pdpMatch[1] : null;

let name = document.querySelector('h1')?.textContent?.trim() || null;
if (!name) selectorFailures.push('h1_name');

const brand =
  pickLabelValue(/^brand$/i) ||
  document.querySelector('[itemprop="brand"]')?.textContent?.trim() ||
  null;

const volumeText =
  pickLabelValue(/^(size|volume)$/i) ||
  (text.match(/\\b(\\d+(?:\\.\\d+)?\\s?(?:mL|ML|L|l))\\b/) || [])[1] ||
  null;

const category =
  pickLabelValue(/^(type|category)$/i) ||
  null;

const subcategory = pickLabelValue(/^sub[- ]?category$/i) || null;
const country = pickLabelValue(/^country$/i) || null;
const region = pickLabelValue(/^region$/i) || null;

let proof = numOrNull(pickLabelValue(/^proof$/i));
let abv = numOrNull(pickLabelValue(/^(abv|alcohol by volume|alcohol)$/i));
// common "PROOF 70" inline
if (proof == null) {
  const m = text.match(/\\bPROOF\\s*[:\\s]*([0-9]{2,3})\\b/i);
  if (m) proof = Number(m[1]);
}
if (abv == null) {
  const m = text.match(/\\b([0-9]{1,2}(?:\\.[0-9]+)?)\\s*%\\s*(?:alc|alcohol|abv)\\b/i);
  if (m) abv = Number(m[1]);
}

const imageCandidates = Array.from(document.querySelectorAll('img'))
  .map(img => absUrl(img.currentSrc || img.getAttribute('src') || img.getAttribute('data-src')))
  .filter(Boolean)
  .filter(u => /\\/products\\//i.test(u) || /ccstore\\/v1\\/images/i.test(u))
  .filter(u => !/logo|icon|banner|sprite|svg-dividers|favicon/i.test(u));

const uniqueImages = [...new Set(imageCandidates)];
const primaryImageUrl =
  uniqueImages.find(u => /_F1\\./i.test(u)) ||
  uniqueImages.find(u => /products\\//i.test(u)) ||
  uniqueImages[0] ||
  null;

const itemOnPage = pdpItem || (text.match(/\\b(0000\\d{5}|1000\\d{5}|\\d{6,9})\\b/) || [])[1] || null;
const plcbItemMatched = !!(itemOnPage && String(itemOnPage) === String(plcbItem));

return {
  matched: true,
  ambiguous: false,
  notFound: false,
  plcbItem,
  productUrl: href.split('?')[0],
  name,
  brand,
  proof,
  abv,
  volumeText,
  category,
  subcategory,
  country,
  region,
  imageUrls: uniqueImages,
  primaryImageUrl,
  diagnostics: {
    searchResultCount: 1,
    captchaSeen: !!captchaSeen,
    loginRequired: !!loginRequired,
    selectorFailures,
    durationMs: null,
    pdpItem: itemOnPage,
    plcbItemMatched
  }
};
`;

const task = {
  name: 'FWGS PLCB Product Resolver',
  description: 'Deterministic PLCB item resolver against Fine Wine & Good Spirits. Input: plcbItem. Returns strict JSON schema.',
  url: 'https://www.finewineandgoodspirits.com/',
  mode: 'agent',
  wait: 2,
  variables: {
    plcbItem: { type: 'string', value: '000004766' },
  },
  actions: [
    actions.navigate('https://www.finewineandgoodspirits.com/'),
    actions.wait(2),
    // Age gate YES if present
    actions.javascript(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => /^\\s*YES\\s*$/i.test((b.textContent||'').trim()));
      if (btn) { btn.click(); return true; }
      return false;
    })()`),
    actions.wait(1),
    actions.navigate('https://www.finewineandgoodspirits.com/search?Ntt=' + '{$plcbItem}'),
    actions.wait(4),
    // Dismiss age gate again if search redirected through it
    actions.javascript(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => /^\\s*YES\\s*$/i.test((b.textContent||'').trim()));
      if (btn) { btn.click(); return true; }
      return false;
    })()`),
    actions.wait(2),
    // If exactly one product card/link, open it
    actions.javascript(`(() => {
      if (/no-search-results/i.test(location.href)) return { count: 0 };
      const urls = [...new Set(Array.from(document.querySelectorAll('a[href*="/product/"]'))
        .map(a => a.href)
        .filter(u => /\\/product\\/[0-9A-Za-z]+/i.test(u)))];
      if (urls.length === 1) {
        location.href = urls[0];
        return { count: 1, opened: urls[0] };
      }
      return { count: urls.length, urls };
    })()`),
    actions.wait(5),
  ],
  extractionScript,
  extractionFormat: 'json',
  includeHtml: false,
  disableRecording: true,
  rotateProxies: false,
  autoSolveCaptcha: false,
  statelessExecution: false,
};

const saved = await f.tasks.save(task);
console.log(JSON.stringify({ id: saved.id, name: saved.name, mode: saved.mode }, null, 2));
