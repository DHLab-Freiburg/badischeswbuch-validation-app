/* entry-view.js – renders one <entry> as a dictionary article, in document order.
 *
 * Every element of artikel-corpus.schema.rng is rendered where it stands (nothing is dropped, unknown elements are
 * shown with their name). Nested senses (subsenses/sense) are rendered recursively. Places, sources and
 * cross-references that have a finding are marked in the text; hovering shows the finding.
 */
import { placeInfo, LABELS } from "./pruefung.js";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const kids = (el) => [...el.childNodes];
const attr = (el, n) => el.getAttribute(n) || "";

/** findings of the entry by the text of the place / source / reference they concern */
function flagIndex(findings) {
  const idx = { place: new Map(), bibl: new Map(), crossRef: new Map() };
  for (const f of findings || []) {
    const area = f.code.split(".")[0];
    const map = area === "place" ? idx.place : area === "bibl" ? idx.bibl : area === "xref" ? idx.crossRef : null;
    if (!map || !f.text) continue;
    const t = (area === "xref" ? f.text.split(" ← ")[1] : f.text.split(" → ")[0]) || "";
    const k = t.replace(/\s+/g, "");
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(f);
  }
  return idx;
}

function flagAttrs(list) {
  if (!list || !list.length) return "";
  const worst = list.some((f) => f.kind === "review") ? "review" : "fix";
  const title = list.map((f) => `${LABELS[f.code] || f.code}${f.expected ? ` → ${f.expected}` : ""}`).join("\n");
  return ` data-flag="${worst}" title="${esc(title)}"`;
}

/** inline content */
function inline(node, ctx) {
  let h = "";
  for (const n of kids(node)) {
    if (n.nodeType === 3) { h += esc(n.nodeValue); continue; }
    if (n.nodeType !== 1) continue;
    const inner = () => inline(n, ctx);
    const k = n.textContent.replace(/\s+/g, "");
    switch (n.nodeName) {
      case "place": {
        const key = attr(n, "key").trim(), guess = attr(n, "guess"), type = attr(n, "type");
        const info = key.startsWith("lfd_") ? placeInfo(key) : null;
        const tip = type === "region" ? `Landschaft: ${key}` : info ? `${key}: ${info.name}` : key ? key : guess ? `vermutet ${guess} (${attr(n, "confidence")})` : "ohne Schlüssel";
        const list = ctx.flags.place.get(k);
        h += `<span class="place-reference${type === "region" ? " region" : ""}${guess ? " guess" : ""}${key || guess ? "" : " nokey"}" data-lfd-key="${esc(key || guess)}" data-place-name="${esc(n.textContent)}" title="${esc(tip)}"${flagAttrs(list)}>${inner()}</span>`;
        break;
      }
      case "bibl": {
        const key = attr(n, "key"), list = ctx.flags.bibl.get(k);
        h += `<span class="bibl${key ? "" : " nokey"}" title="${esc(key || "ohne Schlüssel")}"${flagAttrs(list)}>${inner()}</span>`;
        break;
      }
      case "crossRef": {
        const key = attr(n, "key"), sub = attr(n, "subsense"), list = ctx.flags.crossRef.get(k);
        h += `<span class="cross-ref" title="${esc(key + (sub ? ` / ${sub}` : ""))}"${flagAttrs(list)}>${inner()}</span>`;
        break;
      }
      case "person": h += `<span class="person-reference" title="${esc(attr(n, "key") || attr(n, "guess"))}">${inner()}</span>`; break;
      case "inline-phon": h += `<span class="inline-phon">${inner()}</span>`; break;
      case "phon": h += `<span class="phon">${inner()}</span>`; break;
      case "meaning": h += `<span class="meaning">${inner()}</span>`; break;
      case "term": h += `<span class="term ${esc(attr(n, "type"))}" title="${esc([attr(n, "type"), attr(n, "lang")].filter(Boolean).join(", "))}">${inner()}</span>`; break;
      case "lang": h += `<span class="lang">${inner()}</span>`; break;
      case "pos": h += `<span class="pos" title="${esc([...n.attributes].map((a) => `${a.name}=${a.value}`).join(", "))}">${inner()}</span>`; break;
      case "superscript": h += `<sup class="superscript">${inner()}</sup>`; break;
      case "subscript": h += `<sub>${inner()}</sub>`; break;
      case "hi": h += `<span class="hi hi-${esc(attr(n, "rend"))}">${inner()}</span>`; break;
      case "terminator": h += `<span class="terminator">${inner()}</span>`; break;
      case "geo": h += `<span class="geo"${attr(n, "key") ? ` title="Landschaft: ${esc(attr(n, "key"))}"` : ""}>${inner()}</span>`; break;
      case "marker": h += `<span class="marker ${esc(attr(n, "type"))}" title="${esc([attr(n, "type"), attr(n, "subtype")].filter(Boolean).join(" "))}">${inner()}</span>`; break;
      default: h += `<span class="xml-other" title="&lt;${esc(n.nodeName)}&gt;">${inner()}</span>`;
    }
  }
  return h;
}

const meta = (n) => ["date", "source", "location", "note"].filter((a) => attr(n, a))
  .map((a) => `<span class="meta-${a}" title="${a}">${esc(attr(n, a))}</span>`).join(" ");

function list(container, ctx, itemName, cls) {
  return `<div class="${cls}s">${[...container.children].filter((c) => c.nodeName === itemName)
    .map((c) => `<div class="${cls}">${meta(c) ? `<span class="${cls}-meta">${meta(c)}</span> ` : ""}${inline(c, ctx)}</div>`).join("")}</div>`;
}

/** block content of entry, sense, subentry: children in document order */
function blocks(el, ctx, depth) {
  let h = "";
  for (const c of el.children) {
    switch (c.nodeName) {
      case "lemma": case "markers": break;             // in the header
      case "pronunciations":
        h += `<div class="pronunciations">${[...c.children].map((v) => `<div class="variant">${inline(v, ctx)}</div>`).join("")}</div>`;
        break;
      case "morphology":
        h += `<div class="morphology"><span class="morphology-label">Formen:</span> ${[...c.children].map((f) =>
          `<span class="morph-form" title="${esc(["n", "person", "number", "tense", "mood"].filter((a) => attr(f, a)).map((a) => `${a}=${attr(f, a)}`).join(", "))}">${inline(f, ctx)}</span>`).join(" ")}</div>`;
        break;
      case "grammar": h += `<div class="grammar">${inline(c, ctx)}</div>`; break;
      case "senses": case "subsenses":
        h += `<div class="${c.nodeName}">${[...c.children].map((s) => sense(s, ctx, depth + 1)).join("")}</div>`;
        break;
      case "def": h += `<div class="definition">${inline(c, ctx)}</div>`; break;
      case "examples": h += list(c, ctx, "example", "example"); break;
      case "attestations": h += list(c, ctx, "attestation", "attestation"); break;
      case "etymology": h += `<div class="etymology"><span class="etymology-label">Herkunft:</span> ${inline(c, ctx)}</div>`; break;
      case "references": h += `<div class="references"><span class="references-label">Verweise:</span> ${inline(c, ctx)}</div>`; break;
      case "bibliography": h += `<div class="bibliography"><span class="bibliography-label">Literatur:</span> ${inline(c, ctx)}</div>`; break;
      case "problems":
        h += `<div class="problems-section"><span class="problems-label">Hinweise der Transformation:</span>${[...c.children].map((p) =>
          `<div class="problem ${esc(attr(p, "severity") || "info")}">${attr(p, "location") ? `<span class="problem-location">[${esc(attr(p, "location"))}]</span> ` : ""}${inline(p, ctx)}</div>`).join("")}</div>`;
        break;
      case "subentries":
        h += `<div class="subentries">${[...c.children].map((s) => `<div class="subentry">${header(s, ctx)}${blocks(s, ctx, depth + 1)}</div>`).join("")}</div>`;
        break;
      default: h += `<div class="xml-other" title="&lt;${esc(c.nodeName)}&gt;">${inline(c, ctx)}</div>`;
    }
  }
  return h;
}

function sense(s, ctx, depth) {
  const n = attr(s, "n"), dom = attr(s, "domain");
  const markers = [...s.children].find((c) => c.nodeName === "markers");
  return `<div class="sense depth-${depth}">
    ${n ? `<span class="sense-number" title="n=&quot;${esc(n)}&quot;">${esc(n)}</span>` : ""}
    ${markers ? `<span class="markers">${inline(markers, ctx)}</span>` : ""}
    ${dom ? `<span class="domain-badge">${esc(dom)}</span>` : ""}
    <div class="sense-body">${blocks(s, ctx, depth)}</div></div>`;
}

function header(el, ctx) {
  const lemma = [...el.children].find((c) => c.nodeName === "lemma");
  const markers = [...el.children].find((c) => c.nodeName === "markers");
  return `<div class="entry-header">
    ${markers ? `<span class="markers">${inline(markers, ctx)}</span>` : ""}
    <span class="lemma">${lemma ? inline(lemma, ctx) : "—"}</span>
    ${attr(el, "id") ? `<span class="entry-id" title="entry/@id">${esc(attr(el, "id"))}</span>` : ""}
  </div>`;
}

/** HTML for one entry */
export function renderEntry(entryNode, findings) {
  const ctx = { flags: flagIndex(findings) };
  return `<div class="entry">${header(entryNode, ctx)}${blocks(entryNode, ctx, 0)}</div>`;
}
