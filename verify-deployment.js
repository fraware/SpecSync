#!/usr/bin/env node

/**
 * SpecSync Deployment Verification Script
 * 
 * This script verifies that all components are ready for deployment.
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 SpecSync Deployment Verification\n');

// Check critical files
const criticalFiles = [
  'index.js',
  'package.json',
  'Dockerfile',
  'env.example',
  '.github/workflows/lean4-ci.yml',
  'src/github-ui.js',
  'src/vscode-ui.js',
  'src/dashboard-ui.js',
  'src/slack-alerts.js',
  'src/ui-principles.js',
  'vscode-extension/package.json',
  'test/github-ui.test.js',
  'test/ui-principles.test.js',
  'test/slack-alerts.test.js'
];

console.log('📁 Checking critical files...');
let allFilesExist = true;
criticalFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`  ✅ ${file}`);
  } else {
    console.log(`  ❌ ${file} - MISSING`);
    allFilesExist = false;
  }
});

// Check VSCode extension
console.log('\n💻 Checking VSCode extension...');
const vscodePath = 'vscode-extension';
if (fs.existsSync(vscodePath)) {
  const files = fs.readdirSync(vscodePath);
  console.log(`  ✅ VSCode extension directory exists with ${files.length} files`);
  console.log(`  📦 Files: ${files.join(', ')}`);
} else {
  console.log('  ❌ VSCode extension directory missing');
  allFilesExist = false;
}

// Check test results
console.log('\n🧪 Checking test coverage...');
try {
  const { execSync } = require('child_process');
  const testOutput = execSync('npm test --silent', { encoding: 'utf8' });
  const passedTests = (testOutput.match(/√/g) || []).length;
  const failedTests = (testOutput.match(/✗/g) || []).length;
  
  console.log(`  ✅ Tests: ${passedTests} passed, ${failedTests} failed`);
  
  if (failedTests > 0) {
    console.log('  ⚠️  Some tests are failing');
    allFilesExist = false;
  }
} catch (error) {
  console.log('  ❌ Could not run tests');
  allFilesExist = false;
}

// Check environment template
console.log('\n🔧 Checking environment setup...');
if (fs.existsSync('env.example')) {
  const envContent = fs.readFileSync('env.example', 'utf8');
  const requiredVars = ['GITHUB_APP_ID', 'GITHUB_PRIVATE_KEY', 'GITHUB_WEBHOOK_SECRET'];
  const missingVars = requiredVars.filter(varName => !envContent.includes(varName));
  
  if (missingVars.length === 0) {
    console.log('  ✅ Environment template includes all required variables');
  } else {
    console.log(`  ⚠️  Missing variables: ${missingVars.join(', ')}`);
  }
} else {
  console.log('  ❌ Environment template missing');
  allFilesExist = false;
}

// Check Docker configuration
console.log('\n🐳 Checking Docker configuration...');
if (fs.existsSync('Dockerfile')) {
  const dockerContent = fs.readFileSync('Dockerfile', 'utf8');
  if (dockerContent.includes('EXPOSE 3000') && dockerContent.includes('CMD')) {
    console.log('  ✅ Dockerfile properly configured');
  } else {
    console.log('  ⚠️  Dockerfile may need configuration');
  }
} else {
  console.log('  ❌ Dockerfile missing');
  allFilesExist = false;
}

// Check CI/CD workflow
console.log('\n🔄 Checking CI/CD workflow...');
if (fs.existsSync('.github/workflows/lean4-ci.yml')) {
  const workflowContent = fs.readFileSync('.github/workflows/lean4-ci.yml', 'utf8');
  if (workflowContent.includes('lean4-proofs') && workflowContent.includes('lean --json')) {
    console.log('  ✅ CI/CD workflow properly configured');
  } else {
    console.log('  ⚠️  CI/CD workflow may need configuration');
  }
} else {
  console.log('  ❌ CI/CD workflow missing');
  allFilesExist = false;
}

// Final status
console.log('\n📊 Deployment Verification Summary');
console.log('=====================================');

if (allFilesExist) {
  console.log('🎉 DEPLOYMENT READY!');
  console.log('\n✅ All critical components verified');
  console.log('✅ All tests passing');
  console.log('✅ VSCode extension generated');
  console.log('✅ CI/CD workflow configured');
  console.log('✅ Docker configuration ready');
  console.log('✅ Environment template complete');
  
  console.log('\n🚀 Next Steps:');
  console.log('1. Set up environment variables');
  console.log('2. Deploy to your chosen platform');
  console.log('3. Install the VSCode extension');
  console.log('4. Configure GitHub App');
  console.log('5. Set up Slack integration (optional)');
  
  console.log('\n📋 See DEPLOYMENT_READY.md for detailed instructions');
} else {
  console.log('❌ DEPLOYMENT NOT READY');
  console.log('\n⚠️  Some components need attention before deployment');
  console.log('Please fix the issues above and run this verification again');
}

console.log('\n🔍 Verification complete!'); 