/**
 * Late Payment Notice Email Template
 */

import type { EmailTemplate } from '../../../types';
import {
  wrapInLayout,
  createHeading,
  createParagraph,
  createButton,
  escapeHtml,
} from '../../layouts/base';

export interface PaymentLateData {
  tenantFirstName: string;
  propertyAddress: string;
  amountDue: string;
  dueDate: string;
  daysOverdue: number;
  lateFeeAmount?: string;
  lateFeeApplied: boolean;
  gracePeriodDays?: number;
  paymentUrl?: string;
  supportEmail: string;
}

export const paymentLateTemplate: EmailTemplate<PaymentLateData> = {
  id: 'payment.late',
  name: 'Late Payment Notice',
  description: 'Sent when rent payment is overdue',
  subject: (data) => `URGENT: Rent payment ${data.daysOverdue} days overdue`,
  defaultPriority: 'high',
  requiredFields: ['tenantFirstName', 'propertyAddress', 'amountDue', 'dueDate', 'daysOverdue', 'lateFeeApplied', 'supportEmail'],

  html: (data) => {
    let lateFeeNote = '';
    if (data.lateFeeApplied && data.lateFeeAmount) {
      lateFeeNote = `<div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 12px 16px; margin: 16px 0;">
        <strong style="color: #dc2626;">Late Fee Applied</strong>
        <p style="margin: 4px 0 0 0; color: #b91c1c;">A late fee of ${escapeHtml(data.lateFeeAmount)} has been added to your balance.</p>
      </div>`;
    } else if (data.gracePeriodDays && data.daysOverdue <= data.gracePeriodDays) {
      const daysLeft = data.gracePeriodDays - data.daysOverdue;
      lateFeeNote = `<div style="background-color: #fffbeb; border-left: 4px solid #d97706; padding: 12px 16px; margin: 16px 0;">
        <strong style="color: #d97706;">Grace Period</strong>
        <p style="margin: 4px 0 0 0; color: #92400e;">You have ${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining before late fees apply.</p>
      </div>`;
    }

    const content = `
      ${createHeading(`Hi ${escapeHtml(data.tenantFirstName)},`)}

      ${createParagraph(`<strong style="color: #dc2626;">Your rent payment is ${data.daysOverdue} days overdue.</strong>`)}

      ${createParagraph(`Your payment of <strong>${escapeHtml(data.amountDue)}</strong> for ${escapeHtml(data.propertyAddress)} was due on ${escapeHtml(data.dueDate)}.`)}

      ${lateFeeNote}

      ${createParagraph("Please make your payment immediately to avoid additional fees and potential lease violations.")}

      ${createButton('Pay Now', data.paymentUrl || '#')}

      ${createParagraph(`If you're experiencing financial difficulties, please contact us at <a href="mailto:${escapeHtml(data.supportEmail)}" style="color: #2563eb;">${escapeHtml(data.supportEmail)}</a> to discuss payment options.`)}
    `;

    return wrapInLayout(content, {
      title: 'Late Payment Notice',
      preheader: `Your rent payment of ${data.amountDue} is ${data.daysOverdue} days overdue`,
    });
  },

  text: (data) => {
    let lateFeeNote = '';
    if (data.lateFeeApplied && data.lateFeeAmount) {
      lateFeeNote = `\nIMPORTANT: A late fee of ${data.lateFeeAmount} has been added to your balance.`;
    } else if (data.gracePeriodDays && data.daysOverdue <= data.gracePeriodDays) {
      const daysLeft = data.gracePeriodDays - data.daysOverdue;
      lateFeeNote = `\nNote: You have ${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining in your grace period before late fees apply.`;
    }

    return `
Hi ${data.tenantFirstName},

URGENT: Your rent payment is ${data.daysOverdue} days overdue.

Your payment of ${data.amountDue} for ${data.propertyAddress} was due on ${data.dueDate}.
${lateFeeNote}

Please make your payment immediately to avoid additional fees and potential lease violations.

Pay now: ${data.paymentUrl || 'Log in to your account'}

If you're experiencing financial difficulties, please contact us at ${data.supportEmail} to discuss payment options.

---
RealRiches
    `.trim();
  },
};
