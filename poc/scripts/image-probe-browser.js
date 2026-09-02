'use strict';

/** Live-browser image discovery for FWGS PDP (Figranium actions.javascript). */
const FILE_PATH = String.raw`\/file\/v[0-9]+\/products\/[A-Za-z0-9._-]+\.(?:jpg|jpeg|png|webp)`;

const probeScript = `(() => {
  const plcbItem = String('{$plcbItem}' || '').trim();
  const filePathRe = /${FILE_PATH}/ig;
  const rejectRe = /logo|icon|banner|sprite|svg-dividers|favicon|tempLogo|social|tracking|analytics|pixel|placeholder|occ-public|hamburger|arrow|similar-items|tk0x1|general\\//i;

  function absCcstore(filePath, h, w) {
    const height = h || 475;
    const width = w || 475;
    return 'https://www.finewineandgoodspirits.com/ccstore/v1/images/?source=' + filePath + '&height=' + height + '&width=' + width;
  }

  function extractFilePaths(text) {
    const out = [];
    if (!text) return out;
    const re = /${FILE_PATH}/ig;
    let m;
    while ((m = re.exec(String(text))) !== null) {
      const p = m[0];
      if (rejectRe.test(p)) continue;
      if (plcbItem && !p.includes(plcbItem)) continue;
      if (!out.includes(p)) out.push(p);
    }
    return out;
  }

  function unwrapCssUrl(v) {
    const m = String(v || '').match(/url\\(["']?([^"')]+)["']?\\)/i);
    return m ? m[1] : null;
  }

  const found = []; // { filePath, source, height, width }

  function addRaw(raw, source) {
    if (!raw) return;
    let s = String(raw).replace(/&amp;/g, '&');
    if (rejectRe.test(s)) return;
    const paths = extractFilePaths(s);
    for (const p of paths) {
      let height = 475, width = 475;
      const hm = s.match(/[?&]height=([0-9]+)/i);
      const wm = s.match(/[?&]width=([0-9]+)/i);
      if (hm) height = Number(hm[1]);
      if (wm) width = Number(wm[1]);
      if (found.some(x => x.filePath === p)) continue;
      found.push({ filePath: p, source, height, width });
    }
  }

  // 1) Structured metadata (preferred)
  const og = document.querySelector('meta[property="og:image"], meta[property="og:image:secure_url"]');
  if (og) addRaw(og.getAttribute('content'), 'embedded_json');
  const tw = document.querySelector('meta[name="twitter:image"], meta[name="twitter:image:src"]');
  if (tw) addRaw(tw.getAttribute('content'), 'embedded_json');
  document.querySelectorAll('script[type="application/ld+json"]').forEach(node => {
    const t = node.textContent || '';
    try {
      const j = JSON.parse(t);
      const nodes = Array.isArray(j) ? j : [j].concat(j['@graph'] || []);
      nodes.forEach(n => {
        if (!n || typeof n !== 'object') return;
        [].concat(n.image || []).flat().forEach(u => addRaw(typeof u === 'string' ? u : (u && u.url), 'embedded_json'));
      });
    } catch (e) {
      addRaw(t, 'embedded_json');
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
        addRaw(el.currentSrc, srcLabel);
        addRaw(el.getAttribute('src'), srcLabel);
        addRaw(el.getAttribute('data-src'), srcLabel);
        addRaw(el.getAttribute('data-original'), srcLabel);
        addRaw(el.getAttribute('data-lazy-src'), srcLabel);
        const srcset = el.getAttribute('srcset') || '';
        srcset.split(',').forEach(part => addRaw(part.trim().split(/\\s+/)[0], srcLabel));
      }
      if (tag === 'source') {
        const srcset = el.getAttribute('srcset') || el.getAttribute('src') || '';
        srcset.split(',').forEach(part => addRaw(part.trim().split(/\\s+/)[0], srcLabel));
      }
      const style = el.getAttribute && el.getAttribute('style');
      if (style) addRaw(unwrapCssUrl(style), srcLabel);
      try {
        const win = el.ownerDocument && el.ownerDocument.defaultView;
        if (win && win.getComputedStyle) {
          const bg = win.getComputedStyle(el).backgroundImage || '';
          if (bg && bg !== 'none') addRaw(unwrapCssUrl(bg), srcLabel);
        }
      } catch (e) {}
    }
  }
  walk(document, 0);

  // 3) Network
  let networkHits = [];
  try {
    networkHits = (performance.getEntriesByType('resource') || []).map(e => e.name)
      .filter(u => /ccstore\\/v1\\/images|\\/file\\/v[0-9]+\\/products\\//i.test(u));
    networkHits.forEach(u => addRaw(u, 'network'));
  } catch (e) {}

  // 4) Strict scan of inline scripts for OCC product file paths only
  document.querySelectorAll('script:not([src])').forEach(s => {
    const t = s.textContent || '';
    if (!/\\/products\\//i.test(t)) return;
    addRaw(t, 'product_api');
  });

  function rank(c) {
    let score = 0;
    if (/_F1\\./i.test(c.filePath)) score += 50;
    if (/_B1\\./i.test(c.filePath)) score += 20;
    if (c.source === 'embedded_json') score += 30;
    if (c.source === 'network') score += 12;
    if (c.source === 'product_api') score += 8;
    if (c.source === 'dom' || c.source === 'shadow_dom') score += 6;
    if (c.height >= 300) score += 5;
    return score;
  }
  found.sort((a, b) => rank(b) - rank(a));

  const imageUrls = found.map(c => absCcstore(c.filePath, 475, 475));
  const primary = found.find(c => /_F1\\./i.test(c.filePath)) || found[0] || null;
  const primaryImageUrl = primary ? absCcstore(primary.filePath, 475, 475) : null;

  const payload = {
    plcbItem,
    href: location.href,
    candidateCount: found.length,
    identitySafeCount: found.length,
    imageUrls,
    primaryImageUrl,
    primarySource: primary ? primary.source : null,
    candidates: found.slice(0, 12).map(c => ({
      url: absCcstore(c.filePath, 475, 475),
      filePath: c.filePath,
      source: c.source
    })),
    networkSample: networkHits.filter(u => plcbItem && u.includes(plcbItem)).slice(0, 12),
    identityEvidence: {
      plcbInPrimaryUrl: !!(primary && primary.filePath.includes(plcbItem)),
      plcbInAnyUrl: found.some(c => c.filePath.includes(plcbItem)),
      productPathMatch: /\\/product\\//i.test(location.href),
      skuInJsonLd: !!(document.querySelector('script[type="application/ld+json"]') &&
        new RegExp('"sku"\\\\s*:\\\\s*"' + plcbItem + '"').test(document.querySelector('script[type="application/ld+json"]').textContent || ''))
    }
  };

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

module.exports = probeScript;
