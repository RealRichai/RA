/**
 * Call Grading System
 *
 * Rubric-based grading for call quality, compliance, and effectiveness.
 */

import { randomUUID } from 'crypto';

import type { Result } from '../types';
import { Ok, Err } from '../types';

import type {
  GradingRubric,
  GradingCriterion,
  CallGrade,
  Grade,
  Transcript,
} from './types';

// =============================================================================
// Grading Store Interface
// =============================================================================

export interface GradingStore {
  saveRubric(rubric: GradingRubric): Promise<Result<void>>;
  getRubric(rubricId: string): Promise<Result<GradingRubric | null>>;
  getRubricByAgentType(agentType: string): Promise<Result<GradingRubric | null>>;
  listRubrics(): Promise<Result<GradingRubric[]>>;

  saveGrade(grade: CallGrade): Promise<Result<void>>;
  getGrade(gradeId: string): Promise<Result<CallGrade | null>>;
  getGradeByCall(callId: string): Promise<Result<CallGrade | null>>;
  listGrades(options?: { callIds?: string[]; limit?: number }): Promise<Result<CallGrade[]>>;
}

// =============================================================================
// In-Memory Grading Store (for testing)
// =============================================================================

export class InMemoryGradingStore implements GradingStore {
  private rubrics: Map<string, GradingRubric> = new Map();
  private grades: Map<string, CallGrade> = new Map();

  saveRubric(rubric: GradingRubric): Promise<Result<void>> {
    this.rubrics.set(rubric.id, rubric);
    return Promise.resolve(Ok(undefined));
  }

  getRubric(rubricId: string): Promise<Result<GradingRubric | null>> {
    return Promise.resolve(Ok(this.rubrics.get(rubricId) || null));
  }

  getRubricByAgentType(agentType: string): Promise<Result<GradingRubric | null>> {
    for (const rubric of this.rubrics.values()) {
      if (rubric.enabled && rubric.agentTypes.includes(agentType)) {
        return Promise.resolve(Ok(rubric));
      }
    }
    return Promise.resolve(Ok(null));
  }

  listRubrics(): Promise<Result<GradingRubric[]>> {
    return Promise.resolve(Ok(Array.from(this.rubrics.values())));
  }

  saveGrade(grade: CallGrade): Promise<Result<void>> {
    this.grades.set(grade.id, grade);
    return Promise.resolve(Ok(undefined));
  }

  getGrade(gradeId: string): Promise<Result<CallGrade | null>> {
    return Promise.resolve(Ok(this.grades.get(gradeId) || null));
  }

  getGradeByCall(callId: string): Promise<Result<CallGrade | null>> {
    for (const grade of this.grades.values()) {
      if (grade.callId === callId) {
        return Promise.resolve(Ok(grade));
      }
    }
    return Promise.resolve(Ok(null));
  }

  listGrades(options?: { callIds?: string[]; limit?: number }): Promise<Result<CallGrade[]>> {
    let results = Array.from(this.grades.values());

    if (options?.callIds) {
      results = results.filter((g) => options.callIds!.includes(g.callId));
    }

    results.sort((a, b) => b.gradedAt.getTime() - a.gradedAt.getTime());

    if (options?.limit) {
      results = results.slice(0, options.limit);
    }

    return Promise.resolve(Ok(results));
  }

  clear(): void {
    this.rubrics.clear();
    this.grades.clear();
  }
}

// =============================================================================
// Grading Service
// =============================================================================

export interface GradingServiceConfig {
  store: GradingStore;
  defaultPassingThreshold?: number;
}

export interface GradingServiceHooks {
  onGradeComplete?: (grade: CallGrade) => Promise<void>;
  onFchaViolation?: (callId: string, grade: CallGrade) => Promise<void>;
  onFailedGrade?: (callId: string, grade: CallGrade) => Promise<void>;
}

export class GradingService {
  private config: GradingServiceConfig;
  private hooks: GradingServiceHooks;

  constructor(config: GradingServiceConfig, hooks: GradingServiceHooks = {}) {
    this.config = {
      defaultPassingThreshold: 70,
      ...config,
    };
    this.hooks = hooks;
  }

  /**
   * Grade a call using AI analysis.
   */
  async gradeCall(
    callId: string,
    transcript: Transcript,
    rubricId: string
  ): Promise<Result<CallGrade>> {
    const rubricResult = await this.config.store.getRubric(rubricId);
    if (!rubricResult.ok) {
      return Err('FETCH_ERROR', 'Failed to fetch rubric');
    }

    if (!rubricResult.data) {
      return Err('NOT_FOUND', `Rubric ${rubricId} not found`);
    }

    const rubric = rubricResult.data;
    const grades = this.evaluateCriteria(rubric.criteria, transcript);

    const totalScore = grades.reduce((sum, g) => sum + g.score * (rubric.criteria.find((c) => c.id === g.criterionId)?.weight || 1), 0);
    const maxPossibleScore = rubric.criteria.reduce((sum, c) => sum + c.weight * 100, 0);
    const percentageScore = maxPossibleScore > 0 ? (totalScore / maxPossibleScore) * 100 : 0;

    const passingThreshold = rubric.passingThreshold || this.config.defaultPassingThreshold!;
    const passed = percentageScore >= passingThreshold;

    // Check for FCHA violations
    const fchaGrade = grades.find((g) => {
      const criterion = rubric.criteria.find((c) => c.id === g.criterionId);
      return criterion?.category === 'fcha_compliance';
    });
    const fchaViolationDetected = fchaGrade ? fchaGrade.score < 100 : false;

    // Check for missed disclosures
    const disclosureGrade = grades.find((g) => {
      const criterion = rubric.criteria.find((c) => c.id === g.criterionId);
      return criterion?.category === 'disclosure';
    });
    const disclosuresMissed = disclosureGrade && disclosureGrade.score < 100
      ? ['Required disclosures may have been missed']
      : [];

    const callGrade: CallGrade = {
      id: `grade_${randomUUID()}`,
      callId,
      rubricId: rubric.id,
      rubricVersion: rubric.version,
      grades,
      overallScore: totalScore,
      maxPossibleScore,
      percentageScore,
      passed,
      passingThreshold,
      fchaViolationDetected,
      disclosuresMissed,
      policyViolations: [],
      gradedAt: new Date(),
      gradedBy: 'ai',
      reviewStatus: 'pending',
    };

    // Save grade
    const saveResult = await this.config.store.saveGrade(callGrade);
    if (!saveResult.ok) {
      return Err('SAVE_ERROR', 'Failed to save grade');
    }

    // Trigger hooks
    if (this.hooks.onGradeComplete) {
      await this.hooks.onGradeComplete(callGrade);
    }

    if (fchaViolationDetected && this.hooks.onFchaViolation) {
      await this.hooks.onFchaViolation(callId, callGrade);
    }

    if (!passed && this.hooks.onFailedGrade) {
      await this.hooks.onFailedGrade(callId, callGrade);
    }

    return Ok(callGrade);
  }

  /**
   * Submit human review for a grade.
   */
  async submitReview(
    gradeId: string,
    reviewedBy: string,
    decision: 'approved' | 'disputed' | 'overridden',
    notes?: string,
    updatedGrades?: Grade[]
  ): Promise<Result<CallGrade>> {
    const gradeResult = await this.config.store.getGrade(gradeId);
    if (!gradeResult.ok) {
      return Err('FETCH_ERROR', 'Failed to fetch grade');
    }

    if (!gradeResult.data) {
      return Err('NOT_FOUND', `Grade ${gradeId} not found`);
    }

    const grade = gradeResult.data;
    grade.reviewStatus = decision;
    grade.reviewNotes = notes;
    grade.gradedBy = decision === 'overridden' ? 'hybrid' : grade.gradedBy;

    if (updatedGrades) {
      for (const updated of updatedGrades) {
        const existing = grade.grades.find((g) => g.criterionId === updated.criterionId);
        if (existing) {
          existing.score = updated.score;
          existing.notes = updated.notes;
          existing.reviewedBy = reviewedBy;
          existing.reviewedAt = new Date();
        }
      }

      // Recalculate scores
      const rubricResult = await this.config.store.getRubric(grade.rubricId);
      if (rubricResult.ok && rubricResult.data) {
        const rubric = rubricResult.data;
        grade.overallScore = grade.grades.reduce(
          (sum, g) => sum + g.score * (rubric.criteria.find((c) => c.id === g.criterionId)?.weight || 1),
          0
        );
        grade.percentageScore = grade.maxPossibleScore > 0
          ? (grade.overallScore / grade.maxPossibleScore) * 100
          : 0;
        grade.passed = grade.percentageScore >= grade.passingThreshold;
      }
    }

    const saveResult = await this.config.store.saveGrade(grade);
    if (!saveResult.ok) {
      return Err('SAVE_ERROR', 'Failed to save updated grade');
    }

    return Ok(grade);
  }

  /**
   * Get grade for a call.
   */
  async getGrade(callId: string): Promise<Result<CallGrade | null>> {
    return this.config.store.getGradeByCall(callId);
  }

  /**
   * Evaluate criteria against transcript (placeholder for AI analysis).
   */
  private evaluateCriteria(criteria: GradingCriterion[], transcript: Transcript): Grade[] {
    // In production, this would use AI to analyze the transcript
    // For now, return placeholder scores
    return criteria.map((criterion) => {
      let score = 80; // Default passing score

      // Simple keyword-based scoring for demo
      switch (criterion.category) {
        case 'compliance':
          score = this.checkComplianceKeywords(transcript) ? 90 : 60;
          break;
        case 'fcha_compliance':
          score = this.checkFchaKeywords(transcript) ? 100 : 50;
          break;
        case 'professionalism':
          score = this.checkProfessionalismKeywords(transcript) ? 85 : 70;
          break;
        case 'disclosure':
          score = this.checkDisclosureKeywords(transcript) ? 95 : 65;
          break;
        case 'customer_service':
          score = 85;
          break;
        case 'effectiveness':
          score = 80;
          break;
      }

      return {
        criterionId: criterion.id,
        score,
        maxScore: 100,
        autoGraded: true,
      };
    });
  }

  // Simple keyword checks (placeholders for AI analysis)

  private checkComplianceKeywords(transcript: Transcript): boolean {
    const text = transcript.fullText.toLowerCase();
    const positiveKeywords = ['disclosure', 'terms', 'agreement', 'confirm'];
    return positiveKeywords.some((kw) => text.includes(kw));
  }

  private checkFchaKeywords(transcript: Transcript): boolean {
    const text = transcript.fullText.toLowerCase();
    const negativeKeywords = [
      'race',
      'religion',
      'national origin',
      'familial status',
      'disability',
      'color',
      'sex',
    ];
    // Return true if NO discriminatory language found
    return !negativeKeywords.some((kw) => text.includes(kw));
  }

  private checkProfessionalismKeywords(transcript: Transcript): boolean {
    const text = transcript.fullText.toLowerCase();
    const positiveKeywords = ['thank you', 'please', 'happy to help', 'appreciate'];
    return positiveKeywords.some((kw) => text.includes(kw));
  }

  private checkDisclosureKeywords(transcript: Transcript): boolean {
    const text = transcript.fullText.toLowerCase();
    const keywords = ['recorded', 'monitoring', 'quality assurance'];
    return keywords.some((kw) => text.includes(kw));
  }
}

// =============================================================================
// Default Grading Rubrics
// =============================================================================

export function createDefaultLeasingRubric(): GradingRubric {
  return {
    id: 'rubric_leasing_default',
    name: 'Leasing Agent Call Quality Rubric',
    description: 'Standard rubric for evaluating leasing agent call quality',
    version: '1.0.0',
    agentTypes: ['leasing'],
    criteria: [
      {
        id: 'crit_fcha',
        name: 'Fair Housing Compliance',
        description: 'No discriminatory language or steering based on protected classes',
        weight: 3,
        category: 'fcha_compliance',
      },
      {
        id: 'crit_disclosure',
        name: 'Required Disclosures',
        description: 'Recording consent and required property disclosures provided',
        weight: 2,
        category: 'disclosure',
      },
      {
        id: 'crit_accuracy',
        name: 'Information Accuracy',
        description: 'Property details and availability communicated accurately',
        weight: 2,
        category: 'compliance',
      },
      {
        id: 'crit_professionalism',
        name: 'Professionalism',
        description: 'Professional tone, active listening, clear communication',
        weight: 1,
        category: 'professionalism',
      },
      {
        id: 'crit_effectiveness',
        name: 'Call Effectiveness',
        description: 'Lead qualification, next steps established, proper follow-up',
        weight: 1,
        category: 'effectiveness',
      },
      {
        id: 'crit_service',
        name: 'Customer Service',
        description: 'Responsiveness, helpfulness, problem resolution',
        weight: 1,
        category: 'customer_service',
      },
    ],
    passingThreshold: 70,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function createDefaultMaintenanceRubric(): GradingRubric {
  return {
    id: 'rubric_maintenance_default',
    name: 'Maintenance Agent Call Quality Rubric',
    description: 'Standard rubric for evaluating maintenance agent call quality',
    version: '1.0.0',
    agentTypes: ['maintenance'],
    criteria: [
      {
        id: 'crit_urgency',
        name: 'Urgency Assessment',
        description: 'Proper triage and urgency classification of maintenance issues',
        weight: 3,
        category: 'compliance',
      },
      {
        id: 'crit_documentation',
        name: 'Issue Documentation',
        description: 'Complete and accurate documentation of reported issues',
        weight: 2,
        category: 'compliance',
      },
      {
        id: 'crit_professionalism',
        name: 'Professionalism',
        description: 'Empathetic and professional handling of tenant concerns',
        weight: 1,
        category: 'professionalism',
      },
      {
        id: 'crit_resolution',
        name: 'Resolution Path',
        description: 'Clear explanation of next steps and expected timeline',
        weight: 2,
        category: 'effectiveness',
      },
      {
        id: 'crit_service',
        name: 'Customer Service',
        description: 'Responsiveness and helpfulness',
        weight: 1,
        category: 'customer_service',
      },
    ],
    passingThreshold: 70,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function getDefaultRubrics(): GradingRubric[] {
  return [
    createDefaultLeasingRubric(),
    createDefaultMaintenanceRubric(),
  ];
}
