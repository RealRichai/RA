/**
 * Policy Expiring Email Template
 */

import type { EmailTemplate } from '../../../types';
import {
  wrapInLayout,
  createHeading,
  createParagraph,
  createButton,
  escapeHtml,
} from '../../layouts/base';

export interface PolicyExpiringData {
  tenantFirstName: string;
  propertyAddress: string;
  policyType: string;
  provider: string;
  expirationDate: string;
  daysRemaining: number;
  premium: string;
  autoRenew: boolean;
  renewalUrl?: string;
  supportEmail: string;
}

export const policyExpiringTemplate: EmailTemplate<PolicyExpiringData> = {
  id: 'policy.expiring',
  name: 'Policy Expiring',
  description: 'Sent before a policy (insurance, deposit alternative) expires',
  subject: (data) => `Your ${data.policyType} expires in ${data.daysRemaining} days`,
  defaultPriority: 'high',
  requiredFields: ['tenantFirstName', 'propertyAddress', 'policyType', 'provider', 'expirationDate', 'daysRemaining', 'premium', 'autoRenew', 'supportEmail'],

  html: (data) => {
    const urgencyColor = data.daysRemaining <= 7 ? '#dc2626' : '#d97706';

    let renewalNote = '';
    if (data.autoRenew) {
      renewalNote = `<div style="background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 12px 16px; margin: 16px 0;">
        <strong style="color: #059669;">Auto-renewal enabled</strong>
        <p style="margin: 4px 0 0 0; color: #047857;">Your policy will automatically renew at ${escapeHtml(data.premium)}/month. No action required.</p>
      </div>`;
    } else {
      renewalNote = `<div style="background-color: #fffbeb; border-left: 4px solid #d97706; padding: 12px 16px; margin: 16px 0;">
        <strong style="color: #d97706;">Action Required</strong>
        <p style="margin: 4px 0 0 0; color: #92400e;">Your policy will not automatically renew. Please renew before ${escapeHtml(data.expirationDate)} to maintain coverage.</p>
      </div>`;
    }

    const content = `
      ${createHeading(`Hi ${escapeHtml(data.tenantFirstName)},`)}

      ${createParagraph(`Your <strong>${escapeHtml(data.policyType)}</strong> from ${escapeHtml(data.provider)} for ${escapeHtml(data.propertyAddress)} expires on <strong style="color: ${urgencyColor};">${escapeHtml(data.expirationDate)}</strong> (${data.daysRemaining} days from now).`)}

      ${renewalNote}

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
          <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Premium</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 600;">${escapeHtml(data.premium)}/month</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Expiration</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600; color: ${urgencyColor};">${escapeHtml(data.expirationDate)}</td>
        </tr>
      </table>

      ${!data.autoRenew && data.renewalUrl ? createButton('Renew Now', data.renewalUrl) : ''}

      ${createParagraph(`Questions? Contact us at <a href="mailto:${escapeHtml(data.supportEmail)}" style="color: #2563eb;">${escapeHtml(data.supportEmail)}</a>.`)}
    `;

    return wrapInLayout(content, {
      title: 'Policy Expiration Notice',
      preheader: `Your ${data.policyType} expires on ${data.expirationDate}`,
    });
  },

  text: (data) => {
    const renewalNote = data.autoRenew
      ? `Auto-renewal is enabled. Your policy will automatically renew at ${data.premium}/month.`
      : `Action Required: Your policy will not automatically renew. Please renew before ${data.expirationDate} to maintain coverage.`;

    return `
Hi ${data.tenantFirstName},

Your ${data.policyType} from ${data.provider} for ${data.propertyAddress} expires on ${data.expirationDate} (${data.daysRemaining} days from now).

${renewalNote}

Policy Details:
- Policy Type: ${data.policyType}
- Provider: ${data.provider}
- Premium: ${data.premium}/month
- Expiration: ${data.expirationDate}

${!data.autoRenew && data.renewalUrl ? `Renew now: ${data.renewalUrl}` : ''}

Questions? Contact us at ${data.supportEmail}.

---
RealRiches
    `.trim();
  },
};
