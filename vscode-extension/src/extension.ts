import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
  const specLensProvider = new SpecLensProvider();
  const specHoverProvider = new SpecHoverProvider();
  
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { scheme: 'file', language: 'javascript' },
      specLensProvider
    ),
    vscode.languages.registerCodeLensProvider(
      { scheme: 'file', language: 'typescript' },
      specLensProvider
    ),
    vscode.languages.registerHoverProvider(
      { scheme: 'file', language: 'javascript' },
      specHoverProvider
    ),
    vscode.languages.registerHoverProvider(
      { scheme: 'file', language: 'typescript' },
      specHoverProvider
    )
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('specsync.showSpec', showSpecification),
    vscode.commands.registerCommand('specsync.editSpec', editSpecification),
    vscode.commands.registerCommand('specsync.runProof', runLeanProof)
  );
}

class SpecLensProvider implements vscode.CodeLensProvider {
  async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];
    const functions = this.findFunctions(document);
    
    for (const func of functions) {
      const spec = await this.getSpecForFunction(func.name, document.fileName);
      if (spec) {
        const range = new vscode.Range(func.line, 0, func.line, 0);
        
        // Confidence transparency (Prompt 5.2)
        const confidenceEmoji = spec.confidence >= 0.8 ? '🟢' : spec.confidence >= 0.6 ? '🟡' : '🔴';
        const confidenceText = spec.confidence >= 0.8 ? 'High' : spec.confidence >= 0.6 ? 'Medium' : 'Low';
        
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: `🔍 Spec: [${spec.invariants[0] || 'No invariant'}] ${confidenceEmoji} ${confidenceText}`,
            command: 'specsync.showSpec',
            arguments: [func.name, spec]
          })
        );
      }
    }
    
    return codeLenses;
  }

  private findFunctions(document: vscode.TextDocument): Array<{name: string, line: number}> {
    const functions: Array<{name: string, line: number}> = [];
    const text = document.getText();
    const lines = text.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const functionMatch = line.match(/function\s+(\w+)\s*\(/);
      if (functionMatch) {
        functions.push({
          name: functionMatch[1],
          line: i
        });
      }
    }
    
    return functions;
  }

  private async getSpecForFunction(functionName: string, filePath: string): Promise<any> {
    const config = vscode.workspace.getConfiguration('specsync');
    const cachePath = config.get('specCachePath', '.specsync/spec.json');
    const confidenceThreshold = config.get('confidenceThreshold', 0.7);
    
    try {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
      if (!workspaceFolder) return null;
      
      const fullCachePath = path.join(workspaceFolder.uri.fsPath, cachePath);
      if (!fs.existsSync(fullCachePath)) return null;
      
      const cacheContent = fs.readFileSync(fullCachePath, 'utf8');
      const cache = JSON.parse(cacheContent);
      
      const key = `${workspaceFolder.name}:${functionName}`;
      const spec = cache[key] || null;
      
      // Filter by confidence threshold
      if (spec && spec.confidence < confidenceThreshold) {
        return null;
      }
      
      return spec;
    } catch (error) {
      console.error('Error reading spec cache:', error);
      return null;
    }
  }
}

class SpecHoverProvider implements vscode.HoverProvider {
  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.Hover> {
    const functionName = this.getFunctionAtPosition(document, position);
    if (!functionName) return null;
    
    return this.getSpecHover(functionName, document.fileName);
  }

  private getFunctionAtPosition(document: vscode.TextDocument, position: vscode.Position): string | null {
    const line = document.lineAt(position.line);
    const functionMatch = line.text.match(/function\s+(\w+)\s*\(/);
    return functionMatch ? functionMatch[1] : null;
  }

  private async getSpecHover(functionName: string, filePath: string): Promise<vscode.Hover> {
    const spec = await this.getSpecForFunction(functionName, filePath);
    if (!spec) return null;
    
    const content = new vscode.MarkdownString();
    
    // Confidence transparency (Prompt 5.2)
    const confidenceEmoji = spec.confidence >= 0.8 ? '🟢' : spec.confidence >= 0.6 ? '🟡' : '🔴';
    const confidenceText = spec.confidence >= 0.8 ? 'High' : spec.confidence >= 0.6 ? 'Medium' : 'Low';
    
    content.appendMarkdown(`## Specification for `${functionName}```);
    content.appendMarkdown(`\n\n**Confidence:** ${confidenceEmoji} ${confidenceText} (${Math.round(spec.confidence * 100)}%)``);
    
    if (spec.preconditions.length > 0) {
      content.appendMarkdown(`\n\n### Preconditions\n`);
      spec.preconditions.forEach(pre => {
        content.appendMarkdown(`- ${pre}\n`);
      });
    }
    
    if (spec.postconditions.length > 0) {
      content.appendMarkdown(`\n\n### Postconditions\n`);
      spec.postconditions.forEach(post => {
        content.appendMarkdown(`- ${post}\n`);
      });
    }
    
    if (spec.invariants.length > 0) {
      content.appendMarkdown(`\n\n### Invariants\n`);
      spec.invariants.forEach(inv => {
        content.appendMarkdown(`- ${inv}\n`);
      });
    }
    
    // Add reasoning if available
    if (spec.reasoning) {
      content.appendMarkdown(`\n\n### Reasoning\n`);
      content.appendMarkdown(`${spec.reasoning}\n`);
    }
    
    return new vscode.Hover(content);
  }

  private async getSpecForFunction(functionName: string, filePath: string): Promise<any> {
    // Same implementation as SpecLensProvider
    const config = vscode.workspace.getConfiguration('specsync');
    const cachePath = config.get('specCachePath', '.specsync/spec.json');
    const confidenceThreshold = config.get('confidenceThreshold', 0.7);
    
    try {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
      if (!workspaceFolder) return null;
      
      const fullCachePath = path.join(workspaceFolder.uri.fsPath, cachePath);
      if (!fs.existsSync(fullCachePath)) return null;
      
      const cacheContent = fs.readFileSync(fullCachePath, 'utf8');
      const cache = JSON.parse(cacheContent);
      
      const key = `${workspaceFolder.name}:${functionName}`;
      const spec = cache[key] || null;
      
      // Filter by confidence threshold
      if (spec && spec.confidence < confidenceThreshold) {
        return null;
      }
      
      return spec;
    } catch (error) {
      console.error('Error reading spec cache:', error);
      return null;
    }
  }
}

async function showSpecification(functionName: string, spec: any) {
  const panel = vscode.window.createWebviewPanel(
    'specSyncSpec',
    `Specification: ${functionName}`,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );
  
  panel.webview.html = generateSpecViewHTML(spec);
}

async function editSpecification(functionName: string) {
  const spec = await getSpecForFunction(functionName);
  if (!spec) {
    vscode.window.showErrorMessage(`No specification found for ${functionName}`);
    return;
  }
  
  const panel = vscode.window.createWebviewPanel(
    'specSyncEdit',
    `Edit Specification: ${functionName}`,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );
  
  panel.webview.html = generateSpecEditHTML(functionName, spec);
}

async function runLeanProof() {
  const config = vscode.workspace.getConfiguration('specsync');
  const leanPath = config.get('leanPath', 'lean');
  
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder found');
    return;
  }
  
  const specsDir = path.join(workspaceFolder.uri.fsPath, 'specs');
  if (!fs.existsSync(specsDir)) {
    vscode.window.showErrorMessage('No specs directory found');
    return;
  }
  
  const progressOptions = {
    location: vscode.ProgressLocation.Notification,
    title: 'Running Lean Proofs',
    cancellable: true
  };
  
  await vscode.window.withProgress(progressOptions, async (progress, token) => {
    try {
      progress.report({ message: 'Initializing Lean environment...' });
      
      let successCount = 0;
      let totalCount = 0;
      const results: any[] = [];
      
      const leanFiles = fs.readdirSync(specsDir).filter(f => f.endsWith('.lean'));
      totalCount = leanFiles.length;
      
      for (const file of leanFiles) {
        if (token.isCancellationRequested) {
          vscode.window.showInformationMessage('Proof execution cancelled');
          break;
        }
        
        const filePath = path.join(specsDir, file);
        progress.report({ 
          message: `Processing ${file}...`,
          increment: 100 / totalCount
        });
        
        try {
          const result = await executeLeanFile(leanPath, filePath);
          results.push({ file, success: result.success, output: result.output });
          
          if (result.success) {
            successCount++;
          }
        } catch (error) {
          results.push({ file, success: false, error: error.message });
        }
      }
      
      const coverage = Math.round((successCount / totalCount) * 100);
      
      // Show results with confidence transparency
      const message = `Proof validation complete: ${successCount}/${totalCount} successful (${coverage}% coverage)`;
      
      if (coverage >= 70) {
        vscode.window.showInformationMessage(message);
      } else {
        vscode.window.showWarningMessage(message + ' - Below threshold');
      }
      
      // Generate artifacts
      await generateProofArtifacts(results, workspaceFolder.uri.fsPath);
      
    } catch (error) {
      vscode.window.showErrorMessage(`Proof execution failed: ${error.message}`);
    }
  });
}

function executeLeanFile(leanPath: string, filePath: string): Promise<{success: boolean, output: string}> {
  return new Promise((resolve, reject) => {
    const { exec } = require('child_process');
    exec(`${leanPath} --json "${filePath}"`, { timeout: 30000 }, (error: any, stdout: string, stderr: string) => {
      if (error) {
        resolve({ success: false, output: stderr });
      } else {
        resolve({ success: true, output: stdout });
      }
    });
  });
}

async function generateProofArtifacts(results: any[], workspacePath: string) {
  const artifactsDir = path.join(workspacePath, '.specsync', 'artifacts');
  
  // Ensure artifacts directory exists
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(artifactsDir, `proof-report-${timestamp}.json`);
  
  const report = {
    timestamp: new Date().toISOString(),
    totalFiles: results.length,
    successfulProofs: results.filter(r => r.success).length,
    failedProofs: results.filter(r => !r.success).length,
    coverage: Math.round((results.filter(r => r.success).length / results.length) * 100),
    results: results
  };
  
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  // Create a summary file
  const summaryPath = path.join(artifactsDir, 'latest-report.json');
  fs.writeFileSync(summaryPath, JSON.stringify(report, null, 2));
  
  vscode.window.showInformationMessage(`Proof artifacts saved to ${artifactsDir}`);
}

function generateSpecViewHTML(spec: any): string {
  // Confidence transparency (Prompt 5.2)
  const confidenceEmoji = spec.confidence >= 0.8 ? '🟢' : spec.confidence >= 0.6 ? '🟡' : '🔴';
  const confidenceText = spec.confidence >= 0.8 ? 'High' : spec.confidence >= 0.6 ? 'Medium' : 'Low';
  const confidenceColor = spec.confidence >= 0.8 ? '#28a745' : spec.confidence >= 0.6 ? '#ffc107' : '#dc3545';
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SpecSync Specification</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 20px; }
    .spec-section { margin-bottom: 20px; }
    .spec-section h3 { color: #0366d6; margin-bottom: 10px; }
    .spec-item { background: #f6f8fa; padding: 8px; margin: 5px 0; border-radius: 4px; }
    .confidence { color: ${confidenceColor}; font-weight: bold; }
    .reasoning { background: #fff3cd; padding: 15px; border-radius: 4px; margin-top: 15px; }
    .confidence-badge { display: inline-block; padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; background: ${confidenceColor}; color: white; }
  </style>
</head>
<body>
  <h2>Specification Details</h2>
  <div class="confidence">
    <span class="confidence-badge">${confidenceEmoji} ${confidenceText} Confidence (${Math.round(spec.confidence * 100)}%)</span>
  </div>
  
  <div class="spec-section">
    <h3>Preconditions</h3>
    ${spec.preconditions.map(pre => `<div class="spec-item">${pre}</div>`).join('')}
  </div>
  
  <div class="spec-section">
    <h3>Postconditions</h3>
    ${spec.postconditions.map(post => `<div class="spec-item">${post}</div>`).join('')}
  </div>
  
  <div class="spec-section">
    <h3>Invariants</h3>
    ${spec.invariants.map(inv => `<div class="spec-item">${inv}</div>`).join('')}
  </div>
  
  <div class="reasoning">
    <h3>Reasoning</h3>
    <p>${spec.reasoning}</p>
  </div>
</body>
</html>
`;
}

function generateSpecEditHTML(functionName: string, spec: any): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Edit Specification</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 20px; }
    .form-group { margin-bottom: 15px; }
    label { display: block; margin-bottom: 5px; font-weight: bold; }
    textarea { width: 100%; min-height: 80px; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
    button { background: #0366d6; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; }
    button:hover { background: #0256b3; }
    .confidence-slider { width: 100%; margin: 10px 0; }
  </style>
</head>
<body>
  <h2>Edit Specification: ${functionName}</h2>
  
  <form id="specForm">
    <div class="form-group">
      <label>Confidence Level (${Math.round(spec.confidence * 100)}%)</label>
      <input type="range" id="confidence" min="0" max="100" value="${Math.round(spec.confidence * 100)}" class="confidence-slider">
      <span id="confidenceValue">${Math.round(spec.confidence * 100)}%</span>
    </div>
    
    <div class="form-group">
      <label>Preconditions (one per line):</label>
      <textarea name="preconditions" id="preconditions">${spec.preconditions.join('\n')}</textarea>
    </div>
    
    <div class="form-group">
      <label>Postconditions (one per line):</label>
      <textarea name="postconditions" id="postconditions">${spec.postconditions.join('\n')}</textarea>
    </div>
    
    <div class="form-group">
      <label>Invariants (one per line):</label>
      <textarea name="invariants" id="invariants">${spec.invariants.join('\n')}</textarea>
    </div>
    
    <div class="form-group">
      <label>Reasoning:</label>
      <textarea name="reasoning" id="reasoning">${spec.reasoning}</textarea>
    </div>
    
    <button type="submit">Save Changes</button>
  </form>
  
  <script>
    // Update confidence display
    document.getElementById('confidence').addEventListener('input', function() {
      document.getElementById('confidenceValue').textContent = this.value + '%';
    });
    
    document.getElementById('specForm').addEventListener('submit', function(e) {
      e.preventDefault();
      
      const formData = {
        confidence: parseInt(document.getElementById('confidence').value) / 100,
        preconditions: document.getElementById('preconditions').value.split('\n').filter(line => line.trim()),
        postconditions: document.getElementById('postconditions').value.split('\n').filter(line => line.trim()),
        invariants: document.getElementById('invariants').value.split('\n').filter(line => line.trim()),
        reasoning: document.getElementById('reasoning').value
      };
      
      // Send message to extension
      vscode.postMessage({
        command: 'saveSpec',
        data: formData
      });
    });
  </script>
</body>
</html>
`;
}

export function deactivate() {}
