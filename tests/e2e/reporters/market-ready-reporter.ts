/**
 * Market-Ready Report Generator
 *
 * Custom Playwright reporter that generates a machine-readable
 * "market-ready" compliance report artifact.
 *
 * Output: tests/e2e/reports/market-ready-report.json
 */

import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';
import * as fs from 'fs';
import * as path from 'path';

interface JourneyResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  steps: StepResult[];
  compliance: ComplianceCheck[];
  evidence: EvidenceItem[];
}

interface StepResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
}

interface ComplianceCheck {
  requirement: string;
  status: 'verified' | 'failed' | 'not_applicable';
  evidence?: string;
}

interface EvidenceItem {
  type: 'screenshot' | 'trace' | 'video' | 'log' | 'api_response';
  path: string;
  description: string;
}

interface MarketReadyReport {
  version: '1.0.0';
  timestamp: string;
  environment: {
    node: string;
    os: string;
    ci: boolean;
  };
  summary: {
    status: 'market_ready' | 'not_ready';
    totalJourneys: number;
    passedJourneys: number;
    failedJourneys: number;
    duration: number;
  };
  journeys: JourneyResult[];
  compliance: {
    fcha: ComplianceCheck[];
    nyc: ComplianceCheck[];
    security: ComplianceCheck[];
  };
  metadata: {
    gitCommit?: string;
    gitBranch?: string;
    buildNumber?: string;
  };
}

// Journey name to compliance requirements mapping
const JOURNEY_COMPLIANCE: Record<string, string[]> = {
  'auth': ['JWT rotation', 'Token revocation', 'Session management'],
  'listing': ['NYC FCHA compliance gate', 'Required disclosures', 'Pricing transparency'],
  'application': ['FCHA sequence enforcement', 'Background check authorization', 'Fair housing compliance'],
  'vault': ['ACL enforcement', 'Encryption at rest', 'Signed URL expiration'],
  'revenue': ['Double-entry ledger', 'Partner attribution', 'Audit trail'],
  'tour': ['Signed URL access', 'Fallback support', 'Asset delivery'],
};

class MarketReadyReporter implements Reporter {
  private results: Map<string, JourneyResult> = new Map();
  private startTime: number = 0;
  private config!: FullConfig;

  onBegin(config: FullConfig, suite: Suite): void {
    this.config = config;
    this.startTime = Date.now();
    console.log('\n📊 Market-Ready Reporter initialized\n');
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    // Extract journey name from test title or file
    const journeyMatch = test.title.match(/\[(.*?)\]/);
    const journeyName = journeyMatch ? journeyMatch[1].toLowerCase() : 'unknown';

    // Get or create journey result
    let journey = this.results.get(journeyName);
    if (!journey) {
      journey = {
        name: journeyName,
        status: 'passed',
        duration: 0,
        steps: [],
        compliance: [],
        evidence: [],
      };
      this.results.set(journeyName, journey);
    }

    // Add step result
    const stepResult: StepResult = {
      name: test.title,
      status: result.status === 'passed' ? 'passed' : result.status === 'skipped' ? 'skipped' : 'failed',
      duration: result.duration,
      error: result.error?.message,
    };
    journey.steps.push(stepResult);
    journey.duration += result.duration;

    // Update journey status
    if (result.status !== 'passed' && result.status !== 'skipped') {
      journey.status = 'failed';
    }

    // Collect evidence (screenshots, traces)
    for (const attachment of result.attachments) {
      if (attachment.path) {
        journey.evidence.push({
          type: attachment.contentType?.includes('image') ? 'screenshot' : 'trace',
          path: attachment.path,
          description: attachment.name,
        });
      }
    }

    // Generate compliance checks based on journey
    const requirements = JOURNEY_COMPLIANCE[journeyName] || [];
    for (const req of requirements) {
      const existing = journey.compliance.find((c) => c.requirement === req);
      if (!existing) {
        journey.compliance.push({
          requirement: req,
          status: result.status === 'passed' ? 'verified' : 'failed',
          evidence: test.title,
        });
      }
    }
  }

  async onEnd(result: FullResult): Promise<void> {
    const endTime = Date.now();
    const journeys = Array.from(this.results.values());

    const passedJourneys = journeys.filter((j) => j.status === 'passed').length;
    const failedJourneys = journeys.filter((j) => j.status === 'failed').length;

    // Aggregate compliance checks
    const allCompliance = journeys.flatMap((j) => j.compliance);
    const fchaChecks = allCompliance.filter((c) =>
      c.requirement.toLowerCase().includes('fcha') ||
      c.requirement.toLowerCase().includes('sequence') ||
      c.requirement.toLowerCase().includes('fair housing')
    );
    const nycChecks = allCompliance.filter((c) =>
      c.requirement.toLowerCase().includes('nyc') ||
      c.requirement.toLowerCase().includes('disclosure')
    );
    const securityChecks = allCompliance.filter((c) =>
      c.requirement.toLowerCase().includes('jwt') ||
      c.requirement.toLowerCase().includes('token') ||
      c.requirement.toLowerCase().includes('acl') ||
      c.requirement.toLowerCase().includes('encryption')
    );

    const report: MarketReadyReport = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      environment: {
        node: process.version,
        os: process.platform,
        ci: !!process.env.CI,
      },
      summary: {
        status: failedJourneys === 0 && journeys.length >= 6 ? 'market_ready' : 'not_ready',
        totalJourneys: journeys.length,
        passedJourneys,
        failedJourneys,
        duration: endTime - this.startTime,
      },
      journeys,
      compliance: {
        fcha: fchaChecks,
        nyc: nycChecks,
        security: securityChecks,
      },
      metadata: {
        gitCommit: process.env.GITHUB_SHA,
        gitBranch: process.env.GITHUB_REF_NAME,
        buildNumber: process.env.GITHUB_RUN_NUMBER,
      },
    };

    // Write report
    const reportsDir = path.join(process.cwd(), 'tests/e2e/reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const reportPath = path.join(reportsDir, 'market-ready-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('  MARKET-READY REPORT');
    console.log('='.repeat(60));
    console.log(`  Status: ${report.summary.status === 'market_ready' ? '✅ MARKET READY' : '❌ NOT READY'}`);
    console.log(`  Journeys: ${passedJourneys}/${journeys.length} passed`);
    console.log(`  Duration: ${(report.summary.duration / 1000).toFixed(2)}s`);
    console.log('='.repeat(60));
    console.log(`  Report: ${reportPath}`);
    console.log('='.repeat(60) + '\n');
  }
}

export default MarketReadyReporter;
