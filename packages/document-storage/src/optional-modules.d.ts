/**
 * Type declarations for optional dependencies
 *
 * These modules are dynamically imported and may not be installed.
 */

declare module 'puppeteer' {
  export interface Browser {
    newPage(): Promise<Page>;
    close(): Promise<void>;
  }

  export interface Page {
    setContent(html: string, options?: { waitUntil?: string | string[] }): Promise<void>;
    pdf(options?: {
      format?: string;
      printBackground?: boolean;
      displayHeaderFooter?: boolean;
      headerTemplate?: string;
      footerTemplate?: string;
      margin?: {
        top?: string;
        right?: string;
        bottom?: string;
        left?: string;
      };
    }): Promise<Buffer>;
  }

  export function launch(options?: {
    headless?: boolean | 'new';
    args?: string[];
  }): Promise<Browser>;
}

declare module 'html-to-docx' {
  function htmlToDocx(
    html: string,
    header?: string | null,
    options?: {
      table?: { row?: { cantSplit?: boolean } };
      footer?: boolean;
      pageNumber?: boolean;
    }
  ): Promise<ArrayBuffer>;

  export default htmlToDocx;
}
