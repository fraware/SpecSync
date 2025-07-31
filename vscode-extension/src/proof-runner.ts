import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec, spawn } from 'child_process';

export function activate(context: vscode.ExtensionContext) {
  let currentProofProcess: any = null;
  
  context.subscriptions.push(
    vscode.commands.registerCommand('specsync.runProof', () => runProof(currentProofProcess)),
    vscode.commands.registerCommand('specsync.cancelProof', () => cancelProof(currentProofProcess))
  );
}

async function runProof(currentProcess: any) {
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
  
  const leanFiles = fs.readdirSync(specsDir).filter(f => f.endsWith('.lean'));
  if (leanFiles.length === 0) {
    vscode.window.showInformationMessage('No Lean files found in specs directory');
    return;
  }
  
  const progressOptions = {
    location: vscode.ProgressLocation.Notification,
    title: 'Running Lean Proofs',
    cancellable: true
  };
  
  const outputChannel = vscode.window.createOutputChannel('SpecSync Proof Runner');
  outputChannel.show();
  
  await vscode.window.withProgress(progressOptions, async (progress, token) => {
    try {
      progress.report({ message: 'Initializing Lean environment...' });
      
      let successCount = 0;
      let totalCount = leanFiles.length;
      const results: any[] = [];
      
      for (const file of leanFiles) {
        if (token.isCancellationRequested) {
          outputChannel.appendLine('Proof execution cancelled by user');
          break;
        }
        
        const filePath = path.join(specsDir, file);
        progress.report({ 
          message: `Processing ${file}...`,
          increment: 100 / totalCount
        });
        
        outputChannel.appendLine(`\nProcessing ${file}...`);
        
        try {
          const result = await executeLeanFile(leanPath, filePath, outputChannel);
          results.push({ file, success: result.success, output: result.output });
          
          if (result.success) {
            successCount++;
            outputChannel.appendLine(`✅ ${file} - Proof successful`);
          } else {
            outputChannel.appendLine(`❌ ${file} - Proof failed`);
          }
        } catch (error) {
          results.push({ file, success: false, error: error.message });
          outputChannel.appendLine(`❌ ${file} - Error: ${error.message}`);
        }
      }
      
      const coverage = Math.round((successCount / totalCount) * 100);
      
      // Show results summary
      const summary = `
## Proof Execution Summary

**Coverage:** ${coverage}%
**Successful:** ${successCount}/${totalCount}
**Failed:** ${totalCount - successCount}

### Results:
${results.map(r => `${r.success ? '✅' : '❌'} ${r.file}`).join('\n')}
`;
      
      outputChannel.appendLine(summary);
      
      // Show notification
      if (coverage >= 70) {
        vscode.window.showInformationMessage(
          `Proof validation complete: ${successCount}/${totalCount} successful (${coverage}% coverage)`
        );
      } else {
        vscode.window.showWarningMessage(
          `Proof validation complete: ${successCount}/${totalCount} successful (${coverage}% coverage) - Below threshold`
        );
      }
      
      // Generate artifacts
      await generateProofArtifacts(results, workspaceFolder.uri.fsPath);
      
    } catch (error) {
      outputChannel.appendLine(`\n❌ Proof execution failed: ${error.message}`);
      vscode.window.showErrorMessage(`Proof execution failed: ${error.message}`);
    }
  });
}

function executeLeanFile(leanPath: string, filePath: string, outputChannel: vscode.OutputChannel): Promise<{success: boolean, output: string}> {
  return new Promise((resolve, reject) => {
    const process = spawn(leanPath, ['--json', filePath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    process.stdout.on('data', (data) => {
      stdout += data.toString();
      outputChannel.append(data.toString());
    });
    
    process.stderr.on('data', (data) => {
      stderr += data.toString();
      outputChannel.append(data.toString());
    });
    
    process.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, output: stdout });
      } else {
        resolve({ success: false, output: stderr });
      }
    });
    
    process.on('error', (error) => {
      reject(error);
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

function cancelProof(currentProcess: any) {
  if (currentProcess) {
    currentProcess.kill();
    vscode.window.showInformationMessage('Proof execution cancelled');
  }
}

export function deactivate() {}
