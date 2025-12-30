/**
 * Document Signature Request Email Template
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

export interface SignatureRequestData {
  recipientFirstName: string;
  documentName: string;
  senderName: string;
  signatureUrl: string;
  expiresIn: string;
  message?: string;
}

export const signatureRequestTemplate: EmailTemplate<SignatureRequestData> = {
  id: 'documents.signature-request',
  name: 'Signature Request',
  description: 'Sent when someone requests an e-signature on a document',
  subject: (data) => `${data.senderName} has requested your signature`,
  defaultPriority: 'high',
  requiredFields: ['recipientFirstName', 'documentName', 'senderName', 'signatureUrl', 'expiresIn'],

  html: (data) => {
    const content = `
      ${createHeading(`Hi ${escapeHtml(data.recipientFirstName)},`)}

      ${createParagraph(`<strong>${escapeHtml(data.senderName)}</strong> has requested your signature on the following document:`)}

      <div style="background-color: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p style="margin: 0; font-size: 18px; font-weight: 600; color: #1f2937;">
          📄 ${escapeHtml(data.documentName)}
        </p>
      </div>

      ${data.message ? `
        <div style="border-left: 4px solid #2563eb; padding-left: 16px; margin: 16px 0;">
          <p style="margin: 0; font-style: italic; color: #4b5563;">
            "${escapeHtml(data.message)}"
          </p>
          <p style="margin: 8px 0 0 0; font-size: 14px; color: #6b7280;">
            — ${escapeHtml(data.senderName)}
          </p>
        </div>
      ` : ''}

      ${createButton('Review & Sign Document', data.signatureUrl)}

      ${createMutedText(`This signature request will expire in ${escapeHtml(data.expiresIn)}. Please complete your review and signature before then.`)}
    `;

    return wrapInLayout(content, {
      title: 'Signature Request',
      preheader: `${data.senderName} needs your signature on ${data.documentName}`,
    });
  },

  text: (data) => `
Hi ${data.recipientFirstName},

${data.senderName} has requested your signature on the following document:

Document: ${data.documentName}

${data.message ? `Message from ${data.senderName}:
"${data.message}"

` : ''}Review and sign the document here:
${data.signatureUrl}

This signature request will expire in ${data.expiresIn}. Please complete your review and signature before then.

---
RealRiches
  `.trim(),
};
