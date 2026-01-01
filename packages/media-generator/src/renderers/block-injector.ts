/**
 * Block Injector
 *
 * Injects compliance blocks into rendered HTML at appropriate positions.
 * Handles footer, header, sidebar, inline, and dedicated page injections.
 */

import { getBlockRegistry } from '../block-registry';
import type { ComplianceBlock, BlockPosition, CollateralType, AppliedComplianceBlock } from '../types';

// ============================================================================
// Injection Result
// ============================================================================

export interface InjectionResult {
  html: string;
  appliedBlocks: AppliedComplianceBlock[];
}

// ============================================================================
// Block Injector Class
// ============================================================================

export class BlockInjector {
  /**
   * Inject all required compliance blocks into HTML
   */
  inject(
    html: string,
    marketPackId: string,
    collateralType: CollateralType
  ): InjectionResult {
    const registry = getBlockRegistry();
    const blocksByPosition = registry.getBlocksByPosition(marketPackId, collateralType);
    const appliedBlocks: AppliedComplianceBlock[] = [];

    let result = html;

    // Process each position
    for (const position of Object.keys(blocksByPosition) as BlockPosition[]) {
      const blocks = blocksByPosition[position];
      if (!blocks || blocks.length === 0) continue;

      const injectionResult = this.injectAtPosition(result, blocks, position);
      result = injectionResult.html;
      appliedBlocks.push(...injectionResult.appliedBlocks);
    }

    return { html: result, appliedBlocks };
  }

  /**
   * Inject blocks at a specific position
   */
  private injectAtPosition(
    html: string,
    blocks: ComplianceBlock[],
    position: BlockPosition
  ): InjectionResult {
    const appliedBlocks: AppliedComplianceBlock[] = [];
    let result = html;

    // Generate combined HTML for all blocks at this position
    const blocksHtml = blocks
      .map((block) => {
        appliedBlocks.push({
          blockId: block.id,
          blockType: block.type,
          version: block.version,
          position: block.position,
        });
        return block.htmlContent;
      })
      .join('\n');

    // Inject based on position
    switch (position) {
      case 'footer':
        result = this.injectFooter(result, blocksHtml);
        break;
      case 'header':
        result = this.injectHeader(result, blocksHtml);
        break;
      case 'sidebar':
        result = this.injectSidebar(result, blocksHtml);
        break;
      case 'inline':
        result = this.injectInline(result, blocksHtml);
        break;
      case 'dedicated_page':
        result = this.injectDedicatedPage(result, blocksHtml);
        break;
      case 'dedicated_slide':
        // For PPTX, this is handled separately in pptx-generator
        break;
    }

    return { html: result, appliedBlocks };
  }

  /**
   * Inject into footer position
   */
  private injectFooter(html: string, blocksHtml: string): string {
    // Try placeholder first
    if (html.includes('{{compliance_footer}}')) {
      return html.replace('{{compliance_footer}}', blocksHtml);
    }

    // Try CSS class marker
    const footerMarker = /<div[^>]*class="[^"]*compliance-footer[^"]*"[^>]*>.*?<\/div>/gs;
    if (footerMarker.test(html)) {
      return html.replace(footerMarker, blocksHtml);
    }

    // Try existing footer element
    const footerElement = /<footer[^>]*>.*?<\/footer>/gs;
    if (footerElement.test(html)) {
      return html.replace(footerElement, (match) => {
        // Insert before closing </footer>
        return match.replace('</footer>', `${blocksHtml}</footer>`);
      });
    }

    // Fallback: insert before </body>
    if (html.includes('</body>')) {
      return html.replace('</body>', `\n${blocksHtml}\n</body>`);
    }

    // Last resort: append at end
    return html + '\n' + blocksHtml;
  }

  /**
   * Inject into header position
   */
  private injectHeader(html: string, blocksHtml: string): string {
    // Try placeholder first
    if (html.includes('{{compliance_header}}')) {
      return html.replace('{{compliance_header}}', blocksHtml);
    }

    // Try CSS class marker
    const headerMarker = /<div[^>]*class="[^"]*compliance-header[^"]*"[^>]*>.*?<\/div>/gs;
    if (headerMarker.test(html)) {
      return html.replace(headerMarker, blocksHtml);
    }

    // Try existing header element
    const headerElement = /<header[^>]*>.*?<\/header>/gs;
    if (headerElement.test(html)) {
      return html.replace(headerElement, (match) => {
        // Insert after opening <header...>
        return match.replace(/<header[^>]*>/, (openTag) => `${openTag}\n${blocksHtml}`);
      });
    }

    // Fallback: insert after <body>
    if (html.includes('<body>')) {
      return html.replace('<body>', `<body>\n${blocksHtml}\n`);
    }

    // Last resort: prepend
    return blocksHtml + '\n' + html;
  }

  /**
   * Inject into sidebar position
   */
  private injectSidebar(html: string, blocksHtml: string): string {
    // Try placeholder first
    if (html.includes('{{compliance_sidebar}}')) {
      return html.replace('{{compliance_sidebar}}', blocksHtml);
    }

    // Try CSS class marker
    const sidebarMarker = /<aside[^>]*class="[^"]*compliance-sidebar[^"]*"[^>]*>.*?<\/aside>/gs;
    if (sidebarMarker.test(html)) {
      return html.replace(sidebarMarker, blocksHtml);
    }

    // Try existing aside element
    const asideElement = /<aside[^>]*>.*?<\/aside>/gs;
    if (asideElement.test(html)) {
      return html.replace(asideElement, (match) => {
        // Insert before closing </aside>
        return match.replace('</aside>', `${blocksHtml}</aside>`);
      });
    }

    // Fallback: inject as footer (sidebar blocks still need to appear somewhere)
    return this.injectFooter(html, blocksHtml);
  }

  /**
   * Inject inline (within main content)
   */
  private injectInline(html: string, blocksHtml: string): string {
    // Try placeholder first
    if (html.includes('{{compliance_inline}}')) {
      return html.replace('{{compliance_inline}}', blocksHtml);
    }

    // Try CSS class marker
    const inlineMarker = /<div[^>]*class="[^"]*compliance-inline[^"]*"[^>]*>.*?<\/div>/gs;
    if (inlineMarker.test(html)) {
      return html.replace(inlineMarker, blocksHtml);
    }

    // Try main content area
    const mainElement = /<main[^>]*>.*?<\/main>/gs;
    if (mainElement.test(html)) {
      return html.replace(mainElement, (match) => {
        // Insert before closing </main>
        return match.replace('</main>', `${blocksHtml}</main>`);
      });
    }

    // Fallback: inject as footer
    return this.injectFooter(html, blocksHtml);
  }

  /**
   * Inject as dedicated page (page break before)
   */
  private injectDedicatedPage(html: string, blocksHtml: string): string {
    // Wrap in page break div
    const pageHtml = `
<div class="compliance-page" style="page-break-before: always;">
  ${blocksHtml}
</div>`;

    // Try placeholder first
    if (html.includes('{{compliance_page}}')) {
      return html.replace('{{compliance_page}}', pageHtml);
    }

    // Try dedicated page marker
    const pageMarker = /<div[^>]*class="[^"]*compliance-page[^"]*"[^>]*>.*?<\/div>/gs;
    if (pageMarker.test(html)) {
      return html.replace(pageMarker, pageHtml);
    }

    // Default: insert before </body> or at end
    if (html.includes('</body>')) {
      return html.replace('</body>', `${pageHtml}\n</body>`);
    }

    return html + '\n' + pageHtml;
  }

  /**
   * Get PPTX content for blocks at dedicated_slide position
   */
  getPptxSlideContent(
    marketPackId: string,
    collateralType: CollateralType
  ): { content: string[]; appliedBlocks: AppliedComplianceBlock[] } {
    const registry = getBlockRegistry();
    const blocksByPosition = registry.getBlocksByPosition(marketPackId, collateralType);
    const slideBlocks = blocksByPosition.dedicated_slide ?? [];
    const appliedBlocks: AppliedComplianceBlock[] = [];
    const content: string[] = [];

    // Collect all blocks that should appear on dedicated slide
    for (const block of slideBlocks) {
      if (block.pptxContent) {
        content.push(block.pptxContent);
        appliedBlocks.push({
          blockId: block.id,
          blockType: block.type,
          version: block.version,
          position: block.position,
        });
      }
    }

    // Also include footer blocks as text for PPTX
    const footerBlocks = blocksByPosition.footer ?? [];
    for (const block of footerBlocks) {
      if (block.pptxContent) {
        content.push(block.pptxContent);
        // Only add if not already added
        if (!appliedBlocks.some((ab) => ab.blockId === block.id)) {
          appliedBlocks.push({
            blockId: block.id,
            blockType: block.type,
            version: block.version,
            position: block.position,
          });
        }
      }
    }

    return { content, appliedBlocks };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let injectorInstance: BlockInjector | null = null;

export function getBlockInjector(): BlockInjector {
  if (!injectorInstance) {
    injectorInstance = new BlockInjector();
  }
  return injectorInstance;
}

// ============================================================================
// Convenience Function
// ============================================================================

export function injectComplianceBlocks(
  html: string,
  marketPackId: string,
  collateralType: CollateralType
): InjectionResult {
  const injector = getBlockInjector();
  return injector.inject(html, marketPackId, collateralType);
}
