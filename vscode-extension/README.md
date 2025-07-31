# SpecSync VSCode Extension

This extension provides integration with SpecSync for formal specification management in VSCode.

## Features

- **Inline Specification Display**: Hover over functions to see their specifications
- **Specification Editing**: Edit preconditions, postconditions, invariants, and edge cases
- **Lean4 Proof Execution**: Run Lean4 proofs directly from VSCode
- **Real-time Updates**: Specifications update automatically when changed

## Commands

- `SpecSync: Show Specification` - Display specification for the function at cursor
- `SpecSync: Edit Specification` - Open specification editor
- `SpecSync: Run Lean4 Proof` - Execute Lean4 proof for current function

## Configuration

- `specsync.apiUrl` - SpecSync API URL (default: http://localhost:3000)
- `specsync.autoShowSpec` - Automatically show specifications on hover (default: true)

## Installation

1. Build the extension: `npm run compile`
2. Package the extension: `vsce package`
3. Install the .vsix file in VSCode

## Development

```bash
npm install
npm run compile
npm run watch
```

## Usage

1. Open a JavaScript/TypeScript/Python/Java file
2. Hover over a function to see its specification
3. Use commands to edit specifications or run proofs
4. Specifications are automatically synced with SpecSync API
