import * as data from "./data.js";
import * as view from "./view.js";

// Wait for DOM to be fully loaded
document.addEventListener("DOMContentLoaded", async () => {
  /* ---------- bootstrap ---------- */
  view.cacheDom();
  view.prefillSample();

  // Initialize editors and copy buttons
  view.initCodeEditors();
  view.initCopyButtons();

  // Load places data
  await data.loadPlacesData();

  /* ---------- event wiring ---------- */
  view.onValidate(() => {
    const srcXML = view.getSrcXML();
    const genXML = view.getGenXML();

    if (!srcXML.trim() || !genXML.trim()) {
      alert("Both inputs required");
      return;
    }

    const report = data.compareCorpus(srcXML, genXML);
    if (!report.length) {
      alert("No entries found in either source");
      return;
    }

    view.renderSidebar(report);
    view.renderPreview(report[0], 0);
    view.showValidationSection();
  });

  view.onSidebarSelect((index) => {
    const rep = view.currentReport[index];
    view.renderPreview(rep, index);
  });

  view.onClear(() => view.resetUI());
});
