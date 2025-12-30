/**
 * Support Handoff Email Template
 *
 * Sent to the support team when a user requests human assistance
 * during an AI conversation.
 */

import type { EmailTemplate } from '../../../types';
import {
  wrapInLayout,
  createHeading,
  createParagraph,
  createDivider,
  escapeHtml,
} from '../../layouts/base';

export interface SupportHandoffData {
  conversationId: string;
  contextType: string;
  userName: string;
  userEmail: string;
  reason: string;
  recentMessages: string;
  timestamp: string;
}

export const supportHandoffTemplate: EmailTemplate<SupportHandoffData> = {
  id: 'system:support-handoff',
  name: 'Support Handoff Request',
  description: 'Sent to support team when AI conversation requests human handoff',
  subject: (data) => `[Handoff] ${data.contextType} - ${data.userName}`,
  defaultPriority: 'high',
  requiredFields: ['conversationId', 'contextType', 'userName', 'userEmail', 'reason', 'recentMessages', 'timestamp'],

  html: (data) => {
    const contextLabels: Record<string, string> = {
      leasing_inquiry: 'Leasing Inquiry',
      maintenance_request: 'Maintenance Request',
      general_support: 'General Support',
      property_tour: 'Property Tour',
      application_help: 'Application Help',
    };

    const content = `
      ${createHeading('Human Handoff Requested')}

      ${createParagraph('A user has requested to speak with a team member during an AI conversation.')}

      <div style="background-color: #fef3c7; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p style="margin: 0; font-weight: 600; color: #92400e;">
          Estimated Response Time: 5-10 minutes
        </p>
      </div>

      ${createDivider()}

      ${createHeading('User Details', 2)}

      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-weight: 500;">Name:</td>
          <td style="padding: 8px 0;">${escapeHtml(data.userName)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-weight: 500;">Email:</td>
          <td style="padding: 8px 0;">${escapeHtml(data.userEmail)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-weight: 500;">Context:</td>
          <td style="padding: 8px 0;">${escapeHtml(contextLabels[data.contextType] || data.contextType)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-weight: 500;">Conversation ID:</td>
          <td style="padding: 8px 0; font-family: monospace; font-size: 12px;">${escapeHtml(data.conversationId)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-weight: 500;">Requested At:</td>
          <td style="padding: 8px 0;">${escapeHtml(data.timestamp)}</td>
        </tr>
      </table>

      ${createDivider()}

      ${createHeading('Reason for Handoff', 2)}

      ${createParagraph(escapeHtml(data.reason))}

      ${createDivider()}

      ${createHeading('Recent Conversation', 2)}

      <div style="background-color: #f9fafb; padding: 16px; border-radius: 8px; margin: 16px 0; font-family: monospace; font-size: 13px; white-space: pre-wrap;">
${escapeHtml(data.recentMessages)}
      </div>
    `;

    return wrapInLayout(content, {
      title: 'Handoff Request',
      preheader: `${data.userName} requested human assistance for ${contextLabels[data.contextType] || data.contextType}`,
    });
  },

  text: (data) => `
HUMAN HANDOFF REQUESTED
=======================

A user has requested to speak with a team member during an AI conversation.

Estimated Response Time: 5-10 minutes

---

USER DETAILS
------------
Name: ${data.userName}
Email: ${data.userEmail}
Context: ${data.contextType}
Conversation ID: ${data.conversationId}
Requested At: ${data.timestamp}

---

REASON FOR HANDOFF
------------------
${data.reason}

---

RECENT CONVERSATION
-------------------
${data.recentMessages}

---
RealRiches Support System
  `.trim(),
};
