/**
 * Welcome Email Template
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

export interface WelcomeData {
  firstName: string;
  dashboardUrl: string;
  userType: 'landlord' | 'tenant' | 'agent';
}

export const welcomeTemplate: EmailTemplate<WelcomeData> = {
  id: 'auth.welcome',
  name: 'Welcome',
  description: 'Sent after a user verifies their email',
  subject: (data) => `Welcome to RealRiches, ${data.firstName}!`,
  defaultPriority: 'normal',
  requiredFields: ['firstName', 'dashboardUrl', 'userType'],

  html: (data) => {
    const features = getFeaturesByUserType(data.userType);

    const content = `
      ${createHeading(`Welcome to RealRiches, ${escapeHtml(data.firstName)}!`)}

      ${createParagraph("Your account is now verified and ready to use. We're excited to have you on board!")}

      ${createButton('Go to Dashboard', data.dashboardUrl)}

      ${createDivider()}

      ${createHeading('Get Started', 2)}

      ${createParagraph("Here's what you can do with your RealRiches account:")}

      <ul style="margin: 0 0 16px 0; padding-left: 24px; color: #1f2937;">
        ${features.map((f) => `<li style="margin-bottom: 8px;">${escapeHtml(f)}</li>`).join('')}
      </ul>

      ${createParagraph("If you have any questions, our support team is here to help.")}
    `;

    return wrapInLayout(content, {
      title: 'Welcome to RealRiches',
      preheader: 'Your account is ready. Let\'s get started!',
    });
  },

  text: (data) => {
    const features = getFeaturesByUserType(data.userType);

    return `
Welcome to RealRiches, ${data.firstName}!

Your account is now verified and ready to use. We're excited to have you on board!

Go to your dashboard: ${data.dashboardUrl}

---

Get Started

Here's what you can do with your RealRiches account:

${features.map((f) => `• ${f}`).join('\n')}

If you have any questions, our support team is here to help.

---
RealRiches
    `.trim();
  },
};

function getFeaturesByUserType(userType: 'landlord' | 'tenant' | 'agent'): string[] {
  switch (userType) {
    case 'landlord':
      return [
        'Manage your properties and units',
        'List vacancies and find qualified tenants',
        'Collect rent payments automatically',
        'Generate lease documents and e-signatures',
        'Track maintenance requests',
        'Stay compliant with local regulations',
      ];
    case 'tenant':
      return [
        'View your lease details and documents',
        'Pay rent securely online',
        'Submit maintenance requests',
        'Communicate with your landlord',
        'Access your payment history',
      ];
    case 'agent':
      return [
        'Browse available listings',
        'Schedule property tours',
        'Submit client applications',
        'Track deal pipeline',
        'Earn referral commissions',
      ];
    default:
      return [
        'Explore available properties',
        'Manage your account settings',
        'Contact our support team',
      ];
  }
}
