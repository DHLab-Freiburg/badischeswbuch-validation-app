import * as data from "./data.js";
import * as view from "./view.js";
import * as pruefung from "./pruefung.js";

let listsInfo = null;

// Wait for DOM to be fully loaded
document.addEventListener("DOMContentLoaded", async () => {
  /* ---------- bootstrap ---------- */
  view.cacheDom();
  view.prefillSample();

  // Initialize editors and copy buttons
  view.initCodeEditors();
  view.initCopyButtons();

  // Show loading state for schema validation
  showInitializationStatus("Loading schema validation...", false);

  // Load places data and initialize schema validation in parallel
  const [placesLoaded, schemaInitialized, listsLoaded] = await Promise.allSettled([
    data.loadPlacesData(),
    data.initSchemaValidation(),
    pruefung.loadLists(),
  ]);
  if (listsLoaded.status === "fulfilled") listsInfo = listsLoaded.value;
  else console.warn("Failed to load check lists:", listsLoaded.reason);
  view.initFileButtons();

  // Handle initialization results
  if (placesLoaded.status === "fulfilled") {
    console.log("Places data loaded successfully");
  } else {
    console.warn("Failed to load places data:", placesLoaded.reason);
  }

  if (schemaInitialized.status === "fulfilled" && schemaInitialized.value) {
    console.log("Schema validation initialized successfully");
    showInitializationStatus("Schema validation ready", true);
  } else {
    console.warn(
      "Schema validation initialization failed:",
      schemaInitialized.reason || "Unknown error"
    );
    showInitializationStatus("Schema validation failed to initialize", false);
  }

  /* ---------- event wiring ---------- */
  view.onValidate(async () => {
    const srcXML = view.getSrcXML();
    const genXML = view.getGenXML();

    if (!srcXML.trim() || !genXML.trim()) {
      alert("Both inputs required");
      return;
    }

    // Show loading state
    showValidationLoading(true);

    try {
      const report = pruefung.check(srcXML, genXML);

      if (!report.entries.length) {
        alert("No entries found in the generated XML");
        showValidationLoading(false);
        return;
      }

      // Render the results at once; the schema check (xmllint in WebAssembly) can take minutes for a whole
      // delivery and follows when it is done
      view.renderSummary(report, listsInfo);
      view.renderSidebar(report.entries);
      view.renderPreview(report.entries[0], 0);
      view.showValidationSection();
      showInitializationStatus("Schema validation running (may take a few minutes for a whole delivery)…", false);
      await new Promise((r) => setTimeout(r, 50));
      const schema = await data.validateAgainstSchema(genXML);
      view.renderSchemaValidation({ isValid: schema.isValid, errors: data.parseValidationErrors(schema.errors), initialized: schema.initialized });

      showValidationLoading(false);
    } catch (error) {
      console.error("Validation error:", error);

      // Provide specific error messages for common issues
      let errorMessage = error.message;
      if (error.message.includes("not well-formed")) {
        errorMessage = `XML Parsing Error: ${error.message}\n\nPlease check your Generated XML for syntax errors (unclosed tags, invalid characters, etc.)`;
      }

      alert(errorMessage);
      showValidationLoading(false);
    }
  });

  view.onSidebarSelect((index) => {
    const rep = view.currentReport[index];
    view.renderPreview(rep, index);
  });

  view.onClear(() => {
    view.resetUI();
    showInitializationStatus("Schema validation ready", true);
  });
});

/**
 * Show initialization status in the UI
 * @param {string} message - Status message to display
 * @param {boolean} success - Whether initialization was successful
 */
function showInitializationStatus(message, success) {
  const schemaPanel = document.getElementById("schema-validation");
  if (!schemaPanel) return;

  const statusClass = success ? "success" : "loading";
  const icon = success ? "✅" : "⏳";

  schemaPanel.innerHTML = `
    <div class="schema-status">
      <div class="schema-header">
        <span class="schema-icon">${icon}</span>
        <h3>Schema Validation</h3>
        <span class="status-badge ${statusClass}">${
    success ? "Ready" : "Loading"
  }</span>
      </div>
      <p class="${
        success ? "success-message" : "loading-message"
      }">${message}</p>
    </div>
  `;
}

/**
 * Show/hide validation loading state
 * @param {boolean} loading - Whether to show loading state
 */
function showValidationLoading(loading) {
  const validateBtn = document.getElementById("validate-btn");
  if (!validateBtn) return;

  if (loading) {
    validateBtn.disabled = true;
    validateBtn.textContent = "Validating...";
  } else {
    validateBtn.disabled = false;
    validateBtn.textContent = "Validate Transformation";
  }
}
