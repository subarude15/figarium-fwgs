/**
 * Live-browser image discovery for FWGS PDP (Figranium actions.javascript).
 * Prefer structured page metadata over guessing filenames.
 */
module.exports = String.raw`(() => {
  const plcbItem = String('{$plcbItem}' || '').trim();
  const rejectRe = /logo|icon|banner|sprite|svg-dividers|favicon|tempLogo|social|tracking|analytics|pixel|placeholder|occ-public|hamburger|arrow|similar-items|tk0x1|sp\\.pl\\?|general\\//i;

  function absUrl(u) {
    try { return new URL(u, location.href).href; } catch (e) { return null; }
  }
  function unwrapCssUrl(v) {
    const m = String(v || '').match(/url\\([\"']?([^\"')]+)[\"']?\\)/i);
    return m ? m[1] : null;
  }
  function toCcstore(u) {
    if (!u) return null;
    let s = String(u).trim();
    if (!s || s.startsWith('data:')) return null;
    if (rejectRe.test(s)) return null;
    const filePath = (s.match(/\\/file\\/[^\"'\\\\s]+\\/products\\/[^\"'\\\\s?&#]+/i) || [])[0];
    if (filePath && !/ccstore\\/v1\\/images/i.test(s)) {
      s = '/ccstore/v1/images/?source=' + filePath + '&height=475&width=475';
    }
    const abs = absUrl(s);
    if (!abs) return null;
    if (!/products\\//i.test(abs) && !/ccstore\\/v1\\/images/i.test(abs)) return null;
    if (rejectRe.test(abs)) return null;
    return abs;
  }

  const found = [];
  function add(raw, source) {
    const url = toCcstore(raw);
    if (!url) return;
    if (found.some(x => x.url === url)) return;
    found.push({ url, source });
  }

  // 1) Structured metadata (most reliable on FWGS)
  const og = document.querySelector('meta[property="og:image"], meta[property="og:image:secure_url"]');
  if (og) add(og.getAttribute('content'), 'embedded_json');
  const tw = document.querySelector('meta[name="twitter:image"], meta[name="twitter:image:src"]');
  if (tw) add(tw.getAttribute('content'), 'embedded_json');
  document.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
    const t = s.textContent || '';
    try {
      const j = JSON.parse(t);
      const nodes = Array.isArray(j) ? j : [j].concat(j['@graph'] || []);
      nodes.forEach(n => {
        if (!n || typeof n !== 'object') return;
        const imgs = [].concat(n.image || []);
        imgs.flat().forEach(u => add(typeof u === 'string' ? u : (u && u.url), 'embedded_json'));
      });
    } catch (e) {
      const m = t.match(/https?:[^\"'\\\\s]+\\/ccstore\\/v1\\/images\\/\\?[^\"'\\\\s]+|\\/file\\/[^\"'\\\\s]+\\/products\\/[^\"'\\\\s]+/ig) || [];
      m.forEach(u => add(u, 'embedded_json'));
    }
  });

  // 2) Live DOM / shadow DOM
  function walk(root, depth) {
    if (!root || depth > 14) return;
    const nodes = root.querySelectorAll ? root.querySelectorAll('*') : [];
    for (const el of nodes) {
      try { if (el.shadowRoot) walk(el.shadowRoot, depth + 1); } catch (e) {}
      const tag = (el.tagName || '').toLowerCase();
      const srcLabel = depth ? 'shadow_dom' : 'dom';
      if (tag === 'img') {
        add(el.currentSrc, srcLabel);
        add(el.getAttribute('src'), srcLabel);
        add(el.getAttribute('data-src'), srcLabel);
        add(el.getAttribute('data-original'), srcLabel);
        add(el.getAttribute('data-lazy-src'), srcLabel);
        const srcset = el.getAttribute('srcset') || '';
        srcset.split(',').forEach(part => add(part.trim().split(/\\s+/)[0], srcLabel));
      }
      if (tag === 'source') {
        const srcset = el.getAttribute('srcset') || el.getAttribute('src') || '';
        srcset.split(',').forEach(part => add(part.trim().split(/\\s+/)[0], srcLabel));
      }
      const style = el.getAttribute && el.getAttribute('style');
      if (style) add(unwrapCssUrl(style), srcLabel);
      try {
        const win = el.ownerDocument && el.ownerDocument.defaultView;
        if (win && win.getComputedStyle) {
          const bg = win.getComputedStyle(el).backgroundImage || '';
          if (bg && bg !== 'none') add(unwrapCssUrl(bg), srcLabel);
        }
      } catch (e) {}
    }
  }
  walk(document, 0);

  // 3) Network performance entries
  let networkHits = [];
  try {
    networkHits = (performance.getEntriesByType('resource') || []).map(e => e.name)
      .filter(u => /ccstore\\/v1\\/images|\\/file\\/.+\\/products\\//i.test(u));
    networkHits.forEach(u => add(u, 'network'));
  } catch (e) {}

  // 4) Inline OCC field names if present
  document.querySelectorAll('script:not([src])').forEach(s => {
    const t = s.textContent || '';
    if (!/primaryFullImageURL|fullImageURLs|mediumImageURLs|products\\//i.test(t)) return;
    const m = t.match(/\\/file\\/[^\"'\\\\s]+\\/products\\/[^\"'\\\\s]+|\\/ccstore\\/v1\\/images\\/\\?[^\"'\\\\s]+/ig) || [];
    m.forEach(u => add(u, 'product_api'));
  });

  const withPlcb = found.filter(c => plcbItem && c.url.includes(plcbItem));
  const identitySafe = withPlcb.length ? withPlcb : [];

  function rank(c) {
    let score = 0;
    if (plcbItem && c.url.includes(plcbItem)) score += 100;
    if (/_F1\\./i.test(c.url)) score += 50;
    if (/_B1\\./i.test(c.url)) score += 20;
    if (c.source === 'embedded_json') score += 15;
    if (c.source === 'product_api') score += 10;
    if (c.source === 'network') score += 8;
    if (c.source === 'dom' || c.source === 'shadow_dom') score += 6;
    return score;
  }
  identitySafe.sort((a, b) => rank(b) - rank(a));

  const imageUrls = identitySafe.map(c => c.url);
  const primary = identitySafe.find(c => /_F1\\./i.test(c.url)) || identitySafe[0] || null;
  const payload = {
    plcbItem,
    href: location.href,
    candidateCount: found.length,
    identitySafeCount: identitySafe.length,
    imageUrls,
    primaryImageUrl: primary ? primary.url : null,
    primarySource: primary ? primary.source : null,
    candidates: identitySafe.slice(0, 12),
    networkSample: networkHits.slice(0, 12),
    identityEvidence: {
      plcbInPrimaryUrl: !!(primary && plcbItem && primary.url.includes(plcbItem)),
      plcbInAnyUrl: identitySafe.some(c => c.url.includes(plcbItem)),
      productPathMatch: /\\/product\\//i.test(location.href),
      skuInJsonLd: !!(document.querySelector('script[type="application/ld+json"]') &&
        new RegExp('"sku"\\\\s*:\\\\s*"' + plcbItem + '"').test(document.querySelector('script[type="application/ld+json"]').textContent || ''))
    }
  };

  // Stash for extraction sandbox / later steps
  try {
    let el = document.getElementById('fwgs-image-payload');
    if (!el) {
      el = document.createElement('script');
      el.id = 'fwgs-image-payload';
      el.type = 'application/json';
      document.documentElement.appendChild(el);
    }
    el.textContent = JSON.stringify(payload);
    document.documentElement.setAttribute('data-fwgs-primary-image', payload.primaryImageUrl || '');
    document.documentElement.setAttribute('data-fwgs-image-source', payload.primarySource || '');
  } catch (e) {}

  return payload;
})()`;
