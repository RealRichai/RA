#!/usr/bin/env node
/**
 * Traceability Check Script
 *
 * Validates the Master Implementation Ledger and Gap Register to ensure:
 * 1. Required files exist
 * 2. No forbidden tokens (TBD, TODO, "coming soon", "placeholder")
 * 3. All referenced file paths exist in the repository
 * 4. Critical categories have test coverage for "Implemented" features
 *
 * Exit codes:
 *   0 - All checks passed
 *   1 - Validation errors found
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// =============================================================================
// Configuration
// =============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

const LEDGER_PATH = 'docs/traceability/MASTER_IMPLEMENTATION_LEDGER.md';
const GAP_REGISTER_PATH = 'docs/traceability/GAP_REGISTER.md';

// Forbidden tokens that indicate incomplete work
const FORBIDDEN_TOKENS = [
  /\bTBD\b/gi,
  /\bTODO\b/gi,
  /\bcoming soon\b/gi,
  /\bplaceholder\b/gi,
  /\bFIXME\b/gi,
];

// Critical categories that MUST have tests for "Implemented" features
// Maps section patterns to category names
const CRITICAL_CATEGORIES = [
  { pattern: /^## 1\. Compliance/i, name: 'Compliance' },
  { pattern: /^## 2\. Revenue Partners/i, name: 'Payments/Ledger' },
  { pattern: /^## 5\. Agent Governance/i, name: 'Governance' },
  { pattern: /^## 9\. Security/i, name: 'Auth/Security' },
  { pattern: /^### \d+\.\d+ .*Auth/i, name: 'Auth' },
  { pattern: /^### \d+\.\d+ .*Ledger/i, name: 'Ledger' },
  { pattern: /^### \d+\.\d+ .*Evidence/i, name: 'Evidence' },
  { pattern: /^### \d+\.\d+ .*Tenant/i, name: 'Tenancy' },
];

// =============================================================================
// Types
// =============================================================================

/**
 * @typedef {Object} ValidationError
 * @property {'missing_file' | 'forbidden_token' | 'missing_path' | 'missing_tests'} type
 * @property {string} message
 * @property {string} [file]
 * @property {number} [line]
 * @property {string} [category]
 * @property {string} [feature]
 */

/**
 * @typedef {Object} TableRow
 * @property {string} feature
 * @property {string} description
 * @property {string} status
 * @property {string} evidence
 * @property {string} tests
 * @property {number} lineNumber
 * @property {string} category
 */

// =============================================================================
// Utilities
// =============================================================================

/**
 * Extract file paths from a cell value.
 * Handles formats like:
 * - `packages/foo/src/bar.ts`
 * - `packages/foo/src/bar.ts:73-120`
 * - `packages/foo/src/__tests__/` (directory)
 * - Multiple paths separated by commas or newlines
 * - N/A or empty values
 *
 * @param {string} cellValue
 * @returns {string[]}
 */
function extractFilePaths(cellValue) {
  if (!cellValue || cellValue.trim() === '' || cellValue.trim().toUpperCase() === 'N/A') {
    return [];
  }

  const paths = [];

  // Split by common separators (comma, newline, semicolon, pipe)
  const segments = cellValue.split(/[,;\n|]+/).map((s) => s.trim());

  for (const segment of segments) {
    if (!segment || segment.toUpperCase() === 'N/A') continue;

    // Remove backticks and markdown formatting
    let cleaned = segment.replace(/`/g, '').trim();

    // Handle "(X lines)" suffix
    cleaned = cleaned.replace(/\s*\(\d+ lines?\)/gi, '');

    // Handle parenthetical annotations like "(DeviceRegistration)", "(model name)", etc.
    // Also handle incomplete/truncated annotations like "(1" without closing paren
    cleaned = cleaned.replace(/\s*\([^)]*\)?$/g, '');

    // Handle line number suffix like `:73-120` or `:100`
    cleaned = cleaned.replace(/:\d+(-\d+)?$/, '');

    // Skip N/A values (after removing parenthetical annotations)
    if (cleaned.toUpperCase() === 'N/A') continue;

    // Skip if it doesn't look like a path
    if (!cleaned.includes('/') && !cleaned.includes('.')) continue;

    // Skip URLs
    if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) continue;

    paths.push(cleaned);
  }

  return paths;
}

/**
 * Check if a path exists in the repository.
 * Handles both files and directories.
 *
 * @param {string} relativePath
 * @returns {boolean}
 */
function pathExists(relativePath) {
  const fullPath = join(ROOT_DIR, relativePath);
  try {
    const stat = statSync(fullPath);
    return stat.isFile() || stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Parse markdown tables from content.
 * Returns rows with their line numbers.
 *
 * @param {string} content
 * @returns {Array<{columns: string[], lineNumber: number}>}
 */
function parseMarkdownTables(content) {
  const lines = content.split('\n');
  const rows = [];

  let inTable = false;
  let headerColumns = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNumber = i + 1;

    // Detect table row
    if (line.startsWith('|') && line.endsWith('|')) {
      const cells = line
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim());

      // Skip separator rows (|---|---|)
      if (cells.every((c) => /^[-:]+$/.test(c))) {
        inTable = true;
        continue;
      }

      // First non-separator row after table start is header
      if (!inTable && cells.length > 0) {
        headerColumns = cells;
        inTable = true;
        continue;
      }

      if (inTable && cells.length > 0) {
        rows.push({ columns: cells, lineNumber });
      }
    } else {
      // End of table
      inTable = false;
      headerColumns = [];
    }
  }

  return rows;
}

/**
 * Find the current section/category for a given line number.
 *
 * @param {string} content
 * @param {number} lineNumber
 * @returns {string}
 */
function findCategoryForLine(content, lineNumber) {
  const lines = content.split('\n');
  let currentCategory = 'Unknown';

  for (let i = 0; i < lineNumber - 1 && i < lines.length; i++) {
    const line = lines[i];

    // Check for section headers (## 1. Compliance)
    const sectionMatch = line.match(/^##\s+\d+\.\s+(.+)$/);
    if (sectionMatch) {
      currentCategory = sectionMatch[1].trim();
      continue;
    }

    // Check for subsection headers (### 1.1 FARE Act)
    const subsectionMatch = line.match(/^###\s+\d+\.\d+\s+(.+)$/);
    if (subsectionMatch) {
      currentCategory = `${currentCategory} > ${subsectionMatch[1].trim()}`;
    }
  }

  return currentCategory;
}

/**
 * Check if a category is critical and requires tests.
 *
 * @param {string} category
 * @returns {boolean}
 */
function isCriticalCategory(category) {
  const lowerCategory = category.toLowerCase();
  return (
    lowerCategory.includes('compliance') ||
    lowerCategory.includes('auth') ||
    lowerCategory.includes('security') ||
    lowerCategory.includes('tenant') ||
    lowerCategory.includes('payment') ||
    lowerCategory.includes('ledger') ||
    lowerCategory.includes('evidence') ||
    lowerCategory.includes('governance')
  );
}

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Check that required files exist.
 *
 * @returns {ValidationError[]}
 */
function checkFilesExist() {
  const errors = [];

  if (!existsSync(join(ROOT_DIR, LEDGER_PATH))) {
    errors.push({
      type: 'missing_file',
      message: `Master Implementation Ledger not found: ${LEDGER_PATH}`,
      file: LEDGER_PATH,
    });
  }

  if (!existsSync(join(ROOT_DIR, GAP_REGISTER_PATH))) {
    errors.push({
      type: 'missing_file',
      message: `Gap Register not found: ${GAP_REGISTER_PATH}`,
      file: GAP_REGISTER_PATH,
    });
  }

  return errors;
}

/**
 * Check for forbidden tokens in file content.
 *
 * @param {string} content
 * @param {string} filePath
 * @returns {ValidationError[]}
 */
function checkForbiddenTokens(content, filePath) {
  const errors = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    for (const pattern of FORBIDDEN_TOKENS) {
      // Reset regex state
      pattern.lastIndex = 0;
      const match = pattern.exec(line);

      if (match) {
        // Skip if it's in a code block backticks (likely a column header)
        if (line.includes('`' + match[0] + '`')) continue;

        // Skip if it's in a heading that's explaining the concept
        if (line.startsWith('#') && line.toLowerCase().includes('status')) continue;

        errors.push({
          type: 'forbidden_token',
          message: `Forbidden token "${match[0]}" found`,
          file: filePath,
          line: lineNumber,
        });
      }
    }
  }

  return errors;
}

/**
 * Parse ledger tables and extract feature rows with their paths.
 *
 * @param {string} content
 * @returns {TableRow[]}
 */
function parseLedgerTables(content) {
  const rows = [];
  const lines = content.split('\n');

  let inTable = false;
  let columnIndices = { feature: -1, status: -1, evidence: -1, tests: -1 };
  let currentCategory = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Track current category from headers
    const sectionMatch = line.match(/^##\s+\d+\.\s+(.+)$/);
    if (sectionMatch) {
      currentCategory = sectionMatch[1].trim();
      inTable = false;
      continue;
    }

    const subsectionMatch = line.match(/^###\s+\d+\.\d+\s+(.+)$/);
    if (subsectionMatch) {
      currentCategory = `${currentCategory.split(' > ')[0]} > ${subsectionMatch[1].trim()}`;
      inTable = false;
      continue;
    }

    // Process table rows
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const cells = line
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim());

      // Skip separator rows
      if (cells.every((c) => /^[-:]+$/.test(c))) {
        continue;
      }

      // Check if this is a header row
      const lowerCells = cells.map((c) => c.toLowerCase());
      if (lowerCells.includes('feature') || lowerCells.includes('status')) {
        // This is a header row - find column indices
        columnIndices = {
          feature: lowerCells.findIndex((c) => c === 'feature'),
          status: lowerCells.findIndex((c) => c === 'status'),
          evidence: lowerCells.findIndex((c) => c === 'evidence'),
          tests: lowerCells.findIndex((c) => c === 'tests'),
        };
        inTable = true;
        continue;
      }

      // Data row
      if (inTable && columnIndices.feature >= 0) {
        const feature = cells[columnIndices.feature] || '';
        const status = cells[columnIndices.status] || '';
        const evidence = columnIndices.evidence >= 0 ? cells[columnIndices.evidence] || '' : '';
        const tests = columnIndices.tests >= 0 ? cells[columnIndices.tests] || '' : '';

        if (feature) {
          rows.push({
            feature: feature.replace(/\*\*/g, ''),
            description: cells[1] || '',
            status: status.replace(/\*\*/g, ''),
            evidence,
            tests,
            lineNumber,
            category: currentCategory,
          });
        }
      }
    } else if (!line.trim().startsWith('|')) {
      // End of table
      inTable = false;
    }
  }

  return rows;
}

/**
 * Validate all referenced file paths exist.
 *
 * @param {TableRow[]} rows
 * @param {string} filePath
 * @returns {ValidationError[]}
 */
function checkReferencedPaths(rows, filePath) {
  const errors = [];
  const checkedPaths = new Set();

  for (const row of rows) {
    // Extract paths from Evidence column
    const evidencePaths = extractFilePaths(row.evidence);
    for (const path of evidencePaths) {
      if (checkedPaths.has(path)) continue;
      checkedPaths.add(path);

      if (!pathExists(path)) {
        errors.push({
          type: 'missing_path',
          message: `Evidence path not found: ${path}`,
          file: filePath,
          line: row.lineNumber,
          category: row.category,
          feature: row.feature,
        });
      }
    }

    // Extract paths from Tests column
    const testPaths = extractFilePaths(row.tests);
    for (const path of testPaths) {
      if (checkedPaths.has(path)) continue;
      checkedPaths.add(path);

      if (!pathExists(path)) {
        errors.push({
          type: 'missing_path',
          message: `Test path not found: ${path}`,
          file: filePath,
          line: row.lineNumber,
          category: row.category,
          feature: row.feature,
        });
      }
    }
  }

  return errors;
}

/**
 * Check if a Tests cell value indicates acceptable non-test documentation.
 * Accepts: N/A (CI), N/A (schema), N/A (E2E), N/A (integration)
 *
 * @param {string} testsValue
 * @returns {boolean}
 */
function hasAcceptableTestAnnotation(testsValue) {
  if (!testsValue) return false;
  const lower = testsValue.toLowerCase();
  return (
    lower.includes('(ci)') ||
    lower.includes('(schema)') ||
    lower.includes('(e2e)') ||
    lower.includes('(integration)') ||
    lower.includes('(acceptance)')
  );
}

/**
 * Check that "Implemented" features in critical categories have tests.
 *
 * @param {TableRow[]} rows
 * @param {string} filePath
 * @returns {ValidationError[]}
 */
function checkCriticalCategoryTests(rows, filePath) {
  const errors = [];

  for (const row of rows) {
    // Only check "Implemented" status
    if (!row.status.toLowerCase().includes('implemented')) continue;

    // Only check critical categories
    if (!isCriticalCategory(row.category)) continue;

    // Accept annotated N/A values for infrastructure items
    if (hasAcceptableTestAnnotation(row.tests)) continue;

    // Extract test paths
    const testPaths = extractFilePaths(row.tests);

    if (testPaths.length === 0) {
      errors.push({
        type: 'missing_tests',
        message: `Implemented feature in critical category "${row.category}" has no tests`,
        file: filePath,
        line: row.lineNumber,
        category: row.category,
        feature: row.feature,
      });
    }
  }

  return errors;
}

// =============================================================================
// Main
// =============================================================================

function main() {
  console.log('');
  console.log('='.repeat(70));
  console.log(' TRACEABILITY CHECK');
  console.log('='.repeat(70));
  console.log('');

  /** @type {ValidationError[]} */
  const allErrors = [];

  // Step 1: Check required files exist
  console.log('1. Checking required files exist...');
  const fileErrors = checkFilesExist();
  allErrors.push(...fileErrors);

  if (fileErrors.length > 0) {
    console.log('   ❌ Missing required files');
    for (const err of fileErrors) {
      console.log(`      - ${err.message}`);
    }
    printSummary(allErrors);
    process.exit(1);
  }
  console.log('   ✓ All required files exist');

  // Read file contents
  const ledgerContent = readFileSync(join(ROOT_DIR, LEDGER_PATH), 'utf-8');
  const gapContent = readFileSync(join(ROOT_DIR, GAP_REGISTER_PATH), 'utf-8');

  // Step 2: Check for forbidden tokens
  console.log('');
  console.log('2. Checking for forbidden tokens...');
  const ledgerTokenErrors = checkForbiddenTokens(ledgerContent, LEDGER_PATH);
  const gapTokenErrors = checkForbiddenTokens(gapContent, GAP_REGISTER_PATH);
  allErrors.push(...ledgerTokenErrors, ...gapTokenErrors);

  if (ledgerTokenErrors.length > 0 || gapTokenErrors.length > 0) {
    console.log(`   ❌ Found ${ledgerTokenErrors.length + gapTokenErrors.length} forbidden tokens`);
  } else {
    console.log('   ✓ No forbidden tokens found');
  }

  // Step 3: Parse ledger tables
  console.log('');
  console.log('3. Parsing ledger tables...');
  const ledgerRows = parseLedgerTables(ledgerContent);
  console.log(`   ✓ Found ${ledgerRows.length} feature rows`);

  // Step 4: Validate referenced paths
  console.log('');
  console.log('4. Validating referenced file paths...');
  const pathErrors = checkReferencedPaths(ledgerRows, LEDGER_PATH);
  allErrors.push(...pathErrors);

  if (pathErrors.length > 0) {
    console.log(`   ❌ Found ${pathErrors.length} missing paths`);
  } else {
    console.log('   ✓ All referenced paths exist');
  }

  // Step 5: Check critical category tests
  console.log('');
  console.log('5. Checking test coverage for critical categories...');
  const testErrors = checkCriticalCategoryTests(ledgerRows, LEDGER_PATH);
  allErrors.push(...testErrors);

  if (testErrors.length > 0) {
    console.log(`   ❌ Found ${testErrors.length} missing test requirements`);
  } else {
    console.log('   ✓ All critical category features have tests');
  }

  // Print summary
  printSummary(allErrors);

  // Exit with appropriate code
  process.exit(allErrors.length > 0 ? 1 : 0);
}

/**
 * Print a summary of all errors.
 *
 * @param {ValidationError[]} errors
 */
function printSummary(errors) {
  console.log('');
  console.log('='.repeat(70));

  if (errors.length === 0) {
    console.log(' ✅ TRACEABILITY CHECK PASSED');
    console.log('='.repeat(70));
    console.log('');
    return;
  }

  console.log(` ❌ TRACEABILITY CHECK FAILED (${errors.length} errors)`);
  console.log('='.repeat(70));
  console.log('');

  // Group errors by type
  const byType = {};
  for (const err of errors) {
    if (!byType[err.type]) byType[err.type] = [];
    byType[err.type].push(err);
  }

  // Print errors grouped by type
  for (const [type, typeErrors] of Object.entries(byType)) {
    console.log(`[${type.toUpperCase()}] (${typeErrors.length})`);
    console.log('-'.repeat(40));

    for (const err of typeErrors) {
      let location = '';
      if (err.file) location += err.file;
      if (err.line) location += `:${err.line}`;

      console.log(`  ${err.message}`);
      if (location) console.log(`    at ${location}`);
      if (err.category) console.log(`    category: ${err.category}`);
      if (err.feature) console.log(`    feature: ${err.feature}`);
      console.log('');
    }
  }
}

// Run main
main();
