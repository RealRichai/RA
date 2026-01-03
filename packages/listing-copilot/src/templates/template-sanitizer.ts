/**
 * Template Sanitizer
 *
 * Validates and sanitizes user-uploaded templates for security.
 */

import { TemplateValidationError } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface SanitizationResult {
  valid: boolean;
  sanitized?: string;
  errors: string[];
  warnings: string[];
}

// ============================================================================
// Dangerous Patterns
// ============================================================================

const DANGEROUS_PATTERNS = [
  // Script tags
  /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
  // Event handlers
  /on\w+\s*=/gi,
  // JavaScript URLs
  /javascript:/gi,
  // Data URLs (can be used for XSS)
  /data:\s*text\/html/gi,
  // Expression evaluation
  /expression\s*\(/gi,
  // VBScript
  /vbscript:/gi,
  // LiveScript
  /livescript:/gi,
  // Import statements
  /@import/gi,
  // Base64 encoded scripts
  /base64[\s\S]*?PHNjcmlwd/gi,
  // Meta refresh
  /<meta[\s\S]*?http-equiv[\s\S]*?refresh/gi,
  // Object/embed tags
  /<(object|embed|applet|iframe)/gi,
  // Form actions
  /<form[\s\S]*?action/gi,
];

const HANDLEBARS_PATTERNS = {
  // Valid Handlebars expressions
  variable: /\{\{[^{}]+\}\}/g,
  block: /\{\{#[^{}]+\}\}[\s\S]*?\{\{\/[^{}]+\}\}/g,
  helper: /\{\{[a-zA-Z_][a-zA-Z0-9_]*\s+[^{}]+\}\}/g,
};

// ============================================================================
// Template Sanitizer Class
// ============================================================================

export class TemplateSanitizer {
  /**
   * Validate and sanitize a template.
   */
  sanitize(content: string): SanitizationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let sanitized = content;

    // Check for dangerous patterns
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(content)) {
        const match = content.match(pattern);
        errors.push(`Dangerous pattern detected: ${match?.[0]?.substring(0, 50)}...`);
        // Remove the pattern
        sanitized = sanitized.replace(pattern, '<!-- REMOVED FOR SECURITY -->');
      }
    }

    // Validate Handlebars syntax
    const handlebarsResult = this.validateHandlebars(sanitized);
    errors.push(...handlebarsResult.errors);
    warnings.push(...handlebarsResult.warnings);

    // Check for potentially problematic but not necessarily dangerous patterns
    if (/<style[\s\S]*?>[\s\S]*?position\s*:\s*fixed/gi.test(content)) {
      warnings.push('Template contains fixed positioning which may cause layout issues');
    }

    if (/<style[\s\S]*?>[\s\S]*?@font-face/gi.test(content)) {
      warnings.push('Template contains custom fonts which may not render in all environments');
    }

    return {
      valid: errors.length === 0,
      sanitized: errors.length === 0 ? sanitized : undefined,
      errors,
      warnings,
    };
  }

  /**
   * Validate Handlebars template syntax.
   */
  validateHandlebars(content: string): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for unmatched block helpers
    const blockStarts = content.match(/\{\{#(\w+)/g) || [];
    const blockEnds = content.match(/\{\{\/(\w+)\}\}/g) || [];

    const startHelpers = blockStarts.map((s) => s.replace('{{#', ''));
    const endHelpers = blockEnds.map((e) => e.replace('{{/', '').replace('}}', ''));

    for (const helper of startHelpers) {
      if (!endHelpers.includes(helper)) {
        errors.push(`Unclosed Handlebars block: {{#${helper}}}`);
      }
    }

    for (const helper of endHelpers) {
      if (!startHelpers.includes(helper)) {
        errors.push(`Unexpected closing block: {{/${helper}}}`);
      }
    }

    // Check for invalid characters in variable names
    const variables = content.match(/\{\{([^#/][\w.]+)\}\}/g) || [];
    for (const variable of variables) {
      if (/\{\{[^}]*[<>"'&][^}]*\}\}/.test(variable)) {
        errors.push(`Invalid characters in Handlebars variable: ${variable}`);
      }
    }

    // Warn about deeply nested expressions
    if (/\{\{[^}]*\.[^}]*\.[^}]*\.[^}]*\.[^}]*\}\}/.test(content)) {
      warnings.push('Template contains deeply nested variable access (5+ levels)');
    }

    // Check for raw output (potential XSS if used incorrectly)
    if (/\{\{\{/.test(content)) {
      warnings.push('Template uses raw output ({{{...}}}) - ensure data is trusted');
    }

    return { errors, warnings };
  }

  /**
   * Check if content is safe for PDF/PPTX generation.
   */
  isSafeForGeneration(content: string): boolean {
    const result = this.sanitize(content);
    return result.valid;
  }

  /**
   * Extract all variable references from a template.
   */
  extractVariables(content: string): string[] {
    const variables: Set<string> = new Set();

    // Match all Handlebars expressions
    const matches = content.match(/\{\{[^{}]+\}\}/g) || [];

    for (const match of matches) {
      // Extract variable path
      const cleaned = match
        .replace(/^\{\{+/, '')
        .replace(/\}+$/, '')
        .replace(/^#\w+\s+/, '')  // Remove block helpers
        .replace(/^\/\w+/, '')    // Remove closing tags
        .trim();

      if (cleaned && !cleaned.startsWith('/') && !cleaned.startsWith('#')) {
        // Handle expressions like "each listing.amenities"
        const parts = cleaned.split(/\s+/);
        const varPath = parts.length > 1 ? parts[1] : parts[0];
        if (varPath && !['if', 'unless', 'each', 'with', 'else'].includes(varPath)) {
          variables.add(varPath);
        }
      }
    }

    return Array.from(variables);
  }

  /**
   * Validate that all required variables are present in a template.
   */
  validateRequiredVariables(content: string, required: string[]): string[] {
    const variables = this.extractVariables(content);
    const missing: string[] = [];

    for (const req of required) {
      // Check if the variable or a parent path is present
      const hasVariable = variables.some((v) =>
        v === req || v.startsWith(`${req}.`) || req.startsWith(`${v}.`)
      );

      if (!hasVariable) {
        missing.push(req);
      }
    }

    return missing;
  }
}
