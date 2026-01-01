/**
 * Compliance Evidence Emitter
 *
 * Emits SOC2 evidence records for compliance enforcement decisions.
 */

import { getControlMapping } from '../control-mappings';
import { getEvidenceService } from '../service';
import type { EvidenceEventOutcome } from '../types';

export interface ComplianceDecision {
  passed: boolean;
  violations: Array<{
    code: string;
    severity: string;
    message: string;
  }>;
  recommendedFixes: Array<{
    action: string;
  }>;
  marketPack: string;
  policyVersion: string;
  checksPerformed: string[];
}

export interface GateResult {
  allowed: boolean;
  decision: ComplianceDecision;
  blockedReason?: string;
}

export interface EnforcementContext {
  action: string;
  entityType: string;
  entityId: string;
  marketId?: string;
  userId?: string;
  organizationId?: string;
}

export interface ComplianceEventInput {
  context: EnforcementContext;
  result: GateResult;
  actorId?: string;
  actorEmail?: string;
  complianceCheckId?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Emit evidence for compliance enforcement decisions
 */
export function emitComplianceEvidence(event: ComplianceEventInput): void {
  const eventType = event.result.allowed ? 'compliance.gate_passed' : 'compliance.gate_blocked';
  const mapping = getControlMapping(eventType);

  if (!mapping) {
    return;
  }

  const service = getEvidenceService();

  service.emit({
    controlId: mapping.controlId,
    category: mapping.category,
    eventType,
    eventOutcome: mapping.outcomeDefault as EvidenceEventOutcome,
    summary: event.result.allowed
      ? `Compliance gate passed for ${event.context.action} on ${event.context.entityType}`
      : `Compliance gate BLOCKED ${event.context.action} on ${event.context.entityType}: ${event.result.blockedReason}`,
    scope: 'org',
    actorId: event.actorId || event.context.userId,
    actorEmail: event.actorEmail,
    actorType: event.actorId ? 'user' : 'system',
    organizationId: event.context.organizationId,
    entityType: event.context.entityType,
    entityId: event.context.entityId,
    complianceCheckId: event.complianceCheckId,
    details: {
      action: event.context.action,
      marketId: event.context.marketId,
      marketPack: event.result.decision.marketPack,
      policyVersion: event.result.decision.policyVersion,
      checksPerformed: event.result.decision.checksPerformed,
      violationCount: event.result.decision.violations.length,
      violations: event.result.decision.violations.map((v) => ({
        code: v.code,
        severity: v.severity,
        message: v.message,
      })),
      recommendedFixes: event.result.decision.recommendedFixes.map((f) => f.action),
      blocked: !event.result.allowed,
      blockedReason: event.result.blockedReason,
    },
    ipAddress: event.ipAddress,
    userAgent: event.userAgent,
  });
}
