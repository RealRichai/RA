/**
 * Upload Service Tests
 *
 * Tests for file upload, content-type detection, and size validation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectContentType,
  validateFileSize,
  validateMimeType,
} from '../upload-service';
import { SIZE_LIMITS, ALLOWED_MIME_TYPES } from '../types';

describe('Content Type Detection', () => {
  describe('Extension-based detection', () => {
    it('should detect PDF from extension', async () => {
      const result = await detectContentType('document.pdf');
      expect(result).toBe('application/pdf');
    });

    it('should detect DOCX from extension', async () => {
      const result = await detectContentType('document.docx');
      expect(result).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    });

    it('should detect JPEG from extension', async () => {
      const result = await detectContentType('photo.jpg');
      expect(result).toBe('image/jpeg');

      const result2 = await detectContentType('photo.jpeg');
      expect(result2).toBe('image/jpeg');
    });

    it('should detect PNG from extension', async () => {
      const result = await detectContentType('image.png');
      expect(result).toBe('image/png');
    });

    it('should detect CSV from extension', async () => {
      const result = await detectContentType('data.csv');
      expect(result).toBe('text/csv');
    });

    it('should return octet-stream for unknown extension', async () => {
      const result = await detectContentType('unknown.xyz');
      expect(result).toBe('application/octet-stream');
    });
  });

  describe('Magic bytes detection', () => {
    it('should detect PDF from magic bytes', async () => {
      const pdfBuffer = Buffer.from('%PDF-1.4', 'utf8');
      const result = await detectContentType('file.bin', pdfBuffer);
      expect(result).toBe('application/pdf');
    });

    it('should detect PNG from magic bytes', async () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const result = await detectContentType('file.bin', pngBuffer);
      expect(result).toBe('image/png');
    });

    it('should detect JPEG from magic bytes', async () => {
      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      const result = await detectContentType('file.bin', jpegBuffer);
      expect(result).toBe('image/jpeg');
    });

    it('should detect GIF from magic bytes', async () => {
      const gifBuffer = Buffer.from('GIF89a', 'utf8');
      const result = await detectContentType('file.bin', gifBuffer);
      expect(result).toBe('image/gif');
    });
  });
});

describe('File Size Validation', () => {
  it('should pass for files under max size', () => {
    const result = validateFileSize(1024 * 1024, 'application/pdf'); // 1MB
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should fail for files over max size', () => {
    const result = validateFileSize(SIZE_LIMITS.MAX_FILE_SIZE + 1, 'application/pdf');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('exceeds maximum');
  });

  it('should fail for images over max image size', () => {
    const result = validateFileSize(SIZE_LIMITS.MAX_IMAGE_SIZE + 1, 'image/jpeg');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Image size');
  });

  it('should pass for images under max image size', () => {
    const result = validateFileSize(SIZE_LIMITS.MAX_IMAGE_SIZE - 1, 'image/jpeg');
    expect(result.valid).toBe(true);
  });

  it('should fail for PDFs over max PDF size', () => {
    const result = validateFileSize(SIZE_LIMITS.MAX_PDF_SIZE + 1, 'application/pdf');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('PDF size');
  });

  it('should pass for PDFs under max PDF size', () => {
    const result = validateFileSize(SIZE_LIMITS.MAX_PDF_SIZE - 1, 'application/pdf');
    expect(result.valid).toBe(true);
  });
});

describe('MIME Type Validation', () => {
  it('should allow PDF files', () => {
    const result = validateMimeType('application/pdf');
    expect(result.valid).toBe(true);
  });

  it('should allow DOCX files', () => {
    const result = validateMimeType('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(result.valid).toBe(true);
  });

  it('should allow JPEG images', () => {
    const result = validateMimeType('image/jpeg');
    expect(result.valid).toBe(true);
  });

  it('should allow PNG images', () => {
    const result = validateMimeType('image/png');
    expect(result.valid).toBe(true);
  });

  it('should allow CSV files', () => {
    const result = validateMimeType('text/csv');
    expect(result.valid).toBe(true);
  });

  it('should reject executable files', () => {
    const result = validateMimeType('application/x-executable');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not allowed');
  });

  it('should reject JavaScript files', () => {
    const result = validateMimeType('application/javascript');
    expect(result.valid).toBe(false);
  });

  it('should reject HTML files', () => {
    const result = validateMimeType('text/html');
    expect(result.valid).toBe(false);
  });

  it('should reject unknown MIME types', () => {
    const result = validateMimeType('application/x-unknown');
    expect(result.valid).toBe(false);
  });
});

describe('Size Limits Constants', () => {
  it('should have MAX_FILE_SIZE of 100MB', () => {
    expect(SIZE_LIMITS.MAX_FILE_SIZE).toBe(100 * 1024 * 1024);
  });

  it('should have MAX_IMAGE_SIZE of 10MB', () => {
    expect(SIZE_LIMITS.MAX_IMAGE_SIZE).toBe(10 * 1024 * 1024);
  });

  it('should have MAX_PDF_SIZE of 50MB', () => {
    expect(SIZE_LIMITS.MAX_PDF_SIZE).toBe(50 * 1024 * 1024);
  });

  it('should have MAX_DOCUMENT_SIZE of 25MB', () => {
    expect(SIZE_LIMITS.MAX_DOCUMENT_SIZE).toBe(25 * 1024 * 1024);
  });
});

describe('Allowed MIME Types', () => {
  it('should include common document types', () => {
    expect(ALLOWED_MIME_TYPES).toContain('application/pdf');
    expect(ALLOWED_MIME_TYPES).toContain('application/msword');
    expect(ALLOWED_MIME_TYPES).toContain('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  });

  it('should include common image types', () => {
    expect(ALLOWED_MIME_TYPES).toContain('image/jpeg');
    expect(ALLOWED_MIME_TYPES).toContain('image/png');
    expect(ALLOWED_MIME_TYPES).toContain('image/gif');
    expect(ALLOWED_MIME_TYPES).toContain('image/webp');
  });

  it('should include spreadsheet types', () => {
    expect(ALLOWED_MIME_TYPES).toContain('application/vnd.ms-excel');
    expect(ALLOWED_MIME_TYPES).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });

  it('should include text types', () => {
    expect(ALLOWED_MIME_TYPES).toContain('text/plain');
    expect(ALLOWED_MIME_TYPES).toContain('text/csv');
  });
});
