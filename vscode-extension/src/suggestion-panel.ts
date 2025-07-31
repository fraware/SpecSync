import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  const suggestionProvider = new SpecSuggestionProvider();
  
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('specsync-suggestion-list', suggestionProvider),
    vscode.commands.registerCommand('specsync.addSuggestion', addSuggestion)
  );
  
  // Listen for text changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(handleTextChange)
  );
}

class SpecSuggestionProvider implements vscode.TreeDataProvider<SpecSuggestion> {
  private _onDidChangeTreeData: vscode.EventEmitter<SpecSuggestion | undefined | null | undefined> = new vscode.EventEmitter<SpecSuggestion | undefined | null | undefined>();
  readonly onDidChangeTreeData: vscode.Event<SpecSuggestion | undefined | null | undefined> = this._onDidChangeTreeData.event;
  
  private suggestions: SpecSuggestion[] = [];
  
  getTreeItem(element: SpecSuggestion): vscode.TreeItem {
    return element;
  }
  
  getChildren(element?: SpecSuggestion): Thenable<SpecSuggestion[]> {
    if (element) {
      return Promise.resolve([]);
    }
    return Promise.resolve(this.suggestions);
  }
  
  updateSuggestions(newSuggestions: SpecSuggestion[]) {
    this.suggestions = newSuggestions;
    this._onDidChangeTreeData.fire(undefined);
  }
}

class SpecSuggestion extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly confidence: number,
    public readonly reasoning: string,
    public readonly type: 'precondition' | 'postcondition' | 'invariant'
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    
    this.tooltip = `Confidence: ${confidence}%\nReasoning: ${reasoning}`;
    this.description = `${confidence}% confidence`;
    this.contextValue = 'specSuggestion';
    
    this.command = {
      command: 'specsync.addSuggestion',
      title: 'Add Suggestion',
      arguments: [this]
    };
  }
  
  iconPath = new vscode.ThemeIcon('lightbulb');
}

async function handleTextChange(event: vscode.TextDocumentChangeEvent) {
  const document = event.document;
  const changes = event.contentChanges;
  
  for (const change of changes) {
    const text = change.text;
    const position = change.range.start;
    
    // Analyze the change for potential spec suggestions
    const suggestions = await analyzeTextChange(text, position, document);
    
    if (suggestions.length > 0) {
      // Update the suggestion panel
      const provider = vscode.workspace.getConfiguration('specsync').get('suggestionProvider');
      if (provider) {
        provider.updateSuggestions(suggestions);
      }
    }
  }
}

async function analyzeTextChange(text: string, position: vscode.Position, document: vscode.TextDocument): Promise<SpecSuggestion[]> {
  const suggestions: SpecSuggestion[] = [];
  
  // Simple pattern matching for common cases
  if (text.includes('balance -= amount')) {
    suggestions.push(new SpecSuggestion(
      'Ensure balance ≥ 0',
      85,
      'Detected balance reduction - should maintain non-negative balance',
      'invariant'
    ));
  }
  
  if (text.includes('return result')) {
    suggestions.push(new SpecSuggestion(
      'Result is not null',
      90,
      'Function returns a value - should ensure it's not null',
      'postcondition'
    ));
  }
  
  if (text.includes('if (input')) {
    suggestions.push(new SpecSuggestion(
      'Input is validated',
      80,
      'Detected input validation - should document precondition',
      'precondition'
    ));
  }
  
  return suggestions;
}

async function addSuggestion(suggestion: SpecSuggestion) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active editor');
    return;
  }
  
  // Find the function at current position
  const position = editor.selection.active;
  const functionName = getFunctionAtPosition(editor.document, position);
  
  if (!functionName) {
    vscode.window.showErrorMessage('No function found at current position');
    return;
  }
  
  // Add the suggestion to the function's spec
  await addSuggestionToFunction(functionName, suggestion);
  
  vscode.window.showInformationMessage(`Added ${suggestion.type}: ${suggestion.label}`);
}

function getFunctionAtPosition(document: vscode.TextDocument, position: vscode.Position): string | null {
  const line = document.lineAt(position.line);
  const functionMatch = line.text.match(/function\s+(\w+)\s*\(/);
  return functionMatch ? functionMatch[1] : null;
}

async function addSuggestionToFunction(functionName: string, suggestion: SpecSuggestion) {
  // This would integrate with the spec storage system
  const config = vscode.workspace.getConfiguration('specsync');
  const cachePath = config.get('specCachePath', '.specsync/spec.json');
  
  try {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return;
    
    const fullCachePath = path.join(workspaceFolder.uri.fsPath, cachePath);
    let cache = {};
    
    if (fs.existsSync(fullCachePath)) {
      const cacheContent = fs.readFileSync(fullCachePath, 'utf8');
      cache = JSON.parse(cacheContent);
    }
    
    const key = `${workspaceFolder.name}:${functionName}`;
    if (!cache[key]) {
      cache[key] = {
        functionName,
        preconditions: [],
        postconditions: [],
        invariants: [],
        confidence: 0,
        reasoning: ''
      };
    }
    
    // Add the suggestion to the appropriate array
    switch (suggestion.type) {
      case 'precondition':
        cache[key].preconditions.push(suggestion.label);
        break;
      case 'postcondition':
        cache[key].postconditions.push(suggestion.label);
        break;
      case 'invariant':
        cache[key].invariants.push(suggestion.label);
        break;
    }
    
    // Ensure directory exists
    const dir = path.dirname(fullCachePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(fullCachePath, JSON.stringify(cache, null, 2));
    
  } catch (error) {
    console.error('Error saving suggestion:', error);
    vscode.window.showErrorMessage(`Failed to save suggestion: ${error.message}`);
  }
}

export function deactivate() {}
