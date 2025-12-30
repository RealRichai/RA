/**
 * Auth Email Templates
 */

export * from './password-reset';
export * from './email-verification';
export * from './welcome';

import { emailVerificationTemplate } from './email-verification';
import { passwordResetTemplate } from './password-reset';
import { welcomeTemplate } from './welcome';

export const authTemplates = [
  passwordResetTemplate,
  emailVerificationTemplate,
  welcomeTemplate,
];
