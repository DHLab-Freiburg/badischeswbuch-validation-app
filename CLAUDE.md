# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A client-side web application for validating XML transformations of dictionary entries from the Badisches Wörterbuch. The tool compares source XML (`<artikel>` format) against generated XML (`<entry>` format) to verify content preservation and schema compliance.

Live site: https://dhlab-freiburg.github.io/badischeswbuch-validation-app/

## Technology Stack

- **Pure client-side JavaScript (ES6+ modules)** - No build system, no server
- **CodeMirror 5** - XML syntax highlighting and editing
- **xmllint-wasm** - RelaxNG schema validation via WebAssembly
- **DOM Parser** - Native XML parsing and manipulation

## Architecture

The application follows a clean separation of concerns across three main modules:

### Core Modules

1. **[js/main.js](js/main.js)** - Application orchestration and event coordination
   - Initializes the application (loads places data, schema validation)
   - Wires up UI event handlers
   - Coordinates between data processing and view rendering
   - Handles async initialization with `Promise.allSettled`

2. **[js/data.js](js/data.js)** - Data processing and business logic
   - `compareCorpus()` - Main comparison engine that tokenizes and compares XML
   - `extractArtikelTexts()` - Parses source `<artikel>` XML
   - `extractEntries()` - Parses generated `<entry>` XML elements
   - `loadPlacesData()` - Loads CSV geographic data for place references
   - `resolvePlaceId()` - Expands place keys to full geographic information
   - `initSchemaValidation()` - Loads xmllint-wasm and RelaxNG schema
   - `validateAgainstSchema()` - Validates XML against [schema/artikel-corpus.schema.rng](schema/artikel-corpus.schema.rng)
   - Token-based comparison: filters punctuation, case-insensitive, min 2 chars (or single vowels)

3. **[js/view.js](js/view.js)** - DOM manipulation and rendering
   - `renderSidebar()` - Entry list with preservation percentages
   - `renderPreview()` - Dictionary entry formatting (lemma, pronunciations, senses, etc.)
   - `renderStats()` - Token statistics and difference pills
   - `renderSchemaValidation()` - Schema validation results and errors
   - CodeMirror editor management
   - Interactive features: clickable place references, token pills that jump to source

## Key Features

### Content Preservation Validation
- Tokenizes both source and generated XML (removing markup)
- Compares token counts to detect missing/extra content
- Calculates preservation percentage per entry
- Red pills = missing tokens (click to jump to source)
- Yellow pills = extra tokens (click to jump to generated)

### Schema Validation
- Uses RelaxNG schema ([schema/artikel-corpus.schema.rng](schema/artikel-corpus.schema.rng))
- Validates generated XML structure on-the-fly
- Shows line/column numbers for errors (clickable to jump to location)
- Note: There's a workaround in [js/data.js](js/data.js):244-270 for xmllint-wasm errors with short stderr

### Geographic Place References
- CSV data ([data/places.csv](data/places.csv)): `lfd;Ortsname_kurz;Ortsname_BadWB;Latitude;Longitude`
- Place tags like `<place key="lfd_375">Etthm</place>` are expanded with coordinates
- First-letter mismatch detection: Warns if abbreviated name doesn't match full name
- Clickable place references jump to corresponding XML location

## XML Format

**Source format:**
```xml
<artikel>Plain text content of dictionary entry</artikel>
```

**Generated format:**
```xml
<badisches-corpus>
  <entry id="lemma-id">
    <lemma>headword</lemma>
    <grammar>grammatical info</grammar>
    <markers><marker type="type">value</marker></markers>
    <pronunciations>
      <variant>
        <phon>pronunciation</phon>
        <geo><place key="lfd_123">Abbr</place></geo>
        <terminator>;</terminator>
      </variant>
    </pronunciations>
    <senses>
      <sense>
        <def>definition with <term type="dialect">inline terms</term></def>
        <examples><example>usage example</example></examples>
        <subsenses><subsense><def>sub-definition</def></subsense></subsenses>
      </sense>
    </senses>
    <etymology>word origin</etymology>
    <references><ref target="id">cross-reference</ref></references>
    <bibliography><bibl key="source">citation</bibl></bibliography>
    <problem severity="warning">editorial note</problem>
  </entry>
</badisches-corpus>
```

## Local Development

Simply open [index.html](index.html) in a browser. No build step required.

For live reloading during development, use any static file server:
```bash
python -m http.server 8000
# or
npx serve
```

## Code Conventions

- ES6 module imports/exports
- Async/await for all async operations
- Descriptive function names (e.g., `extractArtikelTexts`, `processGeoContent`)
- Pure functions where possible (data.js has no DOM dependencies)
- View layer only manipulates DOM, never processes data
- Error messages provide actionable guidance to users

## Related Resources

- Main project (transformation code): https://github.com/DHLab-Freiburg/badischeswbuch
- Digital Humanities Craft: https://dhcraft.org
