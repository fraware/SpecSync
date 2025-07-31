# SpecSync VSCode Extension

A comprehensive VSCode extension for SpecSync that provides inline specification annotations, real-time suggestions, and local proof execution.

## Features

### SpecLens Inline Annotations
- Display verified invariants above each function
- Click to view full specification details
- Edit specifications inline

### Real-time Suggestion Panel
- Get spec suggestions as you type
- Add suggestions with one click
- Confidence scoring for each suggestion

### Lean Proof Runner
- Execute Lean proofs locally
- Progress tracking with detailed output
- Generate proof artifacts and reports

## Installation

1. Install the extension from the VSCode marketplace
2. Configure your Lean path in settings
3. Open a project with specifications

## Usage

### Viewing Specifications
- Hover over functions to see their specifications
- Click on spec annotations to view details
- Use the command palette: "SpecSync: Show Specification"

### Adding Suggestions
- Type code and watch for suggestions in the sidebar
- Click on suggestions to add them to your function
- Suggestions appear based on code patterns

### Running Proofs
- Use command palette: "SpecSync: Run Lean Proof"
- View progress and results in the output panel
- Proof artifacts are saved to `.specsync/artifacts`

## Configuration

```json
{
  "specsync.specCachePath": ".specsync/spec.json",
  "specsync.leanPath": "lean"
}
```

## Development

```bash
npm install
npm run compile
npm run watch
```

## License

MIT License
