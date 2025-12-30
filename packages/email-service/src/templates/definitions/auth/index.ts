/**
 * Auth Email Templates
 */

export * from './password-reset';
export * from './email-verification';
export * from './welcome';

import { passwordResetTemplate } from './password-reset';
import { emailVerificationTemplate } from './email-verification';
import { welcomeTemplate } from './welcome';

export const authTemplates = [
  passwordResetTemplate,
  emailVerificationTemplate,
  welcomeTemplate,
];
