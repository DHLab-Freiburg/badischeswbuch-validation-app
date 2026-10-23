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
  showInitializationStatus("Schemaprüfung wird geladen …", false);

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
    showInitializationStatus("Schemaprüfung bereit", true);
  } else {
    console.warn(
      "Schema validation initialization failed:",
      schemaInitialized.reason || "Unknown error"
    );
    showInitializationStatus("Schemaprüfung ließ sich nicht laden", false);
  }

  /* ---------- event wiring ---------- */
  view.onValidate(async () => {
    const srcXML = view.getSrcXML();
    const genXML = view.getGenXML();

    if (!srcXML.trim() || !genXML.trim()) {
      alert("Bitte beide Felder füllen: Quell-XML und Ergebnis-XML.");
      return;
    }

    // Show loading state
    showValidationLoading(true);

    try {
      const report = pruefung.check(srcXML, genXML);

      if (!report.entries.length) {
        alert("Im Ergebnis-XML wurden keine Einträge (<entry>) gefunden.");
        showValidationLoading(false);
        return;
      }

      // Render the results at once; the schema check (xmllint in WebAssembly) can take minutes for a whole
      // delivery and follows when it is done
      view.renderSummary(report, listsInfo);
      view.renderSidebar(report.entries);
      view.renderPreview(report.entries[0], 0);
      view.showValidationSection();
      showInitializationStatus("Schemaprüfung läuft (bei einer ganzen Lieferung einige Minuten) …", false);
      await new Promise((r) => setTimeout(r, 50));
      const schema = await data.validateAgainstSchema(genXML);
      view.renderSchemaValidation({ isValid: schema.isValid, errors: data.parseValidationErrors(schema.errors), initialized: schema.initialized });

      showValidationLoading(false);
    } catch (error) {
      console.error("Validation error:", error);

      // Provide specific error messages for common issues
      let errorMessage = error.message;
      if (error.message.includes("nicht wohlgeformt")) {
        errorMessage = `XML-Fehler: ${error.message}\n\nBitte das XML auf Syntaxfehler prüfen (nicht geschlossene Elemente, ungültige Zeichen usw.).`;
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
    showInitializationStatus("Schemaprüfung bereit", true);
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
        <h3>Schemaprüfung</h3>
        <span class="status-badge ${statusClass}">${
    success ? "bereit" : "lädt"
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
    validateBtn.textContent = "Prüfung läuft …";
  } else {
    validateBtn.disabled = false;
    validateBtn.textContent = "Transformation prüfen";
  }
}
