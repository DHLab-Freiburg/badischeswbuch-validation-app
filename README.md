# Badisches Wörterbuch XML Validation Tool

A web-based validation tool for checking XML transformations (described here: https://github.com/DHLab-Freiburg/badischeswbuch) of entries from the Badisches Wörterbuch.

## About

This tool helps editors and contributors verify that dictionary entries are properly converted between different XML formats while preserving the original content. It provides visual feedback and statistics on content preservation.

## Features

- Compare source XML with generated XML
- Visualize dictionary entries with proper formatting
- Calculate content preservation statistics
- Highlight missing or extra tokens
- Interactive place references with geographical data
- XML syntax highlighting with CodeMirror
- Copy functionality for XML content

## Checks (branch `pruefung-erweitert`, October 2026)

`js/pruefung.js` checks a result against its source. It follows the same rules as the checking tool of the new editorial system (`neuaufbau/anwendung/bin/transformation_pruefen.php`, plan in `neuaufbau/transformation/PLAN.md`) and needs no server.

- **Pairing by lemma**, not by position. Missing and surplus entries are reported, and swapped upper/lower case pairs (Ähren/ähren) are recognised.
- **Text, character by character** (Unicode-normalised). Each difference is classified:
  - sense number only in `n`; dash, punctuation, quotation or elision mark changed; superscript written as a special character – **can be repaired automatically**;
  - text moved (allowed by the schema, no word lost) – **allowed**;
  - text missing or added – **to check**.
- **Places:**
  - variant numbers, i.e. a second number for a known place (e.g. `lfd_1777` → `lfd_1113`);
  - text that is the short form of another place (e.g. *Hettgn* tagged as Häusern);
  - regions tagged as places (should be `type="region"`);
  - unknown numbers.
- **Sources:** the title must be exactly the one in the source list; otherwise the short title is looked up.
- **Cross-references and IDs:** checked against the ID register, which assigns each ID once and never changes it; duplicates are reported.
- **Source:** the plain delivery XML, or the enriched XML of the editorial system (`Lfg_<n>_transformation.xml`). With the enriched XML, places, sources and references are also compared position by position with what the editorial system knows.

Every entry gets a verdict: *in order*, *can be repaired automatically*, *check places, sources, references*, *check text or lemma*. The summary filters by verdict or finding; all findings can be saved as CSV. The schema check runs after the results are shown, because it takes minutes for a whole delivery.

`js/entry-view.js` renders the entry in document order, including nested senses (`subsenses/sense`), terminators and the markup in grammar. Places, sources and references with a finding are marked in the text.

### Data files (`data/`)

Snapshots with a date in `data/stand.json`. Do not edit them by hand.

| File | Content | Maintained in |
|---|---|---|
| `places.csv` | lfd;Kurzform;Ortsname_BadWB;Lat;Lon | `ABBR_places.md` plus places of the editorial system that are not in it yet (`neuaufbau/transformation/ABBR_places_ergaenzung.md`, `app_daten.php`) |
| `sources.csv` | Kurztitel;Titel | source list of the editorial system (`neuaufbau/anwendung/bin/app_daten.php`) |
| `regions.csv` | Abkürzung;Langform | `ABBR_geo_regions.md` plus the editors' supplement (`neuaufbau/transformation/ABBR_geo_regions_ergaenzung.md`, `app_daten.php`) |
| `ids.csv` | ID;Stichwort;Homonym;Lieferung | ID register (`neuaufbau/anwendung/bin/id_register.php`, then `app_daten.php`) |

`tests/pruefung.html?source=…&result=…` runs the checks without the user interface and prints the summary as JSON.

## How to Use

1. Open or paste the source XML (left) – the delivery XML or the enriched XML
2. Open or paste the generated XML (right)
3. Click "Validate Transformation"
4. Review the results:
   - The sidebar shows all entries with their preservation percentages
   - The main panel displays the formatted entry and statistics
   - Red pills indicate missing tokens from the source
   - Yellow pills indicate extra tokens in the generated XML
   - Click on any place reference to highlight it in the XML

## Live

Visit the live site: [https://dhlab-freiburg.github.io/badischeswbuch-validation-app/](https://dhlab-freiburg.github.io/badischeswbuch-validation-app/)

## Technical Details

The application runs entirely in the browser with no server-side dependencies. It uses:

- Vanilla JavaScript (ES6+)
- CodeMirror for XML syntax highlighting
- DOM Parser for XML parsing and manipulation
- CSV data for geographical place references

## Local Development

To run this application locally:

1. Clone the repository:
   ```
   git clone https://github.com/DHLab-Freiburg/badischeswbuch-validation-app.git
   ```

## License

[MIT License](LICENSE)

## Authors

Digital Humanities Craft | dhcraft.org
