
import * as vscode from 'vscode';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
    console.log('SpecSync extension is now active!');

    // Register commands
    let showSpec = vscode.commands.registerCommand('specsync.showSpec', () => {
        showSpecification();
    });

    let editSpec = vscode.commands.registerCommand('specsync.editSpec', () => {
        editSpecification();
    });

    let runProof = vscode.commands.registerCommand('specsync.runProof', () => {
        runLeanProof();
    });

    context.subscriptions.push(showSpec, editSpec, runProof);

    // Register hover provider
    const hoverProvider = vscode.languages.registerHoverProvider(
        ['javascript', 'typescript', 'python', 'java'],
        {
            provideHover(document, position, token) {
                return provideSpecHover(document, position);
            }
        }
    );

    context.subscriptions.push(hoverProvider);
}

export function deactivate() {}

async function showSpecification() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showInformationMessage('No active editor');
        return;
    }

    const position = editor.selection.active;
    const functionName = getFunctionAtPosition(editor.document, position);
    
    if (!functionName) {
        vscode.window.showInformationMessage('No function found at cursor position');
        return;
    }

    try {
        const config = vscode.workspace.getConfiguration('specsync');
        const apiUrl = config.get('apiUrl', 'http://localhost:3000');
        
        const response = await fetch(`${apiUrl}/api/spec/${functionName}`);
        const spec = await response.json();
        
        if (spec.success) {
            showSpecPanel(spec.data);
        } else {
            vscode.window.showInformationMessage('No specification found for this function');
        }
    } catch (error) {
        vscode.window.showErrorMessage('Failed to fetch specification');
    }
}

async function editSpecification() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showInformationMessage('No active editor');
        return;
    }

    const position = editor.selection.active;
    const functionName = getFunctionAtPosition(editor.document, position);
    
    if (!functionName) {
        vscode.window.showInformationMessage('No function found at cursor position');
        return;
    }

    // Open spec editing panel
    const panel = vscode.window.createWebviewPanel(
        'specEdit',
        'Edit Specification',
        vscode.ViewColumn.One,
        {
            enableScripts: true
        }
    );

    panel.webview.html = generateSpecEditHTML(functionName);
}

async function runLeanProof() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showInformationMessage('No active editor');
        return;
    }

    const position = editor.selection.active;
    const functionName = getFunctionAtPosition(editor.document, position);
    
    if (!functionName) {
        vscode.window.showInformationMessage('No function found at cursor position');
        return;
    }

    // Run Lean4 proof
    const terminal = vscode.window.createTerminal('SpecSync Proof');
    terminal.show();
    terminal.sendText(`lean --json specs/${functionName}_spec.lean`);
}

function getFunctionAtPosition(document: vscode.TextDocument, position: vscode.Position): string | null {
    const line = document.lineAt(position.line);
    const text = line.text;
    
    // Simple function detection
    const functionPatterns = [
        /function\s+(\w+)\s*\(/,
        /const\s+(\w+)\s*=\s*\(/,
        /def\s+(\w+)\s*\(/,
        /public\s+\w+\s+(\w+)\s*\(/
    ];
    
    for (const pattern of functionPatterns) {
        const match = text.match(pattern);
        if (match) {
            return match[1];
        }
    }
    
    return null;
}

function provideSpecHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | null {
    const functionName = getFunctionAtPosition(document, position);
    
    if (!functionName) {
        return null;
    }
    
    const config = vscode.workspace.getConfiguration('specsync');
    const autoShow = config.get('autoShowSpec', true);
    
    if (!autoShow) {
        return null;
    }
    
    // Return hover with spec info
    return new vscode.Hover([
        '**SpecSync Specification**',
        `Function: ${functionName}`,
        'Click to view full specification'
    ]);
}

function showSpecPanel(spec: any) {
    const panel = vscode.window.createWebviewPanel(
        'specView',
        'Specification',
        vscode.ViewColumn.One,
        {
            enableScripts: true
        }
    );

    panel.webview.html = generateSpecViewHTML(spec);
}

function generateSpecViewHTML(spec: any): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Specification</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 20px; }
        .spec-section { margin: 20px 0; }
        .spec-title { font-weight: bold; color: #333; }
        .spec-content { margin: 10px 0; padding: 10px; background: #f5f5f5; border-radius: 4px; }
        .confidence { color: #666; font-size: 0.9em; }
    </style>
</head>
<body>
    <h2>Specification for ${spec.functionName}</h2>
    <div class="confidence">Confidence: ${spec.confidence}%</div>
    
    <div class="spec-section">
        <div class="spec-title">Preconditions:</div>
        <div class="spec-content">
            ${spec.preconditions.map(p => `<div>• ${p}</div>`).join('')}
        </div>
    </div>
    
    <div class="spec-section">
        <div class="spec-title">Postconditions:</div>
        <div class="spec-content">
            ${spec.postconditions.map(p => `<div>• ${p}</div>`).join('')}
        </div>
    </div>
    
    <div class="spec-section">
        <div class="spec-title">Invariants:</div>
        <div class="spec-content">
            ${spec.invariants.map(i => `<div>• ${i}</div>`).join('')}
        </div>
    </div>
    
    <div class="spec-section">
        <div class="spec-title">Edge Cases:</div>
        <div class="spec-content">
            ${spec.edgeCases.map(e => `<div>• ${e}</div>`).join('')}
        </div>
    </div>
</body>
</html>
`;
}

function generateSpecEditHTML(functionName: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Edit Specification</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 20px; }
        .form-group { margin: 20px 0; }
        label { display: block; font-weight: bold; margin-bottom: 5px; }
        textarea { width: 100%; height: 100px; padding: 10px; border: 1px solid #ccc; border-radius: 4px; }
        button { padding: 10px 20px; background: #007acc; color: white; border: none; border-radius: 4px; cursor: pointer; }
        button:hover { background: #005a9e; }
    </style>
</head>
<body>
    <h2>Edit Specification for ${functionName}</h2>
    
    <form id="specForm">
        <div class="form-group">
            <label for="preconditions">Preconditions (one per line):</label>
            <textarea id="preconditions" name="preconditions"></textarea>
        </div>
        
        <div class="form-group">
            <label for="postconditions">Postconditions (one per line):</label>
            <textarea id="postconditions" name="postconditions"></textarea>
        </div>
        
        <div class="form-group">
            <label for="invariants">Invariants (one per line):</label>
            <textarea id="invariants" name="invariants"></textarea>
        </div>
        
        <div class="form-group">
            <label for="edgeCases">Edge Cases (one per line):</label>
            <textarea id="edgeCases" name="edgeCases"></textarea>
        </div>
        
        <button type="submit">Save Specification</button>
    </form>
    
    <script>
        document.getElementById('specForm').addEventListener('submit', function(e) {
            e.preventDefault();
            
            const formData = {
                functionName: '${functionName}',
                preconditions: document.getElementById('preconditions').value.split('\n').filter(line => line.trim()),
                postconditions: document.getElementById('postconditions').value.split('\n').filter(line => line.trim()),
                invariants: document.getElementById('invariants').value.split('\n').filter(line => line.trim()),
                edgeCases: document.getElementById('edgeCases').value.split('\n').filter(line => line.trim())
            };
            
            // Send to SpecSync API
            fetch('/api/spec', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            }).then(response => {
                if (response.ok) {
                    vscode.postMessage({ command: 'specSaved' });
                }
            });
        });
    </script>
</body>
</html>
`;
}
