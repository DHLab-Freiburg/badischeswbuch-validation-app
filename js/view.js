/* view.js – DOM work only, no data crunching */
import * as data from "./data.js";
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
/* sidebar list                                       */
/* -------------------------------------------------- */
function renderSidebar(report) {
  currentReport = report;
  dom.sidebar.innerHTML = report
    .map(
      (r, i) => `
    <li data-idx="${i}" class="sidebar-row ${
        r.stats.missing.length ? "fail" : "pass"
      }">
      <span class="idx">${i + 1}</span>
      <span class="lemma">${r.lemma || r.id}</span>
      <span class="perc">${r.stats.perc}%</span>
    </li>`
    )
    .join("");
}

/* -------------------------------------------------- */
/* PREVIEW – single central article                   */
/* -------------------------------------------------- */
function renderPreview(r, index) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(r.entryNode.outerHTML, "text/xml");
  const entry = doc.documentElement;

  const lemma = entry.querySelector("lemma")?.textContent || "—";
  const grammar = entry.querySelector("grammar")?.textContent || "";

  let html = `
    <div class="entry">
      <div class="entry-header">
        <span class="lemma">${lemma}</span>
        ${grammar ? `<span class="grammar">${grammar}</span>` : ""}`;

  // Add markers if present
  const markers = entry.querySelectorAll("markers > marker");
  if (markers.length > 0) {
    markers.forEach((marker) => {
      const type = marker.getAttribute("type") || "";
      const value = marker.textContent;
      html += `<span class="marker ${type}">${value}</span>`;
    });
  }

  html += `</div>`; // Close entry-header

  // Pronunciations
  const pronunciations = entry.querySelector("pronunciations");
  if (pronunciations) {
    html += '<div class="pronunciations">';
    pronunciations.querySelectorAll("variant").forEach((variant) => {
      const phon = variant.querySelector("phon")?.textContent || "";
      let geo = variant.querySelector("geo")?.innerHTML || "";
      const terminator = variant.querySelector("terminator")?.textContent || "";

      // Process place references in geo field
      geo = processGeoContent(geo);

      html += `<div class="variant">
        <span class="phon">${phon}</span> 
        <span class="geo">${geo}</span>
        <span class="terminator">${terminator}</span>
      </div>`;
    });
    html += "</div>";
  }

  // Senses
  const senses = entry.querySelector("senses");
  if (senses) {
    html += '<div class="senses">';
    senses.querySelectorAll("sense").forEach((sense, idx) => {
      const defElement = sense.querySelector("def");
      const def = defElement ? processComplexContent(defElement) : "";

      html += `<div class="sense">`;

      // Only add sense number if there are multiple senses
      if (senses.querySelectorAll("sense").length > 1) {
        html += `<span class="sense-number">${idx + 1}.</span>`;
      }

      html += `<span class="definition">${def}</span>`;

      // Process examples if present
      const examples = sense.querySelector("examples");
      if (examples) {
        html += `<div class="examples">`;
        examples.querySelectorAll("example").forEach((example) => {
          html += `<div class="example">${processContent(
            example.textContent
          )}</div>`;
        });
        html += `</div>`;
      }

      // Process subsenses if present
      const subsenses = sense.querySelector("subsenses");
      if (subsenses) {
        html += `<div class="subsenses">`;
        subsenses.querySelectorAll("subsense").forEach((subsense, subIdx) => {
          const subDef = subsense.querySelector("def")?.textContent || "";
          html += `
            <div class="subsense">
              <span class="subsense-letter">${String.fromCharCode(
                97 + subIdx
              )})</span>
              <span class="definition">${processContent(subDef)}</span>
            </div>`;
        });
        html += `</div>`;
      }

      html += `</div>`; // Close sense
    });
    html += "</div>"; // Close senses
  }

  // Etymology
  const etymology = entry.querySelector("etymology");
  if (etymology) {
    html += `
      <div class="etymology">
        <span class="etymology-label">Etymology: </span>
        ${processContent(etymology.textContent)}
      </div>`;
  }

  // References (cross-references)
  const references = entry.querySelector("references");
  if (references) {
    html += `
      <div class="references">
        <span class="references-label">See also: </span>
        ${processComplexContent(references)}
      </div>`;
  }

  // Bibliography
  const bibliography = entry.querySelector("bibliography");
  if (bibliography) {
    html += `
      <div class="bibliography">
        <span class="bibliography-label">Sources: </span>
        ${processComplexContent(bibliography)}
      </div>`;
  }

  // Problems - for editorial notes or issues
  const problems = entry.querySelectorAll("problem");
  if (problems.length > 0) {
    problems.forEach((problem) => {
      const severity = problem.getAttribute("severity") || "info";
      html += `
        <div class="problem ${severity}">
          ${processContent(problem.textContent)}
        </div>`;
    });
  }

  html += "</div>"; // Close entry
  dom.previewPanel.innerHTML = html;

  // Add click handlers to place references
  attachPlaceClickHandlers();

  // Show validation section and render stats
  showValidationSection();
  renderStats(r.stats);
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
    const content = inlinePhon.textContent;

    const span = document.createElement("span");
    span.className = "inline-phon";
    span.textContent = content;

    inlinePhon.parentNode.replaceChild(span, inlinePhon);
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

  // Process cross-references
  tempDiv.querySelectorAll("ref").forEach((ref) => {
    const target = ref.getAttribute("target") || "";
    const content = ref.textContent;

    const span = document.createElement("span");
    span.className = "cross-ref";
    if (target) span.setAttribute("data-target", target);
    span.textContent = content;

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

    // Create a clickable span instead of just text
    const span = document.createElement("span");
    span.className = "place-reference";
    span.setAttribute("data-lfd-key", lfdKey);
    span.setAttribute("data-place-name", placeName);
    span.textContent = expandedPlace;

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
  dom.statsPanel.innerHTML = "";

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
  onValidate,
  onClear,
  onSidebarSelect,
  resetUI,
  currentReport,
  showValidationSection,
  initCodeEditors,
  initCopyButtons,
  attachPlaceClickHandlers,
};
