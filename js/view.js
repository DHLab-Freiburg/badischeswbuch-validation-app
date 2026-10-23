/* view.js – DOM work only, no data crunching */
import * as data from "./data.js";
import * as pruefung from "./pruefung.js";
import { renderEntry } from "./entry-view.js";
/* -------------------------------------------------- */
/* cache frequently-used nodes                        */
/* -------------------------------------------------- */
const dom = {};
let currentReport = [];
let srcEditor, genEditor;

function cacheDom() {
  dom.srcTA = document.getElementById("source-xml");
  dom.genTA = document.getElementById("generated-xml");
  dom.validateBtn = document.getElementById("validate-btn");
  dom.clearBtn = document.getElementById("clear-btn");

  dom.sidebar = document.getElementById("entry-list");
  dom.previewPanel = document.getElementById("dictionary-content");
  dom.statsPanel = document.getElementById("stats-content");
  dom.validationSection = document.getElementById("validation-section");
  dom.schemaValidationPanel = document.getElementById("schema-validation");
}

/* -------------------------------------------------- */
/* textarea helpers                                   */
/* -------------------------------------------------- */
const getSrcXML = () =>
  srcEditor ? srcEditor.getValue().trim() : dom.srcTA.value.trim();
const getGenXML = () =>
  genEditor ? genEditor.getValue().trim() : dom.genTA.value.trim();
const setGenXML = (val) => {
  dom.genTA.value = val;
  if (genEditor) {
    genEditor.setValue(val);
  }
};

/* -------------------------------------------------- */
/* CodeMirror initialization                          */
/* -------------------------------------------------- */
function initCodeEditors() {
  // Replace source textarea with CodeMirror
  srcEditor = CodeMirror.fromTextArea(dom.srcTA, {
    mode: "xml",
    lineNumbers: true,
    lineWrapping: true,
    theme: "default",
    indentUnit: 2,
  });

  // Replace generated textarea with CodeMirror
  genEditor = CodeMirror.fromTextArea(dom.genTA, {
    mode: "xml",
    lineNumbers: true,
    lineWrapping: true,
    theme: "default",
    indentUnit: 2,
  });

  // Add change listeners to sync with original textareas
  srcEditor.on("change", () => {
    srcEditor.save(); // Update textarea content
  });

  genEditor.on("change", () => {
    genEditor.save(); // Update textarea content
  });
}

/* -------------------------------------------------- */
/* Copy button initialization                         */
/* -------------------------------------------------- */
function initCopyButtons() {
  document.querySelectorAll(".copy-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");
      const textarea = document.getElementById(targetId);

      // Get content to copy (either from CodeMirror or textarea)
      let content;
      if (targetId === "source-xml" && srcEditor) {
        content = srcEditor.getValue();
      } else if (targetId === "generated-xml" && genEditor) {
        content = genEditor.getValue();
      } else {
        content = textarea.value;
      }

      // Copy to clipboard
      navigator.clipboard
        .writeText(content)
        .then(() => {
          // Visual feedback
          btn.classList.add("copied");
          const originalText = btn.innerHTML;
          btn.innerHTML = '<span class="copy-icon">✓</span> Copied!';

          // Reset after 2 seconds
          setTimeout(() => {
            btn.classList.remove("copied");
            btn.innerHTML = originalText;
          }, 2000);
        })
        .catch((err) => {
          console.error("Failed to copy: ", err);
        });
    });
  });
}

/* -------------------------------------------------- */
/* open files instead of pasting (a delivery has 2–3 MB) */
/* -------------------------------------------------- */
function initFileButtons() {
  document.querySelectorAll('.file-btn input[type="file"]').forEach((input) => {
    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const text = await file.text();
      const editor = input.dataset.target === "source-xml" ? srcEditor : genEditor;
      const ta = document.getElementById(input.dataset.target);
      ta.value = text;
      if (editor) editor.setValue(text);
      input.closest(".file-btn").title = file.name;
      input.value = "";
    });
  });
}

/* -------------------------------------------------- */
/* prefilling sample data (optional)                  */
/* -------------------------------------------------- */
function prefillSample() {
  if (dom.srcTA.value || dom.genTA.value) return;

  const sampleSourceXML =
    "<artikel>Das ist ein Test mit einigen Wörtern wie Badisch und Dialekt.</artikel>";
  const sampleGeneratedXML = `<?xml version="1.0"?>
    <badisches-corpus>
      <entry id="aal-fett">
        <lemma>aal-fett</lemma>
        <grammar>Eigsch.:</grammar>
        <senses>
          <sense>
            <def>fett wie ein Aal</def>
          </sense>
        </senses>
        <pronunciations>
          <variant>
            <phon>ǭlfęt</phon>
            <geo><place key="lfd_1535">Unterbaldgn</place></geo>
            <terminator>,</terminator>
          </variant>
          <variant>
            <phon>ōlfa̧t</phon>
            <geo><place key="lfd_375">Etthm</place>, <place key="lfd_1102">Oberschopf.</place></geo>
            <terminator>;</terminator>
          </variant>
        </pronunciations>
        <bibliography><bibl key="Beiträge">Beitr.</bibl> 48, 117.</bibliography>
      </entry>
    </badisches-corpus>`;

  // Set values in textareas
  dom.srcTA.value = sampleSourceXML;
  dom.genTA.value = sampleGeneratedXML;

  // Update editors if initialized
  if (srcEditor) {
    srcEditor.setValue(sampleSourceXML);
  }

  if (genEditor) {
    genEditor.setValue(sampleGeneratedXML);
  }
}

/* -------------------------------------------------- */
/* Schema validation rendering                        */
/* -------------------------------------------------- */
function renderSchemaValidation(schemaValidation) {
  if (!dom.schemaValidationPanel) return;

  const { isValid, errors, initialized } = schemaValidation;

  if (!initialized) {
    dom.schemaValidationPanel.innerHTML = `
      <div class="schema-status">
        <div class="schema-header">
          <span class="schema-icon">⏳</span>
          <h3>Schema Validation</h3>
          <span class="status-badge loading">Loading...</span>
        </div>
        <p>Schema validation is initializing...</p>
      </div>
    `;
    return;
  }

  let html = `
    <div class="schema-status">
      <div class="schema-header">
        <span class="schema-icon">${isValid ? "✅" : "❌"}</span>
        <h3>Schema Validation</h3>
        <span class="status-badge ${isValid ? "valid" : "invalid"}">${
    isValid ? "Valid" : "Invalid"
  }</span>
      </div>
  `;

  if (isValid) {
    html +=
      '<p class="success-message">XML is valid according to the RelaxNG schema.</p>';
  } else {
    html += `
      <div class="error-summary">
        <p><strong>${errors.length} validation error${
      errors.length === 1 ? "" : "s"
    } found:</strong></p>
        <div class="validation-errors">
    `;

    errors.forEach((error, index) => {
      html += `
        <div class="validation-error ${
          error.severity
        }" data-error-index="${index}">
          <div class="error-header">
            <span class="error-icon">${
              error.severity === "error" ? "🔴" : "🟡"
            }</span>
            ${
              error.line
                ? `<span class="error-location">Line ${error.line}${
                    error.column ? `, Column ${error.column}` : ""
                  }</span>`
                : ""
            }
          </div>
          <div class="error-message">${escapeHtml(error.message)}</div>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;
  }

  html += "</div>";
  dom.schemaValidationPanel.innerHTML = html;

  // Add click handlers to error messages to jump to locations
  attachSchemaErrorClickHandlers(errors);
}

/* -------------------------------------------------- */
/* Schema error click handlers                        */
/* -------------------------------------------------- */
function attachSchemaErrorClickHandlers(errors) {
  document.querySelectorAll(".validation-error").forEach((errorEl, index) => {
    if (errors[index] && errors[index].line) {
      errorEl.style.cursor = "pointer";
      errorEl.addEventListener("click", () => {
        jumpToLine(errors[index].line, errors[index].column, genEditor);
      });
    }
  });
}

/* -------------------------------------------------- */
/* sidebar list                                       */
/* -------------------------------------------------- */
let currentFilter = null;      // { verdict } or { code }

function visible(r) {
  if (!currentFilter) return true;
  if (currentFilter.verdict) return r.verdict === currentFilter.verdict;
  if (currentFilter.code) return r.findings.some((f) => f.code === currentFilter.code);
  return true;
}

function renderSidebar(entries) {
  currentReport = entries;
  dom.sidebar.innerHTML = entries
    .map((r, i) => {
      if (!visible(r)) return "";
      const n = r.findings.filter((f) => f.kind !== "info").length;
      return `
    <li data-idx="${i}" class="sidebar-row verdict-${r.verdict}" title="${escapeHtml(pruefung.VERDICTS[r.verdict] || "")}">
      <span class="idx">${i + 1}</span>
      <span class="lemma">${escapeHtml(r.lemma || r.id)}</span>
      <span class="perc">${n || "✓"}</span>
    </li>`;
    })
    .join("");
}

/* -------------------------------------------------- */
/* summary of the whole file, filters, CSV export     */
/* -------------------------------------------------- */
let currentFull = null;

function renderSummary(report, listsInfo) {
  currentFull = report;
  const s = report.summary;
  const box = document.getElementById("report-summary");
  if (!box) return;
  const kind = {};
  for (const e of report.entries) for (const f of e.findings) kind[f.code] = f.kind;
  if (s.missing.length) kind["entry.missing"] = "review";
  const codes = Object.entries(s.codes).sort((a, b) => b[1] - a[1]);
  const stand = listsInfo && listsInfo.stand ? `Lists: ${escapeHtml(listsInfo.stand.datenstand || "")}, created ${escapeHtml(listsInfo.stand.erzeugt || "")}` : "Lists: no data/stand.json";
  box.innerHTML = `
    <div class="summary-head">
      <h3>Check of the whole file</h3>
      <span>${s.articles} articles in the source, ${s.entries} entries in the result${s.enriched ? " · source: enriched XML of the editorial system (position by position)" : " · source: delivery XML"}</span>
      <button id="csv-btn" type="button">Findings as CSV</button>
      <button id="filter-reset" type="button">Show all</button>
    </div>
    <div class="summary-verdicts">${Object.entries(pruefung.VERDICTS).map(([v, label]) =>
      `<button type="button" class="verdict-chip verdict-${v}" data-verdict="${v}">${escapeHtml(label)}: <b>${s.verdicts[v] || 0}</b></button>`).join("")}</div>
    <table class="summary-codes"><tbody>${codes.map(([c, n]) =>
      `<tr data-code="${c}"><td><span class="kind kind-${kind[c] || "review"}">${kind[c] === "fix" ? "automatic" : kind[c] === "info" ? "allowed" : "check"}</span></td><td>${escapeHtml(pruefung.LABELS[c] || c)}</td><td class="num">${n}</td></tr>`).join("")}</tbody></table>
    ${s.missing.length ? `<p class="summary-missing">Missing in the result: ${s.missing.map(escapeHtml).join(", ")}</p>` : ""}
    <p class="summary-stand">${stand}</p>`;
  box.querySelectorAll("[data-verdict]").forEach((b) => b.addEventListener("click", () => setFilter({ verdict: b.dataset.verdict })));
  box.querySelectorAll("tr[data-code]").forEach((t) => t.addEventListener("click", () => setFilter({ code: t.dataset.code })));
  box.querySelector("#filter-reset").addEventListener("click", () => setFilter(null));
  box.querySelector("#csv-btn").addEventListener("click", () => {
    const blob = new Blob([pruefung.findingsCsv(report)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "findings.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

function setFilter(f) {
  currentFilter = f;
  document.querySelectorAll("#report-summary .active").forEach((x) => x.classList.remove("active"));
  if (f && f.verdict) document.querySelector(`#report-summary [data-verdict="${f.verdict}"]`)?.classList.add("active");
  if (f && f.code) document.querySelector(`#report-summary tr[data-code="${f.code}"]`)?.classList.add("active");
  renderSidebar(currentFull.entries);
  const first = currentFull.entries.findIndex(visible);
  if (first >= 0) renderPreview(currentFull.entries[first], first);
}

/* -------------------------------------------------- */
/* PREVIEW – single central article                   */
/* -------------------------------------------------- */
function renderPreview(r, index) {
  document.querySelectorAll(".sidebar-row.selected").forEach((x) => x.classList.remove("selected"));
  document.querySelector(`.sidebar-row[data-idx="${index}"]`)?.classList.add("selected");
  dom.previewPanel.innerHTML = renderEntry(r.entryNode, r.findings) +
    (r.source ? `<details class="source-text"><summary>Source text</summary><div>${escapeHtml(r.source.text)}</div></details>` : "");
  attachPlaceClickHandlers();
  showValidationSection();
  renderFindings(r);
}

function renderFindings(r) {
  const groups = { fix: [], review: [], info: [] };
  for (const f of r.findings) groups[f.kind].push(f);
  const block = (kind, title) => groups[kind].length ? `
    <h4 class="kind-${kind}">${title} (${groups[kind].length})</h4>
    <table class="findings"><tbody>${groups[kind].map((f) => `
      <tr><td>${escapeHtml(pruefung.LABELS[f.code] || f.code)}</td><td class="f-text">${escapeHtml(f.text)}</td><td class="f-expected">${f.expected ? "→ " + escapeHtml(f.expected) : ""}</td></tr>`).join("")}
    </tbody></table>` : "";
  dom.statsPanel.innerHTML = `
    <div class="card verdict-${r.verdict}"><span class="val">${escapeHtml(pruefung.VERDICTS[r.verdict] || r.verdict)}</span><span class="lbl">${escapeHtml(r.id)}</span></div>
    ${block("review", "To check")}${block("fix", "Can be repaired automatically")}${block("info", "Allowed")}
    ${r.findings.length ? "" : '<p class="success-message">No findings.</p>'}`;
}

/**
 * Process simple string content, escaping HTML and handling inline tags
 */
function processContent(content) {
  if (!content) return "";

  let processedContent = content
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .trim();

  return processedContent;
}

/**
 * Process complex HTML content with nested elements
 */
function processComplexContent(element) {
  if (!element) return "";

  // Get the HTML content
  let content = element.innerHTML;

  // Create a temporary container
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = content;

  // Process term elements
  tempDiv.querySelectorAll("term").forEach((term) => {
    const type = term.getAttribute("type") || "";
    const lang = term.getAttribute("lang") || "";
    const termContent = term.textContent;

    const span = document.createElement("span");
    span.className = `term ${type}`;
    if (lang) span.setAttribute("lang", lang);
    span.textContent = termContent;

    term.parentNode.replaceChild(span, term);
  });

  // Process inline-phon elements
  tempDiv.querySelectorAll("inline-phon").forEach((inlinePhon) => {
    const span = document.createElement("span");
    span.className = "inline-phon";
    span.innerHTML = inlinePhon.innerHTML; // Use innerHTML to preserve nested elements

    inlinePhon.parentNode.replaceChild(span, inlinePhon);
  });

  // Process hi (highlight) elements
  tempDiv.querySelectorAll("hi").forEach((hi) => {
    const rend = hi.getAttribute("rend") || "";
    const span = document.createElement("span");
    span.className = `hi hi-${rend}`;
    span.innerHTML = hi.innerHTML;

    hi.parentNode.replaceChild(span, hi);
  });

  // Process superscript elements
  tempDiv.querySelectorAll("superscript").forEach((sup) => {
    const span = document.createElement("sup");
    span.className = "superscript";
    span.innerHTML = sup.innerHTML;

    sup.parentNode.replaceChild(span, sup);
  });

  // Process lang elements
  tempDiv.querySelectorAll("lang").forEach((lang) => {
    const span = document.createElement("span");
    span.className = "lang";
    span.textContent = lang.textContent;

    lang.parentNode.replaceChild(span, lang);
  });

  // Process meaning elements
  tempDiv.querySelectorAll("meaning").forEach((meaning) => {
    const span = document.createElement("span");
    span.className = "meaning";
    span.innerHTML = meaning.innerHTML;

    meaning.parentNode.replaceChild(span, meaning);
  });

  // Process person elements
  tempDiv.querySelectorAll("person").forEach((person) => {
    const key = person.getAttribute("key") || "";
    const guess = person.getAttribute("guess") || "";
    const confidence = person.getAttribute("confidence") || "";
    const source = person.getAttribute("source") || "";
    const personName = person.textContent;

    const span = document.createElement("span");
    span.className = "person-reference";
    if (key) span.setAttribute("data-person-key", key);
    if (guess) span.setAttribute("data-person-guess", guess);

    let displayText = personName;
    if (key) {
      displayText += ` (${key})`;
    } else if (guess) {
      displayText += ` (~${guess}, conf: ${confidence})`;
    }
    span.textContent = displayText;

    person.parentNode.replaceChild(span, person);
  });

  // Process bibl elements
  tempDiv.querySelectorAll("bibl").forEach((bibl) => {
    const key = bibl.getAttribute("key") || "";
    const source = bibl.getAttribute("source") || "";
    const content = bibl.textContent;

    const span = document.createElement("span");
    span.className = "bibl";

    // Include the key information in parentheses after the content
    if (key) {
      span.textContent = `${content} (${key})`;
    } else {
      span.textContent = content;
    }

    if (source) span.setAttribute("data-source", source);

    bibl.parentNode.replaceChild(span, bibl);
  });

  // Process cross-references (both <ref> and <crossRef>)
  tempDiv.querySelectorAll("ref, crossRef").forEach((ref) => {
    const target = ref.getAttribute("target") || ref.getAttribute("key") || "";
    const subsense = ref.getAttribute("subsense") || "";
    const content = ref.textContent;

    const span = document.createElement("span");
    span.className = "cross-ref";
    if (target) span.setAttribute("data-target", target);
    if (subsense) span.setAttribute("data-subsense", subsense);

    let displayText = content;
    if (subsense) {
      displayText += ` (${subsense})`;
    }
    span.textContent = displayText;

    ref.parentNode.replaceChild(span, ref);
  });

  // Process place elements (if any left)
  tempDiv.querySelectorAll("place").forEach((place) => {
    const key = place.getAttribute("key") || "";
    const placeName = place.textContent;

    const expanded = data.resolvePlaceId(`${placeName} (${key})`);

    const span = document.createElement("span");
    span.className = "place-reference";
    span.setAttribute("data-lfd-key", key);
    span.setAttribute("data-place-name", placeName);
    span.textContent = expanded;

    place.parentNode.replaceChild(span, place);
  });

  // Return the processed HTML
  return tempDiv.innerHTML;
}

/**
 * Process geographic content with place references and make them clickable
 */
function processGeoContent(content) {
  if (!content) return "";

  // Create a temporary document fragment
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = content;

  // Find all place tags
  const placeTags = tempDiv.querySelectorAll("place[key]");

  // Process each place tag
  placeTags.forEach((placeTag) => {
    const lfdKey = placeTag.getAttribute("key");
    const placeName = placeTag.textContent;

    // Create a span for the expanded place information
    const expandedPlace = data.resolvePlaceId(`${placeName} (${lfdKey})`);

    // Check for mismatch
    const hasMismatch = hasPlaceMismatch(expandedPlace);
    const cleanText = cleanMismatchFlag(expandedPlace);

    // Create a clickable span instead of just text
    const span = document.createElement("span");
    span.className = hasMismatch
      ? "place-reference place-mismatch"
      : "place-reference";
    span.setAttribute("data-lfd-key", lfdKey);
    span.setAttribute("data-place-name", placeName);

    //  Add warning icon for mismatches
    if (hasMismatch) {
      span.innerHTML = `🚩 ${cleanText}`;
      const csvShortForm = expandedPlace.split(";")[1]; // Extract short form from CSV
      span.title = `WARNING: First letter mismatch! XML abbreviation "${placeName}" does not match CSV short form "${csvShortForm}"`;
    } else {
      span.textContent = cleanText;
    }

    // Replace the place tag with the clickable span
    placeTag.parentNode.replaceChild(span, placeTag);
  });

  return tempDiv.innerHTML;
}

/**
 * Add click handlers to place references
 */
function attachPlaceClickHandlers() {
  document.querySelectorAll(".place-reference").forEach((placeRef) => {
    placeRef.addEventListener("click", () => {
      const lfdKey = placeRef.getAttribute("data-lfd-key");
      const placeName = placeRef.getAttribute("data-place-name");

      // Search for the place key in the generated XML
      const searchPattern = `key="${lfdKey}"`;
      jumpToText(searchPattern, dom.genTA);
    });
  });
}

/* -------------------------------------------------- */
/* stats cards & pills                                */
/* -------------------------------------------------- */
function renderStats(s) {
  dom.statsPanel.innerHTML = `
    <div class="card"><span class="val">${
      s.perc
    }%</span><span class="lbl">Preservation</span></div>
    <div class="card"><span class="val">${
      s.total
    }</span><span class="lbl">Total Tokens</span></div>
    <div class="card ${s.missingTotal ? "bad" : ""}"><span class="val">${
    s.missingTotal
  }</span><span class="lbl">Missing</span></div>
    <div class="card ${s.extraTotal ? "warn" : ""}"><span class="val">${
    s.extraTotal
  }</span><span class="lbl">Extra</span></div>

    ${
      s.missing.length
        ? `<div class="pillbox">${s.missing
            .map(
              (t) =>
                `<span class="pill bad" data-token="${
                  t.split(" ")[0]
                }">${t}</span>`
            )
            .join("")}</div>`
        : ""
    }
    ${
      s.extra.length
        ? `<div class="pillbox">${s.extra
            .map(
              (t) =>
                `<span class="pill warn" data-token="${
                  t.split(" ")[0]
                }">${t}</span>`
            )
            .join("")}</div>`
        : ""
    }
  `;

  // Add click handlers to pills
  attachPillClickHandlers();
}

/* -------------------------------------------------- */
/* pill click handlers                                */
/* -------------------------------------------------- */
function attachPillClickHandlers() {
  // Add click handlers for missing tokens (red pills)
  document.querySelectorAll(".pill.bad").forEach((pill) => {
    pill.style.cursor = "pointer";
    pill.addEventListener("click", () => {
      const token = pill.getAttribute("data-token");
      jumpToToken(token, dom.srcTA); // Jump to source XML for missing tokens
    });
  });

  // Add click handlers for extra tokens (yellow pills)
  document.querySelectorAll(".pill.warn").forEach((pill) => {
    pill.style.cursor = "pointer";
    pill.addEventListener("click", () => {
      const token = pill.getAttribute("data-token");
      jumpToToken(token, dom.genTA); // Jump to generated XML for extra tokens
    });
  });
}

/**
 * Jump to the first occurrence of a token in a textarea or CodeMirror editor
 * @param {string} token - The token to search for
 * @param {HTMLTextAreaElement} textarea - The textarea to search in
 */
function jumpToToken(token, textarea) {
  return jumpToText(token, textarea);
}

/**
 * Jump to specific text in a textarea or CodeMirror editor
 * @param {string} text - The text to search for
 * @param {HTMLTextAreaElement} textarea - The textarea to search in
 */
function jumpToText(text, textarea) {
  const isSourceTA = textarea === dom.srcTA;
  const editor = isSourceTA ? srcEditor : genEditor;

  if (editor) {
    // Search in CodeMirror
    const content = editor.getValue();
    const position = content.indexOf(text);

    if (position !== -1) {
      // Find line and character position
      const beforeText = content.substring(0, position);
      const lineNumber = beforeText.split("\n").length - 1;
      const charPosition = position - beforeText.lastIndexOf("\n") - 1;

      // Focus and scroll to position
      editor.focus();
      editor.setCursor(lineNumber, charPosition);
      editor.scrollIntoView({ line: lineNumber, ch: charPosition }, 100);

      // Select the text
      const textLength = text.length;
      editor.setSelection(
        { line: lineNumber, ch: charPosition },
        { line: lineNumber, ch: charPosition + textLength }
      );
    }
  } else {
    // Fall back to textarea if editors not initialized
    const content = textarea.value;
    const position = content.indexOf(text);

    if (position !== -1) {
      textarea.focus();
      textarea.setSelectionRange(position, position + text.length);

      const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 18;
      const lineNumber = content.substr(0, position).split("\n").length - 1;
      textarea.scrollTop = lineNumber * lineHeight;
    }
  }
}

/**
 * Jump to a specific line in a CodeMirror editor
 * @param {number} lineNumber - The line number to jump to (1-based)
 * @param {number} column - The column number (1-based, optional)
 * @param {CodeMirror} editor - The CodeMirror editor instance
 */
function jumpToLine(lineNumber, column = 1, editor) {
  if (!editor || !lineNumber) return;

  // Convert to 0-based indexing
  const line = Math.max(0, lineNumber - 1);
  const ch = Math.max(0, column - 1);

  // Focus and scroll to position
  editor.focus();
  editor.setCursor(line, ch);
  editor.scrollIntoView({ line, ch }, 100);

  // Highlight the line briefly
  const lineHandle = editor.addLineClass(line, "background", "error-highlight");
  setTimeout(() => {
    editor.removeLineClass(lineHandle, "background", "error-highlight");
  }, 2000);
}

/**
 * Escape HTML entities
 */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/* -------------------------------------------------- */
/* validation section visibility                      */
/* -------------------------------------------------- */
function showValidationSection() {
  if (dom.validationSection) {
    dom.validationSection.classList.remove("hidden");
  }
}

/* -------------------------------------------------- */
/* event-wiring wrappers                              */
/* -------------------------------------------------- */
function onValidate(fn) {
  dom.validateBtn.addEventListener("click", fn);
}
function onClear(fn) {
  dom.clearBtn.addEventListener("click", fn);
}
function onSidebarSelect(fn) {
  dom.sidebar.addEventListener("click", (e) => {
    const row = e.target.closest("[data-idx]");
    if (row) fn(+row.dataset.idx);
  });
}
/**
 * Check if a place reference has a first-letter mismatch
 */
function hasPlaceMismatch(expandedText) {
  return expandedText.includes("[MISMATCH]");
}

/**
 * Clean mismatch flag from display text
 */
function cleanMismatchFlag(text) {
  return text.replace("[MISMATCH]", "");
}
/* -------------------------------------------------- */
/* housekeeping                                       */
/* -------------------------------------------------- */
function resetUI() {
  // Clear CodeMirror editors if initialized
  if (srcEditor) srcEditor.setValue("");
  if (genEditor) genEditor.setValue("");

  // Also clear the underlying textareas
  dom.srcTA.value = dom.genTA.value = "";

  // Clear the rest of the UI
  dom.sidebar.innerHTML = "";
  dom.previewPanel.innerHTML = "";
  const summary = document.getElementById("report-summary");
  if (summary) summary.innerHTML = "";
  currentFilter = null;
  dom.statsPanel.innerHTML = "";

  if (dom.schemaValidationPanel) {
    dom.schemaValidationPanel.innerHTML = "";
  }

  if (dom.validationSection) {
    dom.validationSection.classList.add("hidden");
  }

  currentReport = [];
}

/* -------------------------------------------------- */
/* expose                                             */
/* -------------------------------------------------- */
export {
  cacheDom,
  prefillSample,
  getSrcXML,
  getGenXML,
  setGenXML,
  renderSidebar,
  renderPreview,
  renderSummary,
  renderSchemaValidation,
  onValidate,
  onClear,
  onSidebarSelect,
  resetUI,
  currentReport,
  showValidationSection,
  initCodeEditors,
  initCopyButtons,
  initFileButtons,
  attachPlaceClickHandlers,
};
