/**
 * Payment Email Templates
 */

export * from './payment-reminder';
export * from './payment-late';

import { paymentLateTemplate } from './payment-late';
import { paymentReminderTemplate } from './payment-reminder';

export const paymentTemplates = [
  paymentReminderTemplate,
  paymentLateTemplate,
];
