/**
 * Email Verification Template
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

export interface EmailVerificationData {
  firstName: string;
  verificationUrl: string;
  expiresIn: string;
}

export const emailVerificationTemplate: EmailTemplate<EmailVerificationData> = {
  id: 'auth.email-verification',
  name: 'Email Verification',
  description: 'Sent to verify a user\'s email address',
  subject: 'Verify your email address',
  defaultPriority: 'high',
  requiredFields: ['firstName', 'verificationUrl', 'expiresIn'],

  html: (data) => {
    const content = `
      ${createHeading(`Welcome, ${escapeHtml(data.firstName)}!`)}

      ${createParagraph("Thanks for signing up for RealRiches. Please verify your email address to complete your registration.")}

      ${createButton('Verify Email Address', data.verificationUrl)}

      ${createParagraph(`This link will expire in <strong>${escapeHtml(data.expiresIn)}</strong>.`)}

      ${createMutedText("If you didn't create an account with RealRiches, you can safely ignore this email.")}
    `;

    return wrapInLayout(content, {
      title: 'Verify Your Email',
      preheader: 'Please verify your email address to complete your registration',
    });
  },

  text: (data) => `
Welcome, ${data.firstName}!

Thanks for signing up for RealRiches. Please verify your email address to complete your registration.

Verify your email by visiting this link:
${data.verificationUrl}

This link will expire in ${data.expiresIn}.

If you didn't create an account with RealRiches, you can safely ignore this email.

---
RealRiches
  `.trim(),
};
