/**
 * Template Engine
 *
 * Renders email templates with variable interpolation.
 */

import { convert } from 'html-to-text';

import type { EmailTemplate, TemplateRenderResult } from '../types';

/**
 * Template registry - stores all registered templates.
 */
const templates = new Map<string, EmailTemplate<Record<string, unknown>>>();

/**
 * Register a template.
 */
export function registerTemplate<T extends Record<string, unknown>>(
  template: EmailTemplate<T>
): void {
  templates.set(template.id, template as EmailTemplate<Record<string, unknown>>);
}

/**
 * Get a template by ID.
 */
export function getTemplate(templateId: string): EmailTemplate<Record<string, unknown>> | undefined {
  return templates.get(templateId);
}

/**
 * Get all registered template IDs.
 */
export function getTemplateIds(): string[] {
  return Array.from(templates.keys());
}

/**
 * Render a template with the given data.
 */
export function renderTemplate(
  templateId: string,
  data: Record<string, unknown>
): TemplateRenderResult {
  const template = templates.get(templateId);

  if (!template) {
    throw new TemplateNotFoundError(templateId);
  }

  // Validate required fields
  const missingFields = template.requiredFields.filter(
    (field) => data[field] === undefined || data[field] === null
  );

  if (missingFields.length > 0) {
    throw new MissingFieldsError(templateId, missingFields);
  }

  // Render subject
  const subject = typeof template.subject === 'function'
    ? template.subject(data)
    : template.subject;

  // Render HTML
  const html = template.html(data);

  // Render or generate text version
  const text = template.text
    ? template.text(data)
    : generateTextFromHtml(html);

  return { subject, html, text };
}

/**
 * Render a template directly (without registration).
 */
export function renderTemplateDirectly<T extends Record<string, unknown>>(
  template: EmailTemplate<T>,
  data: T
): TemplateRenderResult {
  // Validate required fields
  const missingFields = template.requiredFields.filter(
    (field) => data[field] === undefined || data[field] === null
  );

  if (missingFields.length > 0) {
    throw new MissingFieldsError(template.id, missingFields as string[]);
  }

  // Render subject
  const subject = typeof template.subject === 'function'
    ? template.subject(data)
    : template.subject;

  // Render HTML
  const html = template.html(data);

  // Render or generate text version
  const text = template.text
    ? template.text(data)
    : generateTextFromHtml(html);

  return { subject, html, text };
}

/**
 * Generate a plain text version from HTML.
 */
export function generateTextFromHtml(html: string): string {
  return convert(html, {
    wordwrap: 80,
    selectors: [
      { selector: 'a', options: { hideLinkHrefIfSameAsText: true } },
      { selector: 'img', format: 'skip' },
      { selector: 'table.button', format: 'skip' },
    ],
  });
}

/**
 * Validate template data without rendering.
 */
export function validateTemplateData(
  templateId: string,
  data: Record<string, unknown>
): { valid: boolean; missingFields: string[] } {
  const template = templates.get(templateId);

  if (!template) {
    throw new TemplateNotFoundError(templateId);
  }

  const missingFields = template.requiredFields.filter(
    (field) => data[field] === undefined || data[field] === null
  );

  return {
    valid: missingFields.length === 0,
    missingFields,
  };
}

/**
 * Clear all registered templates (for testing).
 */
export function clearTemplates(): void {
  templates.clear();
}

// Error classes

export class TemplateNotFoundError extends Error {
  constructor(templateId: string) {
    super(`Template not found: ${templateId}`);
    this.name = 'TemplateNotFoundError';
  }
}

export class MissingFieldsError extends Error {
  constructor(
    templateId: string,
    public readonly missingFields: string[]
  ) {
    super(`Missing required fields for template '${templateId}': ${missingFields.join(', ')}`);
    this.name = 'MissingFieldsError';
  }
}
