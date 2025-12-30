/**
 * Lease Expiring Email Template
 */

import type { EmailTemplate } from '../../../types';
import {
  wrapInLayout,
  createHeading,
  createParagraph,
  createButton,
  escapeHtml,
} from '../../layouts/base';

export interface LeaseExpiringData {
  tenantFirstName: string;
  propertyAddress: string;
  unitNumber?: string;
  expirationDate: string;
  daysRemaining: number;
  renewalUrl?: string;
  contactEmail: string;
}

export const leaseExpiringTemplate: EmailTemplate<LeaseExpiringData> = {
  id: 'lease.expiring',
  name: 'Lease Expiring',
  description: 'Sent when a lease is about to expire',
  subject: (data) => `Your lease expires in ${data.daysRemaining} days`,
  defaultPriority: 'high',
  requiredFields: ['tenantFirstName', 'propertyAddress', 'expirationDate', 'daysRemaining', 'contactEmail'],

  html: (data) => {
    const address = data.unitNumber
      ? `${data.propertyAddress}, Unit ${data.unitNumber}`
      : data.propertyAddress;

    const urgencyColor = data.daysRemaining <= 30 ? '#dc2626' : '#d97706';

    const content = `
      ${createHeading(`Hi ${escapeHtml(data.tenantFirstName)},`)}

      ${createParagraph(`This is a friendly reminder that your lease at <strong>${escapeHtml(address)}</strong> will expire on <strong style="color: ${urgencyColor};">${escapeHtml(data.expirationDate)}</strong> (${data.daysRemaining} days from now).`)}

      ${createParagraph("Please take action to either:")}

      <ul style="margin: 0 0 16px 0; padding-left: 24px; color: #1f2937;">
        <li style="margin-bottom: 8px;"><strong>Renew your lease</strong> - Contact your landlord to discuss renewal options</li>
        <li style="margin-bottom: 8px;"><strong>Provide move-out notice</strong> - If you plan to move out, please provide proper notice as specified in your lease</li>
      </ul>

      ${data.renewalUrl ? createButton('View Renewal Options', data.renewalUrl) : ''}

      ${createParagraph(`Questions? Contact your landlord at <a href="mailto:${escapeHtml(data.contactEmail)}" style="color: #2563eb;">${escapeHtml(data.contactEmail)}</a>.`)}
    `;

    return wrapInLayout(content, {
      title: 'Lease Expiration Reminder',
      preheader: `Your lease at ${address} expires on ${data.expirationDate}`,
    });
  },

  text: (data) => {
    const address = data.unitNumber
      ? `${data.propertyAddress}, Unit ${data.unitNumber}`
      : data.propertyAddress;

    return `
Hi ${data.tenantFirstName},

This is a friendly reminder that your lease at ${address} will expire on ${data.expirationDate} (${data.daysRemaining} days from now).

Please take action to either:

• Renew your lease - Contact your landlord to discuss renewal options
• Provide move-out notice - If you plan to move out, please provide proper notice as specified in your lease

${data.renewalUrl ? `View renewal options: ${data.renewalUrl}` : ''}

Questions? Contact your landlord at ${data.contactEmail}.

---
RealRiches
    `.trim();
  },
};
