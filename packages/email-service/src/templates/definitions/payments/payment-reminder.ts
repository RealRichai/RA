/**
 * Payment Reminder Email Template
 */

import type { EmailTemplate } from '../../../types';
import {
  wrapInLayout,
  createHeading,
  createParagraph,
  createButton,
  escapeHtml,
} from '../../layouts/base';

export interface PaymentReminderData {
  tenantFirstName: string;
  propertyAddress: string;
  amount: string;
  dueDate: string;
  daysUntilDue: number;
  autoPayEnabled: boolean;
  paymentUrl?: string;
  supportEmail: string;
}

export const paymentReminderTemplate: EmailTemplate<PaymentReminderData> = {
  id: 'payment.reminder',
  name: 'Payment Reminder',
  description: 'Sent before rent payment is due',
  subject: (data) => `Rent payment of ${data.amount} due in ${data.daysUntilDue} days`,
  defaultPriority: 'normal',
  requiredFields: ['tenantFirstName', 'propertyAddress', 'amount', 'dueDate', 'daysUntilDue', 'autoPayEnabled', 'supportEmail'],

  html: (data) => {
    const urgencyColor = data.daysUntilDue <= 3 ? '#dc2626' : '#d97706';

    let actionText = '';
    if (data.autoPayEnabled) {
      actionText = `<div style="background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 12px 16px; margin: 16px 0;">
        <strong style="color: #059669;">Auto-pay is enabled</strong>
        <p style="margin: 4px 0 0 0; color: #047857;">Your payment will be processed automatically on the due date.</p>
      </div>`;
    } else {
      actionText = createButton('Pay Now', data.paymentUrl || '#');
    }

    const content = `
      ${createHeading(`Hi ${escapeHtml(data.tenantFirstName)},`)}

      ${createParagraph(`Your rent payment of <strong>${escapeHtml(data.amount)}</strong> for ${escapeHtml(data.propertyAddress)} is due on <strong style="color: ${urgencyColor};">${escapeHtml(data.dueDate)}</strong> (${data.daysUntilDue} days from now).`)}

      ${actionText}

      ${createParagraph(`Questions about your payment? Contact us at <a href="mailto:${escapeHtml(data.supportEmail)}" style="color: #2563eb;">${escapeHtml(data.supportEmail)}</a>.`)}
    `;

    return wrapInLayout(content, {
      title: 'Payment Reminder',
      preheader: `Your rent of ${data.amount} is due on ${data.dueDate}`,
    });
  },

  text: (data) => {
    const autoPayNote = data.autoPayEnabled
      ? '\nAuto-pay is enabled. Your payment will be processed automatically on the due date.'
      : `\nPay now: ${data.paymentUrl || 'Log in to your account'}`;

    return `
Hi ${data.tenantFirstName},

Your rent payment of ${data.amount} for ${data.propertyAddress} is due on ${data.dueDate} (${data.daysUntilDue} days from now).
${autoPayNote}

Questions? Contact us at ${data.supportEmail}.

---
RealRiches
    `.trim();
  },
};
