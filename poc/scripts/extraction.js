const plcbItem = "{$plcbItem}";
let html = "";
try { if (typeof $$data !== "undefined" && $$data.html) html = String($$data.html() || ""); } catch (e) {}
let shadowText = "";
try { if (typeof $$data !== "undefined" && $$data.shadowText) shadowText = String($$data.shadowText() || ""); } catch (e) {}
const lightText = document.body ? String(document.body.textContent || "") : "";
const blob = lightText + "\n" + shadowText + "\n" + html;
const selectorFailures = [];
const captchaSeen = /captcha|recaptcha|hcaptcha|cf-turnstile/i.test(blob);

function absUrl(u) {
  try { return new URL(u, "https://www.finewineandgoodspirits.com/").href; } catch (e) { return null; }
}
function numOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
}
function pickLabelValue(labelRe) {
  // shadowText is often comma-separated tokens (PROFILE,PROOF,70,COUNTRY,...)
  const tokens = String(shadowText || "").split(",").map(function(s){ return s.trim(); }).filter(Boolean);
  for (let i = 0; i < tokens.length - 1; i++) {
    if (labelRe.test(tokens[i]) && !labelRe.test(tokens[i + 1])) return tokens[i + 1];
  }
  const lines = (lightText + "\n" + shadowText).split(/\n+/).map(function(s){ return s.trim(); }).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    if (labelRe.test(lines[i])) {
      const parts = lines[i].split(/[:\u2013\u2014]/);
      if (parts.length > 1 && parts.slice(1).join(":").trim()) return parts.slice(1).join(":").trim();
      if (lines[i + 1] && !labelRe.test(lines[i + 1])) return lines[i + 1];
    }
  }
  return null;
}
function empty(overrides) {
  return Object.assign({
    matched: false, ambiguous: false, notFound: false, plcbItem: plcbItem,
    productUrl: null, name: null, brand: null, proof: null, abv: null,
    volumeText: null, category: null, subcategory: null, country: null, region: null,
    imageUrls: [], primaryImageUrl: null,
    diagnostics: { searchResultCount: null, captchaSeen: !!captchaSeen, loginRequired: false, selectorFailures: selectorFailures.slice(), durationMs: null }
  }, overrides || {});
}

const ignoreHeading = /^(live chat|profile|product highlights|you may also like|reviews|log in|login|wine|spirits|skip to content|search results|pick up or ship|select a store|add to cart|ship|pickup|shop as guest)/i;

let pageUrl = "";
const og = html.match(/property=["']og:url["']\s+content=["']([^"']+)["']/i);
if (og) pageUrl = og[1];
const prodHref = html.match(/https:\/\/www\.finewineandgoodspirits\.com\/[a-z0-9-]+\/product\/[0-9A-Za-z]+/i);
if (!pageUrl && prodHref) pageUrl = prodHref[0];
const pathItem = (html + "\n" + shadowText).match(/\/product\/([0-9A-Za-z]{6,})/i);
if (!pageUrl && pathItem) pageUrl = "https://www.finewineandgoodspirits.com/product/" + pathItem[1];

const isSearchPage = /\/search(?:\?|$)/i.test(pageUrl) || /search results for/i.test(lightText + shadowText);
const isNoResult = /no-search-results/i.test(pageUrl + blob) || /sorry,\s*there were no search results/i.test(blob);

const productAnchors = Array.from(document.querySelectorAll('a[href*="/product/"]'))
  .map(function(a){ return absUrl(a.getAttribute("href")); })
  .filter(Boolean);
const uniqueProductUrls = Array.from(new Set(productAnchors.filter(function(u){ return /\/product\/[0-9A-Za-z]+/i.test(u); })));

let name = null;
if (shadowText) {
  const parts = String(shadowText).split(",");
  for (const p of parts) {
    const t = p.trim();
    if (t && !ignoreHeading.test(t) && t.length > 3 && !/^\d+$/.test(t)) { name = t; break; }
  }
}
if (!name) {
  const headings = Array.from(document.querySelectorAll("h1,h2"));
  for (const el of headings) {
    const t = (el.textContent || "").trim();
    if (t && !ignoreHeading.test(t) && t.length > 3) { name = t; break; }
  }
}

const proofHint = blob.match(/\bPROOF\s*[:\s]*([0-9]{2,3})\b/i);
const hasProof = !!proofHint;
const volumeHint = blob.match(/\b(\d+(?:\.\d+)?\s?(?:mL|ML|L))\b/i);
const abvHint = blob.match(/\b([0-9]{1,2}(?:\.[0-9]+)?)\s*%\s*(?:alc|alcohol|abv)\b/i);
const imageCandidates = [];
const fileRe = /\/file\/[0-9]+\/products\/[^"'\\\s>]+\.(?:jpg|jpeg|png|webp)/ig;
let im;
while ((im = fileRe.exec(html + shadowText)) !== null) {
  imageCandidates.push(absUrl("/ccstore/v1/images/?source=" + im[0] + "&height=475&width=475"));
}
const ccstoreRe = /\/ccstore\/v1\/images\/\?[^"'\\\s>]+/ig;
while ((im = ccstoreRe.exec(html + shadowText)) !== null) {
  imageCandidates.push(absUrl(im[0]));
}
const srcRe = /(?:src|data-src)=["']([^"']*products\/[^"']+)["']/ig;
while ((im = srcRe.exec(html)) !== null) {
  const u = absUrl(im[1]);
  if (u && !/logo|icon|banner|sprite|favicon|tempLogo/i.test(u)) imageCandidates.push(u);
}
Array.from(document.querySelectorAll("img")).forEach(function(img){
  const raw = img.getAttribute("src") || img.getAttribute("data-src") || "";
  if (/products\//i.test(raw) || /ccstore\/v1\/images/i.test(raw)) {
    const u = absUrl(raw);
    if (u && !/logo|icon|banner|sprite|favicon|tempLogo/i.test(u)) imageCandidates.push(u);
  }
});
const uniqueImages = Array.from(new Set(imageCandidates.filter(Boolean)));

// PDP if not search/no-result and we see product identity signals.
// Item number is often absent from cleaned extraction HTML, so do not require it here.
const onPdp = !isSearchPage && !isNoResult && !!name && !/search results/i.test(name) &&
  (hasProof || !!volumeHint || !!abvHint || uniqueImages.length > 0 || /profile|product highlights/i.test(blob));

if (!onPdp) {
  const count = isNoResult ? 0 : uniqueProductUrls.length;
  if (count === 0 || isNoResult) {
    return empty({ notFound: true, diagnostics: { searchResultCount: 0, captchaSeen: !!captchaSeen, loginRequired: false, selectorFailures: selectorFailures.slice(), durationMs: null } });
  }
  if (count > 1) {
    return empty({ ambiguous: true, diagnostics: { searchResultCount: count, captchaSeen: !!captchaSeen, loginRequired: false, selectorFailures: selectorFailures.slice(), durationMs: null } });
  }
  selectorFailures.push("expected_pdp_after_single_result");
  return empty({ diagnostics: { searchResultCount: Math.max(1, count), captchaSeen: !!captchaSeen, loginRequired: false, selectorFailures: selectorFailures.slice(), durationMs: null } });
}

if (!name) selectorFailures.push("h1_name");
const brand = pickLabelValue(/^brand$/i);
let volumeText = pickLabelValue(/^(size|volume)$/i);
if (!volumeText && volumeHint) volumeText = volumeHint[1];
const category = pickLabelValue(/^(type|category)$/i);
const subcategory = pickLabelValue(/^sub[- ]?category$/i);
const country = pickLabelValue(/^country$/i);
const region = pickLabelValue(/^region$/i);
let proof = numOrNull(pickLabelValue(/^proof$/i));
let abv = numOrNull(pickLabelValue(/^(abv|alcohol by volume|alcohol)$/i));
if (proof == null && proofHint) proof = Number(proofHint[1]);
if (abv == null && abvHint) abv = Number(abvHint[1]);

let primaryImageUrl = null;
for (const u of uniqueImages) { if (/_F1\./i.test(u)) { primaryImageUrl = u; break; } }
if (!primaryImageUrl) primaryImageUrl = uniqueImages[0] || null;

let productUrl = null;
if (/\/product\//i.test(pageUrl)) productUrl = pageUrl.split("?")[0];
else if (plcbItem && plcbItem !== "{$plcbItem}") productUrl = "https://www.finewineandgoodspirits.com/product/" + plcbItem;
else if (pathItem) productUrl = "https://www.finewineandgoodspirits.com/product/" + pathItem[1];

return {
  matched: true, ambiguous: false, notFound: false, plcbItem: plcbItem,
  productUrl: productUrl, name: name, brand: brand, proof: proof, abv: abv,
  volumeText: volumeText, category: category, subcategory: subcategory, country: country, region: region,
  imageUrls: uniqueImages, primaryImageUrl: primaryImageUrl,
  diagnostics: { searchResultCount: 1, captchaSeen: !!captchaSeen, loginRequired: false, selectorFailures: selectorFailures.slice(), durationMs: null }
};
