/* ---------- tiny helpers ---------- */
export const formatXML = (xml) => {
  if (!xml.trim()) return "";
  return xml
    .replace(/>\s*</g, ">\n<") // new lines
    .replace(/^\s+|\s+$/gm, "") // trim each line
    .replace(/\n{3,}/g, "\n\n"); // squash blank lines
};

const tokenise = (str) =>
  str
    .toLowerCase()
    .replace(/[,\.;:!?()\[\]{}"´`''""—\-]/g, " ")
    .split(/\s+/)
    .filter((t) => t && (t.length > 1 || "aeiouöäü".includes(t)));

const plainArtikel = (xml) =>
  xml
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Improved artikel text extraction to handle varied XML structures
 */
const extractArtikelTexts = (srcXML) => {
  // First, try the standard artikel tag approach
  const artikelMatches = [
    ...srcXML.matchAll(/<artikel>([\s\S]*?)<\/artikel>/gi),
  ];

  if (artikelMatches.length > 0) {
    const results = artikelMatches.map((m) => plainArtikel(m[1]));
    // CHECK FOR EMPTY ARTIKEL CONTENT
    if (results.every((text) => !text.trim())) {
      throw new Error(
        "Source XML contains <artikel> tags but they are all empty. Please provide artikel content to compare."
      );
    }
    return results;
  }

  // If no artikel tags found, try to parse the whole thing as one text
  // This is a fallback for cases where the source doesn't use artikel tags
  try {
    // Remove any XML-like tags and just use the text content
    const result = plainArtikel(srcXML);
    // CHECK FOR EMPTY SOURCE CONTENT
    if (!result.trim()) {
      throw new Error(
        "Source XML appears to be empty or contains no meaningful text content."
      );
    }
    return [result];
  } catch (error) {
    console.error("Error extracting text from source XML:", error);
    throw new Error(`Source XML processing failed: ${error.message}`);
  }
};

/**
 * Extract entries from generated XML - Works with or without a root element
 * @param {string} genXML - The generated XML to parse
 * @returns {Array} - Array of entry objects
 */
const extractEntries = (genXML) => {
  try {
    const parser = new DOMParser();

    // First, try to parse as is
    let doc = parser.parseFromString(genXML, "text/xml");

    // Check if parsing failed or returned an error document
    const parseError = doc.querySelector("parsererror");
    if (parseError) {
      // If there's an error, try wrapping the XML in a root element
      const wrappedXML = `<root>${genXML}</root>`;
      doc = parser.parseFromString(wrappedXML, "text/xml");

      // If still error, throw specific error
      if (doc.querySelector("parsererror")) {
        console.error("Error parsing XML even with wrapper");
        throw new Error(
          "Generated XML is not well-formed or contains syntax errors"
        );
      }
    }

    // Get all entry elements, regardless of parent
    const entries = [...doc.getElementsByTagName("entry")];

    // CHECK FOR NO ENTRY ELEMENTS
    if (entries.length === 0) {
      throw new Error(
        "No <entry> elements found in Generated XML. Please ensure your XML contains properly structured dictionary entries."
      );
    }

    return entries.map((e) => {
      const lemmaEl = e.getElementsByTagName("lemma")[0];
      const lemma = lemmaEl ? lemmaEl.textContent : "—";
      return {
        id: e.getAttribute("id") || lemma,
        lemma,
        entryNode: e,
        text: e.textContent.replace(/\s+/g, " ").trim(),
      };
    });
  } catch (error) {
    console.error("Error parsing XML:", error);
    throw new Error(`XML parsing failed: ${error.message}`);
  }
};

/* ---------- Place data handling ---------- */
let placesData = null;

export const loadPlacesData = async () => {
  if (placesData !== null) return placesData;

  try {
    const response = await fetch("./data/places.csv");
    const csvText = await response.text();

    placesData = {};

    // Skip header row and parse CSV
    const rows = csvText.split("\n").slice(1);
    for (const row of rows) {
      if (!row.trim()) continue;

      // Adjust to use semicolons and match the correct column format
      const [lfd, shortName, fullName, latitude, longitude] = row
        .split(";")
        .map((field) => field.trim());
      if (lfd) {
        const lfdKey = `lfd_${lfd}`;
        placesData[lfdKey] = {
          shortName, // Kurzform from column 2
          name: fullName, // Using the Ortsname_BadWB column
          latitude,
          longitude,
        };
      }
    }

    return placesData;
  } catch (error) {
    console.error("Error loading places data:", error);
    return {};
  }
};

export const resolvePlaceId = (text) => {
  if (!placesData) return text;

  // Look for pattern: placename (lfd_XXXX)
  // Modified regex to allow periods, commas, and other punctuation in place names
  return text.replace(
    /([\w\.\-]+)\s*\(lfd_(\d+)\)/g,
    (match, placeName, lfdId) => {
      const lfdKey = `lfd_${lfdId}`;
      const placeInfo = placesData[lfdKey];

      if (placeInfo) {
        // Check first letter mismatch: compare XML abbreviation with CSV short form
        const xmlFirstLetter = placeName.charAt(0).toLowerCase();
        const csvFirstLetter = placeInfo.shortName.charAt(0).toLowerCase();
        const isMismatch = xmlFirstLetter !== csvFirstLetter;

        // Include short form in result for better mismatch reporting
        const baseResult = `${placeName} (${lfdKey};${placeInfo.shortName};${placeInfo.name};${placeInfo.latitude};${placeInfo.longitude})`;

        // Add mismatch flag if needed
        if (isMismatch) {
          return `${baseResult}[MISMATCH]`;
        }

        return baseResult;
      }

      return match; // Return original if not found
    }
  );
};

/* ---------- Schema Validation ---------- */
let xmllint = null;
let schemaContent = null;

/**
 * Initialize xmllint-wasm and load the RNG schema
 */
export const initSchemaValidation = async () => {
  try {
    // Load xmllint-wasm
    xmllint = await import("../libs/xmllint/index-browser.mjs");
    console.log("xmllint-wasm initialized successfully");

    // Load the RNG schema file
    const schemaResponse = await fetch("./schema/artikel-corpus.schema.rng"); // Adjust path as needed
    schemaContent = await schemaResponse.text();
    console.log("RNG schema loaded successfully");

    return true;
  } catch (error) {
    console.error("Error initializing schema validation:", error);
    return false;
  }
};

/**
 * Validate XML against the loaded RNG schema
 * @param {string} xmlContent - The XML content to validate
 * @returns {Object} - Validation result with isValid and errors
 */
export const validateAgainstSchema = async (xmlContent) => {
  if (!xmllint || !schemaContent) {
    return {
      isValid: false,
      errors: [
        "Schema validation not initialized. Please wait for initialization to complete.",
      ],
      initialized: false,
    };
  }

  try {
    // Clean and prepare the XML
    const cleanXML = xmlContent.trim();

    if (!cleanXML) {
      return {
        isValid: false,
        errors: ["Empty XML content provided"],
        initialized: true,
      };
    }

    // Validate against RNG schema using xmllint-wasm
    const result = await xmllint.validateXML({
      xml: [{ fileName: "doc.xml", contents: cleanXML }],
      schema: [{ fileName: "schema.rng", contents: schemaContent }],
      extension: "relaxng", // tell xmllint it’s Relax NG
    });
    // --- START OF NEW CODE ---
    // WORKAROUND: Handle cases where the library reports invalid but provides no parsed errors.
    // This happens when the stderr output is too short for its internal parser.
    if (!result.valid && result.errors.length === 0 && result.rawOutput) {
      const rawErrorLines = result.rawOutput
        .split("\n")
        .filter((line) => line.trim() !== "");

      // Manually re-create the structure that our parseValidationErrors function expects
      result.errors = rawErrorLines.map((line) => {
        const parts = line.split(":");
        let loc = null;
        // Check if we can parse a line number (e.g., from "doc.xml:2: ...")
        if (parts.length >= 2) {
          const lineNumber = parseInt(parts[1], 10);
          if (!isNaN(lineNumber)) {
            loc = { lineNumber };
          }
        }

        return {
          rawMessage: line,
          message: line, // a bit redundant, but safe
          loc: loc,
        };
      });
    }
    // --- END OF NEW CODE ---
    return {
      isValid: result.valid,
      // The `result.errors` from the library is already an array of objects.
      // Just pass it through, or use an empty array as a safe default.
      errors: result.errors || [],
      initialized: true,
      rawResult: result,
    };
  } catch (error) {
    console.error("Schema validation error:", error);
    return {
      isValid: false,
      errors: [`Validation error: ${error.message}`],
      initialized: true,
    };
  }
};

/**
 * Transforms validation errors from xmllint-wasm into the format required by the UI.
 * @param {Array<Object>} errors - Array of error objects from xmllint.
 * @returns {Array<Object>} - Parsed error objects with line, column, and message for the view.
 */
export const parseValidationErrors = (errors) => {
  // `errors` is an array of objects from the library, not strings.
  if (!Array.isArray(errors)) return [];

  return errors.map((errorObj) => {
    // `errorObj` from the library looks like:
    // { rawMessage: '...', message: '...', loc: { lineNumber: 123 } }

    const line = errorObj.loc ? errorObj.loc.lineNumber : null;

    // The library doesn't parse the column, so we'll leave it null for now.
    const column = null;

    // The rawMessage is the most informative, as it includes the context.
    const message = errorObj.rawMessage || "An unknown error occurred.";

    return {
      line: line,
      column: column,
      message: message,
      severity: message.toLowerCase().includes("error") ? "error" : "warning",
    };
  });
};

/* ---------- core comparison ---------- */
export const compareCorpus = async (srcXML, genXML) => {
  // <--- Added async
  const artikelArr = extractArtikelTexts(srcXML);
  const entryArr = extractEntries(genXML);
  const pairs = Math.min(artikelArr.length, entryArr.length);

  // Perform schema validation on generated XML
  const schemaValidation = await validateAgainstSchema(genXML);

  const report = [];
  for (let i = 0; i < pairs; i++) {
    const srcToks = tokenise(artikelArr[i]);
    const tgtToks = tokenise(entryArr[i].text);

    const srcCount = countMap(srcToks);
    const tgtCount = countMap(tgtToks);

    const missing = [],
      extra = [];
    let missingTotal = 0,
      extraTotal = 0;

    for (const [tok, c] of Object.entries(srcCount)) {
      const diff = c - (tgtCount[tok] || 0);
      if (diff > 0) {
        missing.push(`${tok} (${diff})`);
        missingTotal += diff;
      }
    }
    for (const [tok, c] of Object.entries(tgtCount)) {
      const diff = c - (srcCount[tok] || 0);
      if (diff > 0) {
        extra.push(`${tok} (${diff})`);
        extraTotal += diff;
      }
    }

    const perc = srcToks.length
      ? (((srcToks.length - missingTotal) / srcToks.length) * 100).toFixed(1)
      : 100;

    report.push({
      index: i,
      id: entryArr[i].id,
      lemma: entryArr[i].lemma,
      entryNode: entryArr[i].entryNode,
      stats: {
        total: srcToks.length,
        missing,
        extra,
        missingTotal,
        extraTotal,
        perc,
        pass: missingTotal === 0,
      },
    });
  }

  // Add schema validation results to the report
  return {
    entries: report,
    schemaValidation: {
      isValid: schemaValidation.isValid,
      errors: parseValidationErrors(schemaValidation.errors),
      initialized: schemaValidation.initialized,
    },
  };
};

const countMap = (arr) => {
  const m = {};
  arr.forEach((t) => (m[t] = (m[t] || 0) + 1));
  return m;
};
