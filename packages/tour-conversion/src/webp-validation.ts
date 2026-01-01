import { readFile } from 'fs/promises';

import sharp from 'sharp';

/**
 * WebP file header constants
 */
const RIFF_HEADER = Buffer.from('RIFF');
const WEBP_HEADER = Buffer.from('WEBP');
const VP8L_CHUNK = Buffer.from('VP8L'); // Lossless
const VP8_CHUNK = Buffer.from('VP8 ');  // Lossy

/**
 * WebP compression type
 */
export type WebPCompressionType = 'lossless' | 'lossy' | 'unknown';

/**
 * WebP validation result
 */
export interface WebPValidationResult {
  isValid: boolean;
  isWebP: boolean;
  compressionType: WebPCompressionType;
  isLossless: boolean;
  width?: number;
  height?: number;
  error?: string;
}

/**
 * Check if a buffer is a valid WebP file and determine if it's lossless
 */
export async function validateWebP(buffer: Buffer): Promise<WebPValidationResult> {
  try {
    // Check minimum size
    if (buffer.length < 16) {
      return {
        isValid: false,
        isWebP: false,
        compressionType: 'unknown',
        isLossless: false,
        error: 'Buffer too small to be a valid WebP',
      };
    }

    // Check RIFF header
    if (!buffer.subarray(0, 4).equals(RIFF_HEADER)) {
      return {
        isValid: false,
        isWebP: false,
        compressionType: 'unknown',
        isLossless: false,
        error: 'Missing RIFF header',
      };
    }

    // Check WEBP signature
    if (!buffer.subarray(8, 12).equals(WEBP_HEADER)) {
      return {
        isValid: false,
        isWebP: false,
        compressionType: 'unknown',
        isLossless: false,
        error: 'Missing WEBP signature',
      };
    }

    // Determine compression type by looking for VP8L (lossless) or VP8 (lossy) chunk
    let compressionType: WebPCompressionType = 'unknown';
    let offset = 12;

    while (offset < buffer.length - 8) {
      const chunkType = buffer.subarray(offset, offset + 4);

      if (chunkType.equals(VP8L_CHUNK)) {
        compressionType = 'lossless';
        break;
      } else if (chunkType.equals(VP8_CHUNK)) {
        compressionType = 'lossy';
        break;
      }

      // Move to next chunk (4 byte type + 4 byte size + chunk data)
      const chunkSize = buffer.readUInt32LE(offset + 4);
      offset += 8 + chunkSize + (chunkSize % 2); // Chunks are 2-byte aligned
    }

    // Use sharp to get metadata
    const metadata = await sharp(buffer).metadata();

    return {
      isValid: true,
      isWebP: true,
      compressionType,
      isLossless: compressionType === 'lossless',
      width: metadata.width,
      height: metadata.height,
    };
  } catch (err) {
    return {
      isValid: false,
      isWebP: false,
      compressionType: 'unknown',
      isLossless: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Validate a WebP file from path
 */
export async function validateWebPFile(filePath: string): Promise<WebPValidationResult> {
  try {
    const buffer = await readFile(filePath);
    return validateWebP(buffer);
  } catch (err) {
    return {
      isValid: false,
      isWebP: false,
      compressionType: 'unknown',
      isLossless: false,
      error: `Failed to read file: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * Enforce lossless WebP requirement
 * Throws an error if the WebP is not lossless
 */
export async function enforceLosslessWebP(buffer: Buffer): Promise<void> {
  const result = await validateWebP(buffer);

  if (!result.isValid) {
    throw new Error(`Invalid WebP file: ${result.error}`);
  }

  if (!result.isWebP) {
    throw new Error('File is not a WebP image');
  }

  if (!result.isLossless) {
    throw new Error(
      `WebP must be lossless. Detected compression type: ${result.compressionType}`
    );
  }
}

/**
 * Convert image to lossless WebP format
 */
export async function convertToLosslessWebP(
  input: Buffer,
  quality = 100
): Promise<Buffer> {
  return sharp(input)
    .webp({
      lossless: true,
      quality,
      effort: 6, // Higher effort for better compression
    })
    .toBuffer();
}
