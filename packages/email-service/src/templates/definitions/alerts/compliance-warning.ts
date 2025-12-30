/**
 * Compliance Warning Email Template
 */

import type { EmailTemplate } from '../../../types';
import {
  wrapInLayout,
  createHeading,
  createParagraph,
  createButton,
  createDivider,
  escapeHtml,
} from '../../layouts/base';

export interface ComplianceWarningData {
  recipientFirstName: string;
  propertyAddress: string;
  warningType: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  actionRequired: string;
  deadline?: string;
  dashboardUrl: string;
}

export const complianceWarningTemplate: EmailTemplate<ComplianceWarningData> = {
  id: 'alerts.compliance-warning',
  name: 'Compliance Warning',
  description: 'Sent when there is a compliance issue that needs attention',
  subject: (data) => `⚠️ Compliance Alert: ${data.warningType}`,
  defaultPriority: 'high',
  requiredFields: ['recipientFirstName', 'propertyAddress', 'warningType', 'description', 'severity', 'actionRequired', 'dashboardUrl'],

  html: (data) => {
    const severityColors: Record<string, { bg: string; text: string; label: string }> = {
      low: { bg: '#dbeafe', text: '#1e40af', label: 'Low Priority' },
      medium: { bg: '#fef3c7', text: '#92400e', label: 'Medium Priority' },
      high: { bg: '#fee2e2', text: '#991b1b', label: 'High Priority' },
      critical: { bg: '#7f1d1d', text: '#ffffff', label: 'Critical' },
    };

    const severityStyle = severityColors[data.severity] ?? severityColors['medium']!

    const content = `
      ${createHeading(`Hi ${escapeHtml(data.recipientFirstName)},`)}

      ${createParagraph(`A compliance issue has been detected for your property at <strong>${escapeHtml(data.propertyAddress)}</strong> that requires your attention.`)}

      <div style="background-color: ${severityStyle.bg}; color: ${severityStyle.text}; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p style="margin: 0 0 8px 0; font-weight: 600; font-size: 16px;">
          ${escapeHtml(data.warningType)}
        </p>
        <p style="margin: 0; font-size: 14px;">
          <span style="display: inline-block; background: ${severityStyle.text}; color: ${severityStyle.bg}; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600;">
            ${severityStyle.label}
          </span>
        </p>
      </div>

      ${createParagraph(`<strong>Details:</strong> ${escapeHtml(data.description)}`)}

      ${createDivider()}

      ${createHeading('Required Action', 2)}

      ${createParagraph(escapeHtml(data.actionRequired))}

      ${data.deadline ? createParagraph(`<strong>Deadline:</strong> ${escapeHtml(data.deadline)}`) : ''}

      ${createButton('View in Dashboard', data.dashboardUrl)}

      ${createParagraph("Please address this issue as soon as possible to ensure compliance with local regulations.")}
    `;

    return wrapInLayout(content, {
      title: 'Compliance Alert',
      preheader: `Action required: ${data.warningType} for ${data.propertyAddress}`,
    });
  },

  text: (data) => `
Hi ${data.recipientFirstName},

A compliance issue has been detected for your property at ${data.propertyAddress} that requires your attention.

---

Issue: ${data.warningType}
Severity: ${data.severity.toUpperCase()}

Details: ${data.description}

---

Required Action:
${data.actionRequired}

${data.deadline ? `Deadline: ${data.deadline}` : ''}

View in dashboard: ${data.dashboardUrl}

Please address this issue as soon as possible to ensure compliance with local regulations.

---
RealRiches
  `.trim(),
};
