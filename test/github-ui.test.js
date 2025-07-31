const { GitHubUI } = require('../src/github-ui');

describe('GitHubUI', () => {
  let githubUI;
  let mockContext;

  beforeEach(() => {
    githubUI = new GitHubUI();
    githubUI.initialize('mock-token');
    
    // Mock the Octokit client properly
    githubUI.octokit = {
      pulls: {
        createReviewComment: jest.fn().mockResolvedValue({ id: 1 }),
        dismissReview: jest.fn().mockResolvedValue({}),
        listFiles: jest.fn().mockResolvedValue({ data: [] })
      },
      issues: {
        createComment: jest.fn().mockResolvedValue({ id: 1 })
      },
      checks: {
        create: jest.fn().mockResolvedValue({ id: 1 })
      }
    };
    
    mockContext = {
      payload: {
        pull_request: {
          number: 123,
          head: { sha: 'abc123' }
        },
        repository: {
          owner: { login: 'test-owner' },
          name: 'test-repo',
          full_name: 'test-owner/test-repo'
        }
      },
      octokit: githubUI.octokit
    };
  });

  describe('Prompt 1.1 — Suggested Spec Comments', () => {
    test('should create spec comment with confidence transparency', async () => {
      const specSuggestion = {
        functionName: 'calculateInterest',
        filePath: 'src/calculator.js',
        lineNumber: 10,
        preconditions: ['principal > 0', 'rate >= 0'],
        postconditions: ['return value >= 0'],
        invariants: ['balance >= 0'],
        confidence: 0.85,
        reasoning: 'Function performs financial calculation requiring validation'
      };

      const result = await githubUI.createSpecComment(mockContext, specSuggestion);
      
      expect(result).toBeDefined();
      expect(mockContext.octokit.pulls.createReviewComment).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        pull_number: 123,
        commit_id: 'abc123',
        path: 'src/calculator.js',
        line: 10,
        body: expect.stringContaining('🟢 High (85%)')
      });
    });

    test('should format comment with action buttons', () => {
      const specSuggestion = {
        functionName: 'add',
        filePath: 'src/math.js',
        lineNumber: 5,
        preconditions: ['a is number', 'b is number'],
        postconditions: ['return a + b'],
        invariants: [],
        confidence: 0.75,
        reasoning: 'Simple addition function'
      };

      const commentBody = githubUI.formatSpecComment(specSuggestion);
      
      expect(commentBody).toContain('🟡 Medium (75%)');
      expect(commentBody).toContain('/specsync accept');
      expect(commentBody).toContain('/specsync edit');
      expect(commentBody).toContain('/specsync ignore');
      expect(commentBody).toContain('/specsync review');
    });

    test('should handle different confidence levels', () => {
      const highConfidence = {
        functionName: 'test',
        confidence: 0.9,
        preconditions: [],
        postconditions: [],
        invariants: [],
        reasoning: 'Test'
      };

      const lowConfidence = {
        functionName: 'test',
        confidence: 0.5,
        preconditions: [],
        postconditions: [],
        invariants: [],
        reasoning: 'Test'
      };

      const highComment = githubUI.formatSpecComment(highConfidence);
      const lowComment = githubUI.formatSpecComment(lowConfidence);

      expect(highComment).toContain('🟢 High (90%)');
      expect(lowComment).toContain('🔴 Low (50%)');
    });
  });

  describe('Prompt 1.2 — Inline Spec Coverage Tags', () => {
    test('should create coverage check with annotations', async () => {
      const proofStatus = {
        coverage: 75,
        totalFunctions: 10,
        coveredFunctions: 7,
        failedProofs: 1,
        functions: [
          {
            name: 'add',
            filePath: 'src/math.js',
            line: 5,
            hasProof: true,
            theorem: 'add_theorem'
          },
          {
            name: 'subtract',
            filePath: 'src/math.js',
            line: 10,
            hasProof: false
          }
        ],
        proofs: [] // Add empty proofs array to prevent undefined error
      };

      const result = await githubUI.createCoverageCheck(mockContext, proofStatus);
      
      expect(result).toBeDefined();
      expect(mockContext.octokit.checks.create).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        name: 'SpecSync Coverage',
        head_sha: 'abc123',
        status: 'completed',
        conclusion: 'success',
        output: expect.objectContaining({
          title: 'Spec Coverage: 75%'
        }),
        annotations: expect.arrayContaining([
          expect.objectContaining({
            path: 'src/math.js',
            start_line: 5,
            annotation_level: 'notice',
            message: expect.stringContaining('🟢 Spec verified')
          }),
          expect.objectContaining({
            path: 'src/math.js',
            start_line: 10,
            annotation_level: 'failure',
            message: expect.stringContaining('🔴 Missing spec')
          })
        ])
      });
    });

    test('should generate tooltip content for verified functions', () => {
      const func = {
        name: 'add',
        hasProof: true,
        theorem: 'add_theorem',
        lastVerified: '2024-01-15'
      };

      const tooltip = githubUI.generateTooltipContent(func);
      
      expect(tooltip).toContain('Verified Specification');
      expect(tooltip).toContain('add_theorem');
      expect(tooltip).toContain('2024-01-15');
      expect(tooltip).toContain('View Proof');
    });

    test('should generate tooltip content for missing specs', () => {
      const func = {
        name: 'subtract',
        hasProof: false
      };

      const tooltip = githubUI.generateTooltipContent(func);
      
      expect(tooltip).toContain('Missing Specification');
      expect(tooltip).toContain('Add Specification');
    });
  });

  describe('Prompt 1.3 — ProofCheck Sidebar Panel', () => {
    test('should create proof check comment with expandable sections', async () => {
      const proofResults = {
        functions: [
          {
            name: 'add',
            proofValid: true,
            theorem: 'add_theorem',
            hasDrift: false
          },
          {
            name: 'subtract',
            proofValid: false,
            theorem: null,
            hasDrift: true
          }
        ],
        drift: [
          {
            functionName: 'subtract',
            reason: 'Postcondition weakened',
            previousSpec: 'return a - b',
            currentImplementation: 'return a - b + 1'
          }
        ],
        coverage: 60,
        repository: 'test-owner/test-repo',
        prNumber: 123
      };

      const result = await githubUI.createProofCheckComment(mockContext, proofResults);
      
      expect(result).toBeDefined();
      expect(mockContext.octokit.issues.createComment).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 123,
        body: expect.stringContaining('🔍 ProofCheck Results')
      });
    });

    test('should format proof check comment with drift detection', () => {
      const proofResults = {
        functions: [
          {
            name: 'withdraw',
            proofValid: false,
            theorem: null,
            hasDrift: true
          }
        ],
        drift: [
          {
            functionName: 'withdraw',
            reason: 'Balance check removed',
            previousSpec: 'balance >= amount',
            currentImplementation: 'no balance check'
          }
        ],
        coverage: 50,
        repository: 'test-owner/test-repo',
        prNumber: 123
      };

      const commentBody = githubUI.formatProofCheckComment(proofResults);
      
      expect(commentBody).toContain('📊 Coverage Summary (50%)');
      expect(commentBody).toContain('⚠️ Drift Detection (1 functions)');
      expect(commentBody).toContain('Balance check removed');
      expect(commentBody).toContain('Prove Now');
      expect(commentBody).toContain('View Dashboard');
    });
  });

  describe('Action handling', () => {
    test('should handle accept action', async () => {
      const comment = {
        body: `## 🤖 SpecSync: Specification for \`add\`
**Confidence:** 🟢 High (85%)

### 📋 Preconditions
- a is number
- b is number

### ✅ Postconditions
- return a + b

**Actions:**
- ✅ \`/specsync accept\` - Accept this specification`,
        pull_request_review_id: 456
      };

      await githubUI.handleAcceptAction(mockContext, comment);
      
      expect(mockContext.octokit.pulls.dismissReview).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        pull_number: 123,
        review_id: 456,
        message: 'Spec accepted and stored'
      });
    });

    test('should extract spec from comment', () => {
      const commentBody = `## 🤖 SpecSync: Specification for \`add\`
**File:** \`src/math.js\` (line 5)
**Confidence:** 🟢 High (85%)

### 📋 Preconditions
- a is number
- b is number

### ✅ Postconditions
- return a + b

### 💭 Reasoning
Simple addition function`;

      const spec = githubUI.extractSpecFromComment(commentBody);
      
      expect(spec.functionName).toBe('add');
      expect(spec.confidence).toBe(85);
      expect(spec.preconditions).toContain('a is number');
      expect(spec.postconditions).toContain('return a + b');
      expect(spec.reasoning).toContain('Simple addition function');
    });
  });
}); 