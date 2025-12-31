/**
 * Policy Renewed Email Template
 */

import type { EmailTemplate } from '../../../types';
import {
  wrapInLayout,
  createHeading,
  createParagraph,
  escapeHtml,
} from '../../layouts/base';

export interface PolicyRenewedData {
  tenantFirstName: string;
  propertyAddress: string;
  policyType: string;
  provider: string;
  newExpirationDate: string;
  newPremium: string;
  supportEmail: string;
}

export const policyRenewedTemplate: EmailTemplate<PolicyRenewedData> = {
  id: 'policy.renewed',
  name: 'Policy Renewed',
  description: 'Sent when a policy has been automatically renewed',
  subject: (data) => `Your ${data.policyType} has been renewed`,
  defaultPriority: 'normal',
  requiredFields: ['tenantFirstName', 'propertyAddress', 'policyType', 'provider', 'newExpirationDate', 'newPremium', 'supportEmail'],

  html: (data) => {
    const content = `
      ${createHeading(`Hi ${escapeHtml(data.tenantFirstName)},`)}

      <div style="background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 12px 16px; margin: 16px 0;">
        <strong style="color: #059669;">Policy Renewed Successfully</strong>
        <p style="margin: 4px 0 0 0; color: #047857;">Your coverage continues without interruption.</p>
      </div>

      ${createParagraph(`Your <strong>${escapeHtml(data.policyType)}</strong> from ${escapeHtml(data.provider)} for ${escapeHtml(data.propertyAddress)} has been automatically renewed.`)}

      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Policy Type</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 600;">${escapeHtml(data.policyType)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Provider</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 600;">${escapeHtml(data.provider)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; color: #6b7280;">New Premium</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 600;">${escapeHtml(data.newPremium)}/month</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Coverage Until</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #059669;">${escapeHtml(data.newExpirationDate)}</td>
        </tr>
      </table>

      ${createParagraph(`Questions? Contact us at <a href="mailto:${escapeHtml(data.supportEmail)}" style="color: #2563eb;">${escapeHtml(data.supportEmail)}</a>.`)}
    `;

    return wrapInLayout(content, {
      title: 'Policy Renewed',
      preheader: `Your ${data.policyType} has been renewed until ${data.newExpirationDate}`,
    });
  },

  text: (data) => {
    return `
Hi ${data.tenantFirstName},

Good news! Your ${data.policyType} from ${data.provider} for ${data.propertyAddress} has been automatically renewed.

Policy Details:
- Policy Type: ${data.policyType}
- Provider: ${data.provider}
- New Premium: ${data.newPremium}/month
- Coverage Until: ${data.newExpirationDate}

Your coverage continues without interruption.

Questions? Contact us at ${data.supportEmail}.

---
RealRiches
    `.trim();
  },
};
