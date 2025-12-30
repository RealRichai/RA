/**
 * Base Email Layout
 *
 * Responsive HTML email layout with RealRiches branding.
 */

export interface LayoutOptions {
  title?: string;
  preheader?: string;
  showFooter?: boolean;
  showUnsubscribe?: boolean;
}

const BRAND_COLOR = '#2563eb'; // Blue-600
const TEXT_COLOR = '#1f2937'; // Gray-800
const MUTED_COLOR = '#6b7280'; // Gray-500
const BG_COLOR = '#f9fafb'; // Gray-50

/**
 * Wrap email content in the base layout.
 */
export function wrapInLayout(content: string, options: LayoutOptions = {}): string {
  const { title = 'RealRiches', preheader = '', showFooter = true, showUnsubscribe = false } = options;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeHtml(title)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    /* Reset styles */
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { margin: 0; padding: 0; width: 100% !important; height: 100% !important; }

    /* Typography */
    body, td, p { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }

    /* Button styles */
    .button {
      display: inline-block;
      padding: 12px 24px;
      background-color: ${BRAND_COLOR};
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      font-size: 16px;
    }
    .button:hover { background-color: #1d4ed8; }

    /* Responsive */
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; padding: 16px !important; }
      .content { padding: 24px 16px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: ${BG_COLOR};">
  <!-- Preheader text (hidden but shown in email preview) -->
  ${preheader ? `<div style="display: none; max-height: 0; overflow: hidden; font-size: 1px; line-height: 1px; color: ${BG_COLOR};">${escapeHtml(preheader)}</div>` : ''}

  <!-- Email wrapper -->
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: ${BG_COLOR};">
    <tr>
      <td align="center" style="padding: 40px 16px;">

        <!-- Main container -->
        <table role="presentation" class="container" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">

          <!-- Header with logo -->
          <tr>
            <td align="center" style="padding: 32px 40px 24px 40px; border-bottom: 1px solid #e5e7eb;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="font-size: 24px; font-weight: 700; color: ${BRAND_COLOR};">
                    RealRiches
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td class="content" style="padding: 40px;">
              ${content}
            </td>
          </tr>

          ${showFooter ? `
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: ${BG_COLOR}; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="font-size: 12px; color: ${MUTED_COLOR}; text-align: center;">
                    <p style="margin: 0 0 8px 0;">
                      &copy; ${new Date().getFullYear()} RealRiches. All rights reserved.
                    </p>
                    <p style="margin: 0;">
                      You're receiving this email because you have an account with RealRiches.
                    </p>
                    ${showUnsubscribe ? `
                    <p style="margin: 8px 0 0 0;">
                      <a href="{{unsubscribeUrl}}" style="color: ${MUTED_COLOR};">Unsubscribe</a>
                    </p>
                    ` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ` : ''}

        </table>

      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Create a primary action button.
 */
export function createButton(text: string, url: string): string {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 24px 0;">
      <tr>
        <td>
          <a href="${escapeHtml(url)}" class="button" style="display: inline-block; padding: 12px 24px; background-color: ${BRAND_COLOR}; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
            ${escapeHtml(text)}
          </a>
        </td>
      </tr>
    </table>
  `;
}

/**
 * Create a paragraph of text.
 */
export function createParagraph(text: string): string {
  return `<p style="margin: 0 0 16px 0; font-size: 16px; line-height: 1.6; color: ${TEXT_COLOR};">${text}</p>`;
}

/**
 * Create a heading.
 */
export function createHeading(text: string, level: 1 | 2 | 3 = 1): string {
  const sizes = { 1: '24px', 2: '20px', 3: '18px' };
  return `<h${level} style="margin: 0 0 16px 0; font-size: ${sizes[level]}; font-weight: 600; color: ${TEXT_COLOR};">${escapeHtml(text)}</h${level}>`;
}

/**
 * Create a muted/small text block.
 */
export function createMutedText(text: string): string {
  return `<p style="margin: 16px 0 0 0; font-size: 14px; color: ${MUTED_COLOR};">${text}</p>`;
}

/**
 * Create a horizontal divider.
 */
export function createDivider(): string {
  return `<hr style="margin: 24px 0; border: none; border-top: 1px solid #e5e7eb;" />`;
}

/**
 * Escape HTML special characters.
 */
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (c) => map[c] || c);
}
