/**
 * Password Reset Email Template
 */

import type { EmailTemplate } from '../../../types';
import {
  wrapInLayout,
  createHeading,
  createParagraph,
  createButton,
  createMutedText,
  escapeHtml,
} from '../../layouts/base';

export interface PasswordResetData {
  firstName: string;
  resetUrl: string;
  expiresIn: string;
  ipAddress?: string;
  userAgent?: string;
}

export const passwordResetTemplate: EmailTemplate<PasswordResetData> = {
  id: 'auth.password-reset',
  name: 'Password Reset',
  description: 'Sent when a user requests to reset their password',
  subject: 'Reset your RealRiches password',
  defaultPriority: 'high',
  requiredFields: ['firstName', 'resetUrl', 'expiresIn'],

  html: (data) => {
    const content = `
      ${createHeading(`Hi ${escapeHtml(data.firstName)},`)}

      ${createParagraph("We received a request to reset your password for your RealRiches account.")}

      ${createParagraph("Click the button below to create a new password:")}

      ${createButton('Reset Password', data.resetUrl)}

      ${createParagraph(`This link will expire in <strong>${escapeHtml(data.expiresIn)}</strong>.`)}

      ${createParagraph("If you didn't request a password reset, you can safely ignore this email. Your password won't be changed.")}

      ${data.ipAddress ? createMutedText(`
        <strong>Request details:</strong><br>
        IP Address: ${escapeHtml(data.ipAddress)}
        ${data.userAgent ? `<br>Device: ${escapeHtml(data.userAgent)}` : ''}
      `) : ''}
    `;

    return wrapInLayout(content, {
      title: 'Reset Your Password',
      preheader: 'Reset your RealRiches password',
    });
  },

  text: (data) => `
Hi ${data.firstName},

We received a request to reset your password for your RealRiches account.

Reset your password by visiting this link:
${data.resetUrl}

This link will expire in ${data.expiresIn}.

If you didn't request a password reset, you can safely ignore this email. Your password won't be changed.

${data.ipAddress ? `Request details:
IP Address: ${data.ipAddress}
${data.userAgent ? `Device: ${data.userAgent}` : ''}` : ''}

---
RealRiches
  `.trim(),
};
