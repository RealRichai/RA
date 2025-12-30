/**
 * Lease Created Email Template
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

export interface LeaseCreatedData {
  tenantFirstName: string;
  propertyAddress: string;
  unitNumber?: string;
  leaseStartDate: string;
  leaseEndDate: string;
  monthlyRent: string;
  securityDeposit: string;
  leaseUrl: string;
  landlordName: string;
}

export const leaseCreatedTemplate: EmailTemplate<LeaseCreatedData> = {
  id: 'lease.created',
  name: 'Lease Created',
  description: 'Sent when a new lease is created for a tenant',
  subject: 'Your new lease agreement is ready',
  defaultPriority: 'high',
  requiredFields: ['tenantFirstName', 'propertyAddress', 'leaseStartDate', 'leaseEndDate', 'monthlyRent', 'leaseUrl', 'landlordName'],

  html: (data) => {
    const address = data.unitNumber
      ? `${data.propertyAddress}, Unit ${data.unitNumber}`
      : data.propertyAddress;

    const content = `
      ${createHeading(`Hi ${escapeHtml(data.tenantFirstName)},`)}

      ${createParagraph(`Great news! Your lease agreement for <strong>${escapeHtml(address)}</strong> is ready for review.`)}

      ${createDivider()}

      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px;">
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Property:</td>
          <td style="padding: 8px 0; font-weight: 600;">${escapeHtml(address)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Lease Term:</td>
          <td style="padding: 8px 0; font-weight: 600;">${escapeHtml(data.leaseStartDate)} - ${escapeHtml(data.leaseEndDate)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Monthly Rent:</td>
          <td style="padding: 8px 0; font-weight: 600;">${escapeHtml(data.monthlyRent)}</td>
        </tr>
        ${data.securityDeposit ? `
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Security Deposit:</td>
          <td style="padding: 8px 0; font-weight: 600;">${escapeHtml(data.securityDeposit)}</td>
        </tr>
        ` : ''}
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Landlord:</td>
          <td style="padding: 8px 0; font-weight: 600;">${escapeHtml(data.landlordName)}</td>
        </tr>
      </table>

      ${createButton('Review & Sign Lease', data.leaseUrl)}

      ${createParagraph("Please review the lease carefully before signing. If you have any questions, contact your landlord or our support team.")}
    `;

    return wrapInLayout(content, {
      title: 'Your Lease Agreement',
      preheader: `Your lease for ${address} is ready for review`,
    });
  },

  text: (data) => {
    const address = data.unitNumber
      ? `${data.propertyAddress}, Unit ${data.unitNumber}`
      : data.propertyAddress;

    return `
Hi ${data.tenantFirstName},

Great news! Your lease agreement for ${address} is ready for review.

---

Lease Details:

Property: ${address}
Lease Term: ${data.leaseStartDate} - ${data.leaseEndDate}
Monthly Rent: ${data.monthlyRent}
${data.securityDeposit ? `Security Deposit: ${data.securityDeposit}` : ''}
Landlord: ${data.landlordName}

---

Review and sign your lease here:
${data.leaseUrl}

Please review the lease carefully before signing. If you have any questions, contact your landlord or our support team.

---
RealRiches
    `.trim();
  },
};
