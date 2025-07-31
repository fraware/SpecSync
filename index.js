const { Application } = require('probot');
const { DiffParser } = require('./src/diff-parser');
const { ASTExtractor } = require('./src/ast-extractor');
const { SpecAnalyzer } = require('./src/spec-analyzer');
const { GitHubUI } = require('./src/github-ui');
const { VSCodeUI } = require('./src/vscode-ui');
const { WebDashboard } = require('./src/web-dashboard');
const { SlackAlerts } = require('./src/slack-alerts');
const { UIPrinciples } = require('./src/ui-principles');

module.exports = (app) => {
  const diffParser = new DiffParser();
  const astExtractor = new ASTExtractor();
  const specAnalyzer = new SpecAnalyzer();
  
  // Initialize UI components
  const githubUI = new GitHubUI();
  const vscodeUI = new VSCodeUI();
  const webDashboard = new WebDashboard();
  const slackAlerts = new SlackAlerts();
  const uiPrinciples = new UIPrinciples();
  
  // Initialize components
  githubUI.initialize(process.env.GITHUB_TOKEN);
  slackAlerts.initialize();

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
    
    // Post comments with spec suggestions using GitHub UI
    for (const suggestion of specSuggestions) {
      await githubUI.createSpecComment(context, suggestion);
    }
    
    // Create coverage check
    const proofStatus = {
      coverage: 75,
      totalFunctions: specSuggestions.length,
      coveredFunctions: specSuggestions.filter(s => s.confidence > 70).length,
      failedProofs: 0,
      functions: specSuggestions.map(s => ({
        name: s.functionName,
        filePath: s.filePath,
        line: s.lineNumber,
        hasProof: s.confidence > 70
      })),
      proofs: []
    };
    
    await githubUI.createCoverageCheck(context, proofStatus);

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
      // Send drift alerts to Slack
      for (const drift of driftResults) {
        await slackAlerts.sendDriftAlert(drift);
      }
      
      // Create proof check comment
      const proofResults = {
        functions: driftResults.map(d => ({
          name: d.functionName,
          proofValid: false,
          theorem: null,
          hasDrift: true
        })),
        drift: driftResults,
        coverage: 60,
        repository: repository.full_name,
        prNumber: 0
      };
      
      await githubUI.createProofCheckComment(context, proofResults);
    }
  } catch (error) {
    console.error('Error processing push:', error);
  }
}

async function handleIssueComment(context, specAnalyzer) {
  const { payload } = context;
  
  // Handle spec-related commands in comments
  if (payload.comment.body.includes('/specsync')) {
    await githubUI.handleSpecCommentAction(context, payload.comment);
  }
}

async function handleReviewComment(context, specAnalyzer) {
  const { payload } = context;
  
  // Handle spec-related commands in review comments
  if (payload.comment.body.includes('/specsync')) {
    await githubUI.handleSpecCommentAction(context, payload.comment);
  }
}

 