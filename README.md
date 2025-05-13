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

## How to Use

1. Enter the source XML in the left textarea
2. Enter the generated XML in the right textarea
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
