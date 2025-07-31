const { Application } = require('probot');
const { DiffParser } = require('./src/diff-parser');
const { ASTExtractor } = require('./src/ast-extractor');
const { SpecAnalyzer } = require('./src/spec-analyzer');

module.exports = (app) => {
  const diffParser = new DiffParser();
  const astExtractor = new ASTExtractor();
  const specAnalyzer = new SpecAnalyzer();

  // Handle pull request events
  app.on('pull_request.opened', async (context) => {
    await handlePullRequest(context, diffParser, astExtractor, specAnalyzer);
  });

  app.on('pull_request.synchronize', async (context) => {
    await handlePullRequest(context, diffParser, astExtractor, specAnalyzer);
  });

  app.on('pull_request.reopened', async (context) => {
    await handlePullRequest(context, diffParser, astExtractor, specAnalyzer);
  });

  // Handle push events for spec drift detection
  app.on('push', async (context) => {
    await handlePush(context, diffParser, astExtractor, specAnalyzer);
  });

  // Handle issue comments for spec feedback
  app.on('issue_comment.created', async (context) => {
    await handleIssueComment(context, specAnalyzer);
  });

  // Handle pull request review comments
  app.on('pull_request_review_comment.created', async (context) => {
    await handleReviewComment(context, specAnalyzer);
  });
};

async function handlePullRequest(context, diffParser, astExtractor, specAnalyzer) {
  const { payload } = context;
  const { pull_request, repository } = payload;
  
  console.log(`Processing PR #${pull_request.number} in ${repository.full_name}`);

  try {
    // Extract diff and changed files
    const diff = await context.octokit.pulls.get({
      owner: repository.owner.login,
      repo: repository.name,
      pull_number: pull_request.number,
      mediaType: {
        format: 'diff'
      }
    });

    const changedFiles = await context.octokit.pulls.listFiles({
      owner: repository.owner.login,
      repo: repository.name,
      pull_number: pull_request.number
    });

    // Parse diff and extract function changes
    const functionChanges = await diffParser.parseDiff(diff.data, changedFiles.data);
    
    // Extract AST information for changed functions
    const astAnalysis = await astExtractor.extractAST(functionChanges, context);
    
    // Analyze and generate spec suggestions
    const specSuggestions = await specAnalyzer.analyzeChanges(astAnalysis, context);
    
    // Post comments with spec suggestions
    await postSpecComments(context, specSuggestions, pull_request.number);

  } catch (error) {
    console.error('Error processing pull request:', error);
    await context.octokit.issues.createComment({
      owner: repository.owner.login,
      repo: repository.name,
      issue_number: pull_request.number,
      body: `⚠️ **SpecSync Error**: Failed to analyze changes. Please check the logs for details.`
    });
  }
}

async function handlePush(context, diffParser, astExtractor, specAnalyzer) {
  const { payload } = context;
  const { ref, repository } = payload;
  
  // Only process pushes to main/master branch for drift detection
  if (!ref.includes('refs/heads/main') && !ref.includes('refs/heads/master')) {
    return;
  }

  console.log(`Processing push to ${ref} in ${repository.full_name}`);

  try {
    // Check for spec drift in changed files
    const driftResults = await specAnalyzer.detectDrift(payload.commits, context);
    
    if (driftResults.length > 0) {
      await postDriftComments(context, driftResults);
    }
  } catch (error) {
    console.error('Error processing push:', error);
  }
}

async function handleIssueComment(context, specAnalyzer) {
  const { payload } = context;
  
  // Handle spec-related commands in comments
  if (payload.comment.body.includes('/specsync')) {
    await specAnalyzer.handleCommentCommand(context, payload.comment);
  }
}

async function handleReviewComment(context, specAnalyzer) {
  const { payload } = context;
  
  // Handle spec-related commands in review comments
  if (payload.comment.body.includes('/specsync')) {
    await specAnalyzer.handleCommentCommand(context, payload.comment);
  }
}

async function postSpecComments(context, specSuggestions, prNumber) {
  const { payload } = context;
  const { repository } = payload;

  for (const suggestion of specSuggestions) {
    const commentBody = formatSpecComment(suggestion);
    
    await context.octokit.issues.createComment({
      owner: repository.owner.login,
      repo: repository.name,
      issue_number: prNumber,
      body: commentBody
    });
  }
}

async function postDriftComments(context, driftResults) {
  const { payload } = context;
  const { repository } = payload;

  for (const drift of driftResults) {
    const commentBody = formatDriftComment(drift);
    
    await context.octokit.issues.createComment({
      owner: repository.owner.login,
      repo: repository.name,
      issue_number: drift.issueNumber,
      body: commentBody
    });
  }
}

function formatSpecComment(suggestion) {
  const { functionName, filePath, lineNumber, preconditions, postconditions, invariants, edgeCases, confidence, reasoning, complexity, security } = suggestion;

  return `## 🤖 SpecSync: Specification for \`${functionName}\`

**File:** \`${filePath}\` (line ${lineNumber})
**Confidence:** ${confidence}%

### 📋 Preconditions
${preconditions.map(pre => `- ${pre}`).join('\n')}

### ✅ Postconditions
${postconditions.map(post => `- ${post}`).join('\n')}

### 🔒 Invariants
${invariants.map(inv => `- ${inv}`).join('\n')}

### ⚠️ Edge Cases
${edgeCases.map(edge => `- ${edge}`).join('\n')}

${complexity ? `### ⚡ Performance Analysis
- **Time Complexity:** ${complexity.time}
- **Space Complexity:** ${complexity.space}
` : ''}

${security && security.vulnerabilities.length > 0 ? `### 🔒 Security Analysis
**Potential Vulnerabilities:**
${security.vulnerabilities.map(vuln => `- ⚠️ ${vuln}`).join('\n')}

**Mitigation Strategies:**
${security.mitigations.map(mit => `- ✅ ${mit}`).join('\n')}
` : ''}

### 💭 Reasoning
${reasoning}

---

**Actions:**
- ✅ \`/specsync accept\` - Accept this specification
- ✏️ \`/specsync edit\` - Edit the specification
- ❌ \`/specsync ignore\` - Ignore this suggestion
- 🔍 \`/specsync review\` - Request manual review

*Generated by SpecSync AI*`;
}

function formatDriftComment(drift) {
  return `## ⚠️ SpecSync Drift Detection

**Function**: \`${drift.functionName}\`
**File**: \`${drift.filePath}\`

The implementation has changed and may no longer satisfy the existing specification.

**Previous Spec**: ${drift.previousSpec}
**Current Implementation**: ${drift.currentImplementation}

**Recommendation**: Please review and update the specification if needed.

---
**Command**: \`/specsync review\` to analyze the drift`;
} 