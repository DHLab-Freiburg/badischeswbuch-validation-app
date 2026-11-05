/* pruefung.js – checks a transformation result against its source, independent of any server.
 *
 * Same rules as neuaufbau/anwendung/src/Daten/Transformationspruefung.php (see transformation/PLAN.md of the
 * editorial system). Data comes only from the files in data/ (snapshots with a date in data/stand.json):
 *   places.csv   lfd;Kurzform;Ortsname_BadWB;Lat;Lon   (copy of ABBR_places.md)
 *   sources.csv  Kurztitel;Titel                       (source list, authoritative titles)
 *   regions.csv  Abkürzung;Langform                    (ABBR_geo_regions.md)
 *   ids.csv      ID;Stichwort;Homonym;Lieferung        (ID register: IDs are assigned once and never change)
 * The source may be the plain delivery XML (<artikel> …) or the enriched XML of the editorial system
 * (<eintrag …><artikel>…</artikel></eintrag>); with the enriched XML, places, sources and cross-references are also
 * compared position by position with what the editorial system knows.
 *
 * Every finding has a code, a label, the text in the result, the expected value and a kind:
 *   "fix"    can be repaired automatically, "review" needs a look, "info" allowed (e.g. order changed by the schema).
 */

/* ---------------------------------------------------------------- data */

const lists = { places: new Map(), placeIndex: new Map(), canonical: new Map(), sources: new Map(), titles: new Set(),
  regions: new Map(), ids: new Map(), idsNoHyphen: new Map(), idsByLemma: new Map(), stand: null };

/** CSV with ";" and quotes */
export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ";") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

const nfc = (s) => (s || "").normalize("NFC").trim();
const keyOf = (s) => nfc(s).replace(/\s+/g, "");

export async function loadLists(base = "./data/") {
  const get = async (f) => { const r = await fetch(base + f); if (!r.ok) throw new Error(`${f}: ${r.status}`); return r.text(); };
  const [places, sources, regions, ids, stand] = await Promise.allSettled([get("places.csv"), get("sources.csv"),
    get("regions.csv"), get("ids.csv"), get("stand.json")]);
  if (places.status === "fulfilled") {
    const byName = new Map();
    for (const [lfd, kurz, name, lat, lon] of parseCsv(places.value).slice(1)) {
      if (!/^\d+$/.test((lfd || "").trim())) continue;
      const key = `lfd_${lfd.trim()}`;
      lists.places.set(key, { kurz: nfc(kurz), name: nfc(name), lat, lon });
      for (const f of [kurz, name]) {
        const k = keyOf(f);
        if (!lists.placeIndex.has(k)) lists.placeIndex.set(k, new Set());
        lists.placeIndex.get(k).add(key);
      }
      const n = nfc(name);
      if (!byName.has(n) || +byName.get(n).slice(4) > +lfd) byName.set(n, key);
    }
    // variant rows: same place name as a row with a smaller number → that number is the place's number
    for (const [key, p] of lists.places) {
      const c = byName.get(p.name);
      if (c && c !== key) lists.canonical.set(key, c);
    }
  }
  if (sources.status === "fulfilled") {
    for (const [kurz, titel] of parseCsv(sources.value).slice(1)) {
      const t = nfc(titel).replace(/\s+/g, " ");
      lists.sources.set(nfc(kurz), t);
      lists.titles.add(t);
    }
  }
  if (regions.status === "fulfilled") {
    for (const [abk, lang] of parseCsv(regions.value).slice(1)) {
      lists.regions.set(keyOf(abk).toLowerCase(), nfc(lang));
      lists.regions.set(keyOf(lang).toLowerCase(), nfc(lang));
    }
  }
  if (ids.status === "fulfilled") {
    for (const [id, stichwort, homonym, lfg] of parseCsv(ids.value).slice(1)) {
      lists.ids.set(id, { stichwort: nfc(stichwort), homonym: homonym || "", lfg });
      const ohne = id.replace(/-/g, "");
      if (!lists.idsNoHyphen.has(ohne)) lists.idsNoHyphen.set(ohne, []);
      lists.idsNoHyphen.get(ohne).push(id);
      const lk = `${nfc(stichwort)}\u001f${homonym || ""}`;
      if (!lists.idsByLemma.has(lk)) lists.idsByLemma.set(lk, []);
      lists.idsByLemma.get(lk).push(id);
    }
  }
  if (stand.status === "fulfilled") { try { lists.stand = JSON.parse(stand.value); } catch { /* ignore */ } }
  return { places: lists.places.size, sources: lists.sources.size, regions: lists.regions.size, ids: lists.ids.size,
    stand: lists.stand };
}

export const placeInfo = (key) => lists.places.get(key) || null;
export const canonicalPlace = (key) => lists.canonical.get(key) || null;
export const sourceTitle = (kurz) => lists.sources.get(nfc(kurz)) || null;

/* ---------------------------------------------------------------- labels */

export const LABELS = {
  "entry.missing": "Artikel fehlt im Ergebnis",
  "entry.unmatched": "Eintrag keinem Artikel zugeordnet",
  "entry.subentry": "Artikel als Unterartikel eingeordnet",
  "lemma.changed": "Lemma verändert",
  "lemma.other": "Anderes Lemma",
  "id.not-in-register": "ID weder nach dem ID-Register noch nach Regel 1",
  "id.rule1": "ID nach Regel 1; das ID-Register sieht eine andere vor (für später)",
  "id.duplicate": "ID in dieser Datei mehrfach vergeben",
  "text.lost": "Text fehlt",
  "text.added": "Text hinzugefügt",
  "text.moved": "Text umgestellt (Reihenfolge geändert, nichts verloren)",
  "text.to-attribute": "Text in ein Attribut verschoben",
  "text.sense-number": "Gliederungszeichen nur im Attribut n",
  "text.dash": "Gedankenstrich ‒ fehlt",
  "text.punct": "Satzzeichen oder Ziffer fehlt",
  "text.char-added": "Zeichen hinzugefügt",
  "text.quote": "Anführungs- oder Auslassungszeichen ersetzt",
  "text.superscript": "Hochstellung als Sonderzeichen geschrieben",
  "text.too-different": "Text weicht zu stark ab für einen Vergleich",
  "place.key-space": "Leerzeichen im Schlüssel",
  "place.variant-number": "Nummer einer Nebenform; der Ort hat eine andere Nummer",
  "place.unknown-number": "Nummer nicht in der Ortsliste",
  "place.other-place": "Text ist Kurzform eines anderen Orts",
  "place.hs": "„hs.“ innerhalb der Ortsauszeichnung (handschriftlicher Beleg, gehört dahinter)",
  "bibl.person-hs": "„X hs.“ als Quelle ausgezeichnet (gemeint ist die Person)",
  "bibl.place-hs": "Ort mit „hs.“ als Quelle ausgezeichnet",
  "place.source-hs": "Kurztitel mit „hs.“ als Ort ausgezeichnet (Quelle)",
  "place.region": "Landschaft als Ort ausgezeichnet (type=\"region\" verwenden)",
  "place.region-unknown": "Landschaft nicht in der Landschaftsliste",
  "place.name-key": "Name statt lfd-Nummer als Schlüssel",
  "place.differs": "Anderer Ort als im Redaktionssystem",
  "place.sure-but-guess": "Als sicher ausgezeichnet, das Redaktionssystem vermutet nur",
  "place.sure-but-unknown": "Als sicher ausgezeichnet, dem Redaktionssystem unbekannt",
  "place.no-key-known": "Ohne Schlüssel, das Redaktionssystem kennt den Ort",
  "bibl.title-differs": "Titel weicht von der Quellenliste ab",
  "bibl.title-unknown": "Titel nicht in der Quellenliste",
  "bibl.no-key-known": "Ohne Schlüssel, die Quelle ist bekannt",
  "xref.no-hyphens": "Ziel ohne Bindestriche geschrieben",
  "xref.missing": "Ziel ist kein Lemma",
  "xref.differs": "Anderes Ziel als im Redaktionssystem",
};

export const VERDICTS = { ok: "in Ordnung", fix: "automatisch reparierbar", "review-data": "nachsehen (Orte, Quellen, Verweise)",
  "review-text": "nachsehen (Text oder Lemma)" };

/* ---------------------------------------------------------------- text comparison */

const compareForm = (s) => (s || "").normalize("NFD").replace(/̍/g, "́").normalize("NFC").replace(/\s+/g, "");
const wordForm = (s) => (s || "").normalize("NFD").replace(/̍/g, "́").normalize("NFC");

/** Myers diff on arrays; returns [["del"|"ins", posInA, text], …] or null if more than max edits */
export function diff(a, b, max = 4000) {
  const n = a.length, m = b.length, lim = Math.min(n + m, max);
  const v = new Map([[1, 0]]), trace = [];
  for (let d = 0; d <= lim; d++) {
    trace.push(new Map(v));
    for (let k = -d; k <= d; k += 2) {
      let x = (k === -d || (k !== d && (v.get(k - 1) ?? -1) < (v.get(k + 1) ?? -1))) ? (v.get(k + 1) ?? 0) : (v.get(k - 1) ?? 0) + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v.set(k, x);
      if (x >= n && y >= m) return backtrack(trace, a, b, n, m);
    }
  }
  return null;
}

function backtrack(trace, a, b, x, y) {
  const steps = [];
  for (let d = trace.length - 1; d > 0; d--) {
    const v = trace[d], k = x - y;
    const prevK = (k === -d || (k !== d && (v.get(k - 1) ?? -1) < (v.get(k + 1) ?? -1))) ? k + 1 : k - 1;
    const px = v.get(prevK) ?? 0, py = px - prevK;
    while (x > px && y > py) { x--; y--; }
    if (x === px) steps.push(["ins", x, b[py]]); else steps.push(["del", px, a[px]]);
    x = px; y = py;
  }
  steps.reverse();
  const out = [];
  for (const [art, pos, ch] of steps) {
    const last = out[out.length - 1];
    if (last && last[0] === art && (art === "ins" ? last[1] === pos : last[1] + [...last[2]].length === pos)) last[2] += ch;
    else out.push([art, pos, ch]);
  }
  return out;
}

const words = (s) => {
  const m = new Map();
  for (const w of wordForm(s).match(/[\p{L}\p{M}]{2,}/gu) || []) m.set(w, (m.get(w) || 0) + 1);
  return m;
};
const minus = (a, b) => { const r = new Map(a); for (const [w, n] of b) if (r.has(w)) { const x = r.get(w) - n; if (x <= 0) r.delete(w); else r.set(w, x); } return r; };

const QUOTE = /^[‘’‚„“”´`'"‹›«»]{1,2}$/u;
const SUP = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
const cut = (s, n = 120) => ([...s].length > n ? [...s].slice(0, n).join("") + "…" : s);

/** compare the source text with the text of the result (plus attribute values) */
export function compareText(source, result, attributes = "") {
  const a = [...compareForm(source)], c = [...compareForm(result)];
  const d = diff(a, c);
  if (d === null) return [{ code: "text.too-different", kind: "review", text: "" }];
  const out = [], done = new Set();
  // replaced characters: del and ins next to each other
  d.forEach(([art, , s], i) => {
    const nx = d[i + 1];
    if (!nx || art === nx[0] || done.has(i)) return;
    const [del, ins] = art === "del" ? [s, nx[2]] : [nx[2], s];
    let code = null;
    if (QUOTE.test(del) && QUOTE.test(ins)) code = "text.quote";
    else if ([...del].map((ch) => SUP[ch] ?? ch).join("") === ins && /\d/.test(del)) code = "text.superscript";
    if (code) { out.push({ code, kind: "fix", text: `${del} → ${ins}` }); done.add(i); done.add(i + 1); }
  });
  // moved pieces: the words of a missing piece are present elsewhere in the entry (allowed, decision 2)
  const lost = minus(words(source), words(result + " " + attributes));
  const added = minus(words(result), words(source));
  d.forEach(([art, , s], i) => {
    if (done.has(i) || !/\p{L}{2,}/u.test(s)) return;
    const ref = art === "del" ? lost : added;
    if (![...words(s).keys()].some((w) => ref.has(w))) {
      done.add(i);
      if (art === "del") out.push({ code: compareForm(attributes).includes(s.replace(/^[\s,.;:()\/‒–]+|[\s,.;:()\/‒–]+$/g, "")) ? "text.to-attribute" : "text.moved", kind: "info", text: cut(s) });
    }
  });
  d.forEach(([art, , s], i) => {
    if (done.has(i)) return;
    const letters = /\p{L}{2,}/u.test(s) && !/^[a-zα-ω]\)$/u.test(s);
    let code;
    if (art === "del" && /^(?:\d+\)|[a-z]\)|[α-ω]\))+$/u.test(s)) code = "text.sense-number";
    else if (art === "del" && /^[‒–]+$/u.test(s)) code = "text.dash";
    else if (art === "del") code = letters ? "text.lost" : "text.punct";
    else code = letters ? "text.added" : "text.char-added";
    out.push({ code, kind: code === "text.lost" || code === "text.added" ? "review" : "fix", text: cut(s) });
  });
  return out;
}

/* ---------------------------------------------------------------- source and result */

const stripPrefix = (s) => nfc(s).replace(/^(?:(?:†|[AFR]\??|[IVX]+)\s+)+/u, "");
const lemmaKey = (s) => stripPrefix(s).replace(/[^\p{L}\p{N}]+/gu, "");
const similar = (a, b) => {
  a = a.toLowerCase(); b = b.toLowerCase();
  return a && b && (a.startsWith(b) || b.startsWith(a) || levenshtein(a, b) <= 2);
};
function levenshtein(a, b) {
  a = [...a]; b = [...b];
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** source articles: plain (<artikel>) or enriched (<eintrag><artikel>) */
export function readSource(xml) {
  const doc = new DOMParser().parseFromString(xml.includes("<document") || xml.includes("<badisches") ? xml : `<root>${xml}</root>`, "text/xml");
  if (doc.querySelector("parsererror")) throw new Error("Das Quell-XML ist nicht wohlgeformt.");
  const eintraege = [...doc.getElementsByTagName("eintrag")];
  if (eintraege.length) {
    return { enriched: true, articles: eintraege.map((e) => {
      const art = e.getElementsByTagName("artikel")[0];
      return { lemma: e.getAttribute("lemma") || "", artikel: e.getAttribute("artikel") || "", node: art, text: art ? art.textContent : "" };
    }) };
  }
  return { enriched: false, articles: [...doc.getElementsByTagName("artikel")].map((a) => {
    const fett = a.getElementsByTagName("fett")[0];
    return { lemma: fett ? fett.textContent : "", artikel: "", node: a, text: a.textContent };
  }) };
}

export function readResult(xml) {
  let doc = new DOMParser().parseFromString(xml, "text/xml");
  if (doc.querySelector("parsererror")) doc = new DOMParser().parseFromString(`<root>${xml}</root>`, "text/xml");
  if (doc.querySelector("parsererror")) throw new Error("Das Ergebnis-XML ist nicht wohlgeformt.");
  return [...doc.getElementsByTagName("entry")].filter((e) => e.parentNode.nodeName !== "subentries" || true).map((e) => {
    const lemma = [...e.children].find((k) => k.nodeName === "lemma");
    return { id: e.getAttribute("id") || "", lemma: lemma ? lemma.textContent : "", node: e };
  });
}

/** pair articles and entries by lemma, in order; handles swapped upper/lower case pairs */
export function align(src, res) {
  const ks = src.map((a) => lemmaKey(a.lemma)), ki = res.map((e) => lemmaKey(e.lemma));
  const pairs = [], missing = [], unmatched = [];
  let i = 0, j = 0;
  while (i < src.length && j < res.length) {
    if (ks[i] !== ki[j] && i + 1 < src.length && j + 1 < res.length && ks[i] === ki[j + 1] && ks[i + 1] === ki[j]) {
      pairs.push([src[i], res[j + 1]], [src[i + 1], res[j]]); i += 2; j += 2; continue;
    }
    if (ks[i] === ki[j] || (similar(ks[i], ki[j]) && !ki.slice(j + 1, j + 6).includes(ks[i]) && !ks.slice(i + 1, i + 6).includes(ki[j]))) {
      pairs.push([src[i++], res[j++]]); continue;
    }
    let ahead = null;
    for (let d = 1; d <= 25 && !ahead; d++) {
      if (j + d < res.length && ks[i] === ki[j + d]) ahead = ["res", d];
      else if (i + d < src.length && ks[i + d] === ki[j]) ahead = ["src", d];
    }
    if (!ahead) pairs.push([src[i++], res[j++]]);
    else if (ahead[0] === "res") { unmatched.push(...res.slice(j, j + ahead[1])); j += ahead[1]; }
    else { missing.push(...src.slice(i, i + ahead[1])); i += ahead[1]; }
  }
  return { pairs, missing: missing.concat(src.slice(i)), unmatched: unmatched.concat(res.slice(j)) };
}

/* ---------------------------------------------------------------- checks per entry */

const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };
const ROMAN_LOWER = ["", "i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];

/** entry ID by rule 1 of TRANSFORMATION-RULES (as Transformationsxml::eintragsId in the editorial system) */
export function ruleOneId(stichwort, homonym = 0) {
  let s = nfc(stichwort).toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
  s = s.normalize("NFD").replace(/\p{Mn}+/gu, "").replace(/[^a-z0-9-]+/g, "");
  return s + (homonym > 0 ? "." + (ROMAN_LOWER[homonym] || String(homonym)) : "");
}

function knowledge(artNode) {
  const k = { place: new Map(), bibl: new Map(), crossRef: new Map(), unbekannt: new Set(), landschaft: new Map() };
  if (!artNode) return k;
  for (const t of ["place", "bibl", "crossRef", "landschaft"]) {
    for (const el of artNode.getElementsByTagName(t)) {
      const key = keyOf(el.textContent);
      if (!k[t].has(key)) k[t].set(key, el);
    }
  }
  for (const el of artNode.getElementsByTagName("unbekannt")) k.unbekannt.add(keyOf(el.textContent));
  return k;
}

// "hs." after a place only says that a handwritten record from this place exists; it is not part of the name
const HS = /^(.*?\S)(\s+hs\.?)$/;

function checkPlace(p, know, enriched, add) {
  let text = p.textContent;
  const rawKey = p.getAttribute("key") || "", key = rawKey.trim(), type = p.getAttribute("type") || "";
  // "Neukirch hs." is a short title in the source list (a notebook), not the place Neukirch
  const after = p.nextSibling && p.nextSibling.nodeType === 3 ? p.nextSibling.nodeValue : "";
  const withHs = HS.test(text) ? nfc(text).trim() : /^\s*hs\.?/.test(after) ? `${nfc(text).trim()} hs.` : null;
  const source = withHs && (lists.sources.get(withHs) || lists.sources.get(withHs.replace(/\.$/, "")));
  if (source) { add("place.source-hs", "review", withHs, source); return; }
  const hs = text.match(HS);
  if (hs) { add("place.hs", "fix", text, hs[1]); text = hs[1]; }
  if (rawKey !== key) add("place.key-space", "fix", `${text} → "${rawKey}"`, key);
  let k = keyOf(text);
  if (enriched && !know.place.has(k) && !know.unbekannt.has(k)) k = k.replace(/\.$/, "");
  const known = enriched ? know.place.get(k) : null;
  const knownKey = known ? known.getAttribute("key") : null, knownSure = known && known.getAttribute("source") === "table";
  if (type === "region") {
    if (!lists.regions.size) return;
    const lang = lists.regions.get(keyOf(key).toLowerCase());
    if (!lang) add("place.region-unknown", "review", `${text} → ${key}`, "");
    return;
  }
  if (!key) { if (knownSure) add("place.no-key-known", "fix", text, knownKey); return; }
  if (!key.startsWith("lfd_")) {
    const region = lists.regions.get(keyOf(key).toLowerCase()) || lists.regions.get(keyOf(text).replace(/\.$/, "").toLowerCase());
    if (region) add("place.region", "fix", `${text} → ${key}`, `type="region" key="${region}"`);
    else add("place.name-key", "review", `${text} → ${key}`, "");
    return;
  }
  if (enriched && knownKey === key) return;
  if (lists.places.size && !lists.places.has(key)) { add("place.unknown-number", "review", `${text} → ${key}`, knownKey || ""); return; }
  const canon = lists.canonical.get(key);
  if (canon && (!enriched || knownKey === canon || !knownKey)) { add("place.variant-number", "fix", `${text} → ${key}`, canon); return; }
  if (enriched && knownSure) { add("place.differs", "fix", `${text} → ${key}`, knownKey); return; }
  if (enriched && known) { add("place.sure-but-guess", "review", `${text} → ${key}`, `guess ${knownKey}`); return; }
  if (enriched && know.unbekannt.has(k)) { add("place.sure-but-unknown", "review", `${text} → ${key}`, ""); return; }
  // without the editorial system: is the text the short form of another place?
  const own = lists.places.get(key);
  const hits = lists.placeIndex.get(keyOf(text)) || lists.placeIndex.get(keyOf(text).replace(/\.$/, ""));
  if (own && hits) {
    const self = canon || key;
    const uniq = [...new Set([...hits].map((h) => lists.canonical.get(h) || h))];
    if (!uniq.includes(self)) add("place.other-place", uniq.length === 1 ? "fix" : "review", `${text} → ${key} (${own.kurz})`, uniq.join(" | "));
  }
}

function checkBibl(b, know, enriched, add) {
  const text = b.textContent, key = nfc(b.getAttribute("key")).replace(/\s+/g, " ");
  // "X hs." after a name means the person (handwritten records), not the source of the same short title,
  // except short titles that themselves end in "hs." ("Albrecht hs.")
  const after = b.nextSibling && b.nextSibling.nodeType === 3 ? b.nextSibling.nodeValue : "";
  let withHs = HS.test(text) ? nfc(text) : /^\s*hs\.?/.test(after) ? `${nfc(text)} hs.` : null;
  if (withHs) withHs = withHs.replace(/^[\s\/,;]+/, "").trim();
  if (withHs && ![withHs, withHs.replace(/\.$/, ""), withHs + "."].some((f) => lists.sources.has(f))) {
    const name = withHs.replace(/\s+hs\.?$/, "");
    const place = lists.placeIndex.get(keyOf(name)) || lists.placeIndex.get(keyOf(name).replace(/\.$/, ""));
    add(place ? "bibl.place-hs" : "bibl.person-hs", "review", withHs, place ? "place" : "person");
    return;
  }
  const known = enriched ? (know.bibl.get(keyOf(text)) || know.bibl.get(keyOf(text).replace(/\.$/, ""))) : null;
  let knownKey = known ? nfc(known.getAttribute("key")).replace(/\s+/g, " ") : null;
  if (!knownKey) {
    const kurz = nfc(text).replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/gu, "").replace(/\s*[\d\/.,\-–]+[a-z]?$/u, "").trim();
    for (const f of [nfc(text), kurz, kurz + ".", kurz.replace(/\.$/, "")]) if (lists.sources.has(f)) { knownKey = lists.sources.get(f); break; }
  }
  if (!key) { if (knownKey) add("bibl.no-key-known", "fix", text, knownKey); return; }
  if (key === knownKey || lists.titles.has(key)) return;
  if (!lists.titles.size) return;
  add(knownKey ? "bibl.title-differs" : "bibl.title-unknown", knownKey ? "fix" : "review", cut(`${text} → ${key}`, 160), knownKey || "");
}

function checkXref(c, know, enriched, add) {
  const key = c.getAttribute("key") || "", text = c.textContent;
  const known = enriched ? know.crossRef.get(keyOf(text)) : null;
  if (known && known.getAttribute("key") !== key) { add("xref.differs", "fix", `${key} ← ${text}`, known.getAttribute("key")); return; }
  if (known || !lists.ids.size || lists.ids.has(key)) return;
  const alt = lists.idsNoHyphen.get(key.replace(/-/g, "")) || [];
  if (alt.length === 1) add("xref.no-hyphens", "fix", `${key} ← ${text}`, alt[0]);
  else add("xref.missing", "review", `${key} ← ${text}`, alt.join(" | "));
}

function checkPair(src, entry, enriched, duplicateId, subentries = []) {
  const findings = [];
  const add = (code, kind, text = "", expected = "") => findings.push({ code, kind, text, expected });
  const e = entry.node;
  // lemma
  const want = stripPrefix(src.lemma), got = nfc(entry.lemma);
  if (lemmaKey(want) !== lemmaKey(got)) add(similar(lemmaKey(want), lemmaKey(got)) ? "lemma.changed" : "lemma.other", "review", got, want);
  // ID: the register is the target; until the transformation project uses it, an ID built by rule 1 is allowed
  // (it differs from the register only for the lemmas that rule 1 makes equal, e.g. "Alt"/"alt")
  const hom = [...e.getElementsByTagName("marker")].find((m) => m.getAttribute("type") === "hom");
  const h = hom ? String(ROMAN[(hom.getAttribute("value") || hom.textContent).trim()] || "") : "";
  const expected = lists.idsByLemma.get(`${want}\u001f${h}`) || lists.idsByLemma.get(`${got}\u001f${h}`) || [];
  const rule1 = ruleOneId(want || got, h ? +h : 0);
  if (lists.ids.size && !expected.includes(entry.id)) {
    if (entry.id === rule1 && expected.length === 1) add("id.rule1", "info", entry.id, expected[0]);
    else if (entry.id === rule1 && !expected.length) { /* lemma not in the register snapshot: nothing to say */ }
    else add("id.not-in-register", expected.length === 1 || rule1 ? "fix" : "review", entry.id, expected.join(" | ") || rule1);
  }
  if (duplicateId) add("id.duplicate", expected.length === 1 && expected[0] !== entry.id ? "info" : "review", entry.id, expected.join(" | "));
  // text
  let attrs = "";
  for (const el of e.getElementsByTagName("*")) {
    for (const at of el.attributes) if (!["key", "guess", "confidence", "source", "n", "id", "type", "subtype", "lang", "subsense", "value"].includes(at.name)) attrs += at.value;
  }
  // articles placed in this entry as subentries count for the text comparison
  for (const a of subentries) add("entry.subentry", "info", a.lemma, entry.id);
  const srcText = [src.text, ...subentries.map((a) => a.text)].join(" ");
  for (const f of compareText(srcText, e.textContent, attrs)) add(f.code, f.kind, f.text);
  // entities
  const know = knowledge(src.node);
  for (const p of e.getElementsByTagName("place")) checkPlace(p, know, enriched, add);
  for (const b of e.getElementsByTagName("bibl")) checkBibl(b, know, enriched, add);
  for (const c of e.getElementsByTagName("crossRef")) checkXref(c, know, enriched, add);
  // verdict
  const open = findings.filter((f) => f.kind === "review");
  const verdict = findings.every((f) => f.kind === "info") ? "ok"
    : !open.length ? "fix"
    : open.some((f) => f.code === "text.lost" || f.code === "lemma.other" || f.code === "text.too-different") ? "review-text" : "review-data";
  return { findings, verdict };
}

/** run all checks; returns report with entries in result order plus missing articles */
export function check(srcXML, genXML) {
  const source = readSource(srcXML), result = readResult(genXML);
  const counts = new Map();
  for (const e of result) counts.set(e.id, (counts.get(e.id) || 0) + 1);
  const { pairs, missing: notFound, unmatched } = align(source.articles, result);
  // an article that stands as <subentry> of another entry ("anscheinen" under "an-schein", note of the editors
  // 30.10.2026) is not missing; its text belongs to that entry
  const parentOf = new Map();
  for (const r of result) for (const u of r.node.getElementsByTagName("subentry")) {
    const l = [...u.children].find((c) => c.nodeName === "lemma");
    if (l && !parentOf.has(lemmaKey(l.textContent))) parentOf.set(lemmaKey(l.textContent), r.node);
  }
  const subs = new Map(), missing = [];
  for (const a of notFound) {
    const parent = parentOf.get(lemmaKey(a.lemma));
    if (parent) subs.set(parent, [...(subs.get(parent) || []), a]); else missing.push(a);
  }
  const byEntry = new Map();
  for (const [s, e] of pairs) byEntry.set(e.node, { source: s, ...checkPair(s, e, source.enriched, counts.get(e.id) > 1, subs.get(e.node) || []) });
  for (const e of unmatched) byEntry.set(e.node, { source: null, findings: [{ code: "entry.unmatched", kind: "review", text: e.lemma, expected: "" }], verdict: "review-text" });
  const entries = result.map((e, index) => ({ index, id: e.id, lemma: e.lemma, entryNode: e.node, ...byEntry.get(e.node) }));
  const summary = { articles: source.articles.length, entries: result.length, enriched: source.enriched, verdicts: {}, codes: {},
    missing: missing.map((a) => a.lemma) };
  for (const e of entries) {
    summary.verdicts[e.verdict] = (summary.verdicts[e.verdict] || 0) + 1;
    for (const f of e.findings) summary.codes[f.code] = (summary.codes[f.code] || 0) + 1;
  }
  if (missing.length) summary.codes["entry.missing"] = missing.length;
  return { entries, summary };
}

/** all findings as CSV (UTF-8 with BOM, ";") */
export function findingsCsv(report) {
  const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const area = { entry: "Eintrag", lemma: "Lemma", id: "ID", text: "Text", place: "Ort", bibl: "Quelle", xref: "Verweis" };
  const kind = { fix: "automatisch", review: "nachsehen", info: "zulässig" };
  const lines = [["Lemma", "ID", "Bereich", "Code", "Befund", "im Ergebnis", "erwartet", "Art"].map(q).join(";")];
  for (const e of report.entries) for (const f of e.findings) {
    const a = f.code.split(".")[0];
    lines.push([e.lemma, e.id, area[a] || a, f.code, LABELS[f.code] || f.code, f.text, f.expected, kind[f.kind] || f.kind].map(q).join(";"));
  }
  for (const l of report.summary.missing) lines.push([l, "", area.entry, "entry.missing", LABELS["entry.missing"], "", "", kind.review].map(q).join(";"));
  return "﻿" + lines.join("\r\n") + "\r\n";
}
