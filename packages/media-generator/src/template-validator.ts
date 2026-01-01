/**
 * Template Validator
 *
 * Validates collateral templates, enforcing that required compliance blocks
 * are present and non-removable blocks cannot be removed.
 */

import { getBlockRegistry, type BlockRegistry } from './block-registry';
import type {
  CollateralTemplate,
  TemplateValidationResult,
  TemplateValidationError,
  TemplateValidationWarning,
} from './types';

// ============================================================================
// Validation Options
// ============================================================================

export interface TemplateValidationOptions {
  /** Market pack ID to validate against */
  marketPackId: string;
  /** Whether to validate HTML structure */
  validateHtml?: boolean;
  /** Whether to check for injection point placeholders */
  checkInjectionPoints?: boolean;
  /** Parent template to check for removed blocks (for user templates) */
  parentTemplate?: CollateralTemplate;
}

// ============================================================================
// Template Validator Class
// ============================================================================

export class TemplateValidator {
  private registry: BlockRegistry;

  constructor(registry?: BlockRegistry) {
    this.registry = registry ?? getBlockRegistry();
  }

  /**
   * Validate a template against compliance requirements
   */
  validate(
    template: CollateralTemplate,
    options: TemplateValidationOptions
  ): TemplateValidationResult {
    const errors: TemplateValidationError[] = [];
    const warnings: TemplateValidationWarning[] = [];

    // 1. Validate required compliance blocks are present
    this.validateRequiredBlocks(template, options, errors);

    // 2. Check for removed non-removable blocks (user templates)
    if (options.parentTemplate) {
      this.validateNoBlocksRemoved(template, options.parentTemplate, options, errors);
    }

    // 3. Validate HTML structure (optional)
    if (options.validateHtml !== false) {
      this.validateHtmlStructure(template, errors);
    }

    // 4. Check for injection points (optional)
    if (options.checkInjectionPoints !== false) {
      this.checkInjectionPoints(template, options, warnings);
    }

    // 5. Validate variables
    this.validateVariables(template, errors, warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate that all required non-removable blocks are present
   */
  private validateRequiredBlocks(
    template: CollateralTemplate,
    options: TemplateValidationOptions,
    errors: TemplateValidationError[]
  ): void {
    const nonRemovable = this.registry.getNonRemovableBlocks(
      options.marketPackId,
      template.type
    );

    for (const block of nonRemovable) {
      if (!template.requiredComplianceBlocks.includes(block.id)) {
        errors.push({
          code: 'COMPLIANCE_BLOCK_MISSING',
          message: `Required compliance block "${block.id}" (${block.type}) is missing. This block is required for ${template.type} in market ${options.marketPackId} and cannot be omitted.`,
          blockId: block.id,
        });
      }
    }
  }

  /**
   * Validate that no non-removable blocks were removed from parent template
   */
  private validateNoBlocksRemoved(
    template: CollateralTemplate,
    parentTemplate: CollateralTemplate,
    options: TemplateValidationOptions,
    errors: TemplateValidationError[]
  ): void {
    const parentBlocks = new Set(parentTemplate.requiredComplianceBlocks);
    const currentBlocks = new Set(template.requiredComplianceBlocks);

    for (const blockId of parentBlocks) {
      if (!currentBlocks.has(blockId)) {
        // Block was removed - check if it's allowed
        const canRemove = this.registry.canRemoveBlock(
          blockId,
          options.marketPackId,
          template.type
        );

        if (!canRemove.canRemove) {
          errors.push({
            code: 'COMPLIANCE_BLOCK_REMOVED',
            message: canRemove.reason ?? `Block "${blockId}" cannot be removed.`,
            blockId,
          });
        }
      }
    }
  }

  /**
   * Validate HTML template structure
   */
  private validateHtmlStructure(
    template: CollateralTemplate,
    errors: TemplateValidationError[]
  ): void {
    if (!template.htmlTemplate || template.htmlTemplate.trim().length === 0) {
      errors.push({
        code: 'INVALID_HTML',
        message: 'HTML template is empty or missing.',
      });
      return;
    }

    // Basic structure checks
    const html = template.htmlTemplate;

    // Check for unclosed tags (basic check)
    const openTags = (html.match(/<[a-z][^>]*[^/]>/gi) ?? []).length;
    const closeTags = (html.match(/<\/[a-z][^>]*>/gi) ?? []).length;
    const selfClosing = (html.match(/<[a-z][^>]*\/>/gi) ?? []).length;

    // Allow some flexibility (not all tags need to be closed)
    if (Math.abs(openTags - closeTags - selfClosing) > 10) {
      errors.push({
        code: 'INVALID_HTML',
        message: 'HTML template may have unclosed or mismatched tags.',
      });
    }
  }

  /**
   * Check for compliance block injection points
   */
  private checkInjectionPoints(
    template: CollateralTemplate,
    options: TemplateValidationOptions,
    warnings: TemplateValidationWarning[]
  ): void {
    const html = template.htmlTemplate;
    const blocksByPosition = this.registry.getBlocksByPosition(
      options.marketPackId,
      template.type
    );

    // Check for position-specific injection points
    const positions = ['header', 'footer', 'sidebar', 'inline'];
    for (const position of positions) {
      const blocks = blocksByPosition[position as keyof typeof blocksByPosition] ?? [];
      if (blocks.length > 0) {
        const placeholder = `{{compliance_${position}}}`;
        const cssClass = `compliance-${position}`;

        if (!html.includes(placeholder) && !html.includes(cssClass)) {
          warnings.push({
            code: 'MISSING_INJECTION_POINT',
            message: `No injection point found for ${position} compliance blocks. Consider adding {{compliance_${position}}} placeholder or element with class "${cssClass}".`,
            details: `${blocks.length} block(s) targeting ${position} position.`,
          });
        }
      }
    }
  }

  /**
   * Validate template variables
   */
  private validateVariables(
    template: CollateralTemplate,
    errors: TemplateValidationError[],
    warnings: TemplateValidationWarning[]
  ): void {
    const html = template.htmlTemplate;

    // Extract variables used in template
    const usedVariables = new Set<string>();
    const variablePattern = /\{\{([a-zA-Z_][a-zA-Z0-9_.]*)\}\}/g;
    let match;
    while ((match = variablePattern.exec(html)) !== null) {
      const varName = match[1];
      // Exclude compliance placeholders
      if (varName && !varName.startsWith('compliance_')) {
        usedVariables.add(varName);
      }
    }

    // Check that all required variables are defined
    for (const varName of usedVariables) {
      const defined = template.variables.find((v) => v.name === varName);
      if (!defined) {
        errors.push({
          code: 'INVALID_VARIABLE',
          message: `Variable "{{${varName}}}" is used in template but not defined in variables list.`,
          field: varName,
        });
      }
    }

    // Check for unused defined variables
    for (const variable of template.variables) {
      if (!usedVariables.has(variable.name)) {
        warnings.push({
          code: 'VARIABLE_UNUSED',
          message: `Variable "${variable.name}" is defined but not used in template.`,
        });
      }
    }
  }

  /**
   * Quick check if a template can be saved (all non-removable blocks present)
   */
  canSave(template: CollateralTemplate, marketPackId: string): boolean {
    const result = this.registry.validateBlockPresence(
      marketPackId,
      template.type,
      template.requiredComplianceBlocks
    );
    return result.valid;
  }

  /**
   * Get missing required blocks for a template
   */
  getMissingBlocks(template: CollateralTemplate, marketPackId: string) {
    return this.registry.validateBlockPresence(
      marketPackId,
      template.type,
      template.requiredComplianceBlocks
    );
  }

  /**
   * Ensure a template has all required blocks (mutates template)
   */
  ensureRequiredBlocks(template: CollateralTemplate, marketPackId: string): CollateralTemplate {
    const nonRemovable = this.registry.getNonRemovableBlocks(marketPackId, template.type);
    const currentBlocks = new Set(template.requiredComplianceBlocks);

    for (const block of nonRemovable) {
      if (!currentBlocks.has(block.id)) {
        currentBlocks.add(block.id);
      }
    }

    return {
      ...template,
      requiredComplianceBlocks: Array.from(currentBlocks),
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let validatorInstance: TemplateValidator | null = null;

export function getTemplateValidator(): TemplateValidator {
  if (!validatorInstance) {
    validatorInstance = new TemplateValidator();
  }
  return validatorInstance;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Validate a template with default options
 */
export function validateTemplate(
  template: CollateralTemplate,
  marketPackId: string,
  options?: Partial<TemplateValidationOptions>
): TemplateValidationResult {
  const validator = getTemplateValidator();
  return validator.validate(template, {
    marketPackId,
    ...options,
  });
}

/**
 * Check if template can be saved
 */
export function canSaveTemplate(
  template: CollateralTemplate,
  marketPackId: string
): boolean {
  const validator = getTemplateValidator();
  return validator.canSave(template, marketPackId);
}
