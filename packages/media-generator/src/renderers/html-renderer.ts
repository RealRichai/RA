/**
 * HTML Renderer
 *
 * Handles variable interpolation and HTML template rendering
 * for collateral generation.
 */

/* eslint-disable @typescript-eslint/no-base-to-string */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import type { ListingSnapshot, TemplateVariable, CollateralCustomizations } from '../types';

// ============================================================================
// Render Context
// ============================================================================

export interface RenderContext {
  listing: ListingSnapshot;
  variables?: Record<string, unknown>;
  customizations?: CollateralCustomizations;
  generatedAt?: Date;
}

// ============================================================================
// Variable Formatters
// ============================================================================

type Formatter = (value: unknown) => string;

const formatters: { [key: string]: Formatter } = {
  string: (value) => String(value ?? ''),
  number: (value) => {
    if (typeof value === 'number') {
      return value.toLocaleString();
    }
    return String(value ?? '');
  },
  boolean: (value) => (value ? 'Yes' : 'No'),
  date: (value) => {
    if (value instanceof Date) {
      return value.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }
    if (typeof value === 'string') {
      return new Date(value).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }
    return String(value ?? '');
  },
  currency: (value) => {
    if (typeof value === 'number') {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value);
    }
    return String(value ?? '');
  },
  image: (value) => {
    if (typeof value === 'string') {
      return `<img src="${escapeHtml(value)}" alt="" class="template-image" />`;
    }
    return '';
  },
};

// Default formatter for unknown types
const defaultFormatter: Formatter = formatters.string!;

// ============================================================================
// HTML Escaping
// ============================================================================

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m] ?? m);
}

// ============================================================================
// HTML Renderer Class
// ============================================================================

export class HtmlRenderer {
  /**
   * Render an HTML template with the given context
   */
  render(
    htmlTemplate: string,
    context: RenderContext,
    variableDefinitions?: TemplateVariable[]
  ): string {
    let html = htmlTemplate;

    // Build variable map from listing and custom variables
    const variables = this.buildVariableMap(context);

    // Replace variables
    html = this.interpolateVariables(html, variables, variableDefinitions);

    // Apply customizations
    html = this.applyCustomizations(html, context.customizations);

    // Add generation timestamp
    if (context.generatedAt) {
      const dateFormatter = formatters.date ?? defaultFormatter;
      html = html.replace(
        /\{\{generated_at\}\}/g,
        dateFormatter(context.generatedAt)
      );
    }

    return html;
  }

  /**
   * Build variable map from listing and custom variables
   */
  private buildVariableMap(context: RenderContext): Record<string, unknown> {
    const { listing, variables = {} } = context;

    return {
      // Listing core fields
      listing_id: listing.id,
      listing_title: listing.title,

      // Address fields
      address_street: listing.address.street,
      address_unit: listing.address.unit ?? '',
      address_city: listing.address.city,
      address_state: listing.address.state,
      address_zip: listing.address.zip,
      address_full: this.formatFullAddress(listing.address),

      // Property details
      rent: listing.rent,
      bedrooms: listing.bedrooms,
      bathrooms: listing.bathrooms,
      square_feet: listing.squareFeet ?? '',
      available_date: listing.availableDate,
      description: listing.description ?? '',
      property_type: listing.propertyType ?? '',
      year_built: listing.yearBuilt ?? '',

      // Lists
      amenities: listing.amenities ?? [],
      amenities_html: this.formatAmenitiesList(listing.amenities ?? []),
      photos: listing.photos ?? [],
      primary_photo: listing.photos?.[0] ?? '',
      utilities: listing.utilities ?? [],
      utilities_html: this.formatUtilitiesList(listing.utilities ?? []),

      // Other
      pet_policy: listing.petPolicy ?? 'Contact for details',
      parking_spaces: listing.parkingSpaces ?? 0,
      market_id: listing.marketId,

      // Custom variables override defaults
      ...variables,
    };
  }

  /**
   * Interpolate variables in HTML template
   */
  private interpolateVariables(
    html: string,
    variables: Record<string, unknown>,
    definitions?: TemplateVariable[]
  ): string {
    // Create a map of variable definitions for type lookup
    const typeMap = new Map<string, string>();
    if (definitions) {
      for (const def of definitions) {
        typeMap.set(def.name, def.type);
      }
    }

    // Replace all {{variable}} patterns
    return html.replace(/\{\{([a-zA-Z_][a-zA-Z0-9_.]*)\}\}/g, (match, varName) => {
      // Skip compliance placeholders
      if (varName.startsWith('compliance_')) {
        return match;
      }

      const value = this.getNestedValue(variables, varName);

      if (value === undefined || value === null) {
        return '';
      }

      // Get formatter based on type
      const varType = typeMap.get(varName) ?? this.inferType(value);
      const formatter = formatters[varType] ?? defaultFormatter;

      const formatted = formatter(value);

      // Escape HTML for string values (but not for image type which returns HTML)
      if (varType !== 'image' && typeof formatted === 'string') {
        return escapeHtml(formatted);
      }

      return formatted;
    });
  }

  /**
   * Get nested value from object (supports dot notation)
   */
  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  /**
   * Infer variable type from value
   */
  private inferType(value: unknown): string {
    if (typeof value === 'number') {
      return 'number';
    }
    if (typeof value === 'boolean') {
      return 'boolean';
    }
    if (value instanceof Date) {
      return 'date';
    }
    return 'string';
  }

  /**
   * Apply customizations to HTML
   */
  private applyCustomizations(
    html: string,
    customizations?: CollateralCustomizations
  ): string {
    if (!customizations) {
      return html;
    }

    // Replace color scheme CSS variable
    if (customizations.colorScheme) {
      html = html.replace(
        /var\(--primary-color\)/g,
        customizations.colorScheme
      );
    }

    // Replace logo
    if (customizations.logoUrl) {
      html = html.replace(
        /\{\{logo_url\}\}/g,
        escapeHtml(customizations.logoUrl)
      );
    }

    // Replace footer text
    if (customizations.footerText) {
      html = html.replace(
        /\{\{footer_text\}\}/g,
        escapeHtml(customizations.footerText)
      );
    }

    return html;
  }

  /**
   * Format full address string
   */
  private formatFullAddress(address: ListingSnapshot['address']): string {
    const parts = [address.street];
    if (address.unit) {
      parts.push(`Unit ${address.unit}`);
    }
    parts.push(`${address.city}, ${address.state} ${address.zip}`);
    return parts.join(', ');
  }

  /**
   * Format amenities as HTML list
   */
  private formatAmenitiesList(amenities: string[]): string {
    if (amenities.length === 0) {
      return '<p>Contact for amenities information</p>';
    }
    const items = amenities.map((a) => `<li>${escapeHtml(a)}</li>`).join('');
    return `<ul class="amenities-list">${items}</ul>`;
  }

  /**
   * Format utilities as HTML list
   */
  private formatUtilitiesList(utilities: string[]): string {
    if (utilities.length === 0) {
      return '<p>Contact for utilities information</p>';
    }
    const items = utilities.map((u) => `<li>${escapeHtml(u)}</li>`).join('');
    return `<ul class="utilities-list">${items}</ul>`;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let rendererInstance: HtmlRenderer | null = null;

export function getHtmlRenderer(): HtmlRenderer {
  if (!rendererInstance) {
    rendererInstance = new HtmlRenderer();
  }
  return rendererInstance;
}

// ============================================================================
// Convenience Function
// ============================================================================

export function renderHtml(
  htmlTemplate: string,
  context: RenderContext,
  variableDefinitions?: TemplateVariable[]
): string {
  const renderer = getHtmlRenderer();
  return renderer.render(htmlTemplate, context, variableDefinitions);
}
